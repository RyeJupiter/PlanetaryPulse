const ORNL_BASE = "https://modis.ornl.gov/rst/api/v1";

// ORNL DAAC caps each request at 10 composite dates, but composite boundaries
// don't always line up with calendar days so asking for 10*compositeDays can
// cross into an 11th composite. Use 8 for reliable headroom.
const ORNL_MAX_COMPOSITES = 8;

// MOD13Q1.061 = NDVI, 250m, 16-day composite
// MOD11A2.061 = LST,  1km,  8-day composite
const METRIC_CONFIG = {
  ndvi: {
    product: "MOD13Q1",
    dataBand: "250m_16_days_NDVI",
    qaBand: "250m_16_days_pixel_reliability",
    scale: 0.0001,
    fillValue: -3000,
    compositeDays: 16,
    // pixel_reliability: 0=Good, 1=Marginal, 2=Snow/Ice, 3=Cloudy
    isGoodQa: (qa) => qa === 0 || qa === 1,
  },
  lst: {
    product: "MOD11A2",
    dataBand: "LST_Day_1km",
    qaBand: "QC_Day",
    scale: 0.02, // raw * 0.02 = Kelvin; subtract 273.15 for Celsius
    fillValue: 0,
    compositeDays: 8,
    // QC_Day bits 0-1: 00=good, 01=other quality, 10/11=not produced
    isGoodQa: (qa) => (qa & 0b11) <= 1,
  },
};

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const startMonth = String(body.startMonth || "2020-01");
    const endMonth = String(body.endMonth || startMonth);
    const requestedMetrics = Array.isArray(body.metrics) ? body.metrics : ["ndvi", "lst"];
    const metrics = requestedMetrics.filter((m) => m === "ndvi" || m === "lst");

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      return json({ error: "Invalid latitude/longitude." }, 400);
    }
    if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) {
      return json({ error: "startMonth and endMonth must be YYYY-MM." }, 400);
    }
    if (monthIndex(startMonth) > monthIndex(endMonth)) {
      return json({ error: "startMonth must be <= endMonth." }, 400);
    }
    if (!metrics.length) {
      return json({ error: "At least one metric is required." }, 400);
    }

    const startDate = monthToOrnlDate(startMonth, "start");
    const endDate = monthToOrnlDate(endMonth, "end");

    // Cloudflare Workers caps at 50 subrequests per invocation on the free
    // plan. Each metric fetches data + QA bands separately, and each band
    // must be chunked to stay under ORNL's 10-composite limit. Estimate
    // before firing so we can refuse with a clear message instead of a
    // silent "subrequest limit exceeded" 500.
    const subrequestBudget = estimateSubrequests(metrics, startDate, endDate);
    if (subrequestBudget > 45) {
      return json(
        {
          error: `Requested range is too wide — needs ~${subrequestBudget} upstream calls, over the ${45}-per-request budget. Please narrow to ~3 years or fewer.`,
          code: "range_too_wide",
          subrequests: subrequestBudget,
        },
        413
      );
    }

    // Fetch both products in parallel — no auth needed
    const metricData = await Promise.all(
      metrics.map((metric) => fetchMetric(lat, lon, startDate, endDate, metric))
    );

    const series = buildMonthlySeries(metricData, startMonth, endMonth);

    return json({ source: "ornl_daac", provider: "modis", metrics, series });
  } catch (error) {
    console.error("[ORNL DAAC] request failed:", error);
    return json({ error: error.message || "Unexpected server error." }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: true, route: "modis monthly adapter (ORNL DAAC)" });
}

// ── ORNL DAAC fetch ──────────────────────────────────────────────────────────

async function fetchMetric(lat, lon, startDate, endDate, metric) {
  const config = METRIC_CONFIG[metric];

  // ORNL DAAC requires one band per request, so fetch data + QA separately and merge.
  const [dataSubset, qaSubset] = await Promise.all([
    fetchBandChunked(config, config.dataBand, lat, lon, startDate, endDate),
    fetchBandChunked(config, config.qaBand, lat, lon, startDate, endDate),
  ]);

  return { metric, config, payload: { subset: [...dataSubset, ...qaSubset] } };
}

async function fetchBandChunked(config, band, lat, lon, startDate, endDate) {
  // ORNL DAAC rejects more than 10 concurrent requests per host. Fetch the
  // chunks for a single band sequentially — the data+QA bands and the two
  // metrics already run in parallel at the caller, so we still get 4
  // concurrent streams which keeps us under the 10-per-host limit with
  // headroom for retries.
  //
  // Individual chunk failures are treated as empty rather than fatal so a
  // range ending in the current week (where the latest composite hasn't
  // been published yet) still returns all the months that DO exist.
  const chunks = chunkOrnlDateRange(startDate, endDate, config.compositeDays);
  const merged = [];
  for (const [chunkStart, chunkEnd] of chunks) {
    try {
      const payload = await fetchBand(config.product, band, lat, lon, chunkStart, chunkEnd);
      if (Array.isArray(payload?.subset)) merged.push(...payload.subset);
    } catch (err) {
      if (isEmptyRangeError(err)) {
        // Gracefully skip: ORNL has no composite for this window yet.
        continue;
      }
      throw err;
    }
  }
  return merged;
}

function isEmptyRangeError(err) {
  const msg = String(err?.message || "");
  return /no data available/i.test(msg);
}

async function fetchBand(product, band, lat, lon, startDate, endDate) {
  const url =
    `${ORNL_BASE}/${product}/subset` +
    `?latitude=${lat}&longitude=${lon}` +
    `&startDate=${startDate}&endDate=${endDate}` +
    `&kmAboveBelow=0&kmLeftRight=0` +
    `&band=${encodeURIComponent(band)}`;

  // 12-second per-request timeout so a single slow ORNL call can't stall the
  // whole monthly series — we'd rather surface a partial failure to the user.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error(`ORNL DAAC ${product} ${band} request timed out after 12s`);
    }
    throw err;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`ORNL DAAC ${product} ${band} request failed (${res.status}): ${msg}`);
  }
  return res.json();
}

function chunkOrnlDateRange(startDate, endDate, compositeDays) {
  const maxSpanDays = ORNL_MAX_COMPOSITES * compositeDays;
  const startEpoch = ornlDateToEpochDays(startDate);
  const endEpoch = ornlDateToEpochDays(endDate);
  const chunks = [];
  let cursor = startEpoch;
  while (cursor <= endEpoch) {
    const chunkEnd = Math.min(cursor + maxSpanDays - 1, endEpoch);
    chunks.push([epochDaysToOrnlDate(cursor), epochDaysToOrnlDate(chunkEnd)]);
    cursor = chunkEnd + 1;
  }
  return chunks;
}

function estimateSubrequests(metrics, startDate, endDate) {
  const startEpoch = ornlDateToEpochDays(startDate);
  const endEpoch = ornlDateToEpochDays(endDate);
  const days = Math.max(endEpoch - startEpoch + 1, 1);
  let total = 0;
  for (const m of metrics) {
    const cfg = METRIC_CONFIG[m];
    if (!cfg) continue;
    const chunkSpanDays = ORNL_MAX_COMPOSITES * cfg.compositeDays;
    const chunks = Math.ceil(days / chunkSpanDays);
    total += chunks * 2; // data + QA per chunk
  }
  return total;
}

function ornlDateToEpochDays(ornlDate) {
  const match = ornlDate.match(/^A(\d{4})(\d{3})$/);
  if (!match) throw new Error(`Invalid ORNL date: ${ornlDate}`);
  const year = Number(match[1]);
  const doy = Number(match[2]);
  return Math.floor(Date.UTC(year, 0, doy) / 86400000);
}

function epochDaysToOrnlDate(epochDays) {
  const d = new Date(epochDays * 86400000);
  const year = d.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const doy = Math.floor((d.getTime() - start) / 86400000) + 1;
  return `A${year}${String(doy).padStart(3, "0")}`;
}

// ── Monthly aggregation ──────────────────────────────────────────────────────

function buildMonthlySeries(metricData, startMonth, endMonth) {
  const months = monthRange(startMonth, endMonth);

  // Per-month value buckets and QA totals per metric
  const buckets = Object.fromEntries(months.map((m) => [m, {}]));
  const totals = Object.fromEntries(months.map((m) => [m, {}]));

  for (const { metric, config, payload } of metricData) {
    const subset = Array.isArray(payload?.subset) ? payload.subset : [];

    // Group subset rows by composite date — each date has one data entry + one qa entry
    const byDate = new Map();
    for (const entry of subset) {
      const date = entry.modis_date || entry.calendar_date || "";
      if (!byDate.has(date)) byDate.set(date, {});
      byDate.get(date)[entry.band] = entry.data?.[0] ?? null;
    }

    for (const [date, bands] of byDate) {
      const month = ornlDateToMonth(date);
      if (!month || !buckets[month]) continue;

      if (!totals[month][metric]) totals[month][metric] = { total: 0, accepted: 0 };
      totals[month][metric].total += 1;

      const rawData = bands[config.dataBand];
      const rawQa = bands[config.qaBand];
      if (rawData == null || rawQa == null) continue;

      const qaValue = Number(rawQa);
      if (!config.isGoodQa(qaValue)) continue;

      const dataValue = Number(rawData);
      if (!Number.isFinite(dataValue) || dataValue === config.fillValue) continue;

      let value = dataValue * config.scale;
      if (metric === "lst") value -= 273.15; // Kelvin → Celsius

      if (!buckets[month][metric]) buckets[month][metric] = [];
      buckets[month][metric].push(value);
      totals[month][metric].accepted += 1;
    }
  }

  return months.map((month) => {
    const entry = { month, count: 0, qaScore: null };
    const qaRatios = [];

    for (const { metric } of metricData) {
      const values = buckets[month][metric] || [];
      const t = totals[month][metric] || { total: 0, accepted: 0 };
      if (values.length) {
        entry[metric] = median(values);
        entry.count = Math.max(entry.count, values.length);
      }
      if (t.total > 0) qaRatios.push(t.accepted / t.total);
    }

    if (qaRatios.length) {
      entry.qaScore = Number(
        (qaRatios.reduce((a, b) => a + b, 0) / qaRatios.length).toFixed(3)
      );
    }
    return entry;
  });
}

// ── Date utilities ───────────────────────────────────────────────────────────

function monthToOrnlDate(month, edge) {
  const [year, monthNum] = month.split("-").map(Number);
  const day = edge === "start" ? 1 : new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const doy = dayOfYear(year, monthNum, day);
  return `A${year}${String(doy).padStart(3, "0")}`;
}

function dayOfYear(year, month, day) {
  const start = new Date(Date.UTC(year, 0, 1));
  const date = new Date(Date.UTC(year, month - 1, day));
  return Math.floor((date - start) / 86400000) + 1;
}

function ornlDateToMonth(date) {
  // "A2020017" (Julian) or "2020-01-17" (calendar date)
  if (!date) return "";
  const julian = date.match(/^A(\d{4})(\d{3})$/);
  if (julian) {
    const d = new Date(Date.UTC(Number(julian[1]), 0, Number(julian[2])));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const cal = date.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (cal) return `${cal[1]}-${cal[2]}`;
  return "";
}

function monthRange(startMonth, endMonth) {
  const start = monthIndex(startMonth);
  const end = monthIndex(endMonth);
  const out = [];
  for (let i = start; i <= end; i += 1) out.push(indexToMonth(i));
  return out;
}

function monthIndex(month) {
  const [year, m] = month.split("-").map(Number);
  return year * 12 + (m - 1);
}

function indexToMonth(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Number(
    (sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]).toFixed(6)
  );
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

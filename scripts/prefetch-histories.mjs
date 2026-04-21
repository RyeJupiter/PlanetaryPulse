#!/usr/bin/env node
// prefetch-histories.mjs
//
// For each entry in assets/data/projects.geojson that has a history_start,
// pull a full monthly NDVI + LST series from NASA ORNL DAAC and write it as
// a static JSON file under public/data/histories/{id}.json. The Explore page
// reads these files via ?project=<id> so registry projects load instantly
// with a decade+ of satellite history, no live API calls required.
//
// Usage: node scripts/prefetch-histories.mjs [projectId ...]
//        (no args = every project)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REGISTRY = resolve(ROOT, "assets/data/projects.geojson");
const OUT_DIR = resolve(ROOT, "public/data/histories");

const ORNL_BASE = "https://modis.ornl.gov/rst/api/v1";
const ORNL_MAX_COMPOSITES = 8;

const METRIC_CONFIG = {
  ndvi: {
    product: "MOD13Q1",
    dataBand: "250m_16_days_NDVI",
    qaBand: "250m_16_days_pixel_reliability",
    scale: 0.0001,
    fillValue: -3000,
    compositeDays: 16,
    isGoodQa: (qa) => qa === 0 || qa === 1,
  },
  lst: {
    product: "MOD11A2",
    dataBand: "LST_Day_1km",
    qaBand: "QC_Day",
    scale: 0.02,
    fillValue: 0,
    compositeDays: 8,
    isGoodQa: (qa) => (qa & 0b11) <= 1,
  },
};

// ── ORNL fetch, chunked + paced ──────────────────────────────────────────

async function fetchBand(product, band, lat, lon, startDate, endDate) {
  const url =
    `${ORNL_BASE}/${product}/subset` +
    `?latitude=${lat}&longitude=${lon}` +
    `&startDate=${startDate}&endDate=${endDate}` +
    `&kmAboveBelow=0&kmLeftRight=0` +
    `&band=${encodeURIComponent(band)}`;

  // We're offline — take all the retries we need. Budget 15s per call.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 400) {
        const text = await res.text().catch(() => "");
        if (/no data available/i.test(text)) {
          return { subset: [] };
        }
        throw new Error(`${product} ${band} 400: ${text}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        // 429 / 5xx → back off and retry
        if (res.status === 429 || res.status >= 500) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        throw new Error(`${product} ${band} ${res.status}: ${text}`);
      }
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError" || /fetch failed/i.test(String(err))) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${product} ${band}: exhausted retries`);
}

async function fetchBandChunked(config, band, lat, lon, startMonth, endMonth) {
  const startDate = monthToOrnlDate(startMonth, "start");
  const endDate = monthToOrnlDate(endMonth, "end");
  const chunks = chunkOrnlDateRange(startDate, endDate, config.compositeDays);
  const merged = [];
  for (const [chunkStart, chunkEnd] of chunks) {
    try {
      const payload = await fetchBand(config.product, band, lat, lon, chunkStart, chunkEnd);
      if (Array.isArray(payload?.subset)) merged.push(...payload.subset);
    } catch (err) {
      if (/no data available/i.test(String(err?.message))) continue;
      throw err;
    }
    // Sequential within a band keeps us far under ORNL's 10-concurrent cap
    // (we have 4 bands running in parallel max = data+qa × ndvi+lst); a small
    // inter-call delay just keeps us from looking like a bot.
    await sleep(150);
  }
  return merged;
}

async function fetchMetric(metric, lat, lon, startMonth, endMonth) {
  const config = METRIC_CONFIG[metric];
  console.log(`    ${metric.toUpperCase()} (data + qa in parallel)…`);
  const [dataSubset, qaSubset] = await Promise.all([
    fetchBandChunked(config, config.dataBand, lat, lon, startMonth, endMonth),
    fetchBandChunked(config, config.qaBand, lat, lon, startMonth, endMonth),
  ]);
  return { metric, config, subset: [...dataSubset, ...qaSubset] };
}

// ── Aggregation to monthly ──────────────────────────────────────────────

function buildMonthlySeries(metricData, startMonth, endMonth) {
  const months = monthRange(startMonth, endMonth);
  const buckets = Object.fromEntries(months.map((m) => [m, {}]));
  const totals = Object.fromEntries(months.map((m) => [m, {}]));

  for (const { metric, config, subset } of metricData) {
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
      if (metric === "lst") value -= 273.15;

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
        entry[metric] = Number(median(values).toFixed(4));
        entry.count = Math.max(entry.count, values.length);
      }
      if (t.total > 0) qaRatios.push(t.accepted / t.total);
    }
    if (qaRatios.length) {
      entry.qaScore = Number((qaRatios.reduce((a, b) => a + b, 0) / qaRatios.length).toFixed(3));
    }
    return entry;
  });
}

// ── Date + chunk helpers (mirror functions/api/explore/monthly.js) ───────

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

function monthToOrnlDate(month, edge) {
  const [year, monthNum] = month.split("-").map(Number);
  const day = edge === "start" ? 1 : new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const start = Date.UTC(year, 0, 1);
  const target = Date.UTC(year, monthNum - 1, day);
  const doy = Math.floor((target - start) / 86400000) + 1;
  return `A${year}${String(doy).padStart(3, "0")}`;
}

function ornlDateToMonth(date) {
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
  const [startY, startM] = startMonth.split("-").map(Number);
  const [endY, endM] = endMonth.split("-").map(Number);
  const start = startY * 12 + (startM - 1);
  const end = endY * 12 + (endM - 1);
  const out = [];
  for (let i = start; i <= end; i += 1) {
    const year = Math.floor(i / 12);
    const month = (i % 12) + 1;
    out.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return out;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Project coord extraction ─────────────────────────────────────────────

function centroid(feature) {
  const g = feature.geometry;
  if (g.type === "Point") return { lat: g.coordinates[1], lon: g.coordinates[0] };
  if (g.type === "Polygon") {
    const ring = g.coordinates[0];
    let lat = 0;
    let lon = 0;
    ring.forEach(([ln, lt]) => {
      lon += ln;
      lat += lt;
    });
    return { lat: lat / ring.length, lon: lon / ring.length };
  }
  throw new Error(`Unsupported geometry ${g.type}`);
}

// ── Main ────────────────────────────────────────────────────────────────

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const filter = new Set(process.argv.slice(2));
  const registry = JSON.parse(await readFile(REGISTRY, "utf-8"));
  await mkdir(OUT_DIR, { recursive: true });

  const endMonth = currentMonth();

  for (const feature of registry.features) {
    const p = feature.properties;
    if (!p.history_start) continue;
    if (filter.size > 0 && !filter.has(p.id)) continue;

    const { lat, lon } = centroid(feature);
    const startMonth = p.history_start;
    console.log(
      `\n→ ${p.id} ${p.name} @ ${lat.toFixed(3)},${lon.toFixed(3)} (${startMonth} → ${endMonth})`
    );

    const t0 = Date.now();
    const metricData = [];
    for (const metric of ["ndvi", "lst"]) {
      metricData.push(await fetchMetric(metric, lat, lon, startMonth, endMonth));
    }
    const series = buildMonthlySeries(metricData, startMonth, endMonth);

    const out = {
      projectId: p.id,
      projectName: p.name,
      lat,
      lon,
      startMonth,
      endMonth,
      interventionStart: p.intervention_start || null,
      historyNote: p.history_note || null,
      source: "ornl_daac",
      provider: "modis",
      metrics: ["ndvi", "lst"],
      generatedAt: new Date().toISOString(),
      series,
    };

    const outPath = resolve(OUT_DIR, `${p.id}.json`);
    await writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf-8");

    const ndviMonths = series.filter((r) => typeof r.ndvi === "number").length;
    const lstMonths = series.filter((r) => typeof r.lst === "number").length;
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `  wrote ${outPath}  (${series.length} months, ${ndviMonths} ndvi, ${lstMonths} lst, ${seconds}s)`
    );
  }
  console.log("\n✓ done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

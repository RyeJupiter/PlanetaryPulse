const APPEEARS_BASE = "https://appeears.earthdatacloud.nasa.gov/api";

const PROVIDER_CONFIG = {
  modis: {
    ndvi: {
      product: "MOD13Q1.061",
      preferredLayers: ["_250m_16_days_NDVI", "250m 16 days NDVI", "NDVI"],
      layerRegex: [/ndvi$/i],
    },
    lst: {
      product: "MOD11A2.061",
      preferredLayers: ["LST_Day_1km", "LST Day 1km"],
      layerRegex: [/^LST_Day_1km$/i, /lst_day_1km/i],
    },
  },
  viirs: {
    ndvi: {
      product: "VNP13A1.002",
      preferredLayers: ["_500m_16_days_NDVI", "500m 16 days NDVI", "NDVI"],
      layerRegex: [/ndvi$/i],
    },
    lst: {
      product: "VNP21A2.002",
      preferredLayers: ["LST_Day_1KM", "LST_Day_1km", "LST Day 1km"],
      layerRegex: [/lst_day_1km/i, /lst_day_1km/i, /lst_day/i],
    },
  },
};

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const providerId = String(body.provider || "modis").toLowerCase();
    const providerConfig = PROVIDER_CONFIG[providerId] || PROVIDER_CONFIG.modis;

    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const startMonth = String(body.startMonth || "2020-01");
    const endMonth = String(body.endMonth || startMonth);
    const requestedMetrics = Array.isArray(body.metrics) ? body.metrics : ["ndvi", "lst"];
    const metrics = requestedMetrics.filter((metric) => metric === "ndvi" || metric === "lst");

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      return json({ error: "Invalid latitude/longitude." }, 400);
    }

    if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) {
      return json({ error: "startMonth and endMonth must be YYYY-MM." }, 400);
    }

    if (!metrics.length) {
      return json({ error: "At least one metric is required." }, 400);
    }

    const username = context.env.APPEEARS_USERNAME;
    const password = context.env.APPEEARS_PASSWORD;

    if (!username || !password) {
      return json(
        {
          error: "AppEEARS credentials are not configured.",
          code: "missing_credentials",
        },
        501
      );
    }

    const token = await loginAppeears(username, password);

    const metricDefs = await Promise.all(
      metrics.map((metric) => buildMetricDefinition({ token, metric, config: providerConfig[metric] }))
    );

    const layers = dedupeLayers(
      metricDefs.flatMap((def) => [
        { product: def.product, layer: def.dataLayer },
        { product: def.product, layer: def.qaLayer },
      ])
    );

    const dates = monthRange(startMonth, endMonth);
    const taskBody = {
      task_type: "point",
      task_name: `earthpulse-${providerId}-${Date.now()}`,
      params: {
        dates: [
          {
            startDate: monthToDate(startMonth, "start"),
            endDate: monthToDate(endMonth, "end"),
          },
        ],
        layers,
        coordinates: [
          {
            id: "explore-point-1",
            latitude: lat,
            longitude: lon,
          },
        ],
      },
    };

    const taskRes = await appeearsRequest("/task", { method: "POST", token, body: taskBody });
    const taskId = taskRes.task_id;
    if (!taskId) {
      return json({ error: "Failed to create AppEEARS task." }, 502);
    }

    await waitForTaskDone(token, taskId);

    const bundle = await appeearsRequest(`/bundle/${taskId}`, { token });
    const csvFile = selectCsvFile(bundle);
    if (!csvFile) {
      return json({ error: "AppEEARS task completed but no CSV file found.", taskId }, 502);
    }

    const csvText = await appeearsRequest(`/bundle/${taskId}/${csvFile.file_id}`, { token, rawText: true });
    const rows = parseCsv(csvText);

    const series = aggregateMonthly({
      rows,
      startMonth,
      endMonth,
      metricDefs,
    });

    return json({
      source: "appeears",
      provider: providerId,
      metrics,
      taskId,
      series,
    });
  } catch (error) {
    return json({ error: error.message || "Unexpected server error." }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: true, route: "appeears monthly adapter" });
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

async function loginAppeears(username, password) {
  const credentials = btoa(`${username}:${password}`);
  const response = await fetch(`${APPEEARS_BASE}/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) {
    throw new Error(payload.message || "AppEEARS login failed.");
  }
  return payload.token;
}

async function appeearsRequest(path, options = {}) {
  const response = await fetch(`${APPEEARS_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AppEEARS request failed (${response.status}): ${message}`);
  }

  if (options.rawText) {
    return response.text();
  }

  return response.json();
}

async function waitForTaskDone(token, taskId) {
  const maxAttempts = 45;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const statusPayload = await appeearsRequest(`/status/${taskId}`, { token });
    const status = extractTaskStatus(statusPayload);

    if (status === "done") return;
    if (status === "error" || status === "failed") {
      throw new Error(`AppEEARS task ${taskId} failed.`);
    }

    await delay(6000);
  }

  throw new Error(`AppEEARS task ${taskId} timed out.`);
}

function extractTaskStatus(payload) {
  if (!payload) return "pending";
  if (Array.isArray(payload)) {
    return String(payload[0]?.status || payload[0]?.state || "pending").toLowerCase();
  }
  return String(payload.status || payload.state || "pending").toLowerCase();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildMetricDefinition({ token, metric, config }) {
  if (!config) {
    throw new Error(`No provider config found for metric ${metric}.`);
  }

  const productLayers = await appeearsRequest(`/product/${config.product}`, { token });
  const layersMap = toLayerMap(productLayers);

  const dataLayer = resolveDataLayer(layersMap, config.preferredLayers, config.layerRegex);
  if (!dataLayer) {
    throw new Error(`Could not resolve data layer for ${config.product} (${metric}).`);
  }

  const dataMeta = layersMap[dataLayer] || {};
  const qaLayer = resolveQaLayer(dataMeta, layersMap);
  if (!qaLayer) {
    throw new Error(`Could not resolve QA layer for ${config.product} (${metric}).`);
  }

  const qualityDefs = await appeearsRequest(`/quality/${config.product}/${qaLayer}`, { token }).catch(() => []);
  const acceptableQa = new Set(
    (Array.isArray(qualityDefs) ? qualityDefs : [])
      .filter((entry) => Boolean(entry?.Acceptable))
      .map((entry) => Number(entry?.Value))
      .filter((n) => Number.isFinite(n))
  );

  const scale = Number(dataMeta.ScaleFactor);
  const offset = Number(dataMeta.AddOffset);

  return {
    metric,
    product: config.product,
    dataLayer,
    qaLayer,
    acceptableQa,
    scale: Number.isFinite(scale) && scale !== 0 ? scale : 1,
    offset: Number.isFinite(offset) ? offset : 0,
    fillValue: Number(dataMeta.FillValue),
  };
}

function toLayerMap(productLayers) {
  if (Array.isArray(productLayers)) {
    const mapped = {};
    productLayers.forEach((layer) => {
      if (layer?.Layer) mapped[layer.Layer] = layer;
    });
    return mapped;
  }
  if (productLayers && typeof productLayers === "object") {
    return productLayers;
  }
  return {};
}

function resolveDataLayer(layersMap, preferredLayers, layerRegex) {
  const names = Object.keys(layersMap);
  for (const preferred of preferredLayers || []) {
    if (names.includes(preferred)) return preferred;
    const insensitive = names.find((name) => name.toLowerCase() === String(preferred).toLowerCase());
    if (insensitive) return insensitive;
  }
  for (const regex of layerRegex || []) {
    const match = names.find((name) => regex.test(name));
    if (match) return match;
  }
  return "";
}

function resolveQaLayer(dataMeta, layersMap) {
  const qaCandidates = parseQualityLayers(dataMeta.QualityLayers);
  for (const qa of qaCandidates) {
    if (layersMap[qa]) return qa;
    const alt = Object.keys(layersMap).find((name) => name.toLowerCase() === qa.toLowerCase());
    if (alt) return alt;
  }

  const names = Object.keys(layersMap);
  const qaByFlag = names.find((name) => Boolean(layersMap[name]?.IsQA));
  if (qaByFlag) return qaByFlag;

  return names.find((name) => /quality|\bqc\b/i.test(name)) || "";
}

function parseQualityLayers(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  const raw = String(value).trim();
  if (!raw) return [];

  if (raw.startsWith("[")) {
    try {
      const normalized = raw.replace(/'/g, '"');
      const arr = JSON.parse(normalized);
      if (Array.isArray(arr)) {
        return arr.map(String).map((s) => s.trim()).filter(Boolean);
      }
    } catch (error) {
      // Fall through.
    }
  }

  return raw
    .replace(/[\[\]"]/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupeLayers(layers) {
  const seen = new Set();
  const deduped = [];
  layers.forEach((entry) => {
    const key = `${entry.product}:${entry.layer}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(entry);
    }
  });
  return deduped;
}

function monthToDate(month, edge) {
  const [year, monthNum] = month.split("-").map(Number);
  if (edge === "start") {
    return `${String(monthNum).padStart(2, "0")}-01-${year}`;
  }
  const last = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  return `${String(monthNum).padStart(2, "0")}-${String(last).padStart(2, "0")}-${year}`;
}

function monthRange(startMonth, endMonth) {
  const start = monthIndex(startMonth);
  const end = monthIndex(endMonth);
  const out = [];
  for (let i = start; i <= end; i += 1) {
    out.push(indexToMonth(i));
  }
  return out;
}

function monthIndex(month) {
  const [year, monthNum] = month.split("-").map(Number);
  return year * 12 + (monthNum - 1);
}

function indexToMonth(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function selectCsvFile(bundlePayload) {
  const files = Array.isArray(bundlePayload?.files) ? bundlePayload.files : [];
  return (
    files.find((f) => /\.csv$/i.test(f.file_name || "") && /sample|result/i.test(f.file_name || "")) ||
    files.find((f) => /\.csv$/i.test(f.file_name || "")) ||
    null
  );
}

function parseCsv(csvText) {
  const lines = String(csvText || "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cells[idx] || "";
    });
    return row;
  });
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function aggregateMonthly({ rows, startMonth, endMonth, metricDefs }) {
  const months = monthRange(startMonth, endMonth);
  const monthly = new Map(months.map((month) => [month, { month, count: 0, qaScore: null }]));

  const perMetricValues = {};
  const perMetricTotals = {};
  const perMetricAccepted = {};
  metricDefs.forEach((def) => {
    perMetricValues[def.metric] = new Map(months.map((month) => [month, []]));
    perMetricTotals[def.metric] = new Map(months.map((month) => [month, 0]));
    perMetricAccepted[def.metric] = new Map(months.map((month) => [month, 0]));
  });

  rows.forEach((row) => {
    const month = extractMonth(row);
    if (!month || !monthly.has(month)) return;

    metricDefs.forEach((def) => {
      const dataRaw = getColumn(row, def.dataLayer);
      const qaRaw = getColumn(row, def.qaLayer);
      if (dataRaw == null || qaRaw == null) return;

      const totalMap = perMetricTotals[def.metric];
      totalMap.set(month, (totalMap.get(month) || 0) + 1);

      const qaValue = Number(qaRaw);
      const qaPass = !def.acceptableQa.size || def.acceptableQa.has(qaValue);
      if (!qaPass) return;

      let value = Number(dataRaw);
      if (!Number.isFinite(value)) return;
      if (Number.isFinite(def.fillValue) && value === def.fillValue) return;

      value = value * def.scale + def.offset;
      const acceptedMap = perMetricAccepted[def.metric];
      acceptedMap.set(month, (acceptedMap.get(month) || 0) + 1);
      perMetricValues[def.metric].get(month).push(value);
    });
  });

  months.forEach((month) => {
    const item = monthly.get(month);
    let combinedQa = [];
    let combinedCount = 0;

    metricDefs.forEach((def) => {
      const values = perMetricValues[def.metric].get(month) || [];
      const total = perMetricTotals[def.metric].get(month) || 0;
      const accepted = perMetricAccepted[def.metric].get(month) || 0;

      if (values.length) {
        item[def.metric] = median(values);
        combinedCount = Math.max(combinedCount, values.length);
      }

      if (total > 0) {
        combinedQa.push(accepted / total);
      }
    });

    item.count = combinedCount;
    if (combinedQa.length) {
      item.qaScore = Number((combinedQa.reduce((a, b) => a + b, 0) / combinedQa.length).toFixed(3));
    }
  });

  return months.map((month) => monthly.get(month));
}

function extractMonth(row) {
  const dateKey = Object.keys(row).find((key) => /date/i.test(key));
  if (!dateKey) return "";
  const raw = String(row[dateKey] || "").trim();
  if (!raw) return "";

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1]}`;
  }

  return "";
}

function getColumn(row, target) {
  if (target in row) return row[target];
  const key = Object.keys(row).find((name) => name.toLowerCase() === String(target).toLowerCase());
  return key ? row[key] : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(6));
  }
  return Number(sorted[mid].toFixed(6));
}

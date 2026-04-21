/* global document, maplibregl, deck */

(function initExploreApp() {
  const root = document.getElementById("explorer-app");
  if (!root) return;

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  // Default to a ~13-month window so the initial request finishes in a few
  // seconds even on slow mobile networks. Wider ranges are still selectable
  // from the controls, and the user sees a warning if they cross the budget.
  const defaultStart = (() => {
    const d = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const MIN_MONTH = "2015-01";

  const state = {
    provider: "modis",
    lat: 36.9529,
    lon: -122.0253,
    startMonth: defaultStart,
    endMonth: currentMonth,
    metrics: new Set(["ndvi", "lst"]),
    series: [],
    loading: false,
    hasLoaded: false,
    source: "",
    warning: "",
    banner: "",
    bannerLevel: "info",
  };

  let map;
  let deckOverlay;
  let pulsePhase = 0;
  let pulseRaf = 0;

  const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

  function monthToIndex(month) {
    const [year, m] = month.split("-").map(Number);
    return year * 12 + (m - 1);
  }

  function indexToMonth(index) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function monthRange(start, end) {
    const startIdx = monthToIndex(start);
    const endIdx = monthToIndex(end);
    const months = [];
    for (let i = startIdx; i <= endIdx; i += 1) {
      months.push(indexToMonth(i));
    }
    return months;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // Adapter registry: each provider must implement getMonthlySeries(...)
  const providers = {
    modis: {
      id: "modis",
      label: "MODIS",
      getMonthlySeries({ lat, lon, startMonth, endMonth, metrics }) {
        return fetch("/api/explore/monthly", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: "modis", lat, lon, startMonth, endMonth, metrics: Array.from(metrics) }),
        }).then(async (res) => {
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err = new Error(payload.error || "Backend request failed.");
            err.status = res.status;
            err.code = payload.code || "backend_error";
            throw err;
          }
          return payload;
        });
      },
    },
  };

  const METRIC_META = {
    ndvi: {
      eyebrow: "Vegetation Productivity",
      title: "NDVI",
      unit: "",
      format: (v) => v.toFixed(3),
      formatAxis: (v) => v.toFixed(2),
      deltaFormat: (absDelta, baseline) => {
        if (!Number.isFinite(baseline) || Math.abs(baseline) < 1e-6) {
          return `${absDelta >= 0 ? "+" : ""}${absDelta.toFixed(3)}`;
        }
        const pct = (absDelta / Math.abs(baseline)) * 100;
        return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      },
      stroke: "#a6ecaa",
      fillTop: "rgba(166, 236, 170, 0.36)",
      fillBot: "rgba(166, 236, 170, 0)",
      source: "MOD13Q1 · 250m · 16-day",
      yFloor: 0,
      yCeil: 1,
    },
    lst: {
      eyebrow: "Thermal Regime",
      title: "Land Surface Temperature",
      unit: "°C",
      format: (v) => `${v.toFixed(1)}°C`,
      formatAxis: (v) => `${v.toFixed(0)}°`,
      deltaFormat: (absDelta) => `${absDelta >= 0 ? "+" : ""}${absDelta.toFixed(1)}°C`,
      stroke: "#dcaa70",
      fillTop: "rgba(220, 170, 112, 0.36)",
      fillBot: "rgba(220, 170, 112, 0)",
      source: "MOD11A2 · 1km · 8-day",
      yFloor: -20,
      yCeil: 55,
    },
  };

  function computeStats(series, key) {
    const pairs = series
      .map((d, idx) => ({ idx, month: d.month, value: d[key] }))
      .filter((d) => typeof d.value === "number");
    if (!pairs.length) return null;

    const values = pairs.map((d) => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const latest = pairs[pairs.length - 1];

    // Baseline = mean of the first third of the series (fallback to overall mean if tiny).
    const baselineWindow = Math.max(3, Math.ceil(pairs.length / 3));
    const baselinePairs = pairs.slice(0, Math.min(baselineWindow, pairs.length));
    const baseline =
      baselinePairs.length >= 3
        ? baselinePairs.reduce((a, b) => a + b.value, 0) / baselinePairs.length
        : mean;

    const coverage = pairs.length / Math.max(series.length, 1);
    const delta = latest.value - baseline;

    return {
      pairs,
      mean,
      min,
      max,
      latest,
      baseline,
      delta,
      coverage,
    };
  }

  function renderChartCard(key) {
    const meta = METRIC_META[key];
    const stats = computeStats(state.series, key);
    const selected = state.metrics.has(key);
    const coverageLabel = `${state.provider.toUpperCase()} · ${state.lat.toFixed(2)}, ${state.lon.toFixed(2)}`;
    const rangeLabel = state.series.length
      ? `${state.series[0].month} → ${state.series[state.series.length - 1].month}`
      : "Awaiting data";

    if (!selected) {
      return `
        <section class="metricCard metricDisabled" data-metric="${key}">
          <div class="metricHeader">
            <div>
              <div class="metricEyebrow">${meta.eyebrow}</div>
              <h3 class="metricTitle">${meta.title}</h3>
            </div>
            <div class="metricBadge">${meta.source}</div>
          </div>
          <div class="metricEmpty">Enable ${meta.title} in the controls to include this signal.</div>
        </section>
      `;
    }

    if (!stats) {
      const emptyBody = state.loading
        ? `<div class="metricLoading">
             <div class="metricSpinner" aria-hidden="true"></div>
             <div>Fetching ${meta.title} from NASA ORNL DAAC…</div>
             <div class="metricLoadingHint">This can take 10–20 seconds on the first load.</div>
           </div>`
        : `<div class="metricEmpty">
             ${state.series.length
               ? `No QA-cleared ${meta.title} values for this location yet. Try widening the date range.`
               : "Press Load monthly series to see signal."}
           </div>`;
      return `
        <section class="metricCard" data-metric="${key}">
          <div class="metricHeader">
            <div>
              <div class="metricEyebrow">${meta.eyebrow}</div>
              <h3 class="metricTitle">${meta.title}</h3>
            </div>
            <div class="metricBadge">${meta.source}</div>
          </div>
          ${emptyBody}
        </section>
      `;
    }

    const deltaClass = stats.delta > 0 ? "up" : stats.delta < 0 ? "down" : "flat";
    const deltaText = meta.deltaFormat(stats.delta, stats.baseline);

    return `
      <section class="metricCard" data-metric="${key}">
        <div class="metricHeader">
          <div>
            <div class="metricEyebrow">${meta.eyebrow}</div>
            <h3 class="metricTitle">${meta.title}</h3>
          </div>
          <div class="metricBadge">${meta.source}</div>
        </div>

        <div class="metricStatRow">
          <div class="metricStat">
            <div class="metricStatLabel">Latest</div>
            <div class="metricStatValue">
              <span>${meta.format(stats.latest.value)}</span>
              <span class="metricDelta ${deltaClass}">${deltaText}</span>
            </div>
            <div class="metricStatFoot">vs. ${meta.format(stats.baseline)} baseline</div>
          </div>
          <div class="metricStat">
            <div class="metricStatLabel">Mean</div>
            <div class="metricStatValue"><span>${meta.format(stats.mean)}</span></div>
            <div class="metricStatFoot">across ${stats.pairs.length} months</div>
          </div>
          <div class="metricStat">
            <div class="metricStatLabel">Range</div>
            <div class="metricStatValue">
              <span>${meta.format(stats.min)}</span>
              <span class="metricRangeArrow">→</span>
              <span>${meta.format(stats.max)}</span>
            </div>
            <div class="metricStatFoot">observed min / max</div>
          </div>
          <div class="metricStat">
            <div class="metricStatLabel">QA coverage</div>
            <div class="metricStatValue"><span>${Math.round(stats.coverage * 100)}%</span></div>
            <div class="metricStatFoot">${stats.pairs.length} / ${state.series.length} months</div>
          </div>
        </div>

        <div class="metricChart">
          ${makeChartSvg(key, stats, meta)}
        </div>

        <div class="metricFooter">
          <span>${rangeLabel}</span>
          <span>${coverageLabel}</span>
        </div>
      </section>
    `;
  }

  function makeChartSvg(key, stats, meta) {
    const width = 960;
    const height = 220;
    const padLeft = 48;
    const padRight = 16;
    const padTop = 14;
    const padBottom = 28;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const pairs = stats.pairs;
    const nMonths = state.series.length;

    // y-scale: pad min/max 10%, but also keep sane floor/ceil for the metric
    const rawMin = Math.min(stats.min, stats.baseline);
    const rawMax = Math.max(stats.max, stats.baseline);
    const spread = Math.max(rawMax - rawMin, 0.05);
    const yMin = Math.max(meta.yFloor, rawMin - spread * 0.15);
    const yMax = Math.min(meta.yCeil, rawMax + spread * 0.15);

    const xOf = (idx) => padLeft + (idx / Math.max(nMonths - 1, 1)) * plotW;
    const yOf = (val) =>
      padTop + plotH - ((val - yMin) / Math.max(yMax - yMin, 1e-9)) * plotH;

    // Grid lines
    const ticks = 4;
    const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
      const val = yMin + ((yMax - yMin) * i) / ticks;
      const y = yOf(val);
      return `
        <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"
              stroke="rgba(122, 172, 214, 0.08)" stroke-width="1" />
        <text x="${padLeft - 6}" y="${y + 4}" text-anchor="end"
              class="metricAxis">${meta.formatAxis(val)}</text>
      `;
    }).join("");

    // Baseline reference
    const baselineY = yOf(stats.baseline);
    const baselineLine = `
      <line x1="${padLeft}" y1="${baselineY}" x2="${width - padRight}" y2="${baselineY}"
            stroke="rgba(236, 255, 245, 0.38)" stroke-width="1" stroke-dasharray="3 5" />
      <text x="${width - padRight}" y="${baselineY - 6}" text-anchor="end"
            class="metricBaselineLabel">baseline</text>
    `;

    // Build area path by bridging gaps (stats.pairs is already non-null values
    // but in original series order via .idx — pairs may have gaps).
    const pointD = pairs.map((p) => `${xOf(p.idx).toFixed(2)} ${yOf(p.value).toFixed(2)}`);
    const line = pointD.length ? `M${pointD.join(" L")}` : "";
    const area =
      pointD.length >= 2
        ? `M${xOf(pairs[0].idx).toFixed(2)} ${(padTop + plotH).toFixed(2)}
           L${pointD.join(" L")}
           L${xOf(pairs[pairs.length - 1].idx).toFixed(2)} ${(padTop + plotH).toFixed(2)} Z`
        : "";

    // Dot for latest
    const latestDot = stats.latest
      ? `<circle cx="${xOf(stats.latest.idx)}" cy="${yOf(stats.latest.value)}" r="4"
                  fill="${meta.stroke}" stroke="#08101a" stroke-width="2" />`
      : "";

    // X-axis endpoints
    const first = state.series[0];
    const last = state.series[state.series.length - 1];
    const xLabels = `
      <text x="${padLeft}" y="${height - 8}" class="metricAxis">${first ? first.month : ""}</text>
      <text x="${width - padRight}" y="${height - 8}" text-anchor="end"
            class="metricAxis">${last ? last.month : ""}</text>
    `;

    const gradId = `grad-${key}`;
    return `
      <svg class="metricSvg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"
           role="img" aria-label="${meta.title} monthly series">
        <defs>
          <linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${meta.fillTop}" />
            <stop offset="100%" stop-color="${meta.fillBot}" />
          </linearGradient>
        </defs>
        ${gridLines}
        ${baselineLine}
        ${area ? `<path d="${area}" fill="url(#${gradId})" />` : ""}
        ${line ? `<path d="${line}" fill="none" stroke="${meta.stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />` : ""}
        ${latestDot}
        ${xLabels}
      </svg>
    `;
  }

  function renderShell() {
    const months = monthRange(MIN_MONTH, currentMonth);
    const monthOptions = months
      .map((m) => `<option value="${m}"${m === state.startMonth ? " selected" : ""}>${m}</option>`)
      .join("");
    const monthOptionsEnd = months
      .map((m) => `<option value="${m}"${m === state.endMonth ? " selected" : ""}>${m}</option>`)
      .join("");

    root.innerHTML = `
      <div class="explorerApp">
        <div class="explorerTop">
          <section class="explorerCard">
            <h2 class="explorerCardTitle">Query</h2>
            <div class="explorerControlGrid">
              <div class="explorerSplit">
                <div class="explorerRow">
                  <label class="explorerLabel" for="lat">Latitude</label>
                  <input id="lat" class="explorerInput" type="number" min="-90" max="90" step="0.0001" value="${state.lat.toFixed(4)}" />
                </div>
                <div class="explorerRow">
                  <label class="explorerLabel" for="lon">Longitude</label>
                  <input id="lon" class="explorerInput" type="number" min="-180" max="180" step="0.0001" value="${state.lon.toFixed(4)}" />
                </div>
              </div>
              <div class="explorerSplit">
                <div class="explorerRow">
                  <label class="explorerLabel" for="start-month">Start month</label>
                  <select id="start-month" class="explorerSelect">${monthOptions}</select>
                </div>
                <div class="explorerRow">
                  <label class="explorerLabel" for="end-month">End month</label>
                  <select id="end-month" class="explorerSelect">${monthOptionsEnd}</select>
                </div>
              </div>
              <div class="explorerRow">
                <span class="explorerLabel">Metrics</span>
                <div class="explorerMetricList">
                  <label class="explorerMetric"><input id="metric-ndvi" type="checkbox"${state.metrics.has("ndvi") ? " checked" : ""} /> NDVI</label>
                  <label class="explorerMetric"><input id="metric-lst" type="checkbox"${state.metrics.has("lst") ? " checked" : ""} /> LST</label>
                </div>
              </div>
              <button id="load-series" class="explorerBtn" type="button">Load monthly series</button>
              <div id="explorer-status" class="explorerStatus"></div>
              <div id="explorer-banner" class="explorerBanner info" hidden></div>
            </div>
          </section>
          <section class="explorerCard">
            <h2 class="explorerCardTitle">Location</h2>
            <div id="viewer-stage" class="viewerStage" aria-label="Location picker map">
              <div id="viewer-map" class="viewerMap"></div>
              <div class="viewerHint">Click map to set location</div>
              <div id="viewer-coords" class="viewerStatus"></div>
            </div>
          </section>
        </div>
        <div id="metric-dashboard" class="metricDashboard"></div>
      </div>
    `;
  }

  function updateStatus() {
    const status = document.getElementById("explorer-status");
    const coords = document.getElementById("viewer-coords");
    const banner = document.getElementById("explorer-banner");
    if (status) {
      if (state.loading) {
        status.textContent = "Loading MODIS monthly series from NASA ORNL DAAC...";
      } else if (!state.hasLoaded) {
        status.textContent = "Ready to load MODIS monthly series.";
      } else if (state.series.length) {
        const sourceTag = state.source ? ` Source: ${state.source}.` : "";
        status.textContent = `Loaded ${state.series.length} months from ${state.startMonth} to ${state.endMonth}.${sourceTag}`;
      } else {
        status.textContent = "No live series loaded.";
      }
    }
    if (banner) {
      banner.hidden = !state.banner;
      banner.className = `explorerBanner ${state.bannerLevel || "info"}`;
      banner.textContent = state.banner;
    }
    if (coords) {
      coords.textContent = `${state.lat.toFixed(3)}, ${state.lon.toFixed(3)}`;
    }
  }

  function updateCharts() {
    const dashboard = document.getElementById("metric-dashboard");
    if (!dashboard) return;
    dashboard.innerHTML = renderChartCard("ndvi") + renderChartCard("lst");
  }

  function syncMapMarker() {
    if (!map || !deckOverlay) return;
    const data = [{ position: [state.lon, state.lat] }];
    // Pulse oscillates 0→1→0; use for ring opacity + radius breathing.
    const pulse = 0.5 + 0.5 * Math.sin(pulsePhase);

    deckOverlay.setProps({
      layers: [
        // Outer pulsing halo
        new deck.ScatterplotLayer({
          id: "location-halo",
          data,
          getPosition: (d) => d.position,
          radiusUnits: "pixels",
          getRadius: 22 + pulse * 14,
          getFillColor: [118, 255, 193, Math.round(45 + pulse * 55)],
          stroked: false,
          filled: true,
          pickable: false,
          updateTriggers: { getRadius: pulsePhase, getFillColor: pulsePhase },
        }),
        // Mid ring
        new deck.ScatterplotLayer({
          id: "location-ring",
          data,
          getPosition: (d) => d.position,
          radiusUnits: "pixels",
          getRadius: 11,
          getFillColor: [0, 0, 0, 0],
          getLineColor: [118, 255, 193, 230],
          lineWidthUnits: "pixels",
          getLineWidth: 2,
          stroked: true,
          filled: true,
          pickable: false,
        }),
        // Inner solid dot
        new deck.ScatterplotLayer({
          id: "location-dot",
          data,
          getPosition: (d) => d.position,
          radiusUnits: "pixels",
          getRadius: 4,
          getFillColor: [236, 255, 245, 255],
          stroked: false,
          filled: true,
          pickable: false,
        }),
      ],
    });
  }

  function startPulse() {
    if (pulseRaf) return;
    const step = () => {
      pulsePhase += 0.06;
      syncMapMarker();
      pulseRaf = requestAnimationFrame(step);
    };
    pulseRaf = requestAnimationFrame(step);
  }

  function centerMap() {
    if (!map) return;
    map.easeTo({
      center: [state.lon, state.lat],
      duration: 450,
      zoom: Math.max(map.getZoom(), 2.2),
    });
  }

  function normalizeRange() {
    if (monthToIndex(state.startMonth) > monthToIndex(state.endMonth)) {
      state.endMonth = state.startMonth;
      const endSelect = document.getElementById("end-month");
      if (endSelect) endSelect.value = state.endMonth;
    }
  }

  function loadSeries() {
    normalizeRange();
    state.loading = true;
    // Clear prior series so the chart cards re-render into the empty
    // (spinner) state instead of sticking on the last successful load.
    state.series = [];
    updateStatus();
    updateCharts();

    const provider = providers[state.provider];
    if (!provider || typeof provider.getMonthlySeries !== "function") {
      state.series = [];
      state.loading = false;
      state.source = "none";
      state.warning = "Provider is not configured.";
      state.banner = "Dataset provider is not configured.";
      state.bannerLevel = "error";
      updateStatus();
      updateCharts();
      return;
    }

    provider
      .getMonthlySeries({
        lat: state.lat,
        lon: state.lon,
        startMonth: state.startMonth,
        endMonth: state.endMonth,
        metrics: state.metrics,
      })
      .then((payload) => {
        state.series = Array.isArray(payload?.series) ? payload.series : [];
        state.source = payload?.source || "ORNL DAAC";
        state.hasLoaded = true;
        state.warning = "";
        state.banner = "Loaded MODIS monthly series from NASA ORNL DAAC.";
        state.bannerLevel = "info";
      })
      .catch((error) => {
        state.series = [];
        state.source = "";
        state.hasLoaded = true;
        state.warning = `Request failed (${error?.status || "request error"})`;
        if (error?.code === "range_too_wide" || error?.status === 413) {
          state.banner = error?.message || "The selected date range is too wide — narrow it to about 3 years.";
          state.bannerLevel = "warning";
        } else if (error?.status === 503) {
          state.banner = "NASA ORNL DAAC is temporarily unavailable (503). Try again later.";
          state.bannerLevel = "warning";
        } else {
          state.banner = `Could not load MODIS data from ORNL DAAC (${error?.status || "request error"}).`;
          state.bannerLevel = "error";
        }
        console.warn("[Explore] Monthly backend fetch failed:", {
          message: error?.message || "Unknown error",
          code: error?.code || "unknown",
          status: error?.status || null,
        });
      })
      .finally(() => {
        state.loading = false;
        updateStatus();
        updateCharts();
      });
  }

  function initMap() {
    const mapNode = document.getElementById("viewer-map");
    if (!mapNode) return;

    if (typeof maplibregl === "undefined" || typeof deck === "undefined") {
      mapNode.innerHTML = "<div class=\"chartEmpty\">Map libraries failed to load.</div>";
      state.banner = "Map libraries failed to load. Data controls and charts remain available.";
      state.bannerLevel = "error";
      updateStatus();
      return;
    }

    try {
      map = new maplibregl.Map({
        container: mapNode,
        style: BASEMAP_STYLE,
        center: [state.lon, state.lat],
        zoom: 2.2,
        attributionControl: { compact: true },
      });
    } catch (error) {
      mapNode.innerHTML = "<div class=\"chartEmpty\">Could not initialize map.</div>";
      console.error("[Explore] Map initialization failed:", error);
      state.banner = "Map failed to initialize. Data controls and charts remain available.";
      state.bannerLevel = "error";
      updateStatus();
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      if (typeof map.setProjection === "function") {
        map.setProjection({ type: "globe" });
      }

      deckOverlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(deckOverlay);
      syncMapMarker();
      startPulse();
      updateStatus();
    });

    map.on("click", (event) => {
      state.lat = clamp(event.lngLat.lat, -90, 90);
      state.lon = clamp(event.lngLat.lng, -180, 180);

      const latInput = document.getElementById("lat");
      const lonInput = document.getElementById("lon");
      if (latInput) latInput.value = state.lat.toFixed(4);
      if (lonInput) lonInput.value = state.lon.toFixed(4);

      syncMapMarker();
      updateStatus();
      updateCharts();
    });
  }

  function bindControls() {
    const latInput = document.getElementById("lat");
    const lonInput = document.getElementById("lon");
    const startMonth = document.getElementById("start-month");
    const endMonth = document.getElementById("end-month");
    const metricNdvi = document.getElementById("metric-ndvi");
    const metricLst = document.getElementById("metric-lst");
    const loadBtn = document.getElementById("load-series");

    if (latInput) {
      latInput.addEventListener("change", () => {
        state.lat = clamp(Number(latInput.value) || 0, -90, 90);
        centerMap();
        syncMapMarker();
        updateStatus();
        updateCharts();
      });
    }

    if (lonInput) {
      lonInput.addEventListener("change", () => {
        state.lon = clamp(Number(lonInput.value) || 0, -180, 180);
        centerMap();
        syncMapMarker();
        updateStatus();
        updateCharts();
      });
    }

    if (startMonth) {
      startMonth.addEventListener("change", () => {
        state.startMonth = startMonth.value;
        normalizeRange();
        updateStatus();
      });
    }

    if (endMonth) {
      endMonth.addEventListener("change", () => {
        state.endMonth = endMonth.value;
        normalizeRange();
        updateStatus();
      });
    }

    if (metricNdvi) {
      metricNdvi.addEventListener("change", () => {
        if (metricNdvi.checked) state.metrics.add("ndvi");
        else state.metrics.delete("ndvi");
      });
    }

    if (metricLst) {
      metricLst.addEventListener("change", () => {
        if (metricLst.checked) state.metrics.add("lst");
        else state.metrics.delete("lst");
      });
    }

    if (loadBtn) {
      loadBtn.addEventListener("click", () => {
        if (!state.metrics.size) state.metrics.add("ndvi");
        loadSeries();
      });
    }
  }

  // URL-driven presets. Two modes:
  //   ?project=<id>      → load prefetched /public/data/histories/<id>.json
  //   ?lat=&lon=&start=&end=&metrics=  → prefill and trigger a live load
  function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");
    const lat = parseFloat(params.get("lat"));
    const lon = parseFloat(params.get("lon"));
    const start = params.get("start");
    const end = params.get("end");
    const metrics = params.get("metrics");

    if (metrics) {
      state.metrics = new Set(
        metrics.split(",").map((s) => s.trim()).filter((m) => m === "ndvi" || m === "lst")
      );
      if (state.metrics.size === 0) state.metrics = new Set(["ndvi", "lst"]);
    }

    if (projectId) {
      loadPrefetchedProject(projectId);
      return true;
    }

    let changed = false;
    if (Number.isFinite(lat) && lat >= -90 && lat <= 90) {
      state.lat = lat;
      changed = true;
    }
    if (Number.isFinite(lon) && lon >= -180 && lon <= 180) {
      state.lon = lon;
      changed = true;
    }
    if (start && /^\d{4}-\d{2}$/.test(start)) {
      state.startMonth = start;
      changed = true;
    }
    if (end && /^\d{4}-\d{2}$/.test(end)) {
      state.endMonth = end;
      changed = true;
    }
    return changed;
  }

  async function loadPrefetchedProject(projectId) {
    state.loading = true;
    state.banner = "Loading prefetched project history…";
    state.bannerLevel = "info";
    updateStatus();
    updateCharts();

    try {
      const res = await fetch(`/public/data/histories/${projectId}.json`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`history ${projectId} not found (${res.status})`);

      // Cloudflare Pages rewrites unknown paths to index.html on some
      // configurations, so a 200 + HTML body means the history isn't there.
      const bodyText = await res.text();
      if (bodyText.trim().startsWith("<")) {
        throw new Error(
          `No prefetched history yet for ${projectId} — press Load monthly series to fetch live.`
        );
      }

      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        throw new Error(`Prefetched history for ${projectId} returned unexpected content.`);
      }

      state.lat = payload.lat;
      state.lon = payload.lon;
      state.startMonth = payload.startMonth;
      state.endMonth = payload.endMonth;
      state.series = Array.isArray(payload.series) ? payload.series : [];
      state.source = `ornl_daac (prefetched for ${payload.projectName || projectId})`;
      state.hasLoaded = true;
      const interventionTag = payload.interventionStart
        ? ` Intervention began ${payload.interventionStart}.`
        : "";
      state.banner = `Loaded ${state.series.length} months for ${
        payload.projectName || projectId
      }.${interventionTag}`;
      state.bannerLevel = "info";

      // Sync the control inputs to the preset so the UI reflects state.
      const latInput = document.getElementById("lat");
      const lonInput = document.getElementById("lon");
      const startSelect = document.getElementById("start-month");
      const endSelect = document.getElementById("end-month");
      if (latInput) latInput.value = state.lat.toFixed(4);
      if (lonInput) lonInput.value = state.lon.toFixed(4);
      if (startSelect) startSelect.value = state.startMonth;
      if (endSelect) endSelect.value = state.endMonth;
      centerMap();
      syncMapMarker();
    } catch (error) {
      console.warn("[Explore] prefetched project load failed:", error);
      state.banner =
        error?.message ||
        `Could not load prefetched history for ${projectId}. Try widening the date range and pressing Load.`;
      state.bannerLevel = "warning";
      state.hasLoaded = false;
    } finally {
      state.loading = false;
      updateStatus();
      updateCharts();
    }
  }

  renderShell();
  bindControls();
  initMap();
  const hasPreset = applyUrlParams();
  updateStatus();
  updateCharts();
  // When the preset is coord-based (not a project), kick off a live load
  // automatically so the user doesn't have to hit the button after a deep link.
  if (hasPreset && !new URLSearchParams(window.location.search).get("project")) {
    loadSeries();
  }
})();

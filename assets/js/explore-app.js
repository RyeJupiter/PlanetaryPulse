/* global document, maplibregl, deck */

(function initExploreApp() {
  const root = document.getElementById("explorer-app");
  if (!root) return;

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const state = {
    provider: "modis",
    lat: 36.9529,
    lon: -122.0253,
    startMonth: "2020-01",
    endMonth: currentMonth,
    metrics: new Set(["ndvi", "lst"]),
    series: [],
    loading: false,
    source: "mock",
    warning: "",
  };

  let map;
  let deckOverlay;

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
        return fetchMonthlyFromBackend("modis", lat, lon, startMonth, endMonth, metrics);
      },
    },
    viirs: {
      id: "viirs",
      label: "VIIRS",
      getMonthlySeries({ lat, lon, startMonth, endMonth, metrics }) {
        return fetchMonthlyFromBackend("viirs", lat, lon, startMonth, endMonth, metrics);
      },
    },
  };

  function fetchMonthlyFromBackend(providerId, lat, lon, startMonth, endMonth, metrics) {
    return fetch("/api/explore/monthly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: providerId,
        lat,
        lon,
        startMonth,
        endMonth,
        metrics: Array.from(metrics),
      }),
    }).then(async (res) => {
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(payload.error || "Backend request failed.");
        err.code = payload.code || "backend_error";
        err.status = res.status;
        throw err;
      }
      return payload;
    });
  }

  function generateMockSeries(providerId, lat, lon, startMonth, endMonth, metrics) {
    const months = monthRange(startMonth, endMonth);
    const latFactor = lat / 90;
    const lonFactor = lon / 180;
    const providerBias = providerId === "viirs" ? 0.03 : 0;

    return months.map((month, idx) => {
      const seasonal = Math.sin((idx / 12) * Math.PI * 2);
      const drift = idx / Math.max(1, months.length - 1);
      const ndviBase = 0.46 + seasonal * 0.16 + latFactor * 0.06 + providerBias + drift * 0.02;
      const lstBase = 19 + seasonal * 7 - latFactor * 8 + lonFactor * 1.8 - providerBias * 10;
      const cloudyPenalty = Math.cos((idx / 6) * Math.PI * 2) > 0.82 ? 0.08 : 0;

      const point = {
        month,
        count: providerId === "viirs" ? 3 : 2,
        qaScore: clamp(1 - cloudyPenalty, 0.72, 0.99),
      };

      if (metrics.has("ndvi")) {
        point.ndvi = clamp(ndviBase - cloudyPenalty, 0.08, 0.92);
      }
      if (metrics.has("lst")) {
        point.lst = clamp(lstBase + cloudyPenalty * 18, -10, 48);
      }
      return point;
    });
  }

  function linePath(points, width, height, minY, maxY) {
    if (!points.length) return "";
    const xStep = width / Math.max(points.length - 1, 1);
    return points
      .map((p, i) => {
        const x = i * xStep;
        const yNorm = (p - minY) / Math.max(maxY - minY, 1e-9);
        const y = height - yNorm * height;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }

  function makeChartSvg(series, key, minY, maxY, stroke) {
    const values = series.map((d) => d[key]).filter((v) => typeof v === "number");
    if (!values.length) return `<div class="chartEmpty">No ${key.toUpperCase()} values for selected range.</div>`;

    const width = 800;
    const height = 180;
    const gridLines = [0.2, 0.4, 0.6, 0.8]
      .map((n) => `<line x1="0" y1="${height * n}" x2="${width}" y2="${height * n}" stroke="rgba(140,180,230,0.16)" stroke-width="1" />`)
      .join("");
    const path = linePath(values, width, height, minY, maxY);
    return `
      <svg class="chartSvg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${key} chart">
        ${gridLines}
        <path d="${path}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" />
      </svg>
    `;
  }

  function renderShell() {
    const months = monthRange("2020-01", currentMonth);
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
            <h2 class="explorerCardTitle">Data Drawdown Controls</h2>
            <div class="explorerControlGrid">
              <div class="explorerRow">
                <label class="explorerLabel" for="provider">Dataset</label>
                <select id="provider" class="explorerSelect">
                  <option value="modis"${state.provider === "modis" ? " selected" : ""}>MODIS</option>
                  <option value="viirs"${state.provider === "viirs" ? " selected" : ""}>VIIRS</option>
                </select>
              </div>
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
            </div>
          </section>
          <section class="explorerCard">
            <h2 class="explorerCardTitle">Viewer (MapLibre + deck.gl)</h2>
            <div id="viewer-stage" class="viewerStage" aria-label="Location picker map">
              <div id="viewer-map" class="viewerMap"></div>
              <div class="viewerHint">Click map to set location</div>
              <div id="viewer-coords" class="viewerStatus"></div>
            </div>
          </section>
        </div>
        <div class="explorerBottom">
          <section class="chartCard">
            <div class="chartHeader">
              <h3 class="chartTitle">NDVI Monthly Series</h3>
              <div id="chart-meta-ndvi" class="chartMeta"></div>
            </div>
            <div id="chart-ndvi"></div>
          </section>
          <section class="chartCard">
            <div class="chartHeader">
              <h3 class="chartTitle">LST Monthly Series (deg C)</h3>
              <div id="chart-meta-lst" class="chartMeta"></div>
            </div>
            <div id="chart-lst"></div>
          </section>
        </div>
      </div>
    `;
  }

  function updateStatus() {
    const status = document.getElementById("explorer-status");
    const coords = document.getElementById("viewer-coords");
    if (status) {
      const sourceTag = state.source ? `Source: ${state.source.toUpperCase()}` : "";
      status.textContent = state.loading
        ? "Loading monthly series..."
        : `Loaded ${state.series.length} months from ${state.startMonth} to ${state.endMonth}. ${sourceTag}`;
    }
    if (coords) {
      coords.textContent = `${state.lat.toFixed(3)}, ${state.lon.toFixed(3)}`;
    }
  }

  function updateCharts() {
    const ndvi = document.getElementById("chart-ndvi");
    const lst = document.getElementById("chart-lst");
    const ndviMeta = document.getElementById("chart-meta-ndvi");
    const lstMeta = document.getElementById("chart-meta-lst");
    if (ndvi) ndvi.innerHTML = makeChartSvg(state.series, "ndvi", 0, 1, "#76ffc1");
    if (lst) lst.innerHTML = makeChartSvg(state.series, "lst", -10, 50, "#ffb070");
    if (ndviMeta) ndviMeta.textContent = `${state.provider.toUpperCase()} | ${state.lat.toFixed(2)}, ${state.lon.toFixed(2)}`;
    if (lstMeta) {
      const suffix = state.warning ? ` | ${state.warning}` : " | QA-filtered monthly series";
      lstMeta.textContent = `${state.provider.toUpperCase()}${suffix}`;
    }
  }

  function syncMapMarker() {
    if (!map || !deckOverlay) return;
    deckOverlay.setProps({
      layers: [
        new deck.ScatterplotLayer({
          id: "selected-location",
          data: [{ position: [state.lon, state.lat] }],
          getPosition: (d) => d.position,
          getRadius: 90000,
          radiusMinPixels: 6,
          radiusMaxPixels: 18,
          getFillColor: [10, 20, 30, 220],
          getLineColor: [118, 255, 193, 255],
          lineWidthMinPixels: 2,
          stroked: true,
          filled: true,
          pickable: false,
        }),
      ],
    });
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
    updateStatus();

    const provider = providers[state.provider];
    if (!provider || typeof provider.getMonthlySeries !== "function") {
      state.series = [];
      state.loading = false;
      state.source = "none";
      state.warning = "Provider is not configured.";
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
        state.source = payload?.source || "appeears";
        state.warning = "";
      })
      .catch((error) => {
        state.series = generateMockSeries(
          state.provider,
          state.lat,
          state.lon,
          state.startMonth,
          state.endMonth,
          state.metrics
        );
        state.source = "mock";
        const fallbackReason =
          error?.code === "missing_credentials"
            ? "Mock fallback (set AppEEARS env vars)"
            : `Mock fallback (${error?.status || "request error"})`;
        state.warning = fallbackReason;
        // Keep a console trail for debugging failed backend draws without breaking UI flow.
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
      return;
    }

    try {
      map = new maplibregl.Map({
        container: mapNode,
        style: "https://demotiles.maplibre.org/style.json",
        center: [state.lon, state.lat],
        zoom: 2.2,
        attributionControl: false,
      });
    } catch (error) {
      mapNode.innerHTML = "<div class=\"chartEmpty\">Could not initialize map.</div>";
      console.error("[Explore] Map initialization failed:", error);
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
    const provider = document.getElementById("provider");
    const latInput = document.getElementById("lat");
    const lonInput = document.getElementById("lon");
    const startMonth = document.getElementById("start-month");
    const endMonth = document.getElementById("end-month");
    const metricNdvi = document.getElementById("metric-ndvi");
    const metricLst = document.getElementById("metric-lst");
    const loadBtn = document.getElementById("load-series");

    if (provider) {
      provider.addEventListener("change", () => {
        state.provider = provider.value;
        updateStatus();
      });
    }

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

  renderShell();
  bindControls();
  initMap();
  updateStatus();
  updateCharts();
  loadSeries();
})();

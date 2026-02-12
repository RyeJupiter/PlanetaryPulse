/* global document */

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
  };

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

  // Common adapter contract:
  // getMonthlySeries({lat, lon, startMonth, endMonth, metrics}) -> Promise<Array<{month, ndvi?, lst?, count, qaScore}>>
  const providers = {
    modis: {
      id: "modis",
      label: "MODIS (mock adapter)",
      getMonthlySeries({ lat, lon, startMonth, endMonth, metrics }) {
        return Promise.resolve(generateMockSeries("modis", lat, lon, startMonth, endMonth, metrics));
      },
    },
    viirs: {
      id: "viirs",
      label: "VIIRS (mock adapter)",
      getMonthlySeries({ lat, lon, startMonth, endMonth, metrics }) {
        return Promise.resolve(generateMockSeries("viirs", lat, lon, startMonth, endMonth, metrics));
      },
    },
  };

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

  function render() {
    const months = monthRange("2020-01", currentMonth);
    const monthOptions = months
      .map((m) => `<option value="${m}"${m === state.startMonth ? " selected" : ""}>${m}</option>`)
      .join("");
    const monthOptionsEnd = months
      .map((m) => `<option value="${m}"${m === state.endMonth ? " selected" : ""}>${m}</option>`)
      .join("");

    const markerLeft = ((state.lon + 180) / 360) * 100;
    const markerTop = ((90 - state.lat) / 180) * 100;
    const status = state.loading
      ? "Loading monthly series..."
      : `Loaded ${state.series.length} months from ${state.startMonth} to ${state.endMonth}.`;

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
              <div class="explorerStatus">${status}</div>
            </div>
          </section>
          <section class="explorerCard">
            <h2 class="explorerCardTitle">Viewer (engine selectable later)</h2>
            <div id="viewer-stage" class="viewerStage" aria-label="Location picker surface">
              <div class="viewerGrid"></div>
              <div class="viewerHint">Click to set location for drawdown</div>
              <div class="viewerMarker" style="left:${markerLeft.toFixed(2)}%; top:${markerTop.toFixed(2)}%;"></div>
            </div>
          </section>
        </div>
        <div class="explorerBottom">
          <section class="chartCard">
            <div class="chartHeader">
              <h3 class="chartTitle">NDVI Monthly Series</h3>
              <div class="chartMeta">${state.provider.toUpperCase()} | ${state.lat.toFixed(2)}, ${state.lon.toFixed(2)}</div>
            </div>
            ${makeChartSvg(state.series, "ndvi", 0, 1, "#76ffc1")}
          </section>
          <section class="chartCard">
            <div class="chartHeader">
              <h3 class="chartTitle">LST Monthly Series (deg C)</h3>
              <div class="chartMeta">${state.provider.toUpperCase()} | QA-filtered monthly mock</div>
            </div>
            ${makeChartSvg(state.series, "lst", -10, 50, "#ffb070")}
          </section>
        </div>
      </div>
    `;

    attachEvents();
  }

  function normalizeRange() {
    if (monthToIndex(state.startMonth) > monthToIndex(state.endMonth)) {
      state.endMonth = state.startMonth;
    }
  }

  function loadSeries() {
    normalizeRange();
    state.loading = true;
    render();

    const provider = providers[state.provider];
    provider
      .getMonthlySeries({
        lat: state.lat,
        lon: state.lon,
        startMonth: state.startMonth,
        endMonth: state.endMonth,
        metrics: state.metrics,
      })
      .then((series) => {
        state.series = series;
      })
      .catch(() => {
        state.series = [];
      })
      .finally(() => {
        state.loading = false;
        render();
      });
  }

  function attachEvents() {
    const provider = root.querySelector("#provider");
    const latInput = root.querySelector("#lat");
    const lonInput = root.querySelector("#lon");
    const startMonth = root.querySelector("#start-month");
    const endMonth = root.querySelector("#end-month");
    const metricNdvi = root.querySelector("#metric-ndvi");
    const metricLst = root.querySelector("#metric-lst");
    const loadBtn = root.querySelector("#load-series");
    const viewer = root.querySelector("#viewer-stage");

    if (provider) {
      provider.addEventListener("change", () => {
        state.provider = provider.value;
      });
    }

    if (latInput) {
      latInput.addEventListener("change", () => {
        state.lat = clamp(Number(latInput.value) || 0, -90, 90);
        render();
      });
    }

    if (lonInput) {
      lonInput.addEventListener("change", () => {
        state.lon = clamp(Number(lonInput.value) || 0, -180, 180);
        render();
      });
    }

    if (startMonth) {
      startMonth.addEventListener("change", () => {
        state.startMonth = startMonth.value;
        normalizeRange();
        render();
      });
    }

    if (endMonth) {
      endMonth.addEventListener("change", () => {
        state.endMonth = endMonth.value;
        normalizeRange();
        render();
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

    if (viewer) {
      viewer.addEventListener("click", (event) => {
        const rect = viewer.getBoundingClientRect();
        const xRatio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const yRatio = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        state.lon = xRatio * 360 - 180;
        state.lat = 90 - yRatio * 180;
        render();
      });
    }

    if (loadBtn) {
      loadBtn.addEventListener("click", () => {
        if (!state.metrics.size) state.metrics.add("ndvi");
        loadSeries();
      });
    }
  }

  render();
  loadSeries();
})();

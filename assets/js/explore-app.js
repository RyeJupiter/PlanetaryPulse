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
    // Shared viewport across both metric charts so panning/zooming NDVI
    // also moves LST and they stay aligned in time. Stored as fractional
    // month indices. null = show the full series.
    viewport: null,
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
    const selected = state.metrics.has(key);
    const stats = computeStats(state.series, key);

    if (!selected) {
      return `
        <section class="metricCard metricDisabled" data-metric="${key}">
          <div class="metricLabel">${meta.title}</div>
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
          <div class="metricLabel">${meta.title}</div>
          ${emptyBody}
        </section>
      `;
    }

    return `
      <section class="metricCard metricInteractive" data-metric="${key}">
        <div class="metricLabel">${meta.title}</div>
        <div class="metricChart" data-chart="${key}">
          ${makeChartSvg(key, stats, meta)}
        </div>
      </section>
    `;
  }

  function viewportBounds() {
    const n = state.series.length;
    if (n === 0) return { start: 0, end: 0, count: 0 };
    if (!state.viewport) return { start: 0, end: n - 1, count: n };
    const clampedStart = Math.max(0, Math.min(state.viewport.start, n - 1.01));
    const clampedEnd = Math.max(clampedStart + 0.5, Math.min(state.viewport.end, n - 1));
    return { start: clampedStart, end: clampedEnd, count: clampedEnd - clampedStart + 1 };
  }

  function makeChartSvg(key, stats, meta) {
    const width = 960;
    const height = 220;
    const padLeft = 44;
    const padRight = 14;
    const padTop = 14;
    const padBottom = 26;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const { start, end } = viewportBounds();
    const pairs = stats.pairs;

    // y-scale: compute from visible points only so zooming also zooms Y range.
    const visiblePairs = pairs.filter((p) => p.idx >= start - 0.5 && p.idx <= end + 0.5);
    const valuesForScale = visiblePairs.length ? visiblePairs.map((p) => p.value) : [stats.min, stats.max];
    const rawMin = Math.min(...valuesForScale);
    const rawMax = Math.max(...valuesForScale);
    const spread = Math.max(rawMax - rawMin, 0.05);
    const yMin = Math.max(meta.yFloor, rawMin - spread * 0.15);
    const yMax = Math.min(meta.yCeil, rawMax + spread * 0.15);

    const xOf = (idx) => padLeft + ((idx - start) / Math.max(end - start, 1e-9)) * plotW;
    const yOf = (val) =>
      padTop + plotH - ((val - yMin) / Math.max(yMax - yMin, 1e-9)) * plotH;

    // y grid + labels
    const yTicks = 4;
    const yGrid = Array.from({ length: yTicks + 1 }, (_, i) => {
      const val = yMin + ((yMax - yMin) * i) / yTicks;
      const y = yOf(val);
      return `
        <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"
              stroke="rgba(166, 236, 170, 0.08)" stroke-width="1" />
        <text x="${padLeft - 6}" y="${y + 4}" text-anchor="end"
              class="metricAxis">${meta.formatAxis(val)}</text>
      `;
    }).join("");

    // x grid: adaptive year ticks based on visible span
    const xGrid = buildXAxis(start, end, xOf, padTop, plotH, height);

    // Clip path so panning doesn't draw outside the plot area
    const clipId = `clip-${key}`;

    // Line + area paths from visible pairs (drawn using full pair coords to
    // keep the shape stable; the clip mask handles off-screen portions).
    const visibleWithEdges = pairs.filter(
      (p) => p.idx >= start - 2 && p.idx <= end + 2
    );
    const pointD = visibleWithEdges.map((p) => `${xOf(p.idx).toFixed(2)} ${yOf(p.value).toFixed(2)}`);
    const line = pointD.length ? `M${pointD.join(" L")}` : "";
    const area =
      pointD.length >= 2
        ? `M${xOf(visibleWithEdges[0].idx).toFixed(2)} ${(padTop + plotH).toFixed(2)} L${pointD.join(" L")} L${xOf(visibleWithEdges[visibleWithEdges.length - 1].idx).toFixed(2)} ${(padTop + plotH).toFixed(2)} Z`
        : "";

    // Sample dots — only drawn when zoomed in enough that they're readable
    const spanMonths = end - start;
    const showDots = spanMonths < 60;
    const dots = showDots
      ? visibleWithEdges
          .map(
            (p) =>
              `<circle cx="${xOf(p.idx).toFixed(2)}" cy="${yOf(p.value).toFixed(2)}" r="${
                spanMonths < 24 ? 2.6 : 1.8
              }" fill="${meta.stroke}" fill-opacity="0.9" />`
          )
          .join("")
      : "";

    const gradId = `grad-${key}`;
    return `
      <svg class="metricSvg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"
           role="img" aria-label="${meta.title} monthly series">
        <defs>
          <linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${meta.fillTop}" />
            <stop offset="100%" stop-color="${meta.fillBot}" />
          </linearGradient>
          <clipPath id="${clipId}">
            <rect x="${padLeft}" y="${padTop}" width="${plotW}" height="${plotH}" />
          </clipPath>
        </defs>
        ${yGrid}
        ${xGrid}
        <g clip-path="url(#${clipId})">
          ${area ? `<path d="${area}" fill="url(#${gradId})" />` : ""}
          ${line ? `<path d="${line}" fill="none" stroke="${meta.stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />` : ""}
          ${dots}
        </g>
      </svg>
    `;
  }

  function buildXAxis(start, end, xOf, padTop, plotH, height) {
    const n = state.series.length;
    if (n === 0) return "";
    const spanMonths = end - start;
    // Pick a label cadence in months that leaves room
    const cadence =
      spanMonths > 240 ? 60 :
      spanMonths > 120 ? 24 :
      spanMonths > 48 ? 12 :
      spanMonths > 24 ? 6 :
      spanMonths > 12 ? 3 : 1;

    const firstIdx = Math.max(0, Math.floor(start));
    const lastIdx = Math.min(n - 1, Math.ceil(end));
    const lines = [];
    for (let i = firstIdx; i <= lastIdx; i += 1) {
      const month = state.series[i]?.month;
      if (!month) continue;
      const [y, m] = month.split("-");
      // Anchor ticks on Jan (cadence >= 12) or every `cadence` months from Jan.
      const monthNum = Number(m);
      const yearNum = Number(y);
      if (cadence >= 12) {
        if (monthNum !== 1) continue;
        if ((yearNum - Math.floor(Number(state.series[firstIdx].month.split("-")[0]))) % (cadence / 12) !== 0) {
          // align to nearest multiple from start year
        }
      } else {
        if ((monthNum - 1) % cadence !== 0) continue;
      }
      const x = xOf(i);
      const label = cadence >= 12 ? y : `${y}-${m}`;
      lines.push(`
        <line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + plotH}"
              stroke="rgba(196, 170, 108, 0.08)" stroke-width="1" />
        <text x="${x}" y="${height - 8}" text-anchor="middle" class="metricAxis">${label}</text>
      `);
    }
    return lines.join("");
  }

  function attachChartInteractions() {
    const dash = document.getElementById("metric-dashboard");
    if (!dash) return;
    dash.querySelectorAll(".metricChart[data-chart]").forEach((chart) => {
      bindChartInteraction(chart);
    });
  }

  function bindChartInteraction(el) {
    if (el.__pp_bound) return;
    el.__pp_bound = true;

    const getViewBoxPx = (clientX) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width) return 0;
      return ((clientX - rect.left) / rect.width) * 960; // viewBox width
    };
    const px2idx = (px) => {
      const { start, end } = viewportBounds();
      const padLeft = 44;
      const plotW = 960 - padLeft - 14;
      const local = Math.max(0, Math.min(plotW, px - padLeft));
      return start + (local / plotW) * (end - start);
    };

    // Pan with mouse drag
    let dragStartClientX = null;
    let dragStartViewport = null;
    el.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0) return;
      dragStartClientX = ev.clientX;
      dragStartViewport = { ...viewportBounds() };
      el.classList.add("metricChartPanning");
      ev.preventDefault();
    });
    window.addEventListener("mousemove", (ev) => {
      if (dragStartClientX == null) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      const dxPx = ev.clientX - dragStartClientX;
      const span = dragStartViewport.end - dragStartViewport.start;
      const dxIdx = -(dxPx / rect.width) * span;
      setViewport(dragStartViewport.start + dxIdx, dragStartViewport.end + dxIdx);
    });
    window.addEventListener("mouseup", () => {
      if (dragStartClientX == null) return;
      dragStartClientX = null;
      dragStartViewport = null;
      el.classList.remove("metricChartPanning");
    });

    // Zoom with wheel around cursor
    el.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        const cursorPx = getViewBoxPx(ev.clientX);
        const cursorIdx = px2idx(cursorPx);
        const { start, end } = viewportBounds();
        const factor = ev.deltaY > 0 ? 1.2 : 1 / 1.2;
        const newStart = cursorIdx - (cursorIdx - start) * factor;
        const newEnd = cursorIdx + (end - cursorIdx) * factor;
        setViewport(newStart, newEnd);
      },
      { passive: false }
    );

    // Touch: one-finger pan, two-finger pinch-zoom.
    let touchState = null;
    el.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.touches.length === 1) {
          touchState = {
            mode: "pan",
            startX: ev.touches[0].clientX,
            startViewport: { ...viewportBounds() },
          };
        } else if (ev.touches.length === 2) {
          const t1 = ev.touches[0];
          const t2 = ev.touches[1];
          touchState = {
            mode: "pinch",
            startDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
            midPx: getViewBoxPx((t1.clientX + t2.clientX) / 2),
            startViewport: { ...viewportBounds() },
          };
        }
      },
      { passive: true }
    );
    el.addEventListener(
      "touchmove",
      (ev) => {
        if (!touchState) return;
        if (touchState.mode === "pan" && ev.touches.length === 1) {
          const rect = el.getBoundingClientRect();
          if (!rect.width) return;
          const dxPx = ev.touches[0].clientX - touchState.startX;
          const span = touchState.startViewport.end - touchState.startViewport.start;
          const dxIdx = -(dxPx / rect.width) * span;
          setViewport(
            touchState.startViewport.start + dxIdx,
            touchState.startViewport.end + dxIdx
          );
          ev.preventDefault();
        } else if (touchState.mode === "pinch" && ev.touches.length === 2) {
          const t1 = ev.touches[0];
          const t2 = ev.touches[1];
          const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          const factor = touchState.startDist / Math.max(dist, 1);
          const padLeft = 44;
          const plotW = 960 - padLeft - 14;
          const midIdx =
            touchState.startViewport.start +
            (Math.max(0, Math.min(plotW, touchState.midPx - padLeft)) / plotW) *
              (touchState.startViewport.end - touchState.startViewport.start);
          setViewport(
            midIdx - (midIdx - touchState.startViewport.start) * factor,
            midIdx + (touchState.startViewport.end - midIdx) * factor
          );
          ev.preventDefault();
        }
      },
      { passive: false }
    );
    el.addEventListener("touchend", () => {
      touchState = null;
    });
    el.addEventListener("touchcancel", () => {
      touchState = null;
    });

    // Double click / double tap resets
    el.addEventListener("dblclick", () => resetViewport());
  }

  function setViewport(nextStart, nextEnd) {
    const n = state.series.length;
    if (n === 0) return;
    let start = nextStart;
    let end = nextEnd;
    // Enforce minimum span of 3 months so we don't get a dot
    if (end - start < 3) {
      const mid = (start + end) / 2;
      start = mid - 1.5;
      end = mid + 1.5;
    }
    // Clamp to series bounds
    if (start < 0) {
      end += -start;
      start = 0;
    }
    if (end > n - 1) {
      start -= end - (n - 1);
      end = n - 1;
    }
    start = Math.max(0, start);
    state.viewport = { start, end };
    refreshChartsOnly();
  }

  function resetViewport() {
    state.viewport = null;
    refreshChartsOnly();
  }

  function refreshChartsOnly() {
    // Only redraw the SVGs so pan/zoom feels smooth.
    for (const key of ["ndvi", "lst"]) {
      const chartEl = document.querySelector(
        `.metricCard[data-metric="${key}"] .metricChart[data-chart="${key}"]`
      );
      if (!chartEl) continue;
      const meta = METRIC_META[key];
      const stats = computeStats(state.series, key);
      if (!stats) continue;
      chartEl.innerHTML = makeChartSvg(key, stats, meta);
    }
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
    attachChartInteractions();
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
    state.viewport = null;
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

  // URL-driven presets.
  //   ?project=<id>       → try /public/data/histories/<id>.json first
  //   ?lat=&lon=&start=&end=&metrics=
  //                       → also applied, either as the primary source or
  //                         as a fallback if the prefetched history is
  //                         missing (Explore triggers a live load).
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

    let coordsChanged = false;
    if (Number.isFinite(lat) && lat >= -90 && lat <= 90) {
      state.lat = lat;
      coordsChanged = true;
    }
    if (Number.isFinite(lon) && lon >= -180 && lon <= 180) {
      state.lon = lon;
      coordsChanged = true;
    }
    if (start && /^\d{4}-\d{2}$/.test(start)) {
      state.startMonth = start;
      coordsChanged = true;
    }
    if (end && /^\d{4}-\d{2}$/.test(end)) {
      state.endMonth = end;
      coordsChanged = true;
    }

    // Reflect any coord preset in the controls + map immediately so the user
    // sees the right place even before the project history arrives.
    if (coordsChanged) {
      const latInput = document.getElementById("lat");
      const lonInput = document.getElementById("lon");
      const startSelect = document.getElementById("start-month");
      const endSelect = document.getElementById("end-month");
      if (latInput) latInput.value = state.lat.toFixed(4);
      if (lonInput) lonInput.value = state.lon.toFixed(4);
      if (startSelect) startSelect.value = state.startMonth;
      if (endSelect) endSelect.value = state.endMonth;
    }

    return { projectId, coordsChanged };
  }

  async function tryLoadProjectOrFallback(projectId) {
    const loaded = await loadPrefetchedProject(projectId);
    if (!loaded) {
      // Prefetch JSON isn't available yet — kick off a live load so the
      // user at least sees the recent window of data for this site.
      loadSeries();
    }
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
      state.viewport = null;
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
      updateStatus();
      updateCharts();
      state.loading = false;
      return true;
    } catch (error) {
      console.warn("[Explore] prefetched project load failed:", error);
      state.banner =
        error?.message ||
        `Could not load prefetched history for ${projectId}. Try widening the date range and pressing Load.`;
      state.bannerLevel = "warning";
      state.hasLoaded = false;
      state.loading = false;
      updateStatus();
      updateCharts();
      return false;
    }
  }

  renderShell();
  bindControls();
  initMap();
  const { projectId, coordsChanged } = applyUrlParams();
  updateStatus();
  updateCharts();

  if (projectId) {
    // Try prefetched first. If it's missing, fall back to a live load (which
    // uses the lat/lon/start/end the CTA included as safety rails).
    tryLoadProjectOrFallback(projectId);
  } else if (coordsChanged) {
    // Pure coord deep link: fire a live load right away.
    loadSeries();
  }
})();

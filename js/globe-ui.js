/* global window */

(function globeUI() {
    const METRICS = window.PP_METRICS;
    if (!METRICS) {
        console.warn("[PlanetaryPulse] Missing PP_METRICS. Did you load /js/metrics-config.js before globe-ui.js?");
        return;
    }

    function $(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        const el = $(id);
        if (!el) return;
        el.textContent = value ?? "";
    }

    function setHTML(id, value) {
        const el = $(id);
        if (!el) return;
        el.innerHTML = value ?? "";
    }

    function setStyle(id, prop, value) {
        const el = $(id);
        if (!el) return;
        el.style[prop] = value;
    }

    function getSignalKeyFromChip(btn) {
        return (btn && btn.getAttribute("data-signal")) || "";
    }

    function getDefaultSignalKey() {
        // Prefer whatever chip is marked active in HTML
        const active = document.querySelector(".hudChip.isActive");
        const key = getSignalKeyFromChip(active);
        if (key && METRICS[key]) return key;

        // Otherwise fall back to first chip, else "water"
        const first = document.querySelector(".hudChip");
        const firstKey = getSignalKeyFromChip(first);
        if (firstKey && METRICS[firstKey]) return firstKey;

        return METRICS.water ? "water" : Object.keys(METRICS)[0];
    }

    function setActiveChip(signalKey) {
        const chips = document.querySelectorAll(".hudChip");
        chips.forEach((chip) => {
            const isMatch = getSignalKeyFromChip(chip) === signalKey;
            chip.classList.toggle("isActive", isMatch);
        });
    }

    function setHudSubtitle(signalKey) {
        const subtitle = METRICS?.[signalKey]?.subtitle || "";
        setText("hudSubTitle", subtitle);
    }

    function setMetricUI(signalKey, metricId) {
        const metric = METRICS?.[signalKey]?.metrics?.[metricId];
        if (!metric) return;

        setText("metricName", metric.name);
        setText("metricUnits", metric.units);
        setText("metricBaseline", metric.baseline);
        setText("metricSource", metric.source);

        setHTML("metricCompare", `Mode: <span class="mono">${metric.mode}</span>`);

        // Legend
        const legend = metric.legend || {};

        setText("legendLabel", legend.label);
        setText("legendMin", legend.min);
        setText("legendMid", legend.mid);
        setText("legendMax", legend.max);

        setText("legendMinLabel", legend.minLabel);
        setText("legendMidLabel", legend.midLabel);
        setText("legendMaxLabel", legend.maxLabel);

        if (legend.gradientCss) {
            setStyle("legendGradient", "background", legend.gradientCss);
        }
    }

    function setSignalUI(signalKey) {
        if (!signalKey || !METRICS[signalKey]) return;
        console.log("[PP:UI] setSignalUI()", {
            signalKey,
            hasMetrics: !!window.PP_METRICS,
            hasTintFn: typeof window.ppTintStage === "function",
        });
        
        setActiveChip(signalKey);
        setHudSubtitle(signalKey);

        const defaultMetricId = METRICS?.[signalKey]?.defaultMetricId;
        if (defaultMetricId) {
            setMetricUI(signalKey, defaultMetricId);
        }
        if (typeof window.ppTintStage === "function") {
            console.log("[PP:UI] calling ppTintStage()", signalKey);
            window.ppTintStage(signalKey);
        } else {
            console.warn("[PP:UI] ppTintStage missing (cesium-init.js not loaded or errored)");
        }

        

    }

    function wireSignalChips() {
        const chips = document.querySelectorAll(".hudChip");

        chips.forEach((btn) => {
            btn.addEventListener("click", () => {
                const key = getSignalKeyFromChip(btn);
                if (!key || !METRICS[key]) return;

                setSignalUI(key);

                // Later: call layer switching here (Cesium imagery/layers)
                // setActiveLayer(key, METRICS[key].defaultMetricId);
            });
        });
    }

    // ---- Init once DOM exists ----
    function init() {
        wireSignalChips();

        const initialKey = getDefaultSignalKey();
        setSignalUI(initialKey);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

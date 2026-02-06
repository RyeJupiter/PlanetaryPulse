const subtitleBySignal = {
    water: "Hydrologic Function",
    energy: "Thermal & Radiative Function",
    vegetation: "Vegetation Function",
};

function setMetricUI(signalKey, metricId) {
    const metric = METRICS?.[signalKey]?.metrics?.[metricId];
    if (!metric) return;

    document.getElementById("metricName").textContent = metric.name;
    document.getElementById("metricUnits").textContent = metric.units;
    document.getElementById("metricBaseline").textContent = metric.baseline;
    document.getElementById("metricSource").textContent = metric.source;
    document.getElementById("metricCompare").innerHTML =
        `Mode: <span class="mono">${metric.mode}</span>`;

    document.getElementById("legendLabel").textContent = metric.legend.label;
    document.getElementById("legendMin").textContent = metric.legend.min;
    document.getElementById("legendMid").textContent = metric.legend.mid;
    document.getElementById("legendMax").textContent = metric.legend.max;

    document.getElementById("legendMinLabel").textContent = metric.legend.minLabel;
    document.getElementById("legendMidLabel").textContent = metric.legend.midLabel;
    document.getElementById("legendMaxLabel").textContent = metric.legend.maxLabel;

    const grad = document.getElementById("legendGradient");
    grad.style.background = metric.legend.gradientCss;
}

function setSignalUI(signalKey) {
    const subtitleEl = document.getElementById("hudSubTitle");
    subtitleEl.textContent = subtitleBySignal[signalKey] || "";

    const defaultMetricId = METRICS?.[signalKey]?.defaultMetricId;
    if (defaultMetricId) {
        setMetricUI(signalKey, defaultMetricId);
    }
}

function setActiveChip(signalKey) {
    const chips = document.querySelectorAll(".hudChip");

    chips.forEach((chip) => {
        const isMatch = chip.getAttribute("data-signal") === signalKey;
        chip.classList.toggle("isActive", isMatch);
    });
}

function wireSignalChips() {
    const chips = document.querySelectorAll(".hudChip");

    chips.forEach((btn) => {
        btn.addEventListener("click", () => {
            const key = btn.getAttribute("data-signal");
            if (!key) return;

            setActiveChip(key);
            setSignalUI(key);
        });
    });
}

// ---- Initialize once on page load ----
(function initHUD() {
    const initialKey = "water";

    wireSignalChips();
    setActiveChip(initialKey);
    setSignalUI(initialKey);
})();

/* metrics-config.js */

const METRICS = {
    water: {
        label: "Water",
        subtitle: "Hydrologic Function",
        defaultMetricId: "runoff",
        metrics: {
            runoff: {
                name: "Runoff",
                units: "mm/day",
                baseline: "2001–2020",
                source: "TBD",
                mode: "Δ vs baseline",
                legend: {
                    label: "Drier → Typical → Wetter",
                    min: "-20",
                    mid: "0",
                    max: "+20",
                    minLabel: "Low",
                    midLabel: "Typical",
                    maxLabel: "High",
                    gradientCss:
                        "linear-gradient(90deg, rgba(80,140,255,0.20), rgba(230,237,243,0.30), rgba(80,140,255,0.95))",
                },
            },
        },
    },

    energy: {
        label: "Energy",
        subtitle: "Thermal & Radiative Function",
        defaultMetricId: "lst_anom",
        metrics: {
            lst_anom: {
                name: "Thermal Function (LST Anomaly)",
                units: "°C",
                baseline: "2001–2020",
                source: "TBD",
                mode: "Δ vs baseline",
                legend: {
                    label: "Cooling → Neutral → Heating",
                    min: "-3",
                    mid: "0",
                    max: "+3",
                    minLabel: "Cooler",
                    midLabel: "Neutral",
                    maxLabel: "Hotter",
                    gradientCss:
                        "linear-gradient(90deg, rgba(80,180,255,0.85), rgba(230,237,243,0.25), rgba(255,120,120,0.95))",
                },
            },
        },
    },

    vegetation: {
        label: "Vegetation",
        subtitle: "Vegetation Function",
        defaultMetricId: "ndvi",
        metrics: {
            ndvi: {
                name: "Vegetation Function (NDVI)",
                units: "index (0–1)",
                baseline: "2001–2020",
                source: "TBD",
                mode: "Δ vs baseline",
                legend: {
                    label: "Degraded → Typical → Regenerating",
                    min: "-0.20",
                    mid: "0.00",
                    max: "+0.20",
                    minLabel: "Low",
                    midLabel: "Typical",
                    maxLabel: "High",
                    gradientCss:
                        "linear-gradient(90deg, rgba(200,120,80,0.90), rgba(230,237,243,0.25), rgba(120,255,170,0.95))",
                },
            },
        },
    },
};

// Expose globally (simple, no bundler)
window.PP_METRICS = METRICS;

/* global Cesium */

(function initCesiumGlobe() {
  const el = document.getElementById("globe");
  if (!el || typeof Cesium === "undefined") return; // page doesn't include globe

  const viewer = new Cesium.Viewer("globe", {
    animation: false,
    timeline: false,
    fullscreenButton: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    geocoder: false,
    baseLayerPicker: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    // If you later optimize, you can enable requestRenderMode,
    // but keep it off while you're iterating:
    // requestRenderMode: true,
  });

  // Remove default imagery
  viewer.imageryLayers.removeAll(true);

  // Esri World Imagery
  const esriWorldImagery = new Cesium.UrlTemplateImageryProvider({
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    credit: "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maximumLevel: 19,
  });
  viewer.imageryLayers.addImageryProvider(esriWorldImagery);

  // Visual cleanup
  viewer.scene.skyBox = undefined;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#070B12");
  viewer.scene.globe.enableLighting = false;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-30, 20, 22000000),
  });

  const ro = new ResizeObserver(() => viewer.resize());
  ro.observe(el);

  const signalOverlay = document.createElement("div");
  signalOverlay.className = "globeTint";
  const globeWrap = el.closest(".globeWrap");
  if (globeWrap) globeWrap.appendChild(signalOverlay);

  const signalMap = {
    none: { color: "transparent", opacity: 0 },
    hydrology: { color: "rgba(88, 156, 255, 1)", opacity: 0.45 },
    vegetation: { color: "rgba(94, 210, 110, 1)", opacity: 0.45 },
    thermal: { color: "rgba(255, 120, 88, 1)", opacity: 0.45 },
    albedo: { color: "rgba(220, 220, 255, 1)", opacity: 0.35 },
    aerosols: { color: "rgba(170, 150, 210, 1)", opacity: 0.35 },
    resilience: { color: "rgba(120, 210, 200, 1)", opacity: 0.45 },
  };

  function applySignal(name) {
    const config = signalMap[name] || signalMap.none;
    signalOverlay.style.background = config.color;
    signalOverlay.style.opacity = config.opacity;
  }

  // Debug handle
  window.__pp_viewer = viewer;
  window.__pp_applySignal = applySignal;
})();

/* global Cesium */

(function initCesiumGlobe() {
  const el = document.getElementById("globe");
  if (!el) return; // page doesn't include globe

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

  // Debug handle
  window.__pp_viewer = viewer;
})();

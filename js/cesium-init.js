/* global Cesium */

(function initCesiumGlobe() {
  const el = document.getElementById("globe");
  if (!el) return;

  // Build the viewer with minimal defaults (we will explicitly set imagery)
  const viewer = new Cesium.Viewer("globe", {
    animation: false,
    timeline: false,
    fullscreenButton: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    geocoder: false,
    baseLayerPicker: false,

    // Avoid ion terrain
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  });

  // IMPORTANT: remove whatever default imagery Cesium attached
  viewer.imageryLayers.removeAll(true);

  // Add OpenStreetMap imagery explicitly
  const osmProvider = new Cesium.UrlTemplateImageryProvider({
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    credit: "© OpenStreetMap contributors",
    maximumLevel: 19,
  });

  viewer.imageryLayers.addImageryProvider(osmProvider);

  // Visual cleanup
  viewer.scene.skyBox = undefined;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#070B12");
  viewer.scene.globe.enableLighting = true;

  // Start position
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-30, 20, 22000000),
  });

  // Responsive resize
  const ro = new ResizeObserver(() => viewer.resize());
  ro.observe(el);

  window.__pp_viewer = viewer;
})();

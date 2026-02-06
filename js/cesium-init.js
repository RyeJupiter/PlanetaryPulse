/* global Cesium */

(function initCesiumGlobe() {
  const el = document.getElementById("globe");
  if (!el) return;

  // Use OSM tiles so this works without a Cesium ion token.
  const imageryProvider = new Cesium.UrlTemplateImageryProvider({
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    credit: "© OpenStreetMap contributors",
    maximumLevel: 19,
  });

  const viewer = new Cesium.Viewer("globe", {
    animation: false,
    timeline: false,
    fullscreenButton: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    geocoder: false,
    baseLayerPicker: false,

    imageryProvider,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  });

  // Make it feel cleaner / more “product”.
  viewer.scene.skyBox = undefined;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#070B12");

  // Ensure globe is interactive and not “spinning into space”.
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;

  // Start on a global-ish view (tweak later).
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-30, 20, 22000000),
  });

  // Resize safety (especially with responsive layouts).
  const ro = new ResizeObserver(() => viewer.resize());
  ro.observe(el);

  window.__pp_viewer = viewer;
})();

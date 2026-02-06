/* global Cesium */

(function initCesiumGlobe() {
  const el = document.getElementById("globe");
  if (!el) return;

  // Basic Viewer, no Ion assets required.
  const viewer = new Cesium.Viewer("globe", {
    animation: false,
    timeline: false,
    fullscreenButton: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    geocoder: false,
    baseLayerPicker: false,

    // Avoid Ion defaults; we provide our own imagery.
    imageryProvider: new Cesium.UrlTemplateImageryProvider({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      credit: "© OpenStreetMap contributors",
      maximumLevel: 19,
    }),

    // Keep terrain off for now (terrain often triggers Ion usage).
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  });

  // Clean look: no skybox, subtle background.
  viewer.scene.skyBox = undefined;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#070B12");

  // Default camera: nice global view.
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-122.0, 36.9, 25000000.0),
    duration: 0.0,
  });

  // Make it responsive when the layout changes.
  const ro = new ResizeObserver(() => viewer.resize());
  ro.observe(el);

  // Expose for debugging in console.
  window.__pp_viewer = viewer;
})();

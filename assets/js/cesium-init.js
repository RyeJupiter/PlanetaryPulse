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

  const signalStage = new Cesium.PostProcessStage({
    fragmentShader: [
      "uniform sampler2D colorTexture;",
      "uniform vec3 tint;",
      "uniform float strength;",
      "varying vec2 v_textureCoordinates;",
      "void main() {",
      "  vec4 color = texture2D(colorTexture, v_textureCoordinates);",
      "  vec3 graded = mix(color.rgb, color.rgb * tint, strength);",
      "  gl_FragColor = vec4(graded, color.a);",
      "}",
    ].join("\n"),
    uniforms: {
      tint: new Cesium.Cartesian3(1.0, 1.0, 1.0),
      strength: 0.0,
    },
  });
  viewer.scene.postProcessStages.add(signalStage);

  const signalMap = {
    none: { tint: [1.0, 1.0, 1.0], strength: 0.0 },
    hydrology: { tint: [0.55, 0.8, 1.6], strength: 0.55 },
    vegetation: { tint: [0.55, 1.4, 0.7], strength: 0.55 },
    thermal: { tint: [1.4, 0.7, 0.55], strength: 0.55 },
    albedo: { tint: [1.25, 1.25, 1.35], strength: 0.5 },
    aerosols: { tint: [0.85, 0.8, 1.25], strength: 0.5 },
    resilience: { tint: [0.7, 1.25, 1.15], strength: 0.55 },
  };

  function applySignal(name) {
    const config = signalMap[name] || signalMap.none;
    signalStage.uniforms.tint = new Cesium.Cartesian3(
      config.tint[0],
      config.tint[1],
      config.tint[2]
    );
    signalStage.uniforms.strength = config.strength;
    viewer.scene.requestRender();
  }

  // Debug handle
  window.__pp_viewer = viewer;
  window.__pp_applySignal = applySignal;
})();

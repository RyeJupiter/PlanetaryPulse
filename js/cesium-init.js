/* global Cesium */

(function initCesiumGlobe() {
  const el = document.getElementById("globe");
  if (!el) return;

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
  });

  // Remove default imagery
  viewer.imageryLayers.removeAll(true);

  // Satellite imagery (Esri World Imagery)
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

  window.__pp_viewer = viewer;

  // --- Post-process: Tint + Contrast + Saturation ---
  const ppTintStage = new Cesium.PostProcessStage({
  name: "PP_Tint",
  fragmentShader: `
    precision highp float;

    uniform sampler2D colorTexture;
    uniform vec3 u_tint;        // (1,1,1)=no tint
    uniform float u_strength;   // 0..1

    in vec2 v_textureCoordinates; // injected by Cesium

    void main() {
      vec4 src = texture(colorTexture, v_textureCoordinates);
      vec3 tinted = src.rgb * u_tint;
      vec3 outRgb = mix(src.rgb, tinted, clamp(u_strength, 0.0, 1.0));
      out_FragColor = vec4(outRgb, src.a); // injected by Cesium
    }
  `,
  uniforms: {
    u_tint: new Cesium.Cartesian3(1.0, 1.0, 1.0),
    u_strength: 0.0,
  },
});

viewer.scene.postProcessStages.enabled = true;
viewer.scene.postProcessStages.add(ppTintStage);


  function setSignalTint(signalKey) {
    const tints = {
      water:      { r:  80, g: 140, b: 255, a: 0.22 },
      energy:     { r: 255, g:  90, b:  90, a: 0.18 },
      vegetation: { r: 120, g: 255, b: 170, a: 0.18 },
      none:       { r: 255, g: 255, b: 255, a: 0.0  },
    };

    const t = tints[signalKey] || tints.none;

    ppTintStage.uniforms.u_tint = new Cesium.Cartesian3(
      t.r / 255,
      t.g / 255,
      t.b / 255
    );
    ppTintStage.uniforms.u_strength = t.a;
    viewer.scene.requestRender();
  }

  window.PP_setSignalTint = setSignalTint;

  // Default tint
  window.PP_setSignalTint("water");
})();

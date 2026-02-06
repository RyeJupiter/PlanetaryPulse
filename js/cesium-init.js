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

    // Kill night-side shading
    viewer.scene.globe.enableLighting = false;

    // Optional: cleaner “product” look
    // viewer.scene.skyAtmosphere.show = false;
    // viewer.scene.globe.showGroundAtmosphere = false;

    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-30, 20, 22000000),
    });

    const ro = new ResizeObserver(() => viewer.resize());
    ro.observe(el);

    window.__pp_viewer = viewer;

    function makeSolidTileDataUrl(r, g, b) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d");
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, 1, 1);
    return c.toDataURL("image/png");
}

// --- Post-process tint stage (global) ---
const tintStage = new Cesium.PostProcessStage({
  name: "PP_Tint",
  fragmentShader: `
    uniform sampler2D colorTexture;
    uniform vec3 u_tint;
    uniform float u_strength; // 0..1
    varying vec2 v_textureCoordinates;

    void main() {
      vec4 color = texture2D(colorTexture, v_textureCoordinates);

      // Multiply tint (keeps blacks black; brightens by tint color)
      vec3 tinted = color.rgb * u_tint;

      // Blend between original and tinted
      vec3 outRgb = mix(color.rgb, tinted, u_strength);

      gl_FragColor = vec4(outRgb, color.a);
    }
  `,
  uniforms: {
    u_tint: new Cesium.Cartesian3(1.0, 1.0, 1.0), // default no tint
    u_strength: 0.0,
  },
});

viewer.scene.postProcessStages.add(tintStage);


function setSignalTint(signalKey) {
  const tints = {
    water:      { r: 80,  g: 140, b: 255, a: 0.22 },
    energy:     { r: 255, g: 90,  b: 90,  a: 0.18 },
    vegetation: { r: 120, g: 255, b: 170, a: 0.18 },
    none:       { r: 255, g: 255, b: 255, a: 0.0 }, // identity tint
  };

  const t = tints[signalKey] || tints.none;

  // Convert 0..255 -> 0..1. Use 1,1,1 as "no tint".
  tintStage.uniforms.u_tint = new Cesium.Cartesian3(t.r / 255, t.g / 255, t.b / 255);
  tintStage.uniforms.u_strength = t.a;

  // If you're in requestRenderMode, force a frame
  viewer.scene.requestRender();
}


// Expose to UI script
window.PP_setSignalTint = setSignalTint;

// Optional: set a default tint right away so you can visually confirm it works
window.PP_setSignalTint("water");


})();

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
  const ppGradeStage = new Cesium.PostProcessStage({
    name: "PP_Grade",
    fragmentShader: `
      uniform sampler2D colorTexture;

      uniform vec3  u_tint;       // 0..1, (1,1,1)=no tint
      uniform float u_strength;   // 0..1
      uniform float u_contrast;   // 1=no change
      uniform float u_saturation; // 1=no change

      varying vec2 v_textureCoordinates;

      vec3 applyContrast(vec3 c, float contrast) {
        return (c - 0.5) * contrast + 0.5;
      }

      vec3 applySaturation(vec3 c, float sat) {
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        return mix(vec3(l), c, sat);
      }

      void main() {
        vec4 src = texture2D(colorTexture, v_textureCoordinates);
        vec3 rgb = src.rgb;

        // "colored glass" tint: multiply then blend
        vec3 tinted = rgb * u_tint;
        rgb = mix(rgb, tinted, clamp(u_strength, 0.0, 1.0));

        // grade
        rgb = applyContrast(rgb, u_contrast);
        rgb = applySaturation(rgb, u_saturation);
        rgb = clamp(rgb, 0.0, 1.0);

        gl_FragColor = vec4(rgb, src.a);
      }
    `,
    uniforms: {
      u_tint: new Cesium.Cartesian3(1.0, 1.0, 1.0),
      u_strength: 0.0,
      u_contrast: 1.08,
      u_saturation: 1.05,
    },
  });

  viewer.scene.postProcessStages.enabled = true;
  viewer.scene.postProcessStages.add(ppGradeStage);

  function setSignalTint(signalKey) {
    const tints = {
      water:      { r:  80, g: 140, b: 255, a: 0.22 },
      energy:     { r: 255, g:  90, b:  90, a: 0.18 },
      vegetation: { r: 120, g: 255, b: 170, a: 0.18 },
      none:       { r: 255, g: 255, b: 255, a: 0.0  },
    };

    const t = tints[signalKey] || tints.none;

    ppGradeStage.uniforms.u_tint = new Cesium.Cartesian3(
      t.r / 255,
      t.g / 255,
      t.b / 255
    );
    ppGradeStage.uniforms.u_strength = t.a;

    // Optional: flatten grade when "none"
    ppGradeStage.uniforms.u_contrast = (signalKey === "none") ? 1.0 : 1.08;
    ppGradeStage.uniforms.u_saturation = (signalKey === "none") ? 1.0 : 1.05;

    viewer.scene.requestRender();
  }

  window.PP_setSignalTint = setSignalTint;

  // Default tint
  window.PP_setSignalTint("water");
})();

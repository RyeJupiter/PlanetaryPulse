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

let tintLayer = null;

function rebuildTintLayer(r, g, b, alpha) {
    // Remove old tint layer if it exists
    console.log("[PP:CESIUM] rebuildTintLayer()", { r, g, b, alpha });
    if (tintLayer) {
        viewer.imageryLayers.remove(tintLayer, true);
        tintLayer = null;
    }

    // If alpha is 0, don't add anything
    if (!alpha || alpha <= 0) {
        return;
    }

    const provider = new Cesium.SingleTileImageryProvider({
        url: makeSolidTileDataUrl(r, g, b),
        rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
    });

    tintLayer = viewer.imageryLayers.addImageryProvider(provider);
    tintLayer.alpha = alpha; // Cesium uses alpha for transparency, so invert it
    tintLayer.show = true;

    // Ensure tint is on top
    viewer.imageryLayers.raiseToTop(tintLayer);
    viewer.scene.requestRender();

}

function setSignalTint(signalKey) {
    console.log("[PP:CESIUM] setSignalTint()", signalKey);
    const tints = {
        water: { r: 80, g: 140, b: 255, a: 0.22 },       // blue
        energy: { r: 255, g: 90, b: 90, a: 0.18 },       // red
        vegetation: { r: 120, g: 255, b: 170, a: 0.18 }, // green
        none: { r: 0, g: 0, b: 0, a: 0.0 },
    };

    const t = tints[signalKey] || tints.none;
    rebuildTintLayer(t.r, t.g, t.b, t.a);
}

// Expose to UI script
window.PP_setSignalTint = setSignalTint;

// Optional: set a default tint right away so you can visually confirm it works
window.PP_setSignalTint("water");


})();

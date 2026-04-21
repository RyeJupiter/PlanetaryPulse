/* global Cesium */

// First-visit welcome experience.
// Runs once (tracked via localStorage), narrates EarthPulse, and flies the
// homepage globe from its resting view to the Al-Baydha Project in Saudi
// Arabia — then auto-selects that project in the registry.
(function initWelcome() {
  const STORAGE_KEY = "earthpulse:welcomed-v1";
  const DEBUG_PARAM = "welcome";

  const params = new URLSearchParams(window.location.search);
  const forceShow = params.get(DEBUG_PARAM) === "1" || params.get(DEBUG_PARAM) === "force";
  const forceSkip = params.get(DEBUG_PARAM) === "skip";

  if (forceSkip) return;
  if (!forceShow && hasSeenWelcome()) return;

  const overlay = buildOverlay();
  document.body.appendChild(overlay);

  // Lock scroll while welcome is showing.
  document.documentElement.classList.add("welcomeLock");

  requestAnimationFrame(() => overlay.classList.add("welcomeOverlayVisible"));

  const panel = overlay.querySelector(".welcomePanel");
  const skipBtn = overlay.querySelector(".welcomeSkip");
  const ctaBtn = overlay.querySelector(".welcomeCta");
  const progress = overlay.querySelector(".welcomeProgress");

  const copyNodes = Array.from(overlay.querySelectorAll("[data-welcome-step]"));
  let cancelled = false;

  skipBtn.addEventListener("click", () => {
    cancelled = true;
    dismiss(/*markSeen*/ true);
  });

  ctaBtn.addEventListener("click", () => {
    cancelled = true;
    dismiss(/*markSeen*/ true);
  });

  runSequence().catch((err) => {
    console.warn("[Welcome] sequence error:", err);
    dismiss(true);
  });

  async function runSequence() {
    await waitMs(350);
    for (let i = 0; i < copyNodes.length; i += 1) {
      if (cancelled) return;
      copyNodes[i].classList.add("welcomeStepVisible");
      progress.style.width = `${((i + 1) / copyNodes.length) * 100}%`;
      await waitMs(i === 0 ? 1400 : 2200);
    }

    if (cancelled) return;

    // Start the globe fly-to in parallel with the third-phase copy already on screen.
    panel.classList.add("welcomePanelCollapsed");

    const selected = await flyToAlBaydha();
    if (cancelled) return;

    // Reveal the CTA once we've arrived.
    ctaBtn.classList.add("welcomeCtaVisible");
    ctaBtn.textContent = selected ? "Explore Al-Baydha →" : "Enter EarthPulse →";
  }

  function dismiss(markSeen) {
    overlay.classList.remove("welcomeOverlayVisible");
    overlay.classList.add("welcomeOverlayFading");
    document.documentElement.classList.remove("welcomeLock");
    setTimeout(() => overlay.remove(), 600);
    if (markSeen) {
      try {
        localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      } catch (err) {
        /* ignore storage denials (e.g. private mode) */
      }
    }
  }

  function hasSeenWelcome() {
    try {
      return Boolean(localStorage.getItem(STORAGE_KEY));
    } catch (err) {
      return false;
    }
  }

  async function flyToAlBaydha() {
    const viewer = await waitForViewer();
    if (!viewer) return false;

    try {
      await new Promise((resolve) => {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(41.02, 19.82, 180000),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-55),
            roll: 0,
          },
          duration: 5.5,
          easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
          complete: () => resolve(),
          cancel: () => resolve(),
        });
      });
    } catch (err) {
      console.warn("[Welcome] flyTo failed:", err);
      return false;
    }

    return await selectAlBaydha();
  }

  async function selectAlBaydha() {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      if (typeof window.__pp_selectEntityById === "function") {
        try {
          return Boolean(window.__pp_selectEntityById("alb-001"));
        } catch (err) {
          console.warn("[Welcome] selectEntityById error:", err);
          return false;
        }
      }
      await waitMs(120);
    }
    return false;
  }

  async function waitForViewer() {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (window.__pp_viewer && window.__pp_viewer.camera) return window.__pp_viewer;
      await waitMs(120);
    }
    return null;
  }

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function buildOverlay() {
    const el = document.createElement("div");
    el.className = "welcomeOverlay";
    el.innerHTML = `
      <div class="welcomeBackdrop"></div>
      <div class="welcomePanel" role="dialog" aria-labelledby="welcome-title">
        <div class="welcomeHeader">
          <span class="welcomeEyebrow">Planetary Regeneration Interface</span>
          <button type="button" class="welcomeSkip" aria-label="Skip introduction">Skip</button>
        </div>

        <div class="welcomeBody">
          <h1 id="welcome-title" class="welcomeTitle" data-welcome-step="1">
            Welcome to EarthPulse
          </h1>

          <p class="welcomeSubtitle" data-welcome-step="2">
            A data visualization platform to understand planetary regeneration.
          </p>

          <p class="welcomeCopy" data-welcome-step="3">
            We uplift a network of regeneration projects that span the globe. To introduce you,
            we'll take you to <strong>Saudi Arabia</strong>, where <strong>Neal Spackman</strong> and
            the people of <strong>Al-Baydha</strong> transformed a degraded desert wasteland into a
            thriving savannah.
          </p>
        </div>

        <div class="welcomeFooter">
          <div class="welcomeProgressTrack">
            <div class="welcomeProgress"></div>
          </div>
          <button type="button" class="welcomeCta">Explore Al-Baydha →</button>
        </div>
      </div>
    `;
    return el;
  }
})();

/* global document */

(function initNav() {
  const navRoot = document.getElementById("site-nav");
  if (!navRoot) return;

  const page = document.body.getAttribute("data-page") || "";
  const links = [
    { href: "index.html", label: "Home", key: "home" },
    { href: "explore.html", label: "Explore", key: "explore" },
    { href: "regen-registry.html", label: "Regen Registry", key: "atlas" },
    { href: "signals.html", label: "Earth Metrics", key: "signals" },
    { href: "blog.html", label: "Blog", key: "blog" },
    { href: "future-plans.html", label: "Future Plans", key: "future-plans" },
    { href: "why.html", label: "Why", key: "why" },
    { href: "about.html", label: "About", key: "about" },
    { href: "contact.html", label: "Contact", key: "contact" },
  ];

  navRoot.innerHTML = `
    <header class="nav">
      <div class="brand">Planetary Pulse</div>
      <nav class="links">
        ${links
          .map(
            (link) =>
              `<a href="${link.href}"${page === link.key ? ' class="active"' : ""}>${link.label}</a>`
          )
          .join("")}
      </nav>
    </header>
  `;

  if (!document.querySelector(".pageBg")) {
    const bg = document.createElement("div");
    bg.className = "pageBg";
    document.body.prepend(bg);
  }
  const backgroundChoices = [1, 2, 3, 4];
  const pick = backgroundChoices[Math.floor(Math.random() * backgroundChoices.length)];
  document.body.style.setProperty(
    "--page-bg",
    `url("public/media/backgrounds/background-${pick}.png"), url("media/backgrounds/background-${pick}.png")`
  );

  if (!document.querySelector(".satelliteRail")) {
    const railRight = document.createElement("div");
    railRight.className = "satelliteRail right";
    railRight.innerHTML = `
      <div class="satelliteCard">
        <img src="public/media/satellites/aqua.png" alt="NASA Aqua satellite" />
        <div class="satelliteLabel">Aqua (NASA)</div>
      </div>
      <div class="satelliteCard">
        <img src="public/media/satellites/terra.png" alt="NASA Terra satellite" />
        <div class="satelliteLabel">Terra (NASA)</div>
      </div>
      <div class="satelliteCard">
        <img src="public/media/satellites/suomi-npp.png" alt="Suomi NPP satellite" />
        <div class="satelliteLabel">Suomi NPP</div>
      </div>
    `;
    const railLeft = document.createElement("div");
    railLeft.className = "satelliteRail left";
    railLeft.innerHTML = `
      <div class="satelliteCard">
        <img src="public/media/satellites/terra.png" alt="NASA Terra satellite" />
        <div class="satelliteLabel">Terra (NASA)</div>
      </div>
      <div class="satelliteCard">
        <img src="public/media/satellites/aqua.png" alt="NASA Aqua satellite" />
        <div class="satelliteLabel">Aqua (NASA)</div>
      </div>
      <div class="satelliteCard">
        <img src="public/media/satellites/suomi-npp.png" alt="Suomi NPP satellite" />
        <div class="satelliteLabel">Suomi NPP</div>
      </div>
    `;
    document.body.appendChild(railLeft);
    document.body.appendChild(railRight);
  }
})();

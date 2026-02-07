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

  if (!document.querySelector(".satelliteRail")) {
    const rail = document.createElement("div");
    rail.className = "satelliteRail";
    rail.innerHTML = `
      <div class="satelliteCard">
        <img src="media/satellites/aqua.png" alt="NASA Aqua satellite" />
        <div class="satelliteLabel">Aqua (NASA)</div>
      </div>
      <div class="satelliteCard">
        <img src="media/satellites/terra.png" alt="NASA Terra satellite" />
        <div class="satelliteLabel">Terra (NASA)</div>
      </div>
      <div class="satelliteCard">
        <img src="media/satellites/suomi-npp.png" alt="Suomi NPP satellite" />
        <div class="satelliteLabel">Suomi NPP</div>
      </div>
    `;
    document.body.appendChild(rail);
  }
})();

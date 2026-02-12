/* global document */

(function initNav() {
  const navRoot = document.getElementById("site-nav");
  if (!navRoot) return;

  const page = document.body.getAttribute("data-page") || "";
  const links = [
    { href: "/index.html", label: "Home", key: "home" },
    { href: "/explore.html", label: "Explore", key: "explore" },
    { href: "/regen-registry.html", label: "Regen Registry", key: "atlas" },
    { href: "/signals.html", label: "Earth Metrics", key: "signals" },
    { href: "/blog.html", label: "Field Notes", key: "blog" },
    { href: "/future-plans.html", label: "Plans & Vibes", key: "future-plans" },
    { href: "/why.html", label: "Why", key: "why" },
    { href: "/about.html", label: "About", key: "about" },
    { href: "/contact.html", label: "Contact", key: "contact" },
  ];

  navRoot.innerHTML = `
    <header class="nav">
      <div class="brand">EarthPulse</div>
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

  let bg = document.querySelector(".pageBg");
  if (!bg) {
    bg = document.createElement("div");
    bg.className = "pageBg";
    document.body.prepend(bg);
  }
  const backgroundChoices = [1, 2, 3, 4];
  const pick = backgroundChoices[Math.floor(Math.random() * backgroundChoices.length)];
  const bgValue = `url("/public/media/backgrounds/background-${pick}.png"), url("public/media/backgrounds/background-${pick}.png"), url("media/backgrounds/background-${pick}.png"), radial-gradient(circle at 30% 25%, rgba(50, 84, 130, 0.35), rgba(5, 10, 20, 0.95) 65%)`;
  document.body.style.setProperty("--page-bg", bgValue);
  bg.style.backgroundImage = bgValue;

  const footer = document.querySelector(".footer");
  if (footer && !footer.querySelector(".footerProjectsLink")) {
    const projectsLink = document.createElement("a");
    projectsLink.className = "footerProjectsLink";
    projectsLink.href = "/everything/index.html";
    projectsLink.textContent = "Explore Rye's Other Projects";
    footer.appendChild(projectsLink);
  }
})();

/* global document, fetch */

(function initEcologyCards() {
  const grid = document.getElementById("ecology-grid");
  if (!grid) return;

  const pageTitleBySpecies = {
    "Monarch Butterfly": "Monarch butterfly",
    "Western Scrub-Jay": "California scrub jay",
    "Brown Pelican": "Brown pelican",
    Cormorant: "Double-crested cormorant",
    "California Poppy": "Eschscholzia californica",
    "Coast Live Oak": "Quercus agrifolia",
    "Coastal Sagebrush": "Artemisia californica",
    "Sea Otter": "Sea otter",
    "Giant Kelp": "Macrocystis pyrifera",
  };

  const noImageSvg =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23070a12'/%3E%3Ctext x='50%25' y='50%25' fill='%239fb4ce' font-size='28' text-anchor='middle' dominant-baseline='middle' font-family='Arial,sans-serif'%3EImage unavailable%3C/text%3E%3C/svg%3E";

  const imageCache = new Map();

  const categoryNames = {
    insects: "Insects",
    birds: "Birds",
    plants: "Plants",
    marine_life: "Marine Life",
  };

  const categoryOrder = ["insects", "birds", "plants", "marine_life"];

  function getWikiImageForSpecies(species) {
    const key = species.common_name;
    if (imageCache.has(key)) {
      return Promise.resolve(imageCache.get(key));
    }

    const pageTitle = pageTitleBySpecies[species.common_name] || species.scientific_name || species.common_name;
    const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;

    return fetch(endpoint)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const image =
          (data && data.thumbnail && data.thumbnail.source) ||
          (data && data.originalimage && data.originalimage.source) ||
          noImageSvg;
        imageCache.set(key, image);
        return image;
      })
      .catch(() => {
        imageCache.set(key, noImageSvg);
        return noImageSvg;
      });
  }

  const renderCard = (species, categoryLabel) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "speciesCard";
    card.setAttribute("aria-label", `${species.common_name} details`);

    card.innerHTML = `
      <div class="speciesCardInner">
        <div class="speciesFace front">
          <img class="speciesImage" src="${noImageSvg}" alt="${species.common_name}" loading="lazy" />
          <div class="speciesBody">
            <p class="chip">${categoryLabel}</p>
            <h3 class="speciesTitle">${species.common_name}</h3>
            <p class="speciesScientific">${species.scientific_name}</p>
            <p class="speciesFlipHint">Click to flip and learn more</p>
          </div>
        </div>
        <div class="speciesFace back">
          <h3 class="speciesTitle">${species.common_name}</h3>
          <p class="speciesScientific">${species.scientific_name}</p>
          <div class="speciesMeta">
            <p class="speciesMetaRow"><b>Status:</b> ${species.status}</p>
            <p class="speciesMetaRow"><b>Role:</b> ${species.role}</p>
          </div>
          <p class="muted">${species.notes}</p>
          <p class="speciesFlipHint">Click again to return</p>
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      card.classList.toggle("isFlipped");
    });

    const imageEl = card.querySelector(".speciesImage");
    if (imageEl) {
      imageEl.addEventListener("error", () => {
        imageEl.src = noImageSvg;
      });
      getWikiImageForSpecies(species).then((imageUrl) => {
        imageEl.src = imageUrl || noImageSvg;
      });
    }

    return card;
  };

  fetch("/assets/data/lighthouse-field-ecology.json")
    .then((res) => res.json())
    .then((data) => {
      const species = data.signature_species || {};
      categoryOrder.forEach((key) => {
        (species[key] || []).forEach((item) => {
          grid.appendChild(renderCard(item, categoryNames[key] || key));
        });
      });

      const summary = document.getElementById("ecology-summary");
      if (summary) {
        summary.textContent = `${data.site.name} | ${data.site.location.city}, ${data.site.location.state} | ${data.site.ecosystem_type.join(" | ")}`;
      }
    })
    .catch(() => {
      grid.innerHTML = "<p class=\"muted\">Could not load ecology data yet.</p>";
    });
})();

/* global document, fetch */

(function initEcologyCards() {
  const grid = document.getElementById("ecology-grid");
  if (!grid) return;

  const imageBySpecies = {
    "Monarch Butterfly": "Monarch Butterfly Danaus plexippus Male 2664px.jpg",
    "Western Scrub-Jay": "Aphelocoma californica cropped.jpg",
    "Brown Pelican": "Brown pelican in flight, Morro Bay.jpg",
    Cormorant: "Double-crested Cormorant.jpg",
    "California Poppy": "Eschscholzia californica 2.jpg",
    "Coast Live Oak": "Quercus agrifolia tree.jpg",
    "Coastal Sagebrush": "Artemisia californica.jpg",
    "Sea Otter": "Sea Otter Cropped.jpg",
    "Giant Kelp": "Macrocystis pyrifera (giant kelp).jpg",
  };

  const noImageSvg =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23070a12'/%3E%3Ctext x='50%25' y='50%25' fill='%239fb4ce' font-size='28' text-anchor='middle' dominant-baseline='middle' font-family='Arial,sans-serif'%3EImage unavailable%3C/text%3E%3C/svg%3E";

  const toWikiFilePath = (fileName) =>
    `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=900`;

  const categoryNames = {
    insects: "Insects",
    birds: "Birds",
    plants: "Plants",
    marine_life: "Marine Life",
  };

  const categoryOrder = ["insects", "birds", "plants", "marine_life"];

  const renderCard = (species, categoryLabel) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "speciesCard";
    card.setAttribute("aria-label", `${species.common_name} details`);

    const imageName = imageBySpecies[species.common_name];
    const image = imageName ? toWikiFilePath(imageName) : noImageSvg;

    card.innerHTML = `
      <div class="speciesCardInner">
        <div class="speciesFace front">
          <img class="speciesImage" src="${image}" alt="${species.common_name}" loading="lazy" />
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

/* global document, fetch */

(function initEcologyCards() {
  const grid = document.getElementById("ecology-grid");
  if (!grid) return;

  const imageBySpecies = {
    "Monarch Butterfly": "https://upload.wikimedia.org/wikipedia/commons/2/2a/Monarch_Butterfly_Danaus_plexippus_Male_2664px.jpg",
    "Western Scrub-Jay": "https://upload.wikimedia.org/wikipedia/commons/e/e4/Aphelocoma_californica_cropped.jpg",
    "Brown Pelican": "https://upload.wikimedia.org/wikipedia/commons/e/e5/Brown_pelican_in_flight%2C_Morro_Bay.jpg",
    Cormorant: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Double-crested_Cormorant.jpg",
    "California Poppy": "https://upload.wikimedia.org/wikipedia/commons/8/8c/Eschscholzia_californica_2.jpg",
    "Coast Live Oak": "https://upload.wikimedia.org/wikipedia/commons/b/b4/Quercus_agrifolia_tree.jpg",
    "Coastal Sagebrush": "https://upload.wikimedia.org/wikipedia/commons/8/8f/Artemisia_californica.jpg",
    "Sea Otter": "https://upload.wikimedia.org/wikipedia/commons/2/28/Sea_Otter_Cropped.jpg",
    "Giant Kelp": "https://upload.wikimedia.org/wikipedia/commons/c/cb/Macrocystis_pyrifera_%28giant_kelp%29.jpg",
  };

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

    const image = imageBySpecies[species.common_name] || "https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg";

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

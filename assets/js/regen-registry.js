/* global Cesium */

(function initRegenRegistry() {
  const filterWrap = document.getElementById("atlas-filters");
  const clearBtn = document.getElementById("clear-filters");
  const searchInput = document.getElementById("atlas-tag-search");
  const searchResultsWrap = document.getElementById("atlas-search-results");
  const detail = document.getElementById("atlas-detail");
  if (!filterWrap || !detail || !searchResultsWrap) return;

  function getViewer() {
    return window.__pp_viewer;
  }

  function setDetail(content) {
    detail.innerHTML = "";
    detail.appendChild(content);
  }

  function getDomainLabel(rawUrl) {
    if (!rawUrl) return "";
    try {
      return new URL(rawUrl).hostname.replace(/^www\./i, "");
    } catch (error) {
      return "";
    }
  }

  function buildDetail(entity) {
    const wrapper = document.createElement("div");
    wrapper.className = "detailCard";

    const title = document.createElement("div");
    title.className = "detailTitle";
    title.textContent = entity.name || "Project";
    wrapper.appendChild(title);

    if (entity._pp_images && entity._pp_images.length) {
      const grid = document.createElement("div");
      grid.className = "imageGrid";
      entity._pp_images.slice(0, 3).forEach((item) => {
        const card = document.createElement("div");
        card.className = "imageCard";

        const img = document.createElement("img");
        img.src = item.url;
        img.alt = item.alt || `${entity.name} landscape`;
        img.loading = "lazy";
        card.appendChild(img);

        if (item.credit || item.source) {
          const caption = document.createElement("div");
          caption.className = "imageCaption";
          if (item.credit) {
            caption.appendChild(document.createTextNode(item.credit));
            if (item.source) caption.appendChild(document.createTextNode(" - "));
          }
          if (item.source) {
            const link = document.createElement("a");
            link.className = "link";
            link.href = item.source;
            link.target = "_blank";
            link.rel = "noopener";
            link.textContent = "Source";
            caption.appendChild(link);
          }
          card.appendChild(caption);
        }

        grid.appendChild(card);
      });
      wrapper.appendChild(grid);
    }

    const summary = document.createElement("div");
    summary.className = "muted";
    summary.textContent = entity._pp_summary || "No summary provided yet.";
    wrapper.appendChild(summary);

    if (entity._pp_size) {
      const size = document.createElement("div");
      size.className = "muted";
      size.textContent = "Size: " + entity._pp_size;
      wrapper.appendChild(size);
    }

    if (entity._pp_tags && entity._pp_tags.length) {
      const tagWrap = document.createElement("div");
      tagWrap.className = "detailMeta";
      entity._pp_tags.forEach((tag) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = tag;
        tagWrap.appendChild(chip);
      });
      wrapper.appendChild(tagWrap);
    }

    if (entity._pp_links && entity._pp_links.length) {
      const divider = document.createElement("div");
      divider.className = "detailDivider";
      wrapper.appendChild(divider);

      const linkWrap = document.createElement("div");
      linkWrap.className = "detailLinks";
      entity._pp_links.forEach((item) => {
        const link = document.createElement("a");
        link.className = "btn";
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = item.text || item.domain || "Open link";
        linkWrap.appendChild(link);
      });
      wrapper.appendChild(linkWrap);
    }

    return wrapper;
  }

  function updateEmptyDetail() {
    const wrapper = document.createElement("div");
    wrapper.className = "detailCard";
    const title = document.createElement("div");
    title.className = "detailTitle";
    title.textContent = "Project detail";
    const body = document.createElement("div");
    body.className = "muted";
    body.textContent = "Select a project pin or polygon on the globe.";
    wrapper.appendChild(title);
    wrapper.appendChild(body);
    setDetail(wrapper);
  }

  function waitForViewer() {
    const viewer = getViewer();
    if (!viewer) {
      window.setTimeout(waitForViewer, 150);
      return;
    }

    const selected = { entity: null };
    const selectedStyle = {
      pointColor: Cesium.Color.fromCssColorString("#ffffff"),
      polygonOutline: Cesium.Color.fromCssColorString("#7bdcff"),
    };

    fetch("assets/data/projects.geojson")
      .then((response) => response.json())
      .then((geojson) => Cesium.GeoJsonDataSource.load(geojson, { clampToGround: true }))
      .then((dataSource) => {
        viewer.dataSources.add(dataSource);
        viewer.zoomTo(dataSource);

        const entities = dataSource.entities.values;
        const tagCounts = new Map();

        function normalizeImages(value) {
          if (!value) return [];
          if (Array.isArray(value)) return value;
          if (typeof value === "string") {
            try {
              const parsed = JSON.parse(value);
              return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
              return [];
            }
          }
          return [];
        }

        function normalizeLinks(value) {
          const cleaned = [];

          function addLink(urlValue, textValue) {
            const url = String(urlValue || "").trim();
            if (!/^https?:\/\//i.test(url)) return;
            const text = String(textValue || "").trim();
            cleaned.push({
              url,
              text,
              domain: getDomainLabel(url),
            });
          }

          if (!value) return cleaned;

          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (typeof item === "string") {
                addLink(item, "");
              } else if (item && typeof item === "object") {
                addLink(item.url || item.href, item.text || item.label || item.displayText || "");
              }
            });
            return cleaned;
          }

          if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) return cleaned;

            if (trimmed.startsWith("[")) {
              try {
                const parsed = JSON.parse(trimmed);
                return normalizeLinks(parsed);
              } catch (error) {
                // fall through to comma-separated fallback
              }
            }

            trimmed
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
              .forEach((url) => addLink(url, ""));
          }

          return cleaned;
        }

        entities.forEach((entity) => {
          const props = entity.properties || {};
          const name = props.name && props.name.getValue ? props.name.getValue() : entity.name;
          entity.name = name || entity.name;

          const summary = props.summary && props.summary.getValue ? props.summary.getValue() : "";
          const size = props.size && props.size.getValue ? props.size.getValue() : "";
          const tags = props.tags && props.tags.getValue ? props.tags.getValue() : "";
          const links = props.links && props.links.getValue ? props.links.getValue() : "";
          const images = props.images && props.images.getValue ? props.images.getValue() : [];

          entity._pp_summary = summary;
          entity._pp_size = size;
          entity._pp_tags = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
          entity._pp_links = normalizeLinks(links);
          entity._pp_images = normalizeImages(images);

          entity._pp_tags.forEach((tag) => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });

          if (entity.position) {
            entity.point = new Cesium.PointGraphics({
              color: Cesium.Color.fromCssColorString("#7bdcff"),
              pixelSize: 10,
              outlineColor: Cesium.Color.fromCssColorString("#0b1a2b"),
              outlineWidth: 2,
            });
          }

          if (entity.polygon) {
            entity.polygon.material = Cesium.Color.fromCssColorString("#1d2b3f").withAlpha(0.35);
            entity.polygon.outline = true;
            entity.polygon.outlineColor = Cesium.Color.fromCssColorString("#6aa0c7");
          }
        });

        const allTagsSorted = Array.from(tagCounts.keys())
          .sort((a, b) => (tagCounts.get(b) || 0) - (tagCounts.get(a) || 0));
        const topTags = allTagsSorted.slice(0, 3);
        const selectedTags = new Set();

        function renderTagList(container, tags) {
          container.innerHTML = "";
          tags.forEach((tag) => {
            const label = document.createElement("label");
            label.className = "filterItem";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = tag;
            checkbox.checked = selectedTags.has(tag);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(tag));
            container.appendChild(label);
          });
        }

        function renderTopTags() {
          renderTagList(filterWrap, topTags);
        }

        function renderSearchResults(query) {
          if (!query) {
            searchResultsWrap.innerHTML = "";
            return;
          }
          const matches = allTagsSorted.filter(
            (tag) =>
              tag.toLowerCase().includes(query) &&
              !topTags.includes(tag)
          );
          renderTagList(searchResultsWrap, matches);
        }

        function syncTagSelection(target) {
          if (!target || target.type !== "checkbox") return;
          if (target.checked) {
            selectedTags.add(target.value);
          } else {
            selectedTags.delete(target.value);
          }
        }

        function getSelectedTags() {
          return Array.from(selectedTags);
        }

        function applyFilters() {
          const selectedTagValues = getSelectedTags();
          entities.forEach((entity) => {
            const matchesTags = !selectedTagValues.length
              ? true
              : entity._pp_tags.some((tag) => selectedTagValues.includes(tag));
            entity.show = matchesTags;
          });
        }

        function updateSearchTooltip() {
          if (!searchInput) return;
          const tooltip = searchInput.dataset.emptyTooltip || "Search tags.";
          if (!searchInput.value.trim()) {
            searchInput.setAttribute("title", tooltip);
          } else {
            searchInput.removeAttribute("title");
          }
        }

        function getSearchQuery() {
          return searchInput ? searchInput.value.trim().toLowerCase() : "";
        }

        filterWrap.addEventListener("change", (event) => {
          syncTagSelection(event.target);
          applyFilters();
        });
        searchResultsWrap.addEventListener("change", (event) => {
          syncTagSelection(event.target);
          applyFilters();
        });
        if (searchInput) {
          updateSearchTooltip();
          searchInput.addEventListener("input", () => {
            updateSearchTooltip();
            renderSearchResults(getSearchQuery());
          });
          searchInput.addEventListener("blur", updateSearchTooltip);
        }
        if (clearBtn) {
          clearBtn.addEventListener("click", () => {
            selectedTags.clear();
            if (searchInput) searchInput.value = "";
            updateSearchTooltip();
            renderTopTags();
            renderSearchResults(getSearchQuery());
            applyFilters();
          });
        }

        renderTopTags();
        renderSearchResults(getSearchQuery());
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement) => {
          const picked = viewer.scene.pick(movement.position);
          if (!Cesium.defined(picked) || !picked.id) return;

          const entity = picked.id;
          if (selected.entity && selected.entity.point) {
            selected.entity.point.color = Cesium.Color.fromCssColorString("#7bdcff");
            selected.entity.point.pixelSize = 10;
          }
          if (selected.entity && selected.entity.polygon) {
            selected.entity.polygon.outlineColor = Cesium.Color.fromCssColorString("#6aa0c7");
          }

          selected.entity = entity;
          if (entity.point) {
            entity.point.color = selectedStyle.pointColor;
            entity.point.pixelSize = 14;
          }
          if (entity.polygon) {
            entity.polygon.outlineColor = selectedStyle.polygonOutline;
          }

          setDetail(buildDetail(entity));
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        updateEmptyDetail();
      })
      .catch(() => {
        updateEmptyDetail();
      });
  }

  waitForViewer();
})();


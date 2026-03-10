/* global Cesium */

(function initRegenRegistry() {
  const filterWrap = document.getElementById("atlas-filters");
  const clearBtn = document.getElementById("clear-filters");
  const searchInput = document.getElementById("atlas-tag-search");
  const searchResultsWrap = document.getElementById("atlas-search-results");
  const detail = document.getElementById("atlas-detail");
  const storyBlock = document.getElementById("home-story-block");
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

  function toYouTubeEmbedUrl(rawUrl) {
    if (!rawUrl) return "";
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (error) {
      return "";
    }

    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.replace("/", "").trim();
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const listId = parsed.searchParams.get("list");
        if (listId) return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}`;
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : "";
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/").filter(Boolean)[1] || "";
        return id ? `https://www.youtube.com/embed/${id}` : "";
      }
      if (parsed.pathname === "/playlist") {
        const listId = parsed.searchParams.get("list");
        return listId ? `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}` : "";
      }
    }
    return "";
  }

  function normalizeVideos(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") {
            const embedUrl = toYouTubeEmbedUrl(item);
            return embedUrl ? { title: "Project video", url: item, embedUrl } : null;
          }
          if (item && typeof item === "object") {
            const rawUrl = item.url || item.href || "";
            const embedUrl = toYouTubeEmbedUrl(rawUrl);
            return embedUrl ? { title: item.title || item.text || "Project video", url: rawUrl, embedUrl } : null;
          }
          return null;
        })
        .filter(Boolean);
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return normalizeVideos(parsed);
      } catch (error) {
        const embedUrl = toYouTubeEmbedUrl(value);
        return embedUrl ? [{ title: "Project video", url: value, embedUrl }] : [];
      }
    }
    return [];
  }

  function createSproutBillboard(size, isSelected) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    const glow = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.48);
    glow.addColorStop(0, isSelected ? "rgba(255, 246, 218, 0.95)" : "rgba(250, 243, 222, 0.72)");
    glow.addColorStop(1, "rgba(250, 243, 222, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(size * 0.62)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText("🌱", size / 2, size * 0.56);

    return canvas.toDataURL("image/png");
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

    if (entity._pp_videos && entity._pp_videos.length) {
      const divider = document.createElement("div");
      divider.className = "detailDivider";
      wrapper.appendChild(divider);

      const videoLabel = document.createElement("div");
      videoLabel.className = "sectionLabel";
      videoLabel.textContent = "Project viewer";
      wrapper.appendChild(videoLabel);

      const videoGrid = document.createElement("div");
      videoGrid.className = "videoGrid";

      entity._pp_videos.slice(0, 3).forEach((item) => {
        const card = document.createElement("article");
        card.className = "videoCard";
        card.innerHTML = `
          <div class="videoFrameWrap">
            <iframe
              src="${item.embedUrl}"
              title="${item.title}"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
          </div>
          <div class="videoCardBody">
            <div class="videoTitle">${item.title}</div>
            <a class="link" href="${item.url}" target="_blank" rel="noopener">Open source video</a>
          </div>
        `;
        videoGrid.appendChild(card);
      });

      wrapper.appendChild(videoGrid);
    }

    return wrapper;
  }

  function storySentence(entity) {
    const name = entity.name || "This site";
    const summary = String(entity._pp_summary || "").trim();
    if (!summary) {
      return `${name} adds another signal to the rising tide of regeneration.`;
    }

    const trimmed = summary.replace(/\s+/g, " ").trim();
    const sentence = trimmed.match(/.*?[.!?](\s|$)/);
    return `${name}: ${sentence ? sentence[0].trim() : trimmed}`;
  }

  function pickStories(entities, count) {
    const candidates = entities.filter((entity) => entity && entity._pp_summary);
    const pool = [...candidates];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  function renderStoryBlock(entities) {
    if (!storyBlock) return;
    storyBlock.innerHTML = "";
    const stories = pickStories(entities, 3);
    stories.forEach((entity, index) => {
      const item = document.createElement("article");
      item.className = "homeStoryItem";

      const label = document.createElement("div");
      label.className = "sectionLabel homeStoryLabel";
      label.textContent = `Story ${index + 1}`;
      item.appendChild(label);

      const title = document.createElement("div");
      title.className = "homeStoryTitle";
      title.textContent = entity.name || "Registry story";
      item.appendChild(title);

      const body = document.createElement("div");
      body.className = "muted";
      body.textContent = storySentence(entity);
      item.appendChild(body);

      if (entity._pp_tags && entity._pp_tags.length) {
        const tags = document.createElement("div");
        tags.className = "detailMeta";
        entity._pp_tags.slice(0, 3).forEach((tag) => {
          const chip = document.createElement("span");
          chip.className = "chip";
          chip.textContent = tag;
          tags.appendChild(chip);
        });
        item.appendChild(tags);
      }

      storyBlock.appendChild(item);
    });
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
      billboardScale: 1.14,
      polygonOutline: Cesium.Color.fromCssColorString("#7bdcff"),
    };
    const sproutIcons = {
      default: createSproutBillboard(88, false),
      selected: createSproutBillboard(100, true),
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
          const videos = props.videos && props.videos.getValue ? props.videos.getValue() : [];

          entity._pp_summary = summary;
          entity._pp_size = size;
          entity._pp_tags = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
          entity._pp_links = normalizeLinks(links);
          entity._pp_images = normalizeImages(images);
          entity._pp_videos = normalizeVideos(videos);

          if (!entity._pp_videos.length && entity._pp_links.length) {
            entity._pp_videos = entity._pp_links
              .map((item) => ({
                title: item.text || "Project video",
                url: item.url,
                embedUrl: toYouTubeEmbedUrl(item.url),
              }))
              .filter((item) => item.embedUrl);
          }

          entity._pp_tags.forEach((tag) => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });

          if (entity.position) {
            entity.billboard = new Cesium.BillboardGraphics({
              image: sproutIcons.default,
              width: 34,
              height: 34,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scale: 1,
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
        const topTags = allTagsSorted.slice(0, 5);
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
        renderStoryBlock(entities);
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement) => {
          const picked = viewer.scene.pick(movement.position);
          if (!Cesium.defined(picked) || !picked.id) return;

          const entity = picked.id;
          if (selected.entity && selected.entity.billboard) {
            selected.entity.billboard.image = sproutIcons.default;
            selected.entity.billboard.scale = 1;
          }
          if (selected.entity && selected.entity.polygon) {
            selected.entity.polygon.outlineColor = Cesium.Color.fromCssColorString("#6aa0c7");
          }

          selected.entity = entity;
          if (entity.billboard) {
            entity.billboard.image = sproutIcons.selected;
            entity.billboard.scale = selectedStyle.billboardScale;
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


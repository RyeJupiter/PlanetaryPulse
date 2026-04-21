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

    const cx = size / 2;
    const cy = size / 2;
    const borderWidth = Math.max(4, size * 0.1);
    const outerRadius = size / 2 - borderWidth / 2 - 1;
    const innerRadius = outerRadius - borderWidth / 2;

    // Dark filled disc — reads as a clear shape against any basemap.
    ctx.fillStyle = isSelected ? "rgba(18, 36, 24, 0.96)" : "rgba(14, 24, 18, 0.94)";
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Inner glow so the sprout emoji pops above the disc fill.
    const glow = ctx.createRadialGradient(cx, cy, innerRadius * 0.08, cx, cy, innerRadius);
    glow.addColorStop(0, isSelected ? "rgba(236, 255, 220, 0.55)" : "rgba(220, 244, 208, 0.24)");
    glow.addColorStop(1, "rgba(14, 24, 18, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Thick sage-green ring — the firm border that reads on mobile.
    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = isSelected ? "rgba(196, 255, 210, 1)" : "rgba(166, 236, 170, 0.98)";
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Thin dark outer contour for separation from bright terrain (snow, sand).
    ctx.lineWidth = Math.max(1.5, size * 0.022);
    ctx.strokeStyle = "rgba(8, 14, 10, 0.78)";
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius + borderWidth / 2 + 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Sprout emoji with a dark stroke for legibility above the disc.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(size * 0.54)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2.5, size * 0.05);
    ctx.strokeStyle = "rgba(10, 16, 12, 0.9)";
    ctx.strokeText("\uD83C\uDF31", size / 2, size * 0.56);
    ctx.fillText("\uD83C\uDF31", size / 2, size * 0.56);

    return canvas.toDataURL("image/png");
  }

  function buildRotatingGallery(images, projectName) {
    const gallery = document.createElement("div");
    gallery.className = "galleryRotator";

    const stage = document.createElement("div");
    stage.className = "galleryStage";
    gallery.appendChild(stage);

    // Pre-render all frames so transitions are instant after first load.
    const frames = images.map((item, idx) => {
      const frame = document.createElement("figure");
      frame.className = idx === 0 ? "galleryFrame galleryFrameActive" : "galleryFrame";

      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.alt || `${projectName} — image ${idx + 1}`;
      img.loading = idx === 0 ? "eager" : "lazy";
      img.decoding = "async";
      img.draggable = false;
      // On broken image, hide the frame so we never show a 404 bitmap.
      img.addEventListener("error", () => {
        frame.classList.add("galleryFrameBroken");
      });
      frame.appendChild(img);

      if (item.credit || item.source) {
        const caption = document.createElement("figcaption");
        caption.className = "galleryCaption";
        if (item.credit) {
          const c = document.createElement("span");
          c.textContent = item.credit;
          caption.appendChild(c);
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
        frame.appendChild(caption);
      }

      stage.appendChild(frame);
      return frame;
    });

    // Dots — one per image, clickable to jump.
    const dots = document.createElement("div");
    dots.className = "galleryDots";
    const dotEls = images.map((_, idx) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = idx === 0 ? "galleryDot galleryDotActive" : "galleryDot";
      dot.setAttribute("aria-label", `Show image ${idx + 1}`);
      dot.addEventListener("click", () => {
        showFrame(idx);
        restartTimer();
      });
      dots.appendChild(dot);
      return dot;
    });
    gallery.appendChild(dots);

    let currentIdx = 0;
    let timer = null;
    const ROTATION_MS = 4500;

    function showFrame(idx) {
      if (idx === currentIdx) return;
      frames[currentIdx].classList.remove("galleryFrameActive");
      dotEls[currentIdx].classList.remove("galleryDotActive");
      currentIdx = (idx + frames.length) % frames.length;
      frames[currentIdx].classList.add("galleryFrameActive");
      dotEls[currentIdx].classList.add("galleryDotActive");
    }

    function advance() {
      // Skip any frames that failed to load so we never dwell on a broken tile.
      let next = currentIdx;
      for (let step = 0; step < frames.length; step += 1) {
        next = (next + 1) % frames.length;
        if (!frames[next].classList.contains("galleryFrameBroken")) break;
      }
      showFrame(next);
    }

    function startTimer() {
      if (frames.length <= 1) return;
      timer = window.setInterval(advance, ROTATION_MS);
    }

    function restartTimer() {
      if (timer) window.clearInterval(timer);
      startTimer();
    }

    if (frames.length > 1) {
      startTimer();
      // Pause on hover so viewers can read a caption.
      gallery.addEventListener("mouseenter", () => {
        if (timer) {
          window.clearInterval(timer);
          timer = null;
        }
      });
      gallery.addEventListener("mouseleave", () => {
        if (!timer) startTimer();
      });
    } else {
      dots.hidden = true;
    }

    return gallery;
  }

  function buildDetail(entity) {
    const wrapper = document.createElement("div");
    wrapper.className = "detailCard";

    const title = document.createElement("div");
    title.className = "detailTitle";
    title.textContent = entity.name || "Project";
    wrapper.appendChild(title);

    if (entity._pp_images && entity._pp_images.length) {
      const gallery = buildRotatingGallery(entity._pp_images, entity.name);
      wrapper.appendChild(gallery);
    }

    if (entity._pp_highlights && entity._pp_highlights.length) {
      const highlights = document.createElement("ul");
      highlights.className = "detailHighlights";
      entity._pp_highlights.forEach((line) => {
        const li = document.createElement("li");
        li.className = "detailHighlight";
        li.textContent = line;
        highlights.appendChild(li);
      });
      wrapper.appendChild(highlights);
    } else if (entity._pp_summary) {
      const summary = document.createElement("p");
      summary.className = "detailSummary";
      summary.textContent = entity._pp_summary;
      wrapper.appendChild(summary);
    }

    if (entity._pp_size) {
      const size = document.createElement("div");
      size.className = "detailSize";
      size.innerHTML = `<span class="detailSizeLabel">Scale</span><span class="detailSizeValue">${entity._pp_size}</span>`;
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

  function pickStories(entities, count) {
    const candidates = entities.filter((entity) => entity && entity._pp_summary);
    const pool = [...candidates];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  function humanizeTag(tag) {
    return String(tag || "").replace(/-/g, " ");
  }

  function tagFragment(entity) {
    const tags = Array.isArray(entity._pp_tags) ? entity._pp_tags.filter(Boolean) : [];
    const chosen = tags
      .filter((tag) => !["project-viewer", "book", "film", "documentary"].includes(tag))
      .slice(0, 2)
      .map(humanizeTag);

    if (!chosen.length) return "living systems";
    if (chosen.length === 1) return chosen[0];
    return `${chosen[0]} and ${chosen[1]}`;
  }

  function buildNarrative(stories) {
    const [a, b, c] = stories;
    if (!a || !b || !c) {
      return "Repair rises where water, habitat, and people begin working together again.";
    }

    return `${a.name}, ${b.name}, and ${c.name} — spanning ${tagFragment(a)}, ${tagFragment(b)}, and ${tagFragment(c)}.`;
  }

  function renderStoryBlock(entities) {
    if (!storyBlock) return;
    storyBlock.innerHTML = "";
    const stories = pickStories(entities, 3);
    const item = document.createElement("article");
    item.className = "homeStoryItem";

    const body = document.createElement("p");
    body.className = "homeStoryNarrative";
    body.textContent = buildNarrative(stories);
    item.appendChild(body);

    const meta = document.createElement("div");
    meta.className = "detailMeta";
    stories.forEach((entity) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = entity.name || "Registry story";
      meta.appendChild(chip);
    });
    item.appendChild(meta);

    storyBlock.appendChild(item);
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

          const highlights =
            props.highlights && props.highlights.getValue ? props.highlights.getValue() : null;
          entity._pp_summary = summary;
          entity._pp_highlights = Array.isArray(highlights)
            ? highlights.map((h) => String(h).trim()).filter(Boolean)
            : [];
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
            // Larger on coarse-pointer / narrow viewports so the sprout icons
            // are a real touch target on phones; desktop keeps the prior size.
            const isCoarse = window.matchMedia && (
              window.matchMedia("(pointer: coarse)").matches ||
              window.matchMedia("(max-width: 720px)").matches
            );
            const billboardPx = isCoarse ? 44 : 36;
            entity.billboard = new Cesium.BillboardGraphics({
              image: sproutIcons.default,
              width: billboardPx,
              height: billboardPx,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
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

        // Expose a programmatic selector so other modules (e.g. the first-visit
        // welcome sequence) can highlight a project and open its detail panel.
        window.__pp_selectEntityById = function selectEntityById(id) {
          const target = entities.find((ent) => {
            const propId = ent.properties?.id?.getValue?.();
            return propId === id;
          });
          if (!target) return false;

          if (selected.entity && selected.entity !== target) {
            if (selected.entity.billboard) {
              selected.entity.billboard.image = sproutIcons.default;
              selected.entity.billboard.scale = 1;
            }
            if (selected.entity.polygon) {
              selected.entity.polygon.outlineColor = Cesium.Color.fromCssColorString("#6aa0c7");
            }
          }

          selected.entity = target;
          if (target.billboard) {
            target.billboard.image = sproutIcons.selected;
            target.billboard.scale = selectedStyle.billboardScale;
          }
          if (target.polygon) {
            target.polygon.outlineColor = selectedStyle.polygonOutline;
          }

          setDetail(buildDetail(target));
          return true;
        };

        updateEmptyDetail();
        document.dispatchEvent(new CustomEvent("earthpulse:registry-ready"));
      })
      .catch(() => {
        updateEmptyDetail();
      });
  }

  waitForViewer();
})();





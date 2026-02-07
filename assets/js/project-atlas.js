/* global Cesium */

(function initProjectAtlas() {
  const filterWrap = document.getElementById("atlas-filters");
  const clearBtn = document.getElementById("clear-filters");
  const detail = document.getElementById("atlas-detail");
  if (!filterWrap || !detail) return;

  function getViewer() {
    return window.__pp_viewer;
  }

  function setDetail(content) {
    detail.innerHTML = "";
    detail.appendChild(content);
  }

  function buildDetail(entity) {
    const wrapper = document.createElement("div");
    wrapper.className = "detailCard";

    const title = document.createElement("div");
    title.className = "detailTitle";
    title.textContent = entity.name || "Project";
    wrapper.appendChild(title);

    const summary = document.createElement("div");
    summary.className = "muted";
    summary.textContent = entity._pp_summary || "No summary provided yet.";
    wrapper.appendChild(summary);

    if (entity._pp_tags && entity._pp_tags.length) {
      const tagLine = document.createElement("div");
      tagLine.className = "muted";
      tagLine.textContent = "Tags: " + entity._pp_tags.join(", ");
      wrapper.appendChild(tagLine);
    }

    if (entity._pp_links && entity._pp_links.length) {
      const linkWrap = document.createElement("div");
      entity._pp_links.forEach((url) => {
        const link = document.createElement("a");
        link.className = "link";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = url.replace(/^https?:\/\//, "");
        linkWrap.appendChild(link);
        linkWrap.appendChild(document.createTextNode(" "));
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
        const tagSet = new Set();

        entities.forEach((entity) => {
          const props = entity.properties || {};
          const name = props.name && props.name.getValue ? props.name.getValue() : entity.name;
          entity.name = name || entity.name;

          const summary = props.summary && props.summary.getValue ? props.summary.getValue() : "";
          const tags = props.tags && props.tags.getValue ? props.tags.getValue() : "";
          const links = props.links && props.links.getValue ? props.links.getValue() : "";

          entity._pp_summary = summary;
          entity._pp_tags = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
          entity._pp_links = links ? links.split(",").map((t) => t.trim()).filter(Boolean) : [];

          entity._pp_tags.forEach((tag) => tagSet.add(tag));

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

        const tagsSorted = Array.from(tagSet).sort();
        tagsSorted.forEach((tag) => {
          const label = document.createElement("label");
          label.className = "filterItem";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = tag;
          label.appendChild(checkbox);
          label.appendChild(document.createTextNode(tag));
          filterWrap.appendChild(label);
        });

        function getSelectedTags() {
          return Array.from(filterWrap.querySelectorAll("input:checked")).map((el) => el.value);
        }

        function applyFilters() {
          const selectedTags = getSelectedTags();
          entities.forEach((entity) => {
            if (!selectedTags.length) {
              entity.show = true;
              return;
            }
            const hasTag = entity._pp_tags.some((tag) => selectedTags.includes(tag));
            entity.show = hasTag;
          });
        }

        filterWrap.addEventListener("change", applyFilters);
        if (clearBtn) {
          clearBtn.addEventListener("click", () => {
            filterWrap.querySelectorAll("input:checked").forEach((el) => {
              el.checked = false;
            });
            applyFilters();
          });
        }

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

(function initBlog() {
  const list    = document.getElementById("blog-list");
  const search  = document.getElementById("blog-search");
  const tagBar  = document.getElementById("fn-tag-bar");
  if (!list) return;

  let allPosts   = [];
  let activeTag  = "all";
  let activeQuery = "";

  // Pill colour cycle (emerald / sky / warm alternating)
  const PILL_COLORS = ["emerald", "sky", "warm"];
  const tagColorMap = {};
  let colorIdx = 0;

  function tagColor(tag) {
    if (!tagColorMap[tag]) {
      tagColorMap[tag] = PILL_COLORS[colorIdx % PILL_COLORS.length];
      colorIdx++;
    }
    return tagColorMap[tag];
  }

  function formatDate(dateStr) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  function buildCard(post) {
    const card = document.createElement("article");
    card.className = "fnCard";
    card.dataset.tags = (post.tags || []).join(",").toLowerCase();
    card.dataset.slug = post.slug || "";

    // Hero image or placeholder
    if (post.image) {
      const img = document.createElement("img");
      img.className = "fnCardHeroImg";
      img.src = post.image;
      img.alt = post.imageAlt || post.title;
      img.loading = "lazy";
      const applyLayout = () => {
        const ratio = img.naturalWidth / img.naturalHeight;
        card.classList.add(ratio > 1.6 ? "img-wide" : "img-side");
      };
      img.addEventListener("load", applyLayout);
      if (img.complete && img.naturalWidth) applyLayout();
      card.appendChild(img);
    } else if (post.slug === "imagining-a-better-future") {
      const ph = document.createElement("div");
      ph.className = "fnCardPlaceholder";
      ph.textContent = "AI-generated vision of cooperative, regenerative futures — image coming soon.";
      card.appendChild(ph);
    }

    const body = document.createElement("div");
    body.className = "fnCardBody";

    // Meta row: date + tag pills
    const meta = document.createElement("div");
    meta.className = "fnCardMeta";
    const dateEl = document.createElement("span");
    dateEl.className = "fnCardDate";
    dateEl.textContent = formatDate(post.datePublished);
    meta.appendChild(dateEl);

    (post.tags || []).forEach(tag => {
      const pill = document.createElement("button");
      pill.className = `fnPill ${tagColor(tag)}`;
      pill.textContent = tag;
      pill.addEventListener("click", () => setTag(tag));
      meta.appendChild(pill);
    });
    body.appendChild(meta);

    // Title
    const title = document.createElement("h2");
    title.className = "fnCardTitle";
    title.textContent = post.title;
    body.appendChild(title);

    // Summary
    if (post.summary) {
      const summary = document.createElement("p");
      summary.className = "fnCardSummary";
      summary.textContent = post.summary;
      body.appendChild(summary);
    }

    // Full content (collapsed)
    if (post.content) {
      const content = document.createElement("div");
      content.className = "fnCardContent";
      content.innerHTML = post.content
        .split("\n\n")
        .map(p => `<p>${p.replace(/\n/g, " ")}</p>`)
        .join("");
      body.appendChild(content);
    }

    // Footer CTAs
    const footer = document.createElement("div");
    footer.className = "fnCardFooter";

    if (post.content) {
      const readBtn = document.createElement("button");
      readBtn.className = "fnReadBtn";
      readBtn.textContent = "Read more";
      readBtn.addEventListener("click", () => {
        const contentEl = body.querySelector(".fnCardContent");
        const open = contentEl.classList.toggle("open");
        readBtn.textContent = open ? "Show less" : "Read more";
      });
      footer.appendChild(readBtn);
    }

    // Regen Registry card gets Map Explorer CTA
    if (post.slug === "regen-registry-stories") {
      const mapLink = document.createElement("a");
      mapLink.className = "fnMapLink";
      mapLink.href = "/regen-registry.html";
      mapLink.innerHTML = "Link to EarthPulse Map Explorer <span aria-hidden='true'>→</span>";
      footer.appendChild(mapLink);
    }

    body.appendChild(footer);
    card.appendChild(body);
    return card;
  }

  function visible(post) {
    const matchTag = activeTag === "all" ||
      (post.tags || []).map(t => t.toLowerCase()).includes(activeTag.toLowerCase());
    const matchQuery = !activeQuery ||
      [post.title, post.summary, post.content, ...(post.tags || []), ...(post.keywords || [])]
        .join(" ").toLowerCase().includes(activeQuery);
    return matchTag && matchQuery;
  }

  function render() {
    list.innerHTML = "";
    const shown = allPosts.filter(visible);

    if (!shown.length) {
      const empty = document.createElement("div");
      empty.className = "fnEmpty";
      empty.textContent = "No notes match that filter — try a different tag or search.";
      list.appendChild(empty);
      return;
    }

    shown.forEach((post, i) => {
      const card = buildCard(post);
      card.style.animationDelay = `${i * 40}ms`;
      list.appendChild(card);
    });
  }

  function setTag(tag) {
    activeTag = tag;
    tagBar.querySelectorAll(".fnTag").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tag === tag ||
        (tag !== "all" && btn.dataset.tag === tag));
    });
    // clear "all" active if a specific tag chosen
    tagBar.querySelector('[data-tag="all"]').classList.toggle("active", tag === "all");
    render();
  }

  function buildTagBar(posts) {
    const seen = new Set();
    posts.forEach(p => (p.tags || []).forEach(t => seen.add(t)));
    seen.forEach(tag => {
      const btn = document.createElement("button");
      btn.className = "fnTag";
      btn.dataset.tag = tag;
      btn.textContent = tag;
      btn.addEventListener("click", () => setTag(activeTag === tag ? "all" : tag));
      tagBar.appendChild(btn);
    });
    tagBar.querySelector('[data-tag="all"]').addEventListener("click", () => setTag("all"));
  }

  fetch("assets/data/blog-posts.json")
    .then(r => r.json())
    .then(posts => {
      allPosts = posts.slice().sort((a, b) =>
        new Date(b.datePublished) - new Date(a.datePublished)
      );
      buildTagBar(allPosts);
      render();

      if (search) {
        search.addEventListener("input", () => {
          activeQuery = search.value.trim().toLowerCase();
          render();
        });
      }

      // JSON-LD
      const ld = {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "EarthPulse Field Notes",
        description: "Field notes on Earth Metrics, regeneration, and climate stability.",
        blogPost: allPosts.map(p => ({
          "@type": "BlogPosting",
          headline: p.title,
          datePublished: p.datePublished,
          description: p.summary,
          url: "blog.html#" + (p.slug || ""),
        })),
      };
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.text = JSON.stringify(ld);
      document.head.appendChild(s);
    })
    .catch(() => {
      list.innerHTML = '<div class="fnEmpty">Field notes temporarily unavailable.</div>';
    });
})();

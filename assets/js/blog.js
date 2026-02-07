(function initBlog() {
  const list = document.getElementById("blog-list");
  const search = document.getElementById("blog-search");
  const count = document.getElementById("blog-results-count");
  const emptyTip = document.getElementById("blog-empty-tip");
  if (!list || !search || !count || !emptyTip) return;

  function toDateLabel(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function cardFor(post) {
    const card = document.createElement("article");
    card.className = "card";
    card.setAttribute("itemscope", "");
    card.setAttribute("itemtype", "https://schema.org/BlogPosting");
    if (post.slug) {
      card.id = post.slug;
    }

    const title = document.createElement("h2");
    title.className = "cardTitle";
    title.setAttribute("itemprop", "headline");
    title.textContent = post.title;
    card.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent = toDateLabel(post.datePublished);
    meta.setAttribute("itemprop", "datePublished");
    card.appendChild(meta);

    if (post.summary) {
      const summary = document.createElement("p");
      summary.className = "cardBody";
      summary.setAttribute("itemprop", "description");
      summary.textContent = post.summary;
      card.appendChild(summary);
    }

    if (post.image) {
      const hero = document.createElement("img");
      hero.className = "blogHero blogLightbox";
      hero.src = post.image;
      hero.alt = post.imageAlt || post.title;
      hero.loading = "lazy";
      hero.setAttribute("data-lightbox", "true");
      card.appendChild(hero);
    }

    if (post.content) {
      const body = document.createElement("div");
      body.className = "cardBody";
      body.innerHTML = post.content
        .split("\n\n")
        .map((para) => `<p>${para.replace(/\n/g, " ")}</p>`)
        .join("");
      card.appendChild(body);
    }

    if (post.tags && post.tags.length) {
      const tags = document.createElement("div");
      tags.className = "signalMeta";
      post.tags.forEach((tag) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = tag;
        tags.appendChild(chip);
      });
      card.appendChild(tags);
    }

    return card;
  }

  function asSearchText(post) {
    return [
      post.title,
      post.summary,
      post.content,
      (post.tags || []).join(" "),
      (post.keywords || []).join(" "),
    ]
      .join(" ")
      .toLowerCase();
  }

  function render(posts, query) {
    list.innerHTML = "";
    const normalized = query.trim().toLowerCase();
    const visible = !normalized
      ? posts
      : posts.filter((post) => asSearchText(post).includes(normalized));

    visible.forEach((post) => list.appendChild(cardFor(post)));
    count.textContent = visible.length + " post" + (visible.length === 1 ? "" : "s") + " found";
    emptyTip.style.display = normalized ? "none" : "block";
  }

  function initLightbox(images) {
    if (!images.length) return;

    const lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.innerHTML = `
      <div class="lightboxContent">
        <button class="lightboxClose" type="button" aria-label="Close">Close</button>
        <button class="lightboxPrev" type="button" aria-label="Previous">Prev</button>
        <button class="lightboxNext" type="button" aria-label="Next">Next</button>
        <img class="lightboxImage" alt="" />
        <div class="lightboxCaption"></div>
      </div>
    `;
    document.body.appendChild(lightbox);

    const imgEl = lightbox.querySelector(".lightboxImage");
    const captionEl = lightbox.querySelector(".lightboxCaption");
    const btnPrev = lightbox.querySelector(".lightboxPrev");
    const btnNext = lightbox.querySelector(".lightboxNext");
    const btnClose = lightbox.querySelector(".lightboxClose");

    let currentIndex = 0;

    function openAt(index) {
      currentIndex = (index + images.length) % images.length;
      const img = images[currentIndex];
      imgEl.src = img.src;
      imgEl.alt = img.alt || "Blog image";
      captionEl.textContent = img.alt || "";
      lightbox.classList.add("active");
    }

    function close() {
      lightbox.classList.remove("active");
    }

    images.forEach((img, idx) => {
      img.addEventListener("click", () => openAt(idx));
    });

    btnPrev.addEventListener("click", () => openAt(currentIndex - 1));
    btnNext.addEventListener("click", () => openAt(currentIndex + 1));
    btnClose.addEventListener("click", close);
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) close();
    });
    window.addEventListener("keydown", (event) => {
      if (!lightbox.classList.contains("active")) return;
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") openAt(currentIndex - 1);
      if (event.key === "ArrowRight") openAt(currentIndex + 1);
    });
  }

  fetch("assets/data/blog-posts.json")
    .then((response) => response.json())
    .then((posts) => {
      render(posts, "");
      search.addEventListener("input", () => {
        render(posts, search.value);
      });

      const images = Array.from(document.querySelectorAll(".blogLightbox"));
      initLightbox(images);

      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "Planetary Pulse Blog",
        description: "Field notes on Earth Metrics, regeneration, and climate stability.",
        blogPost: posts.map((post) => ({
          "@type": "BlogPosting",
          headline: post.title,
          datePublished: post.datePublished,
          keywords: [...(post.tags || []), ...(post.keywords || [])].join(", "),
          description: post.summary,
          url: "blog.html#" + post.slug,
        })),
      };

      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.text = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    })
    .catch(() => {
      count.textContent = "Posts are temporarily unavailable.";
    });
})();

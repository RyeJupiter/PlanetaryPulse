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

    const summary = document.createElement("p");
    summary.className = "cardBody";
    summary.setAttribute("itemprop", "description");
    summary.textContent = post.summary;
    card.appendChild(summary);

    const tags = document.createElement("div");
    tags.className = "signalMeta";
    post.tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tag;
      tags.appendChild(chip);
    });
    card.appendChild(tags);

    return card;
  }

  function asSearchText(post) {
    return [
      post.title,
      post.summary,
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

  fetch("assets/data/blog-posts.json")
    .then((response) => response.json())
    .then((posts) => {
      render(posts, "");
      search.addEventListener("input", () => {
        render(posts, search.value);
      });

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

/* global document, window */

(function initGalleryLightbox() {
  const gallery = document.querySelector(".galleryGrid");
  if (!gallery) return;

  const items = Array.from(gallery.querySelectorAll(".galleryCard"));
  if (!items.length) return;

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
    currentIndex = (index + items.length) % items.length;
    const card = items[currentIndex];
    const img = card.querySelector("img");
    const title = card.querySelector(".galleryTitle")?.textContent || "";
    const desc = card.querySelector(".galleryDesc")?.textContent || "";
    imgEl.src = img?.src || "";
    imgEl.alt = img?.alt || title || "Gallery image";
    captionEl.textContent = [title, desc].filter(Boolean).join(" — ");
    lightbox.classList.add("active");
  }

  function close() {
    lightbox.classList.remove("active");
  }

  items.forEach((card, idx) => {
    card.addEventListener("click", () => openAt(idx));
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
})();

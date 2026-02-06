const subtitleBySignal = {
    water: "Hydrologic Function",
    energy: "Thermal & Radiative Function",
    vegetation: "Vegetation Function",
};

const subtitleEl = document.getElementById("hudSubTitle");
const chips = document.querySelectorAll(".hudChip");

chips.forEach((btn) => {
    btn.addEventListener("click", () => {
        chips.forEach((b) => {
            b.classList.remove("isActive");
        });

        btn.classList.add("isActive");

        const key = btn.getAttribute("data-signal");
        subtitleEl.textContent = subtitleBySignal[key] || "";
    });
});

/* global window */

(function initSignalSelector() {
  const buttons = Array.from(document.querySelectorAll("[data-signal]"));
  if (!buttons.length) return;

  const label = document.getElementById("signal-name");

  function setActive(button) {
    buttons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    const signal = button.getAttribute("data-signal");
    if (label) label.textContent = button.textContent.trim();
    if (typeof window.__pp_applySignal === "function") {
      window.__pp_applySignal(signal);
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => setActive(btn));
  });

  const defaultBtn = buttons.find((btn) => btn.getAttribute("data-signal") === "none") || buttons[0];
  setActive(defaultBtn);
})();

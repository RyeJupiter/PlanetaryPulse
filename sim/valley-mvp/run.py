"""
Run all three soil scenarios and produce:
  1. outputs/hydrograph.png     — comparative runoff curves (the hero chart)
  2. outputs/animation_<name>.gif — heatmap animation per scenario
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from matplotlib.lines import Line2D

from simulator import SCENARIOS, build_valley_dem, run_scenario, TOTAL_HOURS, DT_MINUTES

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Plotting style ─────────────────────────────────────────────────────────────
plt.rcParams.update({
    "figure.facecolor":  "#0e1a10",
    "axes.facecolor":    "#0e1a10",
    "axes.edgecolor":    "#3a5c3e",
    "axes.labelcolor":   "#c8ddc8",
    "xtick.color":       "#7aaa7a",
    "ytick.color":       "#7aaa7a",
    "text.color":        "#e0f0e0",
    "grid.color":        "#1e3820",
    "grid.linestyle":    "--",
    "font.family":       "sans-serif",
})


def save_hydrograph(results: dict):
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.set_title("Storm Runoff by Soil Type — EarthPulse Valley Simulator",
                 fontsize=14, pad=14, color="#90ffd1")
    ax.set_xlabel("Time (hours)")
    ax.set_ylabel("Outflow (mm equivalent)")
    ax.grid(True, alpha=0.35)

    for scenario in SCENARIOS:
        _, hydrograph = results[scenario.name]
        times   = [h[0] for h in hydrograph]
        outflow = [h[1] for h in hydrograph]
        ax.plot(times, outflow, color=scenario.color, linewidth=2.4,
                label=scenario.name)

    # Rain event shading
    _, hydrograph0 = results[SCENARIOS[0].name]
    storm_end = max(t for t, _ in hydrograph0 if t <= 3)
    ax.axvspan(0, storm_end, color="#3a5c9a", alpha=0.12, label="Rain event")

    ax.legend(facecolor="#0e1a10", edgecolor="#3a5c3e",
              labelcolor="#e0f0e0", fontsize=10)
    fig.tight_layout()
    path = os.path.join(OUTPUT_DIR, "hydrograph.png")
    fig.savefig(path, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"  Saved {path}")


def save_animation(scenario_name: str, frames: list, color: str):
    # Subsample frames for smaller file size
    step = max(1, len(frames) // 28)
    frames = frames[::step]

    fig, ax = plt.subplots(figsize=(4, 4))
    fig.patch.set_facecolor("#0b1410")
    ax.set_facecolor("#0b1410")
    ax.set_title(scenario_name, color="#90ffd1", fontsize=10, pad=6)
    ax.axis("off")

    # Use shared vmax so all three animations are on the same scale
    vmax = max(f.max() for f in frames) or 1

    im = ax.imshow(frames[0], vmin=0, vmax=vmax, cmap="YlGnBu",
                   interpolation="nearest", origin="upper")

    time_label = ax.text(0.02, 0.97, "", transform=ax.transAxes,
                         color="white", fontsize=8, va="top",
                         bbox=dict(facecolor="#0b1410", edgecolor="none", pad=2))

    def update(idx):
        im.set_data(frames[idx])
        t_hr = idx * step * (TOTAL_HOURS / (len(frames) * step + 1))
        time_label.set_text(f"t = {t_hr:.1f} hr")
        return [im, time_label]

    ani = animation.FuncAnimation(fig, update, frames=len(frames),
                                  interval=110, blit=True)
    safe_name = scenario_name.lower().replace(" ", "_").replace("/", "")
    path = os.path.join(OUTPUT_DIR, f"animation_{safe_name}.gif")
    ani.save(path, writer="pillow", fps=10, dpi=72,
             savefig_kwargs={"facecolor": "#0b1410"})
    plt.close(fig)
    print(f"  Saved {path}")


def main():
    print("Building valley DEM...")
    dem = build_valley_dem(50)

    results = {}
    for scenario in SCENARIOS:
        print(f"Running scenario: {scenario.name}")
        frames, hydrograph = run_scenario(dem, scenario)
        results[scenario.name] = (frames, hydrograph)

    print("Saving hydrograph...")
    save_hydrograph(results)

    print("Saving animations...")
    for scenario in SCENARIOS:
        frames, _ = results[scenario.name]
        save_animation(scenario.name, frames, scenario.color)

    print("\nDone. Outputs in sim/valley-mvp/outputs/")


if __name__ == "__main__":
    main()

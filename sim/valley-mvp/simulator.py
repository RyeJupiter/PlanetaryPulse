"""
EarthPulse Valley Simulator
----------------------------
Grid-based hydrological physics simulation demonstrating how soil health
changes storm-water runoff. Three scenarios share identical topography
and rainfall — only soil parameters differ.
"""

import numpy as np
from dataclasses import dataclass
from typing import Tuple


@dataclass
class SoilScenario:
    name: str
    color: str          # for plotting
    ksat: float         # saturated hydraulic conductivity (mm/hr)
    storage: float      # total soil water storage capacity (mm)


SCENARIOS = [
    SoilScenario("Concrete / Urban",       "#c0392b", ksat=0,   storage=0),
    SoilScenario("Degraded Soil",          "#e67e22", ksat=8,   storage=20),
    SoilScenario("Regenerative Soil",      "#27ae60", ksat=100, storage=120),
]

# Storm parameters
RAIN_RATE_MM_HR   = 30    # mm/hr  (moderate-heavy storm)
STORM_DURATION_HR = 3     # hours
TOTAL_HOURS       = 6     # simulate 6 hrs total (includes recession)
DT_MINUTES        = 5     # timestep in minutes
GRID_SIZE         = 50    # cells per side
CELL_SIZE_M       = 10    # metres per cell (used for Manning upgrade path)


def build_valley_dem(size: int) -> np.ndarray:
    """
    Synthetic DEM: parabolic cross-section valley.
    Elevation highest at edges, lowest along centre trough.
    N→S gradient drives drainage toward row 0 (south outlet).
    """
    x = np.linspace(-1, 1, size)
    y = np.linspace(0, 1, size)            # steeper N-S slope (0–6 m)
    xx, yy = np.meshgrid(x, y)
    cross_section = xx ** 2                 # parabolic east-west profile
    dem = cross_section * 8 + yy * 6       # EW relief 0–8 m, NS slope 0–6 m
    return dem


def run_scenario(dem: np.ndarray, scenario: SoilScenario) -> Tuple[np.ndarray, list]:
    """
    Run one soil scenario. Returns:
        frames      — list of 2D surface-water arrays (one per saved timestep)
        hydrograph  — list of (time_hr, outflow_mm) tuples
    """
    rows, cols = dem.shape
    dt_hr = DT_MINUTES / 60.0

    # State arrays
    w_surface  = np.zeros((rows, cols))    # surface water depth (mm)
    w_absorbed = np.zeros((rows, cols))    # water absorbed into soil (mm)
    remaining_storage = np.full((rows, cols), float(scenario.storage))

    hydrograph = []
    frames     = []

    total_steps = int(TOTAL_HOURS / dt_hr)
    rain_steps  = int(STORM_DURATION_HR / dt_hr)
    save_every  = max(1, total_steps // 60)  # ~60 frames for animation

    for step in range(total_steps):
        t_hr = step * dt_hr

        # 1. Precipitation
        if step < rain_steps:
            w_surface += RAIN_RATE_MM_HR * dt_hr

        # 2. Infiltration
        infiltrate = np.minimum(
            w_surface,
            np.minimum(scenario.ksat * dt_hr, remaining_storage)
        )
        w_surface         -= infiltrate
        w_absorbed        += infiltrate
        remaining_storage -= infiltrate

        # 3. D8 flow routing — water moves to the lowest neighbour
        w_surface = _route_d8(w_surface, dem)

        # 4. Outflow: collect water leaving the south edge (row 0)
        outflow = float(w_surface[0, :].sum()) * 0.15  # fraction drains each step
        w_surface[0, :] *= 0.85
        hydrograph.append((t_hr, outflow))

        if step % save_every == 0:
            frames.append(w_surface.copy())

    return frames, hydrograph


def _route_d8(w: np.ndarray, dem: np.ndarray, fraction: float = 0.45) -> np.ndarray:
    """
    D8 routing with water-conservation fix.
    All 4 direction fractions are computed from the original w, then
    normalised so their sum never exceeds 1.0 — preventing the positive-
    feedback explosion that occurs when each direction independently drains
    up to `fraction` of w (potentially >100% total outflow).
    """
    rows, cols = w.shape
    total_head = dem + w
    w_new = w.copy()

    raw_fracs = []
    neighbors = []

    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        nr = np.clip(np.arange(rows)[:, None] + dr, 0, rows - 1)
        nc = np.clip(np.arange(cols)[None, :] + dc, 0, cols - 1)
        slope = total_head - total_head[nr, nc]
        raw = np.where(slope > 0, fraction * np.minimum(slope / (slope + 1.0), 1.0), 0.0)
        raw_fracs.append(raw)
        neighbors.append((nr, nc))

    total_frac = sum(raw_fracs)
    scale = np.where(total_frac > 1.0, 1.0 / total_frac, 1.0)

    for raw, (nr, nc) in zip(raw_fracs, neighbors):
        transfer = w * raw * scale
        w_new -= transfer
        np.add.at(w_new, (nr, nc), transfer)

    return np.maximum(w_new, 0)

# EarthPulse Flood Model — Methodology

_Draft v1 · 2026-06-04 · the "counterfactual infiltration" model behind the flood/FEMA thesis_

## The one-line idea

Connect **rainfall** to **river flow** to back out how much water a watershed currently *infiltrates
vs. sheds*. Then ask: if this watershed's farmland shifted to the infiltration behavior we already
**measure on real regenerative farms**, how much would (a) flood peaks drop and (b) dry-season water
availability rise? Same rain — redirected from destructive-fast to beneficial-slow.

## The physics (catchment water balance)

For a watershed over a period:

```
P  =  Q  +  ET  +  ΔS  +  R
```

- **P** precipitation in · **Q** streamflow out (river) · **ET** evapotranspiration ·
  **ΔS** change in soil/storage · **R** deep recharge (to aquifer).

Two derived quantities do the work:

1. **Runoff ratio  C = Q / P** — fraction of rain that becomes streamflow. Lower C ⇒ more water
   infiltrating/recharging. The headline knob regeneration turns.
2. **Baseflow separation** — split the hydrograph into **quickflow** (storm runoff → drives floods)
   and **baseflow** (groundwater-fed → drives dry-season water availability). Regeneration shifts
   water from quickflow → baseflow + recharge. *This single shift produces both outcomes Rye wants:*
   - **Flood risk ↓** = lower quickflow peak
   - **Farmer water availability ↑** = more baseflow + higher water table

## Step-by-step

1. **Pick a watershed** — flood-prone, ag-heavy, with a good USGS stream gauge.
2. **Get P and Q** — daily precipitation and daily discharge, 10–20 yrs.
3. **Characterize current behavior** — annual runoff ratio C, event runoff coefficients for the big
   storms, and a baseflow/quickflow split. Optionally fit an **effective SCS Curve Number (CN)** —
   the standard event-runoff parameter that encodes soil + land cover + antecedent moisture.
4. **Define the regen scenario (the empirical part — this is the clever bit):** the infiltration
   improvement is NOT invented. Source it from farms *already demonstrating it to a known degree* —
   the same regen sites EarthPulse already tracks (White Oak Pastures, Apricot Lane, ACHM, etc.) plus
   published NRCS infiltration measurements. Express it as a CN reduction / higher infiltration rate.
5. **Re-run the events** with the regen-scenario CN → new storm hydrographs.
6. **Read off the two outcomes:**
   - Flood: % reduction in peak discharge for the 10-/25-/100-yr storm.
   - Water: extra acre-feet of baseflow / recharge across the dry season.
7. **Monetize the flood side** — map peak-discharge reduction to flood stage (rating curve) and to
   avoided damages via **FEMA NFHL** flood zones + **OpenFEMA NFIP** claims data.

## Data sources (all free; extends the existing ORNL/AppEEARS pipeline)

| Need | Source |
|---|---|
| Streamflow (Q, cfs) | **USGS NWIS / Water Services** API (real-time + historical) |
| Operational streamflow / forecast | **NOAA National Water Model (NWM)** |
| Precipitation (P) | NOAA **GPM/IMERG**, **PRISM**, or radar **MRMS** |
| Evapotranspiration (ET) | **MODIS MOD16** (already a MODIS shop) |
| Soil moisture | **NASA SMAP** |
| Soils (for CN) | NRCS **SSURGO** |
| Land cover (for CN) | **NLCD** |
| Regen infiltration deltas | EarthPulse's own tracked sites + NRCS soil-health literature |
| Flood zones / payouts | **FEMA NFHL** + **OpenFEMA NFIP** claims |

## Honest caveats (state these on stage — they build credibility, not doubt)

- Runoff ratio ≠ pure infiltration (ET and storage confound it) — treat as scenario, not prediction.
- CN is a lumped, empirical parameter; scaling a plot-scale infiltration gain to a whole watershed
  is approximate — not all the basin is farmland, routing matters.
- **Infiltration benefits are largest for small/medium storms and shrink for extreme events** (soil
  saturates). Don't overclaim on the 500-yr flood; the win is frequent floods + dry-season water.
- Attribution: separate the regen effect from climate variability.
- ⇒ Frame as an **order-of-magnitude scenario tool**: _"if this basin's farmland infiltrated like
  White Oak Pastures, the runoff coefficient drops from A→B, shaving the 10-yr peak ~X% and adding
  ~Y acre-feet of dry-season baseflow — worth ~$Z in avoided NFIP claims."_

## Phased build

- **Phase 0 — one watershed, offline.** Python notebook: pull USGS Q + PRISM P for one basin,
  compute C, baseflow split, effective CN, run one regen scenario. Produces the hero slide.
- **Phase 1 — the Water Earth Metric.** Wire infiltration/runoff-ratio as the platform's hydrology
  layer (currently TBD in metrics-config.js).
- **Phase 2 — live response.** Real-time USGS/NWM gauge feed with the counterfactual overlay during
  an active storm. The unforgettable demo.

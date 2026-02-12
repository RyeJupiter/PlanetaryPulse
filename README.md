# EarthPulse
EarthPulse - visualizing Earth system function and regeneration

## Explore V1 backend (AppEEARS)

The Explore app uses a Cloudflare Pages Function endpoint:

- `POST /api/explore/monthly`

It calls NASA AppEEARS, downloads point-sample CSV results (with QA layers), applies QA filtering, and returns monthly medians for NDVI/LST.

### Required environment variables

Set these in Cloudflare for the project:

- `APPEEARS_USERNAME`
- `APPEEARS_PASSWORD`

If credentials are missing, Explore automatically falls back to mock data in the UI.

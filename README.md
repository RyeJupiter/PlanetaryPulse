# EarthPulse
EarthPulse - visualizing Earth system function and regeneration

## Explore V1 backend (AppEEARS)

The Explore app uses a Cloudflare Pages Function endpoint:

- `POST /api/explore/monthly`

It calls NASA AppEEARS, downloads point-sample CSV results (with QA layers), applies QA filtering, and returns monthly medians for NDVI/LST.

### Authentication

The Explore app calls NASA AppEEARS, which requires an Earthdata Login.

- `APPEEARS_USERNAME`
- `APPEEARS_PASSWORD`

Set those in Cloudflare if you want server-side credentials for the deployed site.

If deployment secrets are missing, the Explore UI now accepts a user-provided Earthdata Login and forwards it only for the active request. It no longer falls back to mock data.

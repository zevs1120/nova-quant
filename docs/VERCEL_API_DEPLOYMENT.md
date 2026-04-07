# Vercel API Deployment

`nova-quant-api` is now treated as an API-only deployment surface.

## Contract

- Root [vercel.json](vercel.json) uses:
  - `buildCommand: npm run build:api`
  - `outputDirectory: dist`
  - `/api/:route* -> /api?route=:route*`
  - `/healthz -> /api?route=healthz`
  - `/ -> /api`
- [api/index.ts](api/index.ts) remains the single Vercel Serverless entrypoint.
- `npm run build:api` validates the API entrypoint and always writes a stable `dist/` artifact so Vercel never waits for a missing frontend output directory.

## Why

Earlier deployments could drift between two incompatible assumptions:

- the repository root behaves like a frontend app that should output `dist/index.html`
- the repository root behaves like an API-only Vercel function project

This document locks the root deployment to the second model.

## Expected behavior

- Visiting `/api` returns the API-only JSON payload.
- Visiting `/healthz` rewrites into the API health route.
- Visiting `/` also lands on the API JSON surface instead of a frontend shell.
- Frontend deployments continue to live under [app/vercel.json](app/vercel.json), [admin/vercel.json](admin/vercel.json), and [landing/vercel.json](landing/vercel.json).

## H5 app (`app/`) API rewrites and client governance

- [app/vercel.json](app/vercel.json) rewrites `/api/:path*` to the production API host. **Each browser call to same-origin `/api/*` still counts as an Edge request on the `app` project** before the origin fetch runs.
- The main shell’s [src/utils/api.js](src/utils/api.js) wraps all product `fetchApi` traffic with [src/shared/http/apiGovernance.js](src/shared/http/apiGovernance.js): in-flight dedupe, per-route minimum spacing, failure backoff, and a short global pause when Vercel returns `402` + `X-Vercel-Error: DEPLOYMENT_DISABLED`. Keep this layer in mind when diagnosing Edge request volume.

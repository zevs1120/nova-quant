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

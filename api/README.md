# API Layer (Vercel / serverless entry)

Last updated: 2026-03-23

## What this folder is

- **Vercel Functions** (or compatible) entrypoints under this directory route HTTP requests into the **shared Express app** in [`src/server/api/app.ts`](../src/server/api/app.ts).
- The **canonical** API surface, handlers, and business logic live in **`src/server/`** (not duplicated per folder).

## Local development

- Run the standalone API from the repo root: `npm run api:data` (listens on **`http://127.0.0.1:8787`** by default).
- Run web + API together: `npm run dev` (Vite proxies `/api` → that port).

## Related packages

- **`server/`** — deploy-focused package metadata; still uses root `src/server` sources.
- Root [`README.md`](../README.md) — production domain split (`api.novaquant.cloud`, etc.).

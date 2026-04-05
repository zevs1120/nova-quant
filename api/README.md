# API Layer (Vercel / serverless entry)

Last updated: 2026-03-23

## What this folder is

- **Vercel Functions** (or compatible) entrypoints under this directory route HTTP requests into the **shared Express app** in [`src/server/api/app.ts`](../src/server/api/app.ts).
- The **canonical** API surface, handlers, and business logic live in **`src/server/`** (not duplicated per folder).
- This surface is **API-only**. It must not be used as a homepage, landing shell, or alternative frontend entry.
- Production frontends should call `https://api.novaquant.cloud`; they should not couple themselves to a temporary `*.vercel.app` API host.

## Local development

- Run the standalone API from the repo root: `npm run api:data` (listens on **`http://127.0.0.1:8787`** by default).
- Run web + API together: `npm run dev` (Vite proxies `/api` → that port).

## Related packages

- Root [`README.md`](../README.md) — production domain split (`api.novaquant.cloud`, etc.).

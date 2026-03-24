---
name: dev
description: Start the local development stack (API + Vite frontend). Use when beginning a development session.
disable-model-invocation: true
---

Start the local development environment:

```bash
npm run dev
```

This launches both the Express API server (port 8787) and Vite web dev server via `scripts/dev-stack.mjs`.

## Prerequisites

1. Dependencies installed: `npm ci`
2. Environment configured: `.env` file exists (copy from `.env.example`)
3. Database initialized: `npm run db:init`
4. Data backfilled (if needed): `npm run backfill` -> `npm run validate:data` -> `npm run derive:runtime`

## Alternatives

- `npm run dev:web` -- frontend only (no API)
- `npm run start:api` -- API only (no frontend)

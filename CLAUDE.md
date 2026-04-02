# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- `npm run dev` -- starts API server (port 8787) + Vite web dev server via `scripts/dev-stack.mjs`
- `npm run dev:web` -- Vite frontend only
- `npm run start:api` -- API server only
- `npm run build` -- Vite build to `dist/`
- `npm run typecheck` -- `tsc --noEmit` (strict mode)
- `npm test` -- Vitest (all tests)
- `npm run verify` -- sequential lint + typecheck + test + build + `build:landing` (must pass before marking work done)
- `npm run format -- <file>` -- Prettier (single file); `npm run format:check` -- check all

## Data Pipeline (first-time / after schema changes)

`npm run backfill` -> `npm run validate:data` -> `npm run derive:runtime`

## Code Style

- 2-space indent, single quotes, trailing commas
- Prettier is configured (`.prettierrc`); run `npm run format -- <file>` after editing
- Components/types: `PascalCase`; functions/variables: `camelCase`; scripts: `kebab-case`; tests: `<feature>.test.ts`
- ES Modules throughout (`"type": "module"`); strict TypeScript for `src/server/`, `scripts/`, `tests/`, `api/`
- JSX frontend files (`src/App.jsx`, `src/components/`) are NOT in tsconfig -- Vite handles them
- No ESLint; `npm run lint` runs `scripts/check-repo-policy.mjs` (structural checks, not style)

## Testing

- Framework: Vitest 4 with `@vitest/coverage-v8`
- Run single test: `npx vitest run tests/<feature>.test.ts`
- New features must have matching `tests/<feature>.test.ts` covering normal path, edge cases, and regressions
- Tests use the in-memory Postgres harness defined under `tests/vitest.setup.ts`

## Project Layout

Five-part deploy (see root `README.md` / `architecture.md`): `landing/` (brand site + data portal paths), `app/` (user H5 on Vercel), `admin/` (ops dashboard on Vercel), `qlib-bridge/` (Python sidecar on EC2 — factors / ML inference; no user-state writes), and repository root (main web shell + Express API packaged as Vercel Serverless via `api/index.ts` → `src/server/api/app.ts`). `landing/`, `app/`, and `admin/` each ship with their own `vercel.json`.

Core source in `src/`: `server/` (Express 5 TypeScript backend — on the order of **41** top-level domain folders under `src/server/`), `components/` + `App.jsx` (React), `engines/` (JS quant engines), `quant/` (legacy front-end quant helpers + retrieval), `research/` (research governance and pipelines), `training/` (e.g. multi-asset training service). Business and auth data live in Supabase/Postgres via `NOVA_DATA_DATABASE_URL` and `NOVA_AUTH_DATABASE_URL`.

Product shell notes: **first-run setup** (`FirstRunSetupFlow`, gated in `App.jsx`) runs after login for users who have not completed or skipped it; **auth session** payloads include `roles` and `isAdmin` from the server. **Investor demo** is only actionable when `VITE_ENABLE_DEMO_ENTRY` is not `'0'` **and** the session user is an admin (`isAdmin`). Local dev: `fetchApi` may rotate API bases (including `https://api.novaquant.cloud`) when the dev server returns 404/405 or HTML for `/api/*`.

## Commit Conventions

Conventional Commits: `feat(module):`, `fix(module):`, `test:`, `docs:`. Title states affected module(s). Do not commit `.env`, `*.db`, `coverage/`, `dist/`.

## Environment

- Copy `.env.example` to `.env` for local dev; see it for all available vars
- Tests run against the in-memory Postgres harness without requiring a live Supabase instance
- API proxied at `/api` in dev (Vite config proxies to `http://127.0.0.1:8787`)
- Set `NOVA_DATA_DATABASE_URL` and `NOVA_AUTH_DATABASE_URL` to point at Supabase/Postgres in every non-test environment
- `NOVA_DATA_RUNTIME_DRIVER=postgres` keeps the runtime on the Postgres-backed path; validate latency before changing hot-path fallback settings
- Hot-path protection envs for EC2 incidents: `NOVA_PG_PRIMARY_READ_FAILURE_COOLDOWN_MS`, `NOVA_ALLOW_SYNC_HOT_PATH_FALLBACK`, and `NOVA_AUTO_BACKEND_SKIP_INIT`

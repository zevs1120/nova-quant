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

`npm run db:init` -> `npm run backfill` -> `npm run validate:data` -> `npm run derive:runtime`

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
- Test DB uses `.tmp/nova-quant-test-{workerId}.db` (auto-created, isolated per worker)

## Project Layout

Four-part deploy: `app/` (user H5 frontend), `admin/` (ops dashboard), `server/` (Vercel API wrapper), root (main API + quant core). Each has its own `vercel.json`.

Core source in `src/`: `server/` (Express 5 backend, ~45 modules), `components/` (React), `engines/` (JS quant), `research/` (quantitative research modules).

## Commit Conventions

Conventional Commits: `feat(module):`, `fix(module):`, `test:`, `docs:`. Title states affected module(s). Do not commit `.env`, `*.db`, `coverage/`, `dist/`.

## Environment

- Copy `.env.example` to `.env` for local dev; see it for all available vars
- Tests run without any env vars (SQLite test DB is auto-created)
- On Vercel: DB is ephemeral at `/tmp/nova-quant/quant.db`; `VERCEL=1` switches config paths
- API proxied at `/api` in dev (Vite config proxies to `http://127.0.0.1:8787`)

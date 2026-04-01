# Repo Runbook

Last updated: 2026-03-24

## 1) Prerequisites

- Node.js 20+
- npm 10+
- `MASSIVE_API_KEY` for primary market data ingestion (Massive.com REST API)
- Network access for ingestion (Massive.com primary; Stooq/Binance legacy fallback)
- `NOVA_DATA_DATABASE_URL` for the Supabase/Postgres business runtime
- `NOVA_AUTH_DATABASE_URL` for the Supabase/Postgres auth store

## 2) First-time Setup

Fresh clone / CI-style install:

```bash
npm ci
```

For ad-hoc local work, `npm install` is acceptable; releases and diligence should prefer `npm ci`.

## 3) Pull Data (small reproducible path)

```bash
npm run backfill -- --market CRYPTO --tf 1h
npm run validate:data -- --tf 1h --lookbackBars 800
npm run derive:runtime
```

Optional broader ingestion:

```bash
npm run backfill -- --market ALL
```

## 4) Start Backend API

```bash
npm run api:data
```

Health check:

```bash
curl http://127.0.0.1:8787/healthz
```

Runtime check:

```bash
curl "http://127.0.0.1:8787/api/runtime-state?userId=guest-default&market=US&assetClass=US_STOCK"
```

## 4.1) Unattended Auto Backend

Continuous backend loop:

```bash
npm run auto:backend
```

Generate macOS `launchd` service plist:

```bash
npm run auto:backend:launchd
```

Install and start the macOS background service:

```bash
npm run auto:backend:install
```

Inspect service status:

```bash
npm run auto:backend:status
```

Remove the service:

```bash
npm run auto:backend:uninstall
```

Default unattended loop behavior:

- refreshes US/crypto market data
- refreshes free news + crypto funding/basis structure data
- validates runtime data quality
- keeps API + worker processes supervised and auto-restarted
- runs scheduled quant evolution
- runs scheduled Nova training flywheel and, if `mlx_lm` is installed locally plus `--execute-training` is enabled, executes MLX LoRA training directly

## 5) Start Frontend (with API)

From the **repository root**, a single command starts both processes:

```bash
npm run dev
```

This runs `scripts/dev-stack.mjs`: `npm run api:data` plus `npm run dev:web` (Vite). Vite proxies `/api` to the backend (default `http://127.0.0.1:8787`, overridable via `VITE_API_PROXY_TARGET`).

Split deploy apps (`app/`, `admin/`) use their own `package.json` scripts but share the same canonical implementation under root `src/server/`.

## 6) Quality Gates

```bash
npm test
npm run typecheck
npm run build
npm run verify
```

## 7) Session Auth (Postgres)

For production deployments, configure Postgres-backed auth:

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/nova_auth"
npm run auth:migrate:postgres
```

Local dev and production both require Supabase/Postgres auth configuration. Without it, deployed `/api/auth/*` returns `AUTH_STORE_NOT_CONFIGURED`.

## 8) Run Evidence Engine

CLI path:

```bash
npm run evidence:run
```

API path:

```bash
curl -X POST http://127.0.0.1:8787/api/evidence/run \
  -H "Content-Type: application/json" \
  -d '{"userId":"guest-default","market":"US","assetClass":"US_STOCK","timeframe":"1d","maxSignals":120}'
```

Key evidence queries:

```bash
curl "http://127.0.0.1:8787/api/evidence/signals/top?userId=guest-default&market=US&assetClass=US_STOCK&limit=3"
curl "http://127.0.0.1:8787/api/evidence/backtests?limit=10"
curl "http://127.0.0.1:8787/api/evidence/reconciliation?limit=50"
curl "http://127.0.0.1:8787/api/evidence/strategies/champion"
```

## 9) Typical Troubleshooting

1. `INSUFFICIENT_DATA` in runtime:

- run `backfill`, `validate:data`, `derive:runtime` again.

2. Connector shows disconnected:

- expected unless real provider credentials + adapter implementation are available.

3. Missing live performance:

- expected when no `LIVE` executions exist; runtime should not fabricate live stats.

## 10) Status Interpretation

- `DB_BACKED`: derived from DB-backed ingestion/runtime objects.
- `PAPER_ONLY`: only paper execution sample exists.
- `REALIZED`: live execution sample exists.
- `DISCONNECTED`: connector unavailable/not configured.
- `NO_CREDENTIALS`: connector configured flow requested but credentials are missing.
- `WITHHELD`: metric deliberately withheld due low sample quality.
- `INSUFFICIENT_DATA`: not enough data to support strong output.

## 11) Clean Source Package For DD

```bash
npm run package:source
```

Dry-run packaging policy:

```bash
node scripts/package-source.mjs --dry-run
```

Excluded by default:

- `node_modules`, `dist`, `build`, `coverage`, `artifacts`
- `data/*.db`, `data/*.db-wal`, `data/*.db-shm`, `*.wal`, `*.shm`
- `__MACOSX`, `.DS_Store`, local logs/tmp files

## 12) Vercel Deployment

Expected Vercel settings:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

API path:

- `api/index.ts` is the Vercel Serverless Function entry point
- It loads `src/server/api/app.ts` which handles all `/api/*` routes

Database behavior on Vercel:

- Supabase/Postgres is required for auth and business data
- Schema is auto-created in Postgres on cold start
- Do not deploy without `NOVA_AUTH_DATABASE_URL` and `NOVA_DATA_DATABASE_URL`

Recommended env for an investor demo deployment:

- `VITE_DEMO_MODE=0` if you want API-first default runtime with explicit in-app demo switching
- `VITE_DEMO_MODE=1` only if you want the entire app to open in explicit demo runtime by default

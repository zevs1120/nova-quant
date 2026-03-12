# Repo Runbook

Last updated: 2026-03-12

## 1) Prerequisites

- Node.js 20+
- npm 10+
- Network access for ingestion (Stooq/Binance)

## 2) First-time Setup

```bash
npm install
npm run db:init
```

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

## 5) Start Frontend

```bash
npm run dev
```

Vite proxies `/api` to backend (default target: `http://127.0.0.1:8787`).

## 6) Quality Gates

```bash
npm run test:data
npm run typecheck
npm run build
```

## 7) Run Evidence Engine

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

## 8) Typical Troubleshooting

1. `INSUFFICIENT_DATA` in runtime:
- run `backfill`, `validate:data`, `derive:runtime` again.

2. Connector shows disconnected:
- expected unless real provider credentials + adapter implementation are available.

3. Missing live performance:
- expected when no `LIVE` executions exist; runtime should not fabricate live stats.

## 9) Status Interpretation

- `DB_BACKED`: derived from DB-backed ingestion/runtime objects.
- `PAPER_ONLY`: only paper execution sample exists.
- `REALIZED`: live execution sample exists.
- `DISCONNECTED`: connector unavailable/not configured.
- `NO_CREDENTIALS`: connector configured flow requested but credentials are missing.
- `WITHHELD`: metric deliberately withheld due low sample quality.
- `INSUFFICIENT_DATA`: not enough data to support strong output.

## 10) Clean Source Package For DD

```bash
npm run package:source
```

Dry-run packaging policy:

```bash
node scripts/package-source.mjs --dry-run
```

Excluded by default:
- `node_modules`, `dist`, `build`, `coverage`, `artifacts`
- `data/*.db`, `data/*.db-wal`, `data/*.db-shm`, `*.sqlite*`, `*.wal`, `*.shm`
- `__MACOSX`, `.DS_Store`, local logs/tmp files

## 11) Vercel Deployment

Expected Vercel settings:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

API path:

- `api/[...route].ts` is the Vercel catch-all wrapper
- It delegates all `/api/*` traffic to `src/server/api/app.ts`

Database behavior on Vercel:

- If `DB_PATH` is not set, the server defaults to `/tmp/nova-quant/quant.db`
- Schema is auto-created on cold start
- This database is ephemeral; it is suitable for demo/runtime continuity within a function lifecycle, not long-term persistence

Recommended env for an investor demo deployment:

- `VITE_DEMO_MODE=0` if you want API-first default runtime with explicit in-app demo switching
- `VITE_DEMO_MODE=1` only if you want the entire app to open in explicit demo runtime by default

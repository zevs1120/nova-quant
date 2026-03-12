# Nova Quant

Nova Quant is an AI-native quantitative **decision** platform for US equities and crypto.

It is designed to help self-directed traders reduce emotional trading and execute with discipline.
It is **not** a blind auto-trading bot and does **not** fabricate live performance.

## What Changed In This Runtime-Realism Upgrade

- Runtime now derives from **SQLite + ingested bars + derived state**.
- Frontend default path is now **API-first** (not local pipeline-first).
- Chat tools no longer read `public/mock/*` in runtime path.
- Connectors no longer return fake balances/positions by default.
- Performance outputs now carry source/sample transparency and withhold low-sample metrics.
- Backtest / Replay / Paper now have a shared **Evidence Engine** path with run registry and reconciliation APIs.

## Source of Truth

Primary backend source of truth:
- `src/server/api/app.ts`
- `src/server/api/queries.ts`
- `src/server/quant/service.ts`
- `src/server/quant/runtimeDerivation.ts`
- SQLite (`data/quant.db`)

## Runtime Status Labels

Nova Quant uses explicit status labels in API/runtime outputs:

- `DB_BACKED`
- `REALIZED`
- `PAPER_ONLY`
- `BACKTEST_ONLY`
- `MODEL_DERIVED`
- `EXPERIMENTAL`
- `DISCONNECTED`
- `INSUFFICIENT_DATA`
- `DEMO_ONLY` (only for explicit demo paths)

## Quick Start (Fresh Clone)

```bash
npm install
npm run db:init
npm run backfill -- --market CRYPTO --tf 1h
npm run validate:data -- --tf 1h --lookbackBars 800
npm run derive:runtime
npm run api:data
```

In another terminal:

```bash
npm run dev
```

Quality gates:

```bash
npm run test:data
npm run typecheck
npm run build
```

## Notes On Data

- US data: Stooq bulk ingestion (`src/server/ingestion/stooq.ts`) with configured symbol whitelist.
- Crypto data: Binance public bulk + incremental REST ingestion.
- If data is stale/insufficient, APIs return honest degraded states (`INSUFFICIENT_DATA`) instead of synthetic beautification.

## Key Commands

- `npm run db:init`
- `npm run backfill`
- `npm run validate:data`
- `npm run derive:runtime`
- `npm run evidence:run`
- `npm run api:data`
- `npm run dev`
- `npm run test:data`
- `npm run typecheck`
- `npm run build`
- `npm run package:source` (build a diligence-ready clean source archive)

## Vercel Deploy Notes

- Frontend build: `npm run build`
- Static output: `dist/`
- API runtime: `api/[...route].ts` delegates to `src/server/api/app.ts`
- On Vercel, SQLite defaults to `/tmp/nova-quant/quant.db` unless `DB_PATH` is explicitly provided
- The Vercel runtime will auto-create schema on first cold start, but it will start with an empty ephemeral database unless you connect a persistent backend later
- For investor walkthroughs, use the in-app `Demo Mode / 体验 Demo` switch after deploy

## Clean Source Package (For Advisors / DD)

Create a clean source package:

```bash
npm run package:source
```

Dry run (show exclusion policy only):

```bash
node scripts/package-source.mjs --dry-run
```

Default exclusions include local/runtime artifacts:
- `node_modules/`, `dist/`, `build/`, `coverage/`
- `data/*.db`, `data/*.db-wal`, `data/*.db-shm`, `*.sqlite*`, `*.wal`, `*.shm`
- `__MACOSX/`, `.DS_Store`, local logs/tmp artifacts

## Documentation

- [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md)
- [`docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`](docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md)
- [`docs/RUNTIME_DATA_LINEAGE.md`](docs/RUNTIME_DATA_LINEAGE.md)
- [`docs/REALISM_UPGRADE_SUMMARY.md`](docs/REALISM_UPGRADE_SUMMARY.md)
- [`docs/REPO_RUNBOOK.md`](docs/REPO_RUNBOOK.md)
- [`docs/BACKTEST_REPLAY_PAPER_EVIDENCE_ENGINE.md`](docs/BACKTEST_REPLAY_PAPER_EVIDENCE_ENGINE.md)
- [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md)
- [`docs/SIGNAL_FUNNEL.md`](docs/SIGNAL_FUNNEL.md)

Historical reviews were archived under:
- [`docs/archive/`](docs/archive/)

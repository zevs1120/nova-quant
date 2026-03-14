# Nova Quant

Nova Quant is an AI-native quantitative **decision** platform for US equities and crypto.

It is designed to help self-directed traders reduce emotional trading and execute with discipline.
It is **not** a blind auto-trading bot and does **not** fabricate live performance.

## What This Repository Now Guarantees

- Fresh-environment friendly: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run verify`
- One canonical **Nova Assistant** path across Ask Nova / AI page / chat APIs
- Explicit thread persistence for multi-turn AI conversations
- Deterministic fallback guidance when no LLM provider is configured
- Runtime cache isolation by user + risk profile + market + asset class + timeframe + scope
- Strict runtime status labels for `DB_BACKED`, `MODEL_DERIVED`, `INSUFFICIENT_DATA`, `DISCONNECTED`, `DEMO_ONLY`, and related states
- Clean handoff tooling that excludes local databases, build artifacts, cached node modules, and platform junk

## What Changed In This Runtime-Realism Upgrade

- Runtime now derives from **SQLite + ingested bars + derived state**.
- Frontend default path is now **API-first** (not local pipeline-first).
- Chat tools no longer read `public/mock/*` in runtime path.
- Connectors no longer return fake balances/positions by default.
- Performance outputs now carry source/sample transparency and withhold low-sample metrics.
- Backtest / Replay / Paper now have a shared **Evidence Engine** path with run registry and reconciliation APIs.

## Core Architecture

Primary application layers:
- `src/App.jsx`: mobile-first product shell and tab orchestration
- `src/server/api/app.ts`: canonical API surface for frontend + evidence + assistant
- `src/server/chat/service.ts`: canonical Nova Assistant service with threads, fallback, and evidence-aware prompt assembly
- `src/server/chat/tools.ts`: deterministic internal tool layer (signals, market state, performance, risk, retrieval fallback)
- `src/server/quant/service.ts`: quant runtime synchronization + cache isolation
- `src/server/quant/runtimeDerivation.ts`: DB-backed runtime derivation
- `src/server/evidence/engine.ts`: replay / backtest / evidence engine
- SQLite (`data/quant.db` at runtime, excluded from handoff packages)

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
npm ci
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
npm test
npm run lint
npm run typecheck
npm run build
npm run verify
```

## Notes On Data

- US data: Stooq bulk ingestion (`src/server/ingestion/stooq.ts`) with configured symbol whitelist.
- Crypto data: Binance public bulk + incremental REST ingestion.
- If data is stale/insufficient, APIs return honest degraded states (`INSUFFICIENT_DATA`) instead of synthetic beautification.

## Key Commands

- `npm run clean`
- `npm run lint`
- `npm run db:init`
- `npm run backfill`
- `npm run validate:data`
- `npm run derive:runtime`
- `npm run evidence:run`
- `npm run api:data`
- `npm run dev`
- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run verify`
- `npm run package:source` (build a diligence-ready clean source archive)

## Nova Assistant

Nova Quant now exposes a single canonical assistant stack:

- Frontend AI page and Ask Nova entry both use `/api/chat`
- Conversation threads persist in SQLite (`chat_threads`, `chat_messages`)
- Recent thread memory is fed into the assistant for multi-turn continuity
- Internal context is selected through tools, not by dumping raw runtime JSON into the prompt
- If no provider is configured or a provider fails, Nova degrades honestly to deterministic internal guidance instead of pretending the LLM succeeded

Assistant boundaries:
- It may explain signals, risk posture, positions, and evidence
- It does **not** claim live fills, broker access, or realized performance when those do not exist

## AI-Native Research Layer

Nova Assistant now also supports a research mode aimed at quant research tasks rather than only
signal explanation.

Current research capabilities include:
- factor taxonomy and definition retrieval
- factor interaction lookup
- strategy family registry lookup
- regime diagnostics
- factor diagnostics for current signals
- factor-by-regime comparison
- strategy evaluation reports
- validation report objects
- experiment registry memory
- research workflow planning
- backtest integrity and overfit-risk style checks
- turnover / cost drag review
- failed experiment surfacing
- research topic summarization

This means Nova can now help with:
- "Why does this signal exist?"
- "Why is there no signal right now?"
- "How does momentum usually behave across regimes?"
- "Is this result likely to be overfit?"
- "Does turnover erase the edge after costs?"
- "What should the next research workflow look like?"
- "Which experiments were rejected, and why?"

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
- `.vercel/`, `artifacts/`, `release/`

## Documentation

- [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md)
- [`docs/NOVA_ASSISTANT_ARCHITECTURE.md`](docs/NOVA_ASSISTANT_ARCHITECTURE.md)
- [`docs/QUANT_RESEARCH_DOCTRINE.md`](docs/QUANT_RESEARCH_DOCTRINE.md)
- [`docs/RESEARCH_ASSISTANT_TOOLS.md`](docs/RESEARCH_ASSISTANT_TOOLS.md)
- [`docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`](docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md)
- [`docs/RUNTIME_DATA_LINEAGE.md`](docs/RUNTIME_DATA_LINEAGE.md)
- [`docs/REALISM_UPGRADE_SUMMARY.md`](docs/REALISM_UPGRADE_SUMMARY.md)
- [`docs/REPO_RUNBOOK.md`](docs/REPO_RUNBOOK.md)
- [`docs/BACKTEST_REPLAY_PAPER_EVIDENCE_ENGINE.md`](docs/BACKTEST_REPLAY_PAPER_EVIDENCE_ENGINE.md)
- [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md)
- [`docs/SIGNAL_FUNNEL.md`](docs/SIGNAL_FUNNEL.md)

Historical reviews were archived under:
- [`docs/archive/`](docs/archive/)

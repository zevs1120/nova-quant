# Realism Upgrade Summary

Last updated: 2026-03-12

## Scope

This upgrade focused on replacing runtime mock/synthetic defaults with DB-backed derivation and honest degradation behavior.

## 1) Runtime Mock Removal

Removed default runtime reliance on:

- `public/mock/signals.json`
- `public/mock/velocity.json`
- `public/mock/trades.json`
- `public/mock/performance.json`
- `public/mock/config.json`

Changes:

- `ensureQuantData(...)` now derives runtime state from DB + bars + executions.
- Chat tools no longer use mock fallback files.

## 2) DB-backed Runtime Derivation

Added module:

- `src/server/quant/runtimeDerivation.ts`

Derives:

- market regime/state from bars,
- rule-based signals from bars,
- performance snapshots from executions,
- freshness and coverage summaries.

CLI added:

- `npm run derive:runtime` (`scripts/derive-runtime-state.ts`)

## 3) API-first Frontend Path

Frontend (`src/App.jsx`) now loads runtime from `/api/*` endpoints by default.

Local pipeline remains available only for explicit demo mode:

- `VITE_DEMO_MODE=1`

## 4) Honest Connector Behavior

`src/server/connect/adapters.ts` now defaults to:

- `DISCONNECTED` + null-state snapshots when not configured.
- No fake cash, buying power, balances, or positions.

Connection metadata is persisted via `external_connections`.

## 5) Performance Honesty Upgrades

Runtime performance snapshots now include:

- `source_label`
- `sample_size`
- `status`
- `assumptions`
- withholding behavior for low sample sizes

No default “pretty” synthetic KPI inflation in runtime path.

## 6) Route Consolidation

- Canonical API source remains `src/server/api/app.ts`.
- `api/*.ts` wrappers delegate to shared app.

## 7) Status Taxonomy

Runtime-facing statuses now prioritize:

- `DB_BACKED`
- `REALIZED`
- `PAPER_ONLY`
- `BACKTEST_ONLY`
- `MODEL_DERIVED`
- `EXPERIMENTAL`
- `DISCONNECTED`
- `INSUFFICIENT_DATA`
- `DEMO_ONLY`

## 8) What Remains Approximate

1. Some advanced research modules still use model-derived internals.
2. Broker/exchange adapters are honest-disconnected by default until real providers are wired.
3. Execution realism is still bar-level rather than tick/queue-level.

## 9) Runtime Cache Isolation Hardening

`ensureQuantData(...)` cache is now keyed by runtime context instead of a single global bucket.

Key dimensions:

- `userId`
- `riskProfileKey`
- `market`
- `assetClass`
- `timeframe`
- `universeScope`

Behavior:

- TTL reuse only happens inside the same context key.
- `force=true` only invalidates the current key.
- Cross-user and cross-risk-profile cache pollution is blocked.

## 10) Source/Status Semantics Alignment

Introduced unified status constants in:

- `src/server/runtimeStatus.ts`

Standardized fields:

- `source_status`: component provenance/source class
- `data_status`: current usability/availability conclusion
- `source_label`: UI-facing label aligned to `data_status`

When overall state is `INSUFFICIENT_DATA`, inner UI labels no longer claim `DB_BACKED` without qualification.

## 11) Packaging & Delivery Hygiene

Added repeatable clean-source packaging:

- `npm run package:source`
- `scripts/package-source.mjs`

Added repository export hygiene:

- `.gitignore` hardening
- `.gitattributes` `export-ignore` entries

Package excludes local/runtime artifacts (`node_modules`, `dist`, local DB/WAL/SHM, macOS metadata, logs/tmp).

## 12) Historical Review Archiving

To avoid mixed diligence narratives:

- `docs/global_review/*` and `docs/final_review/*` were moved to `docs/archive/*`.
- Historical files now carry explicit archival warnings.
- Canonical current-state docs stay at top-level `docs/`.

## 13) Demo-Naming Cleanup (localStorage key migration)

New persistent keys now use `nova-quant-*` naming. Legacy `quant-demo-*` keys are read once and migrated.

Examples:

- `quant-demo-risk-profile` -> `nova-quant-risk-profile`
- `quant-demo-watchlist` -> `nova-quant-watchlist`
- `quant-demo-holdings` -> `nova-quant-holdings`
- `quant-demo-executions` -> `nova-quant-executions`
- `quant-demo-ai-recent-questions` -> `nova-quant-ai-recent-questions`

Compatibility behavior:

1. Read new key first.
2. If missing, read legacy key.
3. Write migrated value to new key and remove legacy key.

## 14) Unified Backtest / Replay / Paper Evidence Engine

Added canonical evidence orchestration in:

- `src/server/evidence/engine.ts`

Introduced evidence-chain tables:

- `strategy_versions`
- `dataset_versions`
- `universe_snapshots`
- `feature_snapshots`
- `execution_profiles`
- `backtest_runs`
- `signal_snapshots`
- `backtest_metrics`
- `backtest_artifacts`
- `replay_paper_reconciliation`
- `experiment_registry`

New APIs:

- `POST /api/evidence/run`
- `GET /api/evidence/signals/top`
- `GET /api/evidence/signals/:id`
- `GET /api/evidence/backtests`
- `GET /api/evidence/backtests/:id`
- `GET /api/evidence/reconciliation`
- `GET /api/evidence/strategies/champion`

Behavior updates:

- Canonical backtest source is replay-driven portfolio path (`portfolio_replay`), not synthetic proxy path.
- Replay-vs-paper gaps are persisted and queryable.
- Top-signal evidence includes supporting run/strategy/dataset pointers and reconciliation availability.
- Low sample remains withheld by default; no KPI beautification.

# Runtime Data Lineage

Last updated: 2026-03-24

## 1) Raw Data Sources

### Primary API (US + Crypto)

- Source: **Massive.com** REST API (formerly Polygon.io).
- Ingestion module: `src/server/ingestion/massive.ts`.
- Requires: `MASSIVE_API_KEY` in `.env`. Basic (free) tier enforces 12s delay between requests.
- Invocation: `npm run backfill`.
- Storage: `assets` + `ohlcv` (both `US` and `CRYPTO` markets).

### US Equities (Legacy Fallback)

- Source: Stooq bulk packs.
- Ingestion module: `src/server/ingestion/stooq.ts`.
- Additional fallbacks: `src/server/ingestion/yahoo.ts`, `src/server/ingestion/nasdaq.ts`.
- Storage: `assets` + `ohlcv` (market=`US`).

### Crypto (Legacy Fallback)

- Source A: Binance public historical archives.
- Source B: Binance REST incremental endpoint.
- Ingestion modules:
  - `src/server/ingestion/binancePublic.ts`
  - `src/server/ingestion/binanceIncremental.ts`
  - `src/server/ingestion/binanceDerivatives.ts`
- Storage: `assets` + `ohlcv` (market=`CRYPTO`).

### Normalization

- All ingested bars pass through `src/server/ingestion/normalize.ts` to produce a uniform OHLCV schema.

## 2) Validation Layer

- Module: `src/server/ingestion/validation.ts`.
- CLI: `npm run validate:data`.
- Purpose:
  - detect missing-bar gaps,
  - attempt repair for Binance where possible,
  - log anomalies into `ingest_anomalies`.

## 3) Derived Runtime State

- Module: `src/server/quant/runtimeDerivation.ts`.
- Trigger:
  - API sync path via `ensureQuantData(...)`,
  - explicit CLI via `npm run derive:runtime`.

Derived objects:

1. `market_state`

- trend, volatility percentile, temperature percentile, risk-off score, regime, stance.
- Deterministic and inspectable bar-derived rules.

2. `signals`

- Rule-based generation from real OHLCV.
- Conditions may yield zero signals.
- Signal metadata includes score, status, risk bucket, assumptions, and data status tags.

3. `performance_snapshots`

- Built from recorded `executions` (paper/live labels).
- Low sample => metric withholding (`null` + withheld reason).

4. Freshness/Coverage summaries

- Stale and insufficient coverage are explicitly reported.

## 4) API Consumption Path

Primary API app:

- `src/server/api/app.ts`

Query/service source:

- `src/server/api/queries.ts`
- `src/server/quant/service.ts`

Frontend uses `/api/*` endpoints, especially `/api/runtime-state`, plus:

- `/api/assets`
- `/api/signals`
- `/api/market-state`
- `/api/performance`
- `/api/market/modules`
- `/api/risk-profile`
- `/api/connect/*`
- `/api/evidence/*` for canonical signal/backtest/replay evidence.

## 5) Backtest / Replay / Paper Evidence Lineage

Canonical chain:

1. point-in-time bars and runtime signals
2. `signal_snapshots` (with strategy/dataset references)
3. canonical replay (`portfolio_replay`)
4. `backtest_metrics` + `backtest_artifacts`
5. paper log join via `replay_paper_reconciliation`
6. strategy governance-facing records in `experiment_registry`

Key lineage anchors:

- `dataset_version_id`
- `strategy_version_id`
- `universe_version_id`
- `execution_profile_id`
- `config_hash`

## 6) Performance Semantics

- `REALIZED`: live-labeled execution sample exists.
- `PAPER_ONLY`: paper execution sample only.
- `BACKTEST_ONLY`: backtest dataset only.
- `MIXED`: mixed source path.
- `INSUFFICIENT_DATA`: sample too small or unavailable.

## 7) Chat/Copilot Context Lineage

- Tool context builder: `src/server/chat/tools.ts`.
- Sources: shared query/runtime APIs (DB-backed), not `public/mock/*`.
- Context includes source transparency fields:
  - signal data status
  - market state status
  - performance source/status

## 8) Auth Store Lineage

- Service: `src/server/auth/service.ts` (session, RBAC, middleware).
- Postgres store (production): `src/server/auth/postgresStore.ts` — `users`, `sessions`, `roles`, `password_resets`, `user_state_sync`.
- Legacy KV store: `src/server/auth/remoteKv.ts` (Upstash Redis, deployed fallback).
- Local dev: SQLite-backed auth by default.
- Without any remote auth backend configured, deployed `/api/auth/*` returns `AUTH_STORE_NOT_CONFIGURED`.

## 9) Holdings Import Lineage

- Module: `src/server/holdings/import.ts`.
- Import modes:
  - CSV file upload with auto-detection and normalization.
  - Broker screenshot upload (vision-model parsing).
  - Read-only exchange sync.
- Imported holdings feed into the Decision Engine for portfolio-aware personalization.

## 10) Connector Lineage

- Adapter module: `src/server/connect/adapters.ts`.
- Default snapshot behavior:
  - `DISCONNECTED` with null positions/balances if not configured.
- Connection checks are persisted in `external_connections`.

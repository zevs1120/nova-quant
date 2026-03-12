# Nova Quant System Architecture

Last updated: 2026-03-12

## 1) Layer Overview

1. **Frontend (React/Vite)**
- `src/App.jsx` and UI tabs (`Today`, `AI`, `Holdings`, `More`).
- Default runtime path is now API-first (`/api/*`).
- Local pipeline path is retained only as explicit demo mode (`VITE_DEMO_MODE=1`).

2. **API Layer**
- Canonical API app: `src/server/api/app.ts`.
- Shared data/query layer: `src/server/api/queries.ts`.
- Vercel wrappers in `api/*.ts` delegate to shared API app.

3. **Persistence Layer**
- SQLite database (`data/quant.db`).
- Schema: `src/server/db/schema.ts`.
- Repository operations: `src/server/db/repository.ts`.

4. **Ingestion Layer**
- US: `src/server/ingestion/stooq.ts`.
- Crypto: `src/server/ingestion/binancePublic.ts`, `src/server/ingestion/binanceIncremental.ts`.
- Validation/repair: `src/server/ingestion/validation.ts`.

5. **Derived Runtime Layer**
- Runtime derivation: `src/server/quant/runtimeDerivation.ts`.
- Quant orchestration: `src/server/quant/service.ts` (`ensureQuantData`).
- Derives market state, rule-based signals, performance snapshots, freshness/coverage summaries.
- Includes Panda adaptive backend overlay (`src/server/quant/pandaEngine.ts`) for:
  - auto factor scoring/selection
  - adaptive risk/position parameters
  - risk-bucket trade gating

6. **Research Layer**
- Research core modules under `src/research/`.
- Strategy/discovery/validation/governance/evidence/portfolio/copilot are retained as structured research outputs.
- Product runtime endpoints now avoid mock-backed shortcuts by default.

7. **Evidence Engine Layer**
- Canonical module: `src/server/evidence/engine.ts`.
- Unifies signal snapshots, portfolio replay, execution-profile realism stress, and replay-vs-paper reconciliation.
- Persists run registry + artifacts in:
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

8. **Chat/Copilot Layer**
- Chat stream service: `src/server/chat/service.ts`.
- Tool context builder: `src/server/chat/tools.ts`.
- Tools now consume DB/shared query outputs; runtime mock fallbacks removed.

9. **Connectivity Layer**
- Adapter interfaces: `src/server/connect/adapters.ts`.
- Default behavior is honest disconnected/null-state unless credentials and provider integration are truly available.

## 2) Runtime Data Flow

1. `npm run backfill` ingests raw bars into `assets` + `ohlcv`.
2. `npm run validate:data` checks/repairs gaps where possible.
3. `npm run derive:runtime` runs `ensureQuantData(...)`, which:
- derives `market_state`,
- generates rule-based `signals`,
- writes `performance_snapshots`,
- emits freshness/coverage metadata.
4. `/api/runtime-state` and related `/api/*` endpoints read DB-backed objects and return transparent status.
5. Frontend requests API endpoints and renders decision UX with `data_status/source_status`.
6. Evidence endpoints expose canonical replay/paper chain:
   - `/api/evidence/run`
   - `/api/evidence/signals/top`
   - `/api/evidence/backtests`
   - `/api/evidence/reconciliation`
   - `/api/evidence/strategies/champion`

## 3) Source of Truth Rules

- Runtime truth path is **DB + ingestion + derived state**.
- Backtest/replay/paper truth path is **Evidence Engine canonical replay**.
- `public/mock/*` is not used as default runtime source.
- If data is missing/stale, APIs return honest degraded status (`INSUFFICIENT_DATA`, `DISCONNECTED`) rather than synthetic substitution.

## 4) Primary Runtime Objects

- `assets`
- `ohlcv`
- `market_state`
- `signals`
- `executions`
- `performance_snapshots`
- `external_connections`

## 5) Demo vs Runtime Boundary

- **Runtime default**: DB-backed APIs.
- **Demo-only**: local pipeline path enabled only by explicit frontend demo mode flag.
- Any unavailable live capability must degrade to `unavailable/disconnected` rather than fabricated snapshots.

## 6) Runtime Cache Isolation

`ensureQuantData(...)` cache is keyed by runtime context (not global singleton):
- `userId`
- `riskProfileKey`
- `market`
- `assetClass`
- `timeframe`
- `universeScope`

TTL reuse is scoped to the same key; force refresh invalidates only the current key.

## 7) Status Semantics

Unified status constants are defined in:
- `src/server/runtimeStatus.ts`

Semantics:
- `source_status`: where a component came from (provenance).
- `data_status`: whether this component is currently usable.
- `source_label`: UI-facing label aligned with `data_status`.

This prevents inconsistent messages such as overall `INSUFFICIENT_DATA` with misleading inner `DB_BACKED` labels.

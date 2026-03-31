# Nova Quant System Architecture

Last updated: 2026-03-24

## 1) Layer Overview

1. **Frontend (React/Vite)**

- `src/App.jsx`: thin orchestrator shell (~955 lines); composes custom hooks and renders top bar, tab bar, and screen routing.
- `src/hooks/useAuth.js`: full auth lifecycle (login, signup, session hydration, profile sync, logout).
- `src/hooks/useAppData.js`: 11-endpoint parallel data loading with 2-minute auto-refresh.
- `src/hooks/useEngagement.js`: engagement state, discipline tracking, execution recording, VIP redemption.
- `src/hooks/useInvestorDemo.js`: investor demo mode, holdings source composition, data overlay.
- `src/hooks/useNavigation.js`: tab/stack navigation, My-tab routing, AI seed requests.
- `src/config/appConstants.js`: shared constants, locale builders, default data shapes.
- `src/styles/`: 12 ordered CSS modules (`base` → `corrections`) replacing the monolithic `styles.css`. Import order preserves the design cascade.
- Bottom navigation: **Today**, **Nova** (AI), **Browse**, **My**.
- Deeper surfaces (holdings, signals, weekly review, menu/settings, risk, research, etc.) are reached from **My**, menus, or in-tab navigation—not separate bottom tabs.
- Default runtime path is API-first (`/api/*` via Vite proxy in local dev).
- Local pipeline / demo paths are gated by explicit demo and investor-demo switches (see `src/demo/` and env flags in README).

2. **API Layer**

- Canonical API app: `src/server/api/app.ts`.
- Shared data/query layer: `src/server/api/queries.ts`.
- Vercel wrappers in `api/*.ts` delegate to shared API app.

3. **Persistence Layer**

- SQLite database (`data/quant.db`).
- Schema: `src/server/db/schema.ts`.
- Repository operations: `src/server/db/repository.ts`.

4. **Ingestion Layer**

- Primary (US + Crypto): `src/server/ingestion/massive.ts` — Massive.com REST API (requires `MASSIVE_API_KEY`).
- US legacy fallback: `src/server/ingestion/stooq.ts`.
- Crypto legacy fallback: `src/server/ingestion/binancePublic.ts`, `src/server/ingestion/binanceIncremental.ts`.
- Additional: `src/server/ingestion/yahoo.ts`, `src/server/ingestion/nasdaq.ts`, `src/server/ingestion/hostedData.ts`.
- Normalization: `src/server/ingestion/normalize.ts`.
- Validation/repair: `src/server/ingestion/validation.ts`.

4b. **Auth Layer**

- Service: `src/server/auth/service.ts` — session-scoped auth, RBAC, middleware.
- Postgres store (production): `src/server/auth/postgresStore.ts` — users, sessions, roles, password resets.
- Legacy KV store: `src/server/auth/remoteKv.ts` (Upstash Redis).
- Native Supabase Auth Delivery: `src/server/auth/supabase.ts` (handles emails via Supabase Edge).

4c. **Holdings Import**

- Module: `src/server/holdings/import.ts` — CSV, broker screenshot (vision-model), and exchange sync.

4d. **News Layer**

- Provider: `src/server/news/provider.ts` — aggregated news fetching.
- Gemini factor extraction: `src/server/news/geminiFactors.ts`.

4e. **Admin / LiveOps Layer**

- Admin service: `src/server/admin/service.ts`.
- Research Ops aggregation: `src/server/admin/liveOps.ts` — workflows, data intake, Alpha eval, training.

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

- Canonical assistant service: `src/server/chat/service.ts`.
- Tool context builder: `src/server/chat/tools.ts`.
- Prompt assembly: `src/server/chat/prompts.ts`.
- Provider adapters: `src/server/chat/providers/*`.
- Research knowledge + evaluation layer:
  - `src/server/research/knowledge.ts`
  - `src/server/research/tools.ts`
  - `src/server/research/evaluation.ts`
- Thread persistence:
  - `chat_threads`
  - `chat_messages`
- Frontend AI entry now uses the canonical backend assistant rather than a separate local-only AI path.
- Deterministic retrieval remains available, but only as a backend tool / fallback aid.
- Research mode now exposes:
  - factor taxonomy and interactions
  - strategy metadata
  - regime diagnostics
  - strategy evaluation reports
  - validation report objects
  - experiment registry memory
  - research workflow plans

9. **Connectivity Layer**

- Adapter interfaces: `src/server/connect/adapters.ts`.
- Default behavior is honest disconnected/null-state unless credentials and provider integration are truly available.

10. **Decision Engine Layer**

- Canonical module: `src/server/decision/engine.ts`.
- Converts eligible signals into:
  - risk-adjudicated decisions,
  - portfolio-intent-aware action cards,
  - evidence bundles,
  - persisted decision audit snapshots.
- Primary outputs:
  - `today_call`
  - `risk_state`
  - `portfolio_context`
  - `ranked_action_cards`
  - `evidence_summary`
  - `audit`

11. **Engagement Layer**

- Canonical module: `src/server/engagement/engine.ts`.
- Converts persisted decision snapshots into:
  - `daily_check_state`
  - `habit_state`
  - `daily_wrap_up`
  - `widget_summary`
  - `notification_center`
  - `ui_regime_state`
  - `notification_preferences`
- Persistence:
  - `user_ritual_events`
  - `notification_events`
  - `user_notification_preferences`

## 2) Runtime Data Flow

1. `npm run backfill` ingests raw bars into `assets` + `ohlcv`.
2. `npm run validate:data` checks/repairs gaps where possible.
3. `npm run derive:runtime` runs `ensureQuantData(...)`, which:

- derives `market_state`,
- generates rule-based `signals`,
- writes `performance_snapshots`,
- emits freshness/coverage metadata.

4. `/api/runtime-state` and related `/api/*` endpoints read DB-backed objects and return transparent status.
5. `/api/chat` uses:

- user context,
- recent thread memory,
- evidence-aware tools,
- provider fallback strategy,
- deterministic internal fallback when no provider is available.

6. Frontend requests API endpoints and renders decision UX with `data_status/source_status`.
7. `POST /api/decision/today` combines:

- current runtime state,
- user risk profile,
- existing holdings context,
- recent execution pressure,
- evidence-ranked signals,
  and persists a `decision_snapshot`.

8. The assistant grounds on:

- runtime decision summary,
- holdings summary,
- engagement rhythm summary,
- evidence bundle lines,
- research tools when questions move beyond product explanation.

9. The engagement layer turns those objects into calm habit surfaces:
   - Morning Check
   - protective reminders
   - widget summaries
   - evening wrap-up
10. Evidence endpoints expose canonical replay/paper chain:
    - `/api/evidence/run`
    - `/api/evidence/signals/top`
    - `/api/evidence/backtests`
    - `/api/evidence/reconciliation`
    - `/api/evidence/strategies/champion`

## 3) Source of Truth Rules

- Runtime truth path is **DB + ingestion + derived state**.
- Decision truth path is **runtime state + risk/regime policy + portfolio context + evidence ranking**.
- Backtest/replay/paper truth path is **Evidence Engine canonical replay**.
- `public/mock/*` is not used as default runtime source.
- If data is missing/stale, APIs return honest degraded status (`INSUFFICIENT_DATA`, `DISCONNECTED`) rather than synthetic substitution.

## 4) Primary Runtime Objects

- `assets`
- `ohlcv`
- `market_state`
- `signals`
- `decision_snapshots`
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

## 8) Canonical Nova Assistant Contract

Nova Quant now has one user-facing AI brain:

- `AiPage`
- Ask Nova entry points
- `ChatAssistant` fallback UI

All of them use the same backend chat API and same thread store.

Assistant capabilities:

- multi-turn thread memory,
- evidence-aware context selection,
- internal tool access,
- provider fallback,
- honest deterministic fallback.

Assistant non-goals:

- no fabricated live broker access,
- no invented realized performance,
- no fake trade execution claims.

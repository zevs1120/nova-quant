# Technical Due Diligence Guide

Last updated: 2026-03-23

## 1) What Nova Quant Is Today

Nova Quant is an AI-native quantitative **decision** platform for US equities and crypto: research outputs, paper-style execution records, evidence/replay, and assistant-grounded explanations.

**Live broker/exchange routing** exists in code paths behind explicit **credentials** and **feature flags** (see `src/server/connect/adapters.ts`, `POST /api/executions` with `mode: LIVE`). Default posture remains **honest disconnected / paper** when nothing is configured—this is product intent, not absence of implementation.

## 2) What Is Real vs Experimental

### DB-backed runtime (real)
- Ingestion pipelines writing to SQLite (`assets`, `ohlcv`).
- Derived market state from historical bars (`market_state`).
- Rule-based signal generation from bars (`signals`).
- Execution log and paper/live action records (`executions`).
- Performance snapshots derived from recorded executions (`performance_snapshots`).
- External connection status records (`external_connections`).
- Canonical Evidence Engine records:
  - signal snapshots
  - portfolio replay runs
  - metrics/artifacts
  - replay-vs-paper reconciliation
  - strategy/dataset/execution-profile lineage.
- Canonical Nova Assistant records:
  - `chat_threads`
  - `chat_messages`
  - `chat_audit_logs`
  - evidence-aware tool context assembly
  - deterministic fallback when provider access is unavailable
- Canonical decision engine records:
  - `decision_snapshots`
  - ranked action cards
  - evidence bundles
  - personalized portfolio-context-aware recommendation snapshots

### Experimental/model-derived
- Some advanced research core analytics remain model-derived.
- Portfolio simulation and some discovery outputs are research-grade and not live execution proof.

### Not production-complete (typical diligence caveats)

- End-to-end **production** broker OAuth/onboarding and operational hardening are not implied by the presence of adapters alone.
- Tick-level / queue-level execution simulation (microstructure) is out of scope for the current bar-based stack.

## 3) Current Source-of-Truth Design

Canonical backend entrypoint:
- `src/server/api/app.ts`

Shared query/service path:
- `src/server/api/queries.ts`
- `src/server/quant/service.ts`
- `src/server/quant/runtimeDerivation.ts`
- `src/server/decision/engine.ts`
- `src/server/chat/service.ts`
- `src/server/chat/tools.ts`
- `src/server/chat/prompts.ts`

Wrapper routes (`api/*.ts`) delegate to shared app layer.

## 4) Runtime Authenticity Rules

1. Do not fabricate broker/exchange snapshots.
2. Do not present synthetic high-confidence metrics as realized truth.
3. If sample size is too low, withhold metric (`null`, `insufficient_sample`).
4. Always attach status/source metadata where possible.
5. Recommendations are produced through a decision layer, not by passing raw signals straight to the homepage.

## 5) Validation and Performance Realism

- Performance snapshots are split by source labels (`PAPER`, `LIVE`, `BACKTEST`, `MIXED`).
- Runtime APIs expose `source_status`, `data_status`, freshness and coverage summaries.
- Low-sample performance metrics are withheld, not inflated.
- Canonical evidence path uses replay-driven portfolio runs (`backtest_runs` with `portfolio_replay`), not synthetic proxy as source of record.
- Replay-vs-paper reconciliation is explicitly tracked and queryable.

## 6) Connectivity Posture

Default connector posture is honest:
- `DISCONNECTED` + null balances/positions when not configured.
- No fake buying power or fake holdings.
- Connection checks and metadata are persisted in `external_connections`.

## 7) Reproducibility Path

Fresh clone baseline:

```bash
npm ci
npm run clean
npm run db:init
npm run backfill -- --market CRYPTO --tf 1h
npm run validate:data -- --tf 1h --lookbackBars 800
npm run derive:runtime
npm run api:data
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npm run verify
```

## 8) Canonical Assistant Reality

The product now exposes one assistant path, not two separate AI personalities:
- frontend AI page -> `/api/chat`
- Ask Nova shortcuts -> `/api/chat`
- legacy sheet UI -> `/api/chat`

Provider behavior:
- if a configured provider succeeds, Nova returns the provider-backed answer
- if a provider times out / fails / returns malformed or empty output, Nova falls back to the next provider
- if no provider is configured, Nova returns deterministic internal guidance with explicit honesty about the fallback mode

## 9) Honest Limitations (Current)

1. US daily/hourly bars may be incomplete until additional Stooq runs complete.
2. Some research subsystems still use synthetic/model-derived internals for exploration.
3. Connectors and live routing **do not fabricate** balances or fills; without credentials/flags the UI/API should surface `DISCONNECTED` / `NO_CREDENTIALS` style states.
4. Execution realism is bar-level; no tick/queue microstructure simulation in the default stack.
5. Treat **optional** live routing as operationally sensitive: kill-switch, governance, and reconciliation APIs exist—production readiness still depends on deployment, keys, and process.

## 10) Canonical vs Historical Documentation

Canonical current-state documents:

- `docs/REPOSITORY_OVERVIEW.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`
- `docs/RUNTIME_DATA_LINEAGE.md`
- `docs/REALISM_UPGRADE_SUMMARY.md`
- `docs/REPO_RUNBOOK.md`
- `docs/VERSIONING.md`

Historical review snapshots are archived under:
- `docs/archive/`

Archived review files are retained for traceability and should not be treated as current system truth.

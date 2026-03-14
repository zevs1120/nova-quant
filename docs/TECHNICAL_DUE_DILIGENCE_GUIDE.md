# Technical Due Diligence Guide

Last updated: 2026-03-14

## 1) What Nova Quant Is Today

Nova Quant is an early-stage AI-native quantitative decision platform.
It supports research + paper-trading style decision outputs for US equities and crypto.

It is **not** currently a broker-connected live trading stack.

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

### Not yet implemented
- Real broker position/balance sync in production path.
- Live order routing.
- Tick-level execution simulation.

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
3. Live broker adapters are interface-ready but intentionally not faked in runtime.
4. Execution realism is still bar-level; no queue-level microstructure simulation.
5. Strategy-level live broker execution remains unimplemented by design (honest disconnected connector posture).

## 10) Canonical vs Historical Documentation

Canonical current-state documents:
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`
- `docs/RUNTIME_DATA_LINEAGE.md`
- `docs/REALISM_UPGRADE_SUMMARY.md`
- `docs/REPO_RUNBOOK.md`

Historical review snapshots are archived under:
- `docs/archive/`

Archived review files are retained for traceability and should not be treated as current system truth.

# Backtest / Replay / Paper Evidence Engine

Last updated: 2026-03-12

## 1) Why This Layer Exists

Nova Quant previously had replay, performance, paper execution, and research diagnostics as partially separate paths.
This Evidence Engine unifies them into one auditable chain:

point-in-time data
-> signal snapshots
-> canonical replay
-> portfolio replay metrics/artifacts
-> paper execution reconciliation
-> run registry + governance view
-> product-facing evidence APIs

The goal is traceability and realism, not vanity metrics.

## 2) Canonical vs Experimental Paths

### Canonical path (production-intended evidence source)
- `src/server/evidence/engine.ts`
- run type: `portfolio_replay`
- event-ordered bar replay with explicit execution profile assumptions
- writes registry rows (`backtest_runs`, `backtest_metrics`, `signal_snapshots`, `backtest_artifacts`, `replay_paper_reconciliation`)

### Experimental paths (non-canonical)
- legacy model-only portfolio simulation / synthetic proxy research outputs
- still usable for ideation, but not treated as formal evidence
- should be clearly marked `EXPERIMENTAL` or `MODEL_DERIVED`

## 3) Core Evidence Entities

Implemented in SQLite schema:
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

This allows a signal or strategy claim to be traced to dataset/version/config/execution assumptions.

## 4) Versioning Semantics

Every canonical evidence run records:
- `dataset_version_id`
- `strategy_version_id` (champion/challenger context)
- `universe_version_id`
- `execution_profile_id`
- `config_hash`
- time window metadata (`train_window`, `validation_window`, `test_window` where relevant)

Versioning is metadata-first (hash + pointers), not full immutable warehouse snapshots.

## 5) Replay and Portfolio Logic

Canonical replay includes:
- signal entry trigger checks
- fill-policy assumptions (`touch`, `bar_cross`, `conservative`)
- slippage/spread/fee/funding effects via execution profile
- stop/target/horizon exits
- daily equity aggregation
- attribution slices (family/symbol/market/regime/conviction/horizon/side/cost bucket)

If sample is insufficient, metrics are withheld (`WITHHELD`) instead of fabricated.

## 6) Replay vs Paper Reconciliation

`replay_paper_reconciliation` quantifies divergence per signal/trade group:
- expected vs paper fill
- expected vs paper pnl
- expected vs actual hold period
- slippage gap
- reconciliation status:
  - `RECONCILED`
  - `PAPER_DATA_UNAVAILABLE`
  - `REPLAY_DATA_UNAVAILABLE`
  - `PARTIAL`

No paper data means explicit unavailable status, never synthetic substitution.

## 7) Evidence APIs

New API views:
- `POST /api/evidence/run`
- `GET /api/evidence/signals/top`
- `GET /api/evidence/signals/:id`
- `GET /api/evidence/backtests`
- `GET /api/evidence/backtests/:id`
- `GET /api/evidence/reconciliation`
- `GET /api/evidence/strategies/champion`

These are DB-backed and expose transparency fields.

## 8) Honesty / Degradation Rules

When conditions are weak:
- insufficient bars/samples -> `INSUFFICIENT_DATA` or `WITHHELD`
- no paper fills -> `PAPER_DATA_UNAVAILABLE`
- connector not configured -> `DISCONNECTED` / `NO_CREDENTIALS`
- non-canonical model path -> `EXPERIMENTAL` / `MODEL_DERIVED`

Evidence output quality always takes precedence over cosmetic completeness.

## 9) How To Run

```bash
npm run db:init
npm run backfill -- --market CRYPTO --tf 1h
npm run validate:data -- --tf 1h --lookbackBars 800
npm run derive:runtime
npm run evidence:run
```

Or via API:

```bash
curl -X POST http://127.0.0.1:8787/api/evidence/run \
  -H "Content-Type: application/json" \
  -d '{"userId":"guest-default","market":"US","assetClass":"US_STOCK","timeframe":"1d","maxSignals":120}'
```


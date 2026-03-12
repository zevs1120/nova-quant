# Research Loop v1 (Self-Improving, Controlled)

## Purpose
Nova Quant v1 research loop is a **controlled learning loop**:

`data update -> feature recompute -> alpha/model/risk refresh -> snapshot logging -> backtest/paper/challenger evaluation -> promotion decision`

It does **not** auto-replace live strategy.

## Runtime Entry
- Main entry: `src/quant/researchLoop.js` (`buildResearchLoop`)
- Pipeline integration: `src/engines/pipeline.js`
- Local persistence: `src/quant/researchStore.js`

## Daily Pipeline Steps
1. Read local sample market data and run full quant system by date.
2. Recompute features for all tickers.
3. Recompute alpha scores and alpha diagnostics.
4. Recompute regime/risk/ranking/portfolio outputs.
5. Build daily snapshot object.
6. Persist merged history into local research store (localStorage or in-memory fallback).

## Snapshot Contract (Core)
Each daily snapshot includes:
- `date`
- `market_regime`
- `safety_score`
- `suggested_exposure` (gross/net)
- `selected_opportunities`
- `filtered_opportunities`
- `active_alpha_summary`
- `risk_drivers`

Champion history also stores typed snapshots:
- `MarketSnapshot`
- `FeatureSnapshot`
- `ModelOutput`
- `PortfolioSnapshot`
- `RiskSnapshot`

## Historical Recording
Research store tracks:
- `daily_snapshots`
- `model_history`
- `risk_history`
- `portfolio_history`
- `alpha_daily_stats`
- `promotion_decisions`
- `experiments`
- `runs` (metadata of each loop run)

## Data Provenance
- `sample_market_data`: local deterministic bars
- `derived_features`: feature calculations
- `simulated_signals`: alpha/model/portfolio outputs
- `simulated_backtest_engine`: backtest result objects
- `simulated_paper_trading`: paper ledger results
- `live_not_available`: explicit upcoming label

## Future Upgrade Path
1. Replace sample adapter with real market data API.
2. Replace local store with DB/object store.
3. Replace deterministic scoring with train/infer model service.
4. Attach broker execution layer and keep same contracts.

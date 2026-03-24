# Multi-Asset Roadmap

## Stage 1 (Completed in v1)

- Unified asset registry + provenance metadata
- Asset-specific schemas for equities/options/crypto spot
- Feature factories per asset class
- Training dataset builders per asset class
- Data quality report and source health summary
- Internal UI/AI mapping for dataset coverage and quality

## Stage 2 (Next)

### Equities

- Connect licensed daily/intraday feed
- Add corporate actions, fundamentals, macro joins
- Add survivorship-bias controlled universe snapshots

### Options

- Connect real contract chain snapshots + historical bars
- Add robust term/skew surfaces and smile interpolation
- Improve liquidity-aware labeling (execution realism)

### Crypto Spot

- Add multi-exchange symbol harmonization
- Add order book/top-of-book feature channels
- Add venue-level quality and latency diagnostics

## Stage 3 (Research Infrastructure)

- Incremental dataset updates and versioned snapshots
- Feature store + reproducible training manifests
- Walk-forward + regime-aware cross-asset evaluation

## Stage 4 (Execution Bridge)

- Paper execution by asset class with unified ledger contracts
- Broker/exchange adapters with risk guardrails
- Promotion governance remains champion/challenger controlled

## Guardrails

- Never label simulated metrics as live
- Keep source/license tags attached to each data object
- Promotion to production requires data quality and stability gates

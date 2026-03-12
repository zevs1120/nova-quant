# Backtest Engine v1

## Scope
Backtest engine is implemented in `src/quant/researchLoop.js` via `runBacktestEngine`.

This is a deterministic v1 engine intended for:
- uniform research comparison
- champion/challenger ranking
- explainable metrics in UI

It is not a broker-grade event simulator.

## Supported Modes
1. Multi-alpha strategy backtest (champion/challenger configs).
2. Single-alpha proxy backtest (`runSingleAlphaBacktests`).

## Inputs
- Daily strategy snapshots (portfolio selection, risk mode, regime, weights).
- Strategy config (thresholds, penalties, exposure constraints).

## Return Construction
Per day:
- estimate edge from score/risk/weight/direction
- apply regime penalty (risk-off conditions)
- compute transaction cost using turnover and per-position fee
- produce:
  - `pre_cost_return`
  - `post_cost_return`
  - `turnover`
  - `gross_exposure_pct`
  - `net_exposure_pct`

## Output Contract (`BacktestResult`)
- `daily`
- `monthly`
- `cumulative_return_pre_cost`
- `cumulative_return_post_cost`
- `win_rate`
- `avg_holding_period`
- `max_drawdown`
- `sharpe`
- `sortino`
- `turnover`
- `exposure_summary`
- `regime_breakdown`
- `cost_assumptions`

## Regime Segment Reporting
Engine outputs regime-level summaries:
- sample days
- average return
- win rate

This is used for stability and promotion checks.

## Data Labels and Honesty
All outputs are tagged as:
- `source_type: simulated_backtest_engine`
or
- `source_type: single_alpha_backtest_proxy`

No live claims are made.

## Next Upgrade Targets
1. Event-driven fills with session calendar.
2. Slippage model by ADV/volatility bucket.
3. Walk-forward train/test windows with frozen params.
4. Attribution by alpha family and risk gate impact.

# Paper Trading Ledger v1

## Scope
Paper trading layer is implemented in `src/quant/researchLoop.js` via `runPaperLedger`.

Goal: bridge signal plans to execution-like outcomes without broker API.

## Daily Flow
1. Update open paper positions mark-to-market.
2. Close positions on holding window/risk cut/large move conditions.
3. Generate new paper orders from selected opportunities.
4. Fill or reject orders based on current risk mode.
5. Update ledger and equity curve.

## Core Objects
- `PaperOrder`
  - `order_id`, `strategy_id`, `date`, `ticker`, `side`
  - `target_weight_pct`, `status`
  - `fill_price`, `assumed_slippage_bps`
- `PaperPosition`
  - `ticker`, `side`, `qty`
  - `avg_price`, `mark_price`
  - `holding_days`, `max_holding_days`
  - `unrealized_pnl`

## Ledger Output
- `orders`
- `transactions` (open/close)
- `current_positions`
- `equity_curve`
- `summary`:
  - total/filled orders
  - open positions
  - realized/unrealized pnl
  - win rate
  - total return

## Integration
- Performance page reads paper summary, orders, and equity trajectory.
- Diagnostics uses paper-vs-backtest gap.
- Governance uses paper behavior as promotion evidence.

## Data Source Label
- `source_type: simulated_paper_trading`

This is explicitly simulated and not broker-connected execution.

## Future Upgrade Targets
1. Replace with execution adapter interface (broker/paper API).
2. Add order state machine (pending/partial/cancel/reject).
3. Add latency/slippage model by liquidity regime.
4. Add reconciliation between model intent and fill outcomes.

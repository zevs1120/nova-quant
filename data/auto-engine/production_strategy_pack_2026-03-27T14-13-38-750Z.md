A. Strategy Hypothesis
- Use trend-following as the core edge, but only trade when volatility is controlled and breakouts are confirmed by volume.
- Keep the model low-parameter and rule-based so every signal remains auditable.
- Current blended target check: Sharpe 2.027, annual 2.21%, max DD 0.22%.

B. Markets And Timeframes
- US: execution on 1d, holding window 12 bars max.
- CRYPTO: execution on 4h, holding window 16 bars max.

C. Entry Logic
- Close must be above fast EMA, and fast EMA above slow EMA.
- Close must break the rolling prior-high lookback with a volume ratio filter.
- ATR percent must stay inside a bounded range to avoid dead markets and panic markets.

D. Exit Logic
- Hard ATR stop is placed at entry and only tightens afterward.
- Trend break below fast and slow EMA triggers next-bar exit.
- Time stop forces capital recycling when momentum stalls.

E. Position Sizing
- Position size is risk-budgeted from stop distance, then clipped by max position and liquidity participation caps.
- More aggressive profiles raise size modestly; they do not loosen signal filters.
- Current template range: us_guarded_50 max position 5.5%, us_guarded_40 max position 6.4%, us_guarded_30 max position 7.2%, us_guarded_20 max position 8.0%.

F. Risk Controls
- One-bar execution delay, paper-grade slippage/spread assumptions, and partial-fill sizing are always on.
- Liquidity filter rejects thin symbols before entry.
- Selection favors lower drawdown and lower trade density when targets conflict.

G. Anti-Overfitting
- Only a small predeclared config grid is evaluated. No unconstrained optimizer is used.
- Each market pack includes train/test split, walk-forward windows, and a full robustness grid.
- US: 0/4 configs meet all targets. CRYPTO: 0/4 configs meet all targets.

H. Anti-Lookahead
- Signals are generated from completed bar close only.
- Entries always happen on the next bar open, never the same bar.
- Detected future-leak violations in this run: 0.

I. Backtest Realism
- Backtests include spread, slippage, fees, funding/borrow drag proxy, execution delay, and partial-fill sizing.
- Stress scenarios include wider spread, more slippage, adverse funding, and stricter fills.
- US worst stress: baseline annual 0.00%, DD 0.00%. CRYPTO worst stress: slippage_plus_50 annual 7.61%, DD 0.70%.

J. Key Metrics
- Combined annual return: 2.21%
- Combined max drawdown: 0.22%
- Combined sharpe: 2.027

K. Runnable Code
- Strategy engine: src/server/nova/productionStrategyPack.ts
- CLI runner: scripts/run-nova-production-strategy-pack.ts
- Coverage test: tests/novaProductionStrategyPack.test.ts

L. Deployment
- Vercel API: POST /api/nova/strategy/production-pack
- AWS job: npm run nova:strategy:pack -- --market ALL --risk-profile balanced --start 2023-01-01 --end 2026-03-27
- Workflow runs and audit events are already mirror-friendly, so the JSON payload can be read from Supabase-backed mirrors without changing the strategy contract.

M. Operator Guide
- Load OHLCV into SQLite/Supabase mirror first, then call the API or run the CLI.
- Review the returned sections, grid, walk-forward, and stress blocks before publishing a strategy.
- If targets are missed, keep the tighter config; do not loosen filters to chase backtest performance.

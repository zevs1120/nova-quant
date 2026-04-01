A. Strategy Hypothesis
- Use a governed blend of trend breakout, trend pullback re-entry, and mean reversion so the system earns in more market states without simply levering up.
- Keep the model low-parameter and rule-based so every signal remains auditable.
- Current blended target check: Sharpe 1.6794, annual 13.97%, max DD 3.70%.

B. Markets And Timeframes
- US: execution on 1d, holding window 18 bars max.
- CRYPTO: execution on 4h, holding window 52 bars max.

C. Entry Logic
- Trend breakout entries require fast-above-slow trend, prior-high break, rotation score confirmation, and liquidity filters.
- Trend pullback entries buy controlled pullbacks back into EMA support, then re-enter on trend resumption.
- Mean reversion entries only activate outside risk-off conditions and require statistically stretched pullbacks that can mean-revert quickly.

D. Exit Logic
- Hard ATR stop is placed at entry and only tightens afterward.
- Large winners switch into profit-lock mode so strong trends can run longer before being exited.
- Mean reversion exits harvest back to fast EMA / normalization, while time stops recycle dead capital.

E. Position Sizing
- Position size is risk-budgeted from stop distance, signal quality, and style-level market budget, then clipped by max position and liquidity participation caps.
- Capital is re-routed toward the active style and market sleeve instead of sitting idle in a fixed 65/35 split.
- Current template range: us_pullback_22 max position 7.0%, us_pullback_16 max position 7.5%, us_guarded_50 max position 5.5%, us_guarded_40 max position 6.4%, us_guarded_30 max position 7.2%, us_guarded_20 max position 8.0%, us_meanrev_14 max position 5.5%, us_meanrev_10 max position 6.0%.

F. Risk Controls
- One-bar execution delay, paper-grade slippage/spread assumptions, and partial-fill sizing are always on.
- Liquidity filter rejects thin symbols before entry, and risk-off regimes automatically tilt away from breakout risk.
- Selection favors lower drawdown and lower trade density when targets conflict.

G. Anti-Overfitting
- Only a constrained template grid is evaluated. Promotion uses robust parameter intervals, not a single best point.
- Each market pack includes train/test split, walk-forward windows, cross-asset validation, regime migration checks, parameter heatmap stability, and perturbation stress.
- Current robust interval snapshot: breakout_lookback 16-22, ema_fast 18-20, ema_slow 90-100, stop_atr 1.9-2.
- US: effective parameter budget 6/21, OOS pass 0%, perturbation pass 89%. CRYPTO: effective parameter budget 6/21, OOS pass 33%, perturbation pass 100%.

H. Anti-Lookahead
- Signals are generated from completed bar close only.
- Entries always happen on the next bar open, never the same bar.
- Detected future-leak violations in this run: 0.

I. Backtest Realism
- Backtests include spread, slippage, fees, funding/borrow drag proxy, execution delay, and partial-fill sizing.
- Stress scenarios include wider spread, more slippage, adverse funding, and stricter fills.
- US worst stress: adverse_price_shift_10bps annual 0.65%, DD 0.72%. CRYPTO worst stress: adverse_price_shift_10bps annual 15.54%, DD 3.97%.

J. Key Metrics
- Combined annual return: 13.97%
- Combined max drawdown: 3.70%
- Combined sharpe: 1.6794

K. Runnable Code
- Strategy engine: src/server/nova/productionStrategyPack.ts
- CLI runner: scripts/run-nova-production-strategy-pack.ts
- Coverage test: tests/novaProductionStrategyPack.test.ts

L. Deployment
- Vercel API: POST /api/nova/strategy/production-pack
- AWS job: npm run nova:strategy:pack -- --market ALL --risk-profile balanced --start 2023-01-01 --end 2026-03-27
- Workflow runs and audit events are already mirror-friendly, so the JSON payload can be read from Supabase-backed mirrors without changing the strategy contract.

M. Operator Guide
- Load OHLCV into the Supabase-backed runtime first, then call the API or run the CLI.
- Review the returned sections, grid, walk-forward, and stress blocks before publishing a strategy.
- If targets are missed, keep the tighter config; do not loosen filters to chase backtest performance.

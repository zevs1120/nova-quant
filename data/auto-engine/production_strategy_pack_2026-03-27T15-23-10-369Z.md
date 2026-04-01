A. Strategy Hypothesis
- Use a governed blend of trend breakout, trend pullback re-entry, and mean reversion so the system earns in more market states without simply levering up.
- Keep the model low-parameter and rule-based so every signal remains auditable.
- Current blended target check: Sharpe 1.2095, annual 7.89%, max DD 3.65%.

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
- Only a small predeclared config grid is evaluated. No unconstrained optimizer is used.
- Each market pack includes train/test split, walk-forward windows, and a full robustness grid.
- US: 0/8 configs meet all targets. CRYPTO: 0/8 configs meet all targets.

H. Anti-Lookahead
- Signals are generated from completed bar close only.
- Entries always happen on the next bar open, never the same bar.
- Detected future-leak violations in this run: 0.

I. Backtest Realism
- Backtests include spread, slippage, fees, funding/borrow drag proxy, execution delay, and partial-fill sizing.
- Stress scenarios include wider spread, more slippage, adverse funding, and stricter fills.
- US worst stress: slippage_plus_50 annual 0.97%, DD 0.66%. CRYPTO worst stress: slippage_plus_50 annual 16.71%, DD 3.85%.

J. Key Metrics
- Combined annual return: 7.89%
- Combined max drawdown: 3.65%
- Combined sharpe: 1.2095

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

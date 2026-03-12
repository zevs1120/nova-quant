
# Feature Catalog

Last updated: 2026-03-08

## Trend Features
- Purpose: Detect directional persistence and continuation quality.
- Example features: trend_strength, ma_alignment, breakout_distance, trend_age, multi_day_return.
- Data source dependency: OHLCV bars, rolling returns, session highs/lows.
- Typical strategy usage: breakout continuation, pullback continuation, multi-day continuation.

## Volatility Features
- Purpose: Measure expansion/compression state and risk regime stress.
- Example features: atr_14, vol_percentile, realized_volatility, iv_hv_spread, range_expansion.
- Data source dependency: bar returns, optional implied-vol feeds, options snapshots.
- Typical strategy usage: volatility expansion continuation, compression breakout, risk posture sizing.

## Range / Reversion Features
- Purpose: Locate statistically stretched prices and likely normalization windows.
- Example features: zscore_lookback, percentile_rank, vwap_deviation, reversion_speed, extension_threshold.
- Data source dependency: intraday bars, rolling stats, session VWAP.
- Typical strategy usage: oversold rebound, overbought fade, percentile mean reversion.

## Cross-Sectional Features
- Purpose: Rank assets relative to peers for rotation and spread trades.
- Example features: cross_asset_rank, sector_relative_strength, leader_laggard_spread, rank_trend.
- Data source dependency: synchronized multi-asset returns and sector mappings.
- Typical strategy usage: relative strength leader, leader-laggard spread, basket momentum.

## Breadth / Market Proxy Features
- Purpose: Infer market internals and risk-on/risk-off posture.
- Example features: breadth_ratio, risk_on_off_score, sector_rotation_strength, credit_stress_proxy.
- Data source dependency: index/ETF universes, macro proxy feeds, breadth calculations.
- Typical strategy usage: regime transition templates, defensive rotation, posture guardrails.

## Crypto Funding / Basis / OI Features
- Purpose: Capture derivatives crowding, carry dislocations, and positioning shifts.
- Example features: funding_rate, funding_zscore, basis_annualized, open_interest_change, spot_perp_spread.
- Data source dependency: Binance/Bybit/Deribit market data endpoints and websocket streams.
- Typical strategy usage: funding dislocation reversion, basis compression/expansion, carry logic.

## Liquidity Stress Features
- Purpose: Detect execution fragility and liquidation-driven dislocations.
- Example features: spread_bps, liquidity_score, order_imbalance, liquidation_imbalance, velocity_shock.
- Data source dependency: tick/quote streams, order book depth, trade prints.
- Typical strategy usage: liquidity shock reversal, stress filters, no-trade guards.

## Execution Realism Features
- Purpose: Convert theoretical signal quality into executable opportunity quality.
- Example features: slippage_bps, fill_probability, queue_position_proxy, unavailable_data_flag, latency_ms.
- Data source dependency: execution simulator logs, venue metadata, data-health monitors.
- Typical strategy usage: risk bucket filtering, candidate validation, opportunity sizing decisions.

## Notes for Discovery Engine
- Reuse feature interfaces across families whenever possible.
- Keep feature lineage explicit so hypothesis-template validation remains auditable.
- Track freshness and null spikes per feature group in weekly feed.

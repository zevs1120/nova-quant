# Hypothesis Library

Last updated: 2026-03-08

This library provides 100 structured alpha hypotheses for Nova Quant research and strategy discovery.

## Design Rules

- Every hypothesis must carry a market-structure intuition.
- Every hypothesis must map to reusable strategy templates.
- Every hypothesis must declare feature hints, regime context, and horizon.

## Coverage

- Total hypotheses: 100
- Families: 10

## Momentum / Trend

### HYP-MOM-001 — Open-range breakout continuation

- Description: When the session opens outside a recent balance area and volume confirms, follow-through often persists into later bars.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in momentum / trend conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: breakout_continuation, pullback_continuation
- Required feature hints: trend_strength, breakout_distance, volume_expansion, atr_14

### HYP-MOM-002 — Post-earnings drift continuation

- Description: Strong post-event directional gaps can keep trending as institutions rebalance over several sessions.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in momentum / trend conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_normal
- Expected holding horizon: 2-5 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: pullback_continuation, trend_acceleration
- Required feature hints: breakout_distance, volume_expansion, atr_14, ma_alignment

### HYP-MOM-003 — Multi-day higher-high persistence

- Description: Assets printing clean higher highs and shallow pullbacks often continue while positioning remains under-owned.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in momentum / trend conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_high_vol
- Expected holding horizon: 3-8 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: trend_acceleration, breakout_continuation
- Required feature hints: volume_expansion, atr_14, ma_alignment, trend_strength

### HYP-MOM-004 — Volume-backed trend acceleration

- Description: A trend leg that re-accelerates with expanding participation tends to sustain before mean reversion starts.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in momentum / trend conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: breakout_continuation, pullback_continuation
- Required feature hints: atr_14, ma_alignment, trend_strength, breakout_distance

### HYP-MOM-005 — Trend resumption after volatility contraction

- Description: A volatility squeeze inside an intact trend often resolves in the original direction when risk appetite returns.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in momentum / trend conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_normal
- Expected holding horizon: 2-5 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: pullback_continuation, trend_acceleration
- Required feature hints: ma_alignment, trend_strength, breakout_distance, volume_expansion

### HYP-MOM-006 — Leader breakout with weak laggards

- Description: Top leadership names can continue outperforming while weaker peers fail to confirm, creating concentrated momentum edge.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in momentum / trend conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_high_vol
- Expected holding horizon: 3-8 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: trend_acceleration, breakout_continuation
- Required feature hints: trend_strength, breakout_distance, volume_expansion, atr_14

### HYP-MOM-007 — Sector thrust continuation

- Description: When sector ETF breadth expands with synchronized breakouts, continuation setups tend to survive noise better.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in momentum / trend conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: breakout_continuation, pullback_continuation
- Required feature hints: breakout_distance, volume_expansion, atr_14, ma_alignment

### HYP-MOM-008 — Late-day momentum carry

- Description: Strong close location value can signal overnight continuation due to uncompleted institutional flow.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in momentum / trend conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_normal
- Expected holding horizon: 2-5 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: pullback_continuation, trend_acceleration
- Required feature hints: volume_expansion, atr_14, ma_alignment, trend_strength

### HYP-MOM-009 — Gap-and-go in risk-on windows

- Description: In risk-on regimes, gap-up names with stable spread often produce cleaner continuation than average sessions.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in momentum / trend conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_high_vol
- Expected holding horizon: 3-8 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: trend_acceleration, breakout_continuation
- Required feature hints: atr_14, ma_alignment, trend_strength, breakout_distance

### HYP-MOM-010 — Trend persistence after shallow pullback

- Description: Small retracements in high-quality trends can offer low-friction re-entry before another directional impulse.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in momentum / trend conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: breakout_continuation, pullback_continuation
- Required feature hints: ma_alignment, trend_strength, breakout_distance, volume_expansion

## Mean Reversion

### HYP-MRV-011 — Oversold rebound after panic wick

- Description: Extreme downside extension with failed follow-through often snaps back once forced sellers are exhausted.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in mean reversion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: percentile_mean_reversion, oversold_rebound
- Required feature hints: zscore_lookback, percentile_rank, vwap_deviation, reversion_speed

### HYP-MRV-012 — Overbought fade after failed breakout

- Description: A failed upside breakout near local extremes can unwind quickly as breakout buyers are trapped.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in mean reversion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_normal
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: oversold_rebound, overbought_fade
- Required feature hints: percentile_rank, vwap_deviation, reversion_speed, liquidity_score

### HYP-MRV-013 — VWAP reversion in balanced sessions

- Description: When price deviates from session VWAP without structural news, short-horizon pullback toward value is common.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in mean reversion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: overbought_fade, percentile_mean_reversion
- Required feature hints: vwap_deviation, reversion_speed, liquidity_score, zscore_lookback

### HYP-MRV-014 — Percentile extreme normalization

- Description: Tail percentile moves in stable regimes tend to partially normalize over the next few bars.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in mean reversion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: percentile_mean_reversion, oversold_rebound
- Required feature hints: reversion_speed, liquidity_score, zscore_lookback, percentile_rank

### HYP-MRV-015 — Bid-ask imbalance reversal

- Description: Short-lived order-book pressure can overshoot fair value and reverse once microstructure pressure fades.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in mean reversion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_normal
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: oversold_rebound, overbought_fade
- Required feature hints: liquidity_score, zscore_lookback, percentile_rank, vwap_deviation

### HYP-MRV-016 — Intraday extension fade into close

- Description: Late-session one-sided extensions frequently mean-revert into the close when participation thins.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in mean reversion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: overbought_fade, percentile_mean_reversion
- Required feature hints: zscore_lookback, percentile_rank, vwap_deviation, reversion_speed

### HYP-MRV-017 — Opening overreaction reversion

- Description: Large open dislocations that fail to attract continuation flow often mean-revert by midday.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in mean reversion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: percentile_mean_reversion, oversold_rebound
- Required feature hints: percentile_rank, vwap_deviation, reversion_speed, liquidity_score

### HYP-MRV-018 — Range edge rejection bounce

- Description: Repeated rejection near known range boundaries can create reliable fade entries with tight invalidation.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in mean reversion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_normal
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: oversold_rebound, overbought_fade
- Required feature hints: vwap_deviation, reversion_speed, liquidity_score, zscore_lookback

### HYP-MRV-019 — Volatility spike snapback

- Description: A volatility shock that does not break structure often produces a quick reversion leg.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in mean reversion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: overbought_fade, percentile_mean_reversion
- Required feature hints: reversion_speed, liquidity_score, zscore_lookback, percentile_rank

### HYP-MRV-020 — Short-covering completion fade

- Description: After a sharp squeeze, momentum exhaustion can produce a tradable fade once buy pressure decelerates.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in mean reversion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: percentile_mean_reversion, oversold_rebound
- Required feature hints: liquidity_score, zscore_lookback, percentile_rank, vwap_deviation

## Regime Transition

### HYP-RGT-021 — Trend-to-range degradation

- Description: As trend conviction falls and false breaks increase, continuation systems should be down-weighted.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in regime transition conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: transition
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: trend_to_range_transition, volatility_regime_switch
- Required feature hints: trend_confidence, volatility_stress, breadth_decay, risk_on_off_score

### HYP-RGT-022 — Range-to-trend ignition

- Description: Compression followed by breadth thrust can mark the transition into a directional regime.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in regime transition conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: volatility_regime_switch, risk_on_to_risk_off_transition
- Required feature hints: volatility_stress, breadth_decay, risk_on_off_score, cross_asset_stress

### HYP-RGT-023 — Low-vol to high-vol regime flip

- Description: A sudden jump in realized and implied volatility changes sizing and template viability.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in regime transition conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: risk_off
- Expected holding horizon: 3-10 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: risk_on_to_risk_off_transition, trend_to_range_transition
- Required feature hints: breadth_decay, risk_on_off_score, cross_asset_stress, trend_confidence

### HYP-RGT-024 — Risk-on to risk-off migration

- Description: Cross-asset stress signals can lead to abrupt posture shifts before price fully reflects risk-off behavior.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in regime transition conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: trend_to_range_transition, volatility_regime_switch
- Required feature hints: risk_on_off_score, cross_asset_stress, trend_confidence, volatility_stress

### HYP-RGT-025 — Failed transition retrace

- Description: Many transition attempts fail quickly; reversal capture can outperform delayed trend models.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in regime transition conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: transition
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: volatility_regime_switch, risk_on_to_risk_off_transition
- Required feature hints: cross_asset_stress, trend_confidence, volatility_stress, breadth_decay

### HYP-RGT-026 — Event-induced regime break

- Description: Macro event windows can invalidate prior regime assumptions and require temporary rule overrides.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in regime transition conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 3-10 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: risk_on_to_risk_off_transition, trend_to_range_transition
- Required feature hints: trend_confidence, volatility_stress, breadth_decay, risk_on_off_score

### HYP-RGT-027 — Liquidity regime deterioration

- Description: When liquidity thins and spreads widen, historical signal behavior can degrade fast.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in regime transition conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: risk_off
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: trend_to_range_transition, volatility_regime_switch
- Required feature hints: volatility_stress, breadth_decay, risk_on_off_score, cross_asset_stress

### HYP-RGT-028 — Correlation regime spike

- Description: Correlation clusters rising toward one can reduce diversification value and require conflict filters.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in regime transition conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: volatility_regime_switch, risk_on_to_risk_off_transition
- Required feature hints: breadth_decay, risk_on_off_score, cross_asset_stress, trend_confidence

### HYP-RGT-029 — Post-shock stabilization transition

- Description: After shock phase ends, mean reversion edges may recover before trend signals normalize.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in regime transition conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: transition
- Expected holding horizon: 3-10 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: risk_on_to_risk_off_transition, trend_to_range_transition
- Required feature hints: risk_on_off_score, cross_asset_stress, trend_confidence, volatility_stress

### HYP-RGT-030 — Volatility normalization handoff

- Description: As vol drops from extremes, strategy preference should rotate from defensive to selective trend models.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in regime transition conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: trend_to_range_transition, volatility_regime_switch
- Required feature hints: cross_asset_stress, trend_confidence, volatility_stress, breadth_decay

## Relative Strength / Rotation

### HYP-RSR-031 — Sector leadership persistence

- Description: Sectors that gain leadership with improving breadth often keep leading for multiple rebalancing cycles.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in relative strength / rotation conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 3-10 bars
- Suggested strategy family: Relative Strength / Cross-Sectional
- Suggested template candidates: relative_strength_leader, leader_laggard_spread
- Required feature hints: cross_asset_rank, sector_relative_strength, breadth_ratio, rank_trend

### HYP-RSR-032 — Leader-laggard spread expansion

- Description: Relative spreads between strong and weak names can widen before convergence begins.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in relative strength / rotation conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_normal
- Expected holding horizon: 5-15 bars
- Suggested strategy family: Relative Strength / Cross-Sectional
- Suggested template candidates: leader_laggard_spread, basket_rank_momentum
- Required feature hints: sector_relative_strength, breadth_ratio, rank_trend, turnover_cost_proxy

### HYP-RSR-033 — Rotation after macro surprise

- Description: Macro shocks can rotate capital into new factor leaders with measurable lag.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in relative strength / rotation conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: risk_recovery
- Expected holding horizon: 2-8 bars
- Suggested strategy family: Relative Strength / Cross-Sectional
- Suggested template candidates: basket_rank_momentum, relative_strength_leader
- Required feature hints: breadth_ratio, rank_trend, turnover_cost_proxy, cross_asset_rank

### HYP-RSR-034 — Defensive-to-cyclical handoff

- Description: When risk appetite improves, cyclical groups often outperform defensive groups in sequence.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in relative strength / rotation conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 3-10 bars
- Suggested strategy family: Relative Strength / Cross-Sectional
- Suggested template candidates: relative_strength_leader, leader_laggard_spread
- Required feature hints: rank_trend, turnover_cost_proxy, cross_asset_rank, sector_relative_strength

### HYP-RSR-035 — Cross-asset momentum alignment

- Description: When equity and crypto leaders align, continuation conviction for aligned assets improves.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in relative strength / rotation conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_normal
- Expected holding horizon: 5-15 bars
- Suggested strategy family: Relative Strength / Cross-Sectional
- Suggested template candidates: leader_laggard_spread, basket_rank_momentum
- Required feature hints: turnover_cost_proxy, cross_asset_rank, sector_relative_strength, breadth_ratio

### HYP-RSR-036 — Rank persistence in low-vol uptrends

- Description: In orderly trends, rank changes are slower and easier to exploit through periodic rebalance.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in relative strength / rotation conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: risk_recovery
- Expected holding horizon: 2-8 bars
- Suggested strategy family: Relative Strength / Cross-Sectional
- Suggested template candidates: basket_rank_momentum, relative_strength_leader
- Required feature hints: cross_asset_rank, sector_relative_strength, breadth_ratio, rank_trend

### HYP-RSR-037 — Breadth-backed relative breakouts

- Description: Relative breakouts with breadth confirmation tend to be more durable than isolated outperformance.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in relative strength / rotation conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 3-10 bars
- Suggested strategy family: Relative Strength / Cross-Sectional
- Suggested template candidates: relative_strength_leader, leader_laggard_spread
- Required feature hints: sector_relative_strength, breadth_ratio, rank_trend, turnover_cost_proxy

### HYP-RSR-038 — Volatile rotation whipsaw filter

- Description: Rapid rank reversals in stressed markets can be filtered using turnover and stability metrics.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in relative strength / rotation conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_normal
- Expected holding horizon: 5-15 bars
- Suggested strategy family: Relative Strength / Cross-Sectional
- Suggested template candidates: leader_laggard_spread, basket_rank_momentum
- Required feature hints: breadth_ratio, rank_trend, turnover_cost_proxy, cross_asset_rank

### HYP-RSR-039 — Size-factor rotation pulse

- Description: Small-cap versus large-cap leadership shifts can signal broad style transitions.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in relative strength / rotation conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: risk_recovery
- Expected holding horizon: 2-8 bars
- Suggested strategy family: Relative Strength / Cross-Sectional
- Suggested template candidates: basket_rank_momentum, relative_strength_leader
- Required feature hints: rank_trend, turnover_cost_proxy, cross_asset_rank, sector_relative_strength

### HYP-RSR-040 — Crypto dominance rotation

- Description: Rotation between majors and high-beta alts can produce cross-sectional long/short edges.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in relative strength / rotation conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 3-10 bars
- Suggested strategy family: Relative Strength / Cross-Sectional
- Suggested template candidates: relative_strength_leader, leader_laggard_spread
- Required feature hints: turnover_cost_proxy, cross_asset_rank, sector_relative_strength, breadth_ratio

## Volatility / Compression / Expansion

### HYP-VOL-041 — Compression-to-expansion breakout

- Description: Long compressions tend to release into directional expansion when catalyst flow appears.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in volatility / compression / expansion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_high_vol
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: volatility_compression_breakout, volatility_expansion_continuation
- Required feature hints: vol_percentile, atr_14, range_expansion, realized_volatility

### HYP-VOL-042 — Post-expansion continuation

- Description: First expansion leg can continue when realized volatility remains elevated but orderly.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in volatility / compression / expansion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: downtrend_high_vol
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: volatility_expansion_continuation, range_break_expansion
- Required feature hints: atr_14, range_expansion, realized_volatility, iv_hv_spread

### HYP-VOL-043 — False expansion fade

- Description: When expansion starts without follow-through breadth, reversal probability rises quickly.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in volatility / compression / expansion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: range_break_expansion, volatility_compression_breakout
- Required feature hints: range_expansion, realized_volatility, iv_hv_spread, vol_percentile

### HYP-VOL-044 — IV-RV divergence unwind

- Description: Large implied-vs-realized gaps can signal upcoming repricing in directional or mean-reverting form.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in volatility / compression / expansion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_high_vol
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: volatility_compression_breakout, volatility_expansion_continuation
- Required feature hints: realized_volatility, iv_hv_spread, vol_percentile, atr_14

### HYP-VOL-045 — Range expansion after macro print

- Description: Macro data windows can trigger volatility regime shifts with asymmetric continuation potential.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in volatility / compression / expansion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: downtrend_high_vol
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: volatility_expansion_continuation, range_break_expansion
- Required feature hints: iv_hv_spread, vol_percentile, atr_14, range_expansion

### HYP-VOL-046 — Vol crush normalization

- Description: After event volatility collapse, trend systems may underperform and reversion systems may improve.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in volatility / compression / expansion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: range_break_expansion, volatility_compression_breakout
- Required feature hints: vol_percentile, atr_14, range_expansion, realized_volatility

### HYP-VOL-047 — Volatility clustering breakout filter

- Description: Repeated high-vol clusters can improve hit rate for selective breakout setups.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in volatility / compression / expansion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_high_vol
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: volatility_compression_breakout, volatility_expansion_continuation
- Required feature hints: atr_14, range_expansion, realized_volatility, iv_hv_spread

### HYP-VOL-048 — Compression at higher-timeframe level

- Description: Compression against major level often resolves with larger than average follow-through.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in volatility / compression / expansion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: downtrend_high_vol
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: volatility_expansion_continuation, range_break_expansion
- Required feature hints: range_expansion, realized_volatility, iv_hv_spread, vol_percentile

### HYP-VOL-049 — Expansion exhaustion check

- Description: Late-stage expansion with weak breadth often marks transition risk to failed continuation.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in volatility / compression / expansion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: range_break_expansion, volatility_compression_breakout
- Required feature hints: realized_volatility, iv_hv_spread, vol_percentile, atr_14

### HYP-VOL-050 — Cross-asset volatility transmission

- Description: Volatility spike in one risk asset class can propagate and create synchronized opportunities.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in volatility / compression / expansion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_high_vol
- Expected holding horizon: 1-4 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: volatility_compression_breakout, volatility_expansion_continuation
- Required feature hints: iv_hv_spread, vol_percentile, atr_14, range_expansion

## Liquidity / Stress / Exhaustion

### HYP-LIQ-051 — Liquidity vacuum snapback

- Description: Temporary liquidity holes can produce outsized prints that normalize as books refill.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in liquidity / stress / exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: liquidity_shock_reversal, spread_stress_filter
- Required feature hints: spread_bps, liquidity_score, order_imbalance, trade_size_imbalance

### HYP-LIQ-052 — Spread-widening risk filter

- Description: Rapid spread widening often invalidates otherwise attractive entries due to execution drag.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in liquidity / stress / exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: stress_risk_off
- Expected holding horizon: 1-5 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: spread_stress_filter, exhaustion_reversal
- Required feature hints: liquidity_score, order_imbalance, trade_size_imbalance, velocity_shock

### HYP-LIQ-053 — Capitulation exhaustion rebound

- Description: Panic liquidation bursts can be followed by sharp mean reversion once forced flow clears.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in liquidity / stress / exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 2-8 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: exhaustion_reversal, liquidity_shock_reversal
- Required feature hints: order_imbalance, trade_size_imbalance, velocity_shock, spread_bps

### HYP-LIQ-054 — Order-book refill continuation

- Description: After stress, visible depth recovery can signal that continuation trades are again executable.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in liquidity / stress / exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: liquidity_shock_reversal, spread_stress_filter
- Required feature hints: trade_size_imbalance, velocity_shock, spread_bps, liquidity_score

### HYP-LIQ-055 — Microstructure instability warning

- Description: Erratic quote updates can precede execution slippage spikes and should gate signal activation.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in liquidity / stress / exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: stress_risk_off
- Expected holding horizon: 1-5 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: spread_stress_filter, exhaustion_reversal
- Required feature hints: velocity_shock, spread_bps, liquidity_score, order_imbalance

### HYP-LIQ-056 — Liquidity stress divergence

- Description: Price making new lows while liquidity stress eases can imply downside exhaustion.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in liquidity / stress / exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 2-8 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: exhaustion_reversal, liquidity_shock_reversal
- Required feature hints: spread_bps, liquidity_score, order_imbalance, trade_size_imbalance

### HYP-LIQ-057 — Exhaustion after one-way flow

- Description: Extended one-way tape with diminishing incremental impact often sets up short-horizon reversal.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in liquidity / stress / exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: liquidity_shock_reversal, spread_stress_filter
- Required feature hints: liquidity_score, order_imbalance, trade_size_imbalance, velocity_shock

### HYP-LIQ-058 — Auction imbalance spillover

- Description: Large imbalance conditions near close can distort overnight positioning and next-open behavior.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in liquidity / stress / exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: stress_risk_off
- Expected holding horizon: 1-5 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: spread_stress_filter, exhaustion_reversal
- Required feature hints: order_imbalance, trade_size_imbalance, velocity_shock, spread_bps

### HYP-LIQ-059 — Weekend crypto liquidity gap

- Description: Off-peak liquidity regimes in crypto can amplify both false breaks and forced reversions.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in liquidity / stress / exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 2-8 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: exhaustion_reversal, liquidity_shock_reversal
- Required feature hints: trade_size_imbalance, velocity_shock, spread_bps, liquidity_score

### HYP-LIQ-060 — Depth shock persistence

- Description: Some liquidity shocks persist across sessions and justify reducing aggressiveness in signal acceptance.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in liquidity / stress / exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: liquidity_shock_reversal, spread_stress_filter
- Required feature hints: velocity_shock, spread_bps, liquidity_score, order_imbalance

## Crypto Funding / Basis / Carry

### HYP-CRY-061 — Positive funding overcrowding unwind

- Description: Extremely positive funding can indicate crowded longs vulnerable to rapid de-leveraging.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in crypto funding / basis / carry conditions.
- Expected market: CRYPTO
- Expected regime: range
- Expected holding horizon: 2-8 bars
- Suggested strategy family: Crypto-Native Families
- Suggested template candidates: funding_dislocation_reversion, basis_compression
- Required feature hints: funding_rate, funding_zscore, basis_annualized, open_interest_change

### HYP-CRY-062 — Negative funding squeeze rebound

- Description: Deeply negative funding can set up upside squeeze when short crowding unwinds.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in crypto funding / basis / carry conditions.
- Expected market: CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 3-12 bars
- Suggested strategy family: Crypto-Native Families
- Suggested template candidates: basis_compression, carry_rotation
- Required feature hints: funding_zscore, basis_annualized, open_interest_change, spot_perp_spread

### HYP-CRY-063 — Basis compression mean reversion

- Description: Large futures basis dislocations often normalize as carry arbitrage re-enters.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in crypto funding / basis / carry conditions.
- Expected market: CRYPTO
- Expected regime: risk_off
- Expected holding horizon: 1-5 bars
- Suggested strategy family: Crypto-Native Families
- Suggested template candidates: carry_rotation, funding_dislocation_reversion
- Required feature hints: basis_annualized, open_interest_change, spot_perp_spread, funding_rate

### HYP-CRY-064 — Carry decay after trend break

- Description: Carry strategies weaken when directional trend breaks and funding regime flips abruptly.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in crypto funding / basis / carry conditions.
- Expected market: CRYPTO
- Expected regime: trend
- Expected holding horizon: 2-8 bars
- Suggested strategy family: Crypto-Native Families
- Suggested template candidates: funding_dislocation_reversion, basis_compression
- Required feature hints: open_interest_change, spot_perp_spread, funding_rate, funding_zscore

### HYP-CRY-065 — Open-interest surge quality filter

- Description: Rising open interest with weak price response can signal fragile positioning.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in crypto funding / basis / carry conditions.
- Expected market: CRYPTO
- Expected regime: range
- Expected holding horizon: 3-12 bars
- Suggested strategy family: Crypto-Native Families
- Suggested template candidates: basis_compression, carry_rotation
- Required feature hints: spot_perp_spread, funding_rate, funding_zscore, basis_annualized

### HYP-CRY-066 — Perp-spot divergence convergence

- Description: When perp price diverges from spot beyond typical bounds, convergence edges appear.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in crypto funding / basis / carry conditions.
- Expected market: CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 1-5 bars
- Suggested strategy family: Crypto-Native Families
- Suggested template candidates: carry_rotation, funding_dislocation_reversion
- Required feature hints: funding_rate, funding_zscore, basis_annualized, open_interest_change

### HYP-CRY-067 — Funding flip transition signal

- Description: Funding sign flips can serve as early warning for risk posture adjustment.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in crypto funding / basis / carry conditions.
- Expected market: CRYPTO
- Expected regime: risk_off
- Expected holding horizon: 2-8 bars
- Suggested strategy family: Crypto-Native Families
- Suggested template candidates: funding_dislocation_reversion, basis_compression
- Required feature hints: funding_zscore, basis_annualized, open_interest_change, spot_perp_spread

### HYP-CRY-068 — Basis expansion continuation

- Description: In strong risk-on windows, expanding basis can persist before mean reversion starts.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in crypto funding / basis / carry conditions.
- Expected market: CRYPTO
- Expected regime: trend
- Expected holding horizon: 3-12 bars
- Suggested strategy family: Crypto-Native Families
- Suggested template candidates: basis_compression, carry_rotation
- Required feature hints: basis_annualized, open_interest_change, spot_perp_spread, funding_rate

### HYP-CRY-069 — Cross-exchange funding stress

- Description: Funding divergence across venues can flag local dislocations or latent market stress.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in crypto funding / basis / carry conditions.
- Expected market: CRYPTO
- Expected regime: range
- Expected holding horizon: 1-5 bars
- Suggested strategy family: Crypto-Native Families
- Suggested template candidates: carry_rotation, funding_dislocation_reversion
- Required feature hints: open_interest_change, spot_perp_spread, funding_rate, funding_zscore

### HYP-CRY-070 — Carry-adjusted breakout confirmation

- Description: Breakouts confirmed by supportive carry/funding profiles can have higher persistence.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in crypto funding / basis / carry conditions.
- Expected market: CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 2-8 bars
- Suggested strategy family: Crypto-Native Families
- Suggested template candidates: funding_dislocation_reversion, basis_compression
- Required feature hints: spot_perp_spread, funding_rate, funding_zscore, basis_annualized

## Event / Risk-Off / Panic Behavior

### HYP-EVT-071 — Macro surprise de-risking

- Description: Unexpected macro prints can trigger immediate de-risking and cross-asset downside beta.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in event / risk-off / panic behavior conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: risk_off
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: event_shock_filter, panic_rebound
- Required feature hints: event_flag, volatility_stress, gap_size, breadth_collapse

### HYP-EVT-072 — Panic low first-bounce setup

- Description: After breadth collapse, first rebound attempts can be strong but fragile and need strict risk controls.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in event / risk-off / panic behavior conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: stress_risk_off
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: panic_rebound, defensive_rotation
- Required feature hints: volatility_stress, gap_size, breadth_collapse, credit_spread_proxy

### HYP-EVT-073 — Defensive leadership confirmation

- Description: A shift toward defensive sector leadership can validate sustained risk-off posture.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in event / risk-off / panic behavior conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: defensive_rotation, event_shock_filter
- Required feature hints: gap_size, breadth_collapse, credit_spread_proxy, event_flag

### HYP-EVT-074 — Gap-down continuation under stress

- Description: Gap-down moves in confirmed panic regimes tend to continue more often than fade.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in event / risk-off / panic behavior conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: risk_off
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: event_shock_filter, panic_rebound
- Required feature hints: breadth_collapse, credit_spread_proxy, event_flag, volatility_stress

### HYP-EVT-075 — Risk-off exhaustion reversal

- Description: Late-stage panic with stabilizing volatility can produce selective counter-trend rebounds.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in event / risk-off / panic behavior conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: stress_risk_off
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: panic_rebound, defensive_rotation
- Required feature hints: credit_spread_proxy, event_flag, volatility_stress, gap_size

### HYP-EVT-076 — Policy headline whipsaw filter

- Description: Headline-heavy sessions create fake moves and require stricter confirmation thresholds.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in event / risk-off / panic behavior conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: defensive_rotation, event_shock_filter
- Required feature hints: event_flag, volatility_stress, gap_size, breadth_collapse

### HYP-EVT-077 — Cross-asset stress synchronization

- Description: Synchronous weakness across equities, credit, and crypto indicates regime-level risk reduction.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in event / risk-off / panic behavior conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: risk_off
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: event_shock_filter, panic_rebound
- Required feature hints: volatility_stress, gap_size, breadth_collapse, credit_spread_proxy

### HYP-EVT-078 — Flight-to-quality rotation

- Description: Capital migration to high-quality defensives can be exploited via relative strength frameworks.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in event / risk-off / panic behavior conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: stress_risk_off
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: panic_rebound, defensive_rotation
- Required feature hints: gap_size, breadth_collapse, credit_spread_proxy, event_flag

### HYP-EVT-079 — Event-volatility decay transition

- Description: As event vol decays, strategy preference should rotate from defensive to selective opportunity-seeking.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in event / risk-off / panic behavior conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: high_volatility
- Expected holding horizon: 1-2 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: defensive_rotation, event_shock_filter
- Required feature hints: breadth_collapse, credit_spread_proxy, event_flag, volatility_stress

### HYP-EVT-080 — Panic liquidity cascade warning

- Description: Rapid liquidity deterioration during panic can invalidate normal execution assumptions.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in event / risk-off / panic behavior conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: risk_off
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Regime Transition
- Suggested template candidates: event_shock_filter, panic_rebound
- Required feature hints: credit_spread_proxy, event_flag, volatility_stress, gap_size

## False Breakout / Failed Move

### HYP-FBR-081 — Failed upside breakout reversal

- Description: Breakouts above resistance that lose follow-through quickly often reverse into prior range.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in false breakout / failed move conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: false_breakout_fade, failed_trend_capture
- Required feature hints: breakout_failure_rate, retest_fail_signal, volume_divergence, trend_confidence

### HYP-FBR-082 — Failed downside breakdown rebound

- Description: Breakdowns below support with weak continuation can mean-revert sharply upward.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in false breakout / failed move conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 1-5 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: failed_trend_capture, retest_failure_reversal
- Required feature hints: retest_fail_signal, volume_divergence, trend_confidence, liquidity_pressure

### HYP-FBR-083 — Retest rejection fade

- Description: Price revisiting breakout level and failing to reclaim momentum often signals trap dynamics.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in false breakout / failed move conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: downtrend_normal
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: retest_failure_reversal, false_breakout_fade
- Required feature hints: volume_divergence, trend_confidence, liquidity_pressure, breakout_failure_rate

### HYP-FBR-084 — Low-volume breakout invalidation

- Description: Breakouts lacking participation are prone to failure and reversal.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in false breakout / failed move conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: false_breakout_fade, failed_trend_capture
- Required feature hints: trend_confidence, liquidity_pressure, breakout_failure_rate, retest_fail_signal

### HYP-FBR-085 — Exhaustion spike trap

- Description: One-bar exhaustion spikes frequently reverse when incremental buying interest disappears.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in false breakout / failed move conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 1-5 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: failed_trend_capture, retest_failure_reversal
- Required feature hints: liquidity_pressure, breakout_failure_rate, retest_fail_signal, volume_divergence

### HYP-FBR-086 — Failed trend-day transition

- Description: Intraday trend-day attempts that stall can morph into reversal profiles by session close.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in false breakout / failed move conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: downtrend_normal
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: retest_failure_reversal, false_breakout_fade
- Required feature hints: breakout_failure_rate, retest_fail_signal, volume_divergence, trend_confidence

### HYP-FBR-087 — Multi-attempt breakout fatigue

- Description: Repeated failed breakout attempts weaken directional conviction and favor trap-fade setups.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in false breakout / failed move conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: false_breakout_fade, failed_trend_capture
- Required feature hints: retest_fail_signal, volume_divergence, trend_confidence, liquidity_pressure

### HYP-FBR-088 — Cross-asset confirmation failure

- Description: A breakout unsupported by related assets has higher chance of rejection.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in false breakout / failed move conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_high_vol
- Expected holding horizon: 1-5 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: failed_trend_capture, retest_failure_reversal
- Required feature hints: volume_divergence, trend_confidence, liquidity_pressure, breakout_failure_rate

### HYP-FBR-089 — Opening drive rejection

- Description: Early drive that fails to hold can provide asymmetric reversal entries against trapped flow.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in false breakout / failed move conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: downtrend_normal
- Expected holding horizon: 2-6 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: retest_failure_reversal, false_breakout_fade
- Required feature hints: trend_confidence, liquidity_pressure, breakout_failure_rate, retest_fail_signal

### HYP-FBR-090 — Volatility-expanded false move

- Description: High-volatility environments create larger fake moves, but also larger reversal ranges.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in false breakout / failed move conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range
- Expected holding horizon: 1-3 bars
- Suggested strategy family: Mean Reversion
- Suggested template candidates: false_breakout_fade, failed_trend_capture
- Required feature hints: liquidity_pressure, breakout_failure_rate, retest_fail_signal, volume_divergence

## Multi-day continuation / multi-day exhaustion

### HYP-MDE-091 — Three-day continuation follow-through

- Description: Multi-session directional persistence often continues when pullbacks stay shallow.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in multi-day continuation / multi-day exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 3-12 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: multi_day_continuation, multi_day_exhaustion_fade
- Required feature hints: multi_day_return, trend_age, distance_from_ma, volume_trend

### HYP-MDE-092 — Extended run exhaustion fade

- Description: After prolonged directional runs, marginal buyers/sellers can vanish and trigger reversion.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in multi-day continuation / multi-day exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_normal
- Expected holding horizon: 5-20 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: multi_day_exhaustion_fade, swing_retest_entry
- Required feature hints: trend_age, distance_from_ma, volume_trend, drawdown_from_peak

### HYP-MDE-093 — Trend age decay model

- Description: Older trends can keep working but require tighter confirmation and reduced size.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in multi-day continuation / multi-day exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: downtrend_high_vol
- Expected holding horizon: 2-10 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: swing_retest_entry, multi_day_continuation
- Required feature hints: distance_from_ma, volume_trend, drawdown_from_peak, multi_day_return

### HYP-MDE-094 — Multi-day breakout retest

- Description: Breakouts that survive first retest often continue over subsequent sessions.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in multi-day continuation / multi-day exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_normal
- Expected holding horizon: 3-12 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: multi_day_continuation, multi_day_exhaustion_fade
- Required feature hints: volume_trend, drawdown_from_peak, multi_day_return, trend_age

### HYP-MDE-095 — Late-stage parabolic failure

- Description: Parabolic multi-day advances can reverse abruptly after first failed continuation day.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in multi-day continuation / multi-day exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 5-20 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: multi_day_exhaustion_fade, swing_retest_entry
- Required feature hints: drawdown_from_peak, multi_day_return, trend_age, distance_from_ma

### HYP-MDE-096 — Multi-day pullback continuation

- Description: Controlled pullbacks in a mature trend can provide higher-quality swing re-entry points.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in multi-day continuation / multi-day exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_normal
- Expected holding horizon: 2-10 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: swing_retest_entry, multi_day_continuation
- Required feature hints: multi_day_return, trend_age, distance_from_ma, volume_trend

### HYP-MDE-097 — Gap sequence persistence

- Description: Consecutive directional gaps can indicate institutional repricing still in progress.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in multi-day continuation / multi-day exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: downtrend_high_vol
- Expected holding horizon: 3-12 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: multi_day_continuation, multi_day_exhaustion_fade
- Required feature hints: trend_age, distance_from_ma, volume_trend, drawdown_from_peak

### HYP-MDE-098 — Exhaustion after breadth divergence

- Description: When index trend persists but breadth deteriorates, exhaustion risk rises meaningfully.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in multi-day continuation / multi-day exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: range_normal
- Expected holding horizon: 5-20 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: multi_day_exhaustion_fade, swing_retest_entry
- Required feature hints: distance_from_ma, volume_trend, drawdown_from_peak, multi_day_return

### HYP-MDE-099 — Crypto weekend trend carry

- Description: Weekend crypto flows can extend multi-day trends before weekday liquidity regime shifts.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in multi-day continuation / multi-day exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: trend
- Expected holding horizon: 2-10 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: swing_retest_entry, multi_day_continuation
- Required feature hints: volume_trend, drawdown_from_peak, multi_day_return, trend_age

### HYP-MDE-100 — Drawdown stabilization continuation

- Description: After a trend pullback stabilizes with improving breadth, continuation odds recover.
- Economic intuition: The hypothesis assumes repeatable behavior driven by positioning, liquidity, and participant reaction patterns in multi-day continuation / multi-day exhaustion conditions.
- Expected market: US_EQUITY_AND_CRYPTO
- Expected regime: uptrend_normal
- Expected holding horizon: 3-12 bars
- Suggested strategy family: Momentum / Trend Following
- Suggested template candidates: multi_day_continuation, multi_day_exhaustion_fade
- Required feature hints: drawdown_from_peak, multi_day_return, trend_age, distance_from_ma

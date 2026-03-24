# Strategy Template Library

Last updated: 2026-03-08

Total templates: 32

Templates are reusable and parameterizable strategy blueprints for the discovery engine.

## breakout continuation

### TPL-BREAKOUT-CONT-01

- Family: breakout continuation
- Purpose: Capture directional follow-through after structural breakout with participation confirmation.
- Entry logic structure: Enter when price closes beyond breakout threshold and volume expansion filter passes.
- Exit logic structure: Scale out at target ladder or momentum decay signal.
- Stop logic structure: ATR-normalized stop below breakout retest level.
- Sizing logic hints: Conviction-weighted size with regime multiplier and liquidity cap.
- Compatible features: breakout_distance, trend_strength, volume_expansion, atr_14
- Compatible regimes: trend, uptrend_normal, uptrend_high_vol
- Expected trade density: medium
- Expected holding horizon: 2-8 bars
- Risk profile: directional_momentum

### TPL-BREAKOUT-CONT-02

- Family: breakout continuation
- Purpose: Trade second-leg continuation after successful breakout retest.
- Entry logic structure: Enter on retest hold above breakout pivot with resumed momentum.
- Exit logic structure: Exit on failed retest or trailing stop trigger.
- Stop logic structure: Stop below retest low plus volatility buffer.
- Sizing logic hints: Reduce size if breakout occurred in high spread conditions.
- Compatible features: retest_fail_signal, trend_strength, liquidity_score, vol_percentile
- Compatible regimes: trend, risk_recovery
- Expected trade density: low_medium
- Expected holding horizon: 2-6 bars
- Risk profile: trend_retest

## pullback continuation

### TPL-PULLBACK-CONT-01

- Family: pullback continuation
- Purpose: Re-enter prevailing trend after controlled pullback.
- Entry logic structure: Enter when pullback depth remains within configured ATR band and trend filter remains valid.
- Exit logic structure: Exit at prior swing extension or trend invalidation.
- Stop logic structure: Hard stop below pullback structure break.
- Sizing logic hints: Increase size only when breadth and relative strength align.
- Compatible features: pullback_depth_atr, trend_strength, breadth_ratio, relative_strength
- Compatible regimes: trend, uptrend_normal
- Expected trade density: medium
- Expected holding horizon: 3-10 bars
- Risk profile: trend_continuation

### TPL-PULLBACK-CONT-02

- Family: pullback continuation
- Purpose: Capture trend resumption after short-term mean reversion inside trend.
- Entry logic structure: Enter when short-term reversion indicator resets while higher timeframe trend stays intact.
- Exit logic structure: Exit on momentum divergence or time stop.
- Stop logic structure: Stop at pullback low with adaptive volatility buffer.
- Sizing logic hints: Use smaller size in mature trends with high trend age.
- Compatible features: zscore_lookback, trend_age, ma_alignment, volatility_stress
- Compatible regimes: trend, uptrend_normal, downtrend_normal
- Expected trade density: medium
- Expected holding horizon: 2-7 bars
- Risk profile: trend_resumption

## trend acceleration

### TPL-TREND-ACCEL-01

- Family: trend acceleration
- Purpose: Capture acceleration phase when trend transitions from orderly to impulsive.
- Entry logic structure: Enter on acceleration threshold breach with confirming range expansion.
- Exit logic structure: Exit when acceleration decelerates below threshold.
- Stop logic structure: Volatility-adjusted trailing stop.
- Sizing logic hints: Size down in high turnover contexts.
- Compatible features: velocity_shock, range_expansion, trend_strength, turnover_cost_proxy
- Compatible regimes: uptrend_high_vol, downtrend_high_vol
- Expected trade density: low
- Expected holding horizon: 1-4 bars
- Risk profile: fast_momentum

### TPL-TREND-ACCEL-02

- Family: trend acceleration
- Purpose: Trade continuation after acceleration survives first pullback.
- Entry logic structure: Enter on first higher-low after acceleration spike.
- Exit logic structure: Exit on failed higher-low or weakening thrust.
- Stop logic structure: Stop below first pullback pivot.
- Sizing logic hints: Use cap on notional concentration per theme.
- Compatible features: acceleration_shock, pullback_depth_atr, cross_asset_stress, theme_exposure
- Compatible regimes: trend, uptrend_high_vol
- Expected trade density: low_medium
- Expected holding horizon: 2-5 bars
- Risk profile: impulse_follow

## percentile mean reversion

### TPL-PCTL-MR-01

- Family: percentile mean reversion
- Purpose: Fade statistically extreme percentile moves in balanced regimes.
- Entry logic structure: Enter when percentile extreme and z-score trigger jointly fire.
- Exit logic structure: Exit at mean reversion target or timeout.
- Stop logic structure: Stop beyond extension threshold in continuation direction.
- Sizing logic hints: Use smaller size for counter-trend entries.
- Compatible features: percentile_rank, zscore_lookback, reversion_speed, liquidity_score
- Compatible regimes: range, range_normal
- Expected trade density: medium
- Expected holding horizon: 1-4 bars
- Risk profile: counter_trend

### TPL-PCTL-MR-02

- Family: percentile mean reversion
- Purpose: Capture partial mean reversion from tail percentile events.
- Entry logic structure: Enter after extreme candle closes and next-bar failure to continue.
- Exit logic structure: Exit on VWAP touch or predefined partial target.
- Stop logic structure: Hard stop if continuation re-accelerates.
- Sizing logic hints: Block setup under high spread stress.
- Compatible features: percentile_rank, vwap_deviation, spread_bps, vol_spike_score
- Compatible regimes: range_high_vol, high_volatility
- Expected trade density: low_medium
- Expected holding horizon: 1-3 bars
- Risk profile: shock_reversion

## oversold rebound

### TPL-OVERSOLD-RB-01

- Family: oversold rebound
- Purpose: Buy post-capitulation rebounds after downside exhaustion.
- Entry logic structure: Enter when downside extension and liquidation pressure peak then fade.
- Exit logic structure: Exit on first resistance touch or failed bounce structure.
- Stop logic structure: Stop below capitulation low.
- Sizing logic hints: Allow reduced-size pilot then add on confirmation.
- Compatible features: drawdown_from_peak, liquidation_imbalance, recovery_momentum, volume_spike
- Compatible regimes: range_high_vol, stress_risk_off
- Expected trade density: low
- Expected holding horizon: 1-3 bars
- Risk profile: panic_rebound

### TPL-OVERSOLD-RB-02

- Family: oversold rebound
- Purpose: Capture short-cover bounce when trend continuation fails at lows.
- Entry logic structure: Enter on failed low break with positive delta divergence.
- Exit logic structure: Exit on bounce exhaustion or time stop.
- Stop logic structure: Stop at new breakdown confirmation.
- Sizing logic hints: Limit gross exposure during risk-off sessions.
- Compatible features: retest_fail_signal, order_imbalance, risk_on_off_score, breadth_ratio
- Compatible regimes: downtrend_high_vol, risk_off
- Expected trade density: low
- Expected holding horizon: 1-2 bars
- Risk profile: countertrend_snapback

## overbought fade

### TPL-OVERBOUGHT-FADE-01

- Family: overbought fade
- Purpose: Fade overextended upside moves lacking broad confirmation.
- Entry logic structure: Enter short when extension threshold and divergence filter pass.
- Exit logic structure: Exit at reversion objective or volatility reset.
- Stop logic structure: Stop above exhaustion wick.
- Sizing logic hints: Keep size small in strong uptrend regimes.
- Compatible features: extension_threshold, volume_divergence, trend_confidence, vol_percentile
- Compatible regimes: range, range_high_vol
- Expected trade density: low_medium
- Expected holding horizon: 1-4 bars
- Risk profile: counter_trend_fade

### TPL-OVERBOUGHT-FADE-02

- Family: overbought fade
- Purpose: Exploit failed continuation after parabolic intraday advance.
- Entry logic structure: Enter on first lower-high after parabolic run.
- Exit logic structure: Exit on VWAP or prior balance zone revisit.
- Stop logic structure: Stop above parabolic high.
- Sizing logic hints: Require strong liquidity and spread constraints.
- Compatible features: acceleration_shock, vwap_deviation, liquidity_score, spread_bps
- Compatible regimes: high_volatility, range_high_vol
- Expected trade density: low
- Expected holding horizon: 1-3 bars
- Risk profile: exhaustion_fade

## relative strength leader

### TPL-RS-LEADER-01

- Family: relative strength leader
- Purpose: Long top-ranked leaders in persistent leadership environments.
- Entry logic structure: Select top rank bucket and enter on pullback or breakout trigger.
- Exit logic structure: Exit on rank decay below threshold.
- Stop logic structure: Stop using rank-adjusted volatility stop.
- Sizing logic hints: Allocate by rank score with turnover penalty.
- Compatible features: cross_asset_rank, sector_relative_strength, rank_trend, turnover_cost_proxy
- Compatible regimes: trend, risk_recovery
- Expected trade density: medium
- Expected holding horizon: 3-12 bars
- Risk profile: cross_sectional_momentum

### TPL-RS-LEADER-02

- Family: relative strength leader
- Purpose: Capture leadership persistence in sector rotation cycles.
- Entry logic structure: Rotate into top sector leaders with breadth confirmation.
- Exit logic structure: Exit on sector momentum breakdown.
- Stop logic structure: ETF-level stop by sector volatility.
- Sizing logic hints: Sector caps to avoid concentration.
- Compatible features: sector_relative_strength, breadth_ratio, sector_rotation_strength, vol_percentile
- Compatible regimes: trend, range_normal
- Expected trade density: low_medium
- Expected holding horizon: 5-15 bars
- Risk profile: sector_rotation

## leader-laggard spread

### TPL-LEADER-LAG-01

- Family: leader-laggard spread
- Purpose: Trade relative spread between leaders and laggards.
- Entry logic structure: Enter spread when rank dispersion exceeds threshold.
- Exit logic structure: Exit when spread converges to target band.
- Stop logic structure: Stop on spread expansion beyond risk budget.
- Sizing logic hints: Dollar-neutral sizing with beta adjustment.
- Compatible features: leader_laggard_spread, cross_rank, beta_adjusted_momentum, correlation_matrix
- Compatible regimes: trend, range_normal
- Expected trade density: low
- Expected holding horizon: 3-10 bars
- Risk profile: relative_value_spread

### TPL-LEADER-LAG-02

- Family: leader-laggard spread
- Purpose: Capture laggard catch-up during recovery phases.
- Entry logic structure: Long laggards/short leaders when recovery breadth expands sharply.
- Exit logic structure: Exit as catch-up spread normalizes.
- Stop logic structure: Stop on renewed leader acceleration.
- Sizing logic hints: Reduce size if correlation regime spikes.
- Compatible features: breadth_thrust, relative_drawdown, cross_asset_rank, correlation_spike
- Compatible regimes: risk_recovery, range_normal
- Expected trade density: low
- Expected holding horizon: 2-8 bars
- Risk profile: rotation_reversion

## volatility compression breakout

### TPL-VOL-COMP-BRK-01

- Family: volatility compression breakout
- Purpose: Exploit breakout after prolonged volatility contraction.
- Entry logic structure: Enter on close outside compression band with directional filter.
- Exit logic structure: Exit on failed expansion or target hit.
- Stop logic structure: Stop inside compression range midpoint.
- Sizing logic hints: Scale by compression duration and liquidity.
- Compatible features: vol_compression_score, range_width_pct, breakout_distance, liquidity_score
- Compatible regimes: trend, range_normal
- Expected trade density: low_medium
- Expected holding horizon: 2-6 bars
- Risk profile: expansion_breakout

### TPL-VOL-COMP-BRK-02

- Family: volatility compression breakout
- Purpose: Trade post-event breakout from implied-vol crush setup.
- Entry logic structure: Enter when post-event range narrows then breaks with volume confirmation.
- Exit logic structure: Exit when expansion velocity drops below threshold.
- Stop logic structure: Stop at failed break re-entry.
- Sizing logic hints: Cap position under event risk windows.
- Compatible features: iv_hv_spread, volume_expansion, range_expansion, event_flag
- Compatible regimes: range_normal, uptrend_normal
- Expected trade density: low
- Expected holding horizon: 1-5 bars
- Risk profile: event_transition

## false breakout fade

### TPL-FALSE-BRK-FADE-01

- Family: false breakout fade
- Purpose: Fade failed breakout attempts and trapped-flow unwinds.
- Entry logic structure: Enter opposite direction after breakout fails to hold confirmation window.
- Exit logic structure: Exit into prior value area or VWAP.
- Stop logic structure: Stop at renewed breakout acceptance.
- Sizing logic hints: Require liquidity filter and avoid news spikes.
- Compatible features: breakout_failure_rate, retest_fail_signal, vwap_deviation, news_shock_flag
- Compatible regimes: range, range_high_vol
- Expected trade density: medium
- Expected holding horizon: 1-4 bars
- Risk profile: trap_reversal

### TPL-FALSE-BRK-FADE-02

- Family: false breakout fade
- Purpose: Capture breakdown failure rebound with trap confirmation.
- Entry logic structure: Enter long on failed breakdown and immediate reclaim.
- Exit logic structure: Exit at midpoint or upper range boundary.
- Stop logic structure: Stop at failed reclaim low.
- Sizing logic hints: Prioritize A-quality only under stressed volatility.
- Compatible features: breakdown_fail_signal, range_context, volume_divergence, volatility_stress
- Compatible regimes: range_high_vol, downtrend_normal
- Expected trade density: low_medium
- Expected holding horizon: 1-3 bars
- Risk profile: failed_move_rebound

## trend exhaustion fade

### TPL-TREND-EXH-FADE-01

- Family: trend exhaustion fade
- Purpose: Fade mature trends after acceleration exhaustion.
- Entry logic structure: Enter against trend when exhaustion score and divergence both trigger.
- Exit logic structure: Exit on first mean reversion target zone.
- Stop logic structure: Stop beyond exhaustion extreme.
- Sizing logic hints: Hard size cap due counter-trend risk.
- Compatible features: trend_age, acceleration_shock, breadth_divergence, distance_from_ma
- Compatible regimes: uptrend_high_vol, downtrend_high_vol
- Expected trade density: low
- Expected holding horizon: 1-5 bars
- Risk profile: late_trend_reversal

### TPL-TREND-EXH-FADE-02

- Family: trend exhaustion fade
- Purpose: Capture reversal after failed final thrust in mature trends.
- Entry logic structure: Enter after final thrust fails and structure breaks lower/higher.
- Exit logic structure: Exit on first structural retrace completion.
- Stop logic structure: Stop above/below final thrust extremum.
- Sizing logic hints: Use only in high-quality liquidity names.
- Compatible features: final_thrust_score, structure_break, liquidity_score, spread_bps
- Compatible regimes: high_volatility, range_high_vol
- Expected trade density: low
- Expected holding horizon: 1-4 bars
- Risk profile: exhaustion_reversal

## funding dislocation reversion

### TPL-FUNDING-DISLOC-01

- Family: funding dislocation reversion
- Purpose: Trade normalization of extreme perpetual funding imbalances.
- Entry logic structure: Enter against crowded side when funding z-score exceeds trigger.
- Exit logic structure: Exit when funding normalizes or trend invalidates.
- Stop logic structure: Stop on continuation with rising open interest.
- Sizing logic hints: Reduce size in illiquid alt contracts.
- Compatible features: funding_zscore, open_interest_change, spot_perp_spread, liquidity_score
- Compatible regimes: range, high_volatility
- Expected trade density: low_medium
- Expected holding horizon: 2-10 bars
- Risk profile: carry_reversion

### TPL-FUNDING-DISLOC-02

- Family: funding dislocation reversion
- Purpose: Capture short squeeze after deeply negative funding regime.
- Entry logic structure: Enter long when negative funding and short crowding begin to unwind.
- Exit logic structure: Exit at carry-neutral or momentum stall.
- Stop logic structure: Stop if funding remains extreme and price weakens.
- Sizing logic hints: Use progressive sizing with confirmation add-ons.
- Compatible features: funding_rate, short_ratio, open_interest_delta, price_momentum
- Compatible regimes: risk_recovery, range_high_vol
- Expected trade density: low
- Expected holding horizon: 2-8 bars
- Risk profile: squeeze_reversion

## basis compression

### TPL-BASIS-COMP-01

- Family: basis compression
- Purpose: Exploit futures basis normalization after dislocation.
- Entry logic structure: Enter when annualized basis deviates beyond historical bounds.
- Exit logic structure: Exit as basis reverts toward carry equilibrium.
- Stop logic structure: Stop if basis divergence expands further with confirming flow.
- Sizing logic hints: Notional scaled by basis distance and liquidity.
- Compatible features: basis_annualized, term_structure, spot_perp_spread, oi_term_skew
- Compatible regimes: range, trend
- Expected trade density: low
- Expected holding horizon: 3-12 bars
- Risk profile: basis_reversion

### TPL-BASIS-COMP-02

- Family: basis compression
- Purpose: Capture basis expansion continuation in strong risk-on cycles.
- Entry logic structure: Enter with basis trend when carry remains supportive and stress low.
- Exit logic structure: Exit on carry deterioration or volatility shock.
- Stop logic structure: Stop if basis trend breaks below regime floor.
- Sizing logic hints: Use capped leverage and venue liquidity checks.
- Compatible features: basis_trend, funding_trend, volatility_stress, liquidity_depth
- Compatible regimes: trend, uptrend_normal
- Expected trade density: low
- Expected holding horizon: 2-8 bars
- Risk profile: carry_continuation

## liquidity shock reversal

### TPL-LIQ-SHOCK-REV-01

- Family: liquidity shock reversal
- Purpose: Trade mean reversion after short-lived liquidity dislocation.
- Entry logic structure: Enter once spread shock peaks and first stabilization signal appears.
- Exit logic structure: Exit on return to normal microstructure regime.
- Stop logic structure: Stop on renewed liquidity vacuum.
- Sizing logic hints: Use strict max size and skip unavailable data windows.
- Compatible features: spread_bps, liquidity_score, order_imbalance, velocity_shock
- Compatible regimes: high_volatility, stress_risk_off
- Expected trade density: low
- Expected holding horizon: 1-3 bars
- Risk profile: microstructure_reversion

### TPL-LIQ-SHOCK-REV-02

- Family: liquidity shock reversal
- Purpose: Capture bounce after forced-flow liquidation wave.
- Entry logic structure: Enter after liquidation cluster dissipates and price reclaims micro support.
- Exit logic structure: Exit on first resistance retest.
- Stop logic structure: Stop on renewed liquidation spike.
- Sizing logic hints: Allow only when execution quality score is acceptable.
- Compatible features: liquidation_imbalance, micro_support_reclaim, execution_quality_score, slippage_bps
- Compatible regimes: stress_risk_off, range_high_vol
- Expected trade density: low
- Expected holding horizon: 1-2 bars
- Risk profile: panic_rebound

## multi-day continuation

### TPL-MULTI-DAY-CONT-01

- Family: multi-day continuation
- Purpose: Exploit sustained multi-session trend persistence.
- Entry logic structure: Enter on higher timeframe breakout with supportive daily trend score.
- Exit logic structure: Exit on daily trend break or momentum decay.
- Stop logic structure: Stop at multi-day swing invalidation.
- Sizing logic hints: Use slower rebalance cadence to reduce turnover.
- Compatible features: multi_day_return, trend_strength_daily, breakout_distance, volume_trend
- Compatible regimes: trend, uptrend_normal
- Expected trade density: low_medium
- Expected holding horizon: 5-20 bars
- Risk profile: swing_trend

### TPL-MULTI-DAY-CONT-02

- Family: multi-day continuation
- Purpose: Add exposure on orderly pullbacks during multi-day trend.
- Entry logic structure: Enter on daily pullback support hold with intact trend structure.
- Exit logic structure: Exit on support break or relative-strength decay.
- Stop logic structure: Stop below daily pullback pivot.
- Sizing logic hints: Scale entries across two tranches to reduce timing risk.
- Compatible features: daily_pullback_depth, support_hold_score, relative_strength, trend_age
- Compatible regimes: trend, risk_recovery
- Expected trade density: low
- Expected holding horizon: 4-15 bars
- Risk profile: swing_pullback

## multi-day exhaustion

### TPL-MULTI-DAY-EXH-01

- Family: multi-day exhaustion
- Purpose: Fade mature multi-day runs after broad divergence appears.
- Entry logic structure: Enter opposite direction after trend extension and breadth divergence trigger.
- Exit logic structure: Exit at first multi-day reversion objective.
- Stop logic structure: Stop above trend climax high.
- Sizing logic hints: Use half-size unless regime transition confirmation appears.
- Compatible features: trend_age, breadth_divergence, distance_from_ma, vol_spike_score
- Compatible regimes: uptrend_high_vol, downtrend_high_vol
- Expected trade density: low
- Expected holding horizon: 2-8 bars
- Risk profile: swing_reversal

### TPL-MULTI-DAY-EXH-02

- Family: multi-day exhaustion
- Purpose: Capture reversal after failed continuation day in mature trend.
- Entry logic structure: Enter after failed continuation candle closes back inside prior value zone.
- Exit logic structure: Exit on swing mean reversion completion.
- Stop logic structure: Stop at failed continuation extreme.
- Sizing logic hints: Require elevated liquidity and low data-latency confidence.
- Compatible features: failed_continuation_flag, value_zone_reentry, liquidity_score, data_freshness
- Compatible regimes: range_high_vol, high_volatility
- Expected trade density: low
- Expected holding horizon: 2-6 bars
- Risk profile: failed_move_swing

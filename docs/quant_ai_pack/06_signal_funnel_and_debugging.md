# Signal Funnel and Debugging Spec

## Problem
Trade density is too low until proven otherwise.

## Required funnel counters
For every trading day and strategy family:
1. universe_total
2. universe_after_liquidity_filter
3. regime_pass
4. alpha_score_pass
5. risk_filter_pass
6. conflict_resolver_pass
7. order_submitted
8. order_filled
9. position_opened
10. round_trip_completed

## No-trade reason taxonomy
Must log one primary reason and optional secondary reason:
- regime_blocked
- score_too_low
- risk_budget_exhausted
- correlation_conflict
- cost_too_high
- entry_not_touched
- order_expired
- execution_window_closed
- instrument_not_tradable
- data_missing
- min_notional_or_lot_violation
- duplicated_theme_exposure
- manual_kill_switch

## Shadow opportunity log
Track near-miss opportunities:
- candidate score
- threshold delta
- hypothetical lower-size pass?
- hypothetical relaxed conflict pass?
- subsequent 1d/2d/3d return path

## Required dashboards
- funnel by strategy family
- funnel by market
- no-trade Top N
- fill rate by entry type
- fill vs hypothetical close-only bug detector
- average threshold distance of near-misses

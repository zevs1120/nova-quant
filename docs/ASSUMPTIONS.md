# Assumptions

Last updated: 2026-03-09

This repository is simulation-first and explicitly labels maturity states.

## Execution realism profiles

Nova Quant uses structured assumption profiles, not loose constants:

- `exec-realism.replay.v2`
- `exec-realism.backtest.v2`
- `exec-realism.paper.v2`

Profiles include:

- `fee_bps_per_side`
- `slippage_bps_by_vol_bucket`
- `spread_bps_by_vol_bucket`
- `funding_bps_per_day` (crypto)
- default fill policies

## Fill and trigger policies

Supported policies:

1. `touch_based`
2. `bar_cross_based`
3. `conservative_fill`
4. `optimistic_fill` (testing only)

Replay keeps explicit:

- `fill_assumption_used`
- `slippage_assumption_used`
- `assumption_profile`

## Cost and sensitivity assumptions

Validation and portfolio layers include scenario sensitivity:

- `slippage_plus_25`
- `slippage_plus_50`
- `wider_spread`
- `adverse_funding`
- `strict_fill`

These scenarios are now part of:

- replay output,
- walk-forward summaries,
- candidate validation,
- portfolio simulation diagnostics.

## Funding / basis (crypto)

- Funding is modeled as adverse daily drag in realism profiles.
- Basis/funding features still influence strategy-level logic separately.
- Funding realism is first-class in sensitivity outputs but remains approximation-level.

## Leverage assumptions

- No broker-connected leverage execution in this repository.
- Leverage cap is an assumption field and risk hint, not an executable broker constraint.

## Validation and shadow assumptions

- Walk-forward keeps rolling train/validation/test + embargo.
- Replay is bar-level event ordered with explicit intrabar priority.
- Shadow outcomes prefer replay-derived forward paths; synthetic fallback remains when replay coverage is missing.

## Important disclaimer

This repository does not provide live broker-executed performance and does not claim deployable production alpha.
It is an auditable early-stage AI-native research platform with explicit limits.

# Execution Realism Model

Last updated: 2026-03-09

## Purpose

Nova Quant now uses a structured execution realism layer instead of loose constants.

Runtime module:

- `src/research/validation/executionRealismModel.js`

Primary consumers:

- `src/research/validation/historicalReplayValidation.js`
- `src/research/core/walkForwardValidation.js`
- `src/research/discovery/candidateValidation.js`
- `src/portfolio_simulation/portfolioSimulationEngine.js`
- `src/research/evidence/evidenceSystem.js`

## Core design

Execution realism is profile-driven.

Profiles:

1. `exec-realism.replay.v2`
2. `exec-realism.backtest.v2`
3. `exec-realism.paper.v2`

Each profile defines:

- fee schedule (`fee_bps_per_side`)
- slippage schedule by volatility bucket
- spread schedule by volatility bucket
- funding drag (`funding_bps_per_day`, crypto)
- leverage cap hint
- fill policy defaults

Volatility buckets:

- `low`
- `normal`
- `high`
- `stress`

## Fill policies

Supported and explicit:

1. `touch_based`
2. `bar_cross_based`
3. `conservative_fill`
4. `optimistic_fill` (test-only mode)

Replay/validation now records the actual fill policy used per signal and scenario.

## Assumption objects

Every resolved assumption includes:

- `profile_id`
- `mode`
- `market`
- `volatility_bucket`
- `fee_bps_per_side`
- `spread_bps`
- `entry_slippage_bps`
- `exit_slippage_bps`
- `funding_bps_per_day`
- `fill_policy`

These are carried into:

- replay signal records,
- walk-forward strategy outputs,
- evidence objects,
- portfolio simulation diagnostics.

## What improved

Compared with earlier static assumptions:

- assumptions are now structured and mode-specific (`replay/backtest/paper`),
- fill policy is explicit and testable,
- spread and funding are first-class fields,
- sensitivity is scenario-driven and reproducible.

## Realism boundary

Still approximate:

- bar-level execution (no tick queue priority),
- funding modeled as adverse daily drag proxy,
- no venue-specific timestamped fee table history yet.

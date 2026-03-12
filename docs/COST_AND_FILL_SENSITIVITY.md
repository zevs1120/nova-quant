# Cost and Fill Sensitivity

Last updated: 2026-03-09

## Goal

Measure whether strategy and portfolio behavior survives harsher execution conditions, not only baseline assumptions.

## Scenarios

Nova Quant now evaluates these built-in scenarios:
1. `baseline`
2. `slippage_plus_25`
3. `slippage_plus_50`
4. `wider_spread`
5. `adverse_funding`
6. `strict_fill`

Optional test-only:
- `optimistic_fill_test_only` (for diagnostics only, not promotion claims)

## Where sensitivity is applied

### Replay
- Module: `src/research/validation/historicalReplayValidation.js`
- Output: `replay_validation.execution_sensitivity[]`
- Includes scenario summary and deltas vs baseline.

### Walk-forward validation
- Module: `src/research/core/walkForwardValidation.js`
- Outputs:
  - `cost_sensitivity` (including spread/funding/strict-fill stress),
  - `execution_realism.scenario_metrics`,
  - verdict flag `survives_after_harsh_execution`.

### Candidate validation
- Module: `src/research/discovery/candidateValidation.js`
- Stage-2/3 metrics now include:
  - explicit execution assumption profile,
  - scenario cost-stress returns.

### Portfolio simulation
- Module: `src/portfolio_simulation/portfolioSimulationEngine.js`
- Output:
  - `diagnostics.execution_realism.scenario_sensitivity[]`

## Governance and evidence implications

Execution realism now feeds:
- evidence objects (`assumption_profile`, `cost_realism_notes`, `fill_realism_notes`, `funding_realism_notes`),
- governance confidence (includes harsh-execution survival),
- promotion interpretation (pass/hold under stricter assumptions).

## How to interpret

1. If baseline passes but `strict_fill` fails, strategy is fragile to fill quality.
2. If `adverse_funding` breaks returns, crypto carry/funding logic needs tighter gating.
3. If `wider_spread` sharply degrades outcomes, low-liquidity windows are likely overexposed.
4. Use `survives_after_harsh_execution` as minimum production-credibility gate.

## Remaining realism gap

- scenario stress is still bar-level approximation,
- no full queue-position simulation,
- no venue-by-venue time-varying historical fee/funding table integration yet.

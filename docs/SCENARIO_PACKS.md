# Scenario Packs

Last updated: 2026-03-09

## Purpose

Scenario packs provide deterministic, rerunnable stress conditions for reliability hardening.

Source of truth:

- `data/reference_seeds/reliability_scenario_pack.json`

Runtime loader:

- `src/research/reliability/scenarioPacks.js`

Stress runner:

- `src/research/reliability/reliabilityStressFramework.js`

## Pack Contents

Each scenario includes:

- `scenario_id`
- `title`
- `category`
- `severity`
- `targets` (modules expected to react)
- `parameters` (deterministic stress inputs)

## Current Scenario Set

1. `elevated_volatility`
- Stresses regime + risk posture transition.

2. `risk_off_regime`
- Forces risk-off classification and no-trade guidance checks.

3. `concentrated_exposure`
- Overloads concentration/correlation budgets in risk engine.

4. `high_slippage`
- Applies slippage/spread multipliers in execution realism profile.

5. `poor_fills`
- Forces conservative fill assumptions and tests strict-fill consistency.

6. `strategy_starvation`
- Constrains discovery until candidate density collapses and checks diagnostics.

7. `strategy_crowding_fake_diversification`
- Simulates crowded strategy book to test correlation/diversification diagnostics.

8. `degraded_candidate_quality`
- Tightens validation thresholds to force rejection-heavy candidate cycle.

## Consistent Re-Run Workflow

Generate scenario report:

```bash
npm run stress:reliability
```

Output:

- `docs/research_reports/RELIABILITY_STRESS_REPORT.json`

## How To Extend

1. Add a scenario entry in:
- `data/reference_seeds/reliability_scenario_pack.json`

2. Implement handler in:
- `evaluateScenario(...)` switch inside `src/research/reliability/reliabilityStressFramework.js`

3. Add expectations in:
- `tests/reliabilityStressFramework.test.ts`
- `tests/reliabilityCoverage.test.ts` (if cross-layer behavior)

## Interpreting Results

- `status = resilient`: all scenario checks passed.
- `status = degraded`: one or more checks failed.
- `first_failure`: earliest failing module/check in that scenario.
- `summary.weakest_modules`: modules with lowest pass-rate across all packs.

This provides a failure-first reliability view rather than only average-case performance.

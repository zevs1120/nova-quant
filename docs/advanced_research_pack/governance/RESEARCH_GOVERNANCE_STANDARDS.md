# Research Governance Standards

Last updated: 2026-03-08

This standard defines evidence and control requirements for strategy lifecycle governance.

## 1) Lifecycle stages

- DRAFT
- SHADOW
- CANARY
- PROD
- RETIRED

## 2) Promotion evidence thresholds

## DRAFT -> SHADOW

Required:

1. clear hypothesis-template mapping,
2. valid data/feature lineage,
3. minimum sanity + quick backtest pass,
4. explicit failure conditions.

## SHADOW -> CANARY

Required:

1. walk-forward/OOS viability,
2. cost sensitivity survives stress,
3. regime behavior understood,
4. no critical evidence-chain gaps,
5. positive expected portfolio marginal value.

## CANARY -> PROD

Required:

1. stable behavior under live-like constraints,
2. controlled drawdown profile,
3. sustained risk-bucket compliance,
4. governance review approval,
5. rollback readiness.

## 3) Shadow requirements

- Track signal frequency and conversion.
- Track paper feasibility and slippage drift.
- Track rejection reasons and adaptation options.

## 4) Canary requirements

- Limited capital/risk budget.
- Daily degradation checks.
- Forced review on abnormal drawdown or conversion collapse.

## 5) Production credibility standards

- Full evidence chain present.
- Validation and monitoring artifacts current.
- No unresolved critical warnings.
- Clear user-facing explanation compatibility.

## 6) Rollback conditions

Trigger rollback when one or more occur:

- severe recent-vs-historical degradation,
- regime incompatibility breach,
- persistent cost slippage failure,
- concentration/risk budget violation.

## 7) Retirement conditions

Retire strategy when:

- repeated rollback cycles fail,
- edge disappears under realistic assumptions,
- portfolio contribution turns persistently negative,
- maintenance burden exceeds expected utility.

## 8) Version comparison logic

Compare versions on:

- net performance,
- drawdown asymmetry,
- stability,
- regime robustness,
- portfolio marginal value,
- operational confidence.

## 9) Documentation requirement by stage

Every strategy version must retain:

- hypothesis, template, params,
- validation summary,
- cost/risk/regime notes,
- promotion history and reviewer source,
- demotion/rollback rationale if applicable.

## 10) Module consumers

- `src/research/core/strategyGovernanceV2.js`
- `src/research/evidence/evidenceSystem.js`
- `src/research/discovery/candidateScoring.js`
- `src/research/weekly_cycle/weeklyResearchCycle.js`

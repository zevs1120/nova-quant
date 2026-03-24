# Strategy Promotion Criteria

Last updated: 2026-03-09

This file defines enforced promotion gates in Nova Quant governance workflow.

## DRAFT -> SHADOW

Required:

1. Evidence completeness score `>= 0.45`
2. Execution assumption profile present
3. Signal frequency `>= 3`
4. No required-check failure in governance review
5. Review approval state: `APPROVED`

Typical block reasons:

- missing evidence lineage
- missing execution profile
- insufficient signal density

## SHADOW -> CANARY

Required:

1. Evidence completeness score `>= 0.62`
2. Replay context present
3. Execution assumption profile present
4. Signal frequency `>= 5`
5. OOS positive ratio `>= 0.45`
6. Survives costs
7. Survives harsh execution assumptions
8. Stable validation verdict
9. Review approval state: `APPROVED`

Typical block reasons:

- cost or harsh-execution fragility
- unstable validation
- unresolved governance concerns

## CANARY -> PROD

Required:

1. Evidence completeness score `>= 0.72`
2. Replay context present
3. Execution assumption profile present
4. Signal frequency `>= 8`
5. OOS positive ratio `>= 0.55`
6. Survives costs
7. Survives harsh execution assumptions
8. Stable validation verdict
9. Operational confidence `>= 0.62`
10. No critical concerns
11. Review approval state: `APPROVED`

Typical block reasons:

- degradation warnings
- confidence below threshold
- execution realism breach under strict scenarios

## PROD Demotion / Rollback / Retirement

### Demotion (`PROD -> CANARY`)

Triggered when:

- severe warning not high enough for retirement,
- or validation status fails,
- or operational confidence breaks threshold.

### Rollback (`PROD -> CANARY`, standby canary referenced)

Triggered when:

- severe governance warning with rollback candidate available,
- critical concerns and confidence collapse.

### Retirement (`* -> RETIRED`)

Triggered when:

- critical degradation persists,
- harsh execution + cost fragility combine,
- strategy no longer justifies operational maintenance.

## Enforcement Module

- `src/research/core/strategyGovernanceV2.js`

## Output Paths

- `research_core.strategy_governance.stage_check_results`
- `research_core.strategy_governance.decision_objects`
- `research_core.strategy_governance.strategy_registry`

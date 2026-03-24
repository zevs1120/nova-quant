# Champion-Challenger Framework v1

## Objective

Enable controlled model evolution:

- `champion`: active baseline
- `challenger`: parallel alternatives under same data window

No challenger can replace champion without governance gate.

## Implementation

- Config and comparison logic: `src/quant/researchLoop.js`
- Default challengers:
  - trend-heavy
  - mean-reversion-adaptive
  - risk-lean

## Challenger Config Dimensions

Each challenger can vary:

- alpha family weights
- score bias / directional threshold
- risk penalty multipliers
- high-volatility gating
- max holdings / max weight / sector cap multipliers
- gross exposure multiplier
- safety sensitivity

## Comparison Contract (`ChallengerComparison`)

- return delta
- drawdown delta
- win-rate delta
- turnover delta
- regime stability
- risk-adjusted score
- overlap with champion
- `promotable` boolean

## Promotion Decision Contract (`PromotionDecision`)

- `decision_id`
- `challenger_id`
- `created_at`
- `status` (`testing` / `candidate`)
- `promotable`
- checklist with pass/fail per rule
- notes

## UI Mapping

- Performance page:
  - champion vs challenger comparison table
- Internal Research page:
  - challenger panel
  - promotion decisions
  - version registry

## Future Upgrade Targets

1. Multi-window gate (20D/60D/120D explicit slices).
2. Regime-specific challenger pools.
3. Automatic candidate queue with human approval workflow.

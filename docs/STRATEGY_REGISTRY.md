# Strategy Registry

Last updated: 2026-03-09

## Lifecycle

Nova Quant governance lifecycle (enforced):
1. `DRAFT`
2. `SHADOW`
3. `CANARY`
4. `PROD`
5. `RETIRED`

## Core Families and Templates

1. Momentum / Trend Following
- breakout
- pullback_continuation
- momentum_expansion
- volatility_expansion_continuation

2. Mean Reversion
- oversold_rebound
- overbought_fade
- anchor_deviation_reversion
- volatility_overshoot_reversion
- percentile_zscore_reversion

3. Regime Transition
- trend_to_range_transition
- volatility_regime_switch
- risk_on_to_risk_off_transition
- false_breakout_failed_trend_capture

4. Relative Strength / Cross-Sectional
- sector_strength_rotation
- cross_asset_momentum
- basket_rank_momentum
- leader_laggard_pair

5. Crypto-Native
- funding_dislocation
- basis_compression_expansion
- carry_oriented_setup
- velocity_shock
- liquidity_stress
- exchange_divergence_stress_proxy

6. Future Overlay (Optional)
- event_aware_filter_overlay
- options_flow_overlay
- sentiment_overlay
- vol_surface_overlay

## Strategy Registry Status Fields

`registry_system.strategy_registry` now includes governance status visibility:
- `current_state`
- `evidence_status`
- `validation_status`
- `review_status`
- `next_eligible_action`
- `next_eligible_state`
- `unresolved_concern_count`
- `last_review_timestamp`

Structured governance view:
- `registry_system.strategy_registry_governance_view`
- `research_core.strategy_governance.strategy_registry`

## Governance Metadata per Strategy Version

`research_core.strategy_governance.strategy_records[*]` includes:
- `strategy_id`
- `family`
- `template`
- `version`
- `evidence_summary`
- `validation_summary`
- `approval_state`
- `promotion_history`
- `demotion_history`
- `rollback_history`
- `retirement_reason` (if retired)

## Decision Objects

Governance emits typed decision objects:
- `PromotionDecision`
- `DemotionDecision`
- `RollbackDecision`
- `RetirementDecision`

Output paths:
- `research_core.strategy_governance.decision_objects.PromotionDecision`
- `research_core.strategy_governance.decision_objects.DemotionDecision`
- `research_core.strategy_governance.decision_objects.RollbackDecision`
- `research_core.strategy_governance.decision_objects.RetirementDecision`

## Implementation References

- `src/research/core/strategyFamilies.js`
- `src/research/core/strategyGovernanceV2.js`
- `src/research/discovery/strategyDiscoveryEngine.js`
- `src/engines/pipeline.js`
- `docs/GOVERNANCE_WORKFLOW.md`
- `docs/STRATEGY_PROMOTION_CRITERIA.md`

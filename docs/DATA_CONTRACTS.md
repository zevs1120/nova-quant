# Nova Quant Data Contracts

Last updated: 2026-03-08

This file defines review-facing contracts used by research core.

## Opportunity (Product-Facing)

```json
{
  "opportunity_id": "OPP-SIG-123",
  "asset": "AAPL",
  "market": "US",
  "direction": "LONG",
  "strategy_family": "Momentum / Trend",
  "strategy_template": "EQ_SWING",
  "regime_compatibility": {
    "state": "trend",
    "posture": "GO",
    "compatibility": "compatible"
  },
  "entry": { "low": 182.4, "high": 184.1 },
  "stop": { "price": 178.8 },
  "targets": [{ "price": 188.5, "size_pct": 60 }],
  "suggested_size_pct": 6.2,
  "risk_bucket": "A_quality",
  "holding_horizon": 4,
  "conviction": 0.71,
  "rationale_summary": ["Breakout structure confirmed."],
  "invalidation_conditions": ["Invalidation price: 178.8"],
  "evidence_fields": { "regime_state": "trend" },
  "audit_lineage": {
    "signal_id": "SIG-123",
    "strategy_version": "v1",
    "parameter_version": "params-v1",
    "generated_at": "2026-03-08T13:00:00.000Z"
  }
}
```

## DecisionSnapshot (Decision Engine Output)

```json
{
  "as_of": "2026-03-14T10:00:00.000Z",
  "source_status": "DB_BACKED",
  "data_status": "DB_BACKED",
  "today_call": {
    "code": "PROBE",
    "headline": "今天适合试探，不适合激进",
    "subtitle": "Only the clearest setup remains valid after the risk gate."
  },
  "risk_state": {
    "posture": "PROBE",
    "summary": "今天适合试探，不适合激进",
    "simple_label": "可试探",
    "user_message": "Take only the clearest setups and keep size controlled."
  },
  "portfolio_context": {
    "availability": "PERSONALIZED",
    "holdings_count": 3,
    "total_weight_pct": 42.5,
    "top1_pct": 18.0,
    "same_symbol_weight_pct": 14.0,
    "exposure_posture": "moderate",
    "recommendation": "Portfolio risk is active but manageable. New exposure should be selective."
  },
  "ranked_action_cards": [
    {
      "action_id": "action-SIG-1",
      "signal_id": "SIG-1",
      "symbol": "AAPL",
      "action": "add_on_strength",
      "action_label": "Add on strength",
      "portfolio_intent": "add_on_strength",
      "confidence": 0.78,
      "time_horizon": "days to weeks",
      "brief_why_now": "Setup aligns with the current strategy under a still-usable regime.",
      "risk_note": "Take only the clearest setups and keep size controlled.",
      "eligible": true,
      "evidence_bundle": {
        "thesis": "Setup aligns with the current strategy under a still-usable regime.",
        "supporting_factors": ["trend persistence"],
        "opposing_factors": ["Portfolio concentration is already high."],
        "regime_context": { "regime_id": "TREND" },
        "event_context": { "availability": "DB_BACKED" },
        "data_quality": { "source_status": "DB_BACKED", "data_status": "DB_BACKED" },
        "implementation_caveats": ["Keep size small because posture is PROBE."],
        "next_action": "add_on_strength",
        "what_changed": "Top action changed from NVDA to AAPL."
      }
    }
  ],
  "evidence_summary": {
    "top_action_thesis": "Setup aligns with the current strategy under a still-usable regime.",
    "main_risk_driver": "Average volatility percentile 69.0.",
    "personalized": true
  },
  "audit": {
    "candidate_count": 8,
    "actionable_count": 3,
    "rejected_due_to_risk": 1,
    "created_for_user": "guest-default"
  }
}
```

## Signal Lifecycle Objects

```json
{
  "raw_signal": {
    "signal_id": "SIG-123",
    "asset": "AAPL",
    "market": "US",
    "strategy_family": "Momentum / Trend",
    "source_status": "NEW"
  },
  "scored_signal": {
    "signal_id": "SIG-123",
    "score": 0.74,
    "conviction": 0.71,
    "risk_score": 41.2,
    "regime_compatibility": 78
  },
  "filtered_signal": {
    "signal_id": "SIG-345",
    "rejection_reason": "risk_budget_exhausted"
  },
  "executable_opportunity": {
    "signal_id": "SIG-123",
    "executable_mode": "size_reduced",
    "suggested_size_pct": 5.0
  }
}
```

## RegimeState

```json
{
  "state": {
    "primary": "high_volatility",
    "combined": "range_high_vol",
    "risk_posture": "defensive",
    "recommended_user_posture": "REDUCE",
    "default_sizing_multiplier": 0.56,
    "warning_severity": "MEDIUM",
    "expected_trade_density_band": { "min": 2, "max": 8 }
  },
  "regime_confidence": 0.66,
  "transition_history": {
    "transition_count": 4,
    "recent_sequence": ["trend", "range", "high_volatility"]
  }
}
```

## RiskBudget

```json
{
  "user_risk_bucket": {
    "key": "balanced",
    "max_concurrent_trades": 5,
    "total_exposure_cap_pct": 52,
    "max_total_active_risk_pct": 3.2
  },
  "portfolio_risk_budget": {
    "used_total_exposure_pct": 38.4,
    "used_total_active_risk_pct": 2.1,
    "correlated_exposure_pct": 16.8,
    "market_concentration_pct": 24.3,
    "asset_class_concentration_pct": 31.2,
    "budget_status": "within_limits"
  }
}
```

## SignalFunnelRecord

```json
{
  "overall": {
    "universe": 120,
    "prefilter_passed": 110,
    "generated": 30,
    "regime_filter_passed": 24,
    "score_threshold_passed": 18,
    "risk_filter_passed": 12,
    "conflict_filter_passed": 10,
    "executable": 9,
    "entered_positions": 9,
    "filled": 6,
    "roundtrip": 4
  },
  "threshold_sensitivity": {
    "near_threshold_share": 0.33
  }
}
```

## ShadowOpportunity

```json
{
  "shadow_id": "SHADOW-014",
  "asset": "ETH-USDT",
  "market": "CRYPTO",
  "strategy_family": "Crypto-Native",
  "strategy_template": "basis_compression_expansion",
  "regime": "high_volatility",
  "filter_reason": "risk_budget_exhausted",
  "reduced_size_would_be_allowed": true,
  "forward_performance": { "forward_1": 0.0041, "forward_5": 0.0132 },
  "drawdown_profile": { "max_drawdown_proxy": -0.021 },
  "threshold_over_strictness_flag": true
}
```

## ResearchAutomationSummary

```json
{
  "deterioration_alerts": [{ "strategy_id": "challenger-a", "severity": "medium" }],
  "signal_starvation": { "starvation_detected": true, "executable_ratio": 0.22 },
  "candidate_strategy_suggestions": [{ "suggestion_type": "density_recovery" }],
  "weekly_research_summary": {
    "headline": "System favors selective execution.",
    "confidence_adjustment": "reduce_confidence"
  }
}
```

## StrategyDiscoveryCandidate

```json
{
  "candidate_id": "CAND-3498291021",
  "strategy_id": "SD-TMP-BREAKOUT-CONT-1021",
  "lifecycle_stage": "DRAFT",
  "hypothesis_id": "HYP-MOM-PERSIST",
  "template_id": "TMP-BREAKOUT-CONT",
  "strategy_family": "Momentum / Trend Following",
  "supported_asset_classes": ["US_STOCK", "CRYPTO"],
  "compatible_regimes": ["trend", "uptrend_normal"],
  "supporting_features": ["trend_strength", "breakout_distance"],
  "parameter_set": {
    "breakout_percentile": 0.75,
    "trend_lookback": 30,
    "volatility_filter": 0.65
  },
  "quality_prior_score": 0.71,
  "traceability": {
    "hypothesis_origin": "HYP-MOM-PERSIST",
    "template_origin": "TMP-BREAKOUT-CONT",
    "generated_by": "strategy-discovery-engine.v1"
  }
}
```

## StrategyDiscoveryDecision

```json
{
  "discovery_decision_id": "discovery-003",
  "candidate_id": "CAND-3498291021",
  "strategy_id": "SD-TMP-BREAKOUT-CONT-1021",
  "decision": "PROMOTE_TO_SHADOW",
  "from_stage": "DRAFT",
  "to_stage": "SHADOW",
  "metrics_summary": {
    "candidate_quality_score": 0.78,
    "performance_score": 0.73,
    "robustness_score": 0.75,
    "regime_stability_score": 0.7,
    "diversification_score": 0.62
  },
  "rationale": "Candidate quality score and validation outcomes satisfy shadow promotion gate.",
  "reviewer_source": "system-generated",
  "created_at": "2026-03-08T13:00:00.000Z"
}
```

## StrategyDiscoverySummary

```json
{
  "summary": {
    "generated_candidates": 48,
    "survivors_after_validation": 19,
    "promoted_to_shadow": 7,
    "discovery_success_rate": 0.1458
  },
  "candidate_diagnostics": {
    "by_hypothesis": [
      { "hypothesis_id": "HYP-MOM-PERSIST", "generated": 8, "promoted_to_shadow": 2 }
    ],
    "by_regime": [{ "regime": "trend", "generated": 20, "promoted": 4 }],
    "top_failure_reasons": [{ "reason": "parameter_fragility", "count": 9 }],
    "coverage_gaps": { "regime_gaps": ["stress_risk_off"], "asset_class_gaps": [] }
  }
}
```

## ResearchEvidenceRecord

```json
{
  "evidence_id": "EVID-CAND-123",
  "strategy_id": "SD-TMP-BREAKOUT-1234",
  "candidate_id": "CAND-1234",
  "hypothesis_id": "HYP-MOM-001",
  "template_id": "TMP-BREAKOUT-CONT",
  "feature_set": ["trend_strength", "breakout_distance"],
  "parameter_set": { "breakout_percentile": 0.75 },
  "validation_summary": { "status": "pass_to_scoring", "candidate_quality_score": 0.82 },
  "regime_performance": { "expected_regimes": ["trend"] },
  "cost_sensitivity": { "validation_cost_stress": { "plus_50pct_cost": 0.011 } },
  "walk_forward_results": { "summary": { "positive_window_ratio": 0.6 } },
  "governance_state": { "current_stage": "SHADOW", "next_stage": "CANARY" },
  "promotion_history": [{ "source": "discovery_engine", "decision": "PROMOTE_TO_SHADOW" }],
  "production_recommendation": {
    "recommendation": "PROMOTE_TO_SHADOW",
    "lifecycle_target": "SHADOW"
  }
}
```

## GovernanceStrategyRecord

```json
{
  "strategy_id": "champion",
  "family": "Momentum / Trend",
  "template": "SWING_MOMENTUM",
  "version": "v1",
  "current_stage": "CANARY",
  "next_stage": "PROD",
  "action": "PROMOTE",
  "evidence_summary": {
    "completeness_score": 0.82,
    "status": "complete"
  },
  "validation_summary": {
    "status": "pass",
    "survives_out_of_sample": true,
    "survives_after_costs": true,
    "survives_after_harsh_execution": true
  },
  "review_status": "APPROVED",
  "next_eligible_action": "PROMOTE_TO_PROD",
  "promotion_history": [
    { "at": "2026-03-09T12:00:00.000Z", "from_state": "SHADOW", "to_state": "CANARY" }
  ],
  "demotion_history": [],
  "rollback_history": [],
  "retirement_reason": null
}
```

## GovernanceDecisionObject

```json
{
  "decision_object_id": "gov-promotiondecision-champion-2026-03-09",
  "decision_type": "PromotionDecision",
  "strategy_id": "champion",
  "family": "Momentum / Trend",
  "template": "SWING_MOMENTUM",
  "version": "v1",
  "from_state": "CANARY",
  "to_state": "PROD",
  "approval_state": "APPROVED",
  "reviewer": "system-generated",
  "review_timestamp": "2026-03-09T12:00:00.000Z",
  "decision_rationale": "Canary evidence and validation gates pass promotion thresholds.",
  "evidence_links": ["walk_forward_validation.strategies.champion"],
  "unresolved_concerns": [],
  "created_at": "2026-03-09T12:00:00.000Z"
}
```

## StrategyReviewRecord

```json
{
  "review_id": "review-champion-2026-03-09",
  "strategy_id": "champion",
  "strategy_version": "v1",
  "review_type": "promotion_review",
  "reviewer": "system-generated",
  "review_timestamp": "2026-03-09T12:00:00.000Z",
  "approval_state": "APPROVED",
  "decision_rationale": "Canary evidence and validation gates pass promotion thresholds.",
  "evidence_links": ["walk_forward_validation.strategies.champion.execution_realism"],
  "unresolved_concerns": [],
  "stage_at_review": "CANARY"
}
```

## PortfolioSimulationSummary

```json
{
  "metrics": {
    "portfolio_return": 0.0241,
    "drawdown": 0.118,
    "sharpe": 1.04,
    "volatility": 0.132,
    "turnover": 0.26
  },
  "exposures": {
    "by_strategy_family": [{ "strategy_family": "Momentum / Trend Following", "exposure": 0.31 }],
    "by_asset": [{ "asset": "AAPL", "exposure": 0.05 }]
  },
  "diagnostics": {
    "diversification_contribution": { "diversification_score": 0.57 },
    "marginal_strategy_impact": [{ "strategy_id": "SD-ABC", "delta_expected_return": 0.0012 }],
    "portfolio_stability_across_regimes": [{ "regime": "risk_off", "stability_label": "mixed" }]
  }
}
```

## AiResearchCopilotOutput

```json
{
  "research_insights": [
    {
      "severity": "high",
      "title": "Signal starvation detected",
      "message": "Signal funnel executable ratio is low; review score/risk/conflict filters.",
      "evidence_refs": ["signal_funnel_diagnostics.overall"]
    }
  ],
  "hypothesis_suggestions": [{ "type": "expand_winning_hypotheses" }],
  "top_actions": [{ "rank": 1, "action": "Signal starvation detected" }]
}
```

## Contract Notes

- All timestamps are UTC ISO-8601.
- Percentage fields use explicit `_pct` suffix.
- Status labels use controlled vocabulary.
- Experimental fields are explicitly marked in docs and component status.

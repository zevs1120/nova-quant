import { ENTITY_STAGE, canPromoteStage, normalizeStage, registryId } from './taxonomy.js';

export const PROMOTION_RULES = [
  {
    rule_id: 'PR-DRAFT-TEST',
    from_stage: ENTITY_STAGE.DRAFT,
    to_stage: ENTITY_STAGE.TESTING,
    checks: ['data_quality_ready', 'min_sample_size_ready'],
  },
  {
    rule_id: 'PR-TEST-PAPER',
    from_stage: ENTITY_STAGE.TESTING,
    to_stage: ENTITY_STAGE.PAPER,
    checks: ['stability_min', 'drawdown_guard', 'turnover_guard'],
  },
  {
    rule_id: 'PR-PAPER-CANDIDATE',
    from_stage: ENTITY_STAGE.PAPER,
    to_stage: ENTITY_STAGE.CANDIDATE,
    checks: ['paper_feasible', 'incremental_value', 'regime_robustness'],
  },
  {
    rule_id: 'PR-CANDIDATE-CHAMP',
    from_stage: ENTITY_STAGE.CANDIDATE,
    to_stage: ENTITY_STAGE.CHAMPION,
    checks: [
      'return_delta_min',
      'drawdown_not_worse',
      'risk_adjusted_not_worse',
      'overlap_not_too_high',
    ],
  },
  {
    rule_id: 'PR-CHAMP-RETIRE',
    from_stage: ENTITY_STAGE.CHAMPION,
    to_stage: ENTITY_STAGE.RETIRED,
    checks: ['persistent_deterioration', 'paper_consistency_break'],
  },
];

function toFailureReasons({ comparison, dataQualityStatus = 'healthy' }) {
  const reasons = [];
  const metrics = comparison?.metrics || {};
  if ((metrics.regime_robustness?.challenger ?? metrics.regime_stability?.challenger ?? 0) < 0.45) {
    reasons.push('unstable_across_regimes');
  }
  if ((metrics.overlap_with_champion ?? 1) > 0.88) {
    reasons.push('too_correlated');
  }
  if ((metrics.drawdown?.delta ?? 0) > 0.01) {
    reasons.push('drawdown_too_high');
  }
  if ((metrics.return?.delta ?? 0) < 0.003) {
    reasons.push('too_little_incremental_value');
  }
  if (String(dataQualityStatus).toLowerCase() !== 'healthy') {
    reasons.push('data_quality_insufficient');
  }
  if ((metrics.turnover?.challenger ?? 0) > (metrics.turnover?.champion ?? 0) * 1.25) {
    reasons.push('turnover_too_high');
  }
  if ((metrics.paper_feasibility?.challenger ?? 0) < 0.5) {
    reasons.push('paper_feasibility_too_low');
  }
  if ((metrics.stability?.challenger ?? 0) < 0.55) {
    reasons.push('backtest_stability_too_low');
  }
  return reasons;
}

function nextStageFromDecision(decision, promotable) {
  const current = normalizeStage(decision?.status || ENTITY_STAGE.TESTING, ENTITY_STAGE.TESTING);
  if (!promotable) return current;
  if (current === ENTITY_STAGE.TESTING) return ENTITY_STAGE.PAPER;
  if (current === ENTITY_STAGE.PAPER) return ENTITY_STAGE.CANDIDATE;
  if (current === ENTITY_STAGE.CANDIDATE) return ENTITY_STAGE.CHAMPION;
  return current;
}

function decisionRationale(promotable, failureReasons) {
  if (promotable) {
    return 'Challenger passed current gates and can move to next stage.';
  }
  if (!failureReasons.length) {
    return 'Challenger remains in current stage pending additional observations.';
  }
  return `Promotion rejected due to: ${failureReasons.join(', ')}.`;
}

export function buildPromotionDecisions({
  comparisons = [],
  decisions = [],
  asOf = new Date().toISOString(),
  dataQualityStatus = 'healthy',
} = {}) {
  const byChallenger = new Map(decisions.map((item) => [item.challenger_id, item]));

  return comparisons.map((comparison) => {
    const existing = byChallenger.get(comparison.challenger_id);
    const promotable = Boolean(comparison.promotable);
    const currentStage = normalizeStage(
      existing?.status || ENTITY_STAGE.TESTING,
      ENTITY_STAGE.TESTING,
    );
    const targetStage = nextStageFromDecision(existing, promotable);
    const failureReasons = promotable ? [] : toFailureReasons({ comparison, dataQualityStatus });

    return {
      decision_id:
        existing?.decision_id ||
        registryId('promotion_decision', comparison.challenger_id, asOf.slice(0, 10)),
      experiment_id: registryId('experiment', comparison.challenger_id, asOf.slice(0, 10)),
      compared_entities: {
        champion_id: comparison.champion_id,
        challenger_id: comparison.challenger_id,
      },
      metrics_summary: comparison.metrics,
      decision: {
        approved: promotable && canPromoteStage(currentStage, targetStage),
        from_stage: currentStage,
        to_stage: targetStage,
      },
      rationale: decisionRationale(promotable, failureReasons),
      reviewer: 'system-generated',
      created_at: asOf,
      failure_reasons: failureReasons,
      promotable,
    };
  });
}

export function buildPromotionLoop({
  comparisons = [],
  decisions = [],
  asOf = new Date().toISOString(),
  dataQualityStatus = 'healthy',
} = {}) {
  const promotionDecisions = buildPromotionDecisions({
    comparisons,
    decisions,
    asOf,
    dataQualityStatus,
  });

  return {
    generated_at: asOf,
    rules: PROMOTION_RULES,
    decisions: promotionDecisions,
  };
}

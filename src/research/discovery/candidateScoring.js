import { clamp, round } from '../../engines/math.js';

function performanceScore(metrics = {}) {
  const retNorm = clamp((Number(metrics.return || 0) + 0.03) / 0.18, 0, 1);
  const drawdownNorm = clamp(1 - Number(metrics.drawdown || 0) / 0.32, 0, 1);
  const sharpeNorm = clamp((Number(metrics.sharpe_proxy || 0) + 0.05) / 1.1, 0, 1);
  return round(0.45 * retNorm + 0.3 * drawdownNorm + 0.25 * sharpeNorm, 4);
}

function robustnessScore(metrics = {}, stageResults = []) {
  const passCount = (stageResults || []).filter((row) => row.pass).length;
  const passRatio = stageResults.length ? passCount / stageResults.length : 0;
  const walkforward = clamp(Number(metrics.walkforward_positive_ratio || 0), 0, 1);
  const turnoverPenalty = clamp(1 - Number(metrics.turnover || 0) / 1.3, 0, 1);
  return round(0.5 * passRatio + 0.3 * walkforward + 0.2 * turnoverPenalty, 4);
}

function recommendationFromScore(score, status) {
  if (status !== 'pass_to_scoring') {
    return {
      recommendation: 'REJECT',
      lifecycle_action: 'KEEP_DRAFT',
      next_stage: 'DRAFT',
    };
  }

  if (score >= 0.86) {
    return {
      recommendation: 'PROMOTE_TO_SHADOW',
      lifecycle_action: 'PROMOTE',
      next_stage: 'SHADOW',
    };
  }

  if (score >= 0.74) {
    return {
      recommendation: 'HOLD_FOR_RETEST',
      lifecycle_action: 'HOLD',
      next_stage: 'DRAFT',
    };
  }

  return {
    recommendation: 'REJECT',
    lifecycle_action: 'REJECT',
    next_stage: 'DRAFT',
  };
}

function scoreSingle(validationRow, candidate) {
  const metrics = validationRow.metrics || {};
  const stageResults = validationRow.validation_stage_results || [];

  const componentScores = {
    performance_score: performanceScore(metrics),
    robustness_score: robustnessScore(metrics, stageResults),
    regime_stability_score: clamp(Number(metrics.regime_stability_score || 0), 0, 1),
    diversification_score: clamp(Number(metrics.diversification_score || 0), 0, 1),
    cost_sensitivity_score: clamp(Number(metrics.cost_sensitivity_score || 0), 0, 1),
    parameter_stability_score: clamp(Number(metrics.parameter_stability_score || 0), 0, 1),
  };

  const qualityScore = round(
    0.26 * componentScores.performance_score +
      0.2 * componentScores.robustness_score +
      0.16 * componentScores.regime_stability_score +
      0.14 * componentScores.diversification_score +
      0.12 * componentScores.cost_sensitivity_score +
      0.12 * componentScores.parameter_stability_score,
    4,
  );

  const recommendation = recommendationFromScore(qualityScore, validationRow.final_status);

  return {
    candidate_id: validationRow.candidate_id,
    strategy_id: validationRow.strategy_id,
    hypothesis_id: candidate?.hypothesis_id || null,
    template_id: candidate?.template_id || null,
    final_status: validationRow.final_status,
    rejection_reasons: validationRow.rejection_reasons || [],
    component_scores: componentScores,
    candidate_quality_score: qualityScore,
    candidate_quality_score_pct: Math.round(qualityScore * 100),
    recommendation: recommendation.recommendation,
    lifecycle_action: recommendation.lifecycle_action,
    next_stage: recommendation.next_stage,
    metrics_snapshot: metrics,
    decision_trace: {
      score_formula_version: 'candidate-quality.v1',
      weighted_components: {
        performance: 0.26,
        robustness: 0.2,
        regime_stability: 0.16,
        diversification: 0.14,
        cost_sensitivity: 0.12,
        parameter_stability: 0.12,
      },
    },
  };
}

export function buildCandidateScoring({
  asOf = new Date().toISOString(),
  candidates = [],
  validation = {},
} = {}) {
  const candidateById = new Map((candidates || []).map((row) => [row.candidate_id, row]));
  const rows = (validation?.candidates || []).map((validationRow) =>
    scoreSingle(validationRow, candidateById.get(validationRow.candidate_id)),
  );

  const promoted = rows.filter((row) => row.recommendation === 'PROMOTE_TO_SHADOW');
  const hold = rows.filter((row) => row.recommendation === 'HOLD_FOR_RETEST');
  const rejected = rows.filter((row) => row.recommendation === 'REJECT');

  return {
    generated_at: asOf,
    scoring_version: 'candidate-quality-score.v1',
    candidates: rows,
    ranking: [...rows].sort((a, b) => b.candidate_quality_score - a.candidate_quality_score),
    summary: {
      total_candidates: rows.length,
      promoted_to_shadow: promoted.length,
      hold_for_retest: hold.length,
      rejected: rejected.length,
      avg_candidate_quality_score: rows.length
        ? round(rows.reduce((acc, row) => acc + row.candidate_quality_score, 0) / rows.length, 4)
        : 0,
    },
  };
}

/**
 * Strategy Evaluator — per-strategy independent evaluation and aggregation.
 *
 * Adapted from daily_stock_analysis's SkillAgent pattern where each strategy
 * independently evaluates a signal, then results are aggregated. In DSA, this
 * was LLM-driven; here it's engine-driven (pure computation).
 *
 * Each template's trigger_conditions and invalidation rules are checked against
 * the signal's regime, velocity, and cost data to produce a structured report.
 */

import { clamp, round } from './math.js';

const SIGNAL_LEVELS = ['strong', 'moderate', 'weak', 'skip'];

/**
 * Score how well the current market conditions match a strategy's trigger conditions.
 *
 * This is a heuristic evaluation — it maps engine-available data (regime,
 * velocity, cost) to the natural-language trigger conditions and rules
 * defined in each strategy template.
 *
 * @param {object} params
 * @param {object} params.template - Strategy template with trigger_conditions, invalidation, rules
 * @param {object} params.regime - Regime snapshot (trend_strength, vol_percentile, risk_off_score)
 * @param {object} params.series - Velocity series data
 * @param {number} params.expectedR - Expected R:R ratio
 * @param {number} params.confidenceNorm - Normalized confidence (0-1)
 * @returns {{ strategy_id: string, signal: string, confidence: number, conditions_met: string[], conditions_missed: string[], score_adjustment: number }}
 */
export function evaluateStrategy({ template, regime, series, expectedR, confidenceNorm }) {
  const conditionsMet = [];
  const conditionsMissed = [];

  const trendStrength = regime?.trend_strength ?? 0.5;
  const volPercentile = regime?.vol_percentile ?? 0.5;
  const riskOffScore = regime?.risk_off_score ?? 0.5;
  const velocityPercentile = series?.latest?.percentile ?? 0.5;
  const acceleration = series?.latest?.acceleration ?? 0;

  const regimeTags = template.regime_tags || [];
  const features = template.features || [];

  // Condition 1: Trend alignment
  if (features.includes('trend_strength') || features.includes('trend_alignment')) {
    if (trendStrength > 0.55) {
      conditionsMet.push('trend_alignment_strong');
    } else if (trendStrength > 0.4) {
      conditionsMet.push('trend_alignment_moderate');
    } else {
      conditionsMissed.push('trend_alignment_weak');
    }
  }

  // Condition 2: Velocity confirmation
  if (features.includes('velocity_percentile') || features.includes('breakout_confirmation')) {
    if (velocityPercentile > 0.65) {
      conditionsMet.push('velocity_expansion');
    } else if (velocityPercentile > 0.4) {
      conditionsMet.push('velocity_moderate');
    } else {
      conditionsMissed.push('velocity_insufficient');
    }
  }

  // Condition 3: Volatility state
  if (features.includes('vol_percentile') || features.includes('implied_vol_rank')) {
    if (regimeTags.includes('high_vol')) {
      // High-vol strategies WANT volatility
      if (volPercentile > 0.6) {
        conditionsMet.push('vol_environment_favorable');
      } else {
        conditionsMissed.push('vol_insufficient_for_strategy');
      }
    } else {
      // Most strategies prefer moderate vol
      if (volPercentile < 0.75) {
        conditionsMet.push('vol_within_range');
      } else {
        conditionsMissed.push('vol_too_elevated');
      }
    }
  }

  // Condition 4: Risk-off check
  if (features.includes('risk_off_score') || regimeTags.includes('risk_off')) {
    if (regimeTags.includes('risk_off')) {
      // Risk-off strategy — designed for these conditions
      if (riskOffScore > 0.55) {
        conditionsMet.push('risk_off_environment_matches');
      } else {
        conditionsMissed.push('risk_off_not_elevated_enough');
      }
    } else {
      // Normal strategy — risk-off is a headwind
      if (riskOffScore < 0.55) {
        conditionsMet.push('risk_environment_acceptable');
      } else {
        conditionsMissed.push('risk_off_headwind');
      }
    }
  }

  // Condition 5: Volume features
  if (features.includes('volume_confirmation') || features.includes('volume_expansion')) {
    if (acceleration > 0) {
      conditionsMet.push('volume_expanding');
    } else {
      conditionsMissed.push('volume_contracting');
    }
  }

  // Condition 6: Cost structure validation
  if (features.includes('basis_spread') || features.includes('funding_rate')) {
    // Basis/carry-related features need controlled funding
    if (riskOffScore < 0.7) {
      conditionsMet.push('carry_conditions_acceptable');
    } else {
      conditionsMissed.push('carry_conditions_stressed');
    }
  }

  // Compute invalidation check
  let invalidated = false;
  const invalidation = template.invalidation || [];
  if (invalidation.length > 0) {
    // Check if data suggests invalidation conditions are met
    if (trendStrength < 0.25 && conditionsMissed.length >= 2) {
      invalidated = true;
      conditionsMissed.push('near_invalidation_zone');
    }
  }

  // Classify signal strength
  const metRatio =
    conditionsMet.length / Math.max(conditionsMet.length + conditionsMissed.length, 1);
  let signal;
  if (invalidated || metRatio < 0.25) {
    signal = 'skip';
  } else if (metRatio >= 0.75 && expectedR > 1.5) {
    signal = 'strong';
  } else if (metRatio >= 0.5) {
    signal = 'moderate';
  } else {
    signal = 'weak';
  }

  // Compute confidence and score adjustment
  const confidence = round(clamp(metRatio * confidenceNorm, 0, 1), 4);
  const scoreAdjustment =
    signal === 'strong'
      ? round(metRatio * 15, 2)
      : signal === 'moderate'
        ? round(metRatio * 5, 2)
        : signal === 'weak'
          ? round(-5 * (1 - metRatio), 2)
          : -20;

  return {
    strategy_id: template.strategy_id,
    signal,
    confidence,
    conditions_met: conditionsMet,
    conditions_missed: conditionsMissed,
    score_adjustment: scoreAdjustment,
  };
}

/**
 * Aggregate evaluations from multiple strategy perspectives.
 *
 * When the same signal is evaluated through multiple strategy lenses,
 * the aggregate produces a weighted final adjustment.
 *
 * @param {object[]} evaluations - Array of evaluateStrategy results
 * @returns {{ primary: object, consensus_signal: string, weighted_adjustment: number, evaluation_count: number }}
 */
export function aggregateEvaluations(evaluations) {
  if (!evaluations || evaluations.length === 0) {
    return {
      primary: null,
      consensus_signal: 'skip',
      weighted_adjustment: 0,
      evaluation_count: 0,
    };
  }

  // Primary = highest confidence evaluation
  const sorted = [...evaluations].sort((a, b) => b.confidence - a.confidence);
  const primary = sorted[0];

  // Consensus signal: majority voting
  const signalCounts = {};
  for (const e of evaluations) {
    signalCounts[e.signal] = (signalCounts[e.signal] || 0) + 1;
  }
  const consensus = Object.entries(signalCounts).sort(
    ([, a], [, b]) => Number(b) - Number(a),
  )[0][0];

  // Weighted adjustment: confidence-weighted average
  const totalConfidence = evaluations.reduce((sum, e) => sum + e.confidence, 0);
  const weightedAdj =
    totalConfidence > 0
      ? evaluations.reduce((sum, e) => sum + e.score_adjustment * e.confidence, 0) / totalConfidence
      : 0;

  return {
    primary,
    consensus_signal: consensus,
    weighted_adjustment: round(weightedAdj, 2),
    evaluation_count: evaluations.length,
  };
}

/**
 * Strategy Evaluator — per-strategy independent evaluation and aggregation.
 *
 * Adapted from daily_stock_analysis's SkillAgent pattern where each strategy
 * independently evaluates a signal, then results are aggregated. In DSA, this
 * was LLM-driven; here it's engine-driven (pure computation).
 *
 * P5: trigger_conditions are now machine-readable objects { field, op, value, label }.
 * Legacy NL strings are evaluated via heuristic fallback for backward compatibility.
 */

import { clamp, round } from './math.js';

const SIGNAL_LEVELS = ['strong', 'moderate', 'weak', 'skip'];

/* ─────────────────────────────────────────────────
 * Condition Context Builder
 * ───────────────────────────────────────────────── */

/**
 * Flatten all available runtime data into a single context object
 * for condition evaluation. Dot-path fields are pre-expanded.
 *
 * @param {object} regime - Regime snapshot
 * @param {object} series - Velocity series data
 * @param {object|null} technicalIndicators - From P4 computeIndicators()
 * @param {number} expectedR - Expected R:R ratio
 * @returns {object} Flat context for condition evaluation
 */
export function buildConditionContext({ regime, series, technicalIndicators, expectedR }) {
  const ctx = {
    // Regime fields
    trend_strength: regime?.trend_strength ?? 0.5,
    vol_percentile: regime?.vol_percentile ?? 0.5,
    risk_off_score: regime?.risk_off_score ?? 0.5,

    // Velocity fields
    velocity_percentile: series?.latest?.percentile ?? 0.5,
    acceleration: series?.latest?.acceleration ?? 0,

    // Signal fields
    expected_R: expectedR ?? 0,
  };

  // Technical indicators (P4) — flatten with dot-path convention
  if (technicalIndicators) {
    ctx.rsi_14 = technicalIndicators.rsi_14 ?? 50;
    ctx.rsi_6 = technicalIndicators.rsi_6 ?? 50;
    ctx.bias_rate_5 = technicalIndicators.bias_rate_5 ?? 0;
    ctx.bias_rate_10 = technicalIndicators.bias_rate_10 ?? 0;
    ctx.bias_rate_20 = technicalIndicators.bias_rate_20 ?? 0;
    ctx.volume_ratio = technicalIndicators.volume_ratio ?? 1;
    ctx.bar_count = technicalIndicators.bar_count ?? 0;

    // MACD sub-fields
    const m = technicalIndicators.macd || {};
    ctx['macd.dif'] = m.dif ?? 0;
    ctx['macd.dea'] = m.dea ?? 0;
    ctx['macd.bar'] = m.bar ?? 0;
    ctx['macd.above_zero'] = m.above_zero ?? false;
    ctx['macd.golden_cross'] = m.golden_cross ?? false;
    ctx['macd.death_cross'] = m.death_cross ?? false;

    // Bollinger sub-fields
    const bb = technicalIndicators.bollinger || {};
    ctx['bollinger.upper'] = bb.upper ?? 0;
    ctx['bollinger.middle'] = bb.middle ?? 0;
    ctx['bollinger.lower'] = bb.lower ?? 0;
    ctx['bollinger.width'] = bb.width ?? 0;

    // MA alignment
    const ma = technicalIndicators.ma_alignment || {};
    ctx['ma_alignment.status'] = ma.status ?? 'CONSOLIDATION';
    ctx['ma_alignment.ma5'] = ma.ma5 ?? 0;
    ctx['ma_alignment.ma10'] = ma.ma10 ?? 0;
    ctx['ma_alignment.ma20'] = ma.ma20 ?? 0;
  }

  return ctx;
}

/* ─────────────────────────────────────────────────
 * Condition Evaluator
 * ───────────────────────────────────────────────── */

/**
 * Evaluate a single structured condition against a context.
 *
 * @param {{ field: string, op: string, value: any, label?: string }} condition
 * @param {object} context - Flat context from buildConditionContext
 * @returns {{ passed: boolean, label: string }}
 */
export function evaluateCondition(condition, context) {
  const { field, op, value, label } = condition;
  const actual = context[field];

  // If field is not in context, condition fails
  if (actual === undefined || actual === null) {
    return { passed: false, label: label || `${field}_unavailable` };
  }

  let passed = false;
  switch (op) {
    case '>':
      passed = actual > value;
      break;
    case '>=':
      passed = actual >= value;
      break;
    case '<':
      passed = actual < value;
      break;
    case '<=':
      passed = actual <= value;
      break;
    case '==':
      passed = actual === value;
      break;
    case '!=':
      passed = actual !== value;
      break;
    case 'in':
      passed = Array.isArray(value) && value.includes(actual);
      break;
    default:
      passed = false;
  }

  return { passed, label: label || `${field}_${op}_${value}` };
}

/* ─────────────────────────────────────────────────
 * Legacy Heuristic Fallback
 * ───────────────────────────────────────────────── */

/**
 * Evaluate conditions using the legacy P2 heuristic logic.
 * Used when trigger_conditions contain plain strings instead of structured objects.
 */
function evaluateLegacyHeuristic({ template, context }) {
  const conditionsMet = [];
  const conditionsMissed = [];

  const { trend_strength, vol_percentile, risk_off_score, velocity_percentile, acceleration } =
    context;
  const regimeTags = template.regime_tags || [];
  const features = template.features || [];

  // Condition 1: Trend alignment
  if (features.includes('trend_strength') || features.includes('trend_alignment')) {
    if (trend_strength > 0.55) {
      conditionsMet.push('trend_alignment_strong');
    } else if (trend_strength > 0.4) {
      conditionsMet.push('trend_alignment_moderate');
    } else {
      conditionsMissed.push('trend_alignment_weak');
    }
  }

  // Condition 2: Velocity confirmation
  if (features.includes('velocity_percentile') || features.includes('breakout_confirmation')) {
    if (velocity_percentile > 0.65) {
      conditionsMet.push('velocity_expansion');
    } else if (velocity_percentile > 0.4) {
      conditionsMet.push('velocity_moderate');
    } else {
      conditionsMissed.push('velocity_insufficient');
    }
  }

  // Condition 3: Volatility state
  if (features.includes('vol_percentile') || features.includes('implied_vol_rank')) {
    if (regimeTags.includes('high_vol')) {
      if (vol_percentile > 0.6) {
        conditionsMet.push('vol_environment_favorable');
      } else {
        conditionsMissed.push('vol_insufficient_for_strategy');
      }
    } else {
      if (vol_percentile < 0.75) {
        conditionsMet.push('vol_within_range');
      } else {
        conditionsMissed.push('vol_too_elevated');
      }
    }
  }

  // Condition 4: Risk-off check
  if (features.includes('risk_off_score') || regimeTags.includes('risk_off')) {
    if (regimeTags.includes('risk_off')) {
      if (risk_off_score > 0.55) {
        conditionsMet.push('risk_off_environment_matches');
      } else {
        conditionsMissed.push('risk_off_not_elevated_enough');
      }
    } else {
      if (risk_off_score < 0.55) {
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
    if (risk_off_score < 0.7) {
      conditionsMet.push('carry_conditions_acceptable');
    } else {
      conditionsMissed.push('carry_conditions_stressed');
    }
  }

  return { conditionsMet, conditionsMissed };
}

/* ─────────────────────────────────────────────────
 * Main Evaluator
 * ───────────────────────────────────────────────── */

/**
 * Score how well the current market conditions match a strategy's trigger conditions.
 *
 * Supports two modes:
 * 1. **Structured** (P5): trigger_conditions are { field, op, value, label } objects.
 * 2. **Legacy**: trigger_conditions are plain strings → falls back to heuristic.
 *
 * @param {object} params
 * @param {object} params.template - Strategy template
 * @param {object} params.regime - Regime snapshot
 * @param {object} params.series - Velocity series data
 * @param {number} params.expectedR - Expected R:R ratio
 * @param {number} params.confidenceNorm - Normalized confidence (0-1)
 * @param {object|null} [params.technicalIndicators] - From computeIndicators()
 * @returns {{ strategy_id: string, signal: string, confidence: number, conditions_met: string[], conditions_missed: string[], score_adjustment: number }}
 */
export function evaluateStrategy({
  template,
  regime,
  series,
  expectedR,
  confidenceNorm,
  technicalIndicators,
}) {
  const context = buildConditionContext({ regime, series, technicalIndicators, expectedR });

  let conditionsMet = [];
  let conditionsMissed = [];

  const conditions = template.trigger_conditions || [];

  // Detect mode: structured vs legacy
  const hasStructured = conditions.some((c) => typeof c === 'object' && c.field && c.op);

  if (hasStructured) {
    // P5: evaluate structured conditions
    // Loader guarantees no mixing; defensive skip for safety
    for (const cond of conditions) {
      if (typeof cond !== 'object' || !cond.field || !cond.op) continue;
      const result = evaluateCondition(cond, context);
      if (result.passed) {
        conditionsMet.push(result.label);
      } else {
        conditionsMissed.push(result.label);
      }
    }
  } else {
    // Legacy: use heuristic evaluation
    const legacy = evaluateLegacyHeuristic({ template, context });
    conditionsMet = legacy.conditionsMet;
    conditionsMissed = legacy.conditionsMissed;
  }

  // P7: Structured invalidation check
  let invalidated = false;
  const invalidationReasons = [];
  const invalidation = template.invalidation || [];
  if (invalidation.length > 0) {
    const hasStructuredInval = invalidation.some(
      (c) => typeof c === 'object' && c !== null && c.field && c.op,
    );
    if (hasStructuredInval) {
      // Structured: evaluate each invalidation condition
      for (const cond of invalidation) {
        if (typeof cond !== 'object' || !cond.field || !cond.op) continue;
        const result = evaluateCondition(cond, context);
        if (result.passed) {
          invalidated = true;
          invalidationReasons.push(result.label);
        }
      }
    } else {
      // Legacy: hardcoded heuristic for NL strings
      if (context.trend_strength < 0.25 && conditionsMissed.length >= 2) {
        invalidated = true;
        invalidationReasons.push('near_invalidation_zone');
      }
    }
  }
  if (invalidationReasons.length > 0) {
    conditionsMissed.push(...invalidationReasons);
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
    invalidation_reasons: invalidationReasons,
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

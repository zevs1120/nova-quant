import { clamp, deterministicHash, mean, round, stdDev } from '../../engines/math.js';
import {
  applyScenarioToAssumption,
  buildExecutionSensitivityScenarios,
  estimateCostDragPct,
  resolveExecutionAssumptions,
  resolveExecutionRealismProfile,
} from '../validation/executionRealismModel.js';

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseHorizonDays(horizon) {
  const m = String(horizon || '').match(/(\d+)\s*[-/]?\s*(\d+)?/);
  if (!m) return { min: 2, max: 6, avg: 4 };
  const a = safeNumber(m[1], 2);
  const b = safeNumber(m[2], a);
  return {
    min: Math.min(a, b),
    max: Math.max(a, b),
    avg: round((a + b) / 2, 4),
  };
}

function familyBaseFrequency(family) {
  const key = String(family || '').toLowerCase();
  if (key.includes('mean')) return 26;
  if (key.includes('momentum')) return 18;
  if (key.includes('relative')) return 14;
  if (key.includes('regime')) return 10;
  if (key.includes('crypto')) return 16;
  return 12;
}

function parameterTightness(candidate) {
  const ranges = candidate?.parameter_space_reference || {};
  const params = candidate?.parameter_set || {};
  let sum = 0;
  let count = 0;

  for (const [name, value] of Object.entries(params)) {
    const range = ranges[name] || {};
    const min = Number(range.min);
    const max = Number(range.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) continue;
    const ratio = clamp((Number(value) - min) / (max - min), 0, 1);

    const lower = String(name).toLowerCase();
    const thresholdLike = /(threshold|trigger|cutoff|min|floor|sigma|zscore)/.test(lower);
    const capLike = /(cap|max|ceiling|hold|timeout|rebalance|size)/.test(lower);

    if (thresholdLike) {
      sum += ratio;
      count += 1;
      continue;
    }
    if (capLike) {
      sum += 1 - ratio;
      count += 1;
      continue;
    }

    sum += Math.abs(ratio - 0.5) * 0.6;
    count += 1;
  }

  return count ? round(sum / count, 4) : 0.5;
}

function estimatedSignalCount(candidate) {
  const base = familyBaseFrequency(candidate.strategy_family);
  const tightness = parameterTightness(candidate);
  const regimeCount = (candidate.compatible_regimes || []).length || 1;
  const horizon = parseHorizonDays(candidate.expected_holding_horizon);

  const count =
    base *
    (1.45 - tightness) *
    (0.8 + Math.min(regimeCount, 4) * 0.08) *
    (6 / Math.max(2, horizon.avg));
  return Math.max(0, Math.round(count));
}

function estimatedTurnover(candidate) {
  const horizon = parseHorizonDays(candidate.expected_holding_horizon);
  const modePenalty =
    candidate.generation_mode === 'exploratory'
      ? 0.16
      : candidate.generation_mode === 'regime_tuned'
        ? 0.1
        : 0.05;
  const turnover = clamp(1.25 / Math.max(1, horizon.avg) + modePenalty, 0.06, 1.45);
  return round(turnover, 4);
}

function candidateMarketKey(candidate = {}) {
  const classes = (candidate.supported_asset_classes || []).map((item) =>
    String(item).toUpperCase(),
  );
  if (classes.length && classes.every((item) => item === 'CRYPTO')) return 'CRYPTO';
  if (classes.includes('CRYPTO') && !classes.includes('US_STOCK')) return 'CRYPTO';
  return 'US';
}

function replayBenchmark(candidate = {}, context = {}) {
  const rows = context?.walkForward?.replay_validation?.market_replay_benchmarks || [];
  const market = candidateMarketKey(candidate);
  return rows.find((row) => String(row.market || '').toUpperCase() === market) || null;
}

function costSensitivityLevel(candidate) {
  const text = String(candidate.cost_sensitivity_assumption || '').toLowerCase();
  if (text.includes('hard-capped defensive') || text.includes('high')) return 'high';
  if (text.includes('medium')) return 'medium';
  return 'low';
}

function sanityStage(candidate, cfg = {}) {
  const estCount = estimatedSignalCount(candidate);
  const turnover = estimatedTurnover(candidate);
  const sensitivity = costSensitivityLevel(candidate);

  const lowSignalThreshold = safeNumber(cfg.min_signal_count, 10);
  const highSignalThreshold = safeNumber(cfg.max_signal_count, 90);
  const maxTurnover = safeNumber(cfg.max_turnover, 1.05);
  const leverageCap = Number(
    candidate.parameter_set?.leverage_cap ?? candidate.parameter_set?.max_leverage ?? 1,
  );

  const reasons = [];
  if (estCount < lowSignalThreshold) reasons.push('extremely_low_signal_count');
  if (estCount > highSignalThreshold) reasons.push('unrealistic_trade_frequency');
  if (turnover > maxTurnover) reasons.push('excessive_turnover_assumption');
  if (leverageCap > 2.5) reasons.push('extreme_leverage_dependence');
  if (sensitivity === 'high' && turnover > 1.05)
    reasons.push('fill_realism_risk_under_cost_stress');

  return {
    stage: 'stage_1_fast_sanity',
    pass: reasons.length === 0,
    rejection_reasons: reasons,
    metrics: {
      estimated_signal_count: estCount,
      estimated_turnover: turnover,
      leverage_cap: leverageCap,
      cost_sensitivity: sensitivity,
    },
  };
}

function quickBacktestStage(candidate, cfg = {}, context = {}) {
  const hash = deterministicHash(`${candidate.candidate_id}|quick_backtest`);
  const noise = ((hash % 1000) / 999) * 2 - 1;
  const prior = safeNumber(candidate.quality_prior_score, 0.5);
  const turnover = estimatedTurnover(candidate);
  const horizon = parseHorizonDays(candidate.expected_holding_horizon).avg;
  const replay = replayBenchmark(candidate, context);
  const executionProfile = resolveExecutionRealismProfile({
    mode: 'backtest',
    profile: cfg.execution_realism_profile || {},
    overrides: cfg.execution_realism_overrides || {},
  });
  const baselineAssumption = resolveExecutionAssumptions({
    profile: executionProfile,
    signal: { market: candidateMarketKey(candidate) },
    mode: 'backtest',
  });

  const replayReturn = safeNumber(replay?.avg_trade_return_post_cost, NaN);
  const replayDrawdown = Math.abs(safeNumber(replay?.avg_drawdown_abs, NaN));
  const replayWinRate = safeNumber(replay?.win_rate, NaN);

  const grossReturn = Number.isFinite(replayReturn)
    ? clamp(
        replayReturn * (0.9 + prior * 0.5) +
          0.012 +
          prior * 0.085 +
          noise * 0.025 -
          turnover * 0.03,
        -0.3,
        0.45,
      )
    : clamp(0.02 + prior * 0.18 + noise * 0.04 - turnover * 0.04, -0.3, 0.45);
  const costDrag = estimateCostDragPct({
    assumption: baselineAssumption,
    turnover,
    holdingDays: horizon,
    includeFunding: true,
  });
  const postCostReturn = grossReturn - costDrag;
  const drawdown = Number.isFinite(replayDrawdown)
    ? clamp(
        replayDrawdown * (0.85 + (1 - prior) * 0.4) + Math.abs(noise) * 0.04 + turnover * 0.08,
        0.03,
        0.65,
      )
    : clamp(0.06 + (1 - prior) * 0.22 + Math.abs(noise) * 0.1 + turnover * 0.12, 0.03, 0.65);
  const volProxy = clamp(0.08 + turnover * 0.22 + Math.abs(noise) * 0.05, 0.06, 0.5);
  const sharpeProxy = round(postCostReturn / Math.max(0.06, volProxy), 4);
  const hitRate = Number.isFinite(replayWinRate)
    ? clamp(replayWinRate * 0.62 + 0.24 + prior * 0.16 - turnover * 0.03 + noise * 0.02, 0.2, 0.9)
    : clamp(0.42 + prior * 0.28 - turnover * 0.08 + noise * 0.04, 0.2, 0.9);

  const minReturn = safeNumber(cfg.min_post_cost_return, -0.005);
  const maxDrawdown = safeNumber(cfg.max_drawdown, 0.34);
  const minSharpe = safeNumber(cfg.min_sharpe_proxy, 0.05);

  const reasons = [];
  if (postCostReturn < minReturn) reasons.push('post_cost_return_too_weak');
  if (drawdown > maxDrawdown) reasons.push('drawdown_too_high');
  if (sharpeProxy < minSharpe) reasons.push('risk_adjusted_return_too_low');

  return {
    stage: 'stage_2_quick_backtest',
    pass: reasons.length === 0,
    rejection_reasons: reasons,
    metrics: {
      return: round(postCostReturn, 6),
      drawdown: round(drawdown, 6),
      sharpe_proxy: sharpeProxy,
      turnover: round(turnover, 4),
      average_holding_time: round(horizon, 4),
      fee_bps: round(baselineAssumption.fee_bps_per_side, 4),
      slippage_bps: round(
        (baselineAssumption.entry_slippage_bps + baselineAssumption.exit_slippage_bps) / 2,
        4,
      ),
      spread_bps: round(baselineAssumption.spread_bps, 4),
      funding_bps_per_day: round(baselineAssumption.funding_bps_per_day, 4),
      execution_assumption_profile: {
        profile_id: baselineAssumption.profile_id,
        mode: baselineAssumption.mode,
        market: baselineAssumption.market,
        volatility_bucket: baselineAssumption.volatility_bucket,
      },
      replay_anchor_used: Boolean(replay),
      replay_anchor_market: replay?.market || null,
      replay_anchor_sample_trades: Number(replay?.closed_trades || 0),
    },
  };
}

function perturbationReturns(baseReturn, seed) {
  const deltas = [-0.06, -0.03, 0, 0.03, 0.06];
  return deltas.map((d, idx) => {
    const noise = (((seed + idx * 13) % 1000) / 999) * 2 - 1;
    return baseReturn + d * 0.18 + noise * 0.008;
  });
}

function robustnessStage(candidate, quickStage, cfg = {}) {
  const baseReturn = safeNumber(quickStage?.metrics?.return, 0);
  const baseDrawdown = safeNumber(quickStage?.metrics?.drawdown, 0.2);
  const seed = deterministicHash(`${candidate.candidate_id}|robustness`);

  const neighborhood = perturbationReturns(baseReturn, seed);
  const neighborhoodStd = stdDev(neighborhood);
  const parameterStabilityScore = clamp(1 - neighborhoodStd / 0.06, 0, 1);

  const regimes = (candidate.compatible_regimes || []).slice(0, 6);
  const regimeRows = (regimes.length ? regimes : ['unknown']).map((regime, idx) => {
    const noise = (((seed + idx * 37) % 1000) / 999) * 2 - 1;
    const ret = clamp(baseReturn + noise * 0.028 - idx * 0.003, -0.25, 0.35);
    const dd = clamp(baseDrawdown + Math.abs(noise) * 0.05 + idx * 0.006, 0.02, 0.7);
    return {
      regime,
      return: round(ret, 6),
      drawdown: round(dd, 6),
    };
  });

  const regimeReturns = regimeRows.map((r) => r.return);
  const regimeStability = clamp(1 - stdDev(regimeReturns) / 0.08, 0, 1);

  const turnover = safeNumber(quickStage?.metrics?.turnover, 0.5);
  const horizonDays = safeNumber(quickStage?.metrics?.average_holding_time, 3);
  const assumptionProfile = quickStage?.metrics?.execution_assumption_profile || {};
  const baseAssumption = {
    profile_id: assumptionProfile.profile_id,
    mode: assumptionProfile.mode,
    market: assumptionProfile.market,
    volatility_bucket: assumptionProfile.volatility_bucket,
    fee_bps_per_side: safeNumber(quickStage?.metrics?.fee_bps, 3),
    spread_bps: safeNumber(quickStage?.metrics?.spread_bps, 2),
    entry_slippage_bps: safeNumber(quickStage?.metrics?.slippage_bps, 4),
    exit_slippage_bps: safeNumber(quickStage?.metrics?.slippage_bps, 4),
    funding_bps_per_day: safeNumber(quickStage?.metrics?.funding_bps_per_day, 0),
    fill_policy: { entry: 'touch_based', exit: 'bar_cross_based' },
  };
  const scenarios = buildExecutionSensitivityScenarios({
    mode: 'backtest',
    allow_optimistic_fill_policy: false,
  }).filter((row) => !row.test_only);

  const scenarioMetrics = scenarios.map((scenario) => {
    const scenarioAssumption = applyScenarioToAssumption(baseAssumption, scenario);
    const cost = estimateCostDragPct({
      assumption: scenarioAssumption,
      turnover,
      holdingDays: horizonDays,
      includeFunding: true,
    });
    const returnAfterScenario =
      baseReturn -
      Math.max(
        0,
        cost -
          estimateCostDragPct({
            assumption: baseAssumption,
            turnover,
            holdingDays: horizonDays,
            includeFunding: true,
          }),
      );
    return {
      scenario_id: scenario.scenario_id,
      label: scenario.label,
      return: round(returnAfterScenario, 6),
    };
  });
  const scenarioById = Object.fromEntries(
    scenarioMetrics.map((item) => [item.scenario_id, item.return]),
  );
  const stress25 = safeNumber(scenarioById.slippage_plus_25, baseReturn - turnover * 0.012);
  const stress50 = safeNumber(scenarioById.slippage_plus_50, baseReturn - turnover * 0.021);
  const slippageShock = safeNumber(scenarioById.wider_spread, baseReturn - turnover * 0.03);
  const adverseFunding = safeNumber(scenarioById.adverse_funding, baseReturn - turnover * 0.032);
  const strictFill = safeNumber(scenarioById.strict_fill, baseReturn - turnover * 0.028);
  const costResilience = clamp((stress50 + 0.08) / 0.2, 0, 1);

  const minParamStability = safeNumber(cfg.min_parameter_stability_score, 0.5);
  const minRegimeStability = safeNumber(cfg.min_regime_stability_score, 0.5);
  const minStress50 = safeNumber(cfg.min_plus50_cost_return, -0.035);

  const reasons = [];
  if (parameterStabilityScore < minParamStability) reasons.push('parameter_fragility');
  if (regimeStability < minRegimeStability) reasons.push('regime_instability');
  if (stress50 < minStress50) reasons.push('cost_sensitivity_too_high');

  return {
    stage: 'stage_3_robustness_tests',
    pass: reasons.length === 0,
    rejection_reasons: reasons,
    metrics: {
      parameter_stability_score: round(parameterStabilityScore, 4),
      regime_stability_score: round(regimeStability, 4),
      cost_sensitivity_score: round(costResilience, 4),
      perturbation_return_std: round(neighborhoodStd, 6),
      regime_segmentation: regimeRows,
      cost_stress: {
        base: round(baseReturn, 6),
        plus_25pct_cost: round(stress25, 6),
        plus_50pct_cost: round(stress50, 6),
        slippage_shock: round(slippageShock, 6),
        wider_spread: round(slippageShock, 6),
        adverse_funding: round(adverseFunding, 6),
        strict_fill: round(strictFill, 6),
        scenario_metrics: scenarioMetrics,
      },
      execution_realism_profile: assumptionProfile,
    },
  };
}

function walkForwardStage(candidate, quickStage, robustness, cfg = {}) {
  const baseReturn = safeNumber(quickStage?.metrics?.return, 0);
  const seed = deterministicHash(`${candidate.candidate_id}|walkforward`);
  const windows = [];

  for (let i = 0; i < 5; i += 1) {
    const noise = (((seed + i * 19) % 1000) / 999) * 2 - 1;
    const windowReturn = clamp(baseReturn + noise * 0.03 - i * 0.0025, -0.28, 0.3);
    windows.push({
      window_id: `wf-${i + 1}`,
      test_return: round(windowReturn, 6),
      drawdown: round(
        clamp(safeNumber(quickStage?.metrics?.drawdown, 0.2) + Math.abs(noise) * 0.06, 0.03, 0.65),
        6,
      ),
    });
  }

  const returns = windows.map((w) => w.test_return);
  const positiveRatio = returns.length ? returns.filter((v) => v > 0).length / returns.length : 0;
  const avgReturn = mean(returns);
  const early = mean(returns.slice(0, 2));
  const late = mean(returns.slice(-2));
  const degradation = late - early;
  const stabilityPenalty = 1 - safeNumber(robustness?.metrics?.parameter_stability_score, 0.5);

  const adjustedAvg = avgReturn - stabilityPenalty * 0.008;
  const minPositive = safeNumber(cfg.min_positive_window_ratio, 0.5);
  const minAvg = safeNumber(cfg.min_avg_test_return, -0.006);

  const reasons = [];
  if (positiveRatio < minPositive) reasons.push('walkforward_positive_ratio_too_low');
  if (adjustedAvg < minAvg) reasons.push('walkforward_avg_return_too_low');
  if (degradation < -0.025) reasons.push('walkforward_degradation_detected');

  return {
    stage: 'stage_4_walkforward',
    pass: reasons.length === 0,
    rejection_reasons: reasons,
    metrics: {
      window_count: windows.length,
      positive_window_ratio: round(positiveRatio, 4),
      avg_test_return: round(adjustedAvg, 6),
      degradation: round(degradation, 6),
      windows,
    },
  };
}

function collectLiveFamilies(research = {}, fallback = []) {
  const governanceRows = research?.research_core?.strategy_governance?.strategies || [];
  const governanceFamilies = governanceRows
    .filter((row) => ['PROD', 'CANARY'].includes(String(row.current_stage || '').toUpperCase()))
    .map((row) => row.family)
    .filter(Boolean);

  if (governanceFamilies.length) return [...new Set(governanceFamilies)];
  return [...new Set((fallback || []).map((row) => row.family).filter(Boolean))];
}

function portfolioContributionStage(candidate, quickStage, robustness, research = {}, cfg = {}) {
  const liveFamilies = collectLiveFamilies(research, []);
  const familyKey = String(candidate.strategy_family || '').toLowerCase();
  const familyNovelty = liveFamilies.some((item) => String(item || '').toLowerCase() === familyKey)
    ? 0.45
    : 0.78;

  const seed = deterministicHash(`${candidate.candidate_id}|portfolio`);
  const noise = ((seed % 1000) / 999) * 2 - 1;
  const regimeScore = safeNumber(robustness?.metrics?.regime_stability_score, 0.5);
  const baseReturn = safeNumber(quickStage?.metrics?.return, 0);

  const diversificationScore = clamp(
    familyNovelty * 0.62 + regimeScore * 0.3 + (noise + 1) * 0.04,
    0,
    1,
  );
  const drawdownRelief = clamp(
    (safeNumber(quickStage?.metrics?.drawdown, 0.2) - 0.18) * -1 + 0.05,
    -0.08,
    0.12,
  );
  const independentAlpha = clamp(
    baseReturn * diversificationScore * 1.2 + noise * 0.01,
    -0.12,
    0.22,
  );
  const improvePortfolio =
    independentAlpha > -0.005 && (drawdownRelief > -0.03 || diversificationScore > 0.55);

  const minDiversification = safeNumber(cfg.min_diversification_score, 0.48);
  const reasons = [];
  if (diversificationScore < minDiversification) reasons.push('insufficient_diversification_value');
  if (!improvePortfolio) reasons.push('limited_portfolio_incremental_value');

  return {
    stage: 'stage_5_portfolio_contribution',
    pass: reasons.length === 0,
    rejection_reasons: reasons,
    metrics: {
      diversification_score: round(diversificationScore, 4),
      independent_alpha_score: round(independentAlpha, 6),
      drawdown_relief_score: round(drawdownRelief, 6),
      improves_portfolio: improvePortfolio,
      family_novelty: round(familyNovelty, 4),
    },
  };
}

function flattenReasons(stages = []) {
  return stages.flatMap((stage) => stage.rejection_reasons || []);
}

function collectMetrics(quickStage, robustness, walkForward, contribution) {
  return {
    return: safeNumber(quickStage?.metrics?.return, 0),
    drawdown: safeNumber(quickStage?.metrics?.drawdown, 0),
    sharpe_proxy: safeNumber(quickStage?.metrics?.sharpe_proxy, 0),
    turnover: safeNumber(quickStage?.metrics?.turnover, 0),
    average_holding_time: safeNumber(quickStage?.metrics?.average_holding_time, 0),
    parameter_stability_score: safeNumber(robustness?.metrics?.parameter_stability_score, 0),
    regime_stability_score: safeNumber(robustness?.metrics?.regime_stability_score, 0),
    cost_sensitivity_score: safeNumber(robustness?.metrics?.cost_sensitivity_score, 0),
    walkforward_positive_ratio: safeNumber(walkForward?.metrics?.positive_window_ratio, 0),
    walkforward_avg_return: safeNumber(walkForward?.metrics?.avg_test_return, 0),
    diversification_score: safeNumber(contribution?.metrics?.diversification_score, 0),
    independent_alpha_score: safeNumber(contribution?.metrics?.independent_alpha_score, 0),
  };
}

function evaluateCandidate(candidate, context = {}, config = {}) {
  const stage1 = sanityStage(candidate, config.stage_1);
  if (!stage1.pass) {
    return {
      candidate_id: candidate.candidate_id,
      strategy_id: candidate.strategy_id,
      validation_stage_results: [stage1],
      final_status: 'rejected',
      rejected_at_stage: stage1.stage,
      rejection_reasons: stage1.rejection_reasons,
      metrics: collectMetrics(null, null, null, null),
    };
  }

  const stage2 = quickBacktestStage(candidate, config.stage_2, context);
  if (!stage2.pass) {
    return {
      candidate_id: candidate.candidate_id,
      strategy_id: candidate.strategy_id,
      validation_stage_results: [stage1, stage2],
      final_status: 'rejected',
      rejected_at_stage: stage2.stage,
      rejection_reasons: flattenReasons([stage1, stage2]),
      metrics: collectMetrics(stage2, null, null, null),
    };
  }

  const stage3 = robustnessStage(candidate, stage2, config.stage_3);
  if (!stage3.pass) {
    return {
      candidate_id: candidate.candidate_id,
      strategy_id: candidate.strategy_id,
      validation_stage_results: [stage1, stage2, stage3],
      final_status: 'rejected',
      rejected_at_stage: stage3.stage,
      rejection_reasons: flattenReasons([stage1, stage2, stage3]),
      metrics: collectMetrics(stage2, stage3, null, null),
    };
  }

  const stage4 = walkForwardStage(candidate, stage2, stage3, config.stage_4);
  if (!stage4.pass) {
    return {
      candidate_id: candidate.candidate_id,
      strategy_id: candidate.strategy_id,
      validation_stage_results: [stage1, stage2, stage3, stage4],
      final_status: 'rejected',
      rejected_at_stage: stage4.stage,
      rejection_reasons: flattenReasons([stage1, stage2, stage3, stage4]),
      metrics: collectMetrics(stage2, stage3, stage4, null),
    };
  }

  const stage5 = portfolioContributionStage(
    candidate,
    stage2,
    stage3,
    context.research,
    config.stage_5,
  );
  const stages = [stage1, stage2, stage3, stage4, stage5];

  return {
    candidate_id: candidate.candidate_id,
    strategy_id: candidate.strategy_id,
    validation_stage_results: stages,
    final_status: stage5.pass ? 'pass_to_scoring' : 'rejected',
    rejected_at_stage: stage5.pass ? null : stage5.stage,
    rejection_reasons: flattenReasons(stages),
    metrics: collectMetrics(stage2, stage3, stage4, stage5),
  };
}

export function buildCandidateValidationPipeline({
  asOf = new Date().toISOString(),
  candidates = [],
  context = {},
  config = {},
} = {}) {
  const rows = (candidates || []).map((candidate) => evaluateCandidate(candidate, context, config));
  const survivors = rows.filter((item) => item.final_status === 'pass_to_scoring');
  const profile = resolveExecutionRealismProfile({
    mode: 'backtest',
    profile: config?.stage_2?.execution_realism_profile || {},
    overrides: config?.stage_2?.execution_realism_overrides || {},
  });

  return {
    generated_at: asOf,
    validator_version: 'discovery-candidate-validation.v3',
    stages: [
      'stage_1_fast_sanity',
      'stage_2_quick_backtest',
      'stage_3_robustness_tests',
      'stage_4_walkforward',
      'stage_5_portfolio_contribution',
    ],
    candidates: rows,
    summary: {
      total_candidates: rows.length,
      survivors: survivors.length,
      rejected: rows.length - survivors.length,
      survival_rate: rows.length ? round(survivors.length / rows.length, 4) : 0,
      execution_assumption_profile: {
        profile_id: profile.profile_id,
        mode: profile.mode,
      },
      top_rejection_reasons: (() => {
        const counts = new Map();
        for (const row of rows) {
          for (const reason of row.rejection_reasons || []) {
            counts.set(reason, (counts.get(reason) || 0) + 1);
          }
        }
        return Array.from(counts.entries())
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      })(),
    },
  };
}

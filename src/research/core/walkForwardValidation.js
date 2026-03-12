import { maxDrawdownFromCurve, mean, round, stdDev } from '../../engines/math.js';
import { buildHistoricalReplayValidation } from '../validation/historicalReplayValidation.js';
import {
  applyScenarioToAssumption,
  buildExecutionSensitivityScenarios,
  estimateCostDragPct,
  normalizedTurnover,
  resolveExecutionAssumptions,
  resolveExecutionRealismProfile
} from '../validation/executionRealismModel.js';

const DEFAULT_CONFIG = Object.freeze({
  train_days: 40,
  validation_days: 20,
  test_days: 10,
  step_days: 10,
  embargo_days: 2,
  rolling_reoptimization: true,
  use_historical_replay: true,
  min_replay_daily_points: 30,
  execution_realism_mode: 'backtest'
});

function safe(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDailySeries(backtest = {}) {
  return (backtest.daily || []).map((row) => ({
    date: row.date,
    regime: row.regime || 'unknown',
    ret: Number(row.post_cost_return || 0),
    pre_cost_ret: Number(row.pre_cost_return ?? row.post_cost_return ?? 0),
    turnover: Number(row.turnover || 0)
  }));
}

function replayToDailySeries(rows = []) {
  return (rows || []).map((row) => ({
    date: row.date,
    regime: row.regime || 'unknown',
    ret: Number(row.post_cost_return || 0),
    pre_cost_ret: Number(row.pre_cost_return ?? row.post_cost_return ?? 0),
    turnover: Number(row.turnover || 0)
  }));
}

function makeWindows(length, cfg) {
  const windows = [];
  let start = 0;

  while (start + cfg.train_days + cfg.embargo_days + cfg.validation_days + cfg.embargo_days + cfg.test_days <= length) {
    const trainStart = start;
    const trainEnd = trainStart + cfg.train_days;
    const validStart = trainEnd + cfg.embargo_days;
    const validEnd = validStart + cfg.validation_days;
    const testStart = validEnd + cfg.embargo_days;
    const testEnd = testStart + cfg.test_days;

    windows.push({
      train: [trainStart, trainEnd],
      validation: [validStart, validEnd],
      test: [testStart, testEnd]
    });

    start += cfg.step_days;
  }

  return windows;
}

function metrics(rows = []) {
  const returns = rows.map((item) => Number(item.ret || 0));
  if (!returns.length) {
    return {
      sample_size: 0,
      cumulative_return: 0,
      mean_return: 0,
      sharpe: 0,
      max_drawdown: 0,
      win_rate: 0
    };
  }

  let equity = 1;
  const curve = returns.map((ret) => {
    equity *= 1 + ret;
    return equity;
  });

  const sigma = stdDev(returns) || 1e-9;
  return {
    sample_size: returns.length,
    cumulative_return: round(curve[curve.length - 1] - 1, 6),
    mean_return: round(mean(returns), 6),
    sharpe: round((mean(returns) / sigma) * Math.sqrt(252), 4),
    max_drawdown: round(maxDrawdownFromCurve(curve), 6),
    win_rate: round(returns.filter((item) => item > 0).length / returns.length, 4)
  };
}

function stressReturns(rows = [], assumption = {}, scenario = {}) {
  const scenarioAssumption = applyScenarioToAssumption(assumption, scenario);
  return rows.map((row) => ({
    ...row,
    ret:
      Number(row.pre_cost_ret || row.ret) -
      estimateCostDragPct({
        assumption: scenarioAssumption,
        turnover: normalizedTurnover(row.turnover),
        holdingDays: 1,
        includeFunding: true
      })
  }));
}

function regimeSlice(rows = []) {
  const bucket = new Map();

  for (const row of rows) {
    const key = String(row.regime || 'unknown');
    const current = bucket.get(key) || [];
    current.push(row);
    bucket.set(key, current);
  }

  const total = rows.length || 1;
  return Array.from(bucket.entries()).map(([regime, items]) => {
    const m = metrics(items);
    return {
      regime,
      ...m,
      trade_density_ratio: round(items.length / total, 4),
      drawdown_in_regime: m.max_drawdown
    };
  });
}

function degradation(rows = []) {
  if (rows.length < 30) {
    return {
      early_mean_return: 0,
      late_mean_return: 0,
      degradation: 0,
      trend: 'insufficient_data'
    };
  }

  const third = Math.floor(rows.length / 3);
  const early = rows.slice(0, third).map((item) => item.ret);
  const late = rows.slice(-third).map((item) => item.ret);
  const earlyMean = mean(early);
  const lateMean = mean(late);
  const delta = lateMean - earlyMean;

  return {
    early_mean_return: round(earlyMean, 6),
    late_mean_return: round(lateMean, 6),
    degradation: round(delta, 6),
    trend: delta < -0.0008 ? 'degrading' : delta > 0.0008 ? 'improving' : 'stable'
  };
}

function parameterNeighborhood(strategyId, allStrategies = []) {
  const current = allStrategies.find((item) => item.strategy_id === strategyId);
  const peers = allStrategies.filter((item) => item.strategy_id !== strategyId);

  if (!current || !peers.length) {
    return {
      neighborhood_size: peers.length,
      relative_return_rank: 1,
      robust: false,
      note: 'No neighborhood baseline available.'
    };
  }

  const values = [current, ...peers]
    .map((item) => Number(item?.backtest?.cumulative_return_post_cost || 0))
    .sort((a, b) => b - a);

  const currentValue = Number(current?.backtest?.cumulative_return_post_cost || 0);
  const rank = values.findIndex((item) => item === currentValue) + 1;
  const spread = Math.abs(values[0] - values[values.length - 1]);

  return {
    neighborhood_size: peers.length,
    relative_return_rank: rank,
    robust: rank <= Math.ceil(values.length * 0.6) && spread <= 0.08,
    performance_spread: round(spread, 6),
    note: 'Neighborhood robustness is estimated from challenger variants under the same window.'
  };
}

function parameterSensitivitySurface(series = []) {
  if (!series.length) {
    return {
      base: { score_threshold_shift: 0, sizing_shift: 0, cumulative_return: 0, max_drawdown: 0 },
      grid: [],
      fragile: true
    };
  }

  const shifts = [-0.08, -0.04, 0, 0.04, 0.08];
  const grid = [];
  for (const scoreShift of shifts) {
    for (const sizingShift of shifts) {
      const adjusted = series.map((row) => ({
        ...row,
        ret: row.ret * (1 + sizingShift) + scoreShift * 0.0008
      }));
      const m = metrics(adjusted);
      grid.push({
        score_threshold_shift: round(scoreShift, 4),
        sizing_shift: round(sizingShift, 4),
        cumulative_return: m.cumulative_return,
        max_drawdown: m.max_drawdown
      });
    }
  }

  const base = grid.find((item) => item.score_threshold_shift === 0 && item.sizing_shift === 0) || grid[0];
  const robustNeighbors = grid.filter(
    (item) =>
      Math.abs(item.score_threshold_shift) <= 0.04 &&
      Math.abs(item.sizing_shift) <= 0.04 &&
      item.cumulative_return >= (base?.cumulative_return ?? 0) - 0.03 &&
      item.max_drawdown <= (base?.max_drawdown ?? 0) + 0.03
  ).length;

  return {
    base,
    grid,
    fragile: robustNeighbors < 5
  };
}

function windowResult(series, win, idx) {
  const train = series.slice(win.train[0], win.train[1]);
  const validation = series.slice(win.validation[0], win.validation[1]);
  const test = series.slice(win.test[0], win.test[1]);

  return {
    window_id: `wf-${idx + 1}`,
    ranges: {
      train: [train[0]?.date || null, train[train.length - 1]?.date || null],
      validation: [validation[0]?.date || null, validation[validation.length - 1]?.date || null],
      test: [test[0]?.date || null, test[test.length - 1]?.date || null]
    },
    train_metrics: metrics(train),
    validation_metrics: metrics(validation),
    test_metrics: metrics(test)
  };
}

function resolveReplaySeries(strategy, replayValidation = {}, cfg = DEFAULT_CONFIG) {
  if (!cfg.use_historical_replay) {
    return {
      series: [],
      source: 'legacy_backtest',
      replay_backed: false,
      reason: 'replay_disabled',
      assumption_profile: replayValidation?.assumptions?.assumption_profile || null
    };
  }

  const byStrategy = replayValidation?.strategy_replay_benchmarks || [];
  const direct = byStrategy.find((row) => row.strategy_id === strategy.strategy_id);
  if (direct) {
    return {
      series: replayToDailySeries(replayValidation?.daily_aggregate || []),
      source: 'historical_replay_direct',
      replay_backed: true,
      reason: 'strategy_signal_replay_available',
      assumption_profile: replayValidation?.assumptions?.assumption_profile || null
    };
  }

  if (strategy.strategy_id === 'champion') {
    const aggregate = replayToDailySeries(replayValidation?.daily_aggregate || []);
    if (aggregate.length >= Number(cfg.min_replay_daily_points || 30)) {
      return {
        series: aggregate,
        source: 'historical_replay_champion_aggregate',
        replay_backed: true,
        reason: 'champion_uses_signal_replay_aggregate',
        assumption_profile: replayValidation?.assumptions?.assumption_profile || null
      };
    }
  }

  return {
    series: [],
    source: 'legacy_backtest',
    replay_backed: false,
    reason: 'no_strategy_specific_replay_series',
    assumption_profile: replayValidation?.assumptions?.assumption_profile || null
  };
}

function inferStrategyMarketHint(strategy = {}) {
  const text = `${strategy?.strategy_id || ''}|${strategy?.strategy_label || ''}`.toLowerCase();
  return text.includes('crypto') ? 'CRYPTO' : 'US';
}

function toScenarioMap(rows = []) {
  return Object.fromEntries((rows || []).map((row) => [row.scenario_id, row]));
}

function strictFillMonotonicityCheck(base = {}, strict = {}) {
  const baseRet = safe(base?.cumulative_return, 0);
  const strictRet = safe(strict?.cumulative_return, 0);
  const delta = strictRet - baseRet;
  return {
    passes: delta <= 0.0005,
    delta: round(delta, 6)
  };
}

function evaluateStrategy({ strategy, allStrategies, cfg, replayValidation }) {
  const resolvedReplay = resolveReplaySeries(strategy, replayValidation, cfg);
  const replaySeries = resolvedReplay.series;
  const series = replaySeries.length ? replaySeries : toDailySeries(strategy.backtest);
  const marketHint = inferStrategyMarketHint(strategy);
  const baselineAssumption = resolveExecutionAssumptions({
    profile: cfg.execution_realism_profile,
    signal: { market: marketHint },
    mode: cfg.execution_realism_profile?.mode || cfg.execution_realism_mode || 'backtest'
  });
  const scenarioDefs = buildExecutionSensitivityScenarios(cfg.execution_realism_profile)
    .filter((row) => !row.test_only);
  const scenarioMetrics = scenarioDefs.map((scenario) => ({
    scenario_id: scenario.scenario_id,
    label: scenario.label,
    metrics: metrics(stressReturns(series, baselineAssumption, scenario))
  }));
  const scenarioById = toScenarioMap(scenarioMetrics);
  const modelBaseMetrics = scenarioById.baseline?.metrics || metrics(stressReturns(series, baselineAssumption, { scenario_id: 'baseline' }));

  const windows = makeWindows(series.length, cfg);
  const wfRows = windows.map((win, idx) => windowResult(series, win, idx));

  const testReturns = wfRows.map((item) => item.test_metrics.cumulative_return);
  const oosMean = mean(testReturns);
  const oosPositiveRatio = testReturns.length
    ? testReturns.filter((item) => item > 0).length / testReturns.length
    : 0;

  const rawSeriesMetrics = metrics(series);
  const baseMetrics = modelBaseMetrics;
  const cost25 = scenarioById.slippage_plus_25?.metrics || modelBaseMetrics;
  const cost50 = scenarioById.slippage_plus_50?.metrics || modelBaseMetrics;
  const spreadWide = scenarioById.wider_spread?.metrics || modelBaseMetrics;
  const fundingAdverse = scenarioById.adverse_funding?.metrics || modelBaseMetrics;
  const strictFill = scenarioById.strict_fill?.metrics || modelBaseMetrics;
  const strictMonotonicity = strictFillMonotonicityCheck(modelBaseMetrics, strictFill);

  const regimeBreakdown = regimeSlice(series);
  const worstRegime = [...regimeBreakdown].sort((a, b) => a.cumulative_return - b.cumulative_return)[0] || null;
  const bestRegime = [...regimeBreakdown].sort((a, b) => b.cumulative_return - a.cumulative_return)[0] || null;

  const degr = degradation(series);
  const neighborhood = parameterNeighborhood(strategy.strategy_id, allStrategies);
  const sensitivitySurface = parameterSensitivitySurface(series);

  const survivesOOS = oosPositiveRatio >= 0.45 && oosMean > -0.0012;
  const survivesCosts = cost50.cumulative_return >= modelBaseMetrics.cumulative_return - 0.05;
  const survivesHarshExecution = Math.min(
    cost50.cumulative_return,
    spreadWide.cumulative_return,
    fundingAdverse.cumulative_return,
    strictFill.cumulative_return
  ) >= modelBaseMetrics.cumulative_return - 0.08;
  const regimeDependent =
    bestRegime && worstRegime
      ? Math.abs(bestRegime.cumulative_return - worstRegime.cumulative_return) > 0.08
      : false;
  const stable = degr.trend !== 'degrading' && neighborhood.robust;
  const promotable = survivesOOS && survivesCosts && stable && !sensitivitySurface.fragile;

  return {
    strategy_id: strategy.strategy_id,
    strategy_label: strategy.strategy_label,
    replay_context: {
      source: resolvedReplay.source,
      replay_backed: resolvedReplay.replay_backed,
      replay_reason: resolvedReplay.reason,
      assumption_profile: resolvedReplay.assumption_profile,
      replay_daily_points: replaySeries.length,
      validation_daily_points: series.length
    },
    windows: wfRows,
    out_of_sample_summary: {
      window_count: wfRows.length,
      avg_test_cumulative_return: round(oosMean, 6),
      positive_window_ratio: round(oosPositiveRatio, 4),
      survives_out_of_sample: survivesOOS,
      data_source: resolvedReplay.source
    },
    regime_sliced_evaluation: regimeBreakdown,
    parameter_stability: neighborhood,
    parameter_sensitivity_surface: sensitivitySurface,
    cost_sensitivity: {
      raw_series_base: rawSeriesMetrics,
      base: baseMetrics,
      plus_25pct_cost: cost25,
      plus_50pct_cost: cost50,
      wider_spread: spreadWide,
      adverse_funding: fundingAdverse,
      strict_fill: strictFill,
      strict_fill_monotonicity: strictMonotonicity
    },
    slippage_sensitivity: {
      mild_slippage_shock: cost25,
      severe_slippage_shock: cost50
    },
    execution_realism: {
      assumption_profile: baselineAssumption,
      scenario_metrics: scenarioMetrics,
      harsh_scenarios: {
        wider_spread: spreadWide,
        adverse_funding: fundingAdverse,
        strict_fill: strictFill
      },
      strict_fill_monotonicity: strictMonotonicity,
      survives_harsh_assumptions: survivesHarshExecution
    },
    degradation_tracking: degr,
    verdict: {
      survives_out_of_sample: survivesOOS,
      survives_after_costs: survivesCosts,
      survives_after_harsh_execution: survivesHarshExecution,
      strict_fill_monotonicity: strictMonotonicity.passes,
      regime_dependent: regimeDependent,
      stability: stable ? 'stable' : 'fragile',
      parameter_neighborhood_robust: neighborhood.robust,
      parameter_surface_fragile: sensitivitySurface.fragile,
      promotion_readiness: promotable ? 'pass' : 'hold'
    }
  };
}

function collectStrategies(research = {}) {
  const champion = research?.champion
    ? {
        strategy_id: research.champion?.config?.id || 'champion',
        strategy_label: research.champion?.config?.label || 'Champion',
        backtest: research.champion?.backtest || {}
      }
    : null;

  const challengers = (research?.challengers || []).map((item) => ({
    strategy_id: item?.config?.id || 'challenger',
    strategy_label: item?.config?.label || item?.config?.id || 'Challenger',
    backtest: item?.backtest || {}
  }));

  return [champion, ...challengers].filter(Boolean);
}

export function buildWalkForwardValidation({
  asOf = new Date().toISOString(),
  research = {},
  championState = {},
  regimeState = {},
  riskBucketSystem = {},
  funnelDiagnostics = {},
  config = {}
} = {}) {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config,
    execution_realism_profile: resolveExecutionRealismProfile({
      mode: config.execution_realism_mode || DEFAULT_CONFIG.execution_realism_mode,
      profile: config.execution_realism_profile || {},
      overrides: config.execution_realism_overrides || {}
    })
  };

  const replayValidation = buildHistoricalReplayValidation({
    asOf,
    championState,
    regimeState,
    riskBucketSystem,
    funnelDiagnostics,
    config: config.replay || {}
  });

  const strategies = collectStrategies(research);
  const evaluations = strategies.map((strategy) =>
    evaluateStrategy({
      strategy,
      allStrategies: strategies,
      cfg,
      replayValidation
    })
  );

  return {
    generated_at: asOf,
    validator_version: 'walk-forward.v2',
    config: cfg,
    replay_validation: replayValidation,
    strategies: evaluations,
    summary: {
      evaluated_strategies: evaluations.length,
      replay_backed_strategies: evaluations.filter((item) => item.replay_context?.replay_backed).length,
      replay_signal_count: replayValidation?.summary?.total_signals || 0,
      replay_triggered_count: replayValidation?.summary?.triggered_trades || 0,
      oos_survivors: evaluations.filter((item) => item.verdict.survives_out_of_sample).length,
      cost_survivors: evaluations.filter((item) => item.verdict.survives_after_costs).length,
      harsh_execution_survivors: evaluations.filter((item) => item.verdict.survives_after_harsh_execution).length,
      strict_fill_monotonicity_failures: evaluations
        .filter((item) => !item.verdict.strict_fill_monotonicity)
        .map((item) => item.strategy_id),
      fragile_strategies: evaluations.filter((item) => item.verdict.stability === 'fragile').map((item) => item.strategy_id),
      promotion_ready: evaluations.filter((item) => item.verdict.promotion_readiness === 'pass').map((item) => item.strategy_id),
      rolling_reoptimization: Boolean(cfg.rolling_reoptimization),
      execution_assumption_profile: {
        profile_id: cfg.execution_realism_profile.profile_id,
        mode: cfg.execution_realism_profile.mode
      }
    }
  };
}

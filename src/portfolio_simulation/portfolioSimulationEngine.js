import { clamp, deterministicHash, maxDrawdownFromCurve, mean, round, stdDev } from '../engines/math.js';
import {
  applyScenarioToAssumption,
  buildExecutionSensitivityScenarios,
  estimateCostDragPct,
  resolveExecutionAssumptions,
  resolveExecutionRealismProfile
} from '../research/validation/executionRealismModel.js';

function safe(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const INSTITUTIONAL_PORTFOLIO_LIMITS = Object.freeze({
  max_strategy_weight: 0.11,
  max_market_exposure: {
    US: 0.82,
    CRYPTO: 0.34
  },
  max_top3_weight: 0.34,
  max_portfolio_drawdown: 0.12,
  max_family_drawdown_share: 0.48,
  min_diversification_score: 0.58,
  min_worst_case_sharpe: 0,
  max_cash_buffer: 0.18
});

function normalizeWeights(rows = [], totalCap = 1) {
  const raw = rows.map((row) => ({
    ...row,
    raw_weight: Math.max(0.001, safe(row.quality_score, 0.4) * safe(row.allocation_multiplier, 1))
  }));
  const total = raw.reduce((acc, row) => acc + row.raw_weight, 0) || 1;
  return raw.map((row) => ({
    ...row,
    weight: round((row.raw_weight / total) * totalCap, 6)
  }));
}

function deriveFamilyCap(riskBucketSystem = {}) {
  const correlatedCapPct = safe(riskBucketSystem?.user_risk_bucket?.correlated_exposure_cap_pct, 22);
  return round(clamp((correlatedCapPct + 6) / 100, 0.2, 0.45), 6);
}

function familyExposure(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const family = row.strategy_family || 'unknown';
    map.set(family, (map.get(family) || 0) + safe(row.weight, 0));
  }
  return map;
}

function genericExposure(rows = [], field = 'market_hint') {
  const map = new Map();
  for (const row of rows) {
    const key = row[field] || 'unknown';
    map.set(key, (map.get(key) || 0) + safe(row.weight, 0));
  }
  return map;
}

function toExposureRows(map = new Map(), field = 'strategy_family') {
  return Array.from(map.entries())
    .map(([key, exposure]) => ({ [field]: key, exposure: round(exposure, 6) }))
    .sort((a, b) => b.exposure - a.exposure);
}

function applyFamilyCrowdingGuard(rows = [], familyCap = 0.32) {
  if (!rows.length) {
    return {
      strategy_rows: [],
      summary: {
        family_cap: familyCap,
        total_allocated_before: 0,
        total_allocated_after: 0,
        unallocated_cash_buffer: 0,
        trimmed_families: [],
        redistributed_weight: 0
      },
      family_exposure_before: [],
      family_exposure_after: []
    };
  }

  const working = rows.map((row) => ({
    ...row,
    base_weight: safe(row.weight, 0),
    weight: safe(row.weight, 0)
  }));
  const exposureBeforeMap = familyExposure(working);
  const totalBefore = working.reduce((acc, row) => acc + row.weight, 0);
  let trimmedWeight = 0;
  let initialTrimmedWeight = 0;
  const trimmedFamilies = [];

  for (const [family, exposure] of exposureBeforeMap.entries()) {
    if (exposure <= familyCap) continue;
    const scale = familyCap / exposure;
    trimmedFamilies.push({
      strategy_family: family,
      before: round(exposure, 6),
      after: round(familyCap, 6),
      trimmed: round(exposure - familyCap, 6)
    });
    for (const row of working) {
      if ((row.strategy_family || 'unknown') !== family) continue;
      const next = row.weight * scale;
      trimmedWeight += row.weight - next;
      initialTrimmedWeight += row.weight - next;
      row.weight = next;
    }
  }

  if (trimmedWeight > 0) {
    const exposureAfterTrimMap = familyExposure(working);
    const capacities = Array.from(exposureAfterTrimMap.entries())
      .map(([family, exposure]) => ({
        family,
        capacity: Math.max(0, familyCap - exposure),
        exposure
      }))
      .filter((row) => row.capacity > 1e-9);

    const totalCapacity = capacities.reduce((acc, row) => acc + row.capacity, 0);
    const redistribute = Math.min(trimmedWeight, totalCapacity);

    if (redistribute > 0 && totalCapacity > 0) {
      for (const capRow of capacities) {
        const familyRows = working.filter((row) => (row.strategy_family || 'unknown') === capRow.family);
        if (!familyRows.length) continue;
        const familyCurrent = familyRows.reduce((acc, row) => acc + row.weight, 0);
        const familyTopup = redistribute * (capRow.capacity / totalCapacity);
        const denom = familyCurrent > 0 ? familyCurrent : familyRows.length;

        for (const row of familyRows) {
          const factor = familyCurrent > 0 ? row.weight / denom : 1 / denom;
          row.weight += familyTopup * factor;
        }
      }
      trimmedWeight -= redistribute;
    }
  }

  const exposureAfterMap = familyExposure(working);
  const totalAfter = working.reduce((acc, row) => acc + row.weight, 0);

  return {
    strategy_rows: working.map((row) => ({
      ...row,
      weight: round(row.weight, 6),
      crowding_adjustment: round(row.weight - row.base_weight, 6)
    })),
    summary: {
      family_cap: round(familyCap, 6),
      total_allocated_before: round(totalBefore, 6),
      total_allocated_after: round(totalAfter, 6),
      unallocated_cash_buffer: round(Math.max(0, totalBefore - totalAfter), 6),
      trimmed_families: trimmedFamilies,
      redistributed_weight: round(Math.max(0, initialTrimmedWeight - Math.max(0, trimmedWeight)), 6)
    },
    family_exposure_before: toExposureRows(exposureBeforeMap),
    family_exposure_after: toExposureRows(exposureAfterMap)
  };
}

function applyInstitutionalRiskGuard(rows = [], limits = INSTITUTIONAL_PORTFOLIO_LIMITS) {
  if (!rows.length) {
    return {
      strategy_rows: [],
      summary: {
        max_strategy_weight: safe(limits.max_strategy_weight, 0),
        total_allocated_before: 0,
        total_allocated_after: 0,
        unallocated_cash_buffer: 0,
        trimmed_strategy_count: 0,
        market_caps_applied: limits.max_market_exposure || {}
      },
      market_exposure_before: [],
      market_exposure_after: [],
      trimmed_strategies: []
    };
  }

  const working = rows.map((row) => ({
    ...row,
    base_weight: safe(row.weight, 0),
    weight: safe(row.weight, 0)
  }));
  const totalBefore = working.reduce((acc, row) => acc + row.weight, 0);
  const trimmedStrategies = [];

  for (const row of working) {
    const maxStrategyWeight = safe(limits.max_strategy_weight, 1);
    if (row.weight <= maxStrategyWeight) continue;
    const before = row.weight;
    row.weight = maxStrategyWeight;
    trimmedStrategies.push({
      strategy_id: row.strategy_id,
      reason: 'max_strategy_weight',
      before: round(before, 6),
      after: round(row.weight, 6),
      trimmed: round(before - row.weight, 6)
    });
  }

  const marketExposureBefore = genericExposure(working, 'market_hint');
  for (const [market, exposure] of marketExposureBefore.entries()) {
    const cap = safe(limits.max_market_exposure?.[market], 1);
    if (exposure <= cap) continue;
    const scale = cap / exposure;
    for (const row of working) {
      if ((row.market_hint || 'unknown') !== market) continue;
      const before = row.weight;
      row.weight *= scale;
      trimmedStrategies.push({
        strategy_id: row.strategy_id,
        reason: `market_cap_${market}`,
        before: round(before, 6),
        after: round(row.weight, 6),
        trimmed: round(before - row.weight, 6)
      });
    }
  }

  const totalAfter = working.reduce((acc, row) => acc + row.weight, 0);
  return {
    strategy_rows: working.map((row) => ({
      ...row,
      weight: round(row.weight, 6),
      institutional_adjustment: round(row.weight - row.base_weight, 6)
    })),
    summary: {
      max_strategy_weight: round(safe(limits.max_strategy_weight, 0), 6),
      total_allocated_before: round(totalBefore, 6),
      total_allocated_after: round(totalAfter, 6),
      unallocated_cash_buffer: round(Math.max(0, totalBefore - totalAfter), 6),
      trimmed_strategy_count: trimmedStrategies.length,
      market_caps_applied: limits.max_market_exposure || {}
    },
    market_exposure_before: toExposureRows(marketExposureBefore, 'market_hint'),
    market_exposure_after: toExposureRows(genericExposure(working, 'market_hint'), 'market_hint'),
    trimmed_strategies: trimmedStrategies
  };
}

function defaultStrategyRows({
  evidenceSystem = {},
  regimeState = {},
  riskBucketSystem = {},
  executionRealismProfile = {}
}) {
  const evidenceRows = evidenceSystem?.strategies || [];
  const posture = regimeState?.state?.recommended_user_posture || 'REDUCE';
  const regimeMultiplier = safe(regimeState?.state?.default_sizing_multiplier, 0.8);
  const exposureCap = safe(riskBucketSystem?.user_risk_bucket?.total_exposure_cap_pct, 52) / 100;

  const filtered = evidenceRows
    .filter((row) => {
      const rec = String(row.production_recommendation?.recommendation || '').toUpperCase();
      return !['REJECT', 'RETIRE'].includes(rec);
    })
    .map((row) => {
      const quality = safe(row.validation_summary?.candidate_quality_score, safe(row.governance_state?.operational_confidence, 0.5));
      const baseReturn = safe(row.validation_summary?.stage_metrics?.stage_2_quick_backtest?.return, 0.012);
      const drawdown = safe(row.validation_summary?.stage_metrics?.stage_2_quick_backtest?.drawdown, 0.15);
      const turnover = safe(row.validation_summary?.stage_metrics?.stage_2_quick_backtest?.turnover, 0.28);
      const costPenalty = safe(row.cost_sensitivity?.validation_cost_stress?.plus_50pct_cost, baseReturn - 0.01);
      const marketHint = row.linked_product_recommendation?.asset?.includes('USDT') ? 'CRYPTO' : 'US';
      const executionAssumption = resolveExecutionAssumptions({
        profile: executionRealismProfile,
        signal: { market: marketHint },
        mode: executionRealismProfile.mode || 'paper'
      });
      const baselineCostDrag = estimateCostDragPct({
        assumption: executionAssumption,
        turnover,
        holdingDays: 3,
        includeFunding: true
      });

      let allocationMultiplier = regimeMultiplier;
      if (posture === 'SKIP') allocationMultiplier *= 0.3;
      else if (posture === 'REDUCE') allocationMultiplier *= 0.75;

      if (String(row.governance_state?.current_stage || '').toUpperCase() === 'PROD') allocationMultiplier *= 1.18;
      if (String(row.governance_state?.current_stage || '').toUpperCase() === 'DEGRADE') allocationMultiplier *= 0.62;

      return {
        strategy_id: row.strategy_id,
        candidate_id: row.candidate_id,
        strategy_family: row.audit_chain?.template || row.template_id || 'unknown',
        market_hint: marketHint,
        expected_return: round((baseReturn * 0.65 + costPenalty * 0.35) - baselineCostDrag, 6),
        expected_volatility: round(clamp(drawdown * 0.55 + 0.07, 0.04, 0.55), 6),
        turnover: round(turnover, 6),
        quality_score: round(clamp(quality, 0, 1), 6),
        allocation_multiplier: round(clamp(allocationMultiplier, 0.15, 1.35), 6),
        compatible_regimes: row.regime_performance?.expected_regimes || [],
        execution_assumption: executionAssumption,
        baseline_cost_drag_pct: baselineCostDrag
      };
    });

  const selected = filtered.slice(0, 24);
  return normalizeWeights(selected, clamp(exposureCap, 0.12, 0.95));
}

function correlationValue(a, b) {
  const sameFamily = a.strategy_family === b.strategy_family;
  const sameMarket = a.market_hint === b.market_hint;
  const seed = deterministicHash(`${a.strategy_id}|${b.strategy_id}`);
  const noise = ((seed % 1000) / 999) * 0.12 - 0.06;

  let corr = 0.22 + noise;
  if (sameFamily) corr += 0.28;
  if (sameMarket) corr += 0.12;
  return round(clamp(corr, -0.2, 0.92), 4);
}

function buildCorrelationMatrix(rows = []) {
  const matrix = [];
  for (let i = 0; i < rows.length; i += 1) {
    const a = rows[i];
    const row = {
      strategy_id: a.strategy_id,
      correlations: {}
    };
    for (let j = 0; j < rows.length; j += 1) {
      const b = rows[j];
      row.correlations[b.strategy_id] = i === j ? 1 : correlationValue(a, b);
    }
    matrix.push(row);
  }
  return matrix;
}

function portfolioVolatility(rows = [], corrMatrix = []) {
  if (!rows.length) return 0;
  const corrByStrategy = new Map(corrMatrix.map((row) => [row.strategy_id, row.correlations]));

  let variance = 0;
  for (const i of rows) {
    const corrRow = corrByStrategy.get(i.strategy_id) || {};
    for (const j of rows) {
      const corr = safe(corrRow[j.strategy_id], i.strategy_id === j.strategy_id ? 1 : 0);
      variance += i.weight * j.weight * i.expected_volatility * j.expected_volatility * corr;
    }
  }

  return round(Math.sqrt(Math.max(variance, 0)), 6);
}

function simulatePortfolioPath(rows = [], periods = 90) {
  if (!rows.length) return { returns: [], equity_curve: [1] };

  const returns = [];
  for (let t = 0; t < periods; t += 1) {
    let rt = 0;
    for (const row of rows) {
      const seed = deterministicHash(`${row.strategy_id}|${t}`);
      const noise = ((seed % 1000) / 999) * 2 - 1;
      const step = row.expected_return / 18 + noise * row.expected_volatility * 0.07;
      rt += row.weight * step;
    }
    returns.push(round(rt, 6));
  }

  const curve = [1];
  for (const r of returns) {
    curve.push(round(curve[curve.length - 1] * (1 + r), 8));
  }

  return {
    returns,
    equity_curve: curve
  };
}

function exposureBy(rows = [], keyFn, fieldName) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, (map.get(key) || 0) + safe(row.weight));
  }

  return Array.from(map.entries())
    .map(([key, exposure]) => ({ [fieldName]: key, exposure: round(exposure, 6) }))
    .sort((a, b) => b.exposure - a.exposure);
}

function regimeExposure(rows = [], regimeState = {}) {
  const current = regimeState?.state?.primary || 'unknown';
  return rows.map((row) => ({
    strategy_id: row.strategy_id,
    current_regime: current,
    compatible: (row.compatible_regimes || []).some((item) => String(item).toLowerCase().includes(String(current).toLowerCase())),
    weight: row.weight
  }));
}

function diversificationContribution(rows = [], corrMatrix = []) {
  if (!rows.length) {
    return {
      diversification_score: 0,
      concentration_hhi: 0,
      avg_pairwise_correlation: 0,
      note: 'No strategy rows available for diversification analysis.'
    };
  }

  const hhi = rows.reduce((acc, row) => acc + row.weight ** 2, 0);
  const corrs = [];
  for (const row of corrMatrix) {
    for (const [other, value] of Object.entries(row.correlations || {})) {
      if (row.strategy_id >= other) continue;
      corrs.push(safe(value));
    }
  }
  const avgCorr = corrs.length ? mean(corrs) : 0;

  return {
    diversification_score: round(clamp((1 - hhi) * 0.62 + (1 - avgCorr) * 0.38, 0, 1), 4),
    concentration_hhi: round(hhi, 6),
    avg_pairwise_correlation: round(avgCorr, 4),
    note: 'Higher diversification score indicates lower concentration and lower pairwise correlation.'
  };
}

function marginalImpact(rows = [], corrMatrix = [], baseMetrics = {}) {
  const impacts = [];

  for (const excluded of rows) {
    const subset = rows.filter((row) => row.strategy_id !== excluded.strategy_id);
    if (!subset.length) continue;

    const subsetCorr = buildCorrelationMatrix(subset);
    const subsetVol = portfolioVolatility(subset, subsetCorr);
    const subsetRet = subset.reduce((acc, row) => acc + row.weight * row.expected_return, 0);

    impacts.push({
      strategy_id: excluded.strategy_id,
      delta_expected_return: round(safe(baseMetrics.portfolio_return) - subsetRet, 6),
      delta_volatility: round(safe(baseMetrics.volatility) - subsetVol, 6),
      weight: excluded.weight
    });
  }

  return impacts.sort((a, b) => Math.abs(b.delta_expected_return) - Math.abs(a.delta_expected_return));
}

function tailRiskSummary(path = {}) {
  const returns = path?.returns || [];
  if (!returns.length) {
    return {
      worst_period_return: 0,
      avg_left_tail_return: 0,
      left_tail_observations: 0
    };
  }
  const sorted = returns.slice().sort((a, b) => a - b);
  const tailCount = Math.max(1, Math.ceil(sorted.length * 0.05));
  const leftTail = sorted.slice(0, tailCount);
  return {
    worst_period_return: round(sorted[0], 6),
    avg_left_tail_return: round(mean(leftTail), 6),
    left_tail_observations: leftTail.length
  };
}

function drawdownConcentration(rows = [], corrMatrix = [], regimeState = {}) {
  if (!rows.length) {
    return {
      strategy_rows: [],
      by_family: [],
      by_market: [],
      top_strategy_share: 0,
      top_family_share: 0,
      top_market_share: 0,
      concentration_status: 'unknown'
    };
  }

  const corrByStrategy = new Map(corrMatrix.map((row) => [row.strategy_id, row.correlations || {}]));
  const currentRegime = String(regimeState?.state?.primary || 'unknown').toLowerCase();
  const strategyRows = rows.map((row) => {
    const corrRow = corrByStrategy.get(row.strategy_id) || {};
    const corrValues = Object.entries(corrRow)
      .filter(([other]) => other !== row.strategy_id)
      .map(([, value]) => safe(value, 0));
    const avgCorr = corrValues.length ? mean(corrValues) : 0;
    const regimeMismatch = (row.compatible_regimes || []).length
      ? !(row.compatible_regimes || []).some((item) => String(item).toLowerCase().includes(currentRegime))
      : false;
    const stressLossProxy =
      row.weight *
      (safe(row.expected_volatility, 0) * 1.8 + Math.max(0, safe(row.turnover, 0) - 0.22) * 0.08) *
      (1 + avgCorr * 0.55) *
      (regimeMismatch ? 1.22 : 1);
    return {
      strategy_id: row.strategy_id,
      strategy_family: row.strategy_family,
      market_hint: row.market_hint,
      stress_loss_proxy: round(stressLossProxy, 6)
    };
  });

  const totalStress = strategyRows.reduce((acc, row) => acc + row.stress_loss_proxy, 0) || 1;
  const familyMap = new Map();
  const marketMap = new Map();
  for (const row of strategyRows) {
    familyMap.set(row.strategy_family, (familyMap.get(row.strategy_family) || 0) + row.stress_loss_proxy);
    marketMap.set(row.market_hint, (marketMap.get(row.market_hint) || 0) + row.stress_loss_proxy);
  }
  const byFamily = [...familyMap.entries()]
    .map(([strategy_family, stress_loss_proxy]) => ({
      strategy_family,
      stress_loss_proxy: round(stress_loss_proxy, 6),
      share: round(stress_loss_proxy / totalStress, 6)
    }))
    .sort((a, b) => b.share - a.share);
  const byMarket = [...marketMap.entries()]
    .map(([market_hint, stress_loss_proxy]) => ({
      market_hint,
      stress_loss_proxy: round(stress_loss_proxy, 6),
      share: round(stress_loss_proxy / totalStress, 6)
    }))
    .sort((a, b) => b.share - a.share);
  const rankedStrategies = strategyRows
    .map((row) => ({
      ...row,
      share: round(row.stress_loss_proxy / totalStress, 6)
    }))
    .sort((a, b) => b.share - a.share);

  const topStrategyShare = safe(rankedStrategies[0]?.share, 0);
  const topFamilyShare = safe(byFamily[0]?.share, 0);
  const topMarketShare = safe(byMarket[0]?.share, 0);

  return {
    strategy_rows: rankedStrategies,
    by_family: byFamily,
    by_market: byMarket,
    top_strategy_share: round(topStrategyShare, 6),
    top_family_share: round(topFamilyShare, 6),
    top_market_share: round(topMarketShare, 6),
    concentration_status:
      topFamilyShare > 0.48 || topStrategyShare > 0.18 ? 'fragile' : topFamilyShare > 0.38 ? 'watch' : 'controlled'
  };
}

function buildInstitutionalScorecard({
  metrics = {},
  diversification = {},
  crowdingGuard = {},
  institutionalGuard = {},
  scenarioDiagnostics = [],
  drawdownRisk = {},
  allocationRows = [],
  limits = INSTITUTIONAL_PORTFOLIO_LIMITS
}) {
  const maxFamilyExposure = Math.max(
    0,
    ...(crowdingGuard.family_exposure_after || []).map((row) => safe(row.exposure, 0))
  );
  const maxStrategyWeight = Math.max(0, ...allocationRows.map((row) => safe(row.weight, 0)));
  const top3Weight = allocationRows
    .map((row) => safe(row.weight, 0))
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((acc, value) => acc + value, 0);
  const worstScenarioSharpe = scenarioDiagnostics.length
    ? Math.min(...scenarioDiagnostics.map((row) => safe(row.sharpe, 0)))
    : 0;

  const checks = [
    {
      id: 'diversification_score',
      threshold: safe(limits.min_diversification_score, 0),
      value: safe(diversification.diversification_score, 0),
      pass: safe(diversification.diversification_score, 0) >= safe(limits.min_diversification_score, 0)
    },
    {
      id: 'family_crowding',
      threshold: safe(crowdingGuard.summary?.family_cap, 0),
      value: maxFamilyExposure,
      pass: maxFamilyExposure <= safe(crowdingGuard.summary?.family_cap, 1) + 0.0005
    },
    {
      id: 'strategy_weight_cap',
      threshold: safe(limits.max_strategy_weight, 1),
      value: maxStrategyWeight,
      pass: maxStrategyWeight <= safe(limits.max_strategy_weight, 1) + 0.0005
    },
    {
      id: 'top3_weight',
      threshold: safe(limits.max_top3_weight, 1),
      value: top3Weight,
      pass: top3Weight <= safe(limits.max_top3_weight, 1) + 0.0005
    },
    {
      id: 'portfolio_drawdown',
      threshold: safe(limits.max_portfolio_drawdown, 1),
      value: safe(metrics.drawdown, 0),
      pass: safe(metrics.drawdown, 0) <= safe(limits.max_portfolio_drawdown, 1)
    },
    {
      id: 'family_drawdown_share',
      threshold: safe(limits.max_family_drawdown_share, 1),
      value: safe(drawdownRisk.top_family_share, 0),
      pass: safe(drawdownRisk.top_family_share, 0) <= safe(limits.max_family_drawdown_share, 1)
    },
    {
      id: 'worst_case_sharpe',
      threshold: safe(limits.min_worst_case_sharpe, 0),
      value: worstScenarioSharpe,
      pass: worstScenarioSharpe >= safe(limits.min_worst_case_sharpe, 0)
    },
    {
      id: 'cash_buffer',
      threshold: safe(limits.max_cash_buffer, 1),
      value: safe(institutionalGuard.summary?.unallocated_cash_buffer, 0),
      pass: safe(institutionalGuard.summary?.unallocated_cash_buffer, 0) <= safe(limits.max_cash_buffer, 1)
    }
  ];

  const passCount = checks.filter((row) => row.pass).length;
  return {
    limits,
    checks,
    score: round(passCount / Math.max(1, checks.length), 4),
    verdict: passCount === checks.length ? 'institutional_ready' : passCount >= checks.length - 2 ? 'watch' : 'not_ready',
    blockers: checks.filter((row) => !row.pass).map((row) => row.id)
  };
}

function stabilityAcrossRegimes(rows = [], baseVol = 0) {
  const profiles = [
    { regime: 'trend', return_mul: 1.05, vol_mul: 0.92 },
    { regime: 'range', return_mul: 0.78, vol_mul: 1.08 },
    { regime: 'high_volatility', return_mul: 0.62, vol_mul: 1.32 },
    { regime: 'risk_off', return_mul: 0.34, vol_mul: 1.45 }
  ];

  return profiles.map((profile) => {
    const expectedReturn = rows.reduce((acc, row) => acc + row.weight * row.expected_return * profile.return_mul, 0);
    const volatility = baseVol * profile.vol_mul;
    const sharpe = volatility > 0 ? (expectedReturn / volatility) * Math.sqrt(252) : 0;

    return {
      regime: profile.regime,
      expected_return: round(expectedReturn, 6),
      expected_volatility: round(volatility, 6),
      sharpe_proxy: round(sharpe, 4),
      stability_label: sharpe >= 0.5 ? 'stable' : sharpe >= 0 ? 'mixed' : 'fragile'
    };
  });
}

function scenarioAdjustedStrategies(rows = [], scenario = {}) {
  return (rows || []).map((row) => {
    const assumption = applyScenarioToAssumption(row.execution_assumption || {}, scenario);
    const scenarioCostDrag = estimateCostDragPct({
      assumption,
      turnover: safe(row.turnover, 0),
      holdingDays: 3,
      includeFunding: true
    });
    const baselineCost = safe(row.baseline_cost_drag_pct, 0);
    const strictFillPenalty = scenario?.scenario_id === 'strict_fill' ? 0.004 : 0;
    return {
      ...row,
      expected_return: round(row.expected_return - Math.max(0, scenarioCostDrag - baselineCost) - strictFillPenalty, 6)
    };
  });
}

function scenarioPortfolioMetrics(rows = [], scenario = {}) {
  const corr = buildCorrelationMatrix(rows);
  const portfolioReturn = rows.reduce((acc, row) => acc + row.weight * row.expected_return, 0);
  const vol = portfolioVolatility(rows, corr);
  const sharpe = vol > 0 ? (portfolioReturn / vol) * Math.sqrt(252) : 0;
  return {
    scenario_id: scenario.scenario_id,
    label: scenario.label,
    portfolio_return: round(portfolioReturn, 6),
    volatility: round(vol, 6),
    sharpe: round(sharpe, 4)
  };
}

export function buildPortfolioSimulationEngine({
  asOf = new Date().toISOString(),
  evidenceSystem = {},
  regimeState = {},
  riskBucketSystem = {},
  opportunities = [],
  executionRealism = {}
} = {}) {
  const executionProfile = resolveExecutionRealismProfile({
    mode: executionRealism.mode || 'paper',
    profile: executionRealism.profile || {},
    overrides: executionRealism.overrides || {}
  });
  const strategies = defaultStrategyRows({
    evidenceSystem,
    regimeState,
    riskBucketSystem,
    executionRealismProfile: executionProfile
  });
  const crowdingGuard = applyFamilyCrowdingGuard(strategies, deriveFamilyCap(riskBucketSystem));
  const institutionalGuard = applyInstitutionalRiskGuard(crowdingGuard.strategy_rows, INSTITUTIONAL_PORTFOLIO_LIMITS);
  const guardedStrategies = institutionalGuard.strategy_rows;
  const corrMatrix = buildCorrelationMatrix(guardedStrategies);
  const path = simulatePortfolioPath(guardedStrategies, 90);

  const portfolioReturn = guardedStrategies.reduce((acc, row) => acc + row.weight * row.expected_return, 0);
  const volatility = portfolioVolatility(guardedStrategies, corrMatrix);
  const sharpe = volatility > 0 ? (portfolioReturn / volatility) * Math.sqrt(252) : 0;
  const turnover = guardedStrategies.length ? guardedStrategies.reduce((acc, row) => acc + row.weight * row.turnover, 0) : 0;
  const drawdown = path.equity_curve.length > 1 ? maxDrawdownFromCurve(path.equity_curve) : 0;

  const exposureFamily = exposureBy(guardedStrategies, (row) => row.strategy_family || 'unknown', 'strategy_family');
  const exposureAsset = exposureBy(
    opportunities.map((opp) => ({
      asset: opp.asset,
      weight: safe(opp.suggested_size_pct, 0) / 100
    })),
    (row) => row.asset || 'unknown',
    'asset'
  );
  const exposureRegime = regimeExposure(guardedStrategies, regimeState);

  const baseMetrics = {
    portfolio_return: round(portfolioReturn, 6),
    drawdown: round(drawdown, 6),
    sharpe: round(sharpe, 4),
    volatility: round(volatility, 6),
    turnover: round(turnover, 6)
  };

  const diversification = diversificationContribution(guardedStrategies, corrMatrix);
  const marginal = marginalImpact(guardedStrategies, corrMatrix, baseMetrics);
  const stability = stabilityAcrossRegimes(guardedStrategies, volatility);
  const drawdownRisk = drawdownConcentration(guardedStrategies, corrMatrix, regimeState);
  const scenarioDiagnostics = buildExecutionSensitivityScenarios(executionProfile)
    .filter((row) => !row.test_only)
    .map((scenario) => scenarioPortfolioMetrics(scenarioAdjustedStrategies(guardedStrategies, scenario), scenario));
  const institutionalScorecard = buildInstitutionalScorecard({
    metrics: baseMetrics,
    diversification,
    crowdingGuard,
    institutionalGuard,
    scenarioDiagnostics,
    drawdownRisk,
    allocationRows: guardedStrategies,
    limits: INSTITUTIONAL_PORTFOLIO_LIMITS
  });
  const tailRisk = tailRiskSummary(path);

  return {
    generated_at: asOf,
    simulator_version: 'portfolio-simulation-engine.v2',
    portfolio_type: 'multi_strategy_multi_asset_risk_budgeted',
    allocation: {
      strategy_rows: guardedStrategies,
      capital_allocation_rule: 'quality-weighted + regime-aware + risk-budget-capped + family-crowding-guard + institutional-risk-guard',
      total_allocated_weight: round(guardedStrategies.reduce((acc, row) => acc + row.weight, 0), 6),
      crowding_guard: crowdingGuard.summary,
      institutional_risk_guard: institutionalGuard.summary
    },
    metrics: baseMetrics,
    exposures: {
      by_strategy_family: exposureFamily,
      by_asset: exposureAsset,
      by_regime: exposureRegime
    },
    diagnostics: {
      diversification_contribution: diversification,
      allocation_crowding_guard: {
        family_exposure_before: crowdingGuard.family_exposure_before,
        family_exposure_after: crowdingGuard.family_exposure_after,
        summary: crowdingGuard.summary
      },
      institutional_risk_guard: {
        market_exposure_before: institutionalGuard.market_exposure_before,
        market_exposure_after: institutionalGuard.market_exposure_after,
        trimmed_strategies: institutionalGuard.trimmed_strategies,
        summary: institutionalGuard.summary
      },
      marginal_strategy_impact: marginal,
      strategy_correlation_matrix: corrMatrix,
      drawdown_concentration: drawdownRisk,
      portfolio_stability_across_regimes: stability,
      institutional_scorecard: institutionalScorecard,
      execution_realism: {
        assumption_profile: {
          profile_id: executionProfile.profile_id,
          mode: executionProfile.mode
        },
        scenario_sensitivity: scenarioDiagnostics
      },
      tail_risk: tailRisk
    },
    path: {
      returns: path.returns,
      equity_curve: path.equity_curve
    }
  };
}

import { COST_BASELINE_BY_MARKET, PARAM_VERSION } from './params.js';
import { clamp, round } from './math.js';
import { computePositionPct } from './riskEngine.js';
import {
  buildSignalExplanation,
  getStrategyTemplate,
  listStrategyTemplates,
  resolveStrategyId,
  strategyTemplateVersion,
} from './strategyTemplates.js';
import { getSeriesKey } from './velocityEngine.js';
import { runSentimentCycle } from './sentimentCycleEngine.js';
import { evaluateStrategy, aggregateEvaluations } from './strategyEvaluator.js';
import { detectPatterns } from './patternDetector.js';

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function inferTimeframe(signal, template) {
  return (
    signal.timeframe || template.default_timeframe || (signal.market === 'CRYPTO' ? '4H' : '1D')
  );
}

/**
 * OCC options symbol regex: ROOT (1-6 alpha) + YYMMDD + C/P + 8-digit strike.
 * Matches all US listed options regardless of strike price.
 */
const US_OPTIONS_SYMBOL_RE = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;

function inferAssetClass(signal, strategyId) {
  if (signal.asset_class) return signal.asset_class;
  if (strategyId === 'OP_INTRADAY') return 'OPTIONS';
  if (signal.market === 'CRYPTO') return 'CRYPTO';
  // Infer from OCC options symbol format (e.g., TSLA260619C00200000, SPX260619C01200000)
  if (signal.market === 'US' && signal.symbol && US_OPTIONS_SYMBOL_RE.test(signal.symbol)) {
    return 'OPTIONS';
  }
  return 'US_STOCK';
}

function getSignalSeries(signal, timeframe, velocityState) {
  const direct = velocityState.series_index[getSeriesKey(signal.market, signal.symbol, timeframe)];
  if (direct) return direct;

  const sameSymbol = Object.values(velocityState.series_index).find(
    (series) => series.market === signal.market && series.symbol === signal.symbol,
  );
  if (sameSymbol) return sameSymbol;

  return (
    Object.values(velocityState.series_index).find((series) => series.market === signal.market) ||
    null
  );
}

function getRegimeSnapshot(signal, timeframe, regimeState) {
  const key = getSeriesKey(signal.market, signal.symbol, timeframe);
  return (
    regimeState.snapshots[key] ||
    Object.values(regimeState.snapshots).find(
      (item) => item.market === signal.market && item.symbol === signal.symbol,
    ) ||
    regimeState.primary
  );
}

function inferEntryMethod(strategyId) {
  if (strategyId === 'OP_INTRADAY') return 'LIMIT';
  if (strategyId === 'EQ_REG') return 'MARKET';
  if (strategyId === 'CR_BAS' || strategyId === 'EQ_EVT') return 'SPLIT_LIMIT';
  return 'LIMIT';
}

function inferStopType(strategyId) {
  if (strategyId === 'OP_INTRADAY') return 'STRUCTURE';
  if (strategyId === 'EQ_REG' || strategyId === 'CR_TRAP') return 'STRUCTURE';
  if (strategyId === 'CR_VEL' || strategyId === 'EQ_VEL') return 'ATR';
  return 'HYBRID';
}

function inferTrailingType(template) {
  const mode = String(template.trailing_rule?.mode || '').toLowerCase();
  if (!mode || mode === 'none') return 'NONE';
  if (mode.includes('tight') || mode.includes('event-vol') || mode.includes('chandelier'))
    return 'CHAND_EXIT';
  return 'EMA';
}

function inferRegimeId(regime) {
  const label = String(regime?.regime_label || 'NEUTRAL');
  if (label === 'RISK_OFF') return 'RISK_OFF';
  if ((regime?.vol_percentile || 0) > 0.8) return 'HIGH_VOL';
  if ((regime?.trend_strength || 0) > 0.56) return 'TREND';
  return 'RANGE';
}

function inferStatus(rawStatus, expiresAtMs) {
  if (Date.now() >= expiresAtMs) return 'EXPIRED';
  if (rawStatus === 'TRIGGERED') return 'TRIGGERED';
  if (rawStatus === 'CLOSED') return 'INVALIDATED';
  if (rawStatus === 'EXPIRED') return 'EXPIRED';
  return 'NEW';
}

function computeExpectedR(signal, entryMid, tp) {
  const stop = safeNum(signal.stop_loss, entryMid);
  const takeProfit = safeNum(tp, entryMid);

  if (signal.direction === 'LONG') {
    const risk = Math.max(entryMid - stop, 1e-6);
    const reward = takeProfit - entryMid;
    return reward / risk;
  }

  const risk = Math.max(stop - entryMid, 1e-6);
  const reward = entryMid - takeProfit;
  return reward / risk;
}

function buildTakeProfitLevels(signal, entryMid) {
  const tp1 = Number(signal.take_profit);
  const extension = Math.abs(tp1 - entryMid) * 0.65;
  const tp2 = signal.direction === 'LONG' ? tp1 + extension : tp1 - extension;
  return [
    {
      price: round(tp1, 4),
      size_pct: 60,
      rationale: 'De-risk at first objective and lock initial edge.',
    },
    {
      price: round(tp2, 4),
      size_pct: 40,
      rationale: 'Capture continuation if momentum persists.',
    },
  ];
}

function pickEventStats(signal, series) {
  const stats = series?.event_study?.conditional_stats;
  const eventType = signal.direction === 'LONG' ? 'CROSS_ABOVE_90' : 'CROSS_BELOW_10';
  return stats?.[eventType]?.[7] || stats?.[eventType]?.[3] || stats?.[eventType]?.[1] || null;
}

function calcCostModel(signal, strategyId, regime, velocity) {
  const baseline = COST_BASELINE_BY_MARKET[signal.market] || COST_BASELINE_BY_MARKET.US;
  const volatilityPenalty = (regime?.vol_percentile || 0.5) > 0.8 ? 2 : 0;
  const spreadBps =
    signal.market === 'CRYPTO' ? 3 + volatilityPenalty * 0.5 : 1 + volatilityPenalty * 0.3;
  const fundingAdj =
    signal.market === 'CRYPTO'
      ? baseline.funding_bps + ((regime?.risk_off_score || 0) > 0.65 ? 2 : 0)
      : 0;
  const basisAdj =
    signal.market === 'CRYPTO'
      ? baseline.basis_bps +
        (strategyId === 'CR_BAS' ? Math.abs(velocity?.latest?.acceleration || 0) * 2 : 0)
      : baseline.basis_bps;

  const total =
    baseline.fees_bps +
    baseline.slippage_bps +
    fundingAdj +
    basisAdj +
    volatilityPenalty +
    spreadBps;
  return {
    fee_bps: round(baseline.fees_bps, 2),
    spread_bps: round(spreadBps, 2),
    slippage_bps: round(baseline.slippage_bps + volatilityPenalty, 2),
    funding_est_bps: round(fundingAdj, 2),
    basis_est: round(basisAdj, 2),
    total_bps: round(total, 2),
  };
}

function computeStrength(confidenceNorm, regime, velocitySeries) {
  const percentile = velocitySeries?.latest?.percentile ?? 0.5;
  const trend = regime?.trend_strength ?? 0.5;
  const riskOff = regime?.risk_off_score ?? 0.5;
  const score = clamp(percentile * 0.3 + trend * 0.4 + (1 - riskOff) * 0.3, 0, 1);
  return round(score * 100 * (0.75 + confidenceNorm * 0.25), 2);
}

function computeSignalScore({ expectedR, confidenceNorm, regimeId, totalCostBps, volPct }) {
  const regimeFit =
    regimeId === 'TREND'
      ? 1.18
      : regimeId === 'RANGE'
        ? 0.96
        : regimeId === 'HIGH_VOL'
          ? 0.78
          : 0.65;
  const costPenalty = totalCostBps / 45;
  const tailRiskPenalty = (volPct / 100) * 0.55;
  return round(expectedR * confidenceNorm * regimeFit - costPenalty - tailRiskPenalty, 4);
}

function inferHoldingHorizonDays(timeframe, strategyId, assetClass) {
  if (assetClass === 'OPTIONS') return 0.85;
  if (strategyId === 'CR_TRAP') return 1.2;
  if (strategyId === 'EQ_EVT') return 1.8;
  const tf = String(timeframe || '').toUpperCase();
  if (tf.endsWith('H')) {
    const hours = Number(tf.replace('H', '')) || 4;
    return round(Math.max(1, (hours / 24) * 5.6), 2);
  }
  if (tf.endsWith('D')) {
    const days = Number(tf.replace('D', '')) || 1;
    return round(Math.max(1.6, days * 2.6), 2);
  }
  return 2.57;
}

function computeRiskScore({ volatilityPercentile, costModel, bucketState, expectedR }) {
  const volRisk = clamp(volatilityPercentile / 100, 0, 1) * 48;
  const costRisk = clamp((costModel.total_bps || 0) / 25, 0, 1) * 24;
  const bucketRisk = bucketState === 'DERISKED' ? 18 : bucketState === 'RECOVERY_STEP_1' ? 10 : 6;
  const edgeOffset = clamp(expectedR / 3, 0, 1) * 18;
  return round(clamp(volRisk + costRisk + bucketRisk - edgeOffset, 6, 96), 1);
}

function computeRegimeCompatibility({
  regimeId,
  strategyId,
  temperaturePercentile,
  volatilityPercentile,
}) {
  let score =
    regimeId === 'TREND' ? 78 : regimeId === 'RANGE' ? 62 : regimeId === 'HIGH_VOL' ? 46 : 38;
  if (strategyId === 'CR_TRAP' && regimeId === 'HIGH_VOL') score += 14;
  if ((strategyId === 'EQ_VEL' || strategyId === 'CR_VEL') && regimeId === 'TREND') score += 12;
  if (temperaturePercentile > 90 || volatilityPercentile > 90) score -= 10;
  return round(clamp(score, 5, 96), 1);
}

function toHeatLabel(percentile) {
  if (percentile >= 75) return 'HIGH';
  if (percentile <= 35) return 'LOW';
  return 'NORMAL';
}

function toCrowdedRiskLabel({ temperaturePercentile, volatilityPercentile, costModel }) {
  const pressure =
    temperaturePercentile * 0.45 +
    volatilityPercentile * 0.35 +
    Math.min(costModel.total_bps || 0, 18) * 1.3;
  if (pressure >= 74) return 'HIGH';
  if (pressure >= 46) return 'MEDIUM';
  return 'LOW';
}

function buildExecutionChecklist({
  signal,
  assetClass,
  entryMethod,
  entryMin,
  entryMax,
  stopLoss,
  tp1,
  positionPct,
  bucketState,
}) {
  const lines = [
    `Confirm spread and liquidity for ${signal.symbol} before entering.`,
    `Use ${entryMethod} entry in ${round(entryMin, 2)}-${round(entryMax, 2)}; do not chase outside zone.`,
    `Set hard stop at ${round(stopLoss, 2)} immediately after fill.`,
    `Set TP1 near ${round(tp1, 2)} and scale out at least 50-60%.`,
    `Limit initial size to ${round(positionPct, 2)}% under ${bucketState} risk bucket.`,
    'Skip if volatility spikes further or regime flips risk-off.',
  ];
  if (assetClass === 'CRYPTO') {
    lines.push(
      'Avoid entries around funding reset windows; keep leverage conservative to reduce liquidation risk.',
    );
  }
  if (assetClass === 'OPTIONS') {
    lines.push('Use liquid strikes only and enforce end-of-day flatten if setup has not resolved.');
  }
  if (assetClass === 'US_STOCK') {
    lines.push('Check catalyst calendar before close when holding as swing exposure.');
  }
  return lines;
}

function computeNearestFridayExpiry(daysOut = 7) {
  const now = new Date();
  now.setDate(now.getDate() + daysOut);
  const dayOfWeek = now.getDay();
  const daysToFriday = (5 - dayOfWeek + 7) % 7 || 7;
  now.setDate(now.getDate() + daysToFriday);
  return now.toISOString().slice(0, 10);
}

function buildAssetPayload({ signal, assetClass, entryMid, strategyId }) {
  if (assetClass === 'OPTIONS') {
    const put = signal.direction === 'SHORT';
    const expiry = computeNearestFridayExpiry(7);
    const expiryDate = new Date(expiry + 'T00:00:00Z');
    const dte = Math.max(1, Math.round((expiryDate.getTime() - Date.now()) / (24 * 3600 * 1000)));
    return {
      kind: 'OPTIONS_INTRADAY',
      data: {
        underlying: {
          symbol: String(signal.symbol || '').match(/^[A-Z]+/)?.[0] || signal.symbol,
          spot_price: round(entryMid, 2),
          session: 'REG',
        },
        option_contract: {
          side: put ? 'PUT' : 'CALL',
          expiry,
          strike: Math.round(entryMid),
          dte,
          contract_symbol: signal.symbol,
        },
        time_stop: {
          eod_flatten: true,
          latest_exit_utc: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
        },
        greeks_iv: {
          delta: round(put ? -0.35 : 0.35, 2),
          iv_percentile: round(48 + (safeNum(signal.confidence, 3) - 3) * 8, 2),
          expected_move: round(entryMid * 0.012, 2),
        },
      },
    };
  }
  if (assetClass === 'US_STOCK') {
    const horizon =
      strategyId === 'EQ_SWING' ? 'MEDIUM' : strategyId === 'EQ_EVT' ? 'SHORT' : 'LONG';
    return {
      kind: 'STOCK_SWING',
      data: {
        horizon,
        catalysts:
          strategyId === 'EQ_EVT'
            ? ['earnings_window', 'macro_event']
            : ['index_regime', 'sector_leadership'],
      },
    };
  }
  const confidenceBias = Number(signal.confidence || 3) - 3;
  return {
    kind: 'CRYPTO',
    data: {
      venue: 'BINANCE',
      instrument_type: 'PERP',
      perp_metrics: {
        funding_rate_current: round(confidenceBias * 0.0002, 6),
        funding_rate_8h: round(confidenceBias * 0.00018, 6),
        funding_rate_24h: round(confidenceBias * 0.00044, 6),
        basis_bps: round(18 + confidenceBias * 6, 2),
        basis_percentile: round(62 + confidenceBias * 9, 2),
        open_interest: 1625000 + Math.round(confidenceBias * 120000),
        premium_index: round(confidenceBias * 0.0003, 6),
      },
      flow_state: {
        spot_led_breakout: signal.direction === 'LONG',
        perp_led_breakout: signal.direction === 'SHORT',
        funding_state: Math.abs(confidenceBias) > 1.2 ? 'EXTREME' : 'NEUTRAL',
      },
      leverage_suggestion: {
        suggested_leverage: signal.status === 'TRIGGERED' ? 1.5 : 1.2,
        capped_by_profile: true,
      },
    },
  };
}

function resolveExpiresAt(signal) {
  const createdAt = new Date(signal.generated_at).getTime();
  if (!Number.isFinite(createdAt)) return Date.now() + 24 * 3600 * 1000;
  if (signal.validity === 'UNTIL_TRIGGERED') return createdAt + 48 * 3600 * 1000;
  return createdAt + 24 * 3600 * 1000;
}

function resolveConflicts(sortedSignals) {
  const chosenByKey = new Map();
  return sortedSignals.map((signal) => {
    const key = `${signal.market}|${signal.symbol}|${signal.timeframe}`;
    const previous = chosenByKey.get(key);
    if (!previous) {
      chosenByKey.set(key, signal);
      return signal;
    }
    if (previous.direction === signal.direction) return signal;
    if (signal.status === 'TRIGGERED') return signal;
    return {
      ...signal,
      status: 'INVALIDATED',
      tags: [...signal.tags, 'conflict-muted'],
      explain_bullets: [
        `Signal muted due to higher-score opposite setup (${previous.id}).`,
        ...signal.explain_bullets.slice(0, 4),
      ],
    };
  });
}

export function runSignalEngine({ signals, velocityState, regimeState, riskState }) {
  const activeByMarket = signals.reduce((acc, signal) => {
    if (signal.status === 'PENDING' || signal.status === 'TRIGGERED') {
      acc[signal.market] = (acc[signal.market] || 0) + 1;
    }
    return acc;
  }, {});

  const contracts = signals.map((signal) => {
    const timeframeForLookup = inferTimeframe(
      signal,
      getStrategyTemplate(resolveStrategyId(signal)),
    );
    const regimeForRouting = getRegimeSnapshot(signal, timeframeForLookup, regimeState);
    const strategyId = resolveStrategyId(signal, regimeForRouting);
    const template = getStrategyTemplate(strategyId);
    const assetClass = inferAssetClass(signal, strategyId);
    const timeframe = inferTimeframe(signal, template);
    const series = getSignalSeries(signal, timeframe, velocityState);
    const regime = getRegimeSnapshot(signal, timeframe, regimeState);
    const regimeId = inferRegimeId(regime);
    const confidenceRaw = Number(signal.confidence || 3);
    const confidenceNorm = clamp(confidenceRaw / 5, 0.1, 0.98);
    const entryMin = Number(signal.entry_min);
    const entryMax = Number(signal.entry_max);
    const entryMid = (entryMin + entryMax) / 2;
    const tpLevels = buildTakeProfitLevels(signal, entryMid);
    const expectedR = round(computeExpectedR(signal, entryMid, tpLevels[0].price), 3);
    const eventStats = pickEventStats(signal, series);
    const hitRateEst = clamp(eventStats?.p_up || 0.5, 0.15, 0.9);
    const sampleSize = Number(eventStats?.sample_size || 0);
    const bucketMultiplier = riskState.bucket_multiplier;
    const positionPct = computePositionPct({
      entry: entryMid,
      stopLoss: signal.stop_loss,
      profile: riskState.profile,
      bucketMultiplier,
      activeSignalCount: activeByMarket[signal.market] || 1,
    });
    const costModel = calcCostModel(signal, strategyId, regime, series);
    const strength = computeStrength(confidenceNorm, regime, series);
    const createdAtMs = new Date(signal.generated_at).getTime() || Date.now();
    const expiresAtMs = resolveExpiresAt(signal);
    const status = inferStatus(signal.status, expiresAtMs);
    const entryMethod = inferEntryMethod(strategyId);
    const executionChecklist = buildExecutionChecklist({
      signal,
      assetClass,
      entryMethod,
      entryMin,
      entryMax,
      stopLoss: Number(signal.stop_loss),
      tp1: tpLevels[0].price,
      positionPct,
      bucketState: riskState.bucket_state,
    });
    const explainBullets = buildSignalExplanation({
      signal,
      template,
      regime,
      velocity: {
        percentile: series?.latest?.percentile || 0.5,
      },
      risk: {
        bucket_state: riskState.bucket_state,
        sample_size_reference: sampleSize || eventStats?.sample_size || 0,
      },
      expectedR,
      hitRateEst,
      costEstimate: {
        total_bps: costModel.total_bps,
      },
    });
    const sentimentCycle = runSentimentCycle({ series, regime });
    const score =
      computeSignalScore({
        expectedR,
        confidenceNorm,
        regimeId,
        totalCostBps: costModel.total_bps,
        volPct: (regime?.vol_percentile || 0.5) * 100,
      }) + sentimentCycle.adjustment;
    const stopType = inferStopType(strategyId);
    const trailingType = inferTrailingType(template);
    const temperaturePercentile = round(
      (series?.latest?.percentile || velocityState.global.percentile || 0.5) * 100,
      2,
    );
    const volatilityPercentile = round((regime?.vol_percentile || 0.5) * 100, 2);
    const holdingHorizonDays = inferHoldingHorizonDays(timeframe, strategyId, assetClass);
    const riskScore = computeRiskScore({
      volatilityPercentile,
      costModel,
      bucketState: riskState.bucket_state,
      expectedR,
    });
    const regimeCompatibility = computeRegimeCompatibility({
      regimeId,
      strategyId,
      temperaturePercentile,
      volatilityPercentile,
    });
    const marketHeat = toHeatLabel(temperaturePercentile);
    const crowdedRisk = toCrowdedRiskLabel({
      temperaturePercentile,
      volatilityPercentile,
      costModel,
    });

    return {
      ...signal,
      id: signal.signal_id,
      created_at: new Date(createdAtMs).toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      asset_class: assetClass,
      strategy_id: strategyId,
      strategy_family: template.strategy_family || template.name,
      strategy_version: signal.model_version || strategyTemplateVersion,
      timeframe,
      regime_id: regimeId,
      temperature_percentile: temperaturePercentile,
      volatility_percentile: volatilityPercentile,
      direction: signal.direction,
      strength,
      confidence: round(confidenceNorm, 4),
      confidence_level: confidenceRaw,
      entry_zone: {
        low: entryMin,
        high: entryMax,
        method: entryMethod,
        notes: `Valid until ${new Date(expiresAtMs).toISOString()}`,
      },
      invalidation_level: Number(signal.invalidation_level ?? signal.stop_loss),
      stop_loss: {
        type: stopType,
        price: Number(signal.stop_loss),
        rationale: `${stopType} stop anchored to setup invalidation`,
      },
      stop_loss_value: Number(signal.stop_loss),
      take_profit_levels: tpLevels,
      trailing_rule: {
        type: trailingType,
        params: template.trailing_rule || {},
      },
      position_advice: {
        position_pct: positionPct,
        leverage_cap: riskState.rules.leverage_cap,
        risk_bucket_applied: riskState.bucket_state,
        rationale: `${riskState.profile_key} profile with dynamic bucket ${riskState.bucket_state}`,
      },
      cost_model: costModel,
      expected_metrics: {
        expected_R: expectedR,
        hit_rate_est: round(hitRateEst, 4),
        sample_size: sampleSize,
        expected_max_dd_est: round(eventStats?.e_max_drawdown ?? volatilityPercentile / 430, 4),
      },
      holding_horizon_days: holdingHorizonDays,
      risk_score: riskScore,
      regime_compatibility: regimeCompatibility,
      market_heat: marketHeat,
      crowded_risk: crowdedRisk,
      explain_bullets: explainBullets,
      execution_checklist: executionChecklist,
      tags: [
        assetClass.toLowerCase(),
        strategyId,
        regimeId.toLowerCase(),
        temperaturePercentile > 90 ? 'temp-extreme' : 'temp-normal',
        volatilityPercentile > 90 ? 'vol-extreme' : 'vol-normal',
      ],
      status,
      payload: buildAssetPayload({ signal, assetClass, entryMid, strategyId }),
      references: {
        chart_url: `/charts/${signal.market}/${signal.symbol}`,
        docs_url: `/docs/strategies/${strategyId.toLowerCase()}`,
      },
      score,
      sentiment_cycle: sentimentCycle,
      strategy_evaluation: (() => {
        // Bug #4 fix: run multi-strategy evaluation across regime-matching templates
        const allTemplates = listStrategyTemplates();
        const candidates = allTemplates.filter(
          (t) => t.market === signal.market && t.asset_class === assetClass,
        );
        // If only one candidate, single eval is fine; otherwise aggregate
        if (candidates.length <= 1) {
          return evaluateStrategy({ template, regime, series, expectedR, confidenceNorm });
        }
        const evaluations = candidates.map((candidateTemplate) =>
          evaluateStrategy({
            template: candidateTemplate,
            regime,
            series,
            expectedR,
            confidenceNorm,
          }),
        );
        return aggregateEvaluations(evaluations);
      })(),
      detected_patterns: detectPatterns(series?.bars || signal.bars || []),

      // Backward-compatible fields for existing UI components.
      signal_id: signal.signal_id,
      entry_min: entryMin,
      entry_max: entryMax,
      stop_loss_price: Number(signal.stop_loss),
      take_profit: tpLevels[0].price,
      position_pct: positionPct,
      position_size_pct: positionPct,
      expected_R: expectedR,
      hit_rate_est: round(hitRateEst, 4),
      sample_size: sampleSize,
      holding_horizon_days: holdingHorizonDays,
      risk_score: riskScore,
      regime_compatibility: regimeCompatibility,
      market_heat: marketHeat,
      crowded_risk: crowdedRisk,
      cost_estimate: {
        fees_bps: costModel.fee_bps,
        spread_bps: costModel.spread_bps,
        slippage_bps: costModel.slippage_bps,
        funding_bps: costModel.funding_est_bps,
        basis_bps: costModel.basis_est,
        total_bps: costModel.total_bps,
      },
      rationale: explainBullets,
      advice: explainBullets[0],
      model_version: signal.model_version || 'v0.3',
      parameter_version: PARAM_VERSION,
      strategy_template_version: strategyTemplateVersion,
    };
  });

  return resolveConflicts(
    [...contracts].sort(
      (a, b) =>
        b.score - a.score || new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
  );
}

import { clamp, round, sum } from '../../engines/math.js';

export const USER_RISK_BUCKETS = Object.freeze({
  conservative: {
    label: 'conservative',
    total_exposure_cap_pct: 32,
    correlated_exposure_cap_pct: 14,
    market_concentration_cap_pct: 24,
    asset_class_concentration_cap_pct: 22,
    max_total_active_risk_pct: 1.8,
    daily_loss_limit_pct: 1.2,
    drawdown_threshold_pct: 6,
    max_concurrent_trades: 3,
    base_size_multiplier: 0.65,
  },
  balanced: {
    label: 'balanced',
    total_exposure_cap_pct: 52,
    correlated_exposure_cap_pct: 22,
    market_concentration_cap_pct: 36,
    asset_class_concentration_cap_pct: 34,
    max_total_active_risk_pct: 3.2,
    daily_loss_limit_pct: 2.5,
    drawdown_threshold_pct: 10,
    max_concurrent_trades: 5,
    base_size_multiplier: 1,
  },
  active: {
    label: 'active',
    total_exposure_cap_pct: 68,
    correlated_exposure_cap_pct: 28,
    market_concentration_cap_pct: 44,
    asset_class_concentration_cap_pct: 42,
    max_total_active_risk_pct: 4.8,
    daily_loss_limit_pct: 3.5,
    drawdown_threshold_pct: 14,
    max_concurrent_trades: 7,
    base_size_multiplier: 1.2,
  },
  aggressive: {
    label: 'aggressive',
    total_exposure_cap_pct: 80,
    correlated_exposure_cap_pct: 34,
    market_concentration_cap_pct: 52,
    asset_class_concentration_cap_pct: 48,
    max_total_active_risk_pct: 6.2,
    daily_loss_limit_pct: 4.8,
    drawdown_threshold_pct: 18,
    max_concurrent_trades: 9,
    base_size_multiplier: 1.35,
  },
});

const ACTIVE_SIGNAL_STATUS = new Set(['NEW', 'TRIGGERED']);

function normalizeRiskProfileKey(value) {
  const key = String(value || 'balanced').toLowerCase();
  return USER_RISK_BUCKETS[key] ? key : 'balanced';
}

function activeSignals(signals = []) {
  return signals.filter((item) =>
    ACTIVE_SIGNAL_STATUS.has(String(item.status || '').toUpperCase()),
  );
}

function stopDistancePct(signal) {
  const entryLow = Number(signal.entry_zone?.low ?? signal.entry_min ?? 0);
  const entryHigh = Number(signal.entry_zone?.high ?? signal.entry_max ?? 0);
  const entryMid =
    entryLow && entryHigh ? (entryLow + entryHigh) / 2 : Number(signal.entry_price ?? 0);
  const stop = Number(signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss ?? 0);
  if (!Number.isFinite(entryMid) || entryMid <= 0 || !Number.isFinite(stop) || stop <= 0)
    return 0.8;
  return Math.max(0.12, Math.abs((entryMid - stop) / entryMid) * 100);
}

function inferTradeQualityBucket(signal) {
  const score = Number(signal.score ?? 0);
  const risk = Number(signal.risk_score ?? 100);
  const confidence = Number(signal.confidence ?? 0);
  const regimeCompatibility = Number(signal.regime_compatibility ?? 0);

  if (regimeCompatibility < 42 || risk >= 82 || score < 0.38) {
    return 'blocked';
  }
  if (score >= 0.72 && risk <= 45 && confidence >= 0.65) {
    return 'A_quality';
  }
  if (score >= 0.56 && risk <= 66 && confidence >= 0.48) {
    return 'B_quality';
  }
  if (score >= 0.45) {
    return 'experimental';
  }
  return 'blocked';
}

function qualitySizeMultiplier(bucket) {
  if (bucket === 'A_quality') return 1;
  if (bucket === 'B_quality') return 0.72;
  if (bucket === 'experimental') return 0.4;
  return 0;
}

function bucketReason(bucket) {
  if (bucket === 'A_quality') return 'High quality setup with strong score/risk balance.';
  if (bucket === 'B_quality') return 'Tradable setup but requires reduced risk allocation.';
  if (bucket === 'experimental') return 'Borderline setup; keep size small and expectation modest.';
  return 'Setup fails quality/risk gates and is blocked.';
}

function correlationFootprint(signals = []) {
  const byTheme = new Map();
  for (const signal of signals) {
    const theme =
      signal.market === 'CRYPTO' ? 'crypto_core' : String(signal.sector || 'equity_core');
    const current = byTheme.get(theme) || { theme, exposure_pct: 0, symbols: [] };
    current.exposure_pct += Number(
      signal.position_advice?.position_pct ?? signal.position_size_pct ?? 0,
    );
    current.symbols.push(signal.symbol);
    byTheme.set(theme, current);
  }

  const rows = Array.from(byTheme.values()).map((item) => ({
    ...item,
    exposure_pct: round(item.exposure_pct, 4),
  }));

  const highest = rows.reduce((best, row) => (row.exposure_pct > best.exposure_pct ? row : best), {
    theme: 'none',
    exposure_pct: 0,
    symbols: [],
  });

  return {
    themes: rows,
    top_theme: highest,
    correlated_exposure_pct: round(highest.exposure_pct, 4),
  };
}

function concentrationBy(signals = [], keySelector) {
  const bucket = new Map();
  for (const signal of signals) {
    const key = keySelector(signal);
    const value = Number(signal.position_advice?.position_pct ?? signal.position_size_pct ?? 0);
    bucket.set(key, (bucket.get(key) || 0) + value);
  }
  const rows = Array.from(bucket.entries()).map(([key, exposure_pct]) => ({
    key,
    exposure_pct: round(exposure_pct, 4),
  }));
  const top = rows.reduce((best, row) => (row.exposure_pct > best.exposure_pct ? row : best), {
    key: 'none',
    exposure_pct: 0,
  });
  return {
    rows,
    top,
  };
}

function tradeDecision({
  signal,
  tradeBucket,
  userBucket,
  regimeState,
  portfolioBudget,
  index,
  openSlots,
}) {
  const basePositionPct = Number(
    signal.position_advice?.position_pct ?? signal.position_size_pct ?? 0,
  );
  const baseMultiplier = userBucket.base_size_multiplier;
  const qualityMultiplier = qualitySizeMultiplier(tradeBucket);
  const regimeMultiplier = Number(regimeState?.state?.default_sizing_multiplier ?? 0.8);
  const recommendedPositionPct = round(
    basePositionPct * baseMultiplier * qualityMultiplier * regimeMultiplier,
    4,
  );

  const reasons = [bucketReason(tradeBucket)];
  if (regimeState?.state?.recommended_user_posture === 'SKIP') {
    reasons.push('Regime engine indicates SKIP posture; prioritize capital preservation.');
  } else if (regimeState?.state?.recommended_user_posture === 'REDUCE') {
    reasons.push('Regime posture is REDUCE; scale down new entries.');
  }

  if (portfolioBudget.used_total_exposure_pct >= portfolioBudget.total_exposure_cap_pct) {
    reasons.push('Portfolio exposure cap has been reached.');
  }
  if (portfolioBudget.correlated_exposure_pct >= portfolioBudget.correlated_exposure_cap_pct) {
    reasons.push('Correlated exposure cap has been reached.');
  }
  if (portfolioBudget.market_concentration_pct >= portfolioBudget.market_concentration_cap_pct) {
    reasons.push('Market concentration cap has been reached.');
  }
  if (
    portfolioBudget.asset_class_concentration_pct >=
    portfolioBudget.asset_class_concentration_cap_pct
  ) {
    reasons.push('Asset-class concentration cap has been reached.');
  }
  if (portfolioBudget.used_total_active_risk_pct >= portfolioBudget.max_total_active_risk_pct) {
    reasons.push('Total active risk budget is exhausted.');
  }
  if (index >= openSlots) {
    reasons.push('Concurrent trade slots are full for the selected risk bucket.');
  }

  let decision = 'allow';
  if (tradeBucket === 'blocked' || regimeState?.state?.recommended_user_posture === 'SKIP') {
    decision = 'blocked';
  } else if (
    regimeState?.state?.recommended_user_posture === 'REDUCE' ||
    tradeBucket === 'B_quality' ||
    tradeBucket === 'experimental' ||
    portfolioBudget.used_total_exposure_pct >= portfolioBudget.total_exposure_cap_pct * 0.8
  ) {
    decision = 'reduce';
  }

  if (decision === 'blocked') {
    return {
      signal_id: signal.signal_id,
      symbol: signal.symbol,
      trade_bucket: tradeBucket,
      decision,
      base_position_pct: round(basePositionPct, 4),
      recommended_position_pct: 0,
      reasons,
      risk_explanation: {
        regime_posture: regimeState?.state?.recommended_user_posture || '--',
        quality_bucket: tradeBucket,
        budget_status: portfolioBudget.budget_status,
      },
      explainability: 'Trade blocked due to quality, regime, or portfolio budget constraints.',
    };
  }

  return {
    signal_id: signal.signal_id,
    symbol: signal.symbol,
    trade_bucket: tradeBucket,
    decision,
    base_position_pct: round(basePositionPct, 4),
    recommended_position_pct:
      decision === 'reduce' ? round(recommendedPositionPct * 0.85, 4) : recommendedPositionPct,
    reasons,
    risk_explanation: {
      regime_posture: regimeState?.state?.recommended_user_posture || '--',
      quality_bucket: tradeBucket,
      budget_status: portfolioBudget.budget_status,
    },
    explainability:
      decision === 'reduce'
        ? 'Trade remains eligible but size is reduced by risk bucket and regime posture.'
        : 'Trade is allowed with standard risk-adjusted sizing.',
  };
}

function decisionSummary(rows = []) {
  const summary = {
    allow: 0,
    reduce: 0,
    blocked: 0,
    top_block_reasons: [],
  };

  const reasonCount = new Map();
  for (const row of rows) {
    summary[row.decision] += 1;
    if (row.decision !== 'blocked') continue;
    for (const reason of row.reasons || []) {
      reasonCount.set(reason, (reasonCount.get(reason) || 0) + 1);
    }
  }

  summary.top_block_reasons = Array.from(reasonCount.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  summary.no_trade_recommendation =
    summary.blocked >= Math.max(1, Math.floor(rows.length * 0.7))
      ? 'Most setups are blocked. A no-trade day is currently preferred.'
      : 'Some setups remain tradable with disciplined sizing.';

  return summary;
}

export function buildRiskBucketSystem({
  asOf = new Date().toISOString(),
  riskProfileKey = 'balanced',
  championState = {},
  regimeState = {},
  signals = [],
  trades = [],
} = {}) {
  const resolvedKey = normalizeRiskProfileKey(riskProfileKey);
  const userBucket = USER_RISK_BUCKETS[resolvedKey];

  const tradableSignals = activeSignals(signals);
  const totalExposure = round(
    sum(
      tradableSignals.map((item) =>
        Number(item.position_advice?.position_pct ?? item.position_size_pct ?? 0),
      ),
    ),
    4,
  );
  const totalActiveRisk = round(
    sum(
      tradableSignals.map((item) => {
        const positionPct = Number(
          item.position_advice?.position_pct ?? item.position_size_pct ?? 0,
        );
        return (positionPct * stopDistancePct(item)) / 100;
      }),
    ),
    4,
  );
  const dailyPnlPct = round(
    (trades || []).slice(0, 12).reduce((acc, item) => acc + Number(item.pnl_pct || 0), 0),
    4,
  );

  const correlation = correlationFootprint(tradableSignals);
  const marketConcentration = concentrationBy(tradableSignals, (item) =>
    String(item.market || 'unknown'),
  );
  const assetClassConcentration = concentrationBy(tradableSignals, (item) =>
    String(item.asset_class || 'unknown'),
  );
  const drawdownProxy = round(
    Math.abs(Number(championState?.safety?.cards?.portfolio?.score ?? 80) - 100) * 0.24,
    4,
  );
  const openPositions = (trades || []).filter((item) => item?.time_in && !item?.time_out).length;

  const portfolioBudget = {
    total_exposure_cap_pct: userBucket.total_exposure_cap_pct,
    used_total_exposure_pct: totalExposure,
    remaining_total_exposure_pct: round(
      Math.max(0, userBucket.total_exposure_cap_pct - totalExposure),
      4,
    ),
    max_total_active_risk_pct: userBucket.max_total_active_risk_pct,
    used_total_active_risk_pct: totalActiveRisk,
    remaining_total_active_risk_pct: round(
      Math.max(0, userBucket.max_total_active_risk_pct - totalActiveRisk),
      4,
    ),
    correlated_exposure_cap_pct: userBucket.correlated_exposure_cap_pct,
    correlated_exposure_pct: correlation.correlated_exposure_pct,
    market_concentration_cap_pct: userBucket.market_concentration_cap_pct,
    market_concentration_pct: marketConcentration.top.exposure_pct,
    asset_class_concentration_cap_pct: userBucket.asset_class_concentration_cap_pct,
    asset_class_concentration_pct: assetClassConcentration.top.exposure_pct,
    max_concurrent_positions: userBucket.max_concurrent_trades,
    open_positions: openPositions,
    daily_loss_limit_pct: userBucket.daily_loss_limit_pct,
    current_daily_pnl_pct: dailyPnlPct,
    drawdown_threshold_pct: userBucket.drawdown_threshold_pct,
    current_drawdown_proxy_pct: drawdownProxy,
    budget_status:
      totalExposure >= userBucket.total_exposure_cap_pct ||
      correlation.correlated_exposure_pct >= userBucket.correlated_exposure_cap_pct ||
      marketConcentration.top.exposure_pct >= userBucket.market_concentration_cap_pct ||
      assetClassConcentration.top.exposure_pct >= userBucket.asset_class_concentration_cap_pct ||
      totalActiveRisk >= userBucket.max_total_active_risk_pct ||
      dailyPnlPct <= -userBucket.daily_loss_limit_pct
        ? 'stressed'
        : 'within_limits',
  };

  const openSlots = Math.max(0, userBucket.max_concurrent_trades - openPositions);

  const tradeDecisions = tradableSignals.map((signal, index) => {
    const tradeBucket = inferTradeQualityBucket(signal);
    return tradeDecision({
      signal,
      tradeBucket,
      userBucket,
      regimeState,
      portfolioBudget,
      index,
      openSlots: Math.max(openSlots, 1),
    });
  });

  const summary = decisionSummary(tradeDecisions);

  return {
    generated_at: asOf,
    system_version: 'risk-bucket-system.v1',
    user_risk_bucket: {
      key: resolvedKey,
      ...userBucket,
    },
    portfolio_risk_budget: {
      ...portfolioBudget,
      correlation_snapshot: correlation,
      market_concentration_snapshot: marketConcentration,
      asset_class_concentration_snapshot: assetClassConcentration,
    },
    trade_level_buckets: tradeDecisions,
    decision_summary: summary,
    explainability: {
      why_allowed:
        'Trade is allowed when setup quality is A/B and portfolio budgets remain within limits.',
      why_reduced: 'Size is reduced when regime posture is REDUCE or setup quality is non-A.',
      why_blocked:
        'Trade is blocked when quality fails, posture is SKIP, or risk budgets are exhausted.',
    },
  };
}

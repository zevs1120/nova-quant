import { clamp, round, sum } from '../../engines/math.js';

export const USER_RISK_BUCKETS = Object.freeze({
  conservative: {
    label: 'conservative',
    total_exposure_cap_pct: 32,
    correlated_exposure_cap_pct: 14,
    market_concentration_cap_pct: 24,
    asset_class_concentration_cap_pct: 22,
    max_position_cap_pct: 6,
    instrument_concentration_cap_pct: 8,
    same_direction_cap_pct: 22,
    max_total_active_risk_pct: 1.8,
    daily_loss_limit_pct: 1.2,
    weekly_loss_limit_pct: 2.2,
    monthly_loss_limit_pct: 4.5,
    drawdown_threshold_pct: 6,
    drawdown_caution_pct: 3,
    drawdown_derisk_pct: 4.5,
    drawdown_hard_stop_pct: 5.5,
    loss_streak_caution_count: 2,
    loss_streak_block_count: 4,
    max_concurrent_trades: 3,
    base_size_multiplier: 0.65,
  },
  balanced: {
    label: 'balanced',
    total_exposure_cap_pct: 52,
    correlated_exposure_cap_pct: 22,
    market_concentration_cap_pct: 36,
    asset_class_concentration_cap_pct: 34,
    max_position_cap_pct: 8,
    instrument_concentration_cap_pct: 10,
    same_direction_cap_pct: 40,
    max_total_active_risk_pct: 3.2,
    daily_loss_limit_pct: 2.5,
    weekly_loss_limit_pct: 4.5,
    monthly_loss_limit_pct: 8,
    drawdown_threshold_pct: 10,
    drawdown_caution_pct: 5,
    drawdown_derisk_pct: 7.5,
    drawdown_hard_stop_pct: 9,
    loss_streak_caution_count: 2,
    loss_streak_block_count: 4,
    max_concurrent_trades: 5,
    base_size_multiplier: 1,
  },
  active: {
    label: 'active',
    total_exposure_cap_pct: 68,
    correlated_exposure_cap_pct: 28,
    market_concentration_cap_pct: 44,
    asset_class_concentration_cap_pct: 42,
    max_position_cap_pct: 9,
    instrument_concentration_cap_pct: 12,
    same_direction_cap_pct: 48,
    max_total_active_risk_pct: 4.8,
    daily_loss_limit_pct: 3.5,
    weekly_loss_limit_pct: 6.2,
    monthly_loss_limit_pct: 9.5,
    drawdown_threshold_pct: 14,
    drawdown_caution_pct: 6.5,
    drawdown_derisk_pct: 8.5,
    drawdown_hard_stop_pct: 10,
    loss_streak_caution_count: 2,
    loss_streak_block_count: 4,
    max_concurrent_trades: 7,
    base_size_multiplier: 1.2,
  },
  aggressive: {
    label: 'aggressive',
    total_exposure_cap_pct: 80,
    correlated_exposure_cap_pct: 34,
    market_concentration_cap_pct: 52,
    asset_class_concentration_cap_pct: 48,
    max_position_cap_pct: 10,
    instrument_concentration_cap_pct: 12,
    same_direction_cap_pct: 52,
    max_total_active_risk_pct: 6.2,
    daily_loss_limit_pct: 4.8,
    weekly_loss_limit_pct: 7.8,
    monthly_loss_limit_pct: 10,
    drawdown_threshold_pct: 18,
    drawdown_caution_pct: 7,
    drawdown_derisk_pct: 9,
    drawdown_hard_stop_pct: 10,
    loss_streak_caution_count: 2,
    loss_streak_block_count: 4,
    max_concurrent_trades: 9,
    base_size_multiplier: 1.35,
  },
});

const ACTIVE_SIGNAL_STATUS = new Set(['NEW', 'TRIGGERED']);

function normalizeRiskProfileKey(value) {
  const key = String(value || 'balanced').toLowerCase();
  return USER_RISK_BUCKETS[key] ? key : 'balanced';
}

function normalizeDirection(value) {
  return String(value || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
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

function tradeTimestamp(row = {}, nowMs = Date.now()) {
  const created = Number(row.created_at_ms ?? row.time_out_ms ?? row.time_in_ms ?? Number.NaN);
  if (Number.isFinite(created) && created > 0) return created;
  const iso = row.time_out || row.time_in || row.closed_at || row.created_at;
  const parsed = Date.parse(String(iso || ''));
  return Number.isFinite(parsed) ? parsed : nowMs;
}

function rollingPnlPct(trades = [], nowMs = Date.now(), windowMs = 86400000) {
  return round(
    trades
      .filter((row) => nowMs - tradeTimestamp(row, nowMs) <= windowMs)
      .reduce((acc, row) => acc + Number(row.pnl_pct || 0), 0),
    4,
  );
}

function consecutiveLossStreak(trades = [], nowMs = Date.now()) {
  const ordered = [...trades].sort((a, b) => tradeTimestamp(b, nowMs) - tradeTimestamp(a, nowMs));
  let streak = 0;
  for (const row of ordered) {
    const pnl = Number(row.pnl_pct || 0);
    if (pnl < 0) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function drawdownFromTrades(trades = [], nowMs = Date.now()) {
  const ordered = [...trades].sort((a, b) => tradeTimestamp(a, nowMs) - tradeTimestamp(b, nowMs));
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const row of ordered) {
    equity *= 1 + Number(row.pnl_pct || 0) / 100;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }
  const currentDrawdown = peak > 0 ? (peak - equity) / peak : 0;
  return {
    current_drawdown_pct: round(currentDrawdown * 100, 4),
    max_drawdown_pct: round(maxDrawdown * 100, 4),
  };
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

function sameDirectionFootprint(signals = []) {
  const bucket = new Map();
  for (const signal of signals) {
    const direction = normalizeDirection(signal.direction);
    const value = Number(signal.position_advice?.position_pct ?? signal.position_size_pct ?? 0);
    bucket.set(direction, (bucket.get(direction) || 0) + value);
  }
  const rows = Array.from(bucket.entries()).map(([direction, exposure_pct]) => ({
    direction,
    exposure_pct: round(exposure_pct, 4),
  }));
  const top = rows.reduce((best, row) => (row.exposure_pct > best.exposure_pct ? row : best), {
    direction: 'NONE',
    exposure_pct: 0,
  });
  return {
    rows,
    top,
  };
}

function inferTimeStopBars(signal = {}, userBucket = {}) {
  const market = String(signal.market || '').toUpperCase();
  if (market === 'CRYPTO') return Math.max(8, Number(userBucket.max_concurrent_trades || 5) * 3);
  return Math.max(6, Number(userBucket.max_concurrent_trades || 5) * 2);
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
  const rawRecommendedPositionPct = round(
    basePositionPct * baseMultiplier * qualityMultiplier * regimeMultiplier,
    4,
  );
  const recommendedPositionPct = round(
    Math.min(
      rawRecommendedPositionPct,
      Number(userBucket.max_position_cap_pct || rawRecommendedPositionPct),
    ),
    4,
  );
  const singleTradeRiskPct = round((recommendedPositionPct * stopDistancePct(signal)) / 100, 4);
  const timeStopBars = inferTimeStopBars(signal, userBucket);
  const volatilityStopPct = round(
    Math.max(
      stopDistancePct(signal),
      String(signal.market || '').toUpperCase() === 'CRYPTO' ? 3.8 : 2.4,
    ),
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
  if (
    portfolioBudget.instrument_concentration_pct >= portfolioBudget.instrument_concentration_cap_pct
  ) {
    reasons.push('Single-name concentration cap has been reached.');
  }
  if (portfolioBudget.same_direction_exposure_pct >= portfolioBudget.same_direction_cap_pct) {
    reasons.push('Same-direction exposure cap has been reached.');
  }
  if (portfolioBudget.used_total_active_risk_pct >= portfolioBudget.max_total_active_risk_pct) {
    reasons.push('Total active risk budget is exhausted.');
  }
  if (portfolioBudget.current_drawdown_proxy_pct >= portfolioBudget.drawdown_hard_stop_pct) {
    reasons.push('Portfolio drawdown hard stop is active.');
  }
  if (portfolioBudget.current_daily_pnl_pct <= -portfolioBudget.daily_loss_limit_pct) {
    reasons.push('Daily realized-loss circuit breaker is active.');
  }
  if (portfolioBudget.current_weekly_pnl_pct <= -portfolioBudget.weekly_loss_limit_pct) {
    reasons.push('Weekly realized-loss circuit breaker is active.');
  }
  if (portfolioBudget.current_monthly_pnl_pct <= -portfolioBudget.monthly_loss_limit_pct) {
    reasons.push('Monthly realized-loss circuit breaker is active.');
  }
  if (portfolioBudget.consecutive_loss_streak >= portfolioBudget.loss_streak_block_count) {
    reasons.push('Consecutive-loss deleveraging hard stop is active.');
  }
  if (portfolioBudget.black_swan_guard_active) {
    reasons.push('Black-swan guard is active under the current regime.');
  }
  if (index >= openSlots) {
    reasons.push('Concurrent trade slots are full for the selected risk bucket.');
  }
  if (basePositionPct > Number(userBucket.max_position_cap_pct || 0)) {
    reasons.push('Requested size exceeds per-position cap and must be trimmed.');
  }
  if (singleTradeRiskPct > Number(userBucket.daily_loss_limit_pct || 0)) {
    reasons.push('Single-trade risk exceeds the current risk budget.');
  }

  let decision = 'allow';
  if (
    tradeBucket === 'blocked' ||
    regimeState?.state?.recommended_user_posture === 'SKIP' ||
    portfolioBudget.black_swan_guard_active ||
    portfolioBudget.current_drawdown_proxy_pct >= portfolioBudget.drawdown_hard_stop_pct ||
    portfolioBudget.current_daily_pnl_pct <= -portfolioBudget.daily_loss_limit_pct ||
    portfolioBudget.current_weekly_pnl_pct <= -portfolioBudget.weekly_loss_limit_pct ||
    portfolioBudget.current_monthly_pnl_pct <= -portfolioBudget.monthly_loss_limit_pct ||
    portfolioBudget.instrument_concentration_pct >=
      portfolioBudget.instrument_concentration_cap_pct ||
    portfolioBudget.same_direction_exposure_pct >= portfolioBudget.same_direction_cap_pct ||
    portfolioBudget.consecutive_loss_streak >= portfolioBudget.loss_streak_block_count
  ) {
    decision = 'blocked';
  } else if (
    regimeState?.state?.recommended_user_posture === 'REDUCE' ||
    tradeBucket === 'B_quality' ||
    tradeBucket === 'experimental' ||
    portfolioBudget.used_total_exposure_pct >= portfolioBudget.total_exposure_cap_pct * 0.8 ||
    portfolioBudget.instrument_concentration_pct >=
      portfolioBudget.instrument_concentration_cap_pct * 0.8 ||
    portfolioBudget.same_direction_exposure_pct >= portfolioBudget.same_direction_cap_pct * 0.8 ||
    portfolioBudget.current_drawdown_proxy_pct >= portfolioBudget.drawdown_caution_pct ||
    portfolioBudget.current_weekly_pnl_pct <= -portfolioBudget.weekly_loss_limit_pct * 0.8 ||
    portfolioBudget.current_monthly_pnl_pct <= -portfolioBudget.monthly_loss_limit_pct * 0.8 ||
    portfolioBudget.consecutive_loss_streak >= portfolioBudget.loss_streak_caution_count ||
    basePositionPct > Number(userBucket.max_position_cap_pct || 0)
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
      risk_controls: {
        time_stop_bars: timeStopBars,
        volatility_stop_pct: volatilityStopPct,
        single_trade_risk_pct: singleTradeRiskPct,
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
    risk_controls: {
      time_stop_bars: timeStopBars,
      volatility_stop_pct: volatilityStopPct,
      single_trade_risk_pct: singleTradeRiskPct,
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
  const nowMs = Number.isFinite(Date.parse(asOf)) ? Date.parse(asOf) : Date.now();

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
  const weeklyPnlPct = rollingPnlPct(trades || [], nowMs, 7 * 86400000);
  const monthlyPnlPct = rollingPnlPct(trades || [], nowMs, 30 * 86400000);
  const lossStreakCount = consecutiveLossStreak(trades || [], nowMs);
  const drawdownStats = drawdownFromTrades(trades || [], nowMs);

  const correlation = correlationFootprint(tradableSignals);
  const marketConcentration = concentrationBy(tradableSignals, (item) =>
    String(item.market || 'unknown'),
  );
  const assetClassConcentration = concentrationBy(tradableSignals, (item) =>
    String(item.asset_class || 'unknown'),
  );
  const symbolConcentration = concentrationBy(tradableSignals, (item) =>
    String(item.symbol || 'unknown'),
  );
  const sameDirection = sameDirectionFootprint(tradableSignals);
  const drawdownProxy = round(
    Math.max(
      Math.abs(Number(championState?.safety?.cards?.portfolio?.score ?? 80) - 100) * 0.24,
      drawdownStats.current_drawdown_pct,
    ),
    4,
  );
  const openPositions = (trades || []).filter((item) => item?.time_in && !item?.time_out).length;
  const blackSwanGuard =
    ['high_volatility', 'risk_off'].includes(String(regimeState?.state?.primary || '')) &&
    Number(regimeState?.state?.risk_off_score ?? regimeState?.state?.avg_risk_off_score ?? 0) >=
      0.68;

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
    instrument_concentration_cap_pct: userBucket.instrument_concentration_cap_pct,
    instrument_concentration_pct: symbolConcentration.top.exposure_pct,
    same_direction_cap_pct: userBucket.same_direction_cap_pct,
    same_direction_exposure_pct: sameDirection.top.exposure_pct,
    max_concurrent_positions: userBucket.max_concurrent_trades,
    open_positions: openPositions,
    daily_loss_limit_pct: userBucket.daily_loss_limit_pct,
    current_daily_pnl_pct: dailyPnlPct,
    weekly_loss_limit_pct: userBucket.weekly_loss_limit_pct,
    current_weekly_pnl_pct: weeklyPnlPct,
    monthly_loss_limit_pct: userBucket.monthly_loss_limit_pct,
    current_monthly_pnl_pct: monthlyPnlPct,
    drawdown_threshold_pct: userBucket.drawdown_threshold_pct,
    drawdown_caution_pct: userBucket.drawdown_caution_pct,
    drawdown_derisk_pct: userBucket.drawdown_derisk_pct,
    drawdown_hard_stop_pct: userBucket.drawdown_hard_stop_pct,
    current_drawdown_proxy_pct: drawdownProxy,
    consecutive_loss_streak: lossStreakCount,
    loss_streak_caution_count: userBucket.loss_streak_caution_count,
    loss_streak_block_count: userBucket.loss_streak_block_count,
    black_swan_guard_active: blackSwanGuard,
    budget_status:
      totalExposure >= userBucket.total_exposure_cap_pct ||
      correlation.correlated_exposure_pct >= userBucket.correlated_exposure_cap_pct ||
      marketConcentration.top.exposure_pct >= userBucket.market_concentration_cap_pct ||
      assetClassConcentration.top.exposure_pct >= userBucket.asset_class_concentration_cap_pct ||
      symbolConcentration.top.exposure_pct >= userBucket.instrument_concentration_cap_pct ||
      sameDirection.top.exposure_pct >= userBucket.same_direction_cap_pct ||
      totalActiveRisk >= userBucket.max_total_active_risk_pct ||
      dailyPnlPct <= -userBucket.daily_loss_limit_pct ||
      weeklyPnlPct <= -userBucket.weekly_loss_limit_pct ||
      monthlyPnlPct <= -userBucket.monthly_loss_limit_pct ||
      drawdownProxy >= userBucket.drawdown_hard_stop_pct ||
      lossStreakCount >= userBucket.loss_streak_block_count ||
      blackSwanGuard
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
      symbol_concentration_snapshot: symbolConcentration,
      same_direction_snapshot: sameDirection,
      realized_drawdown_snapshot: drawdownStats,
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

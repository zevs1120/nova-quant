import { clamp, deterministicHash, round } from './math.js';

const ACTIVE_STATUSES = new Set(['NEW', 'TRIGGERED']);
const RISK_REASON_SET = new Set(['risk_budget_exhausted', 'cost_too_high', 'min_notional_or_lot_violation']);
const CONFLICT_REASON_SET = new Set(['correlation_conflict', 'duplicated_theme_exposure']);

const DEFAULT_THRESHOLDS = {
  score_min: 0.45,
  regime_compatibility_min: 45,
  risk_score_max: 74,
  cost_bps_max: 16,
  min_position_pct: 0.25,
  shadow_max: 24
};

function mapReasonLabel(reason) {
  const labels = {
    regime_blocked: 'Regime mismatch',
    score_too_low: 'Signal score too low',
    risk_budget_exhausted: 'Risk budget exhausted',
    correlation_conflict: 'Correlation conflict',
    cost_too_high: 'Cost estimate too high',
    entry_not_touched: 'Entry zone not touched',
    order_expired: 'Order expired',
    execution_window_closed: 'Execution window closed',
    instrument_not_tradable: 'Instrument not tradable',
    data_missing: 'Data missing',
    min_notional_or_lot_violation: 'Minimum size/lot violation',
    duplicated_theme_exposure: 'Duplicated theme exposure',
    manual_kill_switch: 'Manual kill switch'
  };
  return labels[reason] || reason;
}

function emptyCounters() {
  return {
    universe_size: 0,
    universe_after_liquidity_filter: 0,
    raw_signals_generated: 0,
    filtered_by_regime: 0,
    filtered_by_risk: 0,
    filtered_by_conflict: 0,
    executable_opportunities: 0,
    filled_trades: 0,
    completed_round_trip_trades: 0
  };
}

function mergeCounters(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += Number(source[key] || 0);
  }
  return target;
}

function stageCounterFromRecord(record) {
  const row = emptyCounters();
  row.universe_size += 1;
  row.universe_after_liquidity_filter += 1;
  row.raw_signals_generated += 1;
  if (record.primary_reason === 'regime_blocked') row.filtered_by_regime += 1;
  if (RISK_REASON_SET.has(record.primary_reason)) row.filtered_by_risk += 1;
  if (CONFLICT_REASON_SET.has(record.primary_reason)) row.filtered_by_conflict += 1;
  if (record.executable) row.executable_opportunities += 1;
  if (record.filled) row.filled_trades += 1;
  if (record.round_trip_completed) row.completed_round_trip_trades += 1;
  return row;
}

function reasonCodes(signal, riskState, thresholds) {
  const reasons = [];
  const score = Number(signal.score ?? -999);
  const regimeFit = Number(signal.regime_compatibility ?? 50);
  const riskScore = Number(signal.risk_score ?? 50);
  const positionPct = Number(signal.position_advice?.position_pct ?? signal.position_size_pct ?? 0);
  const totalCost = Number(signal.cost_model?.total_bps ?? signal.cost_estimate?.total_bps ?? 0);

  if (!signal || !signal.signal_id) reasons.push('data_missing');
  if (signal.status === 'EXPIRED') reasons.push('order_expired');
  if (signal.status === 'INVALIDATED') reasons.push('correlation_conflict');
  if (signal.tags?.includes('conflict-muted')) reasons.push('correlation_conflict');
  if (!riskState?.status?.trading_on) reasons.push('risk_budget_exhausted');
  if (regimeFit < thresholds.regime_compatibility_min) reasons.push('regime_blocked');
  if (score < thresholds.score_min) reasons.push('score_too_low');
  if (riskScore > thresholds.risk_score_max) reasons.push('risk_budget_exhausted');
  if (totalCost > thresholds.cost_bps_max) reasons.push('cost_too_high');
  if (positionPct <= thresholds.min_position_pct) reasons.push('min_notional_or_lot_violation');
  if (signal.status === 'EXPIRED' && !ACTIVE_STATUSES.has(signal.status)) reasons.push('execution_window_closed');

  if (!reasons.length && !ACTIVE_STATUSES.has(signal.status)) reasons.push('entry_not_touched');
  if (!reasons.length) return { primary: null, secondary: null };
  return {
    primary: reasons[0],
    secondary: reasons[1] || null
  };
}

function buildSyntheticPath(signal) {
  const seed = deterministicHash(signal.signal_id || signal.id || `${signal.symbol}-${signal.created_at}`);
  const centered = ((seed % 1000) / 999) * 2 - 1;
  const expectedR = Number(signal.expected_metrics?.expected_R ?? signal.expected_R ?? 1);
  const hitRate = Number(signal.expected_metrics?.hit_rate_est ?? signal.hit_rate_est ?? 0.5);
  const edge = clamp((hitRate - 0.5) * expectedR, -0.6, 0.6);
  const drift = edge * 0.018;
  const r1d = clamp(centered * 0.008 + drift * 0.9, -0.08, 0.08);
  const r2d = clamp(r1d * 1.35 + centered * 0.005 + drift * 0.55, -0.12, 0.12);
  const r3d = clamp(r1d * 1.8 + centered * 0.006 + drift * 0.8, -0.16, 0.16);
  return {
    r_1d: round(r1d, 4),
    r_2d: round(r2d, 4),
    r_3d: round(r3d, 4)
  };
}

function aggregateRecords(records, keyFn) {
  const bucket = new Map();
  for (const record of records) {
    const key = keyFn(record);
    const current = bucket.get(key) || emptyCounters();
    bucket.set(key, mergeCounters(current, stageCounterFromRecord(record)));
  }
  return Array.from(bucket.entries()).map(([key, counters]) => ({ key, ...counters }));
}

function rankedNoTradeReasons(records) {
  const counts = new Map();
  const total = records.filter((item) => item.primary_reason).length || 1;
  for (const record of records) {
    if (!record.primary_reason) continue;
    counts.set(record.primary_reason, (counts.get(record.primary_reason) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({
      reason_code: reason,
      reason_label: mapReasonLabel(reason),
      count,
      share: round(count / total, 4)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function buildShadowLog(records, thresholds) {
  return records
    .filter((record) => record.primary_reason)
    .filter((record) => {
      if (record.primary_reason === 'score_too_low') return record.candidate_score >= thresholds.score_min - 0.22;
      if (record.primary_reason === 'regime_blocked') return record.regime_fit >= thresholds.regime_compatibility_min - 14;
      if (record.primary_reason === 'risk_budget_exhausted') return true;
      if (record.primary_reason === 'correlation_conflict') return true;
      return false;
    })
    .sort((a, b) => b.candidate_score - a.candidate_score || new Date(b.generated_at) - new Date(a.generated_at))
    .slice(0, thresholds.shadow_max)
    .map((record, index) => ({
      shadow_id: `SHD-${index + 1}-${record.signal_id}`,
      signal_id: record.signal_id,
      generated_at: record.generated_at,
      asset_class: record.asset_class,
      market: record.market,
      symbol: record.symbol,
      timeframe: record.timeframe,
      strategy_family: record.strategy_family,
      candidate_score: round(record.candidate_score, 4),
      score_threshold: thresholds.score_min,
      threshold_delta: round(record.candidate_score - thresholds.score_min, 4),
      primary_reason: record.primary_reason,
      secondary_reason: record.secondary_reason,
      hypothetical_lower_size_pass: record.primary_reason === 'risk_budget_exhausted' || record.primary_reason === 'cost_too_high',
      hypothetical_relaxed_conflict_pass: record.primary_reason === 'correlation_conflict',
      subsequent_path: record.synthetic_future_path
    }));
}

export function runSignalFunnelDiagnostics({ signals, trades, riskState, thresholds = {} }) {
  const cfg = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const signalIds = new Set(signals.map((item) => item.signal_id));
  const filledTradeIds = new Set();
  const completedTradeIds = new Set();

  for (const trade of trades || []) {
    const sid = trade.signal_id || trade.signalId;
    if (!sid || !signalIds.has(sid)) continue;
    if (trade.time_in) filledTradeIds.add(sid);
    if (trade.time_out && trade.exit !== null && trade.exit !== undefined) completedTradeIds.add(sid);
  }

  const records = signals.map((signal) => {
    const reasons = reasonCodes(signal, riskState, cfg);
    const executable = ACTIVE_STATUSES.has(String(signal.status)) && !reasons.primary;
    return {
      signal_id: signal.signal_id,
      generated_at: signal.created_at || signal.generated_at,
      trade_day: String(signal.created_at || signal.generated_at || '').slice(0, 10),
      asset_class: signal.asset_class || (signal.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK'),
      market: signal.market,
      symbol: signal.symbol,
      timeframe: signal.timeframe || '--',
      strategy_family: signal.strategy_family || signal.strategy_id || 'UNCLASSIFIED',
      candidate_score: Number(signal.score ?? 0),
      regime_fit: Number(signal.regime_compatibility ?? 50),
      primary_reason: reasons.primary,
      secondary_reason: reasons.secondary,
      executable,
      filled: filledTradeIds.has(signal.signal_id),
      round_trip_completed: completedTradeIds.has(signal.signal_id),
      synthetic_future_path: buildSyntheticPath(signal)
    };
  });

  const overall = records.reduce((acc, record) => mergeCounters(acc, stageCounterFromRecord(record)), emptyCounters());
  const byStrategyFamily = aggregateRecords(records, (item) => item.strategy_family).map((item) => ({
    strategy_family: item.key,
    ...item
  }));
  const byMarket = aggregateRecords(records, (item) => item.market).map((item) => ({
    market: item.key,
    ...item
  }));
  const byAssetClass = aggregateRecords(records, (item) => item.asset_class).map((item) => ({
    asset_class: item.key,
    ...item
  }));
  const byDayFamily = aggregateRecords(records, (item) => `${item.trade_day}|${item.strategy_family}`).map((item) => {
    const [trade_day, strategy_family] = item.key.split('|');
    return {
      trade_day,
      strategy_family,
      ...item
    };
  });

  return {
    generated_at: new Date().toISOString(),
    thresholds: cfg,
    taxonomy: [
      'regime_blocked',
      'score_too_low',
      'risk_budget_exhausted',
      'correlation_conflict',
      'cost_too_high',
      'entry_not_touched',
      'order_expired',
      'execution_window_closed',
      'instrument_not_tradable',
      'data_missing',
      'min_notional_or_lot_violation',
      'duplicated_theme_exposure',
      'manual_kill_switch'
    ],
    overall,
    by_asset_class: byAssetClass,
    by_strategy_family: byStrategyFamily,
    by_market: byMarket,
    by_day_family: byDayFamily,
    no_trade_top_n: rankedNoTradeReasons(records),
    shadow_opportunity_log: buildShadowLog(records, cfg)
  };
}

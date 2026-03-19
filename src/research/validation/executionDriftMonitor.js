import { mean, round } from '../../engines/math.js';

const DEFAULT_THRESHOLD_PROFILE = Object.freeze({
  min_matched_trades: 3,
  min_capture_rate: 0.4,
  max_unmatched_actual_share: 0.35,
  max_avg_abs_fill_gap_bps: 32,
  max_p95_abs_fill_gap_bps: 85,
  max_avg_abs_pnl_gap_pct: 0.02,
  max_avg_abs_hold_gap_days: 2.5,
  max_win_rate_drift: 0.08,
  warning_threshold_fraction: 0.7
});

function safe(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isoDay(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function safeTime(value) {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? ts : null;
}

function hoursBetween(a, b) {
  const left = safeTime(a);
  const right = safeTime(b);
  if (left === null || right === null) return null;
  return Math.abs(right - left) / 3600000;
}

function daysBetween(a, b) {
  const hours = hoursBetween(a, b);
  return hours === null ? null : hours / 24;
}

function percentile(values = [], pct = 95) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.max(0, Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[rank];
}

function normalizeDirection(value) {
  const raw = String(value || '').toUpperCase();
  if (raw === 'SELL' || raw === 'SHORT') return 'SHORT';
  return 'LONG';
}

function normalizeSource(value) {
  const raw = String(value || '').toUpperCase();
  if (raw.includes('LIVE')) return 'LIVE';
  if (raw.includes('PAPER')) return 'PAPER';
  if (raw.includes('BACKTEST')) return 'BACKTEST';
  return raw || 'UNKNOWN';
}

function normalizeTradeReturn(rawValue, expected = null) {
  const raw = safe(rawValue, NaN);
  if (!Number.isFinite(raw)) return null;
  const candidates = Math.abs(raw) > 0.25 ? [raw, raw / 100] : [raw, raw * 100 > 25 ? raw / 100 : raw];
  if (Number.isFinite(expected)) {
    return candidates
      .map((value) => ({
        value,
        gap: Math.abs(value - expected)
      }))
      .sort((a, b) => a.gap - b.gap)[0].value;
  }
  return Math.abs(raw) > 1 ? raw / 100 : raw;
}

function signalIdOf(row = {}) {
  const value = row.signal_id ?? row.id ?? row.signalId ?? null;
  return value ? String(value) : null;
}

function strategyMetaBySignal(signals = []) {
  return new Map(
    (signals || [])
      .map((signal) => {
        const signalId = signalIdOf(signal);
        if (!signalId) return null;
        return [
          signalId,
          {
            strategy_id: signal.strategy_id || null,
            strategy_family: signal.strategy_family || null,
            symbol: String(signal.symbol || '').toUpperCase() || null,
            market: signal.market || null,
            direction: normalizeDirection(signal.direction),
            signal_time: signal.created_at || signal.generated_at || null
          }
        ];
      })
      .filter(Boolean)
  );
}

function normalizeReplayRows(replayValidation = {}, signals = []) {
  const signalMeta = strategyMetaBySignal(signals);
  const rows = replayValidation?.replayed_signals || Object.values(replayValidation?.signal_outcome_map || {});

  return (rows || [])
    .map((row) => {
      const signalId = signalIdOf(row);
      if (!signalId) return null;
      const meta = signalMeta.get(signalId) || {};
      return {
        signal_id: signalId,
        strategy_id: row.strategy_id || meta.strategy_id || null,
        strategy_family: row.strategy_family || meta.strategy_family || null,
        symbol: String(row.symbol || meta.symbol || '').toUpperCase() || null,
        market: row.market || meta.market || null,
        direction: normalizeDirection(row.direction || meta.direction),
        signal_time: row.signal_time || meta.signal_time || row.replay_entry_event?.entry_time || null,
        replay_triggered: Boolean(row.replay_entry_event?.triggered || row.trade_triggered),
        replay_closed: Boolean(row.replay_exit_event?.exit_type),
        expected_entry_price: Number.isFinite(Number(row.replay_entry_event?.entry_price))
          ? Number(row.replay_entry_event.entry_price)
          : null,
        expected_return: Number.isFinite(Number(row.realized_pnl_pct)) ? Number(row.realized_pnl_pct) : null,
        expected_holding_days: Number.isFinite(Number(row.realized_holding_duration?.days))
          ? Number(row.realized_holding_duration.days)
          : null,
        expected_exit_time: row.replay_exit_event?.exit_time || null,
        expected_entry_time: row.replay_entry_event?.entry_time || null,
        volatility_bucket: row.slippage_assumption_used?.volatility_bucket || null,
        session_state: row.slippage_assumption_used?.session_state || null,
        liquidity_bucket: row.slippage_assumption_used?.liquidity_bucket || null
      };
    })
    .filter(Boolean);
}

function normalizeActualTrades(trades = [], signals = []) {
  const signalMeta = strategyMetaBySignal(signals);
  return (trades || [])
    .map((trade) => {
      const source = normalizeSource(trade.source || trade.mode || trade.execution_mode);
      if (source === 'BACKTEST') return null;
      const signalId = signalIdOf(trade);
      const meta = signalMeta.get(signalId) || {};
      const entryTime = trade.time_in || trade.created_at || trade.opened_at || null;
      const exitTime = trade.time_out || trade.closed_at || null;
      return {
        signal_id: signalId,
        strategy_id: trade.strategy_id || meta.strategy_id || null,
        strategy_family: trade.strategy_family || meta.strategy_family || null,
        source,
        symbol: String(trade.symbol || meta.symbol || '').toUpperCase() || null,
        market: trade.market || meta.market || null,
        direction: normalizeDirection(trade.side || trade.direction || meta.direction),
        entry_price: Number.isFinite(Number(trade.entry ?? trade.entry_price)) ? Number(trade.entry ?? trade.entry_price) : null,
        exit_price: Number.isFinite(Number(trade.exit ?? trade.exit_price)) ? Number(trade.exit ?? trade.exit_price) : null,
        raw_pnl: Number.isFinite(Number(trade.pnl_pct)) ? Number(trade.pnl_pct) : null,
        time_in: entryTime,
        time_out: exitTime,
        holding_days: (() => {
          const days = daysBetween(entryTime, exitTime);
          return days === null ? null : Math.max(0, days);
        })()
      };
    })
    .filter(Boolean);
}

function exactMatchCandidates(actualTrades = []) {
  const map = new Map();
  for (const trade of actualTrades) {
    if (!trade.signal_id) continue;
    if (!map.has(trade.signal_id)) map.set(trade.signal_id, []);
    map.get(trade.signal_id).push(trade);
  }
  return map;
}

function fuzzyTradeDistance(replayRow, actualRow) {
  if (!replayRow || !actualRow) return Infinity;
  if (replayRow.symbol && actualRow.symbol && replayRow.symbol !== actualRow.symbol) return Infinity;
  if (replayRow.direction && actualRow.direction && replayRow.direction !== actualRow.direction) return Infinity;
  const entryReference = replayRow.expected_entry_time || replayRow.signal_time;
  const timeGapHours = hoursBetween(entryReference, actualRow.time_in);
  if (timeGapHours === null) return Infinity;
  if (timeGapHours > 96) return Infinity;
  const priceGap = replayRow.expected_entry_price && actualRow.entry_price
    ? Math.abs(actualRow.entry_price / Math.max(replayRow.expected_entry_price, 1e-9) - 1)
    : 0.05;
  return timeGapHours / 24 + priceGap * 20;
}

function reconcileStatus(metrics, thresholds) {
  if (metrics.direction_mismatch || metrics.symbol_mismatch) return 'breach';

  const breaches = [
    Number.isFinite(metrics.fill_gap_bps_abs) &&
      metrics.fill_gap_bps_abs > safe(thresholds.max_avg_abs_fill_gap_bps, 0) * 1.2,
    Number.isFinite(metrics.pnl_gap_pct_abs) &&
      metrics.pnl_gap_pct_abs > safe(thresholds.max_avg_abs_pnl_gap_pct, 0) * 1.2,
    Number.isFinite(metrics.hold_gap_days_abs) &&
      metrics.hold_gap_days_abs > safe(thresholds.max_avg_abs_hold_gap_days, 0) * 1.2
  ].filter(Boolean).length;
  if (breaches > 0) return 'breach';

  const warnings = [
    Number.isFinite(metrics.fill_gap_bps_abs) &&
      metrics.fill_gap_bps_abs > safe(thresholds.max_avg_abs_fill_gap_bps, 0) * safe(thresholds.warning_threshold_fraction, 0.7),
    Number.isFinite(metrics.pnl_gap_pct_abs) &&
      metrics.pnl_gap_pct_abs > safe(thresholds.max_avg_abs_pnl_gap_pct, 0) * safe(thresholds.warning_threshold_fraction, 0.7),
    Number.isFinite(metrics.hold_gap_days_abs) &&
      metrics.hold_gap_days_abs > safe(thresholds.max_avg_abs_hold_gap_days, 0) * safe(thresholds.warning_threshold_fraction, 0.7)
  ].filter(Boolean).length;
  return warnings > 0 ? 'watch' : 'aligned';
}

function buildReconciliations(replayRows = [], actualTrades = [], thresholds = DEFAULT_THRESHOLD_PROFILE) {
  const exactCandidates = exactMatchCandidates(actualTrades);
  const unusedActual = new Set(actualTrades.map((_, idx) => idx));
  const rows = [];

  const actualIndexOf = (target) => actualTrades.findIndex((row) => row === target);

  const consumeTrade = (trade) => {
    const idx = actualIndexOf(trade);
    if (idx >= 0) unusedActual.delete(idx);
  };

  for (const replayRow of replayRows) {
    if (!replayRow.replay_triggered) {
      rows.push({
        signal_id: replayRow.signal_id,
        strategy_id: replayRow.strategy_id,
        strategy_family: replayRow.strategy_family,
        symbol: replayRow.symbol,
        market: replayRow.market,
        direction: replayRow.direction,
        status: 'not_triggered',
        match_method: 'none',
        replay_triggered: false,
        actual_executed: false
      });
      continue;
    }

    let matchedTrade = null;
    let matchMethod = 'none';
    const exact = (exactCandidates.get(replayRow.signal_id) || [])
      .filter((trade) => unusedActual.has(actualIndexOf(trade)))
      .sort((a, b) => safeTime(a.time_in) - safeTime(b.time_in));
    if (exact.length) {
      matchedTrade = exact[0];
      matchMethod = 'signal_id';
      consumeTrade(matchedTrade);
    } else {
      const fuzzy = actualTrades
        .filter((trade, idx) => unusedActual.has(idx))
        .map((trade) => ({
          trade,
          distance: fuzzyTradeDistance(replayRow, trade)
        }))
        .filter((row) => Number.isFinite(row.distance))
        .sort((a, b) => a.distance - b.distance);
      if (fuzzy.length) {
        matchedTrade = fuzzy[0].trade;
        matchMethod = 'symbol_side_time';
        consumeTrade(matchedTrade);
      }
    }

    if (!matchedTrade) {
      rows.push({
        signal_id: replayRow.signal_id,
        strategy_id: replayRow.strategy_id,
        strategy_family: replayRow.strategy_family,
        symbol: replayRow.symbol,
        market: replayRow.market,
        direction: replayRow.direction,
        status: 'replay_only',
        match_method: 'none',
        replay_triggered: true,
        actual_executed: false
      });
      continue;
    }

    const expectedReturn = replayRow.expected_return;
    const actualReturn = normalizeTradeReturn(matchedTrade.raw_pnl, expectedReturn);
    const fillGapBps =
      replayRow.expected_entry_price && matchedTrade.entry_price
        ? round(((matchedTrade.entry_price - replayRow.expected_entry_price) / replayRow.expected_entry_price) * 10000, 4)
        : null;
    const pnlGapPct =
      Number.isFinite(expectedReturn) && Number.isFinite(actualReturn)
        ? round(actualReturn - expectedReturn, 6)
        : null;
    const holdGapDays =
      Number.isFinite(replayRow.expected_holding_days) && Number.isFinite(matchedTrade.holding_days)
        ? round(matchedTrade.holding_days - replayRow.expected_holding_days, 6)
        : null;
    const metrics = {
      fill_gap_bps_abs: fillGapBps === null ? null : Math.abs(fillGapBps),
      pnl_gap_pct_abs: pnlGapPct === null ? null : Math.abs(pnlGapPct),
      hold_gap_days_abs: holdGapDays === null ? null : Math.abs(holdGapDays),
      direction_mismatch: replayRow.direction !== matchedTrade.direction,
      symbol_mismatch: replayRow.symbol !== matchedTrade.symbol
    };
    rows.push({
      signal_id: replayRow.signal_id,
      strategy_id: replayRow.strategy_id || matchedTrade.strategy_id || null,
      strategy_family: replayRow.strategy_family || matchedTrade.strategy_family || null,
      symbol: replayRow.symbol || matchedTrade.symbol,
      market: replayRow.market || matchedTrade.market,
      direction: replayRow.direction,
      source: matchedTrade.source,
      status: reconcileStatus(metrics, thresholds),
      match_method: matchMethod,
      replay_triggered: true,
      actual_executed: true,
      expected_entry_price: replayRow.expected_entry_price,
      actual_entry_price: matchedTrade.entry_price,
      fill_gap_bps: fillGapBps,
      expected_return: expectedReturn,
      actual_return: actualReturn,
      pnl_gap_pct: pnlGapPct,
      expected_holding_days: replayRow.expected_holding_days,
      actual_holding_days: matchedTrade.holding_days,
      hold_gap_days: holdGapDays,
      replay_signal_time: replayRow.signal_time,
      actual_time_in: matchedTrade.time_in,
      actual_time_out: matchedTrade.time_out,
      entry_latency_hours: hoursBetween(replayRow.expected_entry_time || replayRow.signal_time, matchedTrade.time_in),
      volatility_bucket: replayRow.volatility_bucket || null,
      session_state: replayRow.session_state || null,
      liquidity_bucket: replayRow.liquidity_bucket || null
    });
  }

  unusedActual.forEach((idx) => {
    const trade = actualTrades[idx];
    rows.push({
      signal_id: trade.signal_id,
      strategy_id: trade.strategy_id,
      strategy_family: trade.strategy_family,
      symbol: trade.symbol,
      market: trade.market,
      direction: trade.direction,
      source: trade.source,
      status: 'actual_only',
      match_method: 'none',
      replay_triggered: false,
      actual_executed: true,
      actual_entry_price: trade.entry_price,
      actual_return: normalizeTradeReturn(trade.raw_pnl),
      actual_holding_days: trade.holding_days,
      actual_time_in: trade.time_in,
      actual_time_out: trade.time_out
    });
  });

  return rows;
}

function meanOrNull(values = []) {
  return values.length ? round(mean(values), 6) : null;
}

function summarizeRows(rows = [], replayRows = [], actualTrades = [], thresholds = DEFAULT_THRESHOLD_PROFILE) {
  const matched = rows.filter((row) => row.status === 'aligned' || row.status === 'watch' || row.status === 'breach');
  const replayOnly = rows.filter((row) => row.status === 'replay_only');
  const actualOnly = rows.filter((row) => row.status === 'actual_only');
  const replayTriggered = replayRows.filter((row) => row.replay_triggered);
  const fillGaps = matched.map((row) => safe(row.fill_gap_bps, NaN)).filter(Number.isFinite);
  const pnlGaps = matched.map((row) => safe(row.pnl_gap_pct, NaN)).filter(Number.isFinite);
  const holdGaps = matched.map((row) => safe(row.hold_gap_days, NaN)).filter(Number.isFinite);
  const replayWinRate = matched.length
    ? matched.filter((row) => safe(row.expected_return, -1) > 0).length / matched.length
    : null;
  const actualWinRate = matched.length
    ? matched.filter((row) => safe(row.actual_return, -1) > 0).length / matched.length
    : null;
  const captureRate = replayTriggered.length ? matched.length / replayTriggered.length : 0;
  const unmatchedActualShare = actualTrades.length ? actualOnly.length / actualTrades.length : 0;
  const checks = [
    {
      id: 'matched_trade_sample',
      threshold: thresholds.min_matched_trades,
      value: matched.length,
      pass: matched.length >= safe(thresholds.min_matched_trades, 0)
    },
    {
      id: 'capture_rate',
      threshold: thresholds.min_capture_rate,
      value: round(captureRate, 6),
      pass: captureRate >= safe(thresholds.min_capture_rate, 0)
    },
    {
      id: 'unmatched_actual_share',
      threshold: thresholds.max_unmatched_actual_share,
      value: round(unmatchedActualShare, 6),
      pass: unmatchedActualShare <= safe(thresholds.max_unmatched_actual_share, 1)
    },
    {
      id: 'avg_abs_fill_gap_bps',
      threshold: thresholds.max_avg_abs_fill_gap_bps,
      value: meanOrNull(fillGaps.map(Math.abs)),
      pass: fillGaps.length ? mean(fillGaps.map(Math.abs)) <= safe(thresholds.max_avg_abs_fill_gap_bps, Infinity) : false
    },
    {
      id: 'p95_abs_fill_gap_bps',
      threshold: thresholds.max_p95_abs_fill_gap_bps,
      value: percentile(fillGaps.map(Math.abs), 95),
      pass: fillGaps.length
        ? safe(percentile(fillGaps.map(Math.abs), 95), Infinity) <= safe(thresholds.max_p95_abs_fill_gap_bps, Infinity)
        : false
    },
    {
      id: 'avg_abs_pnl_gap_pct',
      threshold: thresholds.max_avg_abs_pnl_gap_pct,
      value: meanOrNull(pnlGaps.map(Math.abs)),
      pass: pnlGaps.length ? mean(pnlGaps.map(Math.abs)) <= safe(thresholds.max_avg_abs_pnl_gap_pct, Infinity) : false
    },
    {
      id: 'avg_abs_hold_gap_days',
      threshold: thresholds.max_avg_abs_hold_gap_days,
      value: meanOrNull(holdGaps.map(Math.abs)),
      pass: holdGaps.length ? mean(holdGaps.map(Math.abs)) <= safe(thresholds.max_avg_abs_hold_gap_days, Infinity) : false
    },
    {
      id: 'win_rate_drift',
      threshold: thresholds.max_win_rate_drift,
      value:
        replayWinRate === null || actualWinRate === null
          ? null
          : round(Math.abs(actualWinRate - replayWinRate), 6),
      pass:
        replayWinRate !== null && actualWinRate !== null
          ? Math.abs(actualWinRate - replayWinRate) <= safe(thresholds.max_win_rate_drift, Infinity)
          : false
    }
  ];

  const blockers = checks.filter((row) => !row.pass).map((row) => row.id);
  const insufficientSample = matched.length < safe(thresholds.min_matched_trades, 0);
  return {
    thresholds,
    checks,
    matched_trade_count: matched.length,
    replay_triggered_count: replayTriggered.length,
    actual_trade_count: actualTrades.length,
    replay_only_count: replayOnly.length,
    actual_only_count: actualOnly.length,
    capture_rate: round(captureRate, 6),
    unmatched_actual_share: round(unmatchedActualShare, 6),
    avg_abs_fill_gap_bps: meanOrNull(fillGaps.map(Math.abs)),
    p95_abs_fill_gap_bps: fillGaps.length ? round(percentile(fillGaps.map(Math.abs), 95), 6) : null,
    avg_abs_pnl_gap_pct: meanOrNull(pnlGaps.map(Math.abs)),
    avg_abs_hold_gap_days: meanOrNull(holdGaps.map(Math.abs)),
    replay_win_rate: replayWinRate === null ? null : round(replayWinRate, 6),
    actual_win_rate: actualWinRate === null ? null : round(actualWinRate, 6),
    win_rate_drift:
      replayWinRate === null || actualWinRate === null ? null : round(actualWinRate - replayWinRate, 6),
    breach_count: matched.filter((row) => row.status === 'breach').length,
    watch_count: matched.filter((row) => row.status === 'watch').length,
    aligned_count: matched.filter((row) => row.status === 'aligned').length,
    insufficient_sample: insufficientSample,
    score: round(checks.filter((row) => row.pass).length / Math.max(checks.length, 1), 4),
    pass: blockers.length === 0,
    status: insufficientSample ? 'insufficient_sample' : blockers.length ? (blockers.length <= 2 ? 'watch' : 'breach') : 'aligned',
    blockers
  };
}

function aggregateByKey(rows = [], key = 'strategy_id', fallback = 'unknown', thresholds = DEFAULT_THRESHOLD_PROFILE) {
  const groups = new Map();
  for (const row of rows) {
    const groupKey = row?.[key] || fallback;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  }

  return Array.from(groups.entries())
    .map(([group, list]) => {
      const matched = list.filter((row) => row.status === 'aligned' || row.status === 'watch' || row.status === 'breach');
      const replayTriggered = list.filter((row) => row.replay_triggered);
      const actualExecuted = list.filter((row) => row.actual_executed);
      const fillValues = matched.map((row) => safe(row.fill_gap_bps, NaN)).filter(Number.isFinite).map(Math.abs);
      const pnlValues = matched.map((row) => safe(row.pnl_gap_pct, NaN)).filter(Number.isFinite).map(Math.abs);
      const holdValues = matched.map((row) => safe(row.hold_gap_days, NaN)).filter(Number.isFinite).map(Math.abs);
      const matchedCount = matched.length;
      const captureRate = replayTriggered.length ? matchedCount / replayTriggered.length : 0;
      const summary = {
        [key]: group,
        matched_trade_count: matchedCount,
        replay_triggered_count: replayTriggered.length,
        actual_trade_count: actualExecuted.length,
        capture_rate: round(captureRate, 6),
        avg_abs_fill_gap_bps: fillValues.length ? round(mean(fillValues), 6) : null,
        avg_abs_pnl_gap_pct: pnlValues.length ? round(mean(pnlValues), 6) : null,
        avg_abs_hold_gap_days: holdValues.length ? round(mean(holdValues), 6) : null,
        breach_count: matched.filter((row) => row.status === 'breach').length,
        watch_count: matched.filter((row) => row.status === 'watch').length,
        status:
          matchedCount < safe(thresholds.min_matched_trades, 0)
            ? 'insufficient_sample'
            : matched.some((row) => row.status === 'breach')
              ? 'breach'
              : matched.some((row) => row.status === 'watch')
                ? 'watch'
                : 'aligned',
        blockers: []
      };
      if (summary.status === 'insufficient_sample') summary.blockers.push('insufficient_execution_tracking_sample');
      if ((summary.avg_abs_fill_gap_bps ?? 0) > safe(thresholds.max_avg_abs_fill_gap_bps, Infinity)) {
        summary.blockers.push('fill_gap_discipline');
      }
      if ((summary.avg_abs_pnl_gap_pct ?? 0) > safe(thresholds.max_avg_abs_pnl_gap_pct, Infinity)) {
        summary.blockers.push('pnl_tracking_error');
      }
      if (summary.capture_rate < safe(thresholds.min_capture_rate, 0)) {
        summary.blockers.push('capture_rate_shortfall');
      }
      return summary;
    })
    .sort((a, b) => {
      if (b.breach_count !== a.breach_count) return b.breach_count - a.breach_count;
      return safe(b.matched_trade_count, 0) - safe(a.matched_trade_count, 0);
    });
}

export function buildExecutionDriftMonitor({
  asOf = new Date().toISOString(),
  replayValidation = {},
  trades = [],
  signals = [],
  thresholds = {}
} = {}) {
  const thresholdProfile = {
    ...DEFAULT_THRESHOLD_PROFILE,
    ...(thresholds || {})
  };
  const replayRows = normalizeReplayRows(replayValidation, signals);
  const actualTrades = normalizeActualTrades(trades, signals);
  const reconciliationRows = buildReconciliations(replayRows, actualTrades, thresholdProfile);
  const summary = summarizeRows(reconciliationRows, replayRows, actualTrades, thresholdProfile);
  const byStrategy = aggregateByKey(reconciliationRows, 'strategy_id', 'unknown', thresholdProfile);
  const byMarket = aggregateByKey(reconciliationRows, 'market', 'unknown', thresholdProfile);
  const bySource = aggregateByKey(reconciliationRows, 'source', 'unknown', thresholdProfile);
  const strategySummaryById = Object.fromEntries(byStrategy.map((row) => [row.strategy_id, row]));

  return {
    generated_at: asOf,
    monitor_version: 'execution-drift-monitor.v1',
    thresholds: thresholdProfile,
    summary,
    institutional_gate: {
      status: summary.status,
      pass: summary.pass,
      score: summary.score,
      blockers: summary.blockers,
      checks: summary.checks
    },
    coverage: {
      replay_days: [...new Set(replayRows.map((row) => isoDay(row.signal_time)).filter(Boolean))].length,
      actual_days: [...new Set(actualTrades.map((row) => isoDay(row.time_in)).filter(Boolean))].length,
      matched_trade_count: summary.matched_trade_count,
      capture_rate: summary.capture_rate
    },
    by_strategy: byStrategy,
    by_market: byMarket,
    by_source: bySource,
    strategy_summary_by_id: strategySummaryById,
    reconciliation_rows: reconciliationRows,
    notes: [
      'Exact signal_id alignment is preferred; symbol/side/time fuzzy matching is used as a fallback.',
      'BACKTEST-sourced trades are excluded from execution drift scoring.',
      'Institutional gate focuses on capture rate plus fill/PnL/holding-period tracking error.'
    ]
  };
}

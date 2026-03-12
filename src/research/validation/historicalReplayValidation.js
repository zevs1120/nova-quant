import { clamp, maxDrawdownFromCurve, mean, round } from '../../engines/math.js';
import {
  FILL_POLICIES,
  adjustPriceForExecution,
  applyScenarioToProfile,
  buildExecutionSensitivityScenarios,
  resolveExecutionAssumptions,
  resolveExecutionRealismProfile
} from './executionRealismModel.js';

const DEFAULT_REPLAY_CONFIG = Object.freeze({
  forward_horizons: [1, 2, 3, 5],
  intrabar_priority: 'stop_first',
  entry_fill_model: FILL_POLICIES.BAR_CROSS_BASED,
  exit_fill_model: FILL_POLICIES.CONSERVATIVE_FILL,
  max_hold_bars_default: 8,
  max_recorded_drawdown_points: 32,
  execution_realism_mode: 'replay',
  include_test_only_scenarios: false
});

const ACTIVE_SIGNAL_STATUS = new Set(['NEW', 'TRIGGERED']);

function isoDate(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function safe(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizedBars(instruments = []) {
  const bySymbol = new Map();
  for (const row of instruments || []) {
    const symbol = String(row?.ticker || row?.symbol || '').toUpperCase();
    if (!symbol) continue;
    const bars = (row?.bars || [])
      .map((bar) => ({
        date: String(bar?.date || ''),
        open: safe(bar?.open),
        high: safe(bar?.high),
        low: safe(bar?.low),
        close: safe(bar?.close),
        volume: safe(bar?.volume)
      }))
      .filter((bar) => bar.date && Number.isFinite(bar.close) && bar.close > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (!bars.length) continue;
    bySymbol.set(symbol, {
      symbol,
      market: row?.market || 'US',
      asset_class: row?.asset_class || (row?.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK'),
      bars
    });
  }
  return bySymbol;
}

function findBarIndexAtOrAfter(bars = [], date) {
  if (!bars.length || !date) return -1;
  for (let i = 0; i < bars.length; i += 1) {
    if (String(bars[i].date) >= String(date)) return i;
  }
  return -1;
}

function findBarIndexAtOrBefore(bars = [], date) {
  if (!bars.length || !date) return -1;
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    if (String(bars[i].date) <= String(date)) return i;
  }
  return -1;
}

function entryBounds(signal = {}) {
  const low = safe(signal?.entry_zone?.low ?? signal?.entry_min, NaN);
  const high = safe(signal?.entry_zone?.high ?? signal?.entry_max, NaN);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) return null;
  return {
    low: Math.min(low, high),
    high: Math.max(low, high)
  };
}

function entryTouched(bounds, bar = {}) {
  if (!bounds) return false;
  return safe(bar.low, Infinity) <= bounds.high && safe(bar.high, -Infinity) >= bounds.low;
}

function entryTriggered({ bounds, bar, direction, model }) {
  if (!bounds || !bar) return false;
  const isShort = String(direction || '').toUpperCase() === 'SHORT';

  if (model === FILL_POLICIES.TOUCH_BASED || model === FILL_POLICIES.OPTIMISTIC_FILL) {
    return entryTouched(bounds, bar);
  }

  if (model === FILL_POLICIES.BAR_CROSS_BASED) {
    return isShort ? safe(bar.low, Infinity) <= bounds.low : safe(bar.high, -Infinity) >= bounds.high;
  }

  if (model === FILL_POLICIES.CONSERVATIVE_FILL) {
    return isShort
      ? safe(bar.low, Infinity) <= bounds.low && safe(bar.close, Infinity) <= bounds.low
      : safe(bar.high, -Infinity) >= bounds.high && safe(bar.close, -Infinity) >= bounds.high;
  }

  return entryTouched(bounds, bar);
}

function referenceEntryPrice({ bounds, bar, direction, model }) {
  if (!bounds || !bar) return NaN;
  const isShort = String(direction || '').toUpperCase() === 'SHORT';

  if (model === FILL_POLICIES.OPTIMISTIC_FILL) {
    if (isShort) return clamp(safe(bar.high, bounds.high), bounds.low, safe(bar.high, bounds.high));
    return clamp(safe(bar.low, bounds.low), safe(bar.low, bounds.low), bounds.high);
  }

  if (model === FILL_POLICIES.BAR_CROSS_BASED) {
    return isShort ? bounds.low : bounds.high;
  }

  if (model === FILL_POLICIES.CONSERVATIVE_FILL) {
    return isShort
      ? clamp(Math.min(bounds.low, safe(bar.close, bounds.low)), safe(bar.low, bounds.low), bounds.high)
      : clamp(Math.max(bounds.high, safe(bar.close, bounds.high)), bounds.low, safe(bar.high, bounds.high));
  }

  return clamp((bounds.low + bounds.high) / 2, safe(bar.low, bounds.low), safe(bar.high, bounds.high));
}

function horizonBars(signal = {}, cfg = DEFAULT_REPLAY_CONFIG) {
  const horizon = safe(signal.holding_horizon_days, 0);
  if (horizon > 0) return Math.max(1, Math.round(horizon));
  return safe(cfg.max_hold_bars_default, 8);
}

function stopPrice(signal = {}) {
  const raw = safe(signal?.stop_loss?.price ?? signal?.stop_loss_value ?? signal?.stop_loss, NaN);
  return Number.isFinite(raw) && raw > 0 ? raw : NaN;
}

function takeProfitPrice(signal = {}) {
  const first = signal?.take_profit_levels?.[0]?.price;
  const raw = safe(first ?? signal?.take_profit, NaN);
  return Number.isFinite(raw) && raw > 0 ? raw : NaN;
}

function recordForwardPath({ signal, bars, startIdx, horizons }) {
  if (!bars.length || startIdx < 0 || startIdx >= bars.length) {
    return {
      forward_1: 0,
      forward_2: 0,
      forward_3: 0,
      forward_5: 0,
      max_drawdown_proxy: 0,
      source: 'missing_bars'
    };
  }

  const reference = safe(signal?.entry_zone?.high ?? signal?.entry_zone?.low ?? bars[startIdx].close, bars[startIdx].close);
  const closes = [];
  const out = {};

  for (const h of horizons || [1, 2, 3, 5]) {
    const idx = Math.min(bars.length - 1, startIdx + h);
    const close = safe(bars[idx]?.close, reference);
    closes.push(close);
    out[`forward_${h}`] = round(reference ? close / reference - 1 : 0, 6);
  }

  const curve = [1];
  for (const close of closes) {
    curve.push(curve[curve.length - 1] * (1 + (reference ? close / reference - 1 : 0)));
  }

  return {
    forward_1: out.forward_1 ?? 0,
    forward_2: out.forward_2 ?? 0,
    forward_3: out.forward_3 ?? 0,
    forward_5: out.forward_5 ?? 0,
    max_drawdown_proxy: round(maxDrawdownFromCurve(curve) * -1, 6),
    source: 'historical_bar_replay'
  };
}

function shouldBlockSignal({ signal, riskDecision, noTradeReason }) {
  if (!ACTIVE_SIGNAL_STATUS.has(String(signal?.status || '').toUpperCase())) {
    return {
      blocked: true,
      reason: 'inactive_signal_status'
    };
  }

  if (noTradeReason) {
    return {
      blocked: true,
      reason: noTradeReason
    };
  }

  if (riskDecision?.decision === 'blocked') {
    return {
      blocked: true,
      reason: 'risk_blocked'
    };
  }

  return {
    blocked: false,
    reason: null
  };
}

function estimateMarkReturn(direction, entryPx, barClose) {
  if (!entryPx || !Number.isFinite(entryPx)) return 0;
  const move = safe(barClose) / entryPx - 1;
  return String(direction || '').toUpperCase() === 'SHORT' ? -move : move;
}

function tradeExitCheck({ signal, bar, stop, takeProfit, intrabarPriority }) {
  const isShort = String(signal?.direction || '').toUpperCase() === 'SHORT';

  const stopHit = Number.isFinite(stop)
    ? isShort
      ? safe(bar.high, -Infinity) >= stop
      : safe(bar.low, Infinity) <= stop
    : false;

  const targetHit = Number.isFinite(takeProfit)
    ? isShort
      ? safe(bar.low, Infinity) <= takeProfit
      : safe(bar.high, -Infinity) >= takeProfit
    : false;

  if (stopHit && targetHit) {
    return {
      exit_type: intrabarPriority === 'target_first' ? 'take_profit' : 'stop_loss',
      both_touched_same_bar: true
    };
  }
  if (stopHit) return { exit_type: 'stop_loss', both_touched_same_bar: false };
  if (targetHit) return { exit_type: 'take_profit', both_touched_same_bar: false };
  return { exit_type: null, both_touched_same_bar: false };
}

function summarizeTrades(trades = []) {
  const triggered = trades.filter((row) => row.replay_entry_event?.triggered);
  const closed = triggered.filter((row) => row.replay_exit_event?.exit_type);
  const wins = closed.filter((row) => safe(row.realized_pnl_pct) > 0);

  const netReturns = closed.map((row) => safe(row.realized_pnl_pct));
  const equity = [1];
  for (const r of netReturns) {
    equity.push(equity[equity.length - 1] * (1 + r));
  }

  return {
    total_signals: trades.length,
    triggered_trades: triggered.length,
    closed_trades: closed.length,
    trigger_rate: trades.length ? round(triggered.length / trades.length, 4) : 0,
    win_rate: closed.length ? round(wins.length / closed.length, 4) : 0,
    avg_realized_pnl_pct: closed.length ? round(mean(netReturns), 6) : 0,
    avg_holding_bars: closed.length ? round(mean(closed.map((row) => safe(row.realized_holding_duration?.bars))), 4) : 0,
    max_drawdown_from_trade_sequence: round(maxDrawdownFromCurve(equity), 6)
  };
}

function groupStats(rows = [], key) {
  const bucket = new Map();
  for (const row of rows || []) {
    const group = String(row?.[key] || 'unknown');
    const current = bucket.get(group) || [];
    current.push(row);
    bucket.set(group, current);
  }

  return Array.from(bucket.entries()).map(([group, list]) => {
    const triggered = list.filter((row) => row.replay_entry_event?.triggered);
    const closed = triggered.filter((row) => row.replay_exit_event?.exit_type);
    const pnl = closed.map((row) => safe(row.realized_pnl_pct));
    const drawdowns = closed.map((row) => Math.abs(safe(row.drawdown_summary?.max_drawdown_pct || 0)));
    return {
      [key]: group,
      signals: list.length,
      triggered_trades: triggered.length,
      closed_trades: closed.length,
      win_rate: closed.length ? round(closed.filter((row) => safe(row.realized_pnl_pct) > 0).length / closed.length, 4) : 0,
      avg_trade_return_post_cost: pnl.length ? round(mean(pnl), 6) : 0,
      avg_drawdown_abs: drawdowns.length ? round(mean(drawdowns), 6) : 0,
      avg_holding_bars: closed.length ? round(mean(closed.map((row) => safe(row.realized_holding_duration?.bars))), 4) : 0
    };
  });
}

function aggregateDaily(records = [], regimeState = {}, allDates = []) {
  const map = new Map();
  const regime = regimeState?.state?.combined || regimeState?.state?.primary || 'unknown';

  const ensure = (date) => {
    const key = String(date || 'unknown');
    if (!map.has(key)) {
      map.set(key, {
        date: key,
        regime,
        pre_cost_return: 0,
        post_cost_return: 0,
        turnover: 0,
        gross_exposure_pct: 0,
        net_exposure_pct: 0,
        trades_triggered: 0,
        trades_closed: 0
      });
    }
    return map.get(key);
  };

  for (const date of allDates || []) {
    ensure(date);
  }

  for (const row of records || []) {
    const size = safe(row.position_size_pct, 0) / 100;
    if (!row.replay_entry_event?.triggered || !row.replay_entry_event?.entry_time) continue;

    const entryDate = isoDate(row.replay_entry_event.entry_time);
    const exitDate = isoDate(row.replay_exit_event?.exit_time);
    const direction = String(row.direction || '').toUpperCase() === 'SHORT' ? -1 : 1;

    if (entryDate) {
      const day = ensure(entryDate);
      day.turnover += size;
      day.trades_triggered += 1;
    }

    if (exitDate) {
      const day = ensure(exitDate);
      day.turnover += size;
      day.trades_closed += 1;
      day.pre_cost_return += safe(row.realized_pnl_pre_cost_pct) * size;
      day.post_cost_return += safe(row.realized_pnl_pct) * size;
    }

    for (const p of row.drawdown_path || []) {
      if (!p?.date) continue;
      const day = ensure(p.date);
      day.gross_exposure_pct += size * 100;
      day.net_exposure_pct += direction * size * 100;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((row) => ({
      ...row,
      pre_cost_return: round(row.pre_cost_return, 6),
      post_cost_return: round(row.post_cost_return, 6),
      turnover: round(row.turnover * 100, 4),
      gross_exposure_pct: round(row.gross_exposure_pct, 4),
      net_exposure_pct: round(row.net_exposure_pct, 4)
    }));
}

function replaySignal({
  signal,
  instrument,
  riskDecision,
  noTradeReason,
  regimeState,
  cfg,
  executionProfile
}) {
  const signalTime = signal?.created_at || signal?.generated_at;
  const signalDate = isoDate(signalTime);
  const lifecycle = [];

  lifecycle.push({
    event_order: 1,
    event_type: 'signal_formed',
    event_time: signalTime,
    event_date: signalDate,
    details: {
      signal_id: signal.signal_id,
      symbol: signal.symbol,
      status: signal.status,
      regime_state: regimeState?.state?.primary || 'unknown'
    }
  });

  const barPack = instrument || null;
  const bars = barPack?.bars || [];
  const startIdxRaw = findBarIndexAtOrAfter(bars, signalDate);
  const startIdx = startIdxRaw >= 0 ? startIdxRaw : findBarIndexAtOrBefore(bars, signalDate);
  const startBar = startIdx >= 0 ? bars[startIdx] : {};
  const baselineAssumption = resolveExecutionAssumptions({
    profile: executionProfile,
    signal: { ...signal, market: signal?.market || barPack?.market || 'US' },
    bar: startBar,
    mode: 'replay',
    fillPolicy: {
      entry: cfg.entry_fill_model,
      exit: cfg.exit_fill_model
    }
  });

  const fwd = recordForwardPath({ signal, bars, startIdx, horizons: cfg.forward_horizons });

  const blocked = shouldBlockSignal({ signal, riskDecision, noTradeReason });
  lifecycle.push({
    event_order: 2,
    event_type: blocked.blocked ? 'signal_filtered' : 'signal_filter_passed',
    event_time: signalTime,
    event_date: signalDate,
    details: {
      reason: blocked.reason || null,
      risk_decision: riskDecision?.decision || 'allow',
      no_trade_reason: noTradeReason || null
    }
  });

  const baseRecord = {
    signal_id: signal.signal_id,
    strategy_id: signal.strategy_id,
    strategy_family: signal.strategy_family,
    symbol: signal.symbol,
    market: signal.market,
    direction: signal.direction,
    signal_time: signalTime,
    signal_date: signalDate,
    regime_state: regimeState?.state?.primary || 'unknown',
    regime_posture: regimeState?.state?.recommended_user_posture || '--',
    filter_reason: blocked.reason,
    would_trigger: false,
    replay_entry_event: {
      triggered: false,
      event_type: 'entry_not_evaluated',
      entry_time: null,
      entry_price: null,
      bar_index: null,
      reason: blocked.blocked ? blocked.reason : 'pending'
    },
    replay_exit_event: {
      exit_type: null,
      exit_time: null,
      exit_price: null,
      bar_index: null,
      reason: blocked.blocked ? blocked.reason : 'pending'
    },
    fill_assumption_used: {
      entry_fill_model: baselineAssumption.fill_policy.entry,
      exit_fill_model: baselineAssumption.fill_policy.exit,
      intrabar_priority: cfg.intrabar_priority,
      limit_touch_rule: 'touch_entry_zone'
    },
    slippage_assumption_used: {
      market: baselineAssumption.market,
      volatility_bucket: baselineAssumption.volatility_bucket,
      entry_bps: baselineAssumption.entry_slippage_bps,
      exit_bps: baselineAssumption.exit_slippage_bps,
      spread_bps: baselineAssumption.spread_bps,
      fee_bps: baselineAssumption.fee_bps_per_side,
      funding_bps_per_day: baselineAssumption.funding_bps_per_day
    },
    assumption_profile: {
      profile_id: baselineAssumption.profile_id,
      mode: baselineAssumption.mode,
      scenario: executionProfile?.assumption_scenario || 'baseline'
    },
    realized_holding_duration: {
      bars: 0,
      days: 0
    },
    position_size_pct: safe(signal?.position_advice?.position_pct ?? signal?.position_size_pct, 0),
    realized_pnl_pre_cost_pct: 0,
    realized_pnl_pct: 0,
    cost_realism_notes: baselineAssumption.realism_notes || [],
    fill_realism_notes: [`Entry policy=${baselineAssumption.fill_policy.entry}`, `Exit policy=${baselineAssumption.fill_policy.exit}`],
    funding_realism_notes: [
      baselineAssumption.market === 'CRYPTO'
        ? `Funding drag modeled at ${baselineAssumption.funding_bps_per_day} bps/day.`
        : 'No funding drag applied for US equities.'
    ],
    drawdown_path: [],
    drawdown_summary: {
      max_drawdown_pct: 0,
      source: 'not_triggered'
    },
    trade_triggered: false,
    trigger_window: {
      start_date: signalDate,
      end_date: signalDate
    },
    forward_performance: fwd,
    lifecycle_events: lifecycle
  };

  if (blocked.blocked) {
    return baseRecord;
  }

  if (!bars.length || startIdx < 0) {
    const out = {
      ...baseRecord,
      filter_reason: 'missing_market_data',
      replay_entry_event: {
        ...baseRecord.replay_entry_event,
        reason: 'missing_market_data',
        event_type: 'entry_not_evaluated'
      }
    };
    out.lifecycle_events = [
      ...lifecycle,
      {
        event_order: 3,
        event_type: 'replay_skipped',
        event_time: signalTime,
        event_date: signalDate,
        details: { reason: 'missing_market_data' }
      }
    ];
    return out;
  }

  const expiresDate = isoDate(signal?.expires_at) || null;
  const horizon = horizonBars(signal, cfg);
  const naturalEndIdx = Math.min(bars.length - 1, startIdx + horizon);
  const expiryIdx = expiresDate ? findBarIndexAtOrBefore(bars, expiresDate) : naturalEndIdx;
  const endIdx = expiryIdx >= startIdx ? Math.min(naturalEndIdx, expiryIdx) : naturalEndIdx;

  const bounds = entryBounds(signal);
  if (!bounds) {
    const out = {
      ...baseRecord,
      filter_reason: 'invalid_entry_zone',
      replay_entry_event: {
        ...baseRecord.replay_entry_event,
        reason: 'invalid_entry_zone',
        event_type: 'entry_not_evaluated'
      }
    };
    out.lifecycle_events = [
      ...lifecycle,
      {
        event_order: 3,
        event_type: 'replay_skipped',
        event_time: signalTime,
        event_date: signalDate,
        details: { reason: 'invalid_entry_zone' }
      }
    ];
    return out;
  }

  let entryIdx = -1;
  let entryPrice = NaN;
  let entryAssumption = baselineAssumption;

  for (let i = startIdx; i <= endIdx; i += 1) {
    const bar = bars[i];
    if (!entryTriggered({
      bounds,
      bar,
      direction: signal.direction,
      model: baselineAssumption.fill_policy.entry
    })) {
      continue;
    }

    entryAssumption = resolveExecutionAssumptions({
      profile: executionProfile,
      signal: { ...signal, market: signal?.market || barPack?.market || 'US' },
      bar,
      mode: 'replay',
      fillPolicy: baselineAssumption.fill_policy
    });

    entryIdx = i;
    const assumed = referenceEntryPrice({
      bounds,
      bar,
      direction: signal.direction,
      model: entryAssumption.fill_policy.entry
    });
    entryPrice = adjustPriceForExecution({
      price: assumed,
      direction: signal.direction,
      side: 'entry',
      slippageBps: entryAssumption.entry_slippage_bps,
      spreadBps: entryAssumption.spread_bps
    });
    break;
  }

  if (entryIdx < 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
    const out = {
      ...baseRecord,
      replay_entry_event: {
        triggered: false,
        event_type: 'entry_not_triggered',
        entry_time: null,
        entry_price: null,
        bar_index: null,
        reason: 'entry_zone_not_touched'
      },
      replay_exit_event: {
        exit_type: 'not_triggered',
        exit_time: null,
        exit_price: null,
        bar_index: null,
        reason: 'entry_zone_not_touched'
      },
      trigger_window: {
        start_date: bars[startIdx]?.date || signalDate,
        end_date: bars[endIdx]?.date || signalDate
      }
    };

    out.lifecycle_events = [
      ...lifecycle,
      {
        event_order: 3,
        event_type: 'entry_not_triggered',
        event_time: signalTime,
        event_date: bars[endIdx]?.date || signalDate,
        details: { reason: 'entry_zone_not_touched', trigger_window_end: bars[endIdx]?.date || signalDate }
      }
    ];
    return out;
  }

  const stop = stopPrice(signal);
  const tp1 = takeProfitPrice(signal);

  let exitIdx = endIdx;
  let exitType = 'expiry';
  let exitRawPrice = safe(bars[endIdx]?.close, entryPrice);
  let bothTouchedSameBar = false;

  const drawdownPath = [];
  for (let i = entryIdx; i <= endIdx; i += 1) {
    const bar = bars[i];
    const mtm = estimateMarkReturn(signal.direction, entryPrice, bar.close);
    drawdownPath.push({ date: bar.date, mtm_return_pct: round(mtm, 6) });

    const check = tradeExitCheck({
      signal,
      bar,
      stop,
      takeProfit: tp1,
      intrabarPriority: cfg.intrabar_priority
    });

    if (!check.exit_type) continue;
    exitIdx = i;
    exitType = check.exit_type;
    bothTouchedSameBar = check.both_touched_same_bar;
    if (exitType === 'stop_loss' && Number.isFinite(stop)) {
      exitRawPrice = stop;
    } else if (exitType === 'take_profit' && Number.isFinite(tp1)) {
      exitRawPrice = tp1;
    }
    break;
  }

  const exitBar = bars[exitIdx] || bars[endIdx] || startBar;
  const exitAssumption = resolveExecutionAssumptions({
    profile: executionProfile,
    signal: { ...signal, market: signal?.market || barPack?.market || 'US' },
    bar: exitBar,
    mode: 'replay',
    fillPolicy: entryAssumption.fill_policy
  });

  const exitPrice = adjustPriceForExecution({
    price: exitRawPrice,
    direction: signal.direction,
    side: 'exit',
    slippageBps: exitAssumption.exit_slippage_bps,
    spreadBps: exitAssumption.spread_bps
  });

  const grossReturn = estimateMarkReturn(signal.direction, entryPrice, exitPrice);
  const feeDrag = ((safe(entryAssumption.fee_bps_per_side, 0) + safe(exitAssumption.fee_bps_per_side, 0)) / 10000);

  const entryDate = bars[entryIdx]?.date || signalDate;
  const exitDate = bars[exitIdx]?.date || signalDate;
  const holdingBars = Math.max(1, exitIdx - entryIdx + 1);
  const days = (() => {
    const a = new Date(`${entryDate}T00:00:00.000Z`);
    const b = new Date(`${exitDate}T00:00:00.000Z`);
    if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return holdingBars;
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  })();

  const fundingBpsPerDay = (safe(entryAssumption.funding_bps_per_day, 0) + safe(exitAssumption.funding_bps_per_day, 0)) / 2;
  const fundingDrag = (fundingBpsPerDay / 10000) * days;
  const netReturn = grossReturn - feeDrag - fundingDrag;

  const pathCurve = [1];
  for (const p of drawdownPath) {
    pathCurve.push(1 + safe(p.mtm_return_pct));
  }
  const maxDd = round(maxDrawdownFromCurve(pathCurve), 6);
  const clippedPath = drawdownPath.slice(0, safe(cfg.max_recorded_drawdown_points, 32));

  const out = {
    ...baseRecord,
    filter_reason: null,
    would_trigger: true,
    trade_triggered: true,
    replay_entry_event: {
      triggered: true,
      event_type: 'entry_triggered',
      entry_time: `${entryDate}T00:00:00.000Z`,
      entry_price: round(entryPrice, 6),
      bar_index: entryIdx,
      reason: 'entry_zone_touched'
    },
    replay_exit_event: {
      exit_type: exitType,
      exit_time: `${exitDate}T00:00:00.000Z`,
      exit_price: round(exitPrice, 6),
      bar_index: exitIdx,
      reason: exitType === 'expiry' ? 'expiry_or_horizon_reached' : exitType,
      both_touched_same_bar: bothTouchedSameBar
    },
    fill_assumption_used: {
      entry_fill_model: entryAssumption.fill_policy.entry,
      exit_fill_model: exitAssumption.fill_policy.exit,
      intrabar_priority: cfg.intrabar_priority,
      limit_touch_rule: 'touch_entry_zone'
    },
    slippage_assumption_used: {
      market: entryAssumption.market,
      volatility_bucket: entryAssumption.volatility_bucket,
      entry_bps: entryAssumption.entry_slippage_bps,
      exit_bps: exitAssumption.exit_slippage_bps,
      spread_bps: round((safe(entryAssumption.spread_bps) + safe(exitAssumption.spread_bps)) / 2, 6),
      fee_bps: round((safe(entryAssumption.fee_bps_per_side) + safe(exitAssumption.fee_bps_per_side)) / 2, 6),
      funding_bps_per_day: round(fundingBpsPerDay, 6)
    },
    assumption_profile: {
      profile_id: entryAssumption.profile_id,
      mode: entryAssumption.mode,
      scenario: executionProfile?.assumption_scenario || 'baseline'
    },
    realized_holding_duration: {
      bars: holdingBars,
      days
    },
    realized_pnl_pre_cost_pct: round(grossReturn, 6),
    realized_pnl_pct: round(netReturn, 6),
    drawdown_path: clippedPath,
    drawdown_summary: {
      max_drawdown_pct: round(maxDd * -1, 6),
      source: 'bar_close_mark_to_market'
    },
    trigger_window: {
      start_date: bars[startIdx]?.date || signalDate,
      end_date: bars[endIdx]?.date || signalDate
    },
    cost_realism_notes: entryAssumption.realism_notes || [],
    fill_realism_notes: [`Entry policy=${entryAssumption.fill_policy.entry}`, `Exit policy=${exitAssumption.fill_policy.exit}`],
    funding_realism_notes: [
      entryAssumption.market === 'CRYPTO'
        ? `Funding drag applied: ${round(fundingDrag, 6)} return units over ${days} day(s).`
        : 'No funding drag applied for US equities.'
    ]
  };

  out.lifecycle_events = [
    ...lifecycle,
    {
      event_order: 3,
      event_type: 'entry_triggered',
      event_time: out.replay_entry_event.entry_time,
      event_date: entryDate,
      details: {
        entry_price: out.replay_entry_event.entry_price,
        entry_model: entryAssumption.fill_policy.entry,
        slippage_bps: out.slippage_assumption_used.entry_bps,
        spread_bps: out.slippage_assumption_used.spread_bps
      }
    },
    {
      event_order: 4,
      event_type: 'position_closed',
      event_time: out.replay_exit_event.exit_time,
      event_date: exitDate,
      details: {
        exit_type: exitType,
        exit_price: out.replay_exit_event.exit_price,
        pnl_post_cost_pct: out.realized_pnl_pct,
        holding_bars: holdingBars,
        intrabar_priority: cfg.intrabar_priority,
        funding_drag_pct: round(fundingDrag, 6)
      }
    }
  ];

  return out;
}

function toOutcomeMap(records = []) {
  return Object.fromEntries(
    (records || []).map((row) => [
      row.signal_id,
      {
        signal_id: row.signal_id,
        trade_triggered: row.trade_triggered,
        replay_entry_event: row.replay_entry_event,
        replay_exit_event: row.replay_exit_event,
        realized_pnl_pct: row.realized_pnl_pct,
        drawdown_summary: row.drawdown_summary,
        forward_performance: row.forward_performance
      }
    ])
  );
}

function replayPass({
  orderedSignals = [],
  barMap = new Map(),
  riskBySignal = new Map(),
  noTradeReasonBySignal = new Map(),
  regimeState = {},
  cfg = DEFAULT_REPLAY_CONFIG,
  executionProfile = {},
  includeSignals = true
} = {}) {
  const records = orderedSignals.map((signal) => {
    const symbol = String(signal?.symbol || '').toUpperCase();
    const instrument = barMap.get(symbol) || null;
    return replaySignal({
      signal,
      instrument,
      riskDecision: riskBySignal.get(signal.signal_id),
      noTradeReason: noTradeReasonBySignal.get(signal.signal_id),
      regimeState,
      cfg,
      executionProfile
    });
  });

  const closedTrades = records.filter((row) => row.replay_entry_event?.triggered && row.replay_exit_event?.exit_type);
  const dates = [...new Set(
    orderedSignals
      .map((signal) => barMap.get(String(signal?.symbol || '').toUpperCase())?.bars || [])
      .flat()
      .map((bar) => bar?.date)
      .filter(Boolean)
  )].sort((a, b) => String(a).localeCompare(String(b)));

  const daily = aggregateDaily(records, regimeState, dates);
  const summary = summarizeTrades(records);

  return {
    summary,
    daily_aggregate: daily,
    market_replay_benchmarks: groupStats(closedTrades, 'market'),
    family_replay_benchmarks: groupStats(closedTrades, 'strategy_family'),
    strategy_replay_benchmarks: groupStats(closedTrades, 'strategy_id'),
    signal_outcome_map: toOutcomeMap(records),
    replayed_signals: includeSignals ? records : undefined
  };
}

function scenarioRows({
  orderedSignals,
  barMap,
  riskBySignal,
  noTradeReasonBySignal,
  regimeState,
  cfg,
  baselineProfile
}) {
  const scenarios = buildExecutionSensitivityScenarios(baselineProfile)
    .filter((item) => item.scenario_id !== 'baseline')
    .filter((item) => cfg.include_test_only_scenarios || !item.test_only);

  const rows = [];
  for (const scenario of scenarios) {
    const scenarioProfile = applyScenarioToProfile(baselineProfile, scenario);
    const out = replayPass({
      orderedSignals,
      barMap,
      riskBySignal,
      noTradeReasonBySignal,
      regimeState,
      cfg: {
        ...cfg,
        entry_fill_model: scenario.fill_policy_override?.entry || cfg.entry_fill_model,
        exit_fill_model: scenario.fill_policy_override?.exit || cfg.exit_fill_model
      },
      executionProfile: scenarioProfile,
      includeSignals: false
    });

    rows.push({
      scenario_id: scenario.scenario_id,
      label: scenario.label,
      assumption_profile: {
        profile_id: scenarioProfile.profile_id,
        mode: scenarioProfile.mode,
        scenario: scenario.scenario_id
      },
      summary: out.summary
    });
  }

  return rows;
}

function legacyExecutionOverrides(config = {}) {
  const overrides = { markets: {} };

  for (const [market, v] of Object.entries(config?.fee_bps || {})) {
    const key = String(market || '').toUpperCase();
    if (!overrides.markets[key]) overrides.markets[key] = {};
    overrides.markets[key].fee_bps_per_side = safe(v, undefined);
  }

  for (const [market, row] of Object.entries(config?.slippage_bps || {})) {
    const key = String(market || '').toUpperCase();
    if (!overrides.markets[key]) overrides.markets[key] = {};
    overrides.markets[key].slippage_bps_by_vol_bucket = {
      low: { entry: safe(row?.entry, 4), exit: safe(row?.exit, 4) },
      normal: { entry: safe(row?.entry, 4), exit: safe(row?.exit, 4) },
      high: { entry: safe(row?.entry, 4), exit: safe(row?.exit, 4) },
      stress: { entry: safe(row?.entry, 4), exit: safe(row?.exit, 4) }
    };
  }

  return overrides;
}

export function buildHistoricalReplayValidation({
  asOf = new Date().toISOString(),
  championState = {},
  regimeState = {},
  riskBucketSystem = {},
  funnelDiagnostics = {},
  config = {}
} = {}) {
  const cfg = {
    ...DEFAULT_REPLAY_CONFIG,
    ...config
  };

  const executionProfile = resolveExecutionRealismProfile({
    mode: cfg.execution_realism_mode || 'replay',
    profile: cfg.execution_realism_profile || {},
    overrides: {
      ...(config?.execution_realism_overrides || {}),
      ...legacyExecutionOverrides(config)
    }
  });

  const signals = championState?.signals || [];
  const instruments = championState?.layers?.data_layer?.instruments || [];
  const barMap = normalizedBars(instruments);
  const riskBySignal = new Map((riskBucketSystem?.trade_level_buckets || []).map((row) => [row.signal_id, row]));
  const noTradeReasonBySignal = new Map((funnelDiagnostics?.raw_records || [])
    .filter((row) => row?.signal_id)
    .map((row) => [row.signal_id, row.no_trade_reason]));

  const orderedSignals = [...signals].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const baseline = replayPass({
    orderedSignals,
    barMap,
    riskBySignal,
    noTradeReasonBySignal,
    regimeState,
    cfg,
    executionProfile,
    includeSignals: true
  });

  const sensitivity = scenarioRows({
    orderedSignals,
    barMap,
    riskBySignal,
    noTradeReasonBySignal,
    regimeState,
    cfg,
    baselineProfile: executionProfile
  }).map((row) => ({
    ...row,
    delta_vs_baseline: {
      trigger_rate: round(safe(row.summary?.trigger_rate) - safe(baseline.summary?.trigger_rate), 6),
      win_rate: round(safe(row.summary?.win_rate) - safe(baseline.summary?.win_rate), 6),
      avg_realized_pnl_pct: round(safe(row.summary?.avg_realized_pnl_pct) - safe(baseline.summary?.avg_realized_pnl_pct), 6)
    }
  }));

  return {
    generated_at: asOf,
    replay_version: 'historical-replay.v2',
    config: cfg,
    assumptions: {
      assumption_profile: {
        profile_id: executionProfile.profile_id,
        mode: executionProfile.mode,
        scenario: 'baseline'
      },
      entry_fill_model: cfg.entry_fill_model,
      exit_fill_model: cfg.exit_fill_model,
      intrabar_priority: cfg.intrabar_priority,
      realism_boundary: 'bar-level replay with intrabar execution ordering assumption; no tick-level queue simulation.'
    },
    summary: baseline.summary,
    market_replay_benchmarks: baseline.market_replay_benchmarks,
    family_replay_benchmarks: baseline.family_replay_benchmarks,
    strategy_replay_benchmarks: baseline.strategy_replay_benchmarks,
    daily_aggregate: baseline.daily_aggregate,
    signal_outcome_map: baseline.signal_outcome_map,
    replayed_signals: baseline.replayed_signals,
    execution_sensitivity: sensitivity,
    notes: [
      'Signal lifecycle is replayed in event order: formation -> filtering -> entry check -> exit evaluation.',
      'Entry/exit include explicit fee/slippage/spread/funding assumptions by market and volatility bucket.',
      'Fill policy supports touch-based, bar-cross-based, conservative, and optional optimistic test mode.'
    ]
  };
}

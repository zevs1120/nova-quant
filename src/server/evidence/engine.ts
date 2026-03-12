import { createHash } from 'node:crypto';
import { MarketRepository } from '../db/repository.js';
import { RUNTIME_STATUS, normalizeRuntimeStatus, type RuntimeStatus } from '../runtimeStatus.js';
import type {
  AssetClass,
  BacktestArtifactRecord,
  BacktestMetricRecord,
  BacktestRunRecord,
  DatasetVersionRecord,
  ExecutionProfileRecord,
  ExperimentRegistryRecord,
  Market,
  ReplayPaperReconciliationRecord,
  SignalContract,
  SignalSnapshotRecord,
  StrategyVersionRecord,
  UniverseSnapshotRecord
} from '../types.js';

type EvidenceRunParams = {
  userId: string;
  market?: Market;
  assetClass?: AssetClass;
  timeframe?: string;
  maxSignals?: number;
  force?: boolean;
};

type ReplayTrade = {
  signal_snapshot_id: string;
  signal_id: string;
  symbol: string;
  market: Market;
  asset_class: AssetClass;
  timeframe: string;
  strategy_id: string;
  strategy_family: string;
  strategy_version_id: string;
  regime_id: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  conviction: number;
  size_pct: number;
  status: RuntimeStatus;
  triggered: boolean;
  entry_ts_ms: number | null;
  entry_price: number | null;
  exit_ts_ms: number | null;
  exit_price: number | null;
  exit_reason: string | null;
  gross_return: number | null;
  net_return: number | null;
  cost_drag: number | null;
  holding_bars: number;
  holding_days: number;
  path: Array<{ date: string; mtm_return: number }>;
};

type ExecutionProfileNormalized = {
  id: string;
  profile_name: string;
  entry_slippage_bps: number;
  exit_slippage_bps: number;
  spread_bps: number;
  fee_bps_per_side: number;
  funding_bps_per_day: number;
  fill_policy: 'touch' | 'bar_cross' | 'conservative';
  latency_ms: number;
  mode: 'baseline' | 'stress';
};

type ReplayAggregate = {
  trades: ReplayTrade[];
  metrics: BacktestMetricRecord;
  daily_equity_curve: Array<{
    date: string;
    pre_cost_return: number;
    post_cost_return: number;
    turnover: number;
    gross_exposure_pct: number;
    net_exposure_pct: number;
    nav: number;
  }>;
  attribution: Record<string, unknown>;
};

type ReconciliationSummary = {
  rows: ReplayPaperReconciliationRecord[];
  summary: {
    total: number;
    reconciled: number;
    paper_unavailable: number;
    replay_unavailable: number;
    partial: number;
    avg_slippage_gap: number | null;
    avg_pnl_gap: number | null;
  };
};

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

function nowMs() {
  return Date.now();
}

function round(value: number, digits = 6): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function dateKey(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}

function timeframeToMs(timeframe: string): number {
  if (timeframe.endsWith('m')) return safeNumber(timeframe.slice(0, -1), 1) * 60_000;
  if (timeframe.endsWith('h')) return safeNumber(timeframe.slice(0, -1), 1) * HOUR_MS;
  if (timeframe.endsWith('d')) return safeNumber(timeframe.slice(0, -1), 1) * DAY_MS;
  return DAY_MS;
}

function toBars(rows: Array<{ ts_open: number; open: string; high: string; low: string; close: string; volume: string }>) {
  return rows
    .map((row) => ({
      ts_open: row.ts_open,
      open: safeNumber(row.open),
      high: safeNumber(row.high),
      low: safeNumber(row.low),
      close: safeNumber(row.close),
      volume: safeNumber(row.volume)
    }))
    .filter((row) => row.ts_open > 0 && row.close > 0)
    .sort((a, b) => a.ts_open - b.ts_open);
}

function adversePrice(price: number, direction: string, side: 'entry' | 'exit', bps: number, spreadBps: number) {
  const totalBps = (safeNumber(bps) + safeNumber(spreadBps) * 0.5) / 10_000;
  const isShort = String(direction).toUpperCase() === 'SHORT';
  if (side === 'entry') {
    if (isShort) return price * (1 - totalBps);
    return price * (1 + totalBps);
  }
  if (isShort) return price * (1 + totalBps);
  return price * (1 - totalBps);
}

function pnlFromPrices(direction: string, entryPrice: number, exitPrice: number): number {
  if (!entryPrice || !Number.isFinite(entryPrice)) return 0;
  const move = exitPrice / entryPrice - 1;
  return String(direction).toUpperCase() === 'SHORT' ? -move : move;
}

function inferSignalStatus(signal: SignalContract): RuntimeStatus {
  const statusTag = (signal.tags || []).find((tag) => String(tag).startsWith('status:'));
  const parsed = statusTag ? String(statusTag).slice(7).toUpperCase() : '';
  if (!parsed) return RUNTIME_STATUS.MODEL_DERIVED;
  return normalizeRuntimeStatus(parsed, RUNTIME_STATUS.MODEL_DERIVED);
}

function evidenceStatusFromSignal(signal: SignalContract): SignalSnapshotRecord['evidence_status'] {
  const status = inferSignalStatus(signal);
  if (status === RUNTIME_STATUS.WITHHELD) return 'WITHHELD';
  if (status === RUNTIME_STATUS.INSUFFICIENT_DATA) return 'INSUFFICIENT_DATA';
  if (status === RUNTIME_STATUS.EXPERIMENTAL) return 'EXPERIMENTAL';
  return 'REPLAY_READY';
}

function normalizeExecutionProfile(row: ExecutionProfileRecord): ExecutionProfileNormalized {
  const spread = JSON.parse(row.spread_model_json) as { bps: number };
  const slip = JSON.parse(row.slippage_model_json) as { entry_bps: number; exit_bps: number };
  const fee = JSON.parse(row.fee_model_json) as { bps_per_side: number; funding_bps_per_day: number };
  const fill = JSON.parse(row.fill_policy_json) as { mode: 'touch' | 'bar_cross' | 'conservative' };
  const latency = JSON.parse(row.latency_assumption_json) as { latency_ms: number };
  return {
    id: row.id,
    profile_name: row.profile_name,
    entry_slippage_bps: safeNumber(slip.entry_bps),
    exit_slippage_bps: safeNumber(slip.exit_bps),
    spread_bps: safeNumber(spread.bps),
    fee_bps_per_side: safeNumber(fee.bps_per_side),
    funding_bps_per_day: safeNumber(fee.funding_bps_per_day),
    fill_policy: fill.mode || 'conservative',
    latency_ms: safeNumber(latency.latency_ms),
    mode: row.profile_name.includes('stress') ? 'stress' : 'baseline'
  };
}

function signalEntryBounds(signal: SignalContract): { low: number; high: number } | null {
  const low = safeNumber(signal.entry_zone?.low, NaN);
  const high = safeNumber(signal.entry_zone?.high, NaN);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function entryTriggered(
  bar: { open: number; high: number; low: number; close: number },
  bounds: { low: number; high: number },
  policy: ExecutionProfileNormalized['fill_policy'],
  direction: string
): boolean {
  if (policy === 'touch') {
    return bar.low <= bounds.high && bar.high >= bounds.low;
  }
  if (policy === 'bar_cross') {
    if (String(direction).toUpperCase() === 'SHORT') return bar.low <= bounds.low;
    return bar.high >= bounds.high;
  }
  if (String(direction).toUpperCase() === 'SHORT') {
    return bar.low <= bounds.low && bar.close <= bounds.low;
  }
  return bar.high >= bounds.high && bar.close >= bounds.high;
}

function chooseEntryPrice(
  bar: { low: number; high: number; close: number },
  bounds: { low: number; high: number },
  policy: ExecutionProfileNormalized['fill_policy'],
  direction: string
): number {
  if (policy === 'bar_cross') return String(direction).toUpperCase() === 'SHORT' ? bounds.low : bounds.high;
  if (policy === 'conservative') return String(direction).toUpperCase() === 'SHORT' ? Math.min(bounds.low, bar.close) : Math.max(bounds.high, bar.close);
  return (bounds.low + bounds.high) / 2;
}

function pickExit(
  bar: { high: number; low: number; close: number },
  signal: SignalContract
): { exitType: 'stop_loss' | 'take_profit' | null; rawPrice: number | null } {
  const stop = safeNumber(signal.stop_loss?.price, NaN);
  const tp = safeNumber(signal.take_profit_levels?.[0]?.price, NaN);
  const isShort = String(signal.direction).toUpperCase() === 'SHORT';
  const stopHit = Number.isFinite(stop) ? (isShort ? bar.high >= stop : bar.low <= stop) : false;
  const tpHit = Number.isFinite(tp) ? (isShort ? bar.low <= tp : bar.high >= tp) : false;
  if (stopHit && tpHit) {
    return { exitType: 'stop_loss', rawPrice: stop };
  }
  if (stopHit) return { exitType: 'stop_loss', rawPrice: stop };
  if (tpHit) return { exitType: 'take_profit', rawPrice: tp };
  return { exitType: null, rawPrice: null };
}

function gradeFromValue(value: number, thresholds: [number, number, number]): 'A' | 'B' | 'C' | 'D' {
  if (value >= thresholds[0]) return 'A';
  if (value >= thresholds[1]) return 'B';
  if (value >= thresholds[2]) return 'C';
  return 'D';
}

function metricSummary(args: {
  trades: ReplayTrade[];
  daily: Array<{ post_cost_return: number; turnover: number }>;
  degradation?: number;
}): BacktestMetricRecord {
  const closed = args.trades.filter((row) => row.triggered && row.net_return !== null);
  const sample = closed.length;
  if (sample < 5) {
    const ts = nowMs();
    return {
      backtest_run_id: '',
      gross_return: null,
      net_return: null,
      sharpe: null,
      sortino: null,
      max_drawdown: null,
      turnover: null,
      win_rate: null,
      hit_rate: null,
      cost_drag: null,
      sample_size: sample,
      withheld_reason: 'insufficient_sample',
      realism_grade: 'WITHHELD',
      robustness_grade: 'WITHHELD',
      status: 'WITHHELD',
      created_at_ms: ts,
      updated_at_ms: ts
    };
  }

  const gross = closed.map((row) => safeNumber(row.gross_return));
  const net = closed.map((row) => safeNumber(row.net_return));
  const cost = closed.map((row) => safeNumber(row.cost_drag));
  const winRate = net.filter((row) => row > 0).length / Math.max(1, net.length);
  const meanNet = net.reduce((acc, row) => acc + row, 0) / Math.max(1, net.length);
  const variance = net.reduce((acc, row) => acc + (row - meanNet) ** 2, 0) / Math.max(1, net.length - 1);
  const sigma = Math.sqrt(Math.max(variance, 1e-12));
  const downsideRows = net.filter((row) => row < 0);
  const downsideMean = downsideRows.length
    ? downsideRows.reduce((acc, row) => acc + row ** 2, 0) / downsideRows.length
    : 1e-12;
  const downside = Math.sqrt(Math.max(downsideMean, 1e-12));
  const daily = args.daily.map((row) => row.post_cost_return);
  let nav = 1;
  let peak = 1;
  let worst = 0;
  for (const ret of daily) {
    nav *= 1 + ret;
    peak = Math.max(peak, nav);
    worst = Math.min(worst, (nav - peak) / Math.max(peak, 1e-9));
  }
  const turnover = args.daily.reduce((acc, row) => acc + safeNumber(row.turnover), 0) / Math.max(1, args.daily.length);
  const grossReturn = gross.reduce((acc, row) => acc + row, 0);
  const netReturn = net.reduce((acc, row) => acc + row, 0);
  const costDrag = cost.reduce((acc, row) => acc + row, 0);
  const sharpe = (meanNet / sigma) * Math.sqrt(252);
  const sortino = (meanNet / downside) * Math.sqrt(252);
  const realismValue = sample >= 24 ? 0.9 : sample >= 12 ? 0.75 : 0.58;
  const degradationPenalty = Math.max(0, safeNumber(args.degradation, 0));
  const robustnessValue = Math.max(0, 0.85 - degradationPenalty * 7);
  const ts = nowMs();

  return {
    backtest_run_id: '',
    gross_return: round(grossReturn, 6),
    net_return: round(netReturn, 6),
    sharpe: round(sharpe, 4),
    sortino: round(sortino, 4),
    max_drawdown: round(Math.abs(worst), 6),
    turnover: round(turnover, 6),
    win_rate: round(winRate, 6),
    hit_rate: round(winRate, 6),
    cost_drag: round(costDrag, 6),
    sample_size: sample,
    withheld_reason: null,
    realism_grade: gradeFromValue(realismValue, [0.88, 0.74, 0.58]),
    robustness_grade: gradeFromValue(robustnessValue, [0.88, 0.72, 0.56]),
    status: 'READY',
    created_at_ms: ts,
    updated_at_ms: ts
  };
}

function aggregateDaily(trades: ReplayTrade[]) {
  const map = new Map<
    string,
    {
      date: string;
      pre_cost_return: number;
      post_cost_return: number;
      turnover: number;
      gross_exposure_pct: number;
      net_exposure_pct: number;
    }
  >();

  const ensure = (date: string) => {
    if (!map.has(date)) {
      map.set(date, {
        date,
        pre_cost_return: 0,
        post_cost_return: 0,
        turnover: 0,
        gross_exposure_pct: 0,
        net_exposure_pct: 0
      });
    }
    return map.get(date)!;
  };

  for (const trade of trades) {
    if (!trade.triggered || !trade.entry_ts_ms || !trade.exit_ts_ms) continue;
    const size = Math.max(0, Math.min(0.4, trade.size_pct / 100));
    const entryDate = dateKey(trade.entry_ts_ms);
    const exitDate = dateKey(trade.exit_ts_ms);
    const signed = trade.direction === 'SHORT' ? -1 : 1;
    ensure(entryDate).turnover += size;
    ensure(exitDate).turnover += size;
    ensure(exitDate).pre_cost_return += safeNumber(trade.gross_return) * size;
    ensure(exitDate).post_cost_return += safeNumber(trade.net_return) * size;

    for (const point of trade.path) {
      const d = ensure(point.date);
      d.gross_exposure_pct += size * 100;
      d.net_exposure_pct += signed * size * 100;
    }
  }

  let nav = 1;
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      nav *= 1 + row.post_cost_return;
      return {
        ...row,
        pre_cost_return: round(row.pre_cost_return, 6),
        post_cost_return: round(row.post_cost_return, 6),
        turnover: round(row.turnover * 100, 4),
        gross_exposure_pct: round(row.gross_exposure_pct, 4),
        net_exposure_pct: round(row.net_exposure_pct, 4),
        nav: round(nav, 6)
      };
    });
}

function bucket(value: number, edges: number[]): string {
  for (let i = 0; i < edges.length; i += 1) {
    if (value <= edges[i]) return `<=${edges[i]}`;
  }
  return `>${edges[edges.length - 1]}`;
}

function buildAttribution(trades: ReplayTrade[]) {
  const closed = trades.filter((row) => row.triggered && row.net_return !== null);
  const groups: Record<string, Record<string, { count: number; pnl: number; win: number }>> = {
    by_strategy_family: {},
    by_symbol: {},
    by_market: {},
    by_regime: {},
    by_conviction_bucket: {},
    by_holding_horizon: {},
    by_side: {},
    by_cost_bucket: {}
  };

  const add = (scope: keyof typeof groups, key: string, trade: ReplayTrade) => {
    if (!groups[scope][key]) groups[scope][key] = { count: 0, pnl: 0, win: 0 };
    groups[scope][key].count += 1;
    groups[scope][key].pnl += safeNumber(trade.net_return);
    if (safeNumber(trade.net_return) > 0) groups[scope][key].win += 1;
  };

  for (const trade of closed) {
    add('by_strategy_family', trade.strategy_family || 'UNKNOWN', trade);
    add('by_symbol', trade.symbol, trade);
    add('by_market', `${trade.market}/${trade.asset_class}`, trade);
    add('by_regime', trade.regime_id || 'UNKNOWN', trade);
    add('by_conviction_bucket', bucket(trade.conviction, [0.45, 0.6, 0.75, 0.9]), trade);
    add('by_holding_horizon', bucket(trade.holding_days, [1, 3, 5, 10]), trade);
    add('by_side', trade.direction === 'SHORT' ? 'SHORT' : 'LONG', trade);
    add('by_cost_bucket', bucket(Math.abs(safeNumber(trade.cost_drag)), [0.001, 0.003, 0.006, 0.01]), trade);
  }

  const normalize = (map: Record<string, { count: number; pnl: number; win: number }>) =>
    Object.entries(map)
      .map(([key, row]) => ({
        key,
        trades: row.count,
        net_return: round(row.pnl, 6),
        win_rate: round(row.win / Math.max(1, row.count), 6)
      }))
      .sort((a, b) => b.trades - a.trades);

  return {
    by_strategy_family: normalize(groups.by_strategy_family),
    by_symbol: normalize(groups.by_symbol),
    by_market: normalize(groups.by_market),
    by_regime: normalize(groups.by_regime),
    by_conviction_bucket: normalize(groups.by_conviction_bucket),
    by_holding_horizon: normalize(groups.by_holding_horizon),
    by_side: normalize(groups.by_side),
    by_cost_bucket: normalize(groups.by_cost_bucket)
  };
}

function runReplayPass(args: {
  repo: MarketRepository;
  signals: SignalContract[];
  snapshots: SignalSnapshotRecord[];
  profile: ExecutionProfileNormalized;
}): ReplayAggregate {
  const trades: ReplayTrade[] = [];

  for (const snapshot of args.snapshots) {
    const signal = args.signals.find((row) => row.id === snapshot.signal_id);
    if (!signal) continue;
    const asset = args.repo.getAssetBySymbol(snapshot.market, snapshot.symbol);
    if (!asset) {
      trades.push({
        signal_snapshot_id: snapshot.id,
        signal_id: snapshot.signal_id,
        symbol: snapshot.symbol,
        market: snapshot.market,
        asset_class: snapshot.asset_class,
        timeframe: snapshot.timeframe,
        strategy_id: signal.strategy_id,
        strategy_family: signal.strategy_family,
        strategy_version_id: snapshot.strategy_version_id,
        regime_id: signal.regime_id,
        direction: signal.direction,
        conviction: safeNumber(signal.confidence),
        size_pct: safeNumber(signal.position_advice?.position_pct),
        status: RUNTIME_STATUS.INSUFFICIENT_DATA,
        triggered: false,
        entry_ts_ms: null,
        entry_price: null,
        exit_ts_ms: null,
        exit_price: null,
        exit_reason: 'asset_missing',
        gross_return: null,
        net_return: null,
        cost_drag: null,
        holding_bars: 0,
        holding_days: 0,
        path: []
      });
      continue;
    }

    const bars = toBars(args.repo.getOhlcv({ assetId: asset.asset_id, timeframe: signal.timeframe as never, limit: 1200 }));
    const createdAtMs = Date.parse(signal.created_at);
    const expiresAtMs = Date.parse(signal.expires_at);
    const bounds = signalEntryBounds(signal);
    if (!bounds || !Number.isFinite(createdAtMs) || !bars.length) {
      trades.push({
        signal_snapshot_id: snapshot.id,
        signal_id: snapshot.signal_id,
        symbol: snapshot.symbol,
        market: snapshot.market,
        asset_class: snapshot.asset_class,
        timeframe: snapshot.timeframe,
        strategy_id: signal.strategy_id,
        strategy_family: signal.strategy_family,
        strategy_version_id: snapshot.strategy_version_id,
        regime_id: signal.regime_id,
        direction: signal.direction,
        conviction: safeNumber(signal.confidence),
        size_pct: safeNumber(signal.position_advice?.position_pct),
        status: inferSignalStatus(signal),
        triggered: false,
        entry_ts_ms: null,
        entry_price: null,
        exit_ts_ms: null,
        exit_price: null,
        exit_reason: 'signal_incomplete',
        gross_return: null,
        net_return: null,
        cost_drag: null,
        holding_bars: 0,
        holding_days: 0,
        path: []
      });
      continue;
    }

    const horizonBars = Math.max(2, Math.round((signal.timeframe.includes('h') ? 24 : 5)));
    const maxEndTs = Number.isFinite(expiresAtMs) ? expiresAtMs : createdAtMs + timeframeToMs(signal.timeframe) * horizonBars;
    const startIdx = bars.findIndex((row) => row.ts_open >= createdAtMs);
    if (startIdx < 0) {
      trades.push({
        signal_snapshot_id: snapshot.id,
        signal_id: snapshot.signal_id,
        symbol: snapshot.symbol,
        market: snapshot.market,
        asset_class: snapshot.asset_class,
        timeframe: snapshot.timeframe,
        strategy_id: signal.strategy_id,
        strategy_family: signal.strategy_family,
        strategy_version_id: snapshot.strategy_version_id,
        regime_id: signal.regime_id,
        direction: signal.direction,
        conviction: safeNumber(signal.confidence),
        size_pct: safeNumber(signal.position_advice?.position_pct),
        status: inferSignalStatus(signal),
        triggered: false,
        entry_ts_ms: null,
        entry_price: null,
        exit_ts_ms: null,
        exit_price: null,
        exit_reason: 'no_bar_after_signal',
        gross_return: null,
        net_return: null,
        cost_drag: null,
        holding_bars: 0,
        holding_days: 0,
        path: []
      });
      continue;
    }

    let entryIdx = -1;
    let entryPrice = 0;
    for (let i = startIdx; i < bars.length; i += 1) {
      const bar = bars[i];
      if (bar.ts_open > maxEndTs) break;
      if (!entryTriggered(bar, bounds, args.profile.fill_policy, signal.direction)) continue;
      entryIdx = i;
      const refPrice = chooseEntryPrice(bar, bounds, args.profile.fill_policy, signal.direction);
      entryPrice = adversePrice(refPrice, signal.direction, 'entry', args.profile.entry_slippage_bps, args.profile.spread_bps);
      break;
    }

    if (entryIdx < 0 || !entryPrice) {
      trades.push({
        signal_snapshot_id: snapshot.id,
        signal_id: snapshot.signal_id,
        symbol: snapshot.symbol,
        market: snapshot.market,
        asset_class: snapshot.asset_class,
        timeframe: snapshot.timeframe,
        strategy_id: signal.strategy_id,
        strategy_family: signal.strategy_family,
        strategy_version_id: snapshot.strategy_version_id,
        regime_id: signal.regime_id,
        direction: signal.direction,
        conviction: safeNumber(signal.confidence),
        size_pct: safeNumber(signal.position_advice?.position_pct),
        status: inferSignalStatus(signal),
        triggered: false,
        entry_ts_ms: null,
        entry_price: null,
        exit_ts_ms: null,
        exit_price: null,
        exit_reason: 'entry_not_triggered',
        gross_return: null,
        net_return: null,
        cost_drag: null,
        holding_bars: 0,
        holding_days: 0,
        path: []
      });
      continue;
    }

    const maxExitIdx = Math.min(bars.length - 1, entryIdx + horizonBars);
    let exitIdx = maxExitIdx;
    let exitRawPrice = bars[maxExitIdx].close;
    let exitReason = 'horizon';
    const path: Array<{ date: string; mtm_return: number }> = [];

    for (let i = entryIdx; i <= maxExitIdx; i += 1) {
      const bar = bars[i];
      const mtm = pnlFromPrices(signal.direction, entryPrice, bar.close);
      path.push({ date: dateKey(bar.ts_open), mtm_return: round(mtm, 6) });
      const picked = pickExit(bar, signal);
      if (!picked.exitType) continue;
      exitIdx = i;
      exitRawPrice = safeNumber(picked.rawPrice, bar.close);
      exitReason = picked.exitType;
      break;
    }

    const exitTs = bars[exitIdx].ts_open;
    const exitPrice = adversePrice(exitRawPrice, signal.direction, 'exit', args.profile.exit_slippage_bps, args.profile.spread_bps);
    const gross = pnlFromPrices(signal.direction, entryPrice, exitPrice);
    const holdDays = Math.max(1, Math.round((exitTs - bars[entryIdx].ts_open) / DAY_MS) + 1);
    const feeDrag = ((args.profile.fee_bps_per_side * 2) / 10_000);
    const fundingDrag = signal.market === 'CRYPTO' ? (args.profile.funding_bps_per_day / 10_000) * holdDays : 0;
    const costDrag = feeDrag + fundingDrag;
    const net = gross - costDrag;

    trades.push({
      signal_snapshot_id: snapshot.id,
      signal_id: snapshot.signal_id,
      symbol: snapshot.symbol,
      market: snapshot.market,
      asset_class: snapshot.asset_class,
      timeframe: snapshot.timeframe,
      strategy_id: signal.strategy_id,
      strategy_family: signal.strategy_family,
      strategy_version_id: snapshot.strategy_version_id,
      regime_id: signal.regime_id,
      direction: signal.direction,
      conviction: safeNumber(signal.confidence),
      size_pct: safeNumber(signal.position_advice?.position_pct),
      status: inferSignalStatus(signal),
      triggered: true,
      entry_ts_ms: bars[entryIdx].ts_open,
      entry_price: round(entryPrice, 6),
      exit_ts_ms: exitTs,
      exit_price: round(exitPrice, 6),
      exit_reason: exitReason,
      gross_return: round(gross, 6),
      net_return: round(net, 6),
      cost_drag: round(costDrag, 6),
      holding_bars: Math.max(1, exitIdx - entryIdx + 1),
      holding_days: holdDays,
      path
    });
  }

  const daily = aggregateDaily(trades);
  const metrics = metricSummary({
    trades,
    daily: daily.map((row) => ({ post_cost_return: row.post_cost_return, turnover: row.turnover }))
  });
  const attribution = buildAttribution(trades);

  return {
    trades,
    metrics,
    daily_equity_curve: daily,
    attribution
  };
}

function ensureExecutionProfiles(repo: MarketRepository) {
  const ts = nowMs();
  const baseline: ExecutionProfileRecord = {
    id: 'exec-replay-baseline-v1',
    profile_name: 'replay_baseline',
    spread_model_json: JSON.stringify({ model: 'fixed_bps', bps: 1.8 }),
    slippage_model_json: JSON.stringify({ model: 'fixed_bps', entry_bps: 2.4, exit_bps: 2.6 }),
    fee_model_json: JSON.stringify({ bps_per_side: 1.0, funding_bps_per_day: 0.8 }),
    fill_policy_json: JSON.stringify({ mode: 'conservative' }),
    latency_assumption_json: JSON.stringify({ latency_ms: 180 }),
    version: 'v1',
    created_at_ms: ts
  };
  const stress: ExecutionProfileRecord = {
    id: 'exec-replay-stress-v1',
    profile_name: 'replay_stress',
    spread_model_json: JSON.stringify({ model: 'fixed_bps', bps: 2.9 }),
    slippage_model_json: JSON.stringify({ model: 'fixed_bps', entry_bps: 3.8, exit_bps: 4.2 }),
    fee_model_json: JSON.stringify({ bps_per_side: 1.4, funding_bps_per_day: 1.4 }),
    fill_policy_json: JSON.stringify({ mode: 'conservative' }),
    latency_assumption_json: JSON.stringify({ latency_ms: 260 }),
    version: 'v1',
    created_at_ms: ts
  };
  repo.upsertExecutionProfile(baseline);
  repo.upsertExecutionProfile(stress);
  return {
    baseline: normalizeExecutionProfile(baseline),
    stress: normalizeExecutionProfile(stress)
  };
}

function ensureStrategyVersions(repo: MarketRepository, signals: SignalContract[]) {
  const ts = nowMs();
  const rowsByKey = new Map<string, StrategyVersionRecord>();
  for (const signal of signals) {
    const strategyKey = signal.strategy_id;
    const version = signal.strategy_version || 'unknown';
    const configHash = hashJson({
      strategy_id: signal.strategy_id,
      strategy_family: signal.strategy_family,
      strategy_version: signal.strategy_version,
      timeframe: signal.timeframe,
      cost_model: signal.cost_model,
      stop_loss: signal.stop_loss?.type,
      trailing_rule: signal.trailing_rule?.type
    });
    const id = `SV-${hashJson(`${strategyKey}:${version}`).slice(0, 16)}`;
    rowsByKey.set(id, {
      id,
      strategy_key: strategyKey,
      family: signal.strategy_family,
      version,
      config_hash: configHash,
      config_json: JSON.stringify({
        strategy_id: signal.strategy_id,
        family: signal.strategy_family,
        version: signal.strategy_version,
        timeframe: signal.timeframe,
        cost_model: signal.cost_model
      }),
      status: 'challenger',
      created_at_ms: ts,
      updated_at_ms: ts
    });
  }

  const existingChampion = repo.listStrategyVersions({ status: 'champion', limit: 1 })[0];
  if (!existingChampion) {
    const frequency = new Map<string, number>();
    for (const signal of signals) {
      const key = `${signal.strategy_id}:${signal.strategy_version || 'unknown'}`;
      frequency.set(key, (frequency.get(key) || 0) + 1);
    }
    const [picked] = [...frequency.entries()].sort((a, b) => b[1] - a[1]);
    if (picked) {
      for (const row of rowsByKey.values()) {
        if (`${row.strategy_key}:${row.version}` === picked[0]) {
          row.status = 'champion';
          break;
        }
      }
    }
  }

  for (const row of rowsByKey.values()) repo.upsertStrategyVersion(row);
  return [...rowsByKey.values()];
}

function buildDatasetAndUniverse(args: {
  repo: MarketRepository;
  market: Market | 'ALL';
  assetClass: AssetClass | 'ALL';
  timeframe: string;
}) {
  const assets = args.repo.listAssets(args.market === 'ALL' ? undefined : args.market);
  const scopeAssets = assets.filter((asset) => {
    if (args.assetClass === 'ALL') return true;
    if (args.assetClass === 'CRYPTO') return asset.market === 'CRYPTO';
    return asset.market === 'US';
  });
  const now = nowMs();
  const coverageRows = scopeAssets.map((asset) => {
    const stats = args.repo.getOhlcvStats(asset.asset_id, args.timeframe as never);
    const ageHours = stats.last_ts_open ? round((now - stats.last_ts_open) / HOUR_MS, 2) : null;
    return {
      symbol: asset.symbol,
      market: asset.market,
      bar_count: stats.bar_count,
      first_ts_open: stats.first_ts_open,
      last_ts_open: stats.last_ts_open,
      age_hours: ageHours
    };
  });
  const freshness = {
    stale_count: coverageRows.filter((row) => {
      if (row.last_ts_open === null) return true;
      const threshold = row.market === 'CRYPTO' ? 10 : 80;
      return safeNumber(row.age_hours, 9999) > threshold;
    }).length,
    rows: coverageRows
  };
  const coverage = {
    assets_checked: scopeAssets.length,
    assets_with_bars: coverageRows.filter((row) => row.bar_count > 0).length,
    timeframe: args.timeframe
  };
  const bundleHash = hashJson({
    market: args.market,
    asset_class: args.assetClass,
    timeframe: args.timeframe,
    coverage_rows: coverageRows.map((row) => ({
      symbol: row.symbol,
      bar_count: row.bar_count,
      last_ts_open: row.last_ts_open
    }))
  });
  const existing = args.repo.findDatasetVersionByHash({
    market: args.market,
    assetClass: args.assetClass,
    timeframe: args.timeframe,
    sourceBundleHash: bundleHash
  });
  const datasetId = existing?.id || `DS-${bundleHash.slice(0, 16)}-${now}`;
  if (!existing) {
    const row: DatasetVersionRecord = {
      id: datasetId,
      market: args.market,
      asset_class: args.assetClass,
      timeframe: args.timeframe,
      source_bundle_hash: bundleHash,
      coverage_summary_json: JSON.stringify(coverage),
      freshness_summary_json: JSON.stringify(freshness),
      notes: null,
      created_at_ms: now
    };
    args.repo.createDatasetVersion(row);
  }

  const universe: UniverseSnapshotRecord = {
    id: `UNI-${datasetId}`,
    dataset_version_id: datasetId,
    snapshot_ts_ms: now,
    market: args.market,
    asset_class: args.assetClass,
    members_json: JSON.stringify(
      scopeAssets.map((row) => ({
        symbol: row.symbol,
        market: row.market,
        venue: row.venue
      }))
    ),
    created_at_ms: now
  };
  args.repo.upsertUniverseSnapshot(universe);

  const marketStateRows = args.repo.listMarketState({
    market: args.market === 'ALL' ? undefined : args.market
  });
  args.repo.upsertFeatureSnapshot({
    id: `FEAT-${datasetId}`,
    dataset_version_id: datasetId,
    feature_version: 'runtime-market-state.v1',
    snapshot_ts_ms: now,
    feature_hash: hashJson(
      marketStateRows.map((row) => ({
        symbol: row.symbol,
        regime_id: row.regime_id,
        trend_strength: row.trend_strength,
        volatility_percentile: row.volatility_percentile,
        updated_at_ms: row.updated_at_ms
      }))
    ),
    metadata_json: JSON.stringify({
      source: 'market_state',
      row_count: marketStateRows.length
    }),
    created_at_ms: now
  });

  return {
    datasetVersionId: datasetId,
    universeVersionId: universe.id,
    coverage,
    freshness
  };
}

function buildSignalSnapshots(args: {
  runId: string;
  datasetVersionId: string;
  strategyVersions: StrategyVersionRecord[];
  signals: SignalContract[];
}) {
  const strategyByPair = new Map<string, StrategyVersionRecord>();
  for (const row of args.strategyVersions) {
    strategyByPair.set(`${row.strategy_key}:${row.version}`, row);
  }
  const ts = nowMs();
  const rows: SignalSnapshotRecord[] = args.signals.map((signal) => {
    const strategy =
      strategyByPair.get(`${signal.strategy_id}:${signal.strategy_version || 'unknown'}`) ||
      args.strategyVersions[0];
    return {
      id: `SS-${args.runId}-${hashJson(signal.id).slice(0, 14)}`,
      signal_id: signal.id,
      strategy_version_id: strategy.id,
      dataset_version_id: args.datasetVersionId,
      backtest_run_id: args.runId,
      snapshot_ts_ms: Date.parse(signal.created_at) || ts,
      symbol: signal.symbol,
      market: signal.market,
      asset_class: signal.asset_class,
      timeframe: signal.timeframe,
      direction: signal.direction,
      conviction: safeNumber(signal.confidence),
      regime_context_json: JSON.stringify({
        regime_id: signal.regime_id,
        temperature_percentile: signal.temperature_percentile,
        volatility_percentile: signal.volatility_percentile
      }),
      entry_logic_json: JSON.stringify({
        entry_zone: signal.entry_zone,
        trigger: signal.strategy_id
      }),
      invalidation_logic_json: JSON.stringify({
        stop_loss: signal.stop_loss,
        invalidation_level: signal.invalidation_level
      }),
      source_transparency_json: JSON.stringify({
        source_status: inferSignalStatus(signal),
        data_status: inferSignalStatus(signal),
        source_label: inferSignalStatus(signal)
      }),
      evidence_status: evidenceStatusFromSignal(signal),
      created_at_ms: ts
    };
  });
  return rows;
}

function buildReconciliation(args: {
  repo: MarketRepository;
  userId: string;
  runId: string;
  snapshots: SignalSnapshotRecord[];
  replayTrades: ReplayTrade[];
}): ReconciliationSummary {
  const executions = args.repo.listExecutions({ userId: args.userId, limit: 5000 });
  const bySignal = new Map<string, { open?: typeof executions[number]; close?: typeof executions[number] }>();
  for (const row of executions) {
    if (!bySignal.has(row.signal_id)) bySignal.set(row.signal_id, {});
    const slot = bySignal.get(row.signal_id)!;
    const action = String(row.action || '').toUpperCase();
    if (action === 'EXECUTE') {
      if (!slot.open || row.created_at_ms > slot.open.created_at_ms) slot.open = row;
    }
    if (action === 'DONE' || action === 'CLOSE') {
      if (!slot.close || row.created_at_ms > slot.close.created_at_ms) slot.close = row;
    }
  }

  const now = nowMs();
  const rows: ReplayPaperReconciliationRecord[] = [];
  for (const snapshot of args.snapshots) {
    const replay = args.replayTrades.find((row) => row.signal_snapshot_id === snapshot.id);
    const paper = bySignal.get(snapshot.signal_id);
    const open = paper?.open;
    const close = paper?.close;
    let status: ReplayPaperReconciliationRecord['status'] = 'REPLAY_DATA_UNAVAILABLE';
    if (replay?.triggered) {
      if (!open && !close) status = 'PAPER_DATA_UNAVAILABLE';
      else if (open && close) status = 'RECONCILED';
      else status = 'PARTIAL';
    }
    const expectedFill = replay?.entry_price ?? null;
    const paperFill = open?.entry_price ?? null;
    const expectedPnl = replay?.net_return ?? null;
    const paperPnl = close && Number.isFinite(close.pnl_pct) ? safeNumber(close.pnl_pct) / 100 : null;
    const expectedHold = replay?.holding_days ?? null;
    const actualHold =
      open && close ? Math.max(0, (close.created_at_ms - open.created_at_ms) / DAY_MS) : null;
    const slippageGap =
      expectedFill !== null && paperFill !== null ? round((paperFill - expectedFill) / Math.max(expectedFill, 1e-9), 6) : null;
    rows.push({
      id: `REC-${args.runId}-${hashJson(snapshot.id).slice(0, 14)}`,
      signal_snapshot_id: snapshot.id,
      trade_group_id: snapshot.signal_id,
      replay_run_id: args.runId,
      paper_execution_group_id: open?.execution_id || close?.execution_id || null,
      expected_fill_price: expectedFill,
      paper_fill_price: paperFill,
      expected_pnl: expectedPnl,
      paper_pnl: paperPnl,
      expected_hold_period: expectedHold,
      actual_hold_period: actualHold,
      slippage_gap: slippageGap,
      attribution_json: JSON.stringify({
        replay_triggered: Boolean(replay?.triggered),
        replay_exit_reason: replay?.exit_reason || null,
        paper_has_open: Boolean(open),
        paper_has_close: Boolean(close)
      }),
      status,
      created_at_ms: now
    });
  }
  args.repo.upsertReconciliationRows(rows);
  const summary = {
    total: rows.length,
    reconciled: rows.filter((row) => row.status === 'RECONCILED').length,
    paper_unavailable: rows.filter((row) => row.status === 'PAPER_DATA_UNAVAILABLE').length,
    replay_unavailable: rows.filter((row) => row.status === 'REPLAY_DATA_UNAVAILABLE').length,
    partial: rows.filter((row) => row.status === 'PARTIAL').length,
    avg_slippage_gap: (() => {
      const values = rows.map((row) => row.slippage_gap).filter((v): v is number => Number.isFinite(v as number));
      if (!values.length) return null;
      return round(values.reduce((acc, v) => acc + v, 0) / values.length, 6);
    })(),
    avg_pnl_gap: (() => {
      const values = rows
        .filter((row) => row.expected_pnl !== null && row.paper_pnl !== null)
        .map((row) => safeNumber(row.paper_pnl) - safeNumber(row.expected_pnl));
      if (!values.length) return null;
      return round(values.reduce((acc, v) => acc + v, 0) / values.length, 6);
    })()
  };
  return { rows, summary };
}

export function runEvidenceEngine(repo: MarketRepository, params: EvidenceRunParams) {
  const market = params.market || 'US';
  const assetClass = params.assetClass || (market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
  const timeframe = params.timeframe || (market === 'CRYPTO' ? '1h' : '1d');
  const maxSignals = Math.max(10, Math.min(300, params.maxSignals || 120));
  const asOf = nowMs();

  const signals = repo
    .listSignals({
      market,
      assetClass,
      status: 'ALL',
      limit: maxSignals
    })
    .map((row) => {
      try {
        return JSON.parse(row.payload_json) as SignalContract;
      } catch {
        return null;
      }
    })
    .filter((row): row is SignalContract => Boolean(row))
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))
    .slice(0, maxSignals);

  const strategyVersions = ensureStrategyVersions(repo, signals);
  const champion = repo.listStrategyVersions({ status: 'champion', limit: 1 })[0] || strategyVersions[0] || null;
  const dataset = buildDatasetAndUniverse({
    repo,
    market,
    assetClass,
    timeframe
  });
  const executionProfiles = ensureExecutionProfiles(repo);
  const runId = `BTR-${asOf}-${hashJson(`${market}:${assetClass}:${timeframe}`).slice(0, 8)}`;
  const run: BacktestRunRecord = {
    id: runId,
    run_type: 'portfolio_replay',
    strategy_version_id: champion?.id || null,
    dataset_version_id: dataset.datasetVersionId,
    universe_version_id: dataset.universeVersionId,
    execution_profile_id: executionProfiles.baseline.id,
    config_hash: hashJson({
      market,
      assetClass,
      timeframe,
      maxSignals,
      profile: executionProfiles.baseline.id
    }),
    started_at_ms: asOf,
    completed_at_ms: null,
    status: 'RUNNING',
    train_window: null,
    validation_window: null,
    test_window: null,
    notes: null
  };
  repo.createBacktestRun(run);

  const snapshots = buildSignalSnapshots({
    runId,
    datasetVersionId: dataset.datasetVersionId,
    strategyVersions,
    signals
  });
  repo.upsertSignalSnapshots(snapshots);

  const baseline = runReplayPass({
    repo,
    signals,
    snapshots,
    profile: executionProfiles.baseline
  });
  const stress = runReplayPass({
    repo,
    signals,
    snapshots,
    profile: executionProfiles.stress
  });
  const netBase = safeNumber(baseline.metrics.net_return, 0);
  const netStress = safeNumber(stress.metrics.net_return, 0);
  const degradation = round(netBase - netStress, 6);
  const metric = metricSummary({
    trades: baseline.trades,
    daily: baseline.daily_equity_curve.map((row) => ({
      post_cost_return: row.post_cost_return,
      turnover: row.turnover
    })),
    degradation
  });
  metric.backtest_run_id = runId;
  metric.updated_at_ms = nowMs();
  metric.created_at_ms = metric.created_at_ms || metric.updated_at_ms;
  repo.upsertBacktestMetric(metric);

  const reconciliation = buildReconciliation({
    repo,
    userId: params.userId,
    runId,
    snapshots,
    replayTrades: baseline.trades
  });

  const artifacts: BacktestArtifactRecord[] = [
    {
      backtest_run_id: runId,
      artifact_type: 'equity_curve',
      path_or_payload: JSON.stringify({
        source_status: RUNTIME_STATUS.DB_BACKED,
        data_status: metric.status === 'WITHHELD' ? RUNTIME_STATUS.WITHHELD : RUNTIME_STATUS.MODEL_DERIVED,
        daily: baseline.daily_equity_curve
      }),
      created_at_ms: nowMs()
    },
    {
      backtest_run_id: runId,
      artifact_type: 'trades',
      path_or_payload: JSON.stringify({
        source_status: RUNTIME_STATUS.DB_BACKED,
        data_status: metric.status === 'WITHHELD' ? RUNTIME_STATUS.WITHHELD : RUNTIME_STATUS.MODEL_DERIVED,
        trades: baseline.trades
      }),
      created_at_ms: nowMs()
    },
    {
      backtest_run_id: runId,
      artifact_type: 'attribution',
      path_or_payload: JSON.stringify(baseline.attribution),
      created_at_ms: nowMs()
    },
    {
      backtest_run_id: runId,
      artifact_type: 'realism_stress',
      path_or_payload: JSON.stringify({
        baseline_net_return: baseline.metrics.net_return,
        stress_net_return: stress.metrics.net_return,
        degradation,
        source_status: RUNTIME_STATUS.MODEL_DERIVED,
        note: 'Portfolio replay baseline vs stressed execution profile.'
      }),
      created_at_ms: nowMs()
    },
    {
      backtest_run_id: runId,
      artifact_type: 'reconciliation',
      path_or_payload: JSON.stringify(reconciliation.summary),
      created_at_ms: nowMs()
    }
  ];
  repo.insertBacktestArtifacts(artifacts);

  const runStatus: BacktestRunRecord['status'] = metric.status === 'WITHHELD' ? 'WITHHELD' : 'SUCCESS';
  repo.updateBacktestRunStatus({
    id: runId,
    status: runStatus,
    completedAtMs: nowMs(),
    notes:
      metric.status === 'WITHHELD'
        ? 'WITHHELD: insufficient sample for reliable metrics.'
        : 'Canonical portfolio replay completed.'
  });

  const experiment: ExperimentRegistryRecord = {
    id: `EXP-${runId}`,
    backtest_run_id: runId,
    strategy_version_id: champion?.id || null,
    decision_status: champion?.status === 'champion' ? 'champion' : 'challenger',
    promotion_reason: champion?.status === 'champion' ? 'Current champion used in canonical evidence run.' : null,
    demotion_reason: null,
    approved_at_ms: runStatus === 'SUCCESS' ? nowMs() : null,
    created_at_ms: nowMs()
  };
  repo.upsertExperimentRecord(experiment);

  return {
    run_id: runId,
    status: runStatus,
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: runStatus === 'WITHHELD' ? RUNTIME_STATUS.WITHHELD : RUNTIME_STATUS.MODEL_DERIVED,
    canonical_path: 'portfolio_replay_v1',
    experimental_paths: ['legacy_portfolio_simulation_model_only'],
    dataset_version_id: dataset.datasetVersionId,
    universe_version_id: dataset.universeVersionId,
    execution_profile_id: executionProfiles.baseline.id,
    strategy_version_id: champion?.id || null,
    signals_evaluated: signals.length,
    trades_triggered: baseline.trades.filter((row) => row.triggered).length,
    trades_closed: baseline.trades.filter((row) => row.triggered && row.net_return !== null).length,
    reconciliation_summary: reconciliation.summary
  };
}

function latestSuccessfulRun(repo: MarketRepository, market?: Market) {
  const runs = repo.listBacktestRuns({
    runType: 'portfolio_replay',
    limit: 50
  });
  if (!market) return runs.find((row) => row.status !== 'RUNNING') || runs[0] || null;
  for (const run of runs) {
    const ds = repo.getDatasetVersion(run.dataset_version_id);
    if (!ds) continue;
    if (ds.market === market || ds.market === 'ALL') return run;
  }
  return runs.find((row) => row.status !== 'RUNNING') || runs[0] || null;
}

function parseSignalPayloadSafe(payload: string): SignalContract | null {
  try {
    return JSON.parse(payload) as SignalContract;
  } catch {
    return null;
  }
}

export function getTopSignalEvidence(repo: MarketRepository, args: {
  userId: string;
  market?: Market;
  assetClass?: AssetClass;
  limit?: number;
}) {
  const run = latestSuccessfulRun(repo, args.market);
  if (!run) {
    return {
      asof: new Date().toISOString(),
      source_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      data_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      records: []
    };
  }
  const metrics = repo.getBacktestMetric(run.id);
  const snapshots = repo.listSignalSnapshots({
    runId: run.id,
    market: args.market,
    limit: 300
  });
  const reconciliationRows = repo.listReconciliationRows({
    replayRunId: run.id,
    limit: 5000
  });
  const reconciliationBySnapshot = new Map(reconciliationRows.map((row) => [row.signal_snapshot_id, row]));
  const records = snapshots
    .map((snapshot) => {
      const signalRow = repo.getSignal(snapshot.signal_id);
      const signal = signalRow ? parseSignalPayloadSafe(signalRow.payload_json) : null;
      const rec = reconciliationBySnapshot.get(snapshot.id);
      const freshness = signal ? Math.max(0, Math.round((nowMs() - (Date.parse(signal.created_at) || nowMs())) / 60000)) : null;
      const actionable = signal
        ? ['NEW', 'TRIGGERED'].includes(String(signal.status).toUpperCase()) &&
          !['WITHHELD', 'INSUFFICIENT_DATA'].includes(evidenceStatusFromSignal(signal))
        : false;
      return {
        signal_id: snapshot.signal_id,
        symbol: snapshot.symbol,
        market: snapshot.market,
        asset_class: snapshot.asset_class,
        timeframe: snapshot.timeframe,
        direction: signal?.direction || snapshot.direction,
        conviction: snapshot.conviction,
        regime_id: signal?.regime_id || JSON.parse(snapshot.regime_context_json || '{}').regime_id || '--',
        thesis: signal?.explain_bullets?.[0] || signal?.entry_zone?.notes || '--',
        entry_zone: signal?.entry_zone || JSON.parse(snapshot.entry_logic_json || '{}').entry_zone || null,
        invalidation: signal?.stop_loss?.price || JSON.parse(snapshot.invalidation_logic_json || '{}').stop_loss?.price || null,
        source_transparency: JSON.parse(snapshot.source_transparency_json || '{}'),
        evidence_status: snapshot.evidence_status,
        freshness_minutes: freshness,
        freshness_label:
          freshness === null ? '--' : freshness < 1 ? 'just now' : freshness < 60 ? `${freshness}m ago` : `${Math.floor(freshness / 60)}h ago`,
        actionable,
        supporting_run_id: run.id,
        strategy_version_id: snapshot.strategy_version_id,
        dataset_version_id: snapshot.dataset_version_id,
        reconciliation_status: rec?.status || 'PAPER_DATA_UNAVAILABLE',
        replay_paper_evidence_available: rec?.status === 'RECONCILED'
      };
    })
    .sort((a, b) => {
      const aPenalty = a.evidence_status === 'WITHHELD' || a.evidence_status === 'INSUFFICIENT_DATA' ? 100 : 0;
      const bPenalty = b.evidence_status === 'WITHHELD' || b.evidence_status === 'INSUFFICIENT_DATA' ? 100 : 0;
      const aFresh = a.freshness_minutes ?? 999999;
      const bFresh = b.freshness_minutes ?? 999999;
      return (
        b.conviction * 100 -
        a.conviction * 100 +
        aPenalty -
        bPenalty +
        (aFresh - bFresh) * 0.1
      );
    })
    .slice(0, Math.max(1, Math.min(8, args.limit || 3)));

  return {
    asof: new Date(run.completed_at_ms || run.started_at_ms).toISOString(),
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status:
      metrics?.status === 'WITHHELD' ? RUNTIME_STATUS.WITHHELD : RUNTIME_STATUS.MODEL_DERIVED,
    supporting_run_id: run.id,
    dataset_version_id: run.dataset_version_id,
    strategy_version_id: run.strategy_version_id,
    records
  };
}

export function getSignalEvidenceDetail(repo: MarketRepository, args: {
  signalId: string;
  userId: string;
}) {
  const signalRow = repo.getSignal(args.signalId);
  if (!signalRow) {
    return {
      source_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      data_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      detail: null
    };
  }
  const signal = parseSignalPayloadSafe(signalRow.payload_json);
  if (!signal) {
    return {
      source_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      data_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      detail: null
    };
  }
  const snapshots = repo.listSignalSnapshots({ signalId: args.signalId, limit: 20 });
  const latestSnapshot = snapshots[0] || null;
  const run = latestSnapshot ? repo.getBacktestRun(latestSnapshot.backtest_run_id) : null;
  const metric = run ? repo.getBacktestMetric(run.id) : null;
  const recon = latestSnapshot
    ? repo.listReconciliationRows({ replayRunId: latestSnapshot.backtest_run_id, limit: 500 }).find((row) => row.signal_snapshot_id === latestSnapshot.id)
    : null;
  const executions = repo.listExecutions({ userId: args.userId, signalId: args.signalId, limit: 50 });
  const events = repo.listSignalEvents(args.signalId, 30);

  return {
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: latestSnapshot?.evidence_status === 'WITHHELD' ? RUNTIME_STATUS.WITHHELD : RUNTIME_STATUS.MODEL_DERIVED,
    detail: {
      signal,
      snapshot: latestSnapshot,
      replay_summary: run
        ? {
            run_id: run.id,
            run_status: run.status,
            metrics: metric
          }
        : null,
      paper_summary: {
        executions_count: executions.length,
        latest_execution: executions[0] || null
      },
      reconciliation: recon
        ? {
            status: recon.status,
            expected_fill_price: recon.expected_fill_price,
            paper_fill_price: recon.paper_fill_price,
            expected_pnl: recon.expected_pnl,
            paper_pnl: recon.paper_pnl,
            slippage_gap: recon.slippage_gap
          }
        : {
            status: 'RECONCILIATION_UNAVAILABLE'
          },
      regime_context: signal.regime_id,
      transparency: {
        source_status: inferSignalStatus(signal),
        data_status: inferSignalStatus(signal),
        source_label: inferSignalStatus(signal)
      },
      signal_events: events
    }
  };
}

export function listBacktestEvidence(repo: MarketRepository, args: {
  runType?: string;
  status?: string;
  strategyVersionId?: string;
  limit?: number;
}) {
  const rows = repo.listBacktestRuns({
    runType: args.runType,
    status: args.status,
    strategyVersionId: args.strategyVersionId,
    limit: args.limit || 50
  });
  return {
    source_status: rows.length ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    data_status: rows.length ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    records: rows.map((row) => ({
      ...row,
      metric: repo.getBacktestMetric(row.id)
    }))
  };
}

export function getBacktestEvidenceDetail(repo: MarketRepository, runId: string) {
  const run = repo.getBacktestRun(runId);
  if (!run) {
    return {
      source_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      data_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      detail: null
    };
  }
  const metric = repo.getBacktestMetric(run.id);
  const artifacts = repo.listBacktestArtifacts(run.id);
  const dataset = repo.getDatasetVersion(run.dataset_version_id);
  const universe = repo.getUniverseSnapshot(run.universe_version_id);
  const strategy = run.strategy_version_id ? repo.getStrategyVersion(run.strategy_version_id) : null;
  return {
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: metric?.status === 'WITHHELD' ? RUNTIME_STATUS.WITHHELD : RUNTIME_STATUS.MODEL_DERIVED,
    detail: {
      run,
      strategy,
      dataset,
      universe,
      metrics: metric,
      artifacts: artifacts.map((row) => ({
        artifact_type: row.artifact_type,
        payload: (() => {
          try {
            return JSON.parse(row.path_or_payload);
          } catch {
            return row.path_or_payload;
          }
        })()
      })),
      transparency: {
        source_status: RUNTIME_STATUS.DB_BACKED,
        data_status: metric?.status === 'WITHHELD' ? RUNTIME_STATUS.WITHHELD : RUNTIME_STATUS.MODEL_DERIVED,
        source_label: RUNTIME_STATUS.DB_BACKED
      }
    }
  };
}

export function listReconciliationEvidence(repo: MarketRepository, args: {
  replayRunId?: string;
  symbol?: string;
  strategyVersionId?: string;
  status?: ReplayPaperReconciliationRecord['status'];
  limit?: number;
}) {
  const rows = repo.listReconciliationRows({
    replayRunId: args.replayRunId,
    symbol: args.symbol,
    strategyVersionId: args.strategyVersionId,
    status: args.status,
    limit: args.limit || 200
  });
  return {
    source_status: rows.length ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    data_status: rows.length ? RUNTIME_STATUS.MODEL_DERIVED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    records: rows
  };
}

export function getChampionStrategies(repo: MarketRepository) {
  const champions = repo.listStrategyVersions({ status: 'champion', limit: 20 });
  const rows = champions.map((row) => {
    const runs = repo
      .listBacktestRuns({ strategyVersionId: row.id, limit: 10 })
      .filter((run) => run.status !== 'RUNNING');
    const latest = runs[0] || null;
    const metric = latest ? repo.getBacktestMetric(latest.id) : null;
    return {
      strategy_version_id: row.id,
      strategy_key: row.strategy_key,
      family: row.family,
      version: row.version,
      status: row.status,
      supporting_run_id: latest?.id || null,
      evidence_status: metric?.status || 'WITHHELD',
      metrics: metric
    };
  });
  return {
    source_status: rows.length ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    data_status: rows.length ? RUNTIME_STATUS.MODEL_DERIVED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    records: rows
  };
}

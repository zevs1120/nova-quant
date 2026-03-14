import { createHash } from 'node:crypto';
import { getDb } from '../db/database.js';
import { MarketRepository } from '../db/repository.js';
import { ensureSchema } from '../db/schema.js';
import type { AssetClass, ExecutionAction, ExecutionMode, Market, RiskProfileKey, SignalContract, Timeframe, UserHoldingInput } from '../types.js';
import { createExecutionRecord, decodeSignalContract, ensureQuantData } from '../quant/service.js';
import {
  getBacktestEvidenceDetail,
  getChampionStrategies,
  getSignalEvidenceDetail,
  getTopSignalEvidence,
  listBacktestEvidence,
  listReconciliationEvidence,
  runEvidenceEngine
} from '../evidence/engine.js';
import {
  RUNTIME_STATUS,
  derivePerformanceSourceStatus,
  normalizeRuntimeStatus,
  withComponentStatus
} from '../runtimeStatus.js';
import { buildDecisionSnapshot } from '../decision/engine.js';
import { buildEngagementSnapshot, defaultNotificationPreferences } from '../engagement/engine.js';

const RISK_PROFILE_PRESETS = {
  conservative: {
    max_loss_per_trade: 0.7,
    max_daily_loss: 1.8,
    max_drawdown: 8,
    exposure_cap: 35,
    leverage_cap: 1.5
  },
  balanced: {
    max_loss_per_trade: 1.0,
    max_daily_loss: 3.0,
    max_drawdown: 12,
    exposure_cap: 55,
    leverage_cap: 2
  },
  aggressive: {
    max_loss_per_trade: 1.4,
    max_daily_loss: 4.5,
    max_drawdown: 18,
    exposure_cap: 75,
    leverage_cap: 3
  }
} as const;

function getRepo(): MarketRepository {
  const db = getDb();
  ensureSchema(db);
  return new MarketRepository(db);
}

type RuntimeSyncContext = {
  riskProfileKey?: RiskProfileKey;
  market?: Market;
  assetClass?: AssetClass;
  timeframe?: string;
  universeScope?: string;
};

export function listAssets(market?: Market) {
  const repo = getRepo();
  return repo.listAssets(market);
}

export function queryOhlcv(args: {
  market: Market;
  symbol: string;
  timeframe: Timeframe;
  start?: number;
  end?: number;
  limit?: number;
}) {
  const repo = getRepo();
  const asset = repo.getAssetBySymbol(args.market, args.symbol);
  if (!asset) {
    return { asset: null, rows: [] as ReturnType<typeof repo.getOhlcv> };
  }

  const rows = repo.getOhlcv({
    assetId: asset.asset_id,
    timeframe: args.timeframe,
    start: args.start,
    end: args.end,
    limit: args.limit
  });

  return { asset, rows };
}

export function syncQuantState(userId = 'guest-default', force = false, context: RuntimeSyncContext = {}) {
  const repo = getRepo();
  return ensureQuantData(repo, userId, force, {
    riskProfileKey: context.riskProfileKey,
    market: context.market,
    assetClass: context.assetClass,
    timeframe: context.timeframe,
    universeScope: context.universeScope
  });
}

export function listSignalContracts(args: {
  userId?: string;
  assetClass?: AssetClass;
  market?: Market;
  symbol?: string;
  status?: 'ALL' | 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED';
  limit?: number;
}): SignalContract[] {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    assetClass: args.assetClass
  });
  const rows = repo.listSignals({
    assetClass: args.assetClass,
    market: args.market,
    symbol: args.symbol,
    status: args.status,
    limit: args.limit
  });
  return rows
    .map((row) => decodeSignalContract(row))
    .filter((row): row is SignalContract => Boolean(row));
}

export function getSignalContract(signalId: string, userId = 'guest-default'): SignalContract | null {
  const repo = getRepo();
  syncQuantState(userId);
  const row = repo.getSignal(signalId);
  if (!row) return null;
  return decodeSignalContract(row);
}

export function upsertExecution(args: {
  userId: string;
  signalId: string;
  mode: ExecutionMode;
  action: ExecutionAction;
  note?: string;
  pnlPct?: number | null;
}): { ok: boolean; executionId?: string; error?: string } {
  const repo = getRepo();
  syncQuantState(args.userId);
  const row = repo.getSignal(args.signalId);
  if (!row) return { ok: false, error: 'Signal not found' };
  const signal = decodeSignalContract(row);
  if (!signal) return { ok: false, error: 'Signal payload is invalid' };
  const execution = createExecutionRecord({
    signal,
    userId: args.userId,
    mode: args.mode,
    action: args.action,
    note: args.note,
    pnlPct: args.pnlPct
  });
  repo.upsertExecution(execution);
  repo.appendSignalEvent(signal.id, `EXECUTION_${args.action}`, {
    mode: args.mode,
    execution_id: execution.execution_id
  });
  syncQuantState(args.userId, true, {
    market: signal.market,
    assetClass: signal.asset_class
  });
  return { ok: true, executionId: execution.execution_id };
}

export function listExecutions(args: {
  userId?: string;
  market?: Market;
  mode?: ExecutionMode;
  signalId?: string;
  limit?: number;
}) {
  const repo = getRepo();
  return repo.listExecutions({
    userId: args.userId,
    market: args.market,
    mode: args.mode,
    signalId: args.signalId,
    limit: args.limit
  });
}

export function getMarketState(args: {
  userId?: string;
  market?: Market;
  symbol?: string;
  timeframe?: string;
}) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    timeframe: args.timeframe
  });
  return repo.listMarketState({
    market: args.market,
    symbol: args.symbol,
    timeframe: args.timeframe
  });
}

export function getPerformanceSummary(args: { userId?: string; market?: Market; range?: string }) {
  const repo = getRepo();
  const state = syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    timeframe: args.range
  });
  const rows = repo.listPerformanceSnapshots({
    market: args.market,
    range: args.range
  });
  const grouped = rows.reduce<Record<string, Record<string, unknown>>>((acc, row) => {
    const key = `${row.market}:${row.range}`;
    if (!acc[key]) {
      acc[key] = {
        market: row.market,
        range: row.range,
        overall: null,
        by_strategy: [],
        by_regime: [],
        deviation: null
      };
    }
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    if (row.segment_type === 'OVERALL') acc[key].overall = payload;
    if (row.segment_type === 'STRATEGY') (acc[key].by_strategy as Record<string, unknown>[]).push(payload);
    if (row.segment_type === 'REGIME') (acc[key].by_regime as Record<string, unknown>[]).push(payload);
    if (row.segment_type === 'DEVIATION') acc[key].deviation = payload;
    return acc;
  }, {});

  return {
    asof: new Date(state.asofMs).toISOString(),
    source_status: normalizeRuntimeStatus(state.sourceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA),
    records: Object.values(grouped)
  };
}

export function getRiskProfile(userId = 'guest-default', opts?: { skipSync?: boolean }) {
  const repo = getRepo();
  const existing = repo.getUserRiskProfile(userId);
  if (existing) return existing;
  if (!opts?.skipSync) {
    syncQuantState(userId);
    return repo.getUserRiskProfile(userId);
  }
  syncQuantState(userId);
  return repo.getUserRiskProfile(userId);
}

export function setRiskProfile(userId: string, profileKey: 'conservative' | 'balanced' | 'aggressive') {
  const repo = getRepo();
  const preset = RISK_PROFILE_PRESETS[profileKey] || RISK_PROFILE_PRESETS.balanced;
  repo.upsertUserRiskProfile({
    user_id: userId,
    profile_key: profileKey,
    max_loss_per_trade: preset.max_loss_per_trade,
    max_daily_loss: preset.max_daily_loss,
    max_drawdown: preset.max_drawdown,
    exposure_cap: preset.exposure_cap,
    leverage_cap: preset.leverage_cap,
    updated_at_ms: Date.now()
  });
  return repo.getUserRiskProfile(userId);
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function ensureDefaultPublicSignalsApiKey(): string {
  const repo = getRepo();
  const plainKey = String(process.env.PUBLIC_SIGNALS_API_KEY || 'nova-public-default-key');
  repo.upsertApiKey({
    key_id: 'public-signals-default',
    key_hash: hashApiKey(plainKey),
    label: 'Default Public Signals Key',
    scope: 'signals:read',
    status: 'ACTIVE'
  });
  return plainKey;
}

export function verifyPublicSignalsApiKey(rawKey?: string): boolean {
  if (!rawKey) return false;
  const repo = getRepo();
  const row = repo.getApiKeyByHash(hashApiKey(rawKey));
  return Boolean(row && row.status === 'ACTIVE');
}

export function getMarketModules(args?: { market?: Market; assetClass?: AssetClass }) {
  const repo = getRepo();
  const rows = repo.listMarketState({
    market: args?.market
  });

  const scoped = rows.filter((row) => {
    if (!args?.assetClass) return true;
    if (args.assetClass === 'CRYPTO') return row.market === 'CRYPTO';
    return row.market === 'US';
  });

  const bySymbol = new Map<string, (typeof scoped)[number]>();
  for (const row of scoped) {
    const existing = bySymbol.get(row.symbol);
    if (!existing || row.updated_at_ms > existing.updated_at_ms) bySymbol.set(row.symbol, row);
  }

  return Array.from(bySymbol.values())
    .slice(0, 36)
    .map((row, index) => {
      const event = row.event_stats_json ? (JSON.parse(row.event_stats_json) as Record<string, unknown>) : {};
      const moduleStatus = withComponentStatus({
        overallDataStatus: normalizeRuntimeStatus(event.data_status, RUNTIME_STATUS.MODEL_DERIVED),
        componentSourceStatus: normalizeRuntimeStatus(event.source_status, RUNTIME_STATUS.DB_BACKED)
      });
      return {
        id: `module-${row.market}-${row.symbol}-${index + 1}`,
        market: row.market,
        asset_class: row.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK',
        title: `${row.symbol} ${row.regime_id}`,
        summary: row.stance,
        metric: `Trend ${Number(row.trend_strength || 0).toFixed(2)} · Vol ${Number(row.volatility_percentile || 0).toFixed(1)}p`,
        source_status: moduleStatus.source_status,
        data_status: moduleStatus.data_status,
        source_label: moduleStatus.source_label,
        as_of: new Date(row.updated_at_ms).toISOString()
      };
    });
}

export function upsertExternalConnection(args: {
  userId: string;
  connectionType: 'BROKER' | 'EXCHANGE';
  provider: string;
  mode: 'READ_ONLY' | 'TRADING';
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
  meta?: Record<string, unknown>;
}) {
  const repo = getRepo();
  const id = `${args.connectionType}-${args.provider}-${args.userId}`;
  repo.upsertExternalConnection({
    connection_id: id,
    user_id: args.userId,
    connection_type: args.connectionType,
    provider: args.provider,
    mode: args.mode,
    status: args.status,
    meta_json: args.meta ? JSON.stringify(args.meta) : null
  });
  return { connection_id: id };
}

export function listExternalConnections(args: { userId: string; connectionType?: 'BROKER' | 'EXCHANGE' }) {
  const repo = getRepo();
  const rows = repo.listExternalConnections({
    userId: args.userId,
    connectionType: args.connectionType
  });
  return rows.map((row) => ({
    ...row,
    meta: row.meta_json ? JSON.parse(row.meta_json) : null
  }));
}

function toUiSignal(signal: SignalContract): Record<string, unknown> {
  const grade = signal.score >= 75 ? 'A' : signal.score >= 63 ? 'B' : 'C';
  const statusTag = signal.tags.find((tag) => String(tag).startsWith('status:'))?.split(':')[1] || RUNTIME_STATUS.MODEL_DERIVED;
  const sourceTag = signal.tags.find((tag) => String(tag).startsWith('source:'))?.split(':')[1] || RUNTIME_STATUS.DB_BACKED;
  const status = withComponentStatus({
    overallDataStatus: normalizeRuntimeStatus(statusTag, RUNTIME_STATUS.MODEL_DERIVED),
    componentSourceStatus: normalizeRuntimeStatus(sourceTag, RUNTIME_STATUS.DB_BACKED)
  });
  return {
    ...signal,
    signal_id: signal.id,
    grade,
    source_status: status.source_status,
    source_label: status.source_label,
    data_status: status.data_status
  };
}

function modeFromRiskProfile(profile?: { profile_key?: string | null }): string {
  const key = String(profile?.profile_key || 'balanced').toLowerCase();
  if (key === 'conservative') return 'do not trade';
  if (key === 'aggressive') return 'normal risk';
  return 'trade light';
}

type RuntimeStateCore = {
  repo: MarketRepository;
  userId: string;
  market: Market;
  assetClass?: AssetClass;
  state: ReturnType<typeof syncQuantState>;
  risk: ReturnType<typeof getRiskProfile>;
  signals: Record<string, unknown>[];
  marketState: ReturnType<typeof getMarketState>;
  modules: ReturnType<typeof getMarketModules>;
  performance: ReturnType<typeof getPerformanceSummary>;
  performanceSource: ReturnType<typeof derivePerformanceSourceStatus>;
  hasPerformanceSample: boolean;
  active: Record<string, unknown>[];
  topSignal: Record<string, unknown> | null;
  avgVol: number | null;
  avgTemp: number | null;
  avgRiskOff: number | null;
  mode: string;
  suggestedGross: number;
  suggestedNet: number;
  today: Record<string, unknown>;
  safety: Record<string, unknown>;
  insights: Record<string, unknown>;
  runtimeStateStatus: string;
  runtimeTransparency: Record<string, unknown>;
};

function loadRuntimeStateCore(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
}): RuntimeStateCore {
  const repo = getRepo();
  const userId = args.userId || 'guest-default';
  const market = args.market || (args.assetClass === 'CRYPTO' ? 'CRYPTO' : 'US');
  const state = syncQuantState(userId, false, {
    market: args.market,
    assetClass: args.assetClass
  });
  const risk = getRiskProfile(userId, { skipSync: true });

  const signals = listSignalContracts({
    userId,
    market: args.market,
    assetClass: args.assetClass,
    status: 'ALL',
    limit: 60
  }).map(toUiSignal);

  const marketState = getMarketState({ userId, market });
  const modules = getMarketModules({ market, assetClass: args.assetClass });
  const performance = getPerformanceSummary({ userId, market });
  const performanceRecords = Array.isArray(performance?.records) ? performance.records : [];
  const hasPerformanceSample = performanceRecords.some((record) => {
    const overall = record?.overall as Record<string, unknown> | null;
    const sampleSize = Number(overall?.sample_size || 0);
    return Number.isFinite(sampleSize) && sampleSize > 0;
  });
  const sourceLabels = performanceRecords
    .map((record) => (record?.overall as Record<string, unknown> | null)?.source_label)
    .filter(Boolean) as string[];
  const performanceSource = derivePerformanceSourceStatus(sourceLabels);

  const active = signals
    .filter((row) => ['NEW', 'TRIGGERED'].includes(String(row.status)))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const topSignal = active[0] || null;

  const avgVol = marketState.length
    ? marketState.reduce((acc, row) => acc + Number(row.volatility_percentile || 0), 0) / marketState.length
    : null;
  const avgTemp = marketState.length
    ? marketState.reduce((acc, row) => acc + Number(row.temperature_percentile || 0), 0) / marketState.length
    : null;
  const avgRiskOff = marketState.length
    ? marketState.reduce((acc, row) => acc + Number(row.risk_off_score || 0), 0) / marketState.length
    : null;

  const mode = modeFromRiskProfile(risk || undefined);
  const suggestedGross = mode === 'do not trade' ? 18 : mode === 'trade light' ? 35 : 55;
  const suggestedNet = mode === 'do not trade' ? 8 : mode === 'trade light' ? 20 : 35;

  const today = {
    is_trading_day: true,
    trading_day_message: market === 'CRYPTO' ? 'Crypto market runs 24/7.' : 'US market session inferred from bar updates.',
    suggested_gross_exposure_pct: suggestedGross,
    suggested_net_exposure_pct: suggestedNet,
    style_hint:
      topSignal && String(topSignal.strategy_family || '').toLowerCase().includes('mean')
        ? 'mean reversion'
        : topSignal && String(topSignal.strategy_family || '').toLowerCase().includes('trend')
          ? 'trend'
          : 'watchful',
    why_today: [
      topSignal
        ? `Top setup ${String(topSignal.symbol)} from ${String(topSignal.strategy_id)} under ${String(topSignal.regime_id)}.`
        : 'No high-quality setup passed rule filters today.',
      avgVol === null ? 'Volatility percentile unavailable due to insufficient bars.' : `Average volatility percentile: ${avgVol.toFixed(1)}.`,
      avgRiskOff === null ? 'Risk-off score unavailable.' : `Average risk-off score: ${avgRiskOff.toFixed(2)}.`
    ]
  };

  const safety = {
    mode,
    safety_score: avgRiskOff === null ? 50 : Math.max(0, Math.min(100, Math.round((1 - avgRiskOff) * 100))),
    suggested_gross_exposure_pct: suggestedGross,
    suggested_net_exposure_pct: suggestedNet,
    conclusion:
      mode === 'do not trade'
        ? 'Risk-off pressure is high; preserve capital and avoid forced entries.'
        : mode === 'trade light'
          ? 'Mixed regime signals; keep size selective and controlled.'
          : 'Risk posture allows normal sizing within profile caps.',
    primary_risks: [
      avgVol !== null && avgVol > 75 ? 'Volatility percentile is elevated.' : 'Volatility is not at panic level.',
      avgTemp !== null && avgTemp > 82 ? 'Temperature is stretched; avoid chasing.' : 'Temperature is within normal range.',
      state.sourceStatus !== RUNTIME_STATUS.DB_BACKED
        ? 'Data coverage is insufficient for high-confidence actions.'
        : 'Signals are DB-backed from derived OHLCV state.'
    ],
    cards: {
      market: {
        title: 'Market',
        score: avgRiskOff === null ? 50 : Number(((1 - avgRiskOff) * 100).toFixed(1)),
        lines: ['Derived from OHLCV trend/volatility/risk-off features.']
      },
      portfolio: {
        title: 'Portfolio',
        score: mode === 'do not trade' ? 35 : mode === 'trade light' ? 55 : 70,
        lines: ['Exposure caps follow user risk profile.']
      },
      instrument: {
        title: 'Instrument',
        score: topSignal ? Number(topSignal.score || 50) : 45,
        lines: [topSignal ? `Top candidate: ${String(topSignal.symbol)}` : 'No active candidate in NEW/TRIGGERED state.']
      }
    },
    rules: [
      { id: 'size-cap', title: 'Size cap', rule: `Gross exposure cap ${risk?.exposure_cap ?? '--'}%` },
      { id: 'hard-stop', title: 'Hard stop', rule: 'Every trade requires invalidation placement before entry.' },
      { id: 'skip-on-data-gap', title: 'Data guard', rule: 'If bars are stale or missing, strategy should skip.' }
    ]
  };

  const insights = {
    regime: {
      tag: marketState[0]?.regime_id || RUNTIME_STATUS.INSUFFICIENT_DATA,
      description: marketState[0]?.stance || 'No reliable market-state record available.'
    },
    short_commentary: topSignal
      ? `Current best opportunity: ${String(topSignal.symbol)} (${String(topSignal.strategy_id)}).`
      : 'No high-quality opportunity currently passed filters.',
    breadth: {
      ratio: marketState.length
        ? Number((marketState.filter((row) => Number(row.trend_strength || 0) >= 0.55).length / marketState.length).toFixed(4))
        : null
    },
    volatility: {
      label: avgVol === null ? 'insufficient_data' : avgVol >= 80 ? 'elevated' : avgVol >= 60 ? 'moderate' : 'calm'
    },
    risk_on_off: {
      state: avgRiskOff === null ? 'insufficient_data' : avgRiskOff >= 0.7 ? 'risk_off' : avgRiskOff >= 0.55 ? 'neutral' : 'risk_on'
    },
    style: {
      preference: today.style_hint
    },
    leadership: {
      leaders: active.slice(0, 3).map((row) => ({ sector: String(row.symbol), score: Number(row.score || 0) / 100 })),
      laggards: active.slice(-3).map((row) => ({ sector: String(row.symbol), score: Number(row.score || 0) / 100 }))
    },
    why_signals_today: today.why_today
  };

  const runtimeStateStatus = normalizeRuntimeStatus(state.sourceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA);
  const runtimeTransparency = {
    as_of: new Date(state.asofMs).toISOString(),
    source_status: runtimeStateStatus,
    data_status: runtimeStateStatus,
    freshness_summary: state.freshnessSummary,
    coverage_summary: state.coverageSummary,
    db_backed: runtimeStateStatus === RUNTIME_STATUS.DB_BACKED,
    paper_only: performanceSource === RUNTIME_STATUS.PAPER_ONLY,
    realized: performanceSource === RUNTIME_STATUS.REALIZED,
    backtest_only: performanceSource === RUNTIME_STATUS.BACKTEST_ONLY,
    model_derived: signals.length > 0,
    experimental: runtimeStateStatus === RUNTIME_STATUS.EXPERIMENTAL,
    disconnected: false,
    performance_source: performanceSource
  };

  return {
    repo,
    userId,
    market,
    assetClass: args.assetClass,
    state,
    risk,
    signals,
    marketState,
    modules,
    performance,
    performanceSource,
    hasPerformanceSample,
    active,
    topSignal,
    avgVol,
    avgTemp,
    avgRiskOff,
    mode,
    suggestedGross,
    suggestedNet,
    today,
    safety,
    insights,
    runtimeStateStatus,
    runtimeTransparency
  };
}

function parseJsonObject(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function snapshotDateKey(iso: string): string {
  return String(iso || '').slice(0, 10);
}

function todayDateKey(input = new Date()): string {
  return String(input.toISOString()).slice(0, 10);
}

function localHourOrNow(hour?: number): number {
  if (Number.isFinite(hour)) {
    return Math.max(0, Math.min(23, Number(hour)));
  }
  return new Date().getHours();
}

function localDateOrToday(date?: string): string {
  const value = String(date || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayDateKey();
}

function weekStartKey(dateKey: string): string {
  const base = new Date(`${dateKey}T00:00:00`);
  if (!Number.isFinite(base.getTime())) return dateKey;
  const weekday = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - weekday);
  return todayDateKey(base);
}

function parseOptionalJson(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function buildDecisionContextHash(args: {
  userId: string;
  market: Market;
  assetClass?: AssetClass;
  riskProfileKey?: string | null;
  runtimeStatus: string;
  holdings?: UserHoldingInput[];
  topActions: Array<{ signal_id?: string; symbol?: string }>;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass || 'ALL',
        riskProfileKey: args.riskProfileKey || 'balanced',
        runtimeStatus: args.runtimeStatus,
        holdings: (args.holdings || []).map((row) => ({
          symbol: row.symbol,
          asset_class: row.asset_class,
          market: row.market,
          weight_pct: row.weight_pct,
          quantity: row.quantity,
          sector: row.sector
        })),
        topActions: args.topActions
      })
    )
    .digest('hex');
}

function buildDecisionSnapshotFromCore(args: {
  core: RuntimeStateCore;
  holdings?: UserHoldingInput[];
  persist?: boolean;
  locale?: string;
}) {
  const evidenceTop = getTopSignalEvidence(args.core.repo, {
    userId: args.core.userId,
    market: args.core.market,
    assetClass: args.core.assetClass,
    limit: 6
  });
  const previousRow = args.core.repo.getLatestDecisionSnapshot({
    userId: args.core.userId,
    market: args.core.market,
    assetClass: args.core.assetClass || 'ALL'
  });
  const previousDecision = previousRow?.summary_json ? { summary: parseJsonObject(previousRow.summary_json) || {} } : null;
  const decision = buildDecisionSnapshot({
    userId: args.core.userId,
    market: args.core.market,
    assetClass: args.core.assetClass,
    asOf: String(args.core.runtimeTransparency.as_of),
    locale: args.locale,
    runtimeSourceStatus: String(args.core.runtimeTransparency.source_status),
    riskProfile: args.core.risk,
    signals: args.core.signals,
    evidenceSignals: evidenceTop.records || [],
    marketState: args.core.marketState,
    executions: listExecutions({
      userId: args.core.userId,
      market: args.core.market,
      limit: 60
    }),
    holdings: args.holdings,
    previousDecision
  });

  if (args.persist) {
    const snapshotDate = snapshotDateKey(String(args.core.runtimeTransparency.as_of));
    const contextHash = buildDecisionContextHash({
      userId: args.core.userId,
      market: args.core.market,
      assetClass: args.core.assetClass,
      riskProfileKey: args.core.risk?.profile_key,
      runtimeStatus: String(args.core.runtimeTransparency.source_status),
      holdings: args.holdings,
      topActions: (decision.ranked_action_cards || []).map((row: Record<string, unknown>) => ({
        signal_id: String(row.signal_id || ''),
        symbol: String(row.symbol || '')
      }))
    });
    const snapshotId = `decision-${createHash('sha256')
      .update(`${args.core.userId}:${args.core.market}:${args.core.assetClass || 'ALL'}:${snapshotDate}:${contextHash}`)
      .digest('hex')
      .slice(0, 24)}`;
    const nowMs = Date.now();
    args.core.repo.upsertDecisionSnapshot({
      id: snapshotId,
      user_id: args.core.userId,
      market: args.core.market,
      asset_class: args.core.assetClass || 'ALL',
      snapshot_date: snapshotDate,
      context_hash: contextHash,
      source_status: String(decision.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
      data_status: String(decision.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
      risk_state_json: JSON.stringify(decision.risk_state || {}),
      portfolio_context_json: JSON.stringify(decision.portfolio_context || {}),
      actions_json: JSON.stringify(decision.ranked_action_cards || []),
      summary_json: JSON.stringify(decision.summary || {}),
      top_action_id: String(decision.top_action_id || '') || null,
      created_at_ms: nowMs,
      updated_at_ms: nowMs
    });
    return {
      ...decision,
      audit_snapshot_id: snapshotId
    };
  }

  return decision;
}

export function getDecisionSnapshot(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  const core = loadRuntimeStateCore(args);
  return buildDecisionSnapshotFromCore({
    core,
    holdings: args.holdings,
    persist: true,
    locale: args.locale
  });
}

function getDecisionRowsForEngagement(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  getDecisionSnapshot(args);
  const repo = getRepo();
  const rows = repo.listDecisionSnapshots({
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass || undefined,
    limit: 6
  });
  const current = rows[0] || null;
  const previous = rows[1] || null;
  return { current, previous };
}

function serializeNotificationRows(rows: Array<ReturnType<MarketRepository['listNotificationEvents']>[number]>) {
  return rows.map((row) => ({
    ...row,
    reason: parseOptionalJson(row.reason_json)
  }));
}

function resolveNotificationPreferences(repo: MarketRepository, userId: string) {
  const existing = repo.getUserNotificationPreferences(userId);
  if (existing) return existing;
  const defaults = defaultNotificationPreferences(userId);
  repo.upsertUserNotificationPreferences(defaults);
  return defaults;
}

export function getEngagementState(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  const repo = getRepo();
  const userId = args.userId || 'guest-default';
  const market = args.market || 'US';
  const assetClass = args.assetClass || 'ALL';
  const { current, previous } = getDecisionRowsForEngagement(args);
  const preferences = resolveNotificationPreferences(repo, userId);
  const rituals = repo.listUserRitualEvents({
    userId,
    market,
    assetClass,
    limit: 120
  });

  const snapshot = buildEngagementSnapshot({
    userId,
    market,
    assetClass,
    localDate: localDateOrToday(args.localDate),
    localHour: localHourOrNow(args.localHour),
    locale: args.locale,
    decisionRow: current,
    previousDecisionRow: previous,
    ritualEvents: rituals,
    notificationPreferences: preferences
  });

  for (const notification of snapshot.notification_center.notifications || []) {
    repo.upsertNotificationEvent(notification);
  }

  const persistedNotifications = repo.listNotificationEvents({
    userId,
    market,
    assetClass,
    status: 'ACTIVE',
    limit: 12
  });

  return {
    ...snapshot,
    notification_center: {
      ...snapshot.notification_center,
      notifications: serializeNotificationRows(persistedNotifications)
    },
    decision_snapshot_id: current?.id || null
  };
}

function buildRitualEventId(args: {
  userId: string;
  market: Market;
  assetClass: AssetClass | 'ALL';
  eventDate: string;
  eventType: string;
}) {
  return `ritual-${createHash('sha256')
    .update(`${args.userId}:${args.market}:${args.assetClass}:${args.eventDate}:${args.eventType}`)
    .digest('hex')
    .slice(0, 20)}`;
}

function recordRitualEvent(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  locale?: string;
  eventType: 'MORNING_CHECK_COMPLETED' | 'RISK_BOUNDARY_CONFIRMED' | 'WRAP_UP_COMPLETED' | 'WEEKLY_REVIEW_COMPLETED';
  reason?: Record<string, unknown>;
  holdings?: UserHoldingInput[];
}) {
  const repo = getRepo();
  const userId = args.userId || 'guest-default';
  const market = args.market || 'US';
  const assetClass = args.assetClass || 'ALL';
  const eventDate = localDateOrToday(args.localDate);
  const { current } = getDecisionRowsForEngagement(args);
  const summary = parseOptionalJson(current?.summary_json);
  const nowMs = Date.now();

  repo.upsertUserRitualEvent({
    id: buildRitualEventId({
      userId,
      market,
      assetClass,
      eventDate,
      eventType: args.eventType
    }),
    user_id: userId,
    market,
    asset_class: assetClass,
    event_date: eventDate,
    week_key: args.eventType === 'WEEKLY_REVIEW_COMPLETED' ? weekStartKey(eventDate) : null,
    event_type: args.eventType,
    snapshot_id: current?.id || null,
    reason_json: JSON.stringify({
      risk_posture: summary?.risk_posture || null,
      top_action_id: current?.top_action_id || null,
      today_call: summary?.today_call || null,
      ...(args.reason || {})
    }),
    created_at_ms: nowMs,
    updated_at_ms: nowMs
  });

  return getEngagementState({
    userId,
    market,
    assetClass: assetClass === 'ALL' ? undefined : assetClass,
    localDate: eventDate,
    localHour: args.localHour,
    holdings: args.holdings,
    locale: args.locale
  });
}

export function completeMorningCheck(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  return recordRitualEvent({
    ...args,
    eventType: 'MORNING_CHECK_COMPLETED',
    reason: { source: 'today_check' }
  });
}

export function confirmRiskBoundary(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  return recordRitualEvent({
    ...args,
    eventType: 'RISK_BOUNDARY_CONFIRMED',
    reason: { source: 'user_boundary_confirmation' }
  });
}

export function completeWrapUp(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  return recordRitualEvent({
    ...args,
    eventType: 'WRAP_UP_COMPLETED',
    reason: { source: 'daily_wrap_up' }
  });
}

export function completeWeeklyReview(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  return recordRitualEvent({
    ...args,
    eventType: 'WEEKLY_REVIEW_COMPLETED',
    reason: { source: 'weekly_review' }
  });
}

export function getWidgetSummary(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  const snapshot = getEngagementState(args);
  return {
    as_of: snapshot.as_of,
    source_status: snapshot.source_status,
    data_status: snapshot.data_status,
    perception_layer: snapshot.perception_layer,
    widget_summary: snapshot.widget_summary,
    ui_regime_state: snapshot.ui_regime_state,
    recommendation_change: snapshot.recommendation_change
  };
}

export function getNotificationPreview(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  const snapshot = getEngagementState(args);
  return {
    as_of: snapshot.as_of,
    source_status: snapshot.source_status,
    data_status: snapshot.data_status,
    notification_center: snapshot.notification_center
  };
}

export function getNotificationPreferencesState(userId = 'guest-default') {
  const repo = getRepo();
  return resolveNotificationPreferences(repo, userId);
}

export function setNotificationPreferencesState(args: {
  userId?: string;
  updates: Partial<{
    morning_enabled: number;
    state_shift_enabled: number;
    protective_enabled: number;
    wrap_up_enabled: number;
    frequency: 'LOW' | 'NORMAL';
    quiet_start_hour: number | null;
    quiet_end_hour: number | null;
  }>;
}) {
  const repo = getRepo();
  const userId = args.userId || 'guest-default';
  const current = resolveNotificationPreferences(repo, userId);
  const sanitizedUpdates = Object.fromEntries(
    Object.entries(args.updates || {}).filter(([, value]) => value !== undefined)
  ) as typeof args.updates;
  const next = {
    ...current,
    ...sanitizedUpdates,
    updated_at_ms: Date.now()
  };
  repo.upsertUserNotificationPreferences(next);
  return next;
}

export function listDecisionAudit(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  limit?: number;
}) {
  const repo = getRepo();
  const rows = repo.listDecisionSnapshots({
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass || undefined,
    limit: args.limit || 20
  });
  return {
    count: rows.length,
    records: rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      market: row.market,
      asset_class: row.asset_class,
      snapshot_date: row.snapshot_date,
      source_status: row.source_status,
      data_status: row.data_status,
      top_action_id: row.top_action_id,
      summary: parseJsonObject(row.summary_json),
      risk_state: parseJsonObject(row.risk_state_json),
      portfolio_context: parseJsonObject(row.portfolio_context_json),
      actions: (() => {
        try {
          return JSON.parse(row.actions_json || '[]');
        } catch {
          return [];
        }
      })(),
      updated_at_ms: row.updated_at_ms
    }))
  };
}

export function getRuntimeState(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
}) {
  const core = loadRuntimeStateCore(args);
  const decision = buildDecisionSnapshotFromCore({
    core,
    persist: false
  });

  return {
    asof: core.runtimeTransparency.as_of,
    source_status: core.runtimeTransparency.source_status,
    data_status: core.runtimeTransparency.data_status,
    data_transparency: core.runtimeTransparency,
    data: {
      signals: core.signals,
      performance: core.performance,
      decision,
      trades: listExecutions({ userId: core.userId, market: core.market, limit: 200 }).map((row) => ({
        ...row,
        time_in: new Date(row.created_at_ms).toISOString(),
        time_out: new Date(row.created_at_ms).toISOString(),
        entry: row.entry_price,
        exit: row.tp_price ?? row.entry_price
      })),
      velocity: {
        as_of: core.runtimeTransparency.as_of,
        market: core.market,
        volatility_percentile: core.avgVol,
        temperature_percentile: core.avgTemp,
        risk_off_score: core.avgRiskOff,
        ...withComponentStatus({
          overallDataStatus: normalizeRuntimeStatus(core.runtimeTransparency.data_status, RUNTIME_STATUS.INSUFFICIENT_DATA),
          componentSourceStatus: RUNTIME_STATUS.MODEL_DERIVED
        })
      },
      config: {
        last_updated: core.runtimeTransparency.as_of,
        ...withComponentStatus({
          overallDataStatus: normalizeRuntimeStatus(core.runtimeTransparency.data_status, RUNTIME_STATUS.INSUFFICIENT_DATA),
          componentSourceStatus: RUNTIME_STATUS.MODEL_DERIVED
        }),
        risk_rules: {
          per_trade_risk_pct: core.risk?.max_loss_per_trade ?? null,
          daily_loss_pct: core.risk?.max_daily_loss ?? null,
          max_dd_pct: core.risk?.max_drawdown ?? null,
          exposure_cap_pct: core.risk?.exposure_cap ?? null,
          vol_switch: true
        },
        risk_status: {
          current_risk_bucket: core.mode.toUpperCase(),
          bucket_state: core.mode.toUpperCase(),
          diagnostics: {
            daily_pnl_pct: null,
            max_dd_pct: null
          }
        },
        runtime: core.runtimeTransparency
      },
      market_modules: core.modules,
      analytics: {
        source_status: core.runtimeTransparency.source_status,
        runtime: core.runtimeTransparency,
        status_flags: {
          runtime_source: core.runtimeTransparency.source_status,
          performance_source: core.performanceSource,
          has_performance_sample: core.hasPerformanceSample
        }
      },
      research: {
        ...withComponentStatus({
          overallDataStatus: normalizeRuntimeStatus(core.runtimeTransparency.data_status, RUNTIME_STATUS.INSUFFICIENT_DATA),
          componentSourceStatus: RUNTIME_STATUS.MODEL_DERIVED
        }),
        notes: [
          core.runtimeTransparency.data_status === RUNTIME_STATUS.DB_BACKED
            ? 'Runtime app state is DB-backed; advanced research modules remain experimental in this API path.'
            : 'Runtime app state is currently insufficient for high-confidence research overlays.'
        ]
      },
      today: core.today,
      safety: core.safety,
      insights: core.insights,
      ai: {
        source_transparency: core.runtimeTransparency
      },
      layers: {
        data_layer: {
          instruments: core.marketState.map((row) => ({
            ticker: row.symbol,
            market: row.market,
            latest_close: null,
            sector: row.market === 'CRYPTO' ? 'Crypto' : 'US'
          }))
        },
        portfolio_layer: {
          candidates: core.active.slice(0, 12).map((row) => ({
            ticker: row.symbol,
            direction: row.direction,
            grade: row.grade,
            confidence: row.confidence,
            risk_score: row.volatility_percentile,
            entry_plan: {
              entry_zone: row.entry_zone
            }
          })),
          filtered_out: core.signals
            .filter((row) => !['NEW', 'TRIGGERED'].includes(String(row.status)))
            .slice(0, 12)
            .map((row) => ({ ticker: row.symbol, reason: row.status }))
        }
      }
    }
  };
}

export function runEvidence(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  timeframe?: string;
  maxSignals?: number;
  force?: boolean;
}) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    assetClass: args.assetClass,
    timeframe: args.timeframe
  });
  return runEvidenceEngine(repo, {
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass,
    timeframe: args.timeframe,
    maxSignals: args.maxSignals,
    force: args.force
  });
}

export function getEvidenceTopSignals(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  limit?: number;
}) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    assetClass: args.assetClass
  });
  return getTopSignalEvidence(repo, {
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass,
    limit: args.limit
  });
}

export function getEvidenceSignalDetail(args: { signalId: string; userId?: string }) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false);
  return getSignalEvidenceDetail(repo, {
    signalId: args.signalId,
    userId: args.userId || 'guest-default'
  });
}

export function listEvidenceBacktests(args?: {
  runType?: string;
  status?: string;
  strategyVersionId?: string;
  limit?: number;
}) {
  const repo = getRepo();
  return listBacktestEvidence(repo, {
    runType: args?.runType,
    status: args?.status,
    strategyVersionId: args?.strategyVersionId,
    limit: args?.limit
  });
}

export function getEvidenceBacktestDetail(runId: string) {
  const repo = getRepo();
  return getBacktestEvidenceDetail(repo, runId);
}

export function listEvidenceReconciliation(args?: {
  replayRunId?: string;
  symbol?: string;
  strategyVersionId?: string;
  status?: 'RECONCILED' | 'PAPER_DATA_UNAVAILABLE' | 'REPLAY_DATA_UNAVAILABLE' | 'PARTIAL';
  limit?: number;
}) {
  const repo = getRepo();
  return listReconciliationEvidence(repo, {
    replayRunId: args?.replayRunId,
    symbol: args?.symbol,
    strategyVersionId: args?.strategyVersionId,
    status: args?.status,
    limit: args?.limit
  });
}

export function getEvidenceChampionStrategies() {
  const repo = getRepo();
  return getChampionStrategies(repo);
}

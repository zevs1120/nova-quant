import type {
  AssetClass,
  CryptoPayload,
  ExecutionAction,
  ExecutionMode,
  ExecutionRecord,
  Market,
  MarketStateRecord,
  OptionsIntradayPayload,
  RiskProfileKey,
  SignalContract,
  SignalStatus,
  StockSwingPayload,
  UserRiskProfileRecord,
} from '../types.js';
import { MarketRepository } from '../db/repository.js';
import { deliverSignalToDiscord } from '../delivery/discord.js';
import { deliverSignalToInternalInbox } from '../delivery/inbox.js';
import { generateGovernedNovaStrategies } from '../nova/strategyLab.js';
import { deriveRuntimeState } from './runtimeDerivation.js';

const DEFAULT_RISK_PROFILE: RiskProfileKey = 'balanced';
const RISK_PROFILES: Record<
  RiskProfileKey,
  {
    max_loss_per_trade_pct: number;
    max_daily_loss_pct: number;
    max_drawdown_pct: number;
    exposure_cap_pct: number;
    leverage_cap: number;
  }
> = {
  conservative: {
    max_loss_per_trade_pct: 0.7,
    max_daily_loss_pct: 1.8,
    max_drawdown_pct: 8,
    exposure_cap_pct: 35,
    leverage_cap: 1.5,
  },
  balanced: {
    max_loss_per_trade_pct: 1.0,
    max_daily_loss_pct: 3.0,
    max_drawdown_pct: 12,
    exposure_cap_pct: 55,
    leverage_cap: 2,
  },
  aggressive: {
    max_loss_per_trade_pct: 1.4,
    max_daily_loss_pct: 4.5,
    max_drawdown_pct: 18,
    exposure_cap_pct: 75,
    leverage_cap: 3,
  },
};

interface RawSignal {
  signal_id: string;
  asset_class?: AssetClass;
  strategy_id?: string;
  market: Market;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  status: 'PENDING' | 'TRIGGERED' | 'CLOSED' | 'EXPIRED';
  confidence: number;
  generated_at: string;
  entry_min: number;
  entry_max: number;
  stop_loss: number;
  take_profit: number;
  position_size_pct: number;
  validity: '24H' | 'UNTIL_TRIGGERED';
  rationale: string[];
  model_version?: string;
  payload?: Record<string, unknown>;
}

interface QuantDataSnapshot {
  asofMs: number;
  signals: SignalContract[];
  marketState: MarketStateRecord[];
  performanceApi: Record<string, unknown>;
  sourceStatus: string;
  freshnessSummary: Record<string, unknown>;
  coverageSummary: Record<string, unknown>;
}

export interface QuantRuntimeContext {
  userId: string;
  riskProfileKey: RiskProfileKey;
  market: Market | 'ALL';
  assetClass: AssetClass | 'ALL';
  timeframe: string;
  universeScope: string;
}

interface QuantCacheEntry {
  key: string;
  context: QuantRuntimeContext;
  snapshot: QuantDataSnapshot;
  createdAt: number;
  expiresAt: number;
  sourceSummary: {
    source_status: string;
    signal_count: number;
    market_state_count: number;
  };
}

const CACHE_TTL_MS = 45_000;
const cacheByKey = new Map<string, QuantCacheEntry>();

function round(value: number, digits = 4): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function hashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function fallbackRiskProfile(userId = 'guest-default'): UserRiskProfileRecord {
  const profile = RISK_PROFILES[DEFAULT_RISK_PROFILE];
  return {
    user_id: userId,
    profile_key: DEFAULT_RISK_PROFILE,
    max_loss_per_trade: profile.max_loss_per_trade_pct,
    max_daily_loss: profile.max_daily_loss_pct,
    max_drawdown: profile.max_drawdown_pct,
    exposure_cap: profile.exposure_cap_pct,
    leverage_cap: profile.leverage_cap,
    updated_at_ms: Date.now(),
  };
}

function riskProfileForUser(
  repo: MarketRepository,
  userId: string,
  overrideProfileKey?: RiskProfileKey,
): UserRiskProfileRecord {
  const existing = repo.getUserRiskProfile(userId);
  if (overrideProfileKey && overrideProfileKey !== existing?.profile_key) {
    const preset = RISK_PROFILES[overrideProfileKey] || RISK_PROFILES[DEFAULT_RISK_PROFILE];
    return {
      user_id: userId,
      profile_key: overrideProfileKey,
      max_loss_per_trade: preset.max_loss_per_trade_pct,
      max_daily_loss: preset.max_daily_loss_pct,
      max_drawdown: preset.max_drawdown_pct,
      exposure_cap: preset.exposure_cap_pct,
      leverage_cap: preset.leverage_cap,
      updated_at_ms: Date.now(),
    };
  }
  return existing ?? fallbackRiskProfile(userId);
}

function sanitizeToken(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return raw.replace(/\s+/g, '_').slice(0, 80);
}

function buildCacheContext(args: {
  userId: string;
  riskProfileKey: RiskProfileKey;
  market?: Market | 'ALL';
  assetClass?: AssetClass | 'ALL';
  timeframe?: string;
  universeScope?: string;
}): QuantRuntimeContext {
  return {
    userId: sanitizeToken(args.userId, 'guest-default'),
    riskProfileKey: args.riskProfileKey,
    market: (args.market as Market | 'ALL' | undefined) || 'ALL',
    assetClass: (args.assetClass as AssetClass | 'ALL' | undefined) || 'ALL',
    timeframe: sanitizeToken(args.timeframe, 'default'),
    universeScope: sanitizeToken(args.universeScope, 'global'),
  };
}

function buildCacheKey(context: QuantRuntimeContext): string {
  return [
    `user:${context.userId}`,
    `risk:${context.riskProfileKey}`,
    `market:${context.market}`,
    `asset:${context.assetClass}`,
    `tf:${context.timeframe}`,
    `scope:${context.universeScope}`,
  ].join('|');
}

function pruneExpiredCache(nowMs: number) {
  for (const [key, entry] of cacheByKey.entries()) {
    if (entry.expiresAt <= nowMs) {
      cacheByKey.delete(key);
    }
  }
}

const strategyFactoryRefreshLocks = new Set<string>();

function defaultStrategyFactoryPrompt(market: Market, riskProfileKey: string) {
  return market === 'CRYPTO'
    ? `Generate governed crypto strategies for ${riskProfileKey} risk that can ship as daily signal cards with explicit risk controls and liquid symbols.`
    : `Generate governed US equity strategies for ${riskProfileKey} risk that can ship as daily signal cards with explicit risk controls and liquid symbols.`;
}

function maybeRefreshStrategyFactory(args: {
  repo: MarketRepository;
  userId: string;
  market: Market;
  riskProfileKey: string;
}) {
  const lockKey = `${args.userId}:${args.market}`;
  if (strategyFactoryRefreshLocks.has(lockKey)) return;

  const latestRun = args.repo
    .listWorkflowRuns({
      workflowKey: 'nova_strategy_lab',
      status: 'SUCCEEDED',
      limit: 10,
    })
    .find((row) => {
      try {
        const input = JSON.parse(row.input_json || '{}') as Record<string, unknown>;
        const constraints =
          input.constraints && typeof input.constraints === 'object'
            ? (input.constraints as Record<string, unknown>)
            : {};
        return String(constraints.market || input.market || '').toUpperCase() === args.market;
      } catch {
        return false;
      }
    });

  const lastUpdatedMs = latestRun?.completed_at_ms || latestRun?.updated_at_ms || 0;
  if (lastUpdatedMs && Date.now() - lastUpdatedMs < 6 * 3600_000) return;

  strategyFactoryRefreshLocks.add(lockKey);
  void generateGovernedNovaStrategies({
    repo: args.repo,
    userId: args.userId,
    prompt: defaultStrategyFactoryPrompt(args.market, args.riskProfileKey),
    market: args.market,
    riskProfile: args.riskProfileKey,
    maxCandidates: 8,
  })
    .catch(() => {})
    .finally(() => {
      strategyFactoryRefreshLocks.delete(lockKey);
    });
}

export function __resetQuantDataCacheForTests() {
  cacheByKey.clear();
}

export function __buildQuantCacheKeyForTests(context: QuantRuntimeContext): string {
  return buildCacheKey(context);
}

function parseSignalPayload(payloadJson: string): SignalContract | null {
  try {
    const parsed = JSON.parse(payloadJson) as Partial<SignalContract> & Record<string, unknown>;
    const market = parsed.market === 'CRYPTO' ? 'CRYPTO' : 'US';
    const assetClass: AssetClass =
      parsed.asset_class ??
      (market === 'CRYPTO'
        ? 'CRYPTO'
        : /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(String(parsed.symbol || ''))
          ? 'OPTIONS'
          : 'US_STOCK');
    const parsedStatus = String(parsed.status || '').toUpperCase();
    const normalizedStatus: SignalStatus =
      parsedStatus === 'PENDING' ? 'NEW' : (parsed.status as SignalStatus) || 'NEW';
    if (!parsed.payload) {
      const entryMid =
        (Number(parsed.entry_zone?.low ?? 0) + Number(parsed.entry_zone?.high ?? 0)) / 2 || 1;
      parsed.payload = buildPayload(
        {
          signal_id: String(parsed.id || 'LEGACY'),
          asset_class: assetClass,
          market,
          symbol: String(parsed.symbol || '--'),
          direction: (parsed.direction as 'LONG' | 'SHORT') || 'LONG',
          status: 'PENDING',
          confidence: Number(parsed.confidence || 0.5) * 5,
          generated_at: String(parsed.created_at || new Date().toISOString()),
          entry_min: Number(parsed.entry_zone?.low ?? 0),
          entry_max: Number(parsed.entry_zone?.high ?? 0),
          stop_loss: Number(parsed.stop_loss?.price ?? 0),
          take_profit: Number(parsed.take_profit_levels?.[0]?.price ?? 0),
          position_size_pct: Number(parsed.position_advice?.position_pct ?? 0),
          validity: '24H',
          rationale: Array.isArray(parsed.explain_bullets) ? parsed.explain_bullets : [],
        },
        assetClass,
        entryMid,
      );
    }
    return {
      ...(parsed as SignalContract),
      asset_class: assetClass,
      status: normalizedStatus,
    };
  } catch {
    return null;
  }
}

function buildOptionsPayload(raw: RawSignal, entryMid: number): OptionsIntradayPayload {
  const put = raw.direction === 'SHORT';
  const strike = Math.round(entryMid);
  const expiry = new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    underlying: {
      symbol: raw.symbol.match(/^[A-Z]+/)?.[0] || raw.symbol,
      spot_price: round(entryMid, 2),
      session: 'REG',
    },
    option_contract: {
      side: put ? 'PUT' : 'CALL',
      expiry,
      strike,
      dte: 6,
      contract_symbol: raw.symbol,
    },
    time_stop: {
      eod_flatten: true,
      latest_exit_utc: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    greeks_iv: {
      delta: round(put ? -0.35 : 0.35, 2),
      iv_percentile: round(45 + (hashCode(raw.signal_id) % 50), 2),
      expected_move: round(entryMid * 0.012, 3),
    },
  };
}

function buildStockPayload(raw: RawSignal): StockSwingPayload {
  const horizon: StockSwingPayload['horizon'] =
    raw.strategy_id === 'EQ_SWING' ? 'MEDIUM' : raw.strategy_id === 'EQ_EVT' ? 'SHORT' : 'LONG';
  return {
    horizon,
    catalysts:
      raw.strategy_id === 'EQ_EVT'
        ? ['earnings-window', 'macro-vol-burst']
        : ['index-regime', 'sector-leadership'],
  };
}

function buildCryptoPayload(raw: RawSignal): CryptoPayload {
  const h = hashCode(raw.signal_id);
  const funding = round((((h % 30) - 15) / 10000) * (raw.direction === 'LONG' ? 1 : -1), 6);
  const basisBps = round(10 + (h % 90), 2);
  const basisPct = round(15 + (h % 80), 2);
  return {
    venue: 'BINANCE',
    instrument_type: 'PERP',
    perp_metrics: {
      funding_rate_current: funding,
      funding_rate_8h: round(funding * 0.9, 6),
      funding_rate_24h: round(funding * 2.2, 6),
      basis_bps: basisBps,
      basis_percentile: basisPct,
      open_interest: 1_500_000 + (h % 400_000),
      premium_index: round(((h % 120) - 60) / 10_000, 6),
    },
    flow_state: {
      spot_led_breakout: h % 2 === 0,
      perp_led_breakout: h % 3 === 0,
      funding_state: Math.abs(funding) > 0.0012 ? 'EXTREME' : 'NEUTRAL',
    },
    leverage_suggestion: {
      suggested_leverage: raw.status === 'TRIGGERED' ? 1.5 : 1.2,
      capped_by_profile: true,
    },
  };
}

function buildPayload(
  raw: RawSignal,
  assetClass: AssetClass,
  entryMid: number,
): SignalContract['payload'] {
  if (assetClass === 'OPTIONS') {
    return { kind: 'OPTIONS_INTRADAY', data: buildOptionsPayload(raw, entryMid) };
  }
  if (assetClass === 'US_STOCK') {
    return { kind: 'STOCK_SWING', data: buildStockPayload(raw) };
  }
  return { kind: 'CRYPTO', data: buildCryptoPayload(raw) };
}

export function ensureQuantData(
  repo: MarketRepository,
  userId = 'guest-default',
  force = false,
  context?: {
    riskProfileKey?: RiskProfileKey;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    timeframe?: string;
    universeScope?: string;
    allowBackgroundStrategyRefresh?: boolean;
  },
): QuantDataSnapshot {
  const riskProfile = riskProfileForUser(repo, userId, context?.riskProfileKey);
  repo.upsertUserRiskProfile(riskProfile);

  const cacheContext = buildCacheContext({
    userId,
    riskProfileKey: riskProfile.profile_key,
    market: context?.market,
    assetClass: context?.assetClass,
    timeframe: context?.timeframe,
    universeScope: context?.universeScope,
  });
  const cacheKey = buildCacheKey(cacheContext);
  const now = Date.now();
  pruneExpiredCache(now);

  if (force) {
    cacheByKey.delete(cacheKey);
  } else {
    const cached = cacheByKey.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.snapshot;
    }
  }

  const derived = deriveRuntimeState({
    repo,
    userId,
    riskProfile,
  });

  maybeRefreshStrategyFactory({
    repo,
    userId,
    market: 'US',
    riskProfileKey: riskProfile.profile_key,
  });
  maybeRefreshStrategyFactory({
    repo,
    userId,
    market: 'CRYPTO',
    riskProfileKey: riskProfile.profile_key,
  });

  const contracts = derived.signals as SignalContract[];

  const existing = new Map(
    repo.listSignals({ limit: 500 }).map((row) => [row.signal_id, row.status]),
  );
  for (const signal of contracts) {
    const prev = existing.get(signal.id);
    if (!prev) {
      repo.appendSignalEvent(signal.id, 'CREATED', { status: signal.status });
      deliverSignalToInternalInbox({
        repo,
        userId,
        signal,
        eventType: 'CREATED',
      });
      void deliverSignalToDiscord({
        repo,
        signal,
        eventType: 'CREATED',
      });
    } else if (prev !== signal.status) {
      repo.appendSignalEvent(signal.id, 'STATUS_CHANGED', { from: prev, to: signal.status });
      deliverSignalToInternalInbox({
        repo,
        userId,
        signal,
        eventType: 'STATUS_CHANGED',
      });
      void deliverSignalToDiscord({
        repo,
        signal,
        eventType: 'STATUS_CHANGED',
      });
    }
  }

  const snapshot: QuantDataSnapshot = {
    asofMs: derived.asofMs,
    signals: contracts,
    marketState: derived.marketState,
    performanceApi: derived.performanceApi,
    sourceStatus: derived.sourceStatus,
    freshnessSummary: derived.freshnessSummary,
    coverageSummary: derived.coverageSummary,
  };

  cacheByKey.set(cacheKey, {
    key: cacheKey,
    context: cacheContext,
    snapshot,
    createdAt: now,
    expiresAt: now + CACHE_TTL_MS,
    sourceSummary: {
      source_status: snapshot.sourceStatus,
      signal_count: snapshot.signals.length,
      market_state_count: snapshot.marketState.length,
    },
  });

  return snapshot;
}

export function decodeSignalContract(record: { payload_json: string }): SignalContract | null {
  return parseSignalPayload(record.payload_json);
}

export function createExecutionRecord(input: {
  signal: SignalContract;
  userId: string;
  mode: ExecutionMode;
  action: ExecutionAction;
  note?: string;
  pnlPct?: number | null;
}): ExecutionRecord {
  const now = Date.now();
  const tp = input.signal.take_profit_levels?.[0]?.price ?? null;
  return {
    execution_id: `EXE-${now}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    signal_id: input.signal.id,
    user_id: input.userId,
    mode: input.mode,
    action: input.action,
    market: input.signal.market,
    symbol: input.signal.symbol,
    entry_price: round((input.signal.entry_zone.low + input.signal.entry_zone.high) / 2, 6),
    stop_price: input.signal.stop_loss.price,
    tp_price: tp,
    size_pct: input.signal.position_advice.position_pct,
    pnl_pct: input.pnlPct ?? null,
    note: input.note,
    created_at_ms: now,
    updated_at_ms: now,
  };
}

import type {
  AssetClass,
  CryptoPayload,
  ExecutionAction,
  ExecutionMode,
  ExecutionRecord,
  Market,
  MarketStateRecord,
  OptionsIntradayPayload,
  PerformanceSnapshotRecord,
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

const STRATEGY_TEMPLATE_VERSION = 'strategy-templates-2026-03-04.1';
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
const DYNAMIC_RISK_BUCKETS = {
  DERISKED: { multiplier: 0.6 },
  RECOVERY_STEP_1: { multiplier: 0.78 },
  RECOVERY_STEP_2: { multiplier: 0.9 },
  BASE: { multiplier: 1 },
} as const;

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

interface RawPerformanceRecord {
  market: Market;
  range: string;
  kpis: Record<string, number>;
  assumptions: Record<string, unknown>;
  equity_curve: {
    dates: string[];
    backtest: number[];
    live: number[];
  };
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

interface StrategyTemplate {
  strategy_id: string;
  strategy_family: string;
  asset_class: AssetClass;
  strategy_version: string;
  timeframe: string;
  entry_method: 'MARKET' | 'LIMIT' | 'SPLIT_LIMIT';
  stop_type: 'STRUCTURE' | 'ATR' | 'HYBRID';
  trailing_type: 'EMA' | 'CHAND_EXIT' | 'NONE';
  cost: {
    fee_bps: number;
    spread_bps: number;
    slippage_bps: number;
    funding_est_bps?: number;
    basis_est?: number;
  };
  failure_modes: string[];
  tags: string[];
}

const CACHE_TTL_MS = 45_000;
const cacheByKey = new Map<string, QuantCacheEntry>();
const bucketStateByMarket = new Map<Market, keyof typeof DYNAMIC_RISK_BUCKETS>();

const STRATEGY_LIBRARY: Record<string, StrategyTemplate> = {
  CR_BAS: {
    strategy_id: 'CR_BAS',
    strategy_family: 'Carry/Basis',
    asset_class: 'CRYPTO',
    strategy_version: STRATEGY_TEMPLATE_VERSION,
    timeframe: '4h',
    entry_method: 'SPLIT_LIMIT' as const,
    stop_type: 'HYBRID' as const,
    trailing_type: 'EMA' as const,
    cost: {
      fee_bps: 4.8,
      spread_bps: 3.2,
      slippage_bps: 4.3,
      funding_est_bps: 2.4,
      basis_est: 3.2,
    },
    failure_modes: [
      'Funding turns one-sided',
      'Basis collapses while spot lags',
      'Cross-venue spread widens',
    ],
    tags: ['basis positive', 'funding mean reversion'],
  },
  CR_VEL: {
    strategy_id: 'CR_VEL',
    strategy_family: 'Momentum/Breakout',
    asset_class: 'CRYPTO',
    strategy_version: STRATEGY_TEMPLATE_VERSION,
    timeframe: '1h',
    entry_method: 'LIMIT' as const,
    stop_type: 'ATR' as const,
    trailing_type: 'CHAND_EXIT' as const,
    cost: {
      fee_bps: 5.2,
      spread_bps: 4.5,
      slippage_bps: 5.8,
      funding_est_bps: 2.8,
      basis_est: 1.3,
    },
    failure_modes: [
      'Breakout without retest',
      'Acceleration quickly fades',
      'Open interest diverges',
    ],
    tags: ['velocity surge', 'breakout retest'],
  },
  CR_TRAP: {
    strategy_id: 'CR_TRAP',
    strategy_family: 'Defensive Vol',
    asset_class: 'CRYPTO',
    strategy_version: STRATEGY_TEMPLATE_VERSION,
    timeframe: '1h',
    entry_method: 'LIMIT' as const,
    stop_type: 'STRUCTURE' as const,
    trailing_type: 'NONE' as const,
    cost: {
      fee_bps: 5.5,
      spread_bps: 5.1,
      slippage_bps: 6.5,
      funding_est_bps: 3.1,
      basis_est: 0.8,
    },
    failure_modes: ['Liquidity pockets vanish', 'Gap-through stop', 'Panic reversal'],
    tags: ['high-vol guard', 'defensive'],
  },
  CR_CARRY: {
    strategy_id: 'CR_CARRY',
    strategy_family: 'Carry/Bias',
    asset_class: 'CRYPTO',
    strategy_version: STRATEGY_TEMPLATE_VERSION,
    timeframe: '8h',
    entry_method: 'LIMIT' as const,
    stop_type: 'HYBRID' as const,
    trailing_type: 'EMA' as const,
    cost: {
      fee_bps: 4.2,
      spread_bps: 2.8,
      slippage_bps: 3.9,
      funding_est_bps: 2.0,
      basis_est: 2.5,
    },
    failure_modes: [
      'Funding flips abruptly',
      'Basis percentile turns crowded',
      'Risk-off correlation jump',
    ],
    tags: ['carry-favorable', 'funding-aligned'],
  },
  EQ_VEL: {
    strategy_id: 'EQ_VEL',
    strategy_family: 'Trend/Velocity',
    asset_class: 'US_STOCK',
    strategy_version: STRATEGY_TEMPLATE_VERSION,
    timeframe: '1d',
    entry_method: 'LIMIT' as const,
    stop_type: 'ATR' as const,
    trailing_type: 'EMA' as const,
    cost: { fee_bps: 2.8, spread_bps: 1.4, slippage_bps: 2.6, basis_est: 0.2 },
    failure_modes: ['Index breadth fails', 'Volume confirmation missing', 'Gap against trend'],
    tags: ['index-led', 'trend-follow'],
  },
  EQ_EVT: {
    strategy_id: 'EQ_EVT',
    strategy_family: 'Event/Expansion',
    asset_class: 'US_STOCK',
    strategy_version: STRATEGY_TEMPLATE_VERSION,
    timeframe: '4h',
    entry_method: 'SPLIT_LIMIT' as const,
    stop_type: 'HYBRID' as const,
    trailing_type: 'CHAND_EXIT' as const,
    cost: { fee_bps: 3.2, spread_bps: 2.1, slippage_bps: 3.7, basis_est: 0.3 },
    failure_modes: ['IV crush after entry', 'Event drift reverses', 'Gap leaves no refill'],
    tags: ['event-vol burst', 'earnings proxy'],
  },
  EQ_REG: {
    strategy_id: 'EQ_REG',
    strategy_family: 'Regime Filter',
    asset_class: 'US_STOCK',
    strategy_version: STRATEGY_TEMPLATE_VERSION,
    timeframe: '1d',
    entry_method: 'MARKET' as const,
    stop_type: 'STRUCTURE' as const,
    trailing_type: 'EMA' as const,
    cost: { fee_bps: 2.4, spread_bps: 1.2, slippage_bps: 2.1, basis_est: 0.2 },
    failure_modes: ['QQQ/SPY diverges', 'Risk-off spike', 'Macro correlation shock'],
    tags: ['regime gate', 'index control'],
  },
  EQ_SWING: {
    strategy_id: 'EQ_SWING',
    strategy_family: 'Swing/Horizon',
    asset_class: 'US_STOCK',
    strategy_version: STRATEGY_TEMPLATE_VERSION,
    timeframe: '1d',
    entry_method: 'LIMIT' as const,
    stop_type: 'HYBRID' as const,
    trailing_type: 'EMA' as const,
    cost: { fee_bps: 2.6, spread_bps: 1.4, slippage_bps: 2.5, basis_est: 0.2 },
    failure_modes: ['Catalyst reverses', 'Breadth weakens', 'Gap-through stop on macro shock'],
    tags: ['swing', 'multi-horizon'],
  },
  OP_INTRADAY: {
    strategy_id: 'OP_INTRADAY',
    strategy_family: 'Options Intraday',
    asset_class: 'OPTIONS',
    strategy_version: STRATEGY_TEMPLATE_VERSION,
    timeframe: '15m',
    entry_method: 'LIMIT' as const,
    stop_type: 'STRUCTURE' as const,
    trailing_type: 'NONE' as const,
    cost: { fee_bps: 8.5, spread_bps: 9.5, slippage_bps: 7.2, basis_est: 0.4 },
    failure_modes: ['Spread widens too far', 'IV crush before trigger', 'No liquidity near strike'],
    tags: ['intraday options', 'eod-flatten'],
  },
};

type StrategyKey = keyof typeof STRATEGY_LIBRARY;

const SYMBOL_TO_STRATEGY: Record<string, StrategyKey> = {
  'CRYPTO:BTC-USDT': 'CR_BAS',
  'CRYPTO:ETH-USDT': 'CR_VEL',
  'CRYPTO:XRP-USDT': 'CR_CARRY',
  'CRYPTO:SOL-USDT': 'CR_VEL',
  'CRYPTO:BNB-USDT': 'CR_TRAP',
  'US:SPY': 'EQ_REG',
  'US:AAPL': 'EQ_VEL',
  'US:AMZN': 'EQ_SWING',
  'US:TSLA': 'EQ_VEL',
  'US:NVDA': 'EQ_EVT',
  'US:MSFT': 'EQ_SWING',
  'US:SPY240621C00540000': 'OP_INTRADAY',
  'US:QQQ240621P00460000': 'OP_INTRADAY',
  'US:AAPL240621C00215000': 'OP_INTRADAY',
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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

function inferAssetClass(raw: RawSignal): AssetClass {
  if (raw.asset_class) return raw.asset_class;
  if (raw.market === 'CRYPTO') return 'CRYPTO';
  // OCC options symbol: ROOT(1-6 alpha) + YYMMDD + C/P + 8-digit strike
  if (/^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(raw.symbol)) return 'OPTIONS';
  return 'US_STOCK';
}

function resolveStrategy(raw: RawSignal): StrategyKey {
  const mapped = SYMBOL_TO_STRATEGY[`${raw.market}:${raw.symbol}`];
  if (mapped) return mapped;
  const assetClass = inferAssetClass(raw);
  if (assetClass === 'OPTIONS') return 'OP_INTRADAY';
  if (assetClass === 'CRYPTO') return 'CR_VEL';
  return 'EQ_SWING';
}

function resolveStatus(
  rawStatus: RawSignal['status'],
  createdAtMs: number,
  expiresAtMs: number,
): SignalStatus {
  const now = Date.now();
  if (now > expiresAtMs) return 'EXPIRED';
  if (rawStatus === 'TRIGGERED') return 'TRIGGERED';
  if (rawStatus === 'CLOSED') return 'INVALIDATED';
  if (rawStatus === 'EXPIRED') return 'EXPIRED';
  if (now < createdAtMs) return 'NEW';
  return 'NEW';
}

function inferExpiresAt(raw: RawSignal): number {
  const createdAt = Date.parse(raw.generated_at) || Date.now();
  if (raw.validity === '24H') return createdAt + 24 * 3600 * 1000;
  return createdAt + 48 * 3600 * 1000;
}

function deriveMarketState(
  raw: RawSignal,
  velocityPct: number,
): {
  temperature_percentile: number;
  volatility_percentile: number;
  trend_strength: number;
  risk_off_score: number;
  regime_id: string;
  stance: string;
} {
  const h = hashCode(`${raw.market}:${raw.symbol}:${raw.signal_id}`);
  const bias = (h % 27) - 13;
  const temp = clamp(velocityPct + bias, 4, 99);
  const vol = clamp(40 + ((h >> 3) % 55), 5, 99);
  const trend = clamp(
    0.4 + raw.confidence / 10 + (raw.direction === 'LONG' ? 0.08 : -0.06),
    0.05,
    0.95,
  );
  const crossCorrProxy = raw.market === 'CRYPTO' ? clamp(0.35 + ((h >> 5) % 40) / 100, 0, 1) : 0.45;
  const riskOff = clamp(0.42 * (vol / 100) + 0.35 * crossCorrProxy + 0.23 * (1 - trend), 0, 1);

  let regime = 'RANGE';
  if (riskOff > 0.67) regime = 'RISK_OFF';
  else if (vol > 83) regime = 'HIGH_VOL';
  else if (trend > 0.58) regime = 'TREND';

  const stance =
    regime === 'RISK_OFF'
      ? 'Risk budget reduced, defensive entries only.'
      : regime === 'HIGH_VOL'
        ? 'Volatility elevated; reduced size and strict invalidation.'
        : regime === 'TREND'
          ? 'Trend-following stance with pullback entries.'
          : 'Neutral/range stance with selective execution.';

  return {
    temperature_percentile: round(temp, 2),
    volatility_percentile: round(vol, 2),
    trend_strength: round(trend, 4),
    risk_off_score: round(riskOff, 4),
    regime_id: regime,
    stance,
  };
}

function nextRiskBucket(
  market: Market,
  tempPct: number,
  volPct: number,
): keyof typeof DYNAMIC_RISK_BUCKETS {
  const current = bucketStateByMarket.get(market) ?? 'BASE';
  if (tempPct > 90 || volPct > 90) {
    bucketStateByMarket.set(market, 'DERISKED');
    return 'DERISKED';
  }
  if (current === 'DERISKED') {
    bucketStateByMarket.set(market, 'RECOVERY_STEP_1');
    return 'RECOVERY_STEP_1';
  }
  if (current === 'RECOVERY_STEP_1') {
    bucketStateByMarket.set(market, 'RECOVERY_STEP_2');
    return 'RECOVERY_STEP_2';
  }
  bucketStateByMarket.set(market, 'BASE');
  return 'BASE';
}

function expectedR(
  direction: SignalContract['direction'],
  entryMid: number,
  stop: number,
  tp: number,
): number {
  const risk = Math.max(Math.abs(entryMid - stop), 1e-6);
  const reward = direction === 'LONG' ? tp - entryMid : entryMid - tp;
  return round(reward / risk, 3);
}

function calcPositionPct(args: {
  riskProfile: UserRiskProfileRecord;
  entryMid: number;
  stop: number;
  volPct: number;
  bucket: keyof typeof DYNAMIC_RISK_BUCKETS;
}): number {
  const stopDistance = Math.max(
    Math.abs(args.entryMid - args.stop) / Math.max(args.entryMid, 1e-6),
    0.003,
  );
  const riskPerTrade = args.riskProfile.max_loss_per_trade / 100;
  const basePct = (riskPerTrade / stopDistance) * 100;
  const volTargetCap = clamp(18 - args.volPct * 0.12, 2.5, 18);
  const capped = Math.min(basePct, args.riskProfile.exposure_cap, volTargetCap);
  return round(capped * DYNAMIC_RISK_BUCKETS[args.bucket].multiplier, 2);
}

function scoreSignal(args: {
  expectedRValue: number;
  confidence: number;
  regimeId: string;
  totalCostBps: number;
  volPct: number;
}): number {
  const regimeFit =
    args.regimeId === 'TREND'
      ? 1.16
      : args.regimeId === 'RANGE'
        ? 0.95
        : args.regimeId === 'HIGH_VOL'
          ? 0.82
          : 0.68;
  const costPenalty = args.totalCostBps / 40;
  const tailPenalty = (args.volPct / 100) * 0.55;
  return round(args.expectedRValue * args.confidence * regimeFit - costPenalty - tailPenalty, 4);
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

function buildExecutionChecklist(args: {
  assetClass: AssetClass;
  symbol: string;
  entryMethod: 'MARKET' | 'LIMIT' | 'SPLIT_LIMIT';
  entryLow: number;
  entryHigh: number;
  stop: number;
  tp1: number;
  positionPct: number;
  bucket: string;
}): string[] {
  const lines = [
    `Confirm ${args.symbol} spread/liquidity before placing orders.`,
    `Use ${args.entryMethod} entry in ${args.entryLow.toFixed(2)}-${args.entryHigh.toFixed(2)} and avoid chasing beyond zone.`,
    `Place hard invalidation stop at ${args.stop.toFixed(2)} immediately after fill.`,
    `Set TP1 near ${args.tp1.toFixed(2)} and reduce at least 50% there.`,
    `Cap total size around ${args.positionPct.toFixed(2)}% under ${args.bucket} risk bucket.`,
    'Skip execution if volatility spikes or orderbook depth drops suddenly.',
  ];
  if (args.assetClass === 'CRYPTO') {
    lines.push(
      'Avoid opening right into funding reset windows and keep leverage conservative to avoid liquidation risk.',
    );
  }
  if (args.assetClass === 'OPTIONS') {
    lines.push('Intraday options rule: flatten by end of session if TP/SL not reached.');
  }
  if (args.assetClass === 'US_STOCK') {
    lines.push('Re-check catalyst calendar before close if holding as swing position.');
  }
  return lines;
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

function buildContracts(args: {
  signals: RawSignal[];
  velocityPct: number;
  riskProfile: UserRiskProfileRecord;
}): SignalContract[] {
  const nowIso = new Date().toISOString();
  const contracts = args.signals.map((raw) => {
    const strategyKey = resolveStrategy(raw);
    const template = STRATEGY_LIBRARY[strategyKey];
    const assetClass = template.asset_class || inferAssetClass(raw);
    const createdAtMs = Date.parse(raw.generated_at) || Date.now();
    const expiresAtMs = inferExpiresAt(raw);
    const marketState = deriveMarketState(raw, args.velocityPct);
    const bucket = nextRiskBucket(
      raw.market,
      marketState.temperature_percentile,
      marketState.volatility_percentile,
    );
    const entryLow = Number(raw.entry_min);
    const entryHigh = Number(raw.entry_max);
    const entryMid = (entryLow + entryHigh) / 2;
    const stop = Number(raw.stop_loss);
    const tp1 = Number(raw.take_profit);
    const tp2 =
      raw.direction === 'LONG'
        ? tp1 + Math.abs(tp1 - entryMid) * 0.62
        : tp1 - Math.abs(tp1 - entryMid) * 0.62;
    const conf = clamp(Number(raw.confidence || 3) / 5, 0.05, 0.99);
    const expectedRValue = expectedR(raw.direction, entryMid, stop, tp1);
    const sampleSize = 24 + (hashCode(raw.signal_id) % 73);
    const hitRate = clamp(0.38 + conf * 0.42 - marketState.volatility_percentile / 260, 0.2, 0.82);
    const expectedMaxDd = clamp(0.03 + marketState.volatility_percentile / 750, 0.03, 0.28);
    const totalCost =
      template.cost.fee_bps +
      template.cost.spread_bps +
      template.cost.slippage_bps +
      (template.cost.funding_est_bps ?? 0) +
      (template.cost.basis_est ?? 0);
    const positionPct = calcPositionPct({
      riskProfile: args.riskProfile,
      entryMid,
      stop,
      volPct: marketState.volatility_percentile,
      bucket,
    });
    const score = scoreSignal({
      expectedRValue,
      confidence: conf,
      regimeId: marketState.regime_id,
      totalCostBps: totalCost,
      volPct: marketState.volatility_percentile,
    });
    const status = resolveStatus(raw.status, createdAtMs, expiresAtMs);
    const strength = clamp(
      Math.round((conf * 70 + (expectedRValue / 3) * 20 + score * 7) * 10) / 10,
      0,
      100,
    );
    const payload = buildPayload(raw, assetClass, entryMid);

    const contract: SignalContract = {
      id: raw.signal_id,
      created_at: new Date(createdAtMs).toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      asset_class: assetClass,
      market: raw.market,
      symbol: raw.symbol,
      timeframe: template.timeframe,
      strategy_id: template.strategy_id,
      strategy_family: template.strategy_family,
      strategy_version: raw.model_version || template.strategy_version,
      regime_id: marketState.regime_id,
      temperature_percentile: marketState.temperature_percentile,
      volatility_percentile: marketState.volatility_percentile,
      direction: raw.direction,
      strength,
      confidence: round(conf, 4),
      entry_zone: {
        low: round(entryLow, 6),
        high: round(entryHigh, 6),
        method: template.entry_method,
        notes: `Primary zone only valid before ${new Date(expiresAtMs).toISOString()}`,
      },
      invalidation_level: round(stop, 6),
      stop_loss: {
        type: template.stop_type,
        price: round(stop, 6),
        rationale: `Stop anchored to ${template.stop_type.toLowerCase()} invalidation.`,
      },
      take_profit_levels: [
        {
          price: round(tp1, 6),
          size_pct: 60,
          rationale: 'TP1 secures risk and de-risks quickly.',
        },
        {
          price: round(tp2, 6),
          size_pct: 40,
          rationale: 'TP2 captures trend continuation.',
        },
      ],
      trailing_rule: {
        type: template.trailing_type,
        params: template.trailing_type === 'NONE' ? {} : { lookback: 8, sensitivity: 1.2 },
      },
      position_advice: {
        position_pct: positionPct,
        leverage_cap: args.riskProfile.leverage_cap,
        risk_bucket_applied: bucket,
        rationale: `${args.riskProfile.profile_key} profile with ${bucket} multiplier applied.`,
      },
      cost_model: {
        fee_bps: template.cost.fee_bps,
        spread_bps: template.cost.spread_bps,
        slippage_bps: template.cost.slippage_bps,
        funding_est_bps: template.cost.funding_est_bps,
        basis_est: template.cost.basis_est,
      },
      expected_metrics: {
        expected_R: expectedRValue,
        hit_rate_est: round(hitRate, 4),
        sample_size: sampleSize,
        expected_max_dd_est: round(expectedMaxDd, 4),
      },
      explain_bullets: [
        `${template.strategy_id} detected setup on ${raw.symbol} under ${marketState.regime_id}.`,
        `Confidence ${(conf * 100).toFixed(0)}%, expected R ${expectedRValue.toFixed(2)}, est sample n=${sampleSize}.`,
        `Risk bucket ${bucket} limits size to ${positionPct.toFixed(2)}% with hard invalidation ${stop.toFixed(2)}.`,
        ...template.failure_modes.slice(0, 2).map((item) => `Avoid execution when: ${item}.`),
      ],
      execution_checklist: buildExecutionChecklist({
        assetClass,
        symbol: raw.symbol,
        entryMethod: template.entry_method,
        entryLow,
        entryHigh,
        stop,
        tp1,
        positionPct,
        bucket,
      }),
      tags: [...template.tags, marketState.regime_id.toLowerCase(), status.toLowerCase()],
      status,
      payload,
      references: {
        chart_url: `/charts/${raw.market}/${raw.symbol}`,
        docs_url: `/docs/strategies/${template.strategy_id.toLowerCase()}`,
      },
      score,
      payload_version: 'signal-contract-v1',
    };

    return contract;
  });

  const bySymbol = new Map<string, SignalContract>();
  for (const signal of contracts.sort((a, b) => b.score - a.score)) {
    const key = `${signal.market}:${signal.symbol}`;
    const prev = bySymbol.get(key);
    if (!prev) {
      bySymbol.set(key, signal);
      continue;
    }

    const conflict = prev.direction !== signal.direction;
    if (!conflict) continue;
    const prefer = prev.score >= signal.score ? prev : signal;
    const muted = prev.score >= signal.score ? signal : prev;
    muted.status = muted.status === 'TRIGGERED' ? muted.status : 'INVALIDATED';
    muted.explain_bullets = [
      `Muted by higher-score conflicting signal ${prefer.id}.`,
      ...muted.explain_bullets.slice(0, 3),
    ];
  }

  return contracts
    .sort((a, b) => b.score - a.score || Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((signal) => ({
      ...signal,
      explain_bullets: signal.explain_bullets.slice(0, 6),
      execution_checklist: signal.execution_checklist.slice(0, 8),
    }));
}

function deriveMarketStateRows(signals: SignalContract[]): MarketStateRecord[] {
  return signals.map((signal) => ({
    market: signal.market,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    snapshot_ts_ms: Date.now(),
    regime_id: signal.regime_id,
    trend_strength: round(clamp(signal.strength / 100, 0.05, 0.95), 4),
    temperature_percentile: round(signal.temperature_percentile, 4),
    volatility_percentile: round(signal.volatility_percentile, 4),
    risk_off_score: round(
      clamp(
        (signal.regime_id === 'RISK_OFF' ? 0.82 : 0.45) +
          signal.volatility_percentile / 420 -
          signal.confidence / 6,
        0,
        1,
      ),
      4,
    ),
    stance:
      signal.regime_id === 'RISK_OFF'
        ? 'Risk reduced, no chasing.'
        : signal.regime_id === 'HIGH_VOL'
          ? 'Cautious stance with strict stops.'
          : signal.regime_id === 'TREND'
            ? 'Trend stance, pullback entries favored.'
            : 'Neutral stance.',
    event_stats_json: JSON.stringify({
      event: 'temp_pct>=90',
      sample_size: signal.expected_metrics.sample_size,
      p_up_7d: signal.expected_metrics.hit_rate_est,
      e_return_7d: round(signal.expected_metrics.expected_R * 0.01, 4),
      e_max_drawdown_7d: signal.expected_metrics.expected_max_dd_est ?? null,
      tail_quantiles: {
        q10: round(-Math.abs((signal.expected_metrics.expected_max_dd_est ?? 0.1) * 1.3), 4),
        q50: round((signal.expected_metrics.expected_R - 0.8) * 0.01, 4),
        q90: round(signal.expected_metrics.expected_R * 0.018, 4),
      },
    }),
    assumptions_json: JSON.stringify({
      fees_bps: signal.cost_model.fee_bps,
      slippage_bps: signal.cost_model.slippage_bps,
      funding: signal.market === 'CRYPTO' ? 'included' : 'excluded',
    }),
    updated_at_ms: Date.now(),
  }));
}

function computeTradeMetrics(pnlPctSeries: number[]): {
  sample_size: number;
  win_rate: number;
  avg_rr: number;
  max_dd: number;
  total_return: number;
} {
  if (!pnlPctSeries.length) {
    return { sample_size: 0, win_rate: 0, avg_rr: 0, max_dd: 0, total_return: 0 };
  }
  const returns = pnlPctSeries.map((value) => value / 100);
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const avgRr = avgLoss ? avgWin / avgLoss : avgWin > 0 ? 2 : 0;
  let equity = 1;
  let peak = 1;
  let worst = 0;
  for (const value of returns) {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    worst = Math.min(worst, (equity - peak) / peak);
  }
  return {
    sample_size: pnlPctSeries.length,
    win_rate: round(wins.length / pnlPctSeries.length, 4),
    avg_rr: round(avgRr, 4),
    max_dd: round(Math.abs(worst), 4),
    total_return: round(equity - 1, 4),
  };
}

function buildPerformanceSnapshots(args: {
  contracts: SignalContract[];
  performanceRecords: RawPerformanceRecord[];
  trades: Array<Record<string, unknown>>;
  executions: ExecutionRecord[];
}): { apiResponse: Record<string, unknown>; snapshots: PerformanceSnapshotRecord[] } {
  const signalMap = new Map(args.contracts.map((signal) => [signal.id, signal]));
  const closedExecutions = args.executions.filter(
    (item) => (item.action === 'DONE' || item.action === 'CLOSE') && Number.isFinite(item.pnl_pct),
  );
  const executionTrades = closedExecutions.map((item) => ({
    market: item.market,
    signal_id: item.signal_id,
    pnl_pct: Number(item.pnl_pct || 0),
    time_out: new Date(item.created_at_ms).toISOString(),
    source: item.mode,
  }));

  const baseTrades = [...args.trades, ...executionTrades] as Array<{
    market: Market;
    signal_id: string;
    pnl_pct: number;
    time_out: string;
    source?: string;
  }>;
  const now = Date.now();

  const snapshots: PerformanceSnapshotRecord[] = [];
  const responseRows: Array<Record<string, unknown>> = [];

  for (const record of args.performanceRecords) {
    const days = record.range === 'ALL' ? null : 30;
    const scoped = baseTrades.filter((trade) => {
      if (trade.market !== record.market) return false;
      if (!days) return true;
      const ts = Date.parse(trade.time_out);
      return Number.isFinite(ts) && ts >= now - days * 24 * 3600 * 1000;
    });

    const overall = computeTradeMetrics(scoped.map((item) => Number(item.pnl_pct || 0)));

    const byStrategyMap = new Map<string, number[]>();
    const byRegimeMap = new Map<string, number[]>();
    for (const trade of scoped) {
      const signal = signalMap.get(trade.signal_id);
      const strategyId = signal?.strategy_id || 'UNCLASSIFIED';
      const regimeId = signal?.regime_id || 'RANGE';
      byStrategyMap.set(strategyId, [
        ...(byStrategyMap.get(strategyId) || []),
        Number(trade.pnl_pct || 0),
      ]);
      byRegimeMap.set(regimeId, [...(byRegimeMap.get(regimeId) || []), Number(trade.pnl_pct || 0)]);
    }

    const byStrategy = Array.from(byStrategyMap.entries())
      .map(([id, rows]) => ({ id, ...computeTradeMetrics(rows) }))
      .sort((a, b) => b.sample_size - a.sample_size);
    const byRegime = Array.from(byRegimeMap.entries())
      .map(([id, rows]) => ({ id, ...computeTradeMetrics(rows) }))
      .sort((a, b) => b.sample_size - a.sample_size);

    const backtestSeries = record.equity_curve?.backtest || [];
    const liveSeries = record.equity_curve?.live || [];
    const backtestReturn = backtestSeries.length
      ? backtestSeries[backtestSeries.length - 1] / backtestSeries[0] - 1
      : 0;
    const liveReturn = liveSeries.length
      ? liveSeries[liveSeries.length - 1] / liveSeries[0] - 1
      : 0;
    const deviation = round(backtestReturn - liveReturn, 4);

    const liveCount = scoped.filter((item) => item.source !== 'PAPER').length;
    const paperCount = scoped.filter((item) => item.source === 'PAPER').length;
    const sourceLabel =
      liveCount > 0 && paperCount > 0
        ? 'MIXED'
        : liveCount > 0
          ? 'LIVE'
          : paperCount > 0
            ? 'PAPER'
            : 'BACKTEST';

    responseRows.push({
      market: record.market,
      range: record.range,
      kpis: {
        ...record.kpis,
        sample_size: overall.sample_size,
        win_rate: overall.win_rate,
        avg_rr: overall.avg_rr,
        max_dd: overall.max_dd,
        total_return: overall.total_return,
      },
      assumptions: record.assumptions,
      live_paper_label: sourceLabel,
      sample_size: overall.sample_size,
      attribution: {
        by_strategy: byStrategy,
        by_regime: byRegime,
        deviation: {
          backtest_return: round(backtestReturn, 4),
          live_return: round(liveReturn, 4),
          gap: deviation,
        },
      },
    });

    snapshots.push({
      market: record.market,
      range: record.range,
      segment_type: 'OVERALL',
      segment_key: 'ALL',
      source_label: sourceLabel,
      sample_size: overall.sample_size,
      payload_json: JSON.stringify({
        kpis: overall,
        assumptions: record.assumptions,
        live_paper_label: sourceLabel,
      }),
      asof_ms: now,
      updated_at_ms: now,
    });

    for (const item of byStrategy) {
      snapshots.push({
        market: record.market,
        range: record.range,
        segment_type: 'STRATEGY',
        segment_key: item.id,
        source_label: sourceLabel,
        sample_size: item.sample_size,
        payload_json: JSON.stringify(item),
        asof_ms: now,
        updated_at_ms: now,
      });
    }
    for (const item of byRegime) {
      snapshots.push({
        market: record.market,
        range: record.range,
        segment_type: 'REGIME',
        segment_key: item.id,
        source_label: sourceLabel,
        sample_size: item.sample_size,
        payload_json: JSON.stringify(item),
        asof_ms: now,
        updated_at_ms: now,
      });
    }
    snapshots.push({
      market: record.market,
      range: record.range,
      segment_type: 'DEVIATION',
      segment_key: 'BACKTEST_VS_LIVE',
      source_label: sourceLabel,
      sample_size: overall.sample_size,
      payload_json: JSON.stringify({
        backtest_return: round(backtestReturn, 4),
        live_return: round(liveReturn, 4),
        gap: deviation,
      }),
      asof_ms: now,
      updated_at_ms: now,
    });
  }

  return {
    apiResponse: {
      asof: new Date(now).toISOString(),
      records: responseRows,
    },
    snapshots,
  };
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

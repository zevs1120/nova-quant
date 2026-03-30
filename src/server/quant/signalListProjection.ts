import type { AssetClass, Market, SignalContract } from '../types.js';

type UnknownRecord = Record<string, unknown>;
type SignalContractLike = SignalContract & UnknownRecord;

export type SignalListItem = {
  id: string;
  signal_id: string;
  created_at: string | null;
  expires_at: string | null;
  generated_at: string | null;
  asset_class: AssetClass;
  market: Market;
  symbol: string;
  timeframe: string;
  strategy_id: string;
  strategy_family: string;
  strategy_version: string;
  strategy_source: string | null;
  regime_id: string;
  direction: string;
  confidence: number;
  conviction: number;
  entry_zone: {
    low: number | null;
    high: number | null;
    method: string;
    notes?: string;
  };
  entry_min: number | null;
  entry_max: number | null;
  invalidation_level: number | null;
  stop_loss: {
    type: string;
    price: number | null;
    rationale: string;
  };
  stop_loss_value: number | null;
  take_profit: number | null;
  take_profit_levels: Array<{
    price: number;
    size_pct: number | null;
    rationale: string;
  }>;
  trailing_rule: {
    type: string;
    params: Record<string, unknown>;
  };
  position_advice: {
    position_pct: number | null;
    leverage_cap: number | null;
    risk_bucket_applied: string | null;
    rationale: string;
  };
  position_size_pct: number | null;
  position_pct: number | null;
  status: string;
  score: number;
  explain_bullets: string[];
  rationale: string[];
  execution_checklist: string[];
  summary: string | null;
  thesis: string | null;
  why: string | null;
  brief_why_now: string | null;
  grade: string | null;
  source_status: string | null;
  source_label: string | null;
  data_status: string | null;
  risk_warnings: string[];
  quick_pnl_pct: number | null;
  holding_horizon_days: number | null;
  risk_score: number | null;
  regime_compatibility: number | null;
  validity: string | null;
  model_version: string | null;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toText(value: unknown) {
  return String(value || '').trim();
}

function toNullableText(value: unknown) {
  const text = toText(value);
  return text || null;
}

function toNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function toNullableNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toIso(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? new Date(next).toISOString() : null;
}

function toTextArray(value: unknown, limit = 6) {
  return asArray(value)
    .map((item) => toText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeAssetClass(value: unknown, market: Market): AssetClass {
  const assetClass = toText(value).toUpperCase();
  if (assetClass === 'OPTIONS' || assetClass === 'CRYPTO' || assetClass === 'US_STOCK') {
    return assetClass as AssetClass;
  }
  return market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK';
}

function normalizeMarket(value: unknown): Market {
  return toText(value).toUpperCase() === 'CRYPTO' ? 'CRYPTO' : 'US';
}

function normalizeDirection(value: unknown) {
  return toText(value).toUpperCase() || 'LONG';
}

function buildTakeProfitLevelsFromColumns(args: {
  tp1Price: unknown;
  tp1SizePct: unknown;
  tp2Price: unknown;
  tp2SizePct: unknown;
}) {
  const levels = [
    {
      price: toNullableNumber(args.tp1Price),
      size_pct: toNullableNumber(args.tp1SizePct),
      rationale: 'Primary target',
    },
    {
      price: toNullableNumber(args.tp2Price),
      size_pct: toNullableNumber(args.tp2SizePct),
      rationale: 'Secondary target',
    },
  ];
  return levels.filter(
    (level): level is { price: number; size_pct: number | null; rationale: string } =>
      Number.isFinite(level.price),
  );
}

function buildTakeProfitLevelsFromContract(contract: SignalContractLike) {
  const levels = asArray(contract.take_profit_levels)
    .map((row, index) => {
      const record = asRecord(row);
      const price = toNullableNumber(record.price ?? row);
      if (!Number.isFinite(price)) return null;
      return {
        price,
        size_pct: toNullableNumber(record.size_pct),
        rationale: toNullableText(record.rationale) || `Target ${index + 1}`,
      };
    })
    .filter((row): row is { price: number; size_pct: number | null; rationale: string } =>
      Boolean(row),
    );
  if (levels.length) return levels;

  const fallback = toNullableNumber(contract.take_profit);
  if (fallback === null) return [];
  return [{ price: fallback, size_pct: null, rationale: 'Primary target' }];
}

function normalizeTrailingRule(value: unknown) {
  const record = asRecord(value);
  const type = toText(record.type).toUpperCase() || 'NONE';
  const params = asRecord(record.params);
  return { type, params };
}

function buildSummaryFields(explainBullets: string[], fallback: unknown) {
  const firstLine = explainBullets[0] || toNullableText(fallback) || null;
  return {
    summary: firstLine,
    thesis: firstLine,
    why: firstLine,
    brief_why_now: firstLine,
  };
}

function buildBaseListItem(args: {
  signalId: string;
  createdAt: string | null;
  expiresAt: string | null;
  generatedAt: string | null;
  assetClass: AssetClass;
  market: Market;
  symbol: string;
  timeframe: string;
  strategyId: string;
  strategyFamily: string;
  strategyVersion: string;
  strategySource: string | null;
  regimeId: string;
  direction: string;
  confidence: number;
  entryLow: number | null;
  entryHigh: number | null;
  entryMethod: string;
  entryNotes: string | null;
  invalidationLevel: number | null;
  stopType: string;
  stopPrice: number | null;
  stopRationale: string | null;
  takeProfitLevels: Array<{
    price: number;
    size_pct: number | null;
    rationale: string;
  }>;
  trailingRule: {
    type: string;
    params: Record<string, unknown>;
  };
  positionPct: number | null;
  leverageCap: number | null;
  riskBucketApplied: string | null;
  positionRationale: string | null;
  status: string;
  score: number;
  explainBullets: string[];
  executionChecklist: string[];
  grade: string | null;
  sourceStatus: string | null;
  sourceLabel: string | null;
  dataStatus: string | null;
  riskWarnings: string[];
  quickPnlPct: number | null;
  holdingHorizonDays: number | null;
  riskScore: number | null;
  regimeCompatibility: number | null;
  validity: string | null;
  modelVersion: string | null;
}) {
  const summaryFields = buildSummaryFields(args.explainBullets, args.positionRationale);
  const normalizedStrategySource = args.strategySource || 'AI quant strategy';
  return {
    id: args.signalId,
    signal_id: args.signalId,
    created_at: args.createdAt,
    expires_at: args.expiresAt,
    generated_at: args.generatedAt || args.createdAt,
    asset_class: args.assetClass,
    market: args.market,
    symbol: args.symbol,
    timeframe: args.timeframe,
    strategy_id: args.strategyId,
    strategy_family: args.strategyFamily,
    strategy_version: args.strategyVersion,
    strategy_source: normalizedStrategySource,
    regime_id: args.regimeId,
    direction: args.direction,
    confidence: args.confidence,
    conviction: args.confidence,
    entry_zone: {
      low: args.entryLow,
      high: args.entryHigh,
      method: args.entryMethod || 'LIMIT',
      ...(args.entryNotes ? { notes: args.entryNotes } : {}),
    },
    entry_min: args.entryLow,
    entry_max: args.entryHigh,
    invalidation_level: args.invalidationLevel,
    stop_loss: {
      type: args.stopType || 'ATR',
      price: args.stopPrice,
      rationale: args.stopRationale || 'Model invalidation level',
    },
    stop_loss_value: args.stopPrice,
    take_profit: args.takeProfitLevels[0]?.price ?? null,
    take_profit_levels: args.takeProfitLevels,
    trailing_rule: args.trailingRule,
    position_advice: {
      position_pct: args.positionPct,
      leverage_cap: args.leverageCap,
      risk_bucket_applied: args.riskBucketApplied,
      rationale: args.positionRationale || 'Sized from model risk rules.',
    },
    position_size_pct: args.positionPct,
    position_pct: args.positionPct,
    status: args.status || 'NEW',
    score: args.score,
    explain_bullets: args.explainBullets,
    rationale: args.explainBullets,
    execution_checklist: args.executionChecklist,
    ...summaryFields,
    grade: args.grade,
    source_status: args.sourceStatus,
    source_label: args.sourceLabel,
    data_status: args.dataStatus,
    risk_warnings: args.riskWarnings,
    quick_pnl_pct: args.quickPnlPct,
    holding_horizon_days: args.holdingHorizonDays,
    risk_score: args.riskScore,
    regime_compatibility: args.regimeCompatibility,
    validity: args.validity,
    model_version: args.modelVersion,
  } satisfies SignalListItem;
}

export function buildSignalListItemFromContract(contract: SignalContractLike): SignalListItem {
  const market = normalizeMarket(contract.market);
  const assetClass = normalizeAssetClass(contract.asset_class, market);
  const entryZone = asRecord(contract.entry_zone);
  const stopLoss = asRecord(contract.stop_loss);
  const positionAdvice = asRecord(contract.position_advice);
  const explainBullets = toTextArray(contract.explain_bullets, 3);
  const executionChecklist = toTextArray(contract.execution_checklist, 4);
  const targets = buildTakeProfitLevelsFromContract(contract);

  return buildBaseListItem({
    signalId: toText(contract.signal_id || contract.id),
    createdAt: toNullableText(contract.created_at),
    expiresAt: toNullableText(contract.expires_at),
    generatedAt: toNullableText(contract.generated_at),
    assetClass,
    market,
    symbol: toText(contract.symbol),
    timeframe: toText(contract.timeframe),
    strategyId: toText(contract.strategy_id),
    strategyFamily: toText(contract.strategy_family),
    strategyVersion: toText(contract.strategy_version),
    strategySource: toNullableText(contract.strategy_source),
    regimeId: toText(contract.regime_id),
    direction: normalizeDirection(contract.direction),
    confidence: toNumber(contract.confidence ?? contract.conviction),
    entryLow: toNullableNumber(entryZone.low ?? entryZone.min ?? contract.entry_min),
    entryHigh: toNullableNumber(entryZone.high ?? entryZone.max ?? contract.entry_max),
    entryMethod: toText(entryZone.method || contract.entry_method || contract.order_type),
    entryNotes: toNullableText(entryZone.notes),
    invalidationLevel: toNullableNumber(contract.invalidation_level),
    stopType: toText(stopLoss.type),
    stopPrice: toNullableNumber(stopLoss.price ?? contract.stop_loss_value ?? contract.stop_loss),
    stopRationale: toNullableText(stopLoss.rationale),
    takeProfitLevels: targets,
    trailingRule: normalizeTrailingRule(contract.trailing_rule),
    positionPct: toNullableNumber(
      positionAdvice.position_pct ?? contract.position_size_pct ?? contract.position_pct,
    ),
    leverageCap: toNullableNumber(positionAdvice.leverage_cap),
    riskBucketApplied: toNullableText(positionAdvice.risk_bucket_applied),
    positionRationale: toNullableText(positionAdvice.rationale),
    status: toText(contract.status),
    score: toNumber(contract.score),
    explainBullets,
    executionChecklist,
    grade: toNullableText(contract.grade),
    sourceStatus: toNullableText(contract.source_status),
    sourceLabel: toNullableText(contract.source_label),
    dataStatus: toNullableText(contract.data_status),
    riskWarnings: toTextArray(contract.risk_warnings, 6),
    quickPnlPct: toNullableNumber(contract.quick_pnl_pct),
    holdingHorizonDays: toNullableNumber(contract.holding_horizon_days),
    riskScore: toNullableNumber(contract.risk_score),
    regimeCompatibility: toNullableNumber(contract.regime_compatibility),
    validity: toNullableText(contract.validity),
    modelVersion: toNullableText(contract.model_version),
  });
}

export function buildSignalListItemFromPgRow(row: UnknownRecord): SignalListItem {
  const market = normalizeMarket(row.market);
  const assetClass = normalizeAssetClass(row.asset_class, market);
  const explainBullets = toTextArray(row.explain_bullets_json, 3);
  const executionChecklist = toTextArray(row.execution_checklist_json, 4);
  const targets = buildTakeProfitLevelsFromColumns({
    tp1Price: row.tp1_price,
    tp1SizePct: row.tp1_size_pct,
    tp2Price: row.tp2_price,
    tp2SizePct: row.tp2_size_pct,
  });

  return buildBaseListItem({
    signalId: toText(row.signal_id),
    createdAt: toIso(row.created_at_ms),
    expiresAt: toIso(row.expires_at_ms),
    generatedAt: toNullableText(row.generated_at) || toIso(row.created_at_ms),
    assetClass,
    market,
    symbol: toText(row.symbol),
    timeframe: toText(row.timeframe),
    strategyId: toText(row.strategy_id),
    strategyFamily: toText(row.strategy_family),
    strategyVersion: toText(row.strategy_version),
    strategySource: toNullableText(row.strategy_source),
    regimeId: toText(row.regime_id),
    direction: normalizeDirection(row.direction),
    confidence: toNumber(row.confidence),
    entryLow: toNullableNumber(row.entry_low),
    entryHigh: toNullableNumber(row.entry_high),
    entryMethod: toText(row.entry_method),
    entryNotes: null,
    invalidationLevel: toNullableNumber(row.invalidation_level),
    stopType: toText(row.stop_type),
    stopPrice: toNullableNumber(row.stop_price),
    stopRationale: null,
    takeProfitLevels: targets,
    trailingRule: { type: 'NONE', params: {} },
    positionPct: toNullableNumber(row.position_pct),
    leverageCap: toNullableNumber(row.leverage_cap),
    riskBucketApplied: toNullableText(row.risk_bucket_applied),
    positionRationale: null,
    status: toText(row.status),
    score: toNumber(row.score),
    explainBullets,
    executionChecklist,
    grade: toNullableText(row.grade),
    sourceStatus: toNullableText(row.source_status),
    sourceLabel: toNullableText(row.source_label),
    dataStatus: toNullableText(row.data_status),
    riskWarnings: toTextArray(row.risk_warnings_json, 6),
    quickPnlPct: toNullableNumber(row.quick_pnl_pct),
    holdingHorizonDays: toNullableNumber(row.holding_horizon_days),
    riskScore: toNullableNumber(row.risk_score),
    regimeCompatibility: toNullableNumber(row.regime_compatibility),
    validity: toNullableText(row.validity),
    modelVersion: toNullableText(row.model_version),
  });
}

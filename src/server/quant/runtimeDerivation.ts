import { getConfig } from '../config.js';
import type {
  Asset,
  AssetClass,
  Market,
  MarketStateRecord,
  PerformanceSnapshotRecord,
  SignalPayload,
  SignalContract,
  Timeframe,
  UserRiskProfileRecord,
} from '../types.js';
import { MarketRepository } from '../db/repository.js';
import type { IngestAnomalySummary } from '../db/repository.js';
import { RUNTIME_STATUS, type RuntimeStatus } from '../runtimeStatus.js';
import {
  buildPandaAdaptiveDecision,
  resolvePandaModelConfig,
  type PandaAdaptiveDecision,
  type PandaModelRuntimeConfig,
} from './pandaEngine.js';
import { createConfidenceCalibrator } from '../confidence/calibration.js';
import { buildEvidenceLineage } from '../evidence/lineage.js';
import { buildNewsContext } from '../news/provider.js';
import { applyAlphaRuntimeOverlays } from '../alpha_shadow_runner/index.js';
import type { NewsItemRecord } from '../types.js';
import { inspectBarQuality, inspectBarSequenceQuality } from '../ingestion/normalize.js';
import { timeframeToMs } from '../utils/time.js';

const MS_HOUR = 3600_000;

type NumericBar = {
  ts_open: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type BarRuntimeQuality = {
  rawCount: number;
  validCount: number;
  droppedCount: number;
  envelopeAdjustedCount: number;
  zeroVolumeCount: number;
  extremeMoveCount: number;
  flatRunCount: number;
  zeroVolumeRunCount: number;
  maxMovePct: number;
  blocked: boolean;
  reason: string | null;
};

type RecentAnomalyPressure = {
  totalCount: number;
  distinctTsCount: number;
  totalDensity: number;
  priceDensity: number;
  envelopeDensity: number;
  zeroVolumeDensity: number;
  blocked: boolean;
  reason: string | null;
};

type SignalNewsContext = {
  symbol: string;
  headline_count: number;
  tone: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL' | 'NONE';
  top_headlines: string[];
  updated_at: string | null;
  source: string;
  factor_score?: number | null;
  event_risk_score?: number | null;
  macro_policy_score?: number | null;
  earnings_impact_score?: number | null;
  factor_tags?: string[];
  factor_summary?: string | null;
  analysis_provider?: string | null;
  trading_bias?: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL' | null;
};

type StrategyFactoryCandidate = {
  strategyId: string;
  strategyFamily: string;
  recommendation: string;
  nextStage: string | null;
  candidateQualityScorePct: number;
  supportingFeatures: string[];
  portfolioFit: string;
  riskNote: string;
  templateName: string | null;
  templateId: string | null;
  supportedAssetClasses: string[];
  compatibleRegimes: string[];
  qualityPriorScore: number;
  generationMode: string | null;
  publicReferenceIds: string[];
  featureOverlapCount: number;
};

type CryptoMarketMicrostructure = {
  fundingRateCurrent: number;
  fundingRate8h: number;
  fundingRate24h: number;
  basisBps: number;
  basisPercentile: number;
  fundingState: 'NEUTRAL' | 'EXTREME';
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function buildQualityFlags(args: {
  status?: string | null;
  reason?: string | null;
  metrics?: Record<string, unknown>;
}) {
  const metrics = args.metrics || {};
  const driftMetrics =
    metrics.adjustment_drift && typeof metrics.adjustment_drift === 'object'
      ? (metrics.adjustment_drift as Record<string, unknown>)
      : null;
  const corpValidation =
    metrics.corporate_action_validation && typeof metrics.corporate_action_validation === 'object'
      ? (metrics.corporate_action_validation as Record<string, unknown>)
      : null;

  return {
    suspect: args.status === 'SUSPECT',
    repaired: args.status === 'REPAIRED',
    quarantined: args.status === 'QUARANTINED',
    adjustment_drift: args.reason === 'PROVIDER_ADJUSTMENT_DRIFT',
    corporate_action_conflict: args.reason === 'CORPORATE_ACTION_SOURCE_CONFLICT',
    overlap_count: Number(driftMetrics?.overlap_count || 0),
    mismatch_count: Number(corpValidation?.mismatch_count || 0),
  };
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function tagValue(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function timeframeForMarket(market: Market): Timeframe {
  return market === 'CRYPTO' ? '1h' : '1d';
}

function assetClassForMarket(market: Market): AssetClass {
  return market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK';
}

function pandaModelKeyForMarket(market: Market): string {
  return `panda-runtime-${market.toLowerCase()}`;
}

function loadActivePandaModel(
  repo: MarketRepository,
  market: Market,
): {
  modelId: string | null;
  semanticVersion: string;
  config: PandaModelRuntimeConfig;
} {
  const model =
    repo
      .listModelVersions({
        modelKey: pandaModelKeyForMarket(market),
        limit: 20,
      })
      .find((row) => row.status === 'active') || null;
  return {
    modelId: model?.id ?? null,
    semanticVersion: model?.semantic_version || 'runtime-bars-rules.v1',
    config: resolvePandaModelConfig(
      model ? JSON.parse(model.config_json || '{}') : { modelKey: pandaModelKeyForMarket(market) },
    ),
  };
}

function sortBars(rows: NumericBar[]): NumericBar[] {
  return [...rows].sort((a, b) => a.ts_open - b.ts_open);
}

function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let out = values[0];
  for (let i = 1; i < values.length; i += 1) {
    out = values[i] * k + out * (1 - k);
  }
  return out;
}

function sma(values: number[], period: number): number {
  if (!values.length) return 0;
  const slice = values.slice(-period);
  if (!slice.length) return 0;
  return slice.reduce((acc, v) => acc + v, 0) / slice.length;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const varSum = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, varSum));
}

function percentileRank(values: number[], value: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = sorted.findIndex((v) => value <= v);
  if (idx < 0) return 100;
  return round((idx / Math.max(1, sorted.length - 1)) * 100, 2);
}

function atrSeries(bars: NumericBar[], period = 14): number[] {
  if (bars.length < 2) return [];
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const cur = bars[i];
    const prev = bars[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    trs.push(tr);
  }
  const out: number[] = [];
  for (let i = period - 1; i < trs.length; i += 1) {
    const window = trs.slice(i - period + 1, i + 1);
    out.push(window.reduce((acc, v) => acc + v, 0) / window.length);
  }
  return out;
}

function returns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    const cur = values[i];
    if (!prev) continue;
    out.push((cur - prev) / prev);
  }
  return out;
}

function assessBarRuntimeQuality(args: {
  rawCount: number;
  validCount: number;
  droppedCount: number;
  envelopeAdjustedCount: number;
  zeroVolumeCount: number;
  extremeMoveCount: number;
  flatRunCount: number;
  zeroVolumeRunCount: number;
  maxMovePct: number;
}): BarRuntimeQuality {
  const rawCount = Math.max(0, Number(args.rawCount || 0));
  const validCount = Math.max(0, Number(args.validCount || 0));
  const droppedCount = Math.max(0, Number(args.droppedCount || 0));
  const envelopeAdjustedCount = Math.max(0, Number(args.envelopeAdjustedCount || 0));
  const zeroVolumeCount = Math.max(0, Number(args.zeroVolumeCount || 0));
  const extremeMoveCount = Math.max(0, Number(args.extremeMoveCount || 0));
  const flatRunCount = Math.max(0, Number(args.flatRunCount || 0));
  const zeroVolumeRunCount = Math.max(0, Number(args.zeroVolumeRunCount || 0));
  const maxMovePct = Math.max(0, Number(args.maxMovePct || 0));

  if (rawCount === 0 || validCount === 0) {
    return {
      rawCount,
      validCount,
      droppedCount,
      envelopeAdjustedCount,
      zeroVolumeCount,
      extremeMoveCount,
      flatRunCount,
      zeroVolumeRunCount,
      maxMovePct,
      blocked: true,
      reason: 'NO_VALID_BARS',
    };
  }

  const droppedRatio = droppedCount / rawCount;
  const envelopeRatio = envelopeAdjustedCount / rawCount;
  const zeroVolumeRatio = zeroVolumeCount / validCount;
  const extremeMoveRatio = extremeMoveCount / Math.max(1, validCount - 1);

  let reason: string | null = null;
  if (droppedRatio > 0.2) reason = 'TOO_MANY_INVALID_BARS';
  else if (envelopeRatio > 0.35) reason = 'TOO_MANY_ENVELOPE_REPAIRS';
  else if (zeroVolumeRatio > 0.6) reason = 'TOO_MANY_ZERO_VOLUME_BARS';
  else if (flatRunCount >= 2) reason = 'TOO_MANY_FLAT_RUNS';
  else if (zeroVolumeRunCount >= 2) reason = 'TOO_MANY_ZERO_VOLUME_RUNS';
  else if (extremeMoveRatio > 0.12) reason = 'TOO_MANY_EXTREME_MOVE_BARS';

  return {
    rawCount,
    validCount,
    droppedCount,
    envelopeAdjustedCount,
    zeroVolumeCount,
    extremeMoveCount,
    flatRunCount,
    zeroVolumeRunCount,
    maxMovePct,
    blocked: reason !== null,
    reason,
  };
}

function parseBars(
  repo: MarketRepository,
  assetId: number,
  timeframe: Timeframe,
  limit = 320,
): { bars: NumericBar[]; quality: BarRuntimeQuality } {
  const rows = repo.getOhlcv({ assetId, timeframe, limit });
  let droppedCount = 0;
  let envelopeAdjustedCount = 0;
  let zeroVolumeCount = 0;
  const sanitizedRows: NormalizedBar[] = [];
  const bars = rows.reduce<NumericBar[]>((acc, row) => {
    const quality = inspectBarQuality(row);
    if (quality.invalidTimestamp || quality.invalidPrice || !quality.sanitized) {
      droppedCount += 1;
      return acc;
    }
    if (quality.envelopeAdjusted) envelopeAdjustedCount += 1;
    if (quality.zeroVolume) zeroVolumeCount += 1;
    acc.push({
      ts_open: quality.sanitized.ts_open,
      open: toNum(quality.sanitized.open),
      high: toNum(quality.sanitized.high),
      low: toNum(quality.sanitized.low),
      close: toNum(quality.sanitized.close),
      volume: toNum(quality.sanitized.volume),
    });
    sanitizedRows.push(quality.sanitized);
    return acc;
  }, []);
  const corporateActions = rows.length
    ? repo.listCorporateActions({
        assetId,
        startTs: rows[0].ts_open - 2 * timeframeToMs(timeframe),
        endTs: rows[rows.length - 1].ts_open + 2 * timeframeToMs(timeframe),
      })
    : [];
  const sequence = inspectBarSequenceQuality({
    rows: sanitizedRows,
    timeframe,
    source: 'RUNTIME',
    corporateActions: corporateActions.map((action) => ({
      effectiveTs: action.effective_ts,
      actionType: action.action_type,
      splitRatio: action.split_ratio,
    })),
  });

  return {
    bars: sortBars(bars),
    quality: assessBarRuntimeQuality({
      rawCount: rows.length,
      validCount: bars.length,
      droppedCount,
      envelopeAdjustedCount,
      zeroVolumeCount,
      extremeMoveCount: sequence.extremeMoveCount,
      flatRunCount: sequence.flatRunCount,
      zeroVolumeRunCount: sequence.zeroVolumeRunCount,
      maxMovePct: sequence.maxMovePct,
    }),
  };
}

function assessRecentAnomalyPressure(args: {
  summary: IngestAnomalySummary;
  quality: BarRuntimeQuality;
}): RecentAnomalyPressure {
  const counts = args.summary.countsByType || {};
  const priceCount = Number(counts.PRICE_ANOMALY || 0);
  const envelopeCount = Number(counts.OHLC_ENVELOPE_ANOMALY || 0);
  const zeroVolumeCount = Number(counts.ZERO_VOLUME_ANOMALY || 0);
  const totalCount = Number(args.summary.totalCount || 0);
  const distinctTsCount = Number(args.summary.distinctTsCount || 0);

  const denominator = Math.max(
    1,
    args.quality.rawCount + priceCount,
    args.quality.validCount + priceCount,
  );
  const totalDensity = totalCount / denominator;
  const priceDensity = priceCount / denominator;
  const envelopeDensity = envelopeCount / denominator;
  const zeroVolumeDensity = zeroVolumeCount / denominator;

  let reason: string | null = null;
  if (priceDensity > 0.2) reason = 'TOO_MANY_RECENT_PRICE_ANOMALIES';
  else if (totalDensity > 0.45) reason = 'TOO_MANY_RECENT_INGEST_ANOMALIES';

  return {
    totalCount,
    distinctTsCount,
    totalDensity: round(totalDensity, 4),
    priceDensity: round(priceDensity, 4),
    envelopeDensity: round(envelopeDensity, 4),
    zeroVolumeDensity: round(zeroVolumeDensity, 4),
    blocked: reason !== null,
    reason,
  };
}

function inferRegime(args: {
  trendStrength: number;
  volPct: number;
  riskOff: number;
  close: number;
  emaFast: number;
  emaSlow: number;
}): { regimeId: string; stance: string } {
  if (args.riskOff >= 0.72) {
    return {
      regimeId: 'RISK_OFF',
      stance: 'Risk-off: preserve capital, avoid forced entries.',
    };
  }

  if (args.volPct >= 80) {
    return {
      regimeId: 'HIGH_VOL',
      stance: 'High volatility: size down and demand stronger confirmation.',
    };
  }

  if (args.trendStrength >= 0.58) {
    const trendSide = args.close >= args.emaSlow ? 'uptrend' : 'downtrend';
    return {
      regimeId: 'TREND',
      stance: `Trend regime (${trendSide}): favor continuation, avoid counter-trend sizing.`,
    };
  }

  return {
    regimeId: 'RANGE',
    stance: 'Range regime: prioritize mean-reversion edges and tighter invalidation.',
  };
}

function statsForBars(market: Market, bars: NumericBar[]) {
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const emaFast = ema(closes, 10);
  const emaSlow = ema(closes, 30);
  const emaAnchor = ema(closes, 55);
  const spread = emaSlow ? (emaFast - emaSlow) / emaSlow : 0;
  const trendStrength = clamp(
    Math.abs(spread) * 20 + Math.abs((latest.close - emaAnchor) / Math.max(1e-9, emaAnchor)) * 8,
    0,
    1,
  );

  const atr = atrSeries(bars, 14);
  const latestAtr = atr[atr.length - 1] || 0;
  const atrPctSeries = atr.map((v, i) => {
    const idx = i + 1;
    const close = closes[idx] || latest.close || 1;
    return close ? (v / close) * 100 : 0;
  });
  const latestAtrPct = atrPctSeries[atrPctSeries.length - 1] || 0;
  const volPct = percentileRank(atrPctSeries.slice(-120), latestAtrPct);

  const r1 = prev?.close ? (latest.close - prev.close) / prev.close : 0;
  const r5Base = closes.length > 6 ? closes[closes.length - 6] : prev?.close || latest.close;
  const r5 = r5Base ? (latest.close - r5Base) / r5Base : 0;
  const volImpulse = (latest.volume || 0) / Math.max(1, sma(volumes, 20));
  const stretch = Math.abs((latest.close - emaFast) / Math.max(1e-9, emaFast));
  const tempScore = Math.abs(r1) * 4 + Math.abs(r5) * 2 + Math.max(0, volImpulse - 1) + stretch * 3;
  const tempSeries = closes.slice(21).map((_, idx) => {
    const i = idx + 21;
    const c = closes[i];
    const p1 = closes[i - 1] || c;
    const p5 = closes[i - 5] || p1;
    const e10 = ema(closes.slice(0, i + 1), 10);
    const vv = volumes[i] / Math.max(1, sma(volumes.slice(0, i + 1), 20));
    return (
      Math.abs((c - p1) / Math.max(1e-9, p1)) * 4 +
      Math.abs((c - p5) / Math.max(1e-9, p5)) * 2 +
      Math.max(0, vv - 1) +
      Math.abs((c - e10) / Math.max(1e-9, e10)) * 3
    );
  });
  const tempPct = percentileRank(tempSeries.slice(-140), tempScore);

  const retSeries = returns(closes).slice(-60);
  const downside = retSeries.filter((r) => r < 0).map((r) => Math.abs(r));
  const downsideVol = std(downside);
  const drift = retSeries.length ? retSeries.reduce((acc, v) => acc + v, 0) / retSeries.length : 0;
  const riskOffRaw = clamp(
    (volPct / 100) * 0.45 +
      downsideVol * 25 * 0.3 +
      (drift < 0 ? Math.min(0.3, Math.abs(drift) * 20) : 0) +
      (market === 'CRYPTO' ? 0.06 : 0),
    0,
    1,
  );

  const zWindow = closes.slice(-40);
  const zMean = zWindow.length
    ? zWindow.reduce((acc, v) => acc + v, 0) / zWindow.length
    : latest.close;
  const zStd = std(zWindow) || 1e-9;
  const zScore = (latest.close - zMean) / zStd;

  const highs20 = bars.slice(-21, -1).map((b) => b.high);
  const lows20 = bars.slice(-21, -1).map((b) => b.low);
  const breakoutHigh = highs20.length ? Math.max(...highs20) : latest.high;
  const breakdownLow = lows20.length ? Math.min(...lows20) : latest.low;

  const { regimeId, stance } = inferRegime({
    trendStrength,
    volPct,
    riskOff: riskOffRaw,
    close: latest.close,
    emaFast,
    emaSlow,
  });

  return {
    latest,
    emaFast,
    emaSlow,
    emaAnchor,
    trendStrength,
    volPct,
    tempPct,
    riskOffScore: riskOffRaw,
    zScore,
    volImpulse,
    r1,
    r5,
    breakoutHigh,
    breakdownLow,
    latestAtr,
    regimeId,
    stance,
  };
}

type RuleHit = {
  id: string;
  family: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  rationale: string[];
};

type AdaptiveTuning = {
  signal: number;
  confidence: number;
  topFactors: string[];
  factorScores: Record<string, number>;
  adaptiveRisk: number;
  adaptivePosition: number;
  riskAllowed: boolean;
  riskReason: string;
  suggestedPositionPct: number;
  learningStatus: 'READY' | 'INSUFFICIENT_DATA';
};

function selectRule(ctx: ReturnType<typeof statsForBars>): RuleHit | null {
  if (ctx.regimeId === 'RISK_OFF') return null;

  const breakout =
    ctx.latest.close > ctx.breakoutHigh && ctx.volImpulse >= 1.05 && ctx.trendStrength >= 0.45;
  if (breakout) {
    return {
      id: 'TREND_BREAKOUT',
      family: 'Momentum / Trend Following',
      direction: 'LONG',
      confidence: clamp(
        0.55 + ctx.trendStrength * 0.25 + Math.min(0.15, (ctx.volImpulse - 1) * 0.2),
        0.52,
        0.92,
      ),
      rationale: [
        'Price closed above 20-bar high with volume confirmation.',
        'Trend spread remains positive across fast/slow EMA.',
        'Volatility is elevated but not in explicit risk-off state.',
      ],
    };
  }

  const pullbackLong =
    ctx.regimeId === 'TREND' &&
    ctx.latest.close <= ctx.emaFast &&
    ctx.latest.close >= ctx.emaSlow &&
    ctx.r5 > 0;
  if (pullbackLong) {
    return {
      id: 'TREND_PULLBACK',
      family: 'Momentum / Trend Following',
      direction: 'LONG',
      confidence: clamp(
        0.5 + ctx.trendStrength * 0.22 + Math.max(0, -ctx.zScore) * 0.05,
        0.48,
        0.86,
      ),
      rationale: [
        'Pullback into trend support zone (EMA fast/slow band).',
        '5-bar drift remains positive, favoring continuation.',
        'Entry is closer to invalidation than to breakout exhaustion.',
      ],
    };
  }

  const meanRevLong = ctx.regimeId === 'RANGE' && ctx.zScore <= -1.45 && ctx.volPct <= 78;
  if (meanRevLong) {
    return {
      id: 'RANGE_MEANREV_LONG',
      family: 'Mean Reversion',
      direction: 'LONG',
      confidence: clamp(0.5 + Math.min(0.2, Math.abs(ctx.zScore) * 0.06), 0.46, 0.82),
      rationale: [
        'Price is statistically stretched below local range mean.',
        'Range regime favors reversion over continuation bets.',
        'Volatility is not in extreme panic regime.',
      ],
    };
  }

  const meanRevShort = ctx.regimeId === 'RANGE' && ctx.zScore >= 1.45 && ctx.volPct <= 78;
  if (meanRevShort) {
    return {
      id: 'RANGE_MEANREV_SHORT',
      family: 'Mean Reversion',
      direction: 'SHORT',
      confidence: clamp(0.5 + Math.min(0.2, Math.abs(ctx.zScore) * 0.06), 0.46, 0.82),
      rationale: [
        'Price is stretched above local range mean.',
        'Range regime supports fade setups more than breakout chase.',
        'Signal is suppressed when volatility reaches panic threshold.',
      ],
    };
  }

  const breakdownShort =
    ctx.latest.close < ctx.breakdownLow && ctx.volImpulse >= 1.08 && ctx.volPct >= 55;
  if (breakdownShort) {
    return {
      id: 'VOL_BREAKDOWN',
      family: 'Regime Transition',
      direction: 'SHORT',
      confidence: clamp(
        0.52 + Math.min(0.2, (ctx.volPct - 50) / 100) + Math.min(0.12, (ctx.volImpulse - 1) * 0.2),
        0.5,
        0.88,
      ),
      rationale: [
        'Breakdown below 20-bar support under expanding range.',
        'Volatility expansion confirms transition risk.',
        'Setup is downgraded when risk-off score is already extreme.',
      ],
    };
  }

  return null;
}

function fallbackRuleFromPanda(
  ctx: ReturnType<typeof statsForBars>,
  panda: PandaAdaptiveDecision,
): RuleHit | null {
  if (panda.signal === 0 || panda.confidence < 0.52) return null;
  const longTrend = ctx.regimeId === 'TREND' || ctx.trendStrength >= 0.55;
  if (panda.signal > 0) {
    return {
      id: longTrend ? 'TREND_PULLBACK' : 'RANGE_MEANREV_LONG',
      family: longTrend ? 'Momentum / Trend Following' : 'Mean Reversion',
      direction: 'LONG',
      confidence: clamp(0.5 + panda.confidence * 0.4, 0.48, 0.88),
      rationale: [
        'Panda adaptive layer selected a long-side setup from factor state.',
        `Top factors: ${panda.topFactors.slice(0, 3).join(', ') || 'trend_strength, reversal_score'}.`,
      ],
    };
  }
  return {
    id: ctx.regimeId === 'RANGE' ? 'RANGE_MEANREV_SHORT' : 'VOL_BREAKDOWN',
    family: ctx.regimeId === 'RANGE' ? 'Mean Reversion' : 'Regime Transition',
    direction: 'SHORT',
    confidence: clamp(0.5 + panda.confidence * 0.4, 0.48, 0.88),
    rationale: [
      'Panda adaptive layer selected a short-side setup from factor state.',
      `Top factors: ${panda.topFactors.slice(0, 3).join(', ') || 'trend_strength, reversal_score'}.`,
    ],
  };
}

function mergeRuleWithPanda(rule: RuleHit, panda: PandaAdaptiveDecision): RuleHit {
  if (panda.signal === 0) return rule;
  const directionMatches =
    (panda.signal > 0 && rule.direction === 'LONG') ||
    (panda.signal < 0 && rule.direction === 'SHORT');
  const confidenceAdj = directionMatches ? 0.06 : -0.14;
  const updatedConfidence = clamp(
    rule.confidence + confidenceAdj + (panda.confidence - 0.5) * 0.12,
    0.28,
    0.93,
  );
  return {
    ...rule,
    confidence: updatedConfidence,
    rationale: [
      ...rule.rationale,
      directionMatches
        ? 'Panda auto-learning confirms direction and lifts confidence modestly.'
        : 'Panda auto-learning disagrees on direction; confidence reduced.',
    ],
  };
}

function deriveMarketPerformanceHistory(
  repo: MarketRepository,
  userId: string,
): Record<Market, number[]> {
  const rows = repo
    .listExecutions({ userId, limit: 2000 })
    .filter(
      (row) => (row.action === 'DONE' || row.action === 'CLOSE') && Number.isFinite(row.pnl_pct),
    )
    .sort((a, b) => a.created_at_ms - b.created_at_ms);
  const out: Record<Market, number[]> = {
    US: [],
    CRYPTO: [],
  };
  for (const row of rows) {
    const market = row.market === 'CRYPTO' ? 'CRYPTO' : 'US';
    out[market].push(toNum(row.pnl_pct) / 100);
  }
  return out;
}

function buildAdaptiveTuning(panda: PandaAdaptiveDecision): AdaptiveTuning {
  return {
    signal: panda.signal,
    confidence: panda.confidence,
    topFactors: panda.topFactors,
    factorScores: panda.factorScores,
    adaptiveRisk: panda.adaptiveParams.risk,
    adaptivePosition: panda.adaptiveParams.position,
    riskAllowed: panda.risk.allowed,
    riskReason: panda.risk.reason,
    suggestedPositionPct: panda.risk.suggestedPositionPct,
    learningStatus: panda.profile.learningStatus,
  };
}

function evaluateRuleSample(
  bars: NumericBar[],
  ruleId: string,
  direction: 'LONG' | 'SHORT',
): {
  sampleSize: number;
  winRate: number;
  expectedR: number;
  expectedMaxDd: number | null;
} {
  if (bars.length < 90) {
    return { sampleSize: 0, winRate: 0, expectedR: 0, expectedMaxDd: null };
  }

  const hits: number[] = [];
  const drawdowns: number[] = [];
  const horizon = 5;

  for (let i = 65; i < bars.length - horizon; i += 1) {
    const slice = bars.slice(0, i + 1);
    const ctx = statsForBars('US', slice);
    const hit = selectRule(ctx);
    if (!hit || hit.id !== ruleId || hit.direction !== direction) continue;

    const entry = slice[slice.length - 1].close;
    const future = bars.slice(i + 1, i + 1 + horizon);
    if (!future.length || !entry) continue;
    const last = future[future.length - 1].close;
    const signedRet = direction === 'LONG' ? (last - entry) / entry : (entry - last) / entry;
    hits.push(signedRet);

    let worst = 0;
    for (const f of future) {
      const r = direction === 'LONG' ? (f.low - entry) / entry : (entry - f.high) / entry;
      worst = Math.min(worst, r);
    }
    drawdowns.push(Math.abs(worst));
  }

  if (!hits.length) {
    return { sampleSize: 0, winRate: 0, expectedR: 0, expectedMaxDd: null };
  }

  const winRate = hits.filter((r) => r > 0).length / hits.length;
  const avgRet = hits.reduce((acc, v) => acc + v, 0) / hits.length;
  const avgDd = drawdowns.length
    ? drawdowns.reduce((acc, v) => acc + v, 0) / drawdowns.length
    : null;
  const expectedR = avgDd && avgDd > 0 ? avgRet / avgDd : avgRet > 0 ? avgRet * 3 : avgRet * 2;

  return {
    sampleSize: hits.length,
    winRate: round(winRate, 4),
    expectedR: round(expectedR, 4),
    expectedMaxDd: avgDd !== null ? round(avgDd, 4) : null,
  };
}

function sourceStatusForSignal(sampleSize: number): RuntimeStatus {
  if (sampleSize <= 0) return RUNTIME_STATUS.INSUFFICIENT_DATA;
  if (sampleSize < 12) return RUNTIME_STATUS.EXPERIMENTAL;
  return RUNTIME_STATUS.MODEL_DERIVED;
}

function signalGrade(score: number): 'A' | 'B' | 'C' {
  if (score >= 75) return 'A';
  if (score >= 63) return 'B';
  return 'C';
}

function buildSignal(args: {
  market: Market;
  asset: Asset;
  timeframe: Timeframe;
  stats: ReturnType<typeof statsForBars>;
  hit: RuleHit;
  riskProfile: UserRiskProfileRecord;
  nowMs: number;
  adaptive?: AdaptiveTuning;
  strategyVersion?: string;
  cryptoMicrostructure?: CryptoMarketMicrostructure | null;
}): SignalContract {
  const { market, asset, timeframe, stats, hit, riskProfile, nowMs, adaptive } = args;
  const atr = Math.max(0.0001, stats.latestAtr || stats.latest.close * 0.01);
  const directionMul = hit.direction === 'LONG' ? 1 : -1;
  const entryMid = stats.latest.close;
  const entryBand = atr * 0.35;
  const stopDistance = Math.max(atr * 1.2, stats.latest.close * 0.005);
  const stop = round(entryMid - directionMul * stopDistance, 6);
  const tp1 = round(entryMid + directionMul * stopDistance * 1.25, 6);
  const tp2 = round(entryMid + directionMul * stopDistance * 2.1, 6);

  const confidence = round(clamp(hit.confidence, 0.05, 0.98), 4);
  const riskPenalty = stats.riskOffScore * 18 + (stats.volPct / 100) * 12;
  const autoFactorBoost = adaptive?.topFactors?.length ? 2.5 : 0;
  const rawScore = 45 + confidence * 45 + stats.trendStrength * 10 - riskPenalty + autoFactorBoost;
  const score = round(clamp(rawScore, 25, 95), 2);

  const positionBase = clamp(confidence * 18, 3.5, 18);
  const adaptivePositionMul = clamp((adaptive?.adaptivePosition || 0.3) / 0.3, 0.5, 1.25);
  let positionPct = Math.min(positionBase, riskProfile.exposure_cap * 0.3) * adaptivePositionMul;
  if (
    Number.isFinite(adaptive?.suggestedPositionPct) &&
    (adaptive?.suggestedPositionPct || 0) > 0
  ) {
    positionPct = Math.min(positionPct, adaptive!.suggestedPositionPct);
  }
  positionPct = round(clamp(positionPct, 0.5, riskProfile.exposure_cap), 2);

  const tagList = [
    `status:${RUNTIME_STATUS.MODEL_DERIVED}`,
    `source:${RUNTIME_STATUS.DB_BACKED}`,
    `regime:${stats.regimeId.toLowerCase()}`,
    `rule:${hit.id.toLowerCase()}`,
    `auto_learning:${adaptive?.learningStatus === 'READY' ? 'enabled' : 'degraded'}`,
    `auto_risk:${round(adaptive?.adaptiveRisk || 0.02, 4)}`,
    `auto_position:${round(adaptive?.adaptivePosition || 0.3, 4)}`,
  ];
  const topFactorTags = (adaptive?.topFactors || [])
    .slice(0, 3)
    .map((name) => `factor:${String(name).toLowerCase()}`);
  tagList.push(...topFactorTags);

  const signalId = `SIG-${market}-${asset.symbol}-${hit.id}`;
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + (timeframe === '1d' ? 2 : 12) * MS_HOUR).toISOString();
  const cryptoData = args.cryptoMicrostructure || {
    fundingRateCurrent: 0,
    fundingRate8h: 0,
    fundingRate24h: 0,
    basisBps: 0,
    basisPercentile: 50,
    fundingState: 'NEUTRAL' as const,
  };

  const payload: SignalPayload =
    market === 'CRYPTO'
      ? {
          kind: 'CRYPTO',
          data: {
            venue: 'BINANCE',
            instrument_type: args.cryptoMicrostructure ? 'PERP' : 'SPOT',
            perp_metrics: {
              funding_rate_current: cryptoData.fundingRateCurrent,
              funding_rate_8h: cryptoData.fundingRate8h,
              funding_rate_24h: cryptoData.fundingRate24h,
              basis_bps: cryptoData.basisBps,
              basis_percentile: cryptoData.basisPercentile,
            },
            flow_state: {
              spot_led_breakout: hit.id.includes('BREAKOUT'),
              perp_led_breakout:
                Math.abs(cryptoData.basisBps) >= 6 ||
                Math.abs(cryptoData.fundingRateCurrent) >= 0.0008,
              funding_state: cryptoData.fundingState,
            },
            leverage_suggestion: {
              suggested_leverage: 1,
              capped_by_profile: true,
            },
          },
        }
      : {
          kind: 'STOCK_SWING',
          data: {
            horizon: timeframe === '1d' ? 'MEDIUM' : 'SHORT',
            catalysts: ['Derived from OHLCV trend/volatility/range rules'],
          },
        };

  return {
    id: signalId,
    created_at: createdAt,
    expires_at: expiresAt,
    asset_class: assetClassForMarket(market),
    market,
    symbol: asset.symbol,
    timeframe,
    strategy_id: hit.id,
    strategy_family: hit.family,
    strategy_version: args.strategyVersion || 'runtime-bars-rules.v1',
    regime_id: stats.regimeId,
    temperature_percentile: round(stats.tempPct, 2),
    volatility_percentile: round(stats.volPct, 2),
    direction: hit.direction,
    strength: round(confidence * 100, 2),
    confidence,
    entry_zone: {
      low: round(entryMid - entryBand, 6),
      high: round(entryMid + entryBand, 6),
      method: 'LIMIT',
      notes: 'Derived from latest close +/- 0.35 ATR',
    },
    invalidation_level: stop,
    stop_loss: {
      type: 'ATR',
      price: stop,
      rationale: '1.2 ATR stop distance',
    },
    take_profit_levels: [
      {
        price: tp1,
        size_pct: 0.6,
        rationale: '1.25R first take-profit',
      },
      {
        price: tp2,
        size_pct: 0.4,
        rationale: '2.1R extension target',
      },
    ],
    trailing_rule: {
      type: 'EMA',
      params: {
        ema_fast: 10,
        ema_slow: 30,
      },
    },
    position_advice: {
      position_pct: positionPct,
      leverage_cap: Math.max(1, riskProfile.leverage_cap),
      risk_bucket_applied: stats.regimeId === 'RISK_OFF' ? 'DERISKED' : 'BASE',
      rationale: 'Position scaled by confidence, volatility and user risk profile cap.',
    },
    cost_model: {
      fee_bps: market === 'CRYPTO' ? 4 : 1.5,
      spread_bps: market === 'CRYPTO' ? 3.5 : 1,
      slippage_bps: market === 'CRYPTO' ? 4.5 : 1.8,
      funding_est_bps:
        market === 'CRYPTO' ? round(Math.abs(cryptoData.fundingRate24h) * 10_000, 2) : undefined,
      basis_est: market === 'CRYPTO' ? round(Math.abs(cryptoData.basisBps), 2) : 0,
    },
    expected_metrics: {
      expected_R: 0,
      hit_rate_est: 0,
      sample_size: 0,
      expected_max_dd_est: undefined,
    },
    explain_bullets: hit.rationale,
    execution_checklist: [
      `Data source status: ${RUNTIME_STATUS.DB_BACKED}`,
      `Regime: ${stats.regimeId}`,
      'Execute only if entry zone is respected and invalidation is placed immediately.',
      'If liquidity/availability is missing, skip and mark as no-trade.',
      adaptive?.topFactors?.length
        ? `Auto-learning top factors: ${adaptive.topFactors.slice(0, 3).join(', ')}.`
        : 'Auto-learning factors unavailable or insufficient sample.',
    ],
    tags: tagList,
    status: 'NEW',
    payload,
    references: {
      docs_url: 'docs/RUNTIME_DATA_LINEAGE.md',
    },
    score,
    payload_version: 'signal-contract.v1',
  };
}

function withUiFields(signal: SignalContract): SignalContract & Record<string, unknown> {
  const grade = signalGrade(signal.score);
  const sourceTag =
    signal.tags.find((tag) => String(tag).startsWith('status:'))?.split(':')[1] ||
    RUNTIME_STATUS.MODEL_DERIVED;
  return {
    ...signal,
    signal_id: signal.id,
    grade,
    source_label: sourceTag,
    data_status: sourceTag,
    risk_warnings:
      signal.regime_id === 'RISK_OFF'
        ? ['Risk-off regime active. New exposure is discouraged.']
        : signal.volatility_percentile >= 80
          ? ['Volatility elevated. Keep size small and use hard invalidation.']
          : ['Normal execution risk. Respect stop and position cap.'],
    quick_pnl_pct: null,
  };
}

function parseRuleSampleFromSignal(
  signal: SignalContract,
  bars: NumericBar[],
): {
  sampleSize: number;
  winRate: number;
  expectedR: number;
  expectedMaxDd: number | null;
} {
  return evaluateRuleSample(
    bars,
    signal.strategy_id,
    signal.direction === 'SHORT' ? 'SHORT' : 'LONG',
  );
}

function buildPerformanceSnapshotsFromExecutions(args: {
  repo: MarketRepository;
  userId: string;
  nowMs: number;
}): { snapshots: PerformanceSnapshotRecord[]; apiResponse: Record<string, unknown> } {
  const executions = args.repo
    .listExecutions({ userId: args.userId, limit: 5000 })
    .filter(
      (row) => (row.action === 'DONE' || row.action === 'CLOSE') && Number.isFinite(row.pnl_pct),
    );

  const ranges = [
    { key: '30D', windowMs: 30 * 24 * MS_HOUR },
    { key: 'ALL', windowMs: Number.POSITIVE_INFINITY },
  ];

  const markets: Market[] = ['US', 'CRYPTO'];
  const snapshots: PerformanceSnapshotRecord[] = [];
  const records: Array<Record<string, unknown>> = [];

  for (const market of markets) {
    for (const range of ranges) {
      const scoped = executions.filter((row) => {
        if (row.market !== market) return false;
        if (!Number.isFinite(range.windowMs)) return true;
        return row.created_at_ms >= args.nowMs - range.windowMs;
      });

      const sample = scoped.length;
      const pnlSeries = scoped.map((row) => Number(row.pnl_pct || 0) / 100);
      const wins = pnlSeries.filter((p) => p > 0).length;
      const totalRet = pnlSeries.reduce((acc, v) => acc + v, 0);
      let equity = 1;
      let peak = 1;
      let worst = 0;
      for (const r of pnlSeries) {
        equity *= 1 + r;
        peak = Math.max(peak, equity);
        worst = Math.min(worst, (equity - peak) / peak);
      }

      const hasLive = scoped.some((row) => row.mode === 'LIVE');
      const hasPaper = scoped.some((row) => row.mode === 'PAPER');
      const sourceLayer =
        hasLive && hasPaper
          ? 'MIXED'
          : hasLive
            ? RUNTIME_STATUS.REALIZED
            : hasPaper
              ? RUNTIME_STATUS.PAPER_ONLY
              : RUNTIME_STATUS.INSUFFICIENT_DATA;

      const status = sample < 8 ? RUNTIME_STATUS.WITHHELD : RUNTIME_STATUS.DB_BACKED;
      const metrics =
        sample < 8
          ? {
              win_rate: null,
              total_return: null,
              max_drawdown: null,
              withheld_reason: 'insufficient_sample',
            }
          : {
              win_rate: round(wins / sample, 4),
              total_return: round(totalRet, 4),
              max_drawdown: round(Math.abs(worst), 4),
            };

      const payload = {
        market,
        range: range.key,
        source_label: sourceLayer,
        sample_size: sample,
        status,
        assumptions: {
          pnl_source: 'executions.pnl_pct',
          include_open_positions: false,
          include_unrealized: false,
        },
        metrics,
      };

      snapshots.push({
        market,
        range: range.key,
        segment_type: 'OVERALL',
        segment_key: 'ALL',
        source_label:
          hasLive && hasPaper ? 'MIXED' : hasLive ? 'LIVE' : hasPaper ? 'PAPER' : 'BACKTEST',
        sample_size: sample,
        payload_json: JSON.stringify(payload),
        asof_ms: args.nowMs,
        updated_at_ms: args.nowMs,
      });

      records.push(payload);
    }
  }

  const hasAnySample = records.some((row) => Number(row?.sample_size || 0) > 0);

  return {
    snapshots,
    apiResponse: {
      asof: new Date(args.nowMs).toISOString(),
      source_status: hasAnySample ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
      records,
    },
  };
}

function buildCoverageSummary(args: {
  assetsChecked: number;
  assetsWithBars: number;
  generatedSignals: number;
  stateRows: number;
}): Record<string, unknown> {
  return {
    assets_checked: args.assetsChecked,
    assets_with_bars: args.assetsWithBars,
    generated_signals: args.generatedSignals,
    market_state_rows: args.stateRows,
    coverage_ratio: args.assetsChecked ? round(args.assetsWithBars / args.assetsChecked, 4) : 0,
  };
}

function loadStrategyFactoryCandidates(
  repo: MarketRepository,
  market: Market,
): StrategyFactoryCandidate[] {
  const recentRuns = repo.listWorkflowRuns({
    workflowKey: 'nova_strategy_lab',
    status: 'SUCCEEDED',
    limit: 12,
  });
  const freshCutoff = Date.now() - 24 * MS_HOUR;

  for (const run of recentRuns) {
    if ((run.completed_at_ms || run.updated_at_ms || 0) < freshCutoff) continue;
    const input = parseJsonObject(run.input_json);
    const constraints =
      input.constraints && typeof input.constraints === 'object'
        ? (input.constraints as Record<string, unknown>)
        : {};
    const runMarket = String(constraints.market || input.market || '').toUpperCase();
    if (runMarket && runMarket !== market) continue;

    const output = parseJsonObject(run.output_json);
    const rows = parseJsonArray<Record<string, unknown>>(output.selected_candidates);
    const promoted = rows
      .filter((row) => String(row.recommendation || '').toUpperCase() === 'PROMOTE_TO_SHADOW')
      .map((row) => {
        const metadata =
          row.candidate_source_metadata && typeof row.candidate_source_metadata === 'object'
            ? (row.candidate_source_metadata as Record<string, unknown>)
            : {};
        const templateSource =
          metadata.template_source && typeof metadata.template_source === 'object'
            ? (metadata.template_source as Record<string, unknown>)
            : {};
        const mappingQuality =
          metadata.mapping_quality && typeof metadata.mapping_quality === 'object'
            ? (metadata.mapping_quality as Record<string, unknown>)
            : {};
        const publicReferenceIds = [
          ...parseJsonArray<string>(row.public_reference_ids),
          ...parseJsonArray<string>(templateSource.public_reference_ids),
        ]
          .map((item) => String(item || '').trim())
          .filter(Boolean);
        return {
          strategyId: String(row.strategy_id || '').trim(),
          strategyFamily: String(row.strategy_family || '').trim() || 'Nova Factory',
          recommendation: String(row.recommendation || ''),
          nextStage: String(row.next_stage || '').trim() || null,
          candidateQualityScorePct: toNum(row.candidate_quality_score_pct),
          supportingFeatures: parseJsonArray<string>(row.supporting_features).map((item) =>
            String(item),
          ),
          portfolioFit: String(output.portfolio_fit || ''),
          riskNote: String(output.risk_note || ''),
          templateName: String(row.template_name || '').trim() || null,
          templateId:
            String(
              templateSource.seed_key || templateSource.seed_id || row.template_id || '',
            ).trim() || null,
          supportedAssetClasses: parseJsonArray<string>(row.supported_asset_classes).map((item) =>
            String(item).toUpperCase(),
          ),
          compatibleRegimes: parseJsonArray<string>(row.compatible_regimes).map((item) =>
            String(item).toLowerCase(),
          ),
          qualityPriorScore: toNum(row.quality_prior_score),
          generationMode: String(row.generation_mode || '').trim() || null,
          publicReferenceIds: [...new Set(publicReferenceIds)],
          featureOverlapCount: Math.max(0, Math.round(toNum(mappingQuality.feature_overlap_count))),
        };
      })
      .filter((row) => row.strategyId)
      .slice(0, 4);

    if (promoted.length) return promoted;
  }

  return [];
}

function familyBias(
  candidate: StrategyFactoryCandidate,
  signal: SignalContract & Record<string, unknown>,
): number {
  const family = candidate.strategyFamily.toLowerCase();
  const signalRegime = String(signal.regime_id || '').toLowerCase();
  const regimeFit = candidate.compatibleRegimes.some(
    (item) => item === signalRegime || signalRegime.includes(item),
  );
  const assetFit = candidate.supportedAssetClasses.includes(
    String(signal.asset_class || '').toUpperCase(),
  );
  let bias = 2;
  if (regimeFit) bias += 8;
  if (assetFit) bias += 4;
  if (candidate.publicReferenceIds.length) bias += Math.min(4, candidate.publicReferenceIds.length);
  if (candidate.qualityPriorScore >= 0.68) bias += 3;
  if (candidate.featureOverlapCount > 0) bias += Math.min(4, candidate.featureOverlapCount);
  if (family.includes('momentum') || family.includes('trend')) {
    return bias + (signal.regime_id === 'TREND' ? 12 : signal.direction === 'LONG' ? 4 : 0);
  }
  if (family.includes('mean reversion')) {
    return bias + (signal.regime_id === 'RANGE' ? 12 : 0);
  }
  if (family.includes('crypto')) {
    return bias + (signal.market === 'CRYPTO' ? 10 : 0);
  }
  return bias;
}

function buildStrategyFactorySignals(args: {
  market: Market;
  nowMs: number;
  baseSignals: Array<SignalContract & Record<string, unknown>>;
  candidates: StrategyFactoryCandidate[];
}): Array<SignalContract & Record<string, unknown>> {
  const usedSymbols = new Set<string>();
  const overlays: Array<SignalContract & Record<string, unknown>> = [];

  for (const candidate of args.candidates) {
    const base = [...args.baseSignals]
      .filter(
        (signal) =>
          signal.market === args.market &&
          signal.status === 'NEW' &&
          !usedSymbols.has(signal.symbol),
      )
      .sort((a, b) => b.score + familyBias(candidate, b) - (a.score + familyBias(candidate, a)))[0];
    if (!base) continue;

    usedSymbols.add(base.symbol);
    const candidateStrength = clamp(candidate.candidateQualityScorePct / 100, 0.45, 0.96);
    const regimeFit = candidate.compatibleRegimes.some(
      (item) => item === String(base.regime_id || '').toLowerCase(),
    );
    const researchBackedBoost = Math.min(6, candidate.publicReferenceIds.length * 1.5);
    const confidence = round(
      clamp(
        base.confidence * 0.76 +
          candidateStrength * 0.2 +
          (regimeFit ? 0.04 : 0) +
          researchBackedBoost / 200,
        0.35,
        0.97,
      ),
      4,
    );
    const score = round(
      clamp(
        base.score * 0.7 +
          candidate.candidateQualityScorePct * 0.26 +
          familyBias(candidate, base) +
          (regimeFit ? 8 : 0) +
          researchBackedBoost,
        35,
        99,
      ),
      2,
    );
    const signalId = `SIG-${args.market}-${base.symbol}-${candidate.strategyId}`.slice(0, 96);
    const factoryMetadata = {
      source: 'nova_strategy_lab',
      template_name: candidate.templateName,
      template_id: candidate.templateId,
      next_stage: candidate.nextStage || 'shadow',
      quality_score_pct: Math.round(candidate.candidateQualityScorePct),
      quality_prior_score: round(candidate.qualityPriorScore, 4),
      generation_mode: candidate.generationMode,
      supported_asset_classes: candidate.supportedAssetClasses,
      compatible_regimes: candidate.compatibleRegimes,
      supporting_features: candidate.supportingFeatures.slice(0, 6),
      public_reference_ids: candidate.publicReferenceIds,
    };

    const overlay = withUiFields({
      ...base,
      id: signalId,
      created_at: new Date(args.nowMs).toISOString(),
      strategy_id: candidate.strategyId,
      strategy_family: candidate.strategyFamily,
      strategy_version: `nova-factory.${candidate.nextStage || 'shadow'}`,
      confidence,
      strength: round(confidence * 100, 2),
      score,
      explain_bullets: [
        `Promoted from Nova Strategy Lab with ${Math.round(candidate.candidateQualityScorePct)} quality score.`,
        candidate.templateName
          ? `Template: ${candidate.templateName}.`
          : 'Template-backed promotion from the public strategy library.',
        candidate.publicReferenceIds.length
          ? `Research anchors: ${candidate.publicReferenceIds.slice(0, 3).join(', ')}.`
          : 'Promotion is supported by runtime discovery and governance checks.',
        candidate.portfolioFit || 'Selected to complement the current runtime lineup.',
        ...base.explain_bullets.slice(0, 3),
      ],
      execution_checklist: [
        'Factory-promoted card: confirm the setup still matches the current tape before acting.',
        candidate.riskNote || 'Treat factory promotions as governed ideas, not blind automation.',
        ...base.execution_checklist.slice(0, 4),
      ],
      tags: [
        ...base.tags.filter((tag) => !String(tag).startsWith('source:')),
        'source:nova_factory',
        `factory_stage:${String(candidate.nextStage || 'shadow').toLowerCase()}`,
        `factory_quality:${Math.round(candidate.candidateQualityScorePct)}`,
        `factory_regime_fit:${regimeFit ? 'matched' : 'indirect'}`,
        `factory_refs:${candidate.publicReferenceIds.length}`,
        `factory_generation:${tagValue(candidate.generationMode || 'unknown')}`,
        ...(candidate.templateName ? [`factory_template:${tagValue(candidate.templateName)}`] : []),
        ...candidate.publicReferenceIds.slice(0, 2).map((id) => `factory_ref:${tagValue(id)}`),
        ...candidate.supportingFeatures
          .slice(0, 3)
          .map(
            (feature) => `factory_feature:${String(feature).toLowerCase().replace(/\s+/g, '_')}`,
          ),
      ],
    });

    overlays.push({
      ...overlay,
      factory_metadata: factoryMetadata,
    });
  }

  return overlays;
}

function summarizeNews(repo: MarketRepository, market: Market, symbol: string): SignalNewsContext {
  const rows = repo.listNewsItems({
    market,
    symbol,
    limit: 5,
    sinceMs: Date.now() - 1000 * 60 * 60 * 48,
  });
  return buildNewsContext(rows as NewsItemRecord[], symbol);
}

function loadCryptoMicrostructure(
  repo: MarketRepository,
  assetId: number,
): CryptoMarketMicrostructure {
  const fundingRows = repo.listFundingRates({ assetId, limit: 24 });
  const basisRows = repo.listBasisSnapshots({ assetId, limit: 96 });

  const fundingValues = fundingRows
    .map((row) => Number(row.funding_rate))
    .filter((value) => Number.isFinite(value));
  const basisValues = basisRows
    .map((row) => Number(row.basis_bps))
    .filter((value) => Number.isFinite(value));

  const fundingRateCurrent = fundingValues.length ? fundingValues[fundingValues.length - 1] : 0;
  const fundingRate24h = fundingValues.slice(-3).reduce((acc, value) => acc + value, 0);
  const basisBps = basisValues.length ? basisValues[basisValues.length - 1] : 0;

  return {
    fundingRateCurrent: round(fundingRateCurrent, 8),
    fundingRate8h: round(fundingRateCurrent, 8),
    fundingRate24h: round(fundingRate24h, 8),
    basisBps: round(basisBps, 4),
    basisPercentile: basisValues.length ? percentileRank(basisValues, basisBps) : 50,
    fundingState: Math.abs(fundingRateCurrent) >= 0.0008 ? 'EXTREME' : 'NEUTRAL',
  };
}

function adjustRuleForNews(rule: RuleHit, news: SignalNewsContext): RuleHit {
  if (!news.headline_count || news.tone === 'NONE' || news.tone === 'NEUTRAL') {
    if (!Number.isFinite(Number(news.factor_score || NaN))) {
      return rule;
    }
  }
  let adjusted = rule.confidence;
  const direction = rule.direction;
  if (news.tone === 'POSITIVE') {
    adjusted += direction === 'LONG' ? 0.04 : -0.05;
  } else if (news.tone === 'NEGATIVE') {
    adjusted += direction === 'SHORT' ? 0.04 : -0.06;
  } else if (news.tone === 'MIXED') {
    adjusted -= 0.02;
  }
  const factorScore = Number(news.factor_score);
  if (Number.isFinite(factorScore)) {
    adjusted += direction === 'LONG' ? factorScore * 0.08 : -factorScore * 0.08;
  }
  if (Number(news.event_risk_score || 0) >= 0.75) {
    adjusted -= 0.025;
  }
  if (Number(news.macro_policy_score || 0) >= 0.7) {
    adjusted -= 0.015;
  }
  return {
    ...rule,
    confidence: clamp(adjusted, 0.22, 0.94),
    rationale: [
      ...rule.rationale,
      news.tone === 'POSITIVE'
        ? 'Recent headline tone is supportive.'
        : news.tone === 'NEGATIVE'
          ? 'Recent headline tone is adverse.'
          : news.tone === 'MIXED'
            ? 'Recent headline flow is mixed, so conviction is trimmed.'
            : 'Recent Gemini-derived news factors are shaping conviction.',
      news.factor_summary ? news.factor_summary : null,
      Number(news.event_risk_score || 0) >= 0.75
        ? 'Event-risk score is elevated, so risk is trimmed.'
        : null,
    ].filter(Boolean) as string[],
  };
}

export function deriveRuntimeState(params: {
  repo: MarketRepository;
  userId: string;
  riskProfile: UserRiskProfileRecord;
}): {
  asofMs: number;
  signals: Array<SignalContract & Record<string, unknown>>;
  marketState: MarketStateRecord[];
  performanceApi: Record<string, unknown>;
  performanceSnapshots: PerformanceSnapshotRecord[];
  freshnessSummary: Record<string, unknown>;
  coverageSummary: Record<string, unknown>;
  sourceStatus: RuntimeStatus;
} {
  const { repo, userId, riskProfile } = params;
  const nowMs = Date.now();
  const cfg = getConfig();

  const targets: Array<{ market: Market; symbol: string }> = [
    ...cfg.markets.US.symbols.map((symbol) => ({
      market: 'US' as const,
      symbol: symbol.toUpperCase(),
    })),
    ...cfg.markets.CRYPTO.symbols.map((symbol) => ({
      market: 'CRYPTO' as const,
      symbol: symbol.toUpperCase(),
    })),
  ];

  const marketStateRows: MarketStateRecord[] = [];
  const derivedSignals: Array<SignalContract & Record<string, unknown>> = [];
  const activeSignalIds: string[] = [];
  const performanceHistoryByMarket = deriveMarketPerformanceHistory(repo, userId);
  const activePandaModelByMarket: Record<Market, ReturnType<typeof loadActivePandaModel>> = {
    US: loadActivePandaModel(repo, 'US'),
    CRYPTO: loadActivePandaModel(repo, 'CRYPTO'),
  };
  const calibrator = createConfidenceCalibrator({ repo, userId });

  const freshnessRows: Array<Record<string, unknown>> = [];
  let assetsWithBars = 0;

  for (const target of targets) {
    const asset = repo.getAssetBySymbol(target.market, target.symbol);
    if (!asset) {
      freshnessRows.push({
        market: target.market,
        symbol: target.symbol,
        timeframe: timeframeForMarket(target.market),
        status: RUNTIME_STATUS.INSUFFICIENT_DATA,
        age_hours: null,
        bar_count: 0,
      });
      continue;
    }

    const timeframe = timeframeForMarket(target.market);
    const { bars, quality } = parseBars(repo, asset.asset_id, timeframe, 320);
    const latestObservedTs =
      bars.length > 0
        ? bars[bars.length - 1].ts_open
        : (repo.getLatestTsOpen(asset.asset_id, timeframe) ?? null);
    const anomalyWindowStart =
      latestObservedTs === null ? undefined : latestObservedTs - timeframeToMs(timeframe) * 320;
    const anomalySummary = repo.getIngestAnomalySummary({
      assetId: asset.asset_id,
      timeframe,
      startTsOpen: anomalyWindowStart,
      endTsOpen: latestObservedTs === null ? undefined : latestObservedTs,
    });
    const persistedQualityState = repo.getOhlcvQualityState({
      assetId: asset.asset_id,
      timeframe,
    });
    const qualityMetrics = parseJsonObject(persistedQualityState?.metrics_json);
    const qualityFlags = buildQualityFlags({
      status: persistedQualityState?.status,
      reason: persistedQualityState?.reason,
      metrics: qualityMetrics,
    });
    const lookbackYearStart =
      latestObservedTs === null ? undefined : latestObservedTs - timeframeToMs(timeframe) * 365;
    const corporateActions = repo.listCorporateActions({
      assetId: asset.asset_id,
      startTs: lookbackYearStart,
      endTs: latestObservedTs === null ? undefined : latestObservedTs,
    });
    const calendarExceptions = repo.listTradingCalendarExceptions({
      market: target.market,
      assetId: asset.asset_id,
      startDayKey:
        lookbackYearStart === undefined
          ? undefined
          : new Date(lookbackYearStart).toISOString().slice(0, 10),
      endDayKey:
        latestObservedTs === null ? undefined : new Date(latestObservedTs).toISOString().slice(0, 10),
    });
    const anomalyPressure = assessRecentAnomalyPressure({
      summary: anomalySummary,
      quality,
    });

    if (quality.blocked || anomalyPressure.blocked || bars.length < 80) {
      freshnessRows.push({
        market: target.market,
        symbol: target.symbol,
        timeframe,
        status: RUNTIME_STATUS.INSUFFICIENT_DATA,
        age_hours: null,
        bar_count: bars.length,
        quality_gate_reason: quality.reason || anomalyPressure.reason,
        dropped_bars: quality.droppedCount,
        envelope_repairs: quality.envelopeAdjustedCount,
        zero_volume_bars: quality.zeroVolumeCount,
        extreme_move_bars: quality.extremeMoveCount,
        flat_run_count: quality.flatRunCount,
        zero_volume_run_count: quality.zeroVolumeRunCount,
        max_move_pct: round(quality.maxMovePct, 4),
        recent_anomaly_count: anomalySummary.totalCount,
        recent_anomaly_density: anomalyPressure.totalDensity,
        recent_price_anomaly_density: anomalyPressure.priceDensity,
        quality_state_status: persistedQualityState?.status || null,
        quality_state_reason: persistedQualityState?.reason || null,
        quality_state_metrics: qualityMetrics,
        quality_flags: qualityFlags,
        quality_state_updated_at: persistedQualityState?.updated_at || null,
        recent_corporate_action_count: corporateActions.length,
        recent_calendar_exception_count: calendarExceptions.length,
      });
      continue;
    }

    assetsWithBars += 1;
    const ctx = statsForBars(target.market, bars);
    const latestTs = bars[bars.length - 1].ts_open;
    const ageHours = (nowMs - latestTs) / MS_HOUR;
    const staleThreshold = target.market === 'CRYPTO' ? 8 : 72;
    const freshnessStatus =
      ageHours > staleThreshold ? RUNTIME_STATUS.INSUFFICIENT_DATA : RUNTIME_STATUS.DB_BACKED;
    freshnessRows.push({
      market: target.market,
      symbol: target.symbol,
      timeframe,
      status: freshnessStatus,
      age_hours: round(ageHours, 2),
      bar_count: bars.length,
      quality_gate_reason: quality.reason,
      dropped_bars: quality.droppedCount,
      envelope_repairs: quality.envelopeAdjustedCount,
      zero_volume_bars: quality.zeroVolumeCount,
      extreme_move_bars: quality.extremeMoveCount,
      flat_run_count: quality.flatRunCount,
      zero_volume_run_count: quality.zeroVolumeRunCount,
      max_move_pct: round(quality.maxMovePct, 4),
      recent_anomaly_count: anomalySummary.totalCount,
      recent_anomaly_density: anomalyPressure.totalDensity,
      recent_price_anomaly_density: anomalyPressure.priceDensity,
      quality_state_status: persistedQualityState?.status || null,
      quality_state_reason: persistedQualityState?.reason || null,
      quality_state_metrics: qualityMetrics,
      quality_flags: qualityFlags,
      quality_state_updated_at: persistedQualityState?.updated_at || null,
      recent_corporate_action_count: corporateActions.length,
      recent_calendar_exception_count: calendarExceptions.length,
    });

    const baselineRule = selectRule(ctx);
    const activeModel = activePandaModelByMarket[target.market];
    const pandaDecision = buildPandaAdaptiveDecision({
      market: target.market,
      bars,
      performanceHistory: performanceHistoryByMarket[target.market] || [],
      riskProfile,
      modelConfig: activeModel.config,
    });
    const adaptiveTuning = buildAdaptiveTuning(pandaDecision);
    let ruleHit: RuleHit | null = baselineRule;
    if (!ruleHit) {
      ruleHit = fallbackRuleFromPanda(ctx, pandaDecision);
    } else {
      ruleHit = mergeRuleWithPanda(ruleHit, pandaDecision);
    }
    const newsContext = summarizeNews(repo, target.market, target.symbol);
    const cryptoMicrostructure =
      target.market === 'CRYPTO' ? loadCryptoMicrostructure(repo, asset.asset_id) : null;
    if (ruleHit) {
      ruleHit = adjustRuleForNews(ruleHit, newsContext);
    }

    const eventStats = {
      source_status: freshnessStatus,
      data_status: freshnessStatus,
      derivation: 'ohlcv-bars-rules.v1',
      bars_used: bars.length,
      latest_close: round(ctx.latest.close, 6),
      ema_fast: round(ctx.emaFast, 6),
      ema_slow: round(ctx.emaSlow, 6),
      zscore: round(ctx.zScore, 4),
      vol_impulse: round(ctx.volImpulse, 4),
      signal_candidate: ruleHit?.id || null,
      news_context: newsContext,
      crypto_microstructure: cryptoMicrostructure,
      bar_quality: {
        dropped_bars: quality.droppedCount,
        envelope_repairs: quality.envelopeAdjustedCount,
        zero_volume_bars: quality.zeroVolumeCount,
        extreme_move_bars: quality.extremeMoveCount,
        flat_run_count: quality.flatRunCount,
        zero_volume_run_count: quality.zeroVolumeRunCount,
        max_move_pct: round(quality.maxMovePct, 4),
      },
      recent_ingest_anomalies: {
        total_count: anomalySummary.totalCount,
        distinct_ts_count: anomalySummary.distinctTsCount,
        latest_ts_open: anomalySummary.latestTsOpen,
        latest_created_at: anomalySummary.latestCreatedAt,
        counts_by_type: anomalySummary.countsByType,
        density: anomalyPressure.totalDensity,
        price_density: anomalyPressure.priceDensity,
        envelope_density: anomalyPressure.envelopeDensity,
        zero_volume_density: anomalyPressure.zeroVolumeDensity,
      },
      persisted_quality_state: persistedQualityState
        ? {
            status: persistedQualityState.status,
            reason: persistedQualityState.reason,
            updated_at: persistedQualityState.updated_at,
          }
        : null,
      quality_flags: qualityFlags,
      panda: {
        active_model_id: activeModel.modelId,
        active_model_version: activeModel.semanticVersion,
        safe_mode: activeModel.config.safeMode,
        signal: pandaDecision.signal,
        confidence: pandaDecision.confidence,
        top_factors: pandaDecision.topFactors,
        factor_scores: pandaDecision.factorScores,
        adaptive_params: pandaDecision.adaptiveParams,
        risk: pandaDecision.risk,
        learning_status: pandaDecision.profile.learningStatus,
      },
    };

    marketStateRows.push({
      market: target.market,
      symbol: target.symbol,
      timeframe,
      snapshot_ts_ms: nowMs,
      regime_id: ctx.regimeId,
      trend_strength: round(ctx.trendStrength, 4),
      temperature_percentile: round(ctx.tempPct, 2),
      volatility_percentile: round(ctx.volPct, 2),
      risk_off_score: round(ctx.riskOffScore, 4),
      stance: ctx.stance,
      event_stats_json: JSON.stringify(eventStats),
      assumptions_json: JSON.stringify({
        source_label: freshnessStatus,
        derivation: 'derived_from_ohlcv',
        stale_hours: round(ageHours, 2),
      }),
      updated_at_ms: nowMs,
    });

    if (activeModel.config.safeMode) continue;
    if (!ruleHit || ctx.riskOffScore >= 0.8) continue;
    if (adaptiveTuning.learningStatus === 'READY' && !adaptiveTuning.riskAllowed) continue;
    if (ruleHit.confidence < 0.4) continue;

    const signal = buildSignal({
      market: target.market,
      asset,
      timeframe,
      stats: ctx,
      hit: ruleHit,
      riskProfile,
      nowMs,
      adaptive: adaptiveTuning,
      strategyVersion: activeModel.semanticVersion,
      cryptoMicrostructure,
    });

    const sampled = parseRuleSampleFromSignal(signal, bars);
    signal.expected_metrics = {
      expected_R: sampled.sampleSize < 8 ? 0 : sampled.expectedR,
      hit_rate_est: sampled.sampleSize < 8 ? 0 : sampled.winRate,
      sample_size: sampled.sampleSize,
      expected_max_dd_est: sampled.expectedMaxDd ?? undefined,
    };
    const calibration = calibrator.calibrateSignal(
      signal as SignalContract & Record<string, unknown>,
    );
    signal.confidence = calibration.calibrated_confidence;
    signal.confidence_details = calibration;
    signal.position_advice.position_pct = round(
      clamp(
        signal.position_advice.position_pct * calibration.sizing_multiplier,
        0.35,
        riskProfile.exposure_cap,
      ),
      2,
    );
    signal.position_advice.rationale = `Position scaled by calibrated confidence (${Math.round(
      calibration.calibrated_confidence * 100,
    )}%), execution reliability, and user risk profile cap.`;
    const alphaOverlay = applyAlphaRuntimeOverlays({
      repo,
      signal,
    });
    const overlaidConfidence = round(
      clamp(
        alphaOverlay.block
          ? Math.min(signal.confidence, 0.35) * alphaOverlay.confidence_multiplier
          : signal.confidence * alphaOverlay.confidence_multiplier,
        0.05,
        0.98,
      ),
      4,
    );
    signal.confidence = overlaidConfidence;
    signal.position_advice.position_pct = round(
      clamp(
        signal.position_advice.position_pct *
          alphaOverlay.weight_multiplier *
          (alphaOverlay.block ? 0.35 : 1),
        alphaOverlay.block ? 0.05 : 0.35,
        riskProfile.exposure_cap,
      ),
      2,
    );
    signal.position_advice.rationale = alphaOverlay.applied_candidates.length
      ? `${signal.position_advice.rationale} Alpha overlays applied (${alphaOverlay.applied_candidates.length}) and still routed through the risk governor.`
      : signal.position_advice.rationale;
    (signal as SignalContract & Record<string, unknown>).alpha_overlay = alphaOverlay;
    signal.confidence_details = {
      ...calibration,
      calibrated_confidence: overlaidConfidence,
      alpha_overlay_applied: alphaOverlay.applied_candidates.length > 0,
      alpha_overlay_blocked: alphaOverlay.block,
      alpha_overlay_notes: alphaOverlay.notes,
      alpha_overlay_candidates: alphaOverlay.applied_candidates,
    } as typeof calibration & Record<string, unknown>;
    signal.lineage = buildEvidenceLineage({
      runtimeStatus: freshnessStatus,
      performanceStatus: RUNTIME_STATUS.INSUFFICIENT_DATA,
      replayEvidenceAvailable: false,
      paperEvidenceAvailable: false,
      sourceStatus: freshnessStatus,
      dataStatus: freshnessStatus,
    });
    signal.news_context = newsContext;

    const statusLabel = sourceStatusForSignal(sampled.sampleSize);
    signal.tags = [
      ...signal.tags.filter((tag) => !String(tag).startsWith('status:')),
      `status:${statusLabel}`,
      `sample_size:${sampled.sampleSize}`,
      `calibration_bucket:${calibration.calibration_bucket}`,
      `news_tone:${newsContext.tone.toLowerCase()}`,
      alphaOverlay.applied_candidates.length ? `alpha_overlay:active` : `alpha_overlay:none`,
      alphaOverlay.block ? 'alpha_overlay:block' : 'alpha_overlay:pass',
    ];
    if (alphaOverlay.applied_candidates.length) {
      signal.explain_bullets = [
        ...signal.explain_bullets,
        alphaOverlay.block
          ? 'Mature alpha overlay downgraded this setup before it reached portfolio risk gating.'
          : 'Mature alpha overlay adjusted confidence/weight before portfolio risk gating.',
      ];
    }

    const withUi = withUiFields(signal);
    derivedSignals.push(withUi);
    activeSignalIds.push(signal.id);
  }

  const performance = buildPerformanceSnapshotsFromExecutions({
    repo,
    userId,
    nowMs,
  });
  repo.upsertPerformanceSnapshots(performance.snapshots);

  const coverageSummary = buildCoverageSummary({
    assetsChecked: targets.length,
    assetsWithBars,
    generatedSignals: derivedSignals.length,
    stateRows: marketStateRows.length,
  });

  const factorySignals = [
    ...buildStrategyFactorySignals({
      market: 'US',
      nowMs,
      baseSignals: derivedSignals,
      candidates: loadStrategyFactoryCandidates(repo, 'US'),
    }),
    ...buildStrategyFactorySignals({
      market: 'CRYPTO',
      nowMs,
      baseSignals: derivedSignals,
      candidates: loadStrategyFactoryCandidates(repo, 'CRYPTO'),
    }),
  ];

  if (factorySignals.length) {
    derivedSignals.push(...factorySignals);
    activeSignalIds.push(...factorySignals.map((signal) => signal.id));
    coverageSummary.generated_signals = derivedSignals.length;
  }

  repo.upsertMarketStates(marketStateRows);
  repo.upsertSignals(derivedSignals);
  repo.expireSignalsNotIn(activeSignalIds);

  const sourceStatus =
    assetsWithBars > 0 ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA;

  return {
    asofMs: nowMs,
    signals: derivedSignals,
    marketState: marketStateRows,
    performanceApi: performance.apiResponse,
    performanceSnapshots: performance.snapshots,
    freshnessSummary: {
      source_status: sourceStatus,
      rows: freshnessRows,
      stale_count: freshnessRows.filter((row) => row.status !== RUNTIME_STATUS.DB_BACKED).length,
    },
    coverageSummary,
    sourceStatus,
  };
}

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
  UserRiskProfileRecord
} from '../types.js';
import { MarketRepository } from '../db/repository.js';
import { RUNTIME_STATUS, type RuntimeStatus } from '../runtimeStatus.js';
import {
  buildPandaAdaptiveDecision,
  resolvePandaModelConfig,
  type PandaAdaptiveDecision,
  type PandaModelRuntimeConfig
} from './pandaEngine.js';
import { createConfidenceCalibrator } from '../confidence/calibration.js';
import { buildEvidenceLineage } from '../evidence/lineage.js';
import { buildNewsContext } from '../news/provider.js';
import type { NewsItemRecord } from '../types.js';

const MS_HOUR = 3600_000;

type NumericBar = {
  ts_open: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type SignalNewsContext = {
  symbol: string;
  headline_count: number;
  tone: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL' | 'NONE';
  top_headlines: string[];
  updated_at: string | null;
  source: string;
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
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
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

function timeframeForMarket(market: Market): Timeframe {
  return market === 'CRYPTO' ? '1h' : '1d';
}

function assetClassForMarket(market: Market): AssetClass {
  return market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK';
}

function pandaModelKeyForMarket(market: Market): string {
  return `panda-runtime-${market.toLowerCase()}`;
}

function loadActivePandaModel(repo: MarketRepository, market: Market): {
  modelId: string | null;
  semanticVersion: string;
  config: PandaModelRuntimeConfig;
} {
  const model =
    repo
      .listModelVersions({
        modelKey: pandaModelKeyForMarket(market),
        limit: 20
      })
      .find((row) => row.status === 'active') || null;
  return {
    modelId: model?.id ?? null,
    semanticVersion: model?.semantic_version || 'runtime-bars-rules.v1',
    config: resolvePandaModelConfig(model ? JSON.parse(model.config_json || '{}') : { modelKey: pandaModelKeyForMarket(market) })
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
      Math.abs(cur.low - prev.close)
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

function parseBars(repo: MarketRepository, assetId: number, timeframe: Timeframe, limit = 320): NumericBar[] {
  const rows = repo.getOhlcv({ assetId, timeframe, limit });
  return sortBars(
    rows.map((row) => ({
      ts_open: row.ts_open,
      open: toNum(row.open),
      high: toNum(row.high),
      low: toNum(row.low),
      close: toNum(row.close),
      volume: toNum(row.volume)
    }))
  );
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
      stance: 'Risk-off: preserve capital, avoid forced entries.'
    };
  }

  if (args.volPct >= 80) {
    return {
      regimeId: 'HIGH_VOL',
      stance: 'High volatility: size down and demand stronger confirmation.'
    };
  }

  if (args.trendStrength >= 0.58) {
    const trendSide = args.close >= args.emaSlow ? 'uptrend' : 'downtrend';
    return {
      regimeId: 'TREND',
      stance: `Trend regime (${trendSide}): favor continuation, avoid counter-trend sizing.`
    };
  }

  return {
    regimeId: 'RANGE',
    stance: 'Range regime: prioritize mean-reversion edges and tighter invalidation.'
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
  const trendStrength = clamp(Math.abs(spread) * 20 + Math.abs((latest.close - emaAnchor) / Math.max(1e-9, emaAnchor)) * 8, 0, 1);

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
    return Math.abs((c - p1) / Math.max(1e-9, p1)) * 4 + Math.abs((c - p5) / Math.max(1e-9, p5)) * 2 + Math.max(0, vv - 1) + Math.abs((c - e10) / Math.max(1e-9, e10)) * 3;
  });
  const tempPct = percentileRank(tempSeries.slice(-140), tempScore);

  const retSeries = returns(closes).slice(-60);
  const downside = retSeries.filter((r) => r < 0).map((r) => Math.abs(r));
  const downsideVol = std(downside);
  const drift = retSeries.length ? retSeries.reduce((acc, v) => acc + v, 0) / retSeries.length : 0;
  const riskOffRaw = clamp((volPct / 100) * 0.45 + (downsideVol * 25) * 0.3 + (drift < 0 ? Math.min(0.3, Math.abs(drift) * 20) : 0) + (market === 'CRYPTO' ? 0.06 : 0), 0, 1);

  const zWindow = closes.slice(-40);
  const zMean = zWindow.length ? zWindow.reduce((acc, v) => acc + v, 0) / zWindow.length : latest.close;
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
    emaSlow
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
    stance
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

  const breakout = ctx.latest.close > ctx.breakoutHigh && ctx.volImpulse >= 1.05 && ctx.trendStrength >= 0.45;
  if (breakout) {
    return {
      id: 'TREND_BREAKOUT',
      family: 'Momentum / Trend Following',
      direction: 'LONG',
      confidence: clamp(0.55 + ctx.trendStrength * 0.25 + Math.min(0.15, (ctx.volImpulse - 1) * 0.2), 0.52, 0.92),
      rationale: [
        'Price closed above 20-bar high with volume confirmation.',
        'Trend spread remains positive across fast/slow EMA.',
        'Volatility is elevated but not in explicit risk-off state.'
      ]
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
      confidence: clamp(0.5 + ctx.trendStrength * 0.22 + Math.max(0, -ctx.zScore) * 0.05, 0.48, 0.86),
      rationale: [
        'Pullback into trend support zone (EMA fast/slow band).',
        '5-bar drift remains positive, favoring continuation.',
        'Entry is closer to invalidation than to breakout exhaustion.'
      ]
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
        'Volatility is not in extreme panic regime.'
      ]
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
        'Signal is suppressed when volatility reaches panic threshold.'
      ]
    };
  }

  const breakdownShort = ctx.latest.close < ctx.breakdownLow && ctx.volImpulse >= 1.08 && ctx.volPct >= 55;
  if (breakdownShort) {
    return {
      id: 'VOL_BREAKDOWN',
      family: 'Regime Transition',
      direction: 'SHORT',
      confidence: clamp(0.52 + Math.min(0.2, (ctx.volPct - 50) / 100) + Math.min(0.12, (ctx.volImpulse - 1) * 0.2), 0.5, 0.88),
      rationale: [
        'Breakdown below 20-bar support under expanding range.',
        'Volatility expansion confirms transition risk.',
        'Setup is downgraded when risk-off score is already extreme.'
      ]
    };
  }

  return null;
}

function fallbackRuleFromPanda(ctx: ReturnType<typeof statsForBars>, panda: PandaAdaptiveDecision): RuleHit | null {
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
        `Top factors: ${panda.topFactors.slice(0, 3).join(', ') || 'trend_strength, reversal_score'}.`
      ]
    };
  }
  return {
    id: ctx.regimeId === 'RANGE' ? 'RANGE_MEANREV_SHORT' : 'VOL_BREAKDOWN',
    family: ctx.regimeId === 'RANGE' ? 'Mean Reversion' : 'Regime Transition',
    direction: 'SHORT',
    confidence: clamp(0.5 + panda.confidence * 0.4, 0.48, 0.88),
    rationale: [
      'Panda adaptive layer selected a short-side setup from factor state.',
      `Top factors: ${panda.topFactors.slice(0, 3).join(', ') || 'trend_strength, reversal_score'}.`
    ]
  };
}

function mergeRuleWithPanda(rule: RuleHit, panda: PandaAdaptiveDecision): RuleHit {
  if (panda.signal === 0) return rule;
  const directionMatches =
    (panda.signal > 0 && rule.direction === 'LONG') || (panda.signal < 0 && rule.direction === 'SHORT');
  const confidenceAdj = directionMatches ? 0.06 : -0.14;
  const updatedConfidence = clamp(rule.confidence + confidenceAdj + (panda.confidence - 0.5) * 0.12, 0.28, 0.93);
  return {
    ...rule,
    confidence: updatedConfidence,
    rationale: [
      ...rule.rationale,
      directionMatches
        ? 'Panda auto-learning confirms direction and lifts confidence modestly.'
        : 'Panda auto-learning disagrees on direction; confidence reduced.'
    ]
  };
}

function deriveMarketPerformanceHistory(repo: MarketRepository, userId: string): Record<Market, number[]> {
  const rows = repo
    .listExecutions({ userId, limit: 2000 })
    .filter((row) => (row.action === 'DONE' || row.action === 'CLOSE') && Number.isFinite(row.pnl_pct))
    .sort((a, b) => a.created_at_ms - b.created_at_ms);
  const out: Record<Market, number[]> = {
    US: [],
    CRYPTO: []
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
    learningStatus: panda.profile.learningStatus
  };
}

function evaluateRuleSample(bars: NumericBar[], ruleId: string, direction: 'LONG' | 'SHORT'): {
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
  const avgDd = drawdowns.length ? drawdowns.reduce((acc, v) => acc + v, 0) / drawdowns.length : null;
  const expectedR = avgDd && avgDd > 0 ? avgRet / avgDd : avgRet > 0 ? avgRet * 3 : avgRet * 2;

  return {
    sampleSize: hits.length,
    winRate: round(winRate, 4),
    expectedR: round(expectedR, 4),
    expectedMaxDd: avgDd !== null ? round(avgDd, 4) : null
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
  if (Number.isFinite(adaptive?.suggestedPositionPct) && (adaptive?.suggestedPositionPct || 0) > 0) {
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
    `auto_position:${round(adaptive?.adaptivePosition || 0.3, 4)}`
  ];
  const topFactorTags = (adaptive?.topFactors || []).slice(0, 3).map((name) => `factor:${String(name).toLowerCase()}`);
  tagList.push(...topFactorTags);

  const signalId = `SIG-${market}-${asset.symbol}-${hit.id}`;
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + (timeframe === '1d' ? 2 : 12) * MS_HOUR).toISOString();

  const payload: SignalPayload =
    market === 'CRYPTO'
      ? {
          kind: 'CRYPTO',
          data: {
            venue: 'BINANCE',
            instrument_type: 'SPOT',
            perp_metrics: {
              funding_rate_current: 0,
              funding_rate_8h: 0,
              funding_rate_24h: 0,
              basis_bps: 0,
              basis_percentile: 50
            },
            flow_state: {
              spot_led_breakout: hit.id.includes('BREAKOUT'),
              perp_led_breakout: false,
              funding_state: 'NEUTRAL'
            },
            leverage_suggestion: {
              suggested_leverage: 1,
              capped_by_profile: true
            }
          }
        }
      : {
          kind: 'STOCK_SWING',
          data: {
            horizon: timeframe === '1d' ? 'MEDIUM' : 'SHORT',
            catalysts: ['Derived from OHLCV trend/volatility/range rules']
          }
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
      notes: 'Derived from latest close +/- 0.35 ATR'
    },
    invalidation_level: stop,
    stop_loss: {
      type: 'ATR',
      price: stop,
      rationale: '1.2 ATR stop distance'
    },
    take_profit_levels: [
      {
        price: tp1,
        size_pct: 0.6,
        rationale: '1.25R first take-profit'
      },
      {
        price: tp2,
        size_pct: 0.4,
        rationale: '2.1R extension target'
      }
    ],
    trailing_rule: {
      type: 'EMA',
      params: {
        ema_fast: 10,
        ema_slow: 30
      }
    },
    position_advice: {
      position_pct: positionPct,
      leverage_cap: Math.max(1, riskProfile.leverage_cap),
      risk_bucket_applied: stats.regimeId === 'RISK_OFF' ? 'DERISKED' : 'BASE',
      rationale: 'Position scaled by confidence, volatility and user risk profile cap.'
    },
    cost_model: {
      fee_bps: market === 'CRYPTO' ? 4 : 1.5,
      spread_bps: market === 'CRYPTO' ? 3.5 : 1,
      slippage_bps: market === 'CRYPTO' ? 4.5 : 1.8,
      funding_est_bps: market === 'CRYPTO' ? 0 : undefined,
      basis_est: 0
    },
    expected_metrics: {
      expected_R: 0,
      hit_rate_est: 0,
      sample_size: 0,
      expected_max_dd_est: undefined
    },
    explain_bullets: hit.rationale,
    execution_checklist: [
      `Data source status: ${RUNTIME_STATUS.DB_BACKED}`,
      `Regime: ${stats.regimeId}`,
      'Execute only if entry zone is respected and invalidation is placed immediately.',
      'If liquidity/availability is missing, skip and mark as no-trade.',
      adaptive?.topFactors?.length
        ? `Auto-learning top factors: ${adaptive.topFactors.slice(0, 3).join(', ')}.`
        : 'Auto-learning factors unavailable or insufficient sample.'
    ],
    tags: tagList,
    status: 'NEW',
    payload,
    references: {
      docs_url: 'docs/RUNTIME_DATA_LINEAGE.md'
    },
    score,
    payload_version: 'signal-contract.v1'
  };
}

function withUiFields(signal: SignalContract): SignalContract & Record<string, unknown> {
  const grade = signalGrade(signal.score);
  const sourceTag =
    signal.tags.find((tag) => String(tag).startsWith('status:'))?.split(':')[1] || RUNTIME_STATUS.MODEL_DERIVED;
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
    quick_pnl_pct: null
  };
}

function parseRuleSampleFromSignal(signal: SignalContract, bars: NumericBar[]): {
  sampleSize: number;
  winRate: number;
  expectedR: number;
  expectedMaxDd: number | null;
} {
  return evaluateRuleSample(bars, signal.strategy_id, signal.direction === 'SHORT' ? 'SHORT' : 'LONG');
}

function buildPerformanceSnapshotsFromExecutions(args: {
  repo: MarketRepository;
  userId: string;
  nowMs: number;
}): { snapshots: PerformanceSnapshotRecord[]; apiResponse: Record<string, unknown> } {
  const executions = args.repo
    .listExecutions({ userId: args.userId, limit: 5000 })
    .filter((row) => (row.action === 'DONE' || row.action === 'CLOSE') && Number.isFinite(row.pnl_pct));

  const ranges = [
    { key: '30D', windowMs: 30 * 24 * MS_HOUR },
    { key: 'ALL', windowMs: Number.POSITIVE_INFINITY }
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
              withheld_reason: 'insufficient_sample'
            }
          : {
              win_rate: round(wins / sample, 4),
              total_return: round(totalRet, 4),
              max_drawdown: round(Math.abs(worst), 4)
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
          include_unrealized: false
        },
        metrics
      };

      snapshots.push({
        market,
        range: range.key,
        segment_type: 'OVERALL',
        segment_key: 'ALL',
        source_label: hasLive && hasPaper ? 'MIXED' : hasLive ? 'LIVE' : hasPaper ? 'PAPER' : 'BACKTEST',
        sample_size: sample,
        payload_json: JSON.stringify(payload),
        asof_ms: args.nowMs,
        updated_at_ms: args.nowMs
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
      records
    }
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
    coverage_ratio: args.assetsChecked ? round(args.assetsWithBars / args.assetsChecked, 4) : 0
  };
}

function loadStrategyFactoryCandidates(repo: MarketRepository, market: Market): StrategyFactoryCandidate[] {
  const recentRuns = repo.listWorkflowRuns({
    workflowKey: 'nova_strategy_lab',
    status: 'SUCCEEDED',
    limit: 12
  });
  const freshCutoff = Date.now() - 24 * MS_HOUR;

  for (const run of recentRuns) {
    if ((run.completed_at_ms || run.updated_at_ms || 0) < freshCutoff) continue;
    const input = parseJsonObject(run.input_json);
    const constraints = input.constraints && typeof input.constraints === 'object' ? (input.constraints as Record<string, unknown>) : {};
    const runMarket = String(constraints.market || input.market || '').toUpperCase();
    if (runMarket && runMarket !== market) continue;

    const output = parseJsonObject(run.output_json);
    const rows = parseJsonArray<Record<string, unknown>>(output.selected_candidates);
    const promoted = rows
      .filter((row) => String(row.recommendation || '').toUpperCase() === 'PROMOTE_TO_SHADOW')
      .map((row) => ({
        strategyId: String(row.strategy_id || '').trim(),
        strategyFamily: String(row.strategy_family || '').trim() || 'Nova Factory',
        recommendation: String(row.recommendation || ''),
        nextStage: String(row.next_stage || '').trim() || null,
        candidateQualityScorePct: toNum(row.candidate_quality_score_pct),
        supportingFeatures: parseJsonArray<string>(row.supporting_features).map((item) => String(item)),
        portfolioFit: String(output.portfolio_fit || ''),
        riskNote: String(output.risk_note || '')
      }))
      .filter((row) => row.strategyId)
      .slice(0, 3);

    if (promoted.length) return promoted;
  }

  return [];
}

function familyBias(candidate: StrategyFactoryCandidate, signal: SignalContract & Record<string, unknown>): number {
  const family = candidate.strategyFamily.toLowerCase();
  if (family.includes('momentum') || family.includes('trend')) {
    return signal.regime_id === 'TREND' ? 12 : signal.direction === 'LONG' ? 4 : 0;
  }
  if (family.includes('mean reversion')) {
    return signal.regime_id === 'RANGE' ? 12 : 0;
  }
  if (family.includes('crypto')) {
    return signal.market === 'CRYPTO' ? 10 : 0;
  }
  return 2;
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
      .filter((signal) => signal.market === args.market && signal.status === 'NEW' && !usedSymbols.has(signal.symbol))
      .sort((a, b) => b.score + familyBias(candidate, b) - (a.score + familyBias(candidate, a)))[0];
    if (!base) continue;

    usedSymbols.add(base.symbol);
    const candidateStrength = clamp(candidate.candidateQualityScorePct / 100, 0.45, 0.96);
    const confidence = round(clamp(base.confidence * 0.82 + candidateStrength * 0.18, 0.35, 0.97), 4);
    const score = round(clamp(base.score * 0.82 + candidate.candidateQualityScorePct * 0.24, 35, 98), 2);
    const signalId = `SIG-${args.market}-${base.symbol}-${candidate.strategyId}`.slice(0, 96);

    overlays.push(
      withUiFields({
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
          candidate.portfolioFit || 'Selected to complement the current runtime lineup.',
          ...base.explain_bullets.slice(0, 3)
        ],
        execution_checklist: [
          'Factory-promoted card: confirm the setup still matches the current tape before acting.',
          candidate.riskNote || 'Treat factory promotions as governed ideas, not blind automation.',
          ...base.execution_checklist.slice(0, 4)
        ],
        tags: [
          ...base.tags.filter((tag) => !String(tag).startsWith('source:')),
          'source:nova_factory',
          `factory_stage:${String(candidate.nextStage || 'shadow').toLowerCase()}`,
          `factory_quality:${Math.round(candidate.candidateQualityScorePct)}`,
          ...candidate.supportingFeatures.slice(0, 3).map((feature) => `factory_feature:${String(feature).toLowerCase().replace(/\s+/g, '_')}`)
        ]
      })
    );
  }

  return overlays;
}

function summarizeNews(repo: MarketRepository, market: Market, symbol: string): SignalNewsContext {
  const rows = repo.listNewsItems({
    market,
    symbol,
    limit: 5,
    sinceMs: Date.now() - 1000 * 60 * 60 * 48
  });
  return buildNewsContext(rows as NewsItemRecord[], symbol);
}

function adjustRuleForNews(rule: RuleHit, news: SignalNewsContext): RuleHit {
  if (!news.headline_count || news.tone === 'NONE' || news.tone === 'NEUTRAL') {
    return rule;
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
  return {
    ...rule,
    confidence: clamp(adjusted, 0.22, 0.94),
    rationale: [
      ...rule.rationale,
      news.tone === 'POSITIVE'
        ? 'Recent headline tone is supportive.'
        : news.tone === 'NEGATIVE'
          ? 'Recent headline tone is adverse.'
          : 'Recent headline flow is mixed, so conviction is trimmed.'
    ]
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
    ...cfg.markets.US.symbols.map((symbol) => ({ market: 'US' as const, symbol: symbol.toUpperCase() })),
    ...cfg.markets.CRYPTO.symbols.map((symbol) => ({ market: 'CRYPTO' as const, symbol: symbol.toUpperCase() }))
  ];

  const marketStateRows: MarketStateRecord[] = [];
  const derivedSignals: Array<SignalContract & Record<string, unknown>> = [];
  const activeSignalIds: string[] = [];
  const performanceHistoryByMarket = deriveMarketPerformanceHistory(repo, userId);
  const activePandaModelByMarket: Record<Market, ReturnType<typeof loadActivePandaModel>> = {
    US: loadActivePandaModel(repo, 'US'),
    CRYPTO: loadActivePandaModel(repo, 'CRYPTO')
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
        bar_count: 0
      });
      continue;
    }

    const timeframe = timeframeForMarket(target.market);
    const bars = parseBars(repo, asset.asset_id, timeframe, 320);
    if (bars.length < 80) {
      freshnessRows.push({
        market: target.market,
        symbol: target.symbol,
        timeframe,
        status: RUNTIME_STATUS.INSUFFICIENT_DATA,
        age_hours: null,
        bar_count: bars.length
      });
      continue;
    }

    assetsWithBars += 1;
    const ctx = statsForBars(target.market, bars);
    const latestTs = bars[bars.length - 1].ts_open;
    const ageHours = (nowMs - latestTs) / MS_HOUR;
    const staleThreshold = target.market === 'CRYPTO' ? 8 : 72;
    const freshnessStatus = ageHours > staleThreshold ? RUNTIME_STATUS.INSUFFICIENT_DATA : RUNTIME_STATUS.DB_BACKED;
    freshnessRows.push({
      market: target.market,
      symbol: target.symbol,
      timeframe,
      status: freshnessStatus,
      age_hours: round(ageHours, 2),
      bar_count: bars.length
    });

    const baselineRule = selectRule(ctx);
    const activeModel = activePandaModelByMarket[target.market];
    const pandaDecision = buildPandaAdaptiveDecision({
      market: target.market,
      bars,
      performanceHistory: performanceHistoryByMarket[target.market] || [],
      riskProfile,
      modelConfig: activeModel.config
    });
    const adaptiveTuning = buildAdaptiveTuning(pandaDecision);
    let ruleHit: RuleHit | null = baselineRule;
    if (!ruleHit) {
      ruleHit = fallbackRuleFromPanda(ctx, pandaDecision);
    } else {
      ruleHit = mergeRuleWithPanda(ruleHit, pandaDecision);
    }
    const newsContext = summarizeNews(repo, target.market, target.symbol);
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
        learning_status: pandaDecision.profile.learningStatus
      }
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
        stale_hours: round(ageHours, 2)
      }),
      updated_at_ms: nowMs
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
      strategyVersion: activeModel.semanticVersion
    });

    const sampled = parseRuleSampleFromSignal(signal, bars);
    signal.expected_metrics = {
      expected_R: sampled.sampleSize < 8 ? 0 : sampled.expectedR,
      hit_rate_est: sampled.sampleSize < 8 ? 0 : sampled.winRate,
      sample_size: sampled.sampleSize,
      expected_max_dd_est: sampled.expectedMaxDd ?? undefined
    };
    const calibration = calibrator.calibrateSignal(signal as SignalContract & Record<string, unknown>);
    signal.confidence = calibration.calibrated_confidence;
    signal.confidence_details = calibration;
    signal.position_advice.position_pct = round(
      clamp(signal.position_advice.position_pct * calibration.sizing_multiplier, 0.35, riskProfile.exposure_cap),
      2
    );
    signal.position_advice.rationale = `Position scaled by calibrated confidence (${Math.round(
      calibration.calibrated_confidence * 100
    )}%), execution reliability, and user risk profile cap.`;
    signal.lineage = buildEvidenceLineage({
      runtimeStatus: freshnessStatus,
      performanceStatus: RUNTIME_STATUS.INSUFFICIENT_DATA,
      replayEvidenceAvailable: false,
      paperEvidenceAvailable: false,
      sourceStatus: freshnessStatus,
      dataStatus: freshnessStatus
    });
    signal.news_context = newsContext;

    const statusLabel = sourceStatusForSignal(sampled.sampleSize);
    signal.tags = [
      ...signal.tags.filter((tag) => !String(tag).startsWith('status:')),
      `status:${statusLabel}`,
      `sample_size:${sampled.sampleSize}`,
      `calibration_bucket:${calibration.calibration_bucket}`,
      `news_tone:${newsContext.tone.toLowerCase()}`
    ];

    const withUi = withUiFields(signal);
    derivedSignals.push(withUi);
    activeSignalIds.push(signal.id);
  }

  const performance = buildPerformanceSnapshotsFromExecutions({
    repo,
    userId,
    nowMs
  });
  repo.upsertPerformanceSnapshots(performance.snapshots);

  const coverageSummary = buildCoverageSummary({
    assetsChecked: targets.length,
    assetsWithBars,
    generatedSignals: derivedSignals.length,
    stateRows: marketStateRows.length
  });

  const factorySignals = [
    ...buildStrategyFactorySignals({
      market: 'US',
      nowMs,
      baseSignals: derivedSignals,
      candidates: loadStrategyFactoryCandidates(repo, 'US')
    }),
    ...buildStrategyFactorySignals({
      market: 'CRYPTO',
      nowMs,
      baseSignals: derivedSignals,
      candidates: loadStrategyFactoryCandidates(repo, 'CRYPTO')
    })
  ];

  if (factorySignals.length) {
    derivedSignals.push(...factorySignals);
    activeSignalIds.push(...factorySignals.map((signal) => signal.id));
    coverageSummary.generated_signals = derivedSignals.length;
  }

  repo.upsertMarketStates(marketStateRows);
  repo.upsertSignals(derivedSignals);
  repo.expireSignalsNotIn(activeSignalIds);

  const sourceStatus = assetsWithBars > 0 ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA;

  return {
    asofMs: nowMs,
    signals: derivedSignals,
    marketState: marketStateRows,
    performanceApi: performance.apiResponse,
    performanceSnapshots: performance.snapshots,
    freshnessSummary: {
      source_status: sourceStatus,
      rows: freshnessRows,
      stale_count: freshnessRows.filter((row) => row.status !== RUNTIME_STATUS.DB_BACKED).length
    },
    coverageSummary,
    sourceStatus
  };
}

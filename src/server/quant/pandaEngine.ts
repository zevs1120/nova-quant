import type { Market, UserRiskProfileRecord } from '../types.js';

export type NumericBar = {
  ts_open: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type PandaFrame = Record<string, number[]>;
type PandaFactorFn = (frame: PandaFrame) => number[];

export const PANDA_FACTOR_NAMES = [
  'trend_strength',
  'reversal_score',
  'volume_impulse',
  'volatility_score',
  'momentum_5',
] as const;

export type PandaFactorName = (typeof PANDA_FACTOR_NAMES)[number];

export interface PandaModelRuntimeConfig {
  modelKey: string | null;
  enabledFactors: PandaFactorName[];
  topFactorCount: number;
  factorLookaheadBars: number;
  minSampleBars: number;
  longSignalThreshold: number;
  shortSignalThreshold: number;
  reversalOverrideThreshold: number;
  riskBase: number;
  positionBase: number;
  stopLossBasePct: number;
  safeMode: boolean;
  regimeBias: 'balanced' | 'trend' | 'meanreversion';
  factorWeights: Partial<Record<PandaFactorName, number>>;
  promotedAtMs: number | null;
  rollbackTargetId: string | null;
  notes: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value: number, digits = 6): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance =
    values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function rollingMean(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    const len = Math.min(period, i + 1);
    out.push(sum / Math.max(1, len));
  }
  return out;
}

function rollingStd(values: number[], period: number): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    return std(values.slice(start, i + 1));
  });
}

function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i += 1) {
    const cur = values[i] * k + prev * (1 - k);
    out.push(cur);
    prev = cur;
  }
  return out;
}

function correlation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;
  const sx = x.slice(0, n);
  const sy = y.slice(0, n);
  const mx = average(sx);
  const my = average(sy);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = sx[i] - mx;
    const dy = sy[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx <= 1e-12 || vy <= 1e-12) return 0;
  return cov / Math.sqrt(vx * vy);
}

function forwardReturns(close: number[], horizon = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < close.length; i += 1) {
    const j = i + horizon;
    if (j >= close.length) {
      out.push(0);
      continue;
    }
    const base = close[i];
    out.push(base > 0 ? close[j] / base - 1 : 0);
  }
  return out;
}

function toFrame(bars: NumericBar[]): PandaFrame {
  return {
    open: bars.map((row) => safeNumber(row.open)),
    high: bars.map((row) => safeNumber(row.high)),
    low: bars.map((row) => safeNumber(row.low)),
    close: bars.map((row) => safeNumber(row.close)),
    volume: bars.map((row) => safeNumber(row.volume)),
  };
}

function lastValue(values: number[]): number {
  if (!values.length) return 0;
  return safeNumber(values[values.length - 1]);
}

function trendStrengthFactor(frame: PandaFrame): number[] {
  const close = frame.close || [];
  const emaFast = emaSeries(close, 10);
  const emaSlow = emaSeries(close, 30);
  return close.map((price, i) => {
    const slow = Math.max(1e-9, emaSlow[i] || price || 1);
    const spread = Math.abs((emaFast[i] - emaSlow[i]) / slow);
    const anchor = Math.abs((price - emaSlow[i]) / slow);
    return clamp(spread * 18 + anchor * 8, 0, 1);
  });
}

function reversalScoreFactor(frame: PandaFrame): number[] {
  const close = frame.close || [];
  const mean20 = rollingMean(close, 20);
  const std20 = rollingStd(close, 20);
  const momentum5 = close.map((value, i) => {
    const prev = close[Math.max(0, i - 5)] || value;
    return prev > 0 ? (value - prev) / prev : 0;
  });
  return close.map((value, i) => {
    const z = (value - (mean20[i] || value)) / Math.max(std20[i] || 1e-9, 1e-9);
    const contra = momentum5[i] < 0 ? Math.abs(z) : 0;
    return clamp(contra / 2.2, 0, 1);
  });
}

function volumeImpulseFactor(frame: PandaFrame): number[] {
  const vol = frame.volume || [];
  const base = rollingMean(vol, 20);
  return vol.map((value, i) => clamp(value / Math.max(base[i] || 1, 1), 0, 4));
}

function volatilityFactor(frame: PandaFrame): number[] {
  const close = frame.close || [];
  const rets = close.map((value, i) => {
    if (i === 0) return 0;
    const prev = close[i - 1];
    return prev > 0 ? value / prev - 1 : 0;
  });
  const vol = rollingStd(rets, 20);
  return vol.map((value) => clamp(value * 20, 0, 1));
}

function momentum5Factor(frame: PandaFrame): number[] {
  const close = frame.close || [];
  return close.map((value, i) => {
    const prev = close[Math.max(0, i - 5)] || value;
    return clamp(prev > 0 ? ((value - prev) / prev) * 5 : 0, -1, 1);
  });
}

export const PANDA_FACTOR_BUILDERS: Record<PandaFactorName, PandaFactorFn> = {
  trend_strength: trendStrengthFactor,
  reversal_score: reversalScoreFactor,
  volume_impulse: volumeImpulseFactor,
  volatility_score: volatilityFactor,
  momentum_5: momentum5Factor,
};

export function resolvePandaModelConfig(
  config?: Partial<PandaModelRuntimeConfig> | null,
): PandaModelRuntimeConfig {
  const enabledFactorsRaw = Array.isArray(config?.enabledFactors)
    ? config!.enabledFactors.filter((item): item is PandaFactorName =>
        PANDA_FACTOR_NAMES.includes(item as PandaFactorName),
      )
    : [...PANDA_FACTOR_NAMES];
  const enabledFactors = enabledFactorsRaw.length ? enabledFactorsRaw : [...PANDA_FACTOR_NAMES];

  return {
    modelKey: typeof config?.modelKey === 'string' ? config.modelKey : null,
    enabledFactors,
    topFactorCount: Math.max(
      1,
      Math.min(enabledFactors.length, Math.round(safeNumber(config?.topFactorCount, 4))),
    ),
    factorLookaheadBars: Math.max(
      1,
      Math.min(8, Math.round(safeNumber(config?.factorLookaheadBars, 1))),
    ),
    minSampleBars: Math.max(40, Math.round(safeNumber(config?.minSampleBars, 40))),
    longSignalThreshold: clamp(safeNumber(config?.longSignalThreshold, 0.82), 0.45, 1.8),
    shortSignalThreshold: clamp(safeNumber(config?.shortSignalThreshold, 0.78), 0.45, 1.8),
    reversalOverrideThreshold: clamp(safeNumber(config?.reversalOverrideThreshold, 0.82), 0.5, 1),
    riskBase: clamp(safeNumber(config?.riskBase, 0.02), 0.005, 0.03),
    positionBase: clamp(safeNumber(config?.positionBase, 0.3), 0.1, 0.35),
    stopLossBasePct: clamp(safeNumber(config?.stopLossBasePct, 0.05), 0.01, 0.12),
    safeMode: Boolean(config?.safeMode),
    regimeBias:
      config?.regimeBias === 'trend' || config?.regimeBias === 'meanreversion'
        ? config.regimeBias
        : 'balanced',
    factorWeights: { ...(config?.factorWeights || {}) },
    promotedAtMs: config?.promotedAtMs ?? null,
    rollbackTargetId: typeof config?.rollbackTargetId === 'string' ? config.rollbackTargetId : null,
    notes: typeof config?.notes === 'string' ? config.notes : null,
  };
}

function normalizeVolumeImpulse(value: number): number {
  return clamp((safeNumber(value) - 1) / 1.6, 0, 1);
}

function normalizeMomentum(value: number): { positive: number; negative: number } {
  return {
    positive: clamp(safeNumber(value), 0, 1),
    negative: clamp(-safeNumber(value), 0, 1),
  };
}

function resolveFactorWeights(
  config: PandaModelRuntimeConfig,
  topFactors: string[] = [],
): Record<PandaFactorName, number> {
  const base: Record<PandaFactorName, number> = {
    trend_strength: 1,
    reversal_score: 1,
    volume_impulse: 0.6,
    volatility_score: 0.45,
    momentum_5: 0.8,
  };

  if (config.regimeBias === 'trend') {
    base.trend_strength *= 1.18;
    base.momentum_5 *= 1.12;
    base.reversal_score *= 0.82;
  } else if (config.regimeBias === 'meanreversion') {
    base.reversal_score *= 1.24;
    base.volatility_score *= 0.92;
    base.trend_strength *= 0.8;
  }

  for (const factorName of PANDA_FACTOR_NAMES) {
    if (!config.enabledFactors.includes(factorName)) {
      base[factorName] = 0;
      continue;
    }
    const override = config.factorWeights[factorName];
    if (Number.isFinite(override)) {
      base[factorName] *= clamp(Number(override), 0, 4);
    }
    if (topFactors.includes(factorName)) {
      base[factorName] *= 1.05;
    }
  }
  return base;
}

export function buildPandaFactorFrame(
  bars: NumericBar[],
  factorNames: PandaFactorName[] = [...PANDA_FACTOR_NAMES],
): PandaFrame {
  const frame = toFrame(bars);
  for (const factorName of factorNames) {
    frame[factorName] = PANDA_FACTOR_BUILDERS[factorName](frame);
  }
  return frame;
}

export function rankPandaFactors(args: {
  frame: PandaFrame;
  factorNames: PandaFactorName[];
  lookaheadBars: number;
  topFactorCount: number;
}): { factorScores: Record<string, number>; topFactors: string[] } {
  const returns = forwardReturns(args.frame.close || [], args.lookaheadBars);
  const scored = Object.fromEntries(
    args.factorNames.map((name) => [name, Math.abs(correlation(args.frame[name] || [], returns))]),
  ) as Record<string, number>;
  const topFactors = Object.entries(scored)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, args.topFactorCount))
    .map(([name]) => name);
  return {
    factorScores: scored,
    topFactors,
  };
}

function computeSignalBreakdown(args: {
  frame: PandaFrame;
  config: PandaModelRuntimeConfig;
  topFactors?: string[];
}): {
  signal: number;
  confidence: number;
  longScore: number;
  shortScore: number;
  trendLatest: number;
  reversalLatest: number;
  volatilityLatest: number;
} {
  const trendLatest = lastValue(args.frame.trend_strength || []);
  const reversalLatest = lastValue(args.frame.reversal_score || []);
  const volumeLatest = normalizeVolumeImpulse(lastValue(args.frame.volume_impulse || []));
  const volatilityLatest = lastValue(args.frame.volatility_score || []);
  const momentum = normalizeMomentum(lastValue(args.frame.momentum_5 || []));
  const weights = resolveFactorWeights(args.config, args.topFactors || []);

  const longScore =
    weights.trend_strength * trendLatest +
    weights.momentum_5 * momentum.positive +
    weights.volume_impulse * volumeLatest -
    weights.volatility_score * volatilityLatest * 0.35;
  const shortScore =
    weights.reversal_score * reversalLatest +
    weights.momentum_5 * momentum.negative +
    weights.volatility_score * volatilityLatest * 0.25;

  let signal = 0;
  if (!args.config.safeMode) {
    if (shortScore >= args.config.shortSignalThreshold && shortScore >= longScore + 0.04) {
      signal = -1;
    } else if (
      reversalLatest >= args.config.reversalOverrideThreshold &&
      shortScore >= args.config.shortSignalThreshold - 0.05
    ) {
      signal = -1;
    } else if (longScore >= args.config.longSignalThreshold && longScore >= shortScore + 0.04) {
      signal = 1;
    }
  }

  const scoreAnchor =
    signal > 0 ? longScore : signal < 0 ? shortScore : Math.max(longScore, shortScore);
  const scoreGap = Math.abs(longScore - shortScore);
  const confidence =
    signal === 0
      ? clamp(0.18 + scoreAnchor * 0.18, 0, 0.58)
      : clamp(0.42 + scoreAnchor * 0.24 + scoreGap * 0.14, 0, 1);

  return {
    signal,
    confidence: round(confidence, 4),
    longScore: round(longScore, 6),
    shortScore: round(shortScore, 6),
    trendLatest: round(trendLatest, 6),
    reversalLatest: round(reversalLatest, 6),
    volatilityLatest: round(volatilityLatest, 6),
  };
}

export class PandaStrategyBase {
  factors: Record<string, PandaFactorFn>;
  signals: Record<string, unknown>;
  params: Record<string, unknown>;

  constructor(config?: Partial<PandaModelRuntimeConfig>) {
    this.factors = {};
    this.signals = {};
    this.params = { config: resolvePandaModelConfig(config) };
  }

  add_factor(name: string, func: PandaFactorFn) {
    this.factors[name] = func;
  }

  calculate_all_factors(frame: PandaFrame): PandaFrame {
    const out: PandaFrame = { ...frame };
    for (const [name, func] of Object.entries(this.factors)) {
      out[name] = func(out);
    }
    return out;
  }

  generate_signal(frame: PandaFrame): number {
    const config = resolvePandaModelConfig(this.params.config as Partial<PandaModelRuntimeConfig>);
    return computeSignalBreakdown({ frame, config }).signal;
  }

  decision(frame: PandaFrame): { signal: number; frame: PandaFrame } {
    const computed = this.calculate_all_factors(frame);
    const signal = this.generate_signal(computed);
    return { signal, frame: computed };
  }
}

export class RiskBucket {
  max_total_risk: number;
  max_position_ratio: number;
  max_drawdown: number;
  stop_loss_pct: number;
  equity_list: number[];
  current_drawdown: number;

  constructor(
    max_total_risk = 0.02,
    max_position_ratio = 0.3,
    max_drawdown = 0.15,
    stop_loss_pct = 0.05,
  ) {
    this.max_total_risk = max_total_risk;
    this.max_position_ratio = max_position_ratio;
    this.max_drawdown = max_drawdown;
    this.stop_loss_pct = stop_loss_pct;
    this.equity_list = [];
    this.current_drawdown = 0;
  }

  update_equity(equity: number) {
    this.equity_list.push(Math.max(1e-9, safeNumber(equity, 1)));
    this.current_drawdown = this._calc_drawdown();
  }

  _calc_drawdown(): number {
    if (!this.equity_list.length) return 0;
    const peak = Math.max(...this.equity_list);
    const latest = this.equity_list[this.equity_list.length - 1];
    return peak > 0 ? (peak - latest) / peak : 0;
  }

  is_trade_allowed(_signal: number, capital: number, position_value: number): [boolean, string] {
    if (this.current_drawdown >= this.max_drawdown) return [false, 'drawdown_limit'];
    if (capital > 0 && position_value / capital >= this.max_position_ratio)
      return [false, 'position_limit'];
    return [true, 'ok'];
  }

  calc_position_size(capital: number, price: number, volatility = 0.02): number {
    const stopPct = Math.max(this.stop_loss_pct, Math.min(0.12, volatility * 1.8));
    const risk_per_share = Math.max(1e-9, price * stopPct);
    let position_size = (capital * this.max_total_risk) / risk_per_share;
    position_size = Math.min(
      position_size,
      (capital * this.max_position_ratio) / Math.max(price, 1e-9),
    );
    return Math.max(0, Math.floor(position_size));
  }
}

export class PandaAutoLearner {
  factor_scores: Record<string, number>;
  best_params: Record<string, unknown>;

  constructor() {
    this.factor_scores = {};
    this.best_params = {};
  }

  score_factor(factor_series: number[], returns: number[]): number {
    return Math.abs(correlation(factor_series, returns));
  }

  select_top_factors(
    factor_dict: Record<string, number[]>,
    returns: number[],
    top_n = 5,
  ): string[] {
    const scored = Object.fromEntries(
      Object.entries(factor_dict).map(([name, values]) => [
        name,
        this.score_factor(values, returns),
      ]),
    ) as Record<string, number>;
    this.factor_scores = scored;
    return Object.entries(scored)
      .sort((a, b) => b[1] - a[1])
      .slice(0, top_n)
      .map(([name]) => name);
  }

  adaptive_param(
    performance_history: number[],
    config: PandaModelRuntimeConfig,
  ): { risk: number; position: number } {
    if (!performance_history.length) {
      return { risk: config.riskBase, position: config.positionBase };
    }
    const trailing = performance_history.slice(-12);
    const latest = trailing[trailing.length - 1];
    const avg = average(trailing);
    if (latest < 0 || avg < 0) {
      return {
        risk: clamp(config.riskBase * 0.65, 0.005, 0.03),
        position: clamp(config.positionBase * 0.72, 0.1, 0.35),
      };
    }
    if (avg > 0.01) {
      return {
        risk: clamp(config.riskBase * 1.08, 0.005, 0.03),
        position: clamp(config.positionBase * 1.05, 0.1, 0.35),
      };
    }
    return { risk: config.riskBase, position: config.positionBase };
  }
}

export type PandaAdaptiveDecision = {
  signal: number;
  confidence: number;
  topFactors: string[];
  factorScores: Record<string, number>;
  adaptiveParams: { risk: number; position: number };
  risk: {
    allowed: boolean;
    reason: string;
    suggestedShares: number;
    suggestedPositionPct: number;
    currentDrawdown: number;
  };
  profile: {
    market: Market;
    sampleSize: number;
    learningStatus: 'READY' | 'INSUFFICIENT_DATA';
  };
};

export function buildPandaAdaptiveDecision(args: {
  market: Market;
  bars: NumericBar[];
  performanceHistory: number[];
  riskProfile: UserRiskProfileRecord;
  capital?: number;
  modelConfig?: Partial<PandaModelRuntimeConfig> | null;
}): PandaAdaptiveDecision {
  const config = resolvePandaModelConfig(args.modelConfig);
  const capital = Math.max(10_000, safeNumber(args.capital, 100_000));
  const sampleSize = args.bars.length;
  if (sampleSize < config.minSampleBars) {
    return {
      signal: 0,
      confidence: 0,
      topFactors: [],
      factorScores: {},
      adaptiveParams: { risk: config.riskBase, position: config.positionBase },
      risk: {
        allowed: false,
        reason: 'insufficient_data',
        suggestedShares: 0,
        suggestedPositionPct: 0,
        currentDrawdown: 0,
      },
      profile: {
        market: args.market,
        sampleSize,
        learningStatus: 'INSUFFICIENT_DATA',
      },
    };
  }

  const frame = buildPandaFactorFrame(args.bars, config.enabledFactors);
  const learner = new PandaAutoLearner();
  const fwdReturns = forwardReturns(frame.close || [], config.factorLookaheadBars);
  const factorDict = Object.fromEntries(
    config.enabledFactors.map((name) => [name, frame[name] || []]),
  ) as Record<string, number[]>;
  const topFactors = learner.select_top_factors(factorDict, fwdReturns, config.topFactorCount);
  const adaptiveParams = learner.adaptive_param(args.performanceHistory || [], config);
  const decision = computeSignalBreakdown({
    frame,
    config,
    topFactors,
  });

  const volatility = safeNumber(lastValue(frame.volatility_score || []), 0.02);
  const latestPrice = Math.max(1e-6, lastValue(frame.close || []));

  const riskBucket = new RiskBucket(
    clamp(adaptiveParams.risk, 0.005, 0.03),
    clamp(adaptiveParams.position, 0.1, 0.35),
    clamp(args.riskProfile.max_drawdown / 100, 0.05, 0.35),
    clamp(config.stopLossBasePct + volatility * 0.55, 0.01, 0.12),
  );

  let equity = 1;
  for (const pnl of args.performanceHistory || []) {
    equity *= 1 + safeNumber(pnl, 0);
    riskBucket.update_equity(equity);
  }

  const suggestedShares = riskBucket.calc_position_size(capital, latestPrice, volatility);
  const suggestedPositionPct =
    clamp((suggestedShares * latestPrice) / capital, 0, riskBucket.max_position_ratio) * 100;
  let [allowed, reason] = riskBucket.is_trade_allowed(
    decision.signal,
    capital,
    (suggestedPositionPct / 100) * capital * 0.98,
  );
  if (config.safeMode) {
    allowed = false;
    reason = 'safe_mode';
  }

  return {
    signal: config.safeMode ? 0 : decision.signal,
    confidence: config.safeMode ? 0 : decision.confidence,
    topFactors,
    factorScores: learner.factor_scores,
    adaptiveParams,
    risk: {
      allowed,
      reason,
      suggestedShares,
      suggestedPositionPct: round(suggestedPositionPct, 4),
      currentDrawdown: round(riskBucket.current_drawdown, 6),
    },
    profile: {
      market: args.market,
      sampleSize,
      learningStatus: 'READY',
    },
  };
}

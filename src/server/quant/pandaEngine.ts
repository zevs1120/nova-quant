import type { Market, UserRiskProfileRecord } from '../types.js';

type NumericBar = {
  ts_open: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type PandaFrame = Record<string, number[]>;

type PandaFactorFn = (frame: PandaFrame) => number[];

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
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
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
    volume: bars.map((row) => safeNumber(row.volume))
  };
}

function lastValue(values: number[]): number {
  if (!values.length) return 0;
  return safeNumber(values[values.length - 1]);
}

export class PandaStrategyBase {
  factors: Record<string, PandaFactorFn>;
  signals: Record<string, unknown>;
  params: Record<string, unknown>;

  constructor() {
    this.factors = {};
    this.signals = {};
    this.params = {};
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
    const trend = lastValue(frame.trend_strength || []);
    const reversal = lastValue(frame.reversal_score || []);
    let signal = 0;
    if (trend > 0.6) signal = 1;
    if (reversal > 0.8) signal = -1;
    return signal;
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
    stop_loss_pct = 0.05
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
    if (capital > 0 && position_value / capital >= this.max_position_ratio) return [false, 'position_limit'];
    return [true, 'ok'];
  }

  calc_position_size(capital: number, price: number, volatility = 0.02): number {
    const stopPct = Math.max(this.stop_loss_pct, Math.min(0.12, volatility * 1.8));
    const risk_per_share = Math.max(1e-9, price * stopPct);
    let position_size = (capital * this.max_total_risk) / risk_per_share;
    position_size = Math.min(position_size, (capital * this.max_position_ratio) / Math.max(price, 1e-9));
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
    const ic = correlation(factor_series, returns);
    return Math.abs(ic);
  }

  select_top_factors(factor_dict: Record<string, number[]>, returns: number[], top_n = 5): string[] {
    const scored = Object.fromEntries(
      Object.entries(factor_dict).map(([name, values]) => [name, this.score_factor(values, returns)])
    ) as Record<string, number>;
    this.factor_scores = scored;
    return Object.entries(scored)
      .sort((a, b) => b[1] - a[1])
      .slice(0, top_n)
      .map(([name]) => name);
  }

  adaptive_param(performance_history: number[]): { risk: number; position: number } {
    if (!performance_history.length) {
      return { risk: 0.02, position: 0.3 };
    }
    const latest = performance_history[performance_history.length - 1];
    if (latest < 0) return { risk: 0.01, position: 0.2 };
    return { risk: 0.02, position: 0.3 };
  }
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
}): PandaAdaptiveDecision {
  const capital = Math.max(10_000, safeNumber(args.capital, 100_000));
  const sampleSize = args.bars.length;
  if (sampleSize < 40) {
    return {
      signal: 0,
      confidence: 0,
      topFactors: [],
      factorScores: {},
      adaptiveParams: { risk: 0.02, position: 0.3 },
      risk: {
        allowed: false,
        reason: 'insufficient_data',
        suggestedShares: 0,
        suggestedPositionPct: 0,
        currentDrawdown: 0
      },
      profile: {
        market: args.market,
        sampleSize,
        learningStatus: 'INSUFFICIENT_DATA'
      }
    };
  }

  const frame = toFrame(args.bars);
  const strategy = new PandaStrategyBase();
  strategy.add_factor('trend_strength', trendStrengthFactor);
  strategy.add_factor('reversal_score', reversalScoreFactor);
  strategy.add_factor('volume_impulse', volumeImpulseFactor);
  strategy.add_factor('volatility_score', volatilityFactor);
  strategy.add_factor('momentum_5', (nextFrame) => {
    const close = nextFrame.close || [];
    return close.map((value, i) => {
      const prev = close[Math.max(0, i - 5)] || value;
      return clamp(prev > 0 ? ((value - prev) / prev) * 5 : 0, -1, 1);
    });
  });

  const decision = strategy.decision(frame);
  const learner = new PandaAutoLearner();
  const fwdReturns = forwardReturns(decision.frame.close || [], 1);
  const factorDict = Object.fromEntries(
    Object.keys(strategy.factors).map((name) => [name, decision.frame[name] || []])
  ) as Record<string, number[]>;
  const topFactors = learner.select_top_factors(factorDict, fwdReturns, 4);
  const adaptiveParams = learner.adaptive_param(args.performanceHistory || []);

  const volatility = safeNumber(lastValue(decision.frame.volatility_score || []), 0.02);
  const latestPrice = Math.max(1e-6, lastValue(decision.frame.close || []));

  const riskBucket = new RiskBucket(
    clamp(adaptiveParams.risk, 0.005, 0.03),
    clamp(adaptiveParams.position, 0.1, 0.35),
    clamp(args.riskProfile.max_drawdown / 100, 0.05, 0.35),
    clamp(0.035 + volatility * 0.6, 0.01, 0.12)
  );

  let equity = 1;
  for (const pnl of args.performanceHistory || []) {
    equity *= 1 + safeNumber(pnl, 0);
    riskBucket.update_equity(equity);
  }

  const suggestedShares = riskBucket.calc_position_size(capital, latestPrice, volatility);
  const suggestedPositionPct = clamp((suggestedShares * latestPrice) / capital, 0, riskBucket.max_position_ratio) * 100;
  const [allowed, reason] = riskBucket.is_trade_allowed(
    decision.signal,
    capital,
    suggestedPositionPct / 100 * capital * 0.98
  );

  const trendLatest = lastValue(decision.frame.trend_strength || []);
  const reversalLatest = lastValue(decision.frame.reversal_score || []);
  const confidence =
    decision.signal > 0
      ? clamp(0.45 + trendLatest * 0.45, 0, 1)
      : decision.signal < 0
        ? clamp(0.45 + reversalLatest * 0.45, 0, 1)
        : clamp(Math.max(trendLatest, reversalLatest) * 0.6, 0, 1);

  return {
    signal: decision.signal,
    confidence: round(confidence, 4),
    topFactors,
    factorScores: learner.factor_scores,
    adaptiveParams,
    risk: {
      allowed,
      reason,
      suggestedShares,
      suggestedPositionPct: round(suggestedPositionPct, 4),
      currentDrawdown: round(riskBucket.current_drawdown, 6)
    },
    profile: {
      market: args.market,
      sampleSize,
      learningStatus: 'READY'
    }
  };
}

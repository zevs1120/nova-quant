import { randomUUID } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import type { Market, RiskProfileKey, Timeframe } from '../types.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';
import { clamp, maxDrawdownFromCurve, mean, round, stdDev } from '../../engines/math.js';
import {
  adjustPriceForExecution,
  applyScenarioToAssumption,
  buildExecutionSensitivityScenarios,
  resolveExecutionAssumptions,
  resolveExecutionRealismProfile,
} from '../../research/validation/executionRealismModel.js';

export interface NumericBar {
  ts_open: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string;
}

type MarketScope = Market | 'ALL';
type StrategyStyle = 'trend_breakout' | 'trend_pullback' | 'mean_reversion';
type MarketRegime = 'trend' | 'range' | 'risk_off';

type StrategyGoalSet = {
  sharpe_min: number;
  max_drawdown_max: number;
  annual_return_min: number;
};

type StrategyConfig = {
  config_id: string;
  market: Market;
  style: StrategyStyle;
  style_family: string;
  execution_timeframe: '1d' | '4h';
  breakout_lookback: number;
  ema_fast: number;
  ema_slow: number;
  atr_period: number;
  volume_lookback: number;
  rotation_lookback: number;
  rotation_gate_min: number;
  rotation_gate_max: number;
  pullback_atr_multiple: number;
  reversion_zscore: number;
  min_atr_pct: number;
  max_atr_pct: number;
  volume_ratio_min: number;
  max_extension_pct: number;
  stop_atr: number;
  trail_atr: number;
  profit_lock_trigger_r: number;
  profit_lock_trail_atr: number;
  max_hold_bars: number;
  cooldown_bars: number;
  risk_per_trade_pct: number;
  max_position_pct: number;
  min_position_pct: number;
  max_participation_rate: number;
  min_dollar_volume: number;
  tightness_score: number;
};

type SymbolLineage = {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  execution_timeframe: '1d' | '4h';
  source: string;
  bar_count: number;
  first_ts_open: number | null;
  last_ts_open: number | null;
};

type TradeRecord = {
  trade_id: string;
  symbol: string;
  market: Market;
  strategy_style: StrategyStyle;
  config_id: string;
  signal_ts: number;
  entry_ts: number;
  exit_ts: number;
  entry_price: number;
  exit_price: number;
  stop_price_initial: number;
  stop_price_exit: number;
  weight: number;
  holding_bars: number;
  raw_return: number;
  net_return: number;
  exit_reason: string;
  assumption_profile_id: string;
  assumption_mode: string;
  volatility_bucket: string;
  liquidity_bucket: string;
  partial_fill_probability: number;
  fees_and_funding_drag: number;
};

type BarReturnRow = {
  ts_open: number;
  date: string;
  return_pct: number;
  gross_exposure: number;
};

type BacktestMetrics = {
  sample_size: number;
  cumulative_return: number;
  annual_return: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  win_rate: number;
  volatility: number;
  profit_factor: number;
};

type DailyReturnRow = {
  date: string;
  return_pct: number;
};

type MarketBacktestResult = {
  market: Market;
  timeframe: '1d' | '4h';
  strategy_styles: StrategyStyle[];
  bars_per_year: number;
  config: StrategyConfig;
  metrics: BacktestMetrics;
  trades: TradeRecord[];
  bar_returns: BarReturnRow[];
  daily_returns: DailyReturnRow[];
  data_lineage: SymbolLineage[];
  realism_profile: Record<string, unknown>;
  diagnostics: {
    future_leak_violations: number;
    average_holding_bars: number;
    average_trade_weight: number;
    trade_count: number;
    turnover_proxy: number;
  };
};

type MarketPlanPoint = {
  ts_open: number;
  regime: MarketRegime;
  gross_target: number;
  style_weights: Record<StrategyStyle, number>;
};

type GridResult = {
  config: StrategyConfig;
  metrics: BacktestMetrics;
  trade_count: number;
  average_holding_bars: number;
  target_violations: number;
  selection_score: number;
};

type BundleEvaluationResult = {
  bundle_id: string;
  styles: StrategyStyle[];
  member_config_ids: string[];
  primary_config: StrategyConfig;
  backtest: MarketBacktestResult;
  target_violations: number;
  selection_score: number;
};

type ValidationSplitSummary = {
  train_start: number | null;
  train_end: number | null;
  test_start: number | null;
  test_end: number | null;
  selected_config_id: string;
  train_metrics: BacktestMetrics;
  test_metrics: BacktestMetrics;
  target_violations_test: number;
};

type WalkForwardWindowSummary = {
  window_id: string;
  train_start: number | null;
  train_end: number | null;
  test_start: number | null;
  test_end: number | null;
  selected_config_id: string;
  train_metrics: BacktestMetrics;
  test_metrics: BacktestMetrics;
};

type MonteCarloSummary = {
  simulations: number;
  median_annual_return: number;
  p10_annual_return: number;
  p50_sharpe: number;
  p10_sharpe: number;
  p90_max_drawdown: number;
  target_pass_rate: number;
};

type ParameterIntervalSummary = {
  parameter: string;
  min: number;
  max: number;
  values: number[];
  supporting_config_ids: string[];
};

type ParameterHeatmapCell = {
  config_id: string;
  style: StrategyStyle;
  x_value: number;
  y_value: number;
  annual_return: number;
  sharpe: number;
  max_drawdown: number;
  trade_count: number;
  stable: boolean;
};

type ParameterHeatmapSummary = {
  x_axis: string;
  y_axis: string;
  stable_cell_count: number;
  total_cells: number;
  stable_zone: {
    x_min: number | null;
    x_max: number | null;
    y_min: number | null;
    y_max: number | null;
  };
  cells: ParameterHeatmapCell[];
};

type CrossAssetValidationRow = {
  symbol: string;
  metrics: BacktestMetrics;
  trade_count: number;
  passed: boolean;
};

type RegimeValidationRow = {
  regime: MarketRegime;
  metrics: BacktestMetrics;
  trade_count: number;
  trade_share: number;
  positive_pnl_share: number;
};

type SplitAuditSummary = {
  common_bars: number;
  warmup_bars: number;
  train_bars: number;
  test_bars: number;
  train_ratio: number;
  test_ratio: number;
  warmup_ratio: number;
  reasonable: boolean;
  note: string;
};

type OverfitAuditSummary = {
  risk_flags: string[];
  likely_hotspots: string[];
  declared_parameter_count: number;
  effective_parameter_count: number;
  parameter_budget_ok: boolean;
  robust_parameter_intervals: ParameterIntervalSummary[];
  parameter_heatmap: ParameterHeatmapSummary;
  split_audit: SplitAuditSummary | null;
  rolling_oos_pass_rate: number;
  perturbation_pass_rate: number;
  cross_asset_validation: CrossAssetValidationRow[];
  time_migration_validation: RegimeValidationRow[];
  regime_dependency: {
    dominant_regime: MarketRegime | null;
    positive_pnl_share: number;
    overdependent: boolean;
  };
  anomaly_check: {
    suspicious: boolean;
    equity_smoothness: number;
    explanation: string;
  };
};

type MarketStrategyPack = {
  market: Market;
  strategy_id: string;
  strategy_family: string;
  timeframe: '1d' | '4h';
  selected_config: StrategyConfig;
  selected_bundle: {
    bundle_id: string;
    styles: StrategyStyle[];
    member_config_ids: string[];
  };
  grid_results: GridResult[];
  bundle_results: Array<{
    bundle_id: string;
    styles: StrategyStyle[];
    metrics: BacktestMetrics;
    trade_count: number;
    target_violations: number;
    selection_score: number;
  }>;
  stability_summary: {
    configs_tested: number;
    configs_meeting_targets: number;
    median_sharpe: number;
    median_annual_return: number;
    median_max_drawdown: number;
    fragile: boolean;
  };
  split_validation: ValidationSplitSummary | null;
  walk_forward: {
    windows: WalkForwardWindowSummary[];
    out_of_sample_summary: BacktestMetrics | null;
  };
  monte_carlo: MonteCarloSummary;
  scenario_sensitivity: Array<{
    scenario_id: string;
    label: string;
    metrics: BacktestMetrics;
  }>;
  overfit_audit: OverfitAuditSummary;
  backtest: MarketBacktestResult;
};

export interface ProductionStrategyPackArgs {
  repo: MarketRepository;
  userId?: string | null;
  locale?: string | null;
  market?: MarketScope | null;
  symbols?: string[] | null;
  start?: string | null;
  end?: string | null;
  riskProfile?: RiskProfileKey | string | null;
  symbolBarsByMarket?: Partial<Record<Market, Record<string, NumericBar[]>>>;
}

export interface ProductionStrategyPack {
  generated_at: string;
  workflow_id: string;
  trace_id: string;
  market_scope: MarketScope;
  risk_profile: RiskProfileKey;
  target_metrics: StrategyGoalSet;
  markets: MarketStrategyPack[];
  combined_portfolio: {
    capital_split: Record<string, number>;
    metrics: BacktestMetrics | null;
    daily_returns: DailyReturnRow[];
  };
  sections: Record<string, { title: string; bullets: string[] }>;
  markdown_report: string;
  deployment: {
    api_route: string;
    aws_command: string;
    vercel_note: string;
    supabase_note: string;
  };
}

const TARGET_METRICS: StrategyGoalSet = Object.freeze({
  sharpe_min: 1.2,
  max_drawdown_max: 0.1,
  annual_return_min: 0.15,
});

const DEFAULT_SYMBOLS: Record<Market, string[]> = {
  US: ['SPY', 'QQQ', 'IWM', 'XLK', 'XLF', 'XLE', 'AAPL', 'MSFT'],
  CRYPTO: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
};

const BARS_PER_YEAR: Record<'1d' | '4h', number> = {
  '1d': 252,
  '4h': 2190,
};

const RISK_PROFILE_MULTIPLIER: Record<RiskProfileKey, number> = {
  conservative: 0.82,
  balanced: 1,
  aggressive: 1.08,
};

const DECLARED_PARAMETER_FIELDS = [
  'breakout_lookback',
  'ema_fast',
  'ema_slow',
  'atr_period',
  'volume_lookback',
  'rotation_lookback',
  'rotation_gate_min',
  'pullback_atr_multiple',
  'reversion_zscore',
  'min_atr_pct',
  'max_atr_pct',
  'volume_ratio_min',
  'max_extension_pct',
  'stop_atr',
  'trail_atr',
  'profit_lock_trigger_r',
  'profit_lock_trail_atr',
  'max_hold_bars',
  'cooldown_bars',
  'risk_per_trade_pct',
  'max_position_pct',
] as const satisfies ReadonlyArray<keyof StrategyConfig>;

const CORE_ROBUST_PARAMETER_FIELDS = [
  'breakout_lookback',
  'ema_fast',
  'ema_slow',
  'stop_atr',
  'trail_atr',
  'max_hold_bars',
] as const satisfies ReadonlyArray<keyof StrategyConfig>;

function safeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toDateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function normalizeRiskProfile(value: string | null | undefined): RiskProfileKey {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'conservative' || raw === 'aggressive') return raw;
  return 'balanced';
}

function annualizedReturn(cumulativeReturn: number, periods: number, barsPerYear: number): number {
  if (periods <= 0) return 0;
  const equity = Math.max(1e-9, 1 + cumulativeReturn);
  return Math.pow(equity, barsPerYear / periods) - 1;
}

function downsideDeviation(values: number[]): number {
  const negatives = values.filter((value) => value < 0);
  if (!negatives.length) return 0;
  const squared = negatives.map((value) => value ** 2);
  return Math.sqrt(mean(squared));
}

function computeMetrics(returns: number[], barsPerYear: number): BacktestMetrics {
  if (!returns.length) {
    return {
      sample_size: 0,
      cumulative_return: 0,
      annual_return: 0,
      sharpe: 0,
      sortino: 0,
      max_drawdown: 0,
      win_rate: 0,
      volatility: 0,
      profit_factor: 0,
    };
  }

  let equity = 1;
  const curve = returns.map((value) => {
    equity *= 1 + value;
    return equity;
  });
  const cumulative = curve[curve.length - 1] - 1;
  const sigma = stdDev(returns);
  const negSigma = downsideDeviation(returns);
  const gains = returns.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const losses = Math.abs(
    returns.filter((value) => value < 0).reduce((sum, value) => sum + value, 0),
  );

  return {
    sample_size: returns.length,
    cumulative_return: round(cumulative, 6),
    annual_return: round(annualizedReturn(cumulative, returns.length, barsPerYear), 6),
    sharpe: round((mean(returns) / Math.max(sigma, 1e-9)) * Math.sqrt(barsPerYear), 4),
    sortino: round((mean(returns) / Math.max(negSigma, 1e-9)) * Math.sqrt(barsPerYear), 4),
    max_drawdown: round(maxDrawdownFromCurve(curve), 6),
    win_rate: round(returns.filter((value) => value > 0).length / returns.length, 4),
    volatility: round(sigma * Math.sqrt(barsPerYear), 6),
    profit_factor: round(losses > 0 ? gains / losses : gains > 0 ? 9.99 : 0, 4),
  };
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function makeSeededRandom(seed = 7): () => number {
  let state = Math.max(1, Math.floor(seed));
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rollingMeanSeries(values: number[], lookback: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= lookback) sum -= values[i - lookback];
    out.push(sum / Math.min(lookback, i + 1));
  }
  return out;
}

function rollingMaxPrevious(values: number[], lookback: number): number[] {
  return values.map((_, index) => {
    const end = index;
    const start = Math.max(0, end - lookback);
    if (start >= end) return Number.NaN;
    let maxValue = -Infinity;
    for (let i = start; i < end; i += 1) {
      maxValue = Math.max(maxValue, values[i]);
    }
    return maxValue;
  });
}

function atrSeries(bars: NumericBar[], period: number): number[] {
  const trueRanges = bars.map((bar, index) => {
    if (index === 0) return Math.max(0, bar.high - bar.low);
    const prevClose = bars[index - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose),
    );
  });
  return rollingMeanSeries(trueRanges, period);
}

function percentileRankAt(values: number[], index: number, lookback: number): number {
  const start = Math.max(0, index - lookback + 1);
  const sample = values.slice(start, index + 1).filter((value) => Number.isFinite(value));
  if (!sample.length) return 50;
  const value = values[index];
  const count = sample.filter((item) => item <= value).length;
  return round((count / sample.length) * 100, 2);
}

function rollingStdSeries(values: number[], lookback: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - lookback + 1);
    const sample = values.slice(start, index + 1).filter((value) => Number.isFinite(value));
    return sample.length >= 2 ? stdDev(sample) : 0;
  });
}

function returnsSeries(values: number[]): number[] {
  return values.map((value, index) =>
    index === 0 ? 0 : value / Math.max(values[index - 1], 1e-9) - 1,
  );
}

function configWarmup(config: StrategyConfig): number {
  return Math.max(
    config.ema_slow + 3,
    config.breakout_lookback + 3,
    config.atr_period + 3,
    config.volume_lookback + 3,
    config.rotation_lookback + 3,
  );
}

function buildRotationScores(
  symbolBars: Record<string, NumericBar[]>,
  lookback: number,
): Map<string, Map<number, number>> {
  const scoreMap = new Map<number, Array<{ symbol: string; score: number }>>();
  for (const [symbol, bars] of Object.entries(symbolBars)) {
    const closes = bars.map((bar) => bar.close);
    const returns = returnsSeries(closes);
    const realizedVol = rollingStdSeries(returns, Math.max(5, Math.floor(lookback / 2)));
    for (let index = lookback; index < bars.length; index += 1) {
      const momentum = closes[index] / Math.max(closes[index - lookback], 1e-9) - 1;
      const score = momentum / Math.max(realizedVol[index], 1e-4);
      const rows = scoreMap.get(bars[index].ts_open) || [];
      rows.push({ symbol, score });
      scoreMap.set(bars[index].ts_open, rows);
    }
  }

  const bySymbol = new Map<string, Map<number, number>>();
  for (const [tsOpen, rows] of scoreMap.entries()) {
    const sorted = [...rows].sort((a, b) => a.score - b.score);
    sorted.forEach((row, index) => {
      const rank = sorted.length <= 1 ? 0.5 : index / (sorted.length - 1);
      const perSymbol = bySymbol.get(row.symbol) || new Map<number, number>();
      perSymbol.set(tsOpen, round(rank, 6));
      bySymbol.set(row.symbol, perSymbol);
    });
  }
  return bySymbol;
}

function buildMarketCompositeBars(symbolBars: Record<string, NumericBar[]>): NumericBar[] {
  const bucket = new Map<number, NumericBar[]>();
  for (const bars of Object.values(symbolBars)) {
    for (const bar of bars) {
      const rows = bucket.get(bar.ts_open) || [];
      rows.push(bar);
      bucket.set(bar.ts_open, rows);
    }
  }
  return Array.from(bucket.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts_open, rows]) => ({
      ts_open,
      open: mean(rows.map((row) => row.open)),
      high: mean(rows.map((row) => row.high)),
      low: mean(rows.map((row) => row.low)),
      close: mean(rows.map((row) => row.close)),
      volume: rows.reduce((sum, row) => sum + row.volume, 0),
      source: 'market-composite',
    }));
}

function normalizeWeights(
  input: Partial<Record<StrategyStyle, number>>,
): Record<StrategyStyle, number> {
  const base: Record<StrategyStyle, number> = {
    trend_breakout: Math.max(0, safeNumber(input.trend_breakout, 0)),
    trend_pullback: Math.max(0, safeNumber(input.trend_pullback, 0)),
    mean_reversion: Math.max(0, safeNumber(input.mean_reversion, 0)),
  };
  const total = Object.values(base).reduce((sum, value) => sum + value, 0) || 1;
  return {
    trend_breakout: round(base.trend_breakout / total, 6),
    trend_pullback: round(base.trend_pullback / total, 6),
    mean_reversion: round(base.mean_reversion / total, 6),
  };
}

function buildMarketPlan(
  market: Market,
  compositeBars: NumericBar[],
): Map<number, MarketPlanPoint> {
  const closes = compositeBars.map((bar) => bar.close);
  const emaFast = emaSeries(closes, market === 'US' ? 18 : 24);
  const emaSlow = emaSeries(closes, market === 'US' ? 60 : 84);
  const atr = atrSeries(compositeBars, market === 'US' ? 14 : 18);
  const atrPct = atr.map((value, index) => value / Math.max(closes[index], 1e-9));
  const breakout = rollingMaxPrevious(closes, market === 'US' ? 25 : 32);
  const plan = new Map<number, MarketPlanPoint>();

  compositeBars.forEach((bar, index) => {
    const slopeUp = emaSlow[index] > safeNumber(emaSlow[Math.max(0, index - 5)], emaSlow[index]);
    const breakoutLive =
      Number.isFinite(breakout[index]) && closes[index] > breakout[index] * 1.002;
    const highVol =
      atrPct[index] >= (market === 'US' ? 0.028 : 0.055) ||
      percentileRankAt(atrPct, index, market === 'US' ? 50 : 90) >= 85;
    const downTrend =
      closes[index] < emaSlow[index] &&
      emaFast[index] < emaSlow[index] &&
      emaSlow[index] < safeNumber(emaSlow[Math.max(0, index - 5)], emaSlow[index]);
    const regime: MarketRegime =
      highVol && downTrend
        ? 'risk_off'
        : closes[index] > emaSlow[index] &&
            emaFast[index] > emaSlow[index] &&
            slopeUp &&
            breakoutLive
          ? 'trend'
          : 'range';

    const gross_target =
      regime === 'trend'
        ? market === 'US'
          ? 0.84
          : 1
        : regime === 'range'
          ? market === 'US'
            ? 0.68
            : 0.82
          : market === 'US'
            ? 0.3
            : 0.36;

    const style_weights = normalizeWeights(
      regime === 'trend'
        ? market === 'US'
          ? { trend_breakout: 0.52, trend_pullback: 0.36, mean_reversion: 0.12 }
          : { trend_breakout: 0.58, trend_pullback: 0.32, mean_reversion: 0.1 }
        : regime === 'range'
          ? market === 'US'
            ? { trend_breakout: 0.28, trend_pullback: 0.48, mean_reversion: 0.24 }
            : { trend_breakout: 0.34, trend_pullback: 0.44, mean_reversion: 0.22 }
          : market === 'US'
            ? { trend_breakout: 0.2, trend_pullback: 0.38, mean_reversion: 0.42 }
            : { trend_breakout: 0.18, trend_pullback: 0.36, mean_reversion: 0.46 },
    );

    plan.set(bar.ts_open, {
      ts_open: bar.ts_open,
      regime,
      gross_target,
      style_weights,
    });
  });

  return plan;
}

function aggregateToFourHourBars(bars: NumericBar[]): NumericBar[] {
  if (!bars.length) return [];
  const buckets = new Map<number, NumericBar[]>();
  for (const bar of bars) {
    const bucketTs = Math.floor(bar.ts_open / (4 * 60 * 60 * 1000)) * 4 * 60 * 60 * 1000;
    const rows = buckets.get(bucketTs) || [];
    rows.push(bar);
    buckets.set(bucketTs, rows);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([tsOpen, rows]) => ({
      ts_open: tsOpen,
      open: rows[0].open,
      high: Math.max(...rows.map((row) => row.high)),
      low: Math.min(...rows.map((row) => row.low)),
      close: rows[rows.length - 1].close,
      volume: rows.reduce((sum, row) => sum + row.volume, 0),
      source: rows[0].source || 'aggregated-4h',
    }));
}

function normalizeBars(
  rows: Array<{
    ts_open: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    source: string;
  }>,
): NumericBar[] {
  return rows
    .map((row) => ({
      ts_open: row.ts_open,
      open: safeNumber(row.open, Number.NaN),
      high: safeNumber(row.high, Number.NaN),
      low: safeNumber(row.low, Number.NaN),
      close: safeNumber(row.close, Number.NaN),
      volume: safeNumber(row.volume, 0),
      source: row.source,
    }))
    .filter(
      (row) =>
        Number.isFinite(row.ts_open) &&
        [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value)),
    )
    .sort((a, b) => a.ts_open - b.ts_open);
}

function resolveMarketSymbols(
  repo: MarketRepository,
  market: Market,
  requested: string[] | null | undefined,
): string[] {
  const req = (requested || []).map((value) => String(value).trim().toUpperCase()).filter(Boolean);
  if (req.length) {
    const assets = new Set(repo.listAssets(market).map((row) => row.symbol.toUpperCase()));
    return req.filter((symbol) => assets.size === 0 || assets.has(symbol));
  }

  const liveAssets = new Set(repo.listAssets(market).map((row) => row.symbol.toUpperCase()));
  const preferred = DEFAULT_SYMBOLS[market].filter(
    (symbol) => liveAssets.size === 0 || liveAssets.has(symbol),
  );
  if (preferred.length) return preferred;
  return Array.from(liveAssets).slice(0, market === 'US' ? 8 : 4);
}

function loadMarketBars(args: {
  repo: MarketRepository;
  market: Market;
  symbols?: string[] | null;
  startMs?: number;
  endMs?: number;
}): { symbolBars: Record<string, NumericBar[]>; lineage: SymbolLineage[] } {
  const timeframe: Timeframe = args.market === 'US' ? '1d' : '1h';
  const symbols = resolveMarketSymbols(args.repo, args.market, args.symbols);
  const symbolBars: Record<string, NumericBar[]> = {};
  const lineage: SymbolLineage[] = [];

  for (const symbol of symbols) {
    const asset = args.repo.getAssetBySymbol(args.market, symbol);
    if (!asset) continue;
    const rows = normalizeBars(
      args.repo.getOhlcv({
        assetId: asset.asset_id,
        timeframe,
        start: args.startMs,
        end: args.endMs,
      }),
    );
    const bars = args.market === 'CRYPTO' ? aggregateToFourHourBars(rows) : rows;
    const minBars = args.market === 'US' ? 180 : 220;
    if (bars.length < minBars) continue;
    symbolBars[symbol] = bars;
    lineage.push({
      symbol,
      market: args.market,
      timeframe,
      execution_timeframe: args.market === 'US' ? '1d' : '4h',
      source: bars[0]?.source || rows[0]?.source || 'db',
      bar_count: bars.length,
      first_ts_open: bars[0]?.ts_open ?? null,
      last_ts_open: bars[bars.length - 1]?.ts_open ?? null,
    });
  }

  return { symbolBars, lineage };
}

function buildConfigGrid(market: Market, riskProfile: RiskProfileKey): StrategyConfig[] {
  const riskMult = RISK_PROFILE_MULTIPLIER[riskProfile];
  if (market === 'US') {
    return [
      {
        config_id: 'us_guarded_20',
        market,
        style: 'trend_breakout',
        style_family: 'Trend Breakout',
        execution_timeframe: '1d',
        breakout_lookback: 20,
        ema_fast: 30,
        ema_slow: 120,
        atr_period: 20,
        volume_lookback: 20,
        rotation_lookback: 30,
        rotation_gate_min: 0.45,
        rotation_gate_max: 1,
        pullback_atr_multiple: 0.7,
        reversion_zscore: 1.1,
        min_atr_pct: 0.008,
        max_atr_pct: 0.045,
        volume_ratio_min: 1.05,
        max_extension_pct: 0.06,
        stop_atr: 2.2,
        trail_atr: 2.8,
        profit_lock_trigger_r: 1.6,
        profit_lock_trail_atr: 3.4,
        max_hold_bars: 24,
        cooldown_bars: 4,
        risk_per_trade_pct: round(0.0036 * riskMult, 6),
        max_position_pct: round(0.08 * riskMult, 6),
        min_position_pct: 0.01,
        max_participation_rate: 0.012,
        min_dollar_volume: 25_000_000,
        tightness_score: 1,
      },
      {
        config_id: 'us_guarded_30',
        market,
        style: 'trend_breakout',
        style_family: 'Trend Breakout',
        execution_timeframe: '1d',
        breakout_lookback: 30,
        ema_fast: 35,
        ema_slow: 140,
        atr_period: 20,
        volume_lookback: 20,
        rotation_lookback: 35,
        rotation_gate_min: 0.5,
        rotation_gate_max: 1,
        pullback_atr_multiple: 0.75,
        reversion_zscore: 1.1,
        min_atr_pct: 0.009,
        max_atr_pct: 0.04,
        volume_ratio_min: 1.1,
        max_extension_pct: 0.055,
        stop_atr: 2.3,
        trail_atr: 2.9,
        profit_lock_trigger_r: 1.75,
        profit_lock_trail_atr: 3.5,
        max_hold_bars: 22,
        cooldown_bars: 5,
        risk_per_trade_pct: round(0.0031 * riskMult, 6),
        max_position_pct: round(0.072 * riskMult, 6),
        min_position_pct: 0.01,
        max_participation_rate: 0.01,
        min_dollar_volume: 35_000_000,
        tightness_score: 2,
      },
      {
        config_id: 'us_guarded_40',
        market,
        style: 'trend_breakout',
        style_family: 'Trend Breakout',
        execution_timeframe: '1d',
        breakout_lookback: 40,
        ema_fast: 40,
        ema_slow: 160,
        atr_period: 22,
        volume_lookback: 20,
        rotation_lookback: 40,
        rotation_gate_min: 0.55,
        rotation_gate_max: 1,
        pullback_atr_multiple: 0.8,
        reversion_zscore: 1.15,
        min_atr_pct: 0.01,
        max_atr_pct: 0.036,
        volume_ratio_min: 1.16,
        max_extension_pct: 0.05,
        stop_atr: 2.4,
        trail_atr: 3,
        profit_lock_trigger_r: 1.8,
        profit_lock_trail_atr: 3.7,
        max_hold_bars: 20,
        cooldown_bars: 6,
        risk_per_trade_pct: round(0.0028 * riskMult, 6),
        max_position_pct: round(0.064 * riskMult, 6),
        min_position_pct: 0.01,
        max_participation_rate: 0.009,
        min_dollar_volume: 50_000_000,
        tightness_score: 3,
      },
      {
        config_id: 'us_guarded_50',
        market,
        style: 'trend_breakout',
        style_family: 'Trend Breakout',
        execution_timeframe: '1d',
        breakout_lookback: 50,
        ema_fast: 45,
        ema_slow: 180,
        atr_period: 22,
        volume_lookback: 20,
        rotation_lookback: 45,
        rotation_gate_min: 0.58,
        rotation_gate_max: 1,
        pullback_atr_multiple: 0.8,
        reversion_zscore: 1.2,
        min_atr_pct: 0.011,
        max_atr_pct: 0.032,
        volume_ratio_min: 1.22,
        max_extension_pct: 0.045,
        stop_atr: 2.6,
        trail_atr: 3.2,
        profit_lock_trigger_r: 1.95,
        profit_lock_trail_atr: 3.9,
        max_hold_bars: 18,
        cooldown_bars: 7,
        risk_per_trade_pct: round(0.0025 * riskMult, 6),
        max_position_pct: round(0.055 * riskMult, 6),
        min_position_pct: 0.01,
        max_participation_rate: 0.008,
        min_dollar_volume: 75_000_000,
        tightness_score: 4,
      },
      {
        config_id: 'us_pullback_16',
        market,
        style: 'trend_pullback',
        style_family: 'Trend Pullback',
        execution_timeframe: '1d',
        breakout_lookback: 16,
        ema_fast: 18,
        ema_slow: 90,
        atr_period: 14,
        volume_lookback: 18,
        rotation_lookback: 25,
        rotation_gate_min: 0.45,
        rotation_gate_max: 1,
        pullback_atr_multiple: 0.95,
        reversion_zscore: 1.1,
        min_atr_pct: 0.007,
        max_atr_pct: 0.04,
        volume_ratio_min: 0.92,
        max_extension_pct: 0.03,
        stop_atr: 1.9,
        trail_atr: 3.1,
        profit_lock_trigger_r: 1.4,
        profit_lock_trail_atr: 3.8,
        max_hold_bars: 20,
        cooldown_bars: 2,
        risk_per_trade_pct: round(0.0032 * riskMult, 6),
        max_position_pct: round(0.075 * riskMult, 6),
        min_position_pct: 0.012,
        max_participation_rate: 0.012,
        min_dollar_volume: 20_000_000,
        tightness_score: 1.4,
      },
      {
        config_id: 'us_pullback_22',
        market,
        style: 'trend_pullback',
        style_family: 'Trend Pullback',
        execution_timeframe: '1d',
        breakout_lookback: 22,
        ema_fast: 20,
        ema_slow: 100,
        atr_period: 16,
        volume_lookback: 20,
        rotation_lookback: 30,
        rotation_gate_min: 0.5,
        rotation_gate_max: 1,
        pullback_atr_multiple: 1.05,
        reversion_zscore: 1.15,
        min_atr_pct: 0.0075,
        max_atr_pct: 0.038,
        volume_ratio_min: 0.95,
        max_extension_pct: 0.028,
        stop_atr: 2,
        trail_atr: 3.2,
        profit_lock_trigger_r: 1.55,
        profit_lock_trail_atr: 3.9,
        max_hold_bars: 18,
        cooldown_bars: 2,
        risk_per_trade_pct: round(0.003 * riskMult, 6),
        max_position_pct: round(0.07 * riskMult, 6),
        min_position_pct: 0.012,
        max_participation_rate: 0.011,
        min_dollar_volume: 25_000_000,
        tightness_score: 1.9,
      },
      {
        config_id: 'us_meanrev_10',
        market,
        style: 'mean_reversion',
        style_family: 'Mean Reversion',
        execution_timeframe: '1d',
        breakout_lookback: 10,
        ema_fast: 12,
        ema_slow: 70,
        atr_period: 14,
        volume_lookback: 18,
        rotation_lookback: 20,
        rotation_gate_min: 0,
        rotation_gate_max: 0.85,
        pullback_atr_multiple: 0.8,
        reversion_zscore: 1.25,
        min_atr_pct: 0.006,
        max_atr_pct: 0.035,
        volume_ratio_min: 0.82,
        max_extension_pct: 0.018,
        stop_atr: 1.5,
        trail_atr: 2.2,
        profit_lock_trigger_r: 1.1,
        profit_lock_trail_atr: 2.8,
        max_hold_bars: 8,
        cooldown_bars: 2,
        risk_per_trade_pct: round(0.0026 * riskMult, 6),
        max_position_pct: round(0.06 * riskMult, 6),
        min_position_pct: 0.012,
        max_participation_rate: 0.012,
        min_dollar_volume: 18_000_000,
        tightness_score: 1.2,
      },
      {
        config_id: 'us_meanrev_14',
        market,
        style: 'mean_reversion',
        style_family: 'Mean Reversion',
        execution_timeframe: '1d',
        breakout_lookback: 14,
        ema_fast: 14,
        ema_slow: 84,
        atr_period: 16,
        volume_lookback: 20,
        rotation_lookback: 24,
        rotation_gate_min: 0,
        rotation_gate_max: 0.9,
        pullback_atr_multiple: 0.8,
        reversion_zscore: 1.4,
        min_atr_pct: 0.006,
        max_atr_pct: 0.032,
        volume_ratio_min: 0.85,
        max_extension_pct: 0.02,
        stop_atr: 1.6,
        trail_atr: 2.4,
        profit_lock_trigger_r: 1.2,
        profit_lock_trail_atr: 2.9,
        max_hold_bars: 7,
        cooldown_bars: 2,
        risk_per_trade_pct: round(0.0024 * riskMult, 6),
        max_position_pct: round(0.055 * riskMult, 6),
        min_position_pct: 0.012,
        max_participation_rate: 0.011,
        min_dollar_volume: 20_000_000,
        tightness_score: 1.6,
      },
    ];
  }

  return [
    {
      config_id: 'crypto_guarded_18',
      market,
      style: 'trend_breakout',
      style_family: 'Trend Breakout',
      execution_timeframe: '4h',
      breakout_lookback: 18,
      ema_fast: 16,
      ema_slow: 64,
      atr_period: 14,
      volume_lookback: 18,
      rotation_lookback: 24,
      rotation_gate_min: 0.42,
      rotation_gate_max: 1,
      pullback_atr_multiple: 1,
      reversion_zscore: 1.2,
      min_atr_pct: 0.012,
      max_atr_pct: 0.1,
      volume_ratio_min: 1.08,
      max_extension_pct: 0.085,
      stop_atr: 2.3,
      trail_atr: 3,
      profit_lock_trigger_r: 1.5,
      profit_lock_trail_atr: 3.8,
      max_hold_bars: 72,
      cooldown_bars: 2,
      risk_per_trade_pct: round(0.0031 * riskMult, 6),
      max_position_pct: round(0.07 * riskMult, 6),
      min_position_pct: 0.01,
      max_participation_rate: 0.01,
      min_dollar_volume: 15_000_000,
      tightness_score: 1,
    },
    {
      config_id: 'crypto_guarded_24',
      market,
      style: 'trend_breakout',
      style_family: 'Trend Breakout',
      execution_timeframe: '4h',
      breakout_lookback: 24,
      ema_fast: 18,
      ema_slow: 72,
      atr_period: 14,
      volume_lookback: 20,
      rotation_lookback: 28,
      rotation_gate_min: 0.46,
      rotation_gate_max: 1,
      pullback_atr_multiple: 1,
      reversion_zscore: 1.25,
      min_atr_pct: 0.013,
      max_atr_pct: 0.085,
      volume_ratio_min: 1.12,
      max_extension_pct: 0.075,
      stop_atr: 2.5,
      trail_atr: 3.2,
      profit_lock_trigger_r: 1.8,
      profit_lock_trail_atr: 3.9,
      max_hold_bars: 60,
      cooldown_bars: 3,
      risk_per_trade_pct: round(0.0028 * riskMult, 6),
      max_position_pct: round(0.064 * riskMult, 6),
      min_position_pct: 0.01,
      max_participation_rate: 0.009,
      min_dollar_volume: 20_000_000,
      tightness_score: 2,
    },
    {
      config_id: 'crypto_guarded_30',
      market,
      style: 'trend_breakout',
      style_family: 'Trend Breakout',
      execution_timeframe: '4h',
      breakout_lookback: 30,
      ema_fast: 20,
      ema_slow: 84,
      atr_period: 16,
      volume_lookback: 20,
      rotation_lookback: 32,
      rotation_gate_min: 0.5,
      rotation_gate_max: 1,
      pullback_atr_multiple: 1.05,
      reversion_zscore: 1.25,
      min_atr_pct: 0.014,
      max_atr_pct: 0.075,
      volume_ratio_min: 1.18,
      max_extension_pct: 0.068,
      stop_atr: 2.6,
      trail_atr: 3.4,
      profit_lock_trigger_r: 1.9,
      profit_lock_trail_atr: 4.1,
      max_hold_bars: 52,
      cooldown_bars: 4,
      risk_per_trade_pct: round(0.0025 * riskMult, 6),
      max_position_pct: round(0.057 * riskMult, 6),
      min_position_pct: 0.01,
      max_participation_rate: 0.008,
      min_dollar_volume: 30_000_000,
      tightness_score: 3,
    },
    {
      config_id: 'crypto_guarded_36',
      market,
      style: 'trend_breakout',
      style_family: 'Trend Breakout',
      execution_timeframe: '4h',
      breakout_lookback: 36,
      ema_fast: 24,
      ema_slow: 96,
      atr_period: 16,
      volume_lookback: 22,
      rotation_lookback: 36,
      rotation_gate_min: 0.55,
      rotation_gate_max: 1,
      pullback_atr_multiple: 1.08,
      reversion_zscore: 1.3,
      min_atr_pct: 0.015,
      max_atr_pct: 0.065,
      volume_ratio_min: 1.25,
      max_extension_pct: 0.06,
      stop_atr: 2.8,
      trail_atr: 3.6,
      profit_lock_trigger_r: 2.05,
      profit_lock_trail_atr: 4.2,
      max_hold_bars: 44,
      cooldown_bars: 5,
      risk_per_trade_pct: round(0.0022 * riskMult, 6),
      max_position_pct: round(0.05 * riskMult, 6),
      min_position_pct: 0.01,
      max_participation_rate: 0.007,
      min_dollar_volume: 40_000_000,
      tightness_score: 4,
    },
    {
      config_id: 'crypto_pullback_16',
      market,
      style: 'trend_pullback',
      style_family: 'Trend Pullback',
      execution_timeframe: '4h',
      breakout_lookback: 16,
      ema_fast: 14,
      ema_slow: 56,
      atr_period: 14,
      volume_lookback: 18,
      rotation_lookback: 20,
      rotation_gate_min: 0.45,
      rotation_gate_max: 1,
      pullback_atr_multiple: 1.15,
      reversion_zscore: 1.2,
      min_atr_pct: 0.011,
      max_atr_pct: 0.085,
      volume_ratio_min: 0.88,
      max_extension_pct: 0.045,
      stop_atr: 1.9,
      trail_atr: 3.4,
      profit_lock_trigger_r: 1.35,
      profit_lock_trail_atr: 4.4,
      max_hold_bars: 40,
      cooldown_bars: 1,
      risk_per_trade_pct: round(0.0032 * riskMult, 6),
      max_position_pct: round(0.074 * riskMult, 6),
      min_position_pct: 0.012,
      max_participation_rate: 0.011,
      min_dollar_volume: 18_000_000,
      tightness_score: 1.5,
    },
    {
      config_id: 'crypto_pullback_22',
      market,
      style: 'trend_pullback',
      style_family: 'Trend Pullback',
      execution_timeframe: '4h',
      breakout_lookback: 22,
      ema_fast: 16,
      ema_slow: 64,
      atr_period: 16,
      volume_lookback: 20,
      rotation_lookback: 24,
      rotation_gate_min: 0.5,
      rotation_gate_max: 1,
      pullback_atr_multiple: 1.25,
      reversion_zscore: 1.25,
      min_atr_pct: 0.012,
      max_atr_pct: 0.078,
      volume_ratio_min: 0.9,
      max_extension_pct: 0.04,
      stop_atr: 2,
      trail_atr: 3.5,
      profit_lock_trigger_r: 1.5,
      profit_lock_trail_atr: 4.5,
      max_hold_bars: 34,
      cooldown_bars: 1,
      risk_per_trade_pct: round(0.003 * riskMult, 6),
      max_position_pct: round(0.07 * riskMult, 6),
      min_position_pct: 0.012,
      max_participation_rate: 0.01,
      min_dollar_volume: 22_000_000,
      tightness_score: 2,
    },
    {
      config_id: 'crypto_meanrev_12',
      market,
      style: 'mean_reversion',
      style_family: 'Mean Reversion',
      execution_timeframe: '4h',
      breakout_lookback: 12,
      ema_fast: 12,
      ema_slow: 48,
      atr_period: 14,
      volume_lookback: 18,
      rotation_lookback: 18,
      rotation_gate_min: 0,
      rotation_gate_max: 0.9,
      pullback_atr_multiple: 0.85,
      reversion_zscore: 1.35,
      min_atr_pct: 0.01,
      max_atr_pct: 0.07,
      volume_ratio_min: 0.8,
      max_extension_pct: 0.03,
      stop_atr: 1.45,
      trail_atr: 2.5,
      profit_lock_trigger_r: 1.05,
      profit_lock_trail_atr: 3,
      max_hold_bars: 10,
      cooldown_bars: 2,
      risk_per_trade_pct: round(0.0025 * riskMult, 6),
      max_position_pct: round(0.055 * riskMult, 6),
      min_position_pct: 0.012,
      max_participation_rate: 0.01,
      min_dollar_volume: 16_000_000,
      tightness_score: 1.3,
    },
    {
      config_id: 'crypto_meanrev_16',
      market,
      style: 'mean_reversion',
      style_family: 'Mean Reversion',
      execution_timeframe: '4h',
      breakout_lookback: 16,
      ema_fast: 14,
      ema_slow: 56,
      atr_period: 16,
      volume_lookback: 20,
      rotation_lookback: 22,
      rotation_gate_min: 0,
      rotation_gate_max: 0.95,
      pullback_atr_multiple: 0.9,
      reversion_zscore: 1.5,
      min_atr_pct: 0.01,
      max_atr_pct: 0.065,
      volume_ratio_min: 0.82,
      max_extension_pct: 0.03,
      stop_atr: 1.55,
      trail_atr: 2.6,
      profit_lock_trigger_r: 1.1,
      profit_lock_trail_atr: 3.1,
      max_hold_bars: 9,
      cooldown_bars: 2,
      risk_per_trade_pct: round(0.0023 * riskMult, 6),
      max_position_pct: round(0.05 * riskMult, 6),
      min_position_pct: 0.012,
      max_participation_rate: 0.009,
      min_dollar_volume: 20_000_000,
      tightness_score: 1.7,
    },
  ];
}

function determinePositionWeight(args: {
  entryPrice: number;
  atr: number;
  averageDollarVolume: number;
  config: StrategyConfig;
  partialFillProbability: number;
  signalQuality: number;
  marketBudget: number;
}): number {
  const stopDistancePct = Math.max(
    1e-6,
    (args.config.stop_atr * Math.max(args.atr, 1e-6)) / args.entryPrice,
  );
  const riskSized = args.config.risk_per_trade_pct / stopDistancePct;
  const participationCap =
    args.averageDollarVolume > 0
      ? (args.averageDollarVolume * args.config.max_participation_rate) / 1_000_000
      : args.config.max_position_pct;
  const normalizedParticipationCap = clamp(
    participationCap / 100,
    args.config.min_position_pct,
    args.config.max_position_pct,
  );
  const qualityMultiplier = clamp(0.72 + args.signalQuality * 0.55, 0.6, 1.22);
  const marketBudgetMultiplier = clamp(0.62 + args.marketBudget * 0.58, 0.68, 1.18);
  return round(
    clamp(
      Math.min(riskSized, normalizedParticipationCap) *
        qualityMultiplier *
        marketBudgetMultiplier *
        clamp(args.partialFillProbability, 0.35, 1),
      args.config.min_position_pct,
      args.config.max_position_pct,
    ),
    6,
  );
}

function buildSymbolBacktest(args: {
  symbol: string;
  market: Market;
  bars: NumericBar[];
  config: StrategyConfig;
  rotationScoresBySymbol?: Map<string, Map<number, number>>;
  marketPlan?: Map<number, MarketPlanPoint>;
  scenario?: Record<string, unknown> | null;
  clipStartTs?: number;
  clipEndTs?: number;
}): {
  trades: TradeRecord[];
  barReturns: BarReturnRow[];
  futureLeakViolations: number;
} {
  const { bars, config, market, symbol } = args;
  const highs = bars.map((bar) => bar.high);
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);
  const emaFast = emaSeries(closes, config.ema_fast);
  const emaSlow = emaSeries(closes, config.ema_slow);
  const rollingCloseMean = rollingMeanSeries(closes, Math.max(6, config.ema_fast));
  const rollingCloseStd = rollingStdSeries(closes, Math.max(6, config.ema_fast));
  const atr = atrSeries(bars, config.atr_period);
  const avgVolume = rollingMeanSeries(volumes, config.volume_lookback);
  const avgDollarVolume = rollingMeanSeries(
    bars.map((bar) => bar.close * Math.max(bar.volume, 1)),
    config.volume_lookback,
  );
  const breakoutLevel = rollingMaxPrevious(highs, config.breakout_lookback);
  const atrPctSeries = atr.map((value, index) => value / Math.max(closes[index], 1e-9));
  const zScoreSeries = closes.map((close, index) => {
    const denom = Math.max(rollingCloseStd[index], 1e-6);
    return (close - rollingCloseMean[index]) / denom;
  });
  const rotationScoreMap = args.rotationScoresBySymbol?.get(symbol) || new Map<number, number>();
  const realismProfile = resolveExecutionRealismProfile({ mode: 'paper' });
  const signalDelayBars = Math.max(0, Math.floor(safeNumber(args.scenario?.signal_delay_bars, 0)));
  const entryPriceOffsetBps = Math.max(0, safeNumber(args.scenario?.entry_price_offset_bps, 0));
  const exitPriceOffsetBps = Math.max(0, safeNumber(args.scenario?.exit_price_offset_bps, 0));

  const trades: TradeRecord[] = [];
  const barReturns: BarReturnRow[] = [];
  let futureLeakViolations = 0;
  let pendingEntrySignalIndex: number | null = null;
  let pendingExit: { atIndex: number; rawPrice: number; reason: string } | null = null;
  let lastTradeExitIndex = -10_000;
  let position: {
    signalIndex: number;
    entryIndex: number;
    entryPrice: number;
    lastMarkPrice: number;
    weight: number;
    highestClose: number;
    currentStop: number;
    initialStop: number;
    barsHeld: number;
    signalQuality: number;
    assumption: ReturnType<typeof resolveExecutionAssumptions>;
  } | null = null;

  const warmup = configWarmup(config);
  for (let index = warmup; index < bars.length; index += 1) {
    const bar = bars[index];
    const date = toDateKey(bar.ts_open);
    let returnPct = 0;
    let exposure = 0;
    let enteredThisBar = false;
    const marketPoint =
      args.marketPlan?.get(bar.ts_open) ||
      ({
        ts_open: bar.ts_open,
        regime: 'range',
        gross_target: market === 'US' ? 0.6 : 0.68,
        style_weights: normalizeWeights({
          trend_breakout: 0.34,
          trend_pullback: 0.33,
          mean_reversion: 0.33,
        }),
      } satisfies MarketPlanPoint);

    if (pendingExit && pendingExit.atIndex === index && position) {
      const exitAssumption = resolveExecutionAssumptions({
        profile: realismProfile,
        mode: 'paper',
        signal: {
          market,
          direction: 'LONG',
          created_at: new Date(bar.ts_open).toISOString(),
          volatility_percentile: percentileRankAt(atrPctSeries, Math.max(0, index - 1), 90),
          liquidity_score: clamp(
            Math.log10(
              Math.max(1, avgDollarVolume[Math.max(0, index - 1)] / config.min_dollar_volume) + 1,
            ) / 1.2,
            0.05,
            0.99,
          ),
        },
        bar,
      });
      const finalAssumption = args.scenario
        ? applyScenarioToAssumption(exitAssumption, args.scenario)
        : exitAssumption;
      const rawExitPrice = Math.max(0.01, pendingExit.rawPrice * (1 - exitPriceOffsetBps / 10000));
      const exitPrice = adjustPriceForExecution({
        price: rawExitPrice,
        direction: 'LONG',
        side: 'exit',
        slippageBps: finalAssumption.exit_slippage_bps,
        spreadBps: finalAssumption.spread_bps,
      });
      const gapReturn = position.weight * (exitPrice / Math.max(position.lastMarkPrice, 1e-9) - 1);
      const feeDrag =
        position.weight *
        ((safeNumber(finalAssumption.fee_bps_per_side, 0) +
          safeNumber(position.assumption.fee_bps_per_side, 0)) /
          10000 +
          (safeNumber(finalAssumption.funding_bps_per_day, 0) / 10000) *
            Math.max(1, position.barsHeld / 6) +
          (safeNumber(finalAssumption.borrow_bps_per_day, 0) / 10000) *
            Math.max(1, position.barsHeld / 6));
      returnPct += gapReturn - feeDrag;
      const rawReturn = exitPrice / Math.max(position.entryPrice, 1e-9) - 1;
      trades.push({
        trade_id: `${market}-${symbol}-${bar.ts_open}-${trades.length + 1}`,
        symbol,
        market,
        strategy_style: config.style,
        config_id: config.config_id,
        signal_ts: bars[position.signalIndex].ts_open,
        entry_ts: bars[position.entryIndex].ts_open,
        exit_ts: bar.ts_open,
        entry_price: round(position.entryPrice, 6),
        exit_price: round(exitPrice, 6),
        stop_price_initial: round(position.initialStop, 6),
        stop_price_exit: round(position.currentStop, 6),
        weight: round(position.weight, 6),
        holding_bars: position.barsHeld,
        raw_return: round(rawReturn, 6),
        net_return: round(rawReturn * position.weight - feeDrag, 6),
        exit_reason: pendingExit.reason,
        assumption_profile_id: String(position.assumption.profile_id || realismProfile.profile_id),
        assumption_mode: String(position.assumption.mode || realismProfile.mode),
        volatility_bucket: String(finalAssumption.volatility_bucket || 'normal'),
        liquidity_bucket: String(finalAssumption.liquidity_bucket || 'normal'),
        partial_fill_probability: round(
          safeNumber(position.assumption.partial_fill_probability, 1),
          6,
        ),
        fees_and_funding_drag: round(feeDrag, 6),
      });
      position = null;
      pendingExit = null;
      lastTradeExitIndex = index;
    }

    if (
      pendingEntrySignalIndex !== null &&
      pendingEntrySignalIndex + 1 + signalDelayBars <= index &&
      !position
    ) {
      const signalIndex: number = pendingEntrySignalIndex;
      const signalBar: NumericBar = bars[signalIndex];
      const signalAtr = atr[signalIndex];
      const avgDollar: number = avgDollarVolume[signalIndex];
      const volatilityPercentile = percentileRankAt(atrPctSeries, signalIndex, 90);
      const signalRotationScore = safeNumber(rotationScoreMap.get(signalBar.ts_open), 0.5);
      const signalPlan =
        args.marketPlan?.get(signalBar.ts_open) ||
        ({
          ts_open: signalBar.ts_open,
          regime: 'range',
          gross_target: market === 'US' ? 0.6 : 0.68,
          style_weights: normalizeWeights({
            trend_breakout: 0.34,
            trend_pullback: 0.33,
            mean_reversion: 0.33,
          }),
        } satisfies MarketPlanPoint);
      const liquidityScore: number = clamp(
        Math.log10(Math.max(1, avgDollar / config.min_dollar_volume) + 1) / 1.2,
        0.05,
        0.99,
      );
      const trendStrength: number = clamp(
        (safeNumber(emaFast[signalIndex], signalBar.close) /
          Math.max(safeNumber(emaSlow[signalIndex], signalBar.close), 1e-9) -
          1) *
          10 +
          signalRotationScore * 0.6 +
          liquidityScore * 0.4,
        0.05,
        1,
      );
      const signalQuality: number = clamp(
        trendStrength * 0.5 + liquidityScore * 0.25 + signalPlan.style_weights[config.style] * 0.25,
        0.05,
        1,
      );
      if (signalBar.ts_open >= bar.ts_open) futureLeakViolations += 1;
      const entryAssumptionBase: ReturnType<typeof resolveExecutionAssumptions> =
        resolveExecutionAssumptions({
          profile: realismProfile,
          mode: 'paper',
          signal: {
            market,
            direction: 'LONG',
            created_at: new Date(signalBar.ts_open).toISOString(),
            volatility_percentile: volatilityPercentile,
            liquidity_score: liquidityScore,
          },
          bar,
        });
      const entryAssumption: ReturnType<typeof resolveExecutionAssumptions> = args.scenario
        ? applyScenarioToAssumption(entryAssumptionBase, args.scenario)
        : entryAssumptionBase;
      const entryPrice: number = adjustPriceForExecution({
        price: bar.open * (1 + entryPriceOffsetBps / 10000),
        direction: 'LONG',
        side: 'entry',
        slippageBps: entryAssumption.entry_slippage_bps,
        spreadBps: entryAssumption.spread_bps,
      });
      const weight = determinePositionWeight({
        entryPrice,
        atr: signalAtr,
        averageDollarVolume: avgDollar,
        config,
        partialFillProbability: safeNumber(entryAssumption.partial_fill_probability, 1),
        signalQuality,
        marketBudget:
          signalPlan.gross_target * clamp(signalPlan.style_weights[config.style] * 2.2, 0.55, 1.05),
      });

      if (weight >= config.min_position_pct) {
        const initialStop = Math.max(0.01, entryPrice - config.stop_atr * signalAtr);
        position = {
          signalIndex,
          entryIndex: index,
          entryPrice,
          lastMarkPrice: entryPrice,
          weight,
          highestClose: bar.close,
          currentStop: initialStop,
          initialStop,
          barsHeld: 1,
          signalQuality,
          assumption: entryAssumption,
        };
        returnPct += weight * (bar.close / Math.max(entryPrice, 1e-9) - 1);
        exposure = weight;
        position.lastMarkPrice = bar.close;
        enteredThisBar = true;
      }
      pendingEntrySignalIndex = null;
    }

    if (position && !enteredThisBar) {
      returnPct += position.weight * (bar.close / Math.max(position.lastMarkPrice, 1e-9) - 1);
      exposure = position.weight;
      position.lastMarkPrice = bar.close;
      position.highestClose = Math.max(position.highestClose, bar.close);
      position.barsHeld += 1;
    }

    if (position && index < bars.length - 1) {
      const atrNow = atr[index];
      const profitR =
        (position.highestClose - position.entryPrice) /
        Math.max(position.entryPrice - position.initialStop, 1e-9);
      const adaptiveTrailAtr =
        profitR >= config.profit_lock_trigger_r ? config.profit_lock_trail_atr : config.trail_atr;
      const trailingAnchor =
        config.style === 'mean_reversion'
          ? emaFast[index] - 0.2 * atrNow
          : profitR >= config.profit_lock_trigger_r
            ? emaSlow[index] - 0.15 * atrNow
            : emaFast[index] - 0.35 * atrNow;
      const trailingStop = Math.max(
        position.initialStop,
        position.highestClose - adaptiveTrailAtr * atrNow,
        trailingAnchor,
      );
      position.currentStop = Math.max(position.currentStop, trailingStop);

      if (config.style === 'mean_reversion') {
        const meanTarget = Math.max(emaFast[index], position.entryPrice + 0.55 * atrNow);
        if (bar.low <= position.currentStop) {
          pendingExit = {
            atIndex: index + 1,
            rawPrice: Math.min(position.currentStop, bars[index + 1].open),
            reason: 'volatility_stop',
          };
        } else if (bar.high >= meanTarget || zScoreSeries[index] >= -0.1) {
          pendingExit = {
            atIndex: index + 1,
            rawPrice: Math.max(meanTarget, bars[index + 1].open),
            reason: 'mean_revert_target',
          };
        } else if (position.barsHeld >= config.max_hold_bars) {
          pendingExit = {
            atIndex: index + 1,
            rawPrice: bars[index + 1].open,
            reason: 'time_stop',
          };
        }
      } else if (bar.low <= position.currentStop) {
        pendingExit = {
          atIndex: index + 1,
          rawPrice: Math.min(position.currentStop, bars[index + 1].open),
          reason: 'stop_or_trail',
        };
      } else if (
        profitR >= config.profit_lock_trigger_r
          ? bar.close < emaSlow[index]
          : bar.close < emaFast[index] && bar.close < emaSlow[index]
      ) {
        pendingExit = {
          atIndex: index + 1,
          rawPrice: bars[index + 1].open,
          reason: 'trend_break',
        };
      } else if (position.barsHeld >= config.max_hold_bars) {
        pendingExit = {
          atIndex: index + 1,
          rawPrice: bars[index + 1].open,
          reason: 'time_stop',
        };
      }
    }

    const inClipRange =
      (args.clipStartTs === undefined || bar.ts_open >= args.clipStartTs) &&
      (args.clipEndTs === undefined || bar.ts_open <= args.clipEndTs);
    if (inClipRange && Math.abs(returnPct) > 0) {
      barReturns.push({
        ts_open: bar.ts_open,
        date,
        return_pct: round(returnPct, 8),
        gross_exposure: round(exposure, 6),
      });
    }

    if (
      !position &&
      !pendingEntrySignalIndex &&
      !pendingExit &&
      index < bars.length - 1 &&
      index - lastTradeExitIndex >= config.cooldown_bars
    ) {
      const close = closes[index];
      const atrPct = atrPctSeries[index];
      const breakout = breakoutLevel[index];
      const rotationScore = safeNumber(rotationScoreMap.get(bar.ts_open), 0.5);
      const priorClose = safeNumber(closes[index - 1], close);
      const trendStructureOk =
        emaFast[index] > emaSlow[index] &&
        emaSlow[index] > safeNumber(emaSlow[Math.max(0, index - 5)], emaSlow[index]);
      const trendOk = close > emaFast[index] && trendStructureOk;
      const breakoutOk = Number.isFinite(breakout) && close > breakout * 1.001;
      const volOk = atrPct >= config.min_atr_pct && atrPct <= config.max_atr_pct;
      const volumeRatio = volumes[index] / Math.max(avgVolume[index], 1);
      const volumeOk = volumeRatio >= config.volume_ratio_min;
      const extensionPct = (close - emaFast[index]) / Math.max(emaFast[index], 1e-9);
      const extensionOk = extensionPct <= config.max_extension_pct;
      const liquidityOk = avgDollarVolume[index] >= config.min_dollar_volume;
      const pullbackDepthAtr = Math.max(emaFast[index] - bar.low, 0) / Math.max(atr[index], 1e-9);
      const pullbackTouchOk = bar.low <= emaFast[index] + atr[index] * 0.2;
      const pullbackReclaimOk = close >= emaFast[index] * (market === 'US' ? 0.996 : 0.993);
      const reboundOk = close > bar.open || close > priorClose;
      const pullbackExtensionOk =
        extensionPct <= Math.max(config.max_extension_pct * 0.7, market === 'US' ? 0.018 : 0.028);
      const pullbackOk =
        trendStructureOk &&
        close > emaSlow[index] &&
        pullbackTouchOk &&
        pullbackDepthAtr >= 0.08 &&
        pullbackDepthAtr <= config.pullback_atr_multiple &&
        pullbackReclaimOk &&
        reboundOk &&
        pullbackExtensionOk;
      const meanReversionOk =
        market === 'US' &&
        marketPoint.regime === 'range' &&
        zScoreSeries[index] <= -config.reversion_zscore &&
        safeNumber(zScoreSeries[Math.max(0, index - 1)], zScoreSeries[index]) <=
          -Math.max(0.7, config.reversion_zscore * 0.55) &&
        close >= emaSlow[index] * 0.95 &&
        close >= bar.low + (bar.high - bar.low) * 0.35 &&
        close > Math.min(bar.open, priorClose) &&
        atrPct >= config.min_atr_pct * 0.9 &&
        atrPct <= config.max_atr_pct &&
        volumeRatio >= 0.72 &&
        volumeRatio <= 1.45;
      const rotationOk =
        rotationScore >= config.rotation_gate_min && rotationScore <= config.rotation_gate_max;
      const planSupportsStyle =
        marketPoint.style_weights[config.style] >=
        (config.style === 'mean_reversion' ? 0.18 : 0.12);

      const entryAllowed =
        config.style === 'trend_breakout'
          ? trendOk && breakoutOk && volOk && volumeOk && extensionOk && liquidityOk && rotationOk
          : config.style === 'trend_pullback'
            ? pullbackOk &&
              volOk &&
              volumeRatio >= Math.max(0.82, config.volume_ratio_min * 0.95) &&
              liquidityOk &&
              rotationOk
            : meanReversionOk &&
              liquidityOk &&
              rotationScore >= 0.08 &&
              rotationScore <= config.rotation_gate_max;

      if (planSupportsStyle && entryAllowed) {
        pendingEntrySignalIndex = index;
      }
    }
  }

  const filteredTrades = trades.filter(
    (trade) =>
      (args.clipStartTs === undefined || trade.entry_ts >= args.clipStartTs) &&
      (args.clipEndTs === undefined || trade.entry_ts <= args.clipEndTs),
  );

  return {
    trades: filteredTrades,
    barReturns,
    futureLeakViolations,
  };
}

function aggregateDailyReturns(rows: BarReturnRow[]): DailyReturnRow[] {
  const map = new Map<string, number[]>();
  for (const row of rows) {
    const list = map.get(row.date) || [];
    list.push(row.return_pct);
    map.set(row.date, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, returns]) => ({
      date,
      return_pct: round(returns.reduce((equity, value) => equity * (1 + value), 1) - 1, 8),
    }));
}

function runMarketBacktest(args: {
  market: Market;
  symbolBars: Record<string, NumericBar[]>;
  config: StrategyConfig;
  dataLineage: SymbolLineage[];
  rotationScoresBySymbol?: Map<string, Map<number, number>>;
  marketPlan?: Map<number, MarketPlanPoint>;
  scenario?: Record<string, unknown> | null;
  clipStartTs?: number;
  clipEndTs?: number;
}): MarketBacktestResult {
  const symbolResults = Object.entries(args.symbolBars).map(([symbol, bars]) =>
    buildSymbolBacktest({
      symbol,
      market: args.market,
      bars,
      config: args.config,
      rotationScoresBySymbol: args.rotationScoresBySymbol,
      marketPlan: args.marketPlan,
      scenario: args.scenario || null,
      clipStartTs: args.clipStartTs,
      clipEndTs: args.clipEndTs,
    }),
  );

  const barMap = new Map<
    number,
    { ts_open: number; date: string; return_pct: number; gross_exposure: number }
  >();
  const trades = symbolResults.flatMap((row) => row.trades).sort((a, b) => a.entry_ts - b.entry_ts);
  for (const result of symbolResults) {
    for (const row of result.barReturns) {
      const current = barMap.get(row.ts_open) || {
        ts_open: row.ts_open,
        date: row.date,
        return_pct: 0,
        gross_exposure: 0,
      };
      current.return_pct += row.return_pct;
      current.gross_exposure += row.gross_exposure;
      barMap.set(row.ts_open, current);
    }
  }

  const barReturns = Array.from(barMap.values())
    .sort((a, b) => a.ts_open - b.ts_open)
    .map((row) => ({
      ...row,
      return_pct: round(row.return_pct, 8),
      gross_exposure: round(row.gross_exposure, 6),
    }));
  const dailyReturns = aggregateDailyReturns(barReturns);
  const barsPerYear = BARS_PER_YEAR[args.config.execution_timeframe];
  const metrics = computeMetrics(
    barReturns.map((row) => row.return_pct),
    barsPerYear,
  );

  return {
    market: args.market,
    timeframe: args.config.execution_timeframe,
    strategy_styles: [args.config.style],
    bars_per_year: barsPerYear,
    config: args.config,
    metrics,
    trades,
    bar_returns: barReturns,
    daily_returns: dailyReturns,
    data_lineage: args.dataLineage,
    realism_profile: resolveExecutionRealismProfile({ mode: 'paper' }),
    diagnostics: {
      future_leak_violations: symbolResults.reduce((sum, row) => sum + row.futureLeakViolations, 0),
      average_holding_bars: round(mean(trades.map((trade) => trade.holding_bars)), 4),
      average_trade_weight: round(mean(trades.map((trade) => trade.weight)), 6),
      trade_count: trades.length,
      turnover_proxy: round(
        trades.reduce((sum, trade) => sum + trade.weight * 2, 0),
        6,
      ),
    },
  };
}

function combineStrategyBacktests(args: {
  market: Market;
  dataLineage: SymbolLineage[];
  memberBacktests: MarketBacktestResult[];
  primaryConfig: StrategyConfig;
  marketPlan: Map<number, MarketPlanPoint>;
}): MarketBacktestResult {
  const byStyle = new Map<StrategyStyle, MarketBacktestResult[]>();
  const tsSet = new Set<number>();
  for (const backtest of args.memberBacktests) {
    const rows = byStyle.get(backtest.config.style) || [];
    rows.push(backtest);
    byStyle.set(backtest.config.style, rows);
    for (const row of backtest.bar_returns) tsSet.add(row.ts_open);
  }

  const sortedTs = Array.from(tsSet.values()).sort((a, b) => a - b);
  const memberRowMaps = new Map<string, Map<number, BarReturnRow>>();
  for (const backtest of args.memberBacktests) {
    memberRowMaps.set(
      backtest.config.config_id,
      new Map(backtest.bar_returns.map((row) => [row.ts_open, row])),
    );
  }

  const styleScaleStats = new Map<StrategyStyle, { total: number; count: number }>();
  const combinedRows: BarReturnRow[] = [];

  for (const tsOpen of sortedTs) {
    const marketPoint =
      args.marketPlan.get(tsOpen) ||
      ({
        ts_open: tsOpen,
        regime: 'range',
        gross_target: args.market === 'US' ? 0.6 : 0.68,
        style_weights: normalizeWeights({
          trend_breakout: 0.34,
          trend_pullback: 0.33,
          mean_reversion: 0.33,
        }),
      } satisfies MarketPlanPoint);

    const activeMembers = args.memberBacktests
      .map((backtest) => ({
        backtest,
        row: memberRowMaps.get(backtest.config.config_id)?.get(tsOpen) || null,
      }))
      .filter((item) => item.row && Math.abs(item.row.return_pct) > 0);
    if (!activeMembers.length) continue;

    const activeWeightSum =
      activeMembers.reduce(
        (sum, item) => sum + safeNumber(marketPoint.style_weights[item.backtest.config.style], 0),
        0,
      ) || 1;

    let grossExposure = 0;
    let combinedReturn = 0;
    for (const item of activeMembers) {
      const styleWeight = safeNumber(marketPoint.style_weights[item.backtest.config.style], 0);
      const targetBudget = marketPoint.gross_target * (styleWeight / activeWeightSum);
      const scale = clamp(
        targetBudget / Math.max(safeNumber(item.row?.gross_exposure, 0), 1e-6),
        0,
        item.backtest.config.style === 'mean_reversion' ? 1.15 : 1.35,
      );
      combinedReturn += safeNumber(item.row?.return_pct, 0) * scale;
      grossExposure += safeNumber(item.row?.gross_exposure, 0) * scale;
      const stat = styleScaleStats.get(item.backtest.config.style) || { total: 0, count: 0 };
      stat.total += scale;
      stat.count += 1;
      styleScaleStats.set(item.backtest.config.style, stat);
    }

    if (grossExposure > marketPoint.gross_target && grossExposure > 0) {
      const rebalance = marketPoint.gross_target / grossExposure;
      combinedReturn *= rebalance;
      grossExposure *= rebalance;
    }

    combinedRows.push({
      ts_open: tsOpen,
      date: toDateKey(tsOpen),
      return_pct: round(combinedReturn, 8),
      gross_exposure: round(grossExposure, 6),
    });
  }

  const adjustedTrades = args.memberBacktests
    .flatMap((backtest) => {
      const scaleStat = styleScaleStats.get(backtest.config.style);
      const avgScale =
        scaleStat && scaleStat.count > 0 ? clamp(scaleStat.total / scaleStat.count, 0.4, 1.35) : 1;
      return backtest.trades.map((trade) => ({
        ...trade,
        weight: round(trade.weight * avgScale, 6),
      }));
    })
    .sort((a, b) => a.entry_ts - b.entry_ts);

  const dailyReturns = aggregateDailyReturns(combinedRows);
  const barsPerYear = BARS_PER_YEAR[args.primaryConfig.execution_timeframe];
  const metrics = computeMetrics(
    combinedRows.map((row) => row.return_pct),
    barsPerYear,
  );

  return {
    market: args.market,
    timeframe: args.primaryConfig.execution_timeframe,
    strategy_styles: [...new Set(args.memberBacktests.map((row) => row.config.style))],
    bars_per_year: barsPerYear,
    config: args.primaryConfig,
    metrics,
    trades: adjustedTrades,
    bar_returns: combinedRows,
    daily_returns: dailyReturns,
    data_lineage: args.dataLineage,
    realism_profile: resolveExecutionRealismProfile({ mode: 'paper' }),
    diagnostics: {
      future_leak_violations: args.memberBacktests.reduce(
        (sum, row) => sum + row.diagnostics.future_leak_violations,
        0,
      ),
      average_holding_bars: round(mean(adjustedTrades.map((trade) => trade.holding_bars)), 4),
      average_trade_weight: round(mean(adjustedTrades.map((trade) => trade.weight)), 6),
      trade_count: adjustedTrades.length,
      turnover_proxy: round(
        adjustedTrades.reduce((sum, trade) => sum + trade.weight * 2, 0),
        6,
      ),
    },
  };
}

function weakEvidence(metrics: BacktestMetrics, tradeCount: number): boolean {
  return tradeCount < 6 || metrics.sample_size < 60;
}

function selectionScore(
  metrics: BacktestMetrics,
  tradeCount: number,
  config: StrategyConfig,
): number {
  const safetyQualified =
    metrics.sharpe >= TARGET_METRICS.sharpe_min &&
    metrics.max_drawdown <= TARGET_METRICS.max_drawdown_max;
  const annualPenalty =
    metrics.annual_return < TARGET_METRICS.annual_return_min
      ? (TARGET_METRICS.annual_return_min - metrics.annual_return) * 10
      : 0;
  const ddPenalty =
    metrics.max_drawdown > TARGET_METRICS.max_drawdown_max
      ? (metrics.max_drawdown - TARGET_METRICS.max_drawdown_max) * 28
      : 0;
  const sharpePenalty =
    metrics.sharpe < TARGET_METRICS.sharpe_min
      ? (TARGET_METRICS.sharpe_min - metrics.sharpe) * 3
      : 0;
  const crowdingPenalty = Math.max(0, tradeCount - 60) * 0.015;
  const evidencePenalty = weakEvidence(metrics, tradeCount) ? 6 : 0;
  const qualityBonus =
    clamp(metrics.profit_factor - 1, 0, 1.8) * 0.45 +
    clamp(metrics.win_rate - 0.46, 0, 0.2) * 1.6 +
    clamp(Math.min(tradeCount, 40) / 40, 0, 1) * 0.2;
  return round(
    metrics.sharpe * (safetyQualified ? 1.95 : 2.35) +
      metrics.annual_return * (safetyQualified ? 11.5 : 8) -
      metrics.max_drawdown * 12 -
      annualPenalty -
      ddPenalty -
      sharpePenalty -
      evidencePenalty -
      crowdingPenalty +
      qualityBonus +
      config.tightness_score * 0.06,
    6,
  );
}

function targetViolations(metrics: BacktestMetrics, tradeCount: number): number {
  return (
    (metrics.sharpe < TARGET_METRICS.sharpe_min ? 1 : 0) +
    (metrics.max_drawdown > TARGET_METRICS.max_drawdown_max ? 1 : 0) +
    (metrics.annual_return < TARGET_METRICS.annual_return_min ? 1 : 0) +
    (weakEvidence(metrics, tradeCount) ? 1 : 0)
  );
}

function bundleSelectionScore(args: {
  metrics: BacktestMetrics;
  tradeCount: number;
  configs: StrategyConfig[];
}): number {
  const base = selectionScore(args.metrics, args.tradeCount, args.configs[0]);
  const styleBonus = new Set(args.configs.map((row) => row.style)).size * 0.28;
  const utilizationBonus =
    clamp(args.metrics.profit_factor - 1, 0, 1.5) * 0.45 +
    clamp(Math.min(args.tradeCount, 72) / 72, 0, 1) * 0.35;
  const annualLiftBonus =
    args.metrics.sharpe >= TARGET_METRICS.sharpe_min &&
    args.metrics.max_drawdown <= TARGET_METRICS.max_drawdown_max
      ? args.metrics.annual_return * 5.5
      : args.metrics.annual_return * 2.5;
  return round(base + styleBonus + utilizationBonus + annualLiftBonus, 6);
}

function evaluateGrid(args: {
  market: Market;
  symbolBars: Record<string, NumericBar[]>;
  dataLineage: SymbolLineage[];
  configs: StrategyConfig[];
  clipStartTs?: number;
  clipEndTs?: number;
  rotationScoresBySymbol: Map<string, Map<number, number>>;
  marketPlan: Map<number, MarketPlanPoint>;
}): { results: GridResult[]; backtests: Map<string, MarketBacktestResult> } {
  const backtests = new Map<string, MarketBacktestResult>();
  const results = args.configs.map((config) => {
    const backtest = runMarketBacktest({
      market: args.market,
      symbolBars: args.symbolBars,
      config,
      dataLineage: args.dataLineage,
      rotationScoresBySymbol: args.rotationScoresBySymbol,
      marketPlan: args.marketPlan,
      clipStartTs: args.clipStartTs,
      clipEndTs: args.clipEndTs,
    });
    backtests.set(config.config_id, backtest);
    const metrics = backtest.metrics;
    return {
      config,
      metrics,
      trade_count: backtest.trades.length,
      average_holding_bars: backtest.diagnostics.average_holding_bars,
      target_violations: targetViolations(metrics, backtest.trades.length),
      selection_score: selectionScore(metrics, backtest.trades.length, config),
    };
  });

  for (const row of results) {
    const neighbors = results.filter(
      (peer) =>
        peer.config.style === row.config.style &&
        peer.config.config_id !== row.config.config_id &&
        Math.abs(peer.config.breakout_lookback - row.config.breakout_lookback) <= 12,
    );
    if (!neighbors.length) continue;
    const neighborSharpe = mean(neighbors.map((peer) => peer.metrics.sharpe));
    const neighborAnnual = mean(neighbors.map((peer) => peer.metrics.annual_return));
    const neighborScore = mean(neighbors.map((peer) => peer.selection_score));
    const isolatePenalty = Math.max(0, row.selection_score - neighborScore - 1.2) * 0.6;
    const stabilityLift =
      clamp(neighborSharpe, -1, 2) * 0.18 + clamp(neighborAnnual, -0.1, 0.2) * 1.2;
    row.selection_score = round(row.selection_score + stabilityLift - isolatePenalty, 6);
  }

  results.sort((a, b) => {
    if (a.target_violations !== b.target_violations)
      return a.target_violations - b.target_violations;
    if (a.selection_score !== b.selection_score) return b.selection_score - a.selection_score;
    if (a.trade_count !== b.trade_count) return b.trade_count - a.trade_count;
    if (a.metrics.max_drawdown !== b.metrics.max_drawdown)
      return a.metrics.max_drawdown - b.metrics.max_drawdown;
    if (a.metrics.sharpe !== b.metrics.sharpe) return b.metrics.sharpe - a.metrics.sharpe;
    return a.config.tightness_score - b.config.tightness_score;
  });
  return { results, backtests };
}

function evaluateBundles(args: {
  market: Market;
  dataLineage: SymbolLineage[];
  results: GridResult[];
  backtests: Map<string, MarketBacktestResult>;
  marketPlan: Map<number, MarketPlanPoint>;
}): BundleEvaluationResult[] {
  const rowsByStyle = (style: StrategyStyle) =>
    args.results.filter((row) => row.config.style === style);
  const tradableRowsByStyle = (style: StrategyStyle) => {
    const rows = rowsByStyle(style);
    const tradable = rows.filter(
      (row) =>
        row.trade_count >= 3 &&
        row.metrics.annual_return > -0.01 &&
        row.metrics.sharpe > 0.2 &&
        row.metrics.max_drawdown <= 0.12,
    );
    return tradable.slice(0, 3);
  };

  const breakoutRows = tradableRowsByStyle('trend_breakout');
  const pullbackRows = tradableRowsByStyle('trend_pullback');
  const meanRevRows = tradableRowsByStyle('mean_reversion');
  const usableMeanRevRows = meanRevRows.filter(
    (row) => row.trade_count > 0 && row.metrics.annual_return > 0 && row.metrics.sharpe > 0.7,
  );
  const candidateSets: StrategyConfig[][] = [];

  for (const row of args.results.slice(0, 4)) candidateSets.push([row.config]);
  if (breakoutRows[0] && breakoutRows[1])
    candidateSets.push([breakoutRows[0].config, breakoutRows[1].config]);
  if (breakoutRows[0] && pullbackRows[0])
    candidateSets.push([breakoutRows[0].config, pullbackRows[0].config]);
  if (breakoutRows[0] && pullbackRows[1])
    candidateSets.push([breakoutRows[0].config, pullbackRows[1].config]);
  if (breakoutRows[1] && pullbackRows[0])
    candidateSets.push([breakoutRows[1].config, pullbackRows[0].config]);
  if (breakoutRows[0] && breakoutRows[1] && pullbackRows[0]) {
    candidateSets.push([breakoutRows[0].config, breakoutRows[1].config, pullbackRows[0].config]);
  }
  if (breakoutRows[0] && usableMeanRevRows[0])
    candidateSets.push([breakoutRows[0].config, usableMeanRevRows[0].config]);
  if (pullbackRows[0] && usableMeanRevRows[0])
    candidateSets.push([pullbackRows[0].config, usableMeanRevRows[0].config]);
  if (breakoutRows[0] && pullbackRows[0] && usableMeanRevRows[0]) {
    candidateSets.push([
      breakoutRows[0].config,
      pullbackRows[0].config,
      usableMeanRevRows[0].config,
    ]);
  }
  if (breakoutRows[1] && pullbackRows[0] && usableMeanRevRows[0]) {
    candidateSets.push([
      breakoutRows[1].config,
      pullbackRows[0].config,
      usableMeanRevRows[0].config,
    ]);
  }

  const seen = new Set<string>();
  const bundles = candidateSets
    .map((configs) => configs.sort((a, b) => a.config_id.localeCompare(b.config_id)))
    .filter((configs) => {
      const key = configs.map((row) => row.config_id).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((configs) => {
      const memberBacktests = configs
        .map((config) => args.backtests.get(config.config_id))
        .filter((row): row is MarketBacktestResult => Boolean(row));
      const primaryConfig =
        configs.find((row) => row.style === 'trend_breakout') ||
        configs.find((row) => row.style === 'trend_pullback') ||
        configs[0];
      const combined =
        memberBacktests.length === 1
          ? memberBacktests[0]
          : combineStrategyBacktests({
              market: args.market,
              dataLineage: args.dataLineage,
              memberBacktests,
              primaryConfig,
              marketPlan: args.marketPlan,
            });

      return {
        bundle_id: configs.map((row) => row.config_id).join('+'),
        styles: [...new Set(configs.map((row) => row.style))],
        member_config_ids: configs.map((row) => row.config_id),
        primary_config: primaryConfig,
        backtest: combined,
        target_violations: targetViolations(combined.metrics, combined.trades.length),
        selection_score: bundleSelectionScore({
          metrics: combined.metrics,
          tradeCount: combined.trades.length,
          configs,
        }),
      };
    });

  bundles.sort((a, b) => {
    if (a.target_violations !== b.target_violations)
      return a.target_violations - b.target_violations;
    if (a.selection_score !== b.selection_score) return b.selection_score - a.selection_score;
    if (a.backtest.metrics.max_drawdown !== b.backtest.metrics.max_drawdown)
      return a.backtest.metrics.max_drawdown - b.backtest.metrics.max_drawdown;
    return b.backtest.metrics.annual_return - a.backtest.metrics.annual_return;
  });

  return bundles;
}

function evaluateStrategyUniverse(args: {
  market: Market;
  symbolBars: Record<string, NumericBar[]>;
  dataLineage: SymbolLineage[];
  configs: StrategyConfig[];
  clipStartTs?: number;
  clipEndTs?: number;
}): {
  results: GridResult[];
  backtests: Map<string, MarketBacktestResult>;
  bundleResults: BundleEvaluationResult[];
  selectedBundle: BundleEvaluationResult;
  marketPlan: Map<number, MarketPlanPoint>;
} {
  const rotationScoresBySymbol = buildRotationScores(
    args.symbolBars,
    Math.max(...args.configs.map((config) => config.rotation_lookback)),
  );
  const marketPlan = buildMarketPlan(args.market, buildMarketCompositeBars(args.symbolBars));
  const evaluated = evaluateGrid({
    market: args.market,
    symbolBars: args.symbolBars,
    dataLineage: args.dataLineage,
    configs: args.configs,
    clipStartTs: args.clipStartTs,
    clipEndTs: args.clipEndTs,
    rotationScoresBySymbol,
    marketPlan,
  });
  const bundleResults = evaluateBundles({
    market: args.market,
    dataLineage: args.dataLineage,
    results: evaluated.results,
    backtests: evaluated.backtests,
    marketPlan,
  });

  return {
    results: evaluated.results,
    backtests: evaluated.backtests,
    bundleResults,
    selectedBundle: bundleResults[0],
    marketPlan,
  };
}

function minCommonBarCount(symbolBars: Record<string, NumericBar[]>): number {
  const counts = Object.values(symbolBars).map((bars) => bars.length);
  return counts.length ? Math.min(...counts) : 0;
}

function sliceSymbolBars(
  symbolBars: Record<string, NumericBar[]>,
  startIndex: number,
  endIndex: number,
): Record<string, NumericBar[]> {
  const out: Record<string, NumericBar[]> = {};
  for (const [symbol, bars] of Object.entries(symbolBars)) {
    const start = Math.max(0, Math.min(startIndex, bars.length));
    const end = Math.max(start, Math.min(endIndex, bars.length));
    const sliced = bars.slice(start, end);
    if (sliced.length > 20) out[symbol] = sliced;
  }
  return out;
}

function splitValidation(args: {
  market: Market;
  symbolBars: Record<string, NumericBar[]>;
  dataLineage: SymbolLineage[];
  configs: StrategyConfig[];
}): ValidationSplitSummary | null {
  const common = minCommonBarCount(args.symbolBars);
  if (common < 260) return null;
  const warmup = Math.max(...args.configs.map((config) => configWarmup(config)));
  const split = Math.max(warmup + 30, Math.floor(common * 0.65));
  const trainBars = sliceSymbolBars(args.symbolBars, 0, split);
  const testBars = sliceSymbolBars(args.symbolBars, Math.max(0, split - warmup), common);
  if (!Object.keys(trainBars).length || !Object.keys(testBars).length) return null;

  const trainEval = evaluateStrategyUniverse({
    market: args.market,
    symbolBars: trainBars,
    dataLineage: args.dataLineage,
    configs: args.configs,
  });
  const selected = trainEval.selectedBundle;
  const bundleWarmup = Math.max(
    ...selected.member_config_ids.map((configId) => {
      const config = args.configs.find((row) => row.config_id === configId);
      return config ? configWarmup(config) : warmup;
    }),
  );
  const firstSymbol = Object.keys(testBars)[0];
  const testStartTs =
    testBars[firstSymbol]?.[bundleWarmup]?.ts_open ?? testBars[firstSymbol]?.[0]?.ts_open ?? null;
  const testEval = evaluateStrategyUniverse({
    market: args.market,
    symbolBars: testBars,
    dataLineage: args.dataLineage,
    configs: args.configs.filter((config) => selected.member_config_ids.includes(config.config_id)),
    clipStartTs: testStartTs ?? undefined,
  });
  const testBacktest = testEval.selectedBundle.backtest;

  const trainFirstBars = trainBars[Object.keys(trainBars)[0]] || [];
  const testFirstBars = testBars[firstSymbol] || [];
  return {
    train_start: trainFirstBars[0]?.ts_open ?? null,
    train_end: trainFirstBars[trainFirstBars.length - 1]?.ts_open ?? null,
    test_start: testStartTs,
    test_end: testFirstBars[testFirstBars.length - 1]?.ts_open ?? null,
    selected_config_id: selected.bundle_id,
    train_metrics: selected.backtest.metrics,
    test_metrics: testBacktest.metrics,
    target_violations_test: targetViolations(testBacktest.metrics, testBacktest.trades.length),
  };
}

function walkForward(args: {
  market: Market;
  symbolBars: Record<string, NumericBar[]>;
  dataLineage: SymbolLineage[];
  configs: StrategyConfig[];
}): {
  windows: WalkForwardWindowSummary[];
  out_of_sample_summary: BacktestMetrics | null;
} {
  const common = minCommonBarCount(args.symbolBars);
  const warmup = Math.max(...args.configs.map((config) => configWarmup(config)));
  const trainSize = Math.max(warmup + 50, Math.floor(common * 0.45));
  const testSize = Math.max(40, Math.floor(common * 0.16));
  const windows: WalkForwardWindowSummary[] = [];
  const oosReturns: number[] = [];
  let start = 0;

  while (start + trainSize + testSize <= common && windows.length < 4) {
    const trainEnd = start + trainSize;
    const testEnd = trainEnd + testSize;
    const trainBars = sliceSymbolBars(args.symbolBars, start, trainEnd);
    const evalSlice = sliceSymbolBars(args.symbolBars, Math.max(0, trainEnd - warmup), testEnd);
    if (!Object.keys(trainBars).length || !Object.keys(evalSlice).length) break;

    const trainEval = evaluateStrategyUniverse({
      market: args.market,
      symbolBars: trainBars,
      dataLineage: args.dataLineage,
      configs: args.configs,
    });
    const selected = trainEval.selectedBundle;
    const bundleWarmup = Math.max(
      ...selected.member_config_ids.map((configId) => {
        const config = args.configs.find((row) => row.config_id === configId);
        return config ? configWarmup(config) : warmup;
      }),
    );
    const firstSymbol = Object.keys(evalSlice)[0];
    const clipStartTs =
      evalSlice[firstSymbol]?.[bundleWarmup]?.ts_open ?? evalSlice[firstSymbol]?.[0]?.ts_open;
    const testEval = evaluateStrategyUniverse({
      market: args.market,
      symbolBars: evalSlice,
      dataLineage: args.dataLineage,
      configs: args.configs.filter((config) =>
        selected.member_config_ids.includes(config.config_id),
      ),
      clipStartTs,
    });
    const testBacktest = testEval.selectedBundle.backtest;
    oosReturns.push(...testBacktest.bar_returns.map((row) => row.return_pct));
    const trainFirst = trainBars[Object.keys(trainBars)[0]] || [];
    const testFirst = evalSlice[firstSymbol] || [];
    windows.push({
      window_id: `wf-${windows.length + 1}`,
      train_start: trainFirst[0]?.ts_open ?? null,
      train_end: trainFirst[trainFirst.length - 1]?.ts_open ?? null,
      test_start: clipStartTs ?? null,
      test_end: testFirst[testFirst.length - 1]?.ts_open ?? null,
      selected_config_id: selected.bundle_id,
      train_metrics: selected.backtest.metrics,
      test_metrics: testBacktest.metrics,
    });
    start += testSize;
  }

  return {
    windows,
    out_of_sample_summary: oosReturns.length
      ? computeMetrics(oosReturns, args.market === 'US' ? BARS_PER_YEAR['1d'] : BARS_PER_YEAR['4h'])
      : null,
  };
}

function buildMonteCarlo(backtest: MarketBacktestResult): MonteCarloSummary {
  const returns = backtest.bar_returns.map((row) => row.return_pct);
  if (returns.length < 20) {
    return {
      simulations: 0,
      median_annual_return: 0,
      p10_annual_return: 0,
      p50_sharpe: 0,
      p10_sharpe: 0,
      p90_max_drawdown: 0,
      target_pass_rate: 0,
    };
  }

  const rand = makeSeededRandom(returns.length + backtest.trades.length + 17);
  const annuals: number[] = [];
  const sharpes: number[] = [];
  const drawdowns: number[] = [];
  let passCount = 0;
  const simulations = 120;

  for (let run = 0; run < simulations; run += 1) {
    const simulated: number[] = [];
    for (let i = 0; i < returns.length; i += 1) {
      const sample = returns[Math.floor(rand() * returns.length)];
      const slippageShock = Math.abs(rand() - rand()) * 0.0012;
      simulated.push(sample - slippageShock);
    }
    const metrics = computeMetrics(simulated, backtest.bars_per_year);
    annuals.push(metrics.annual_return);
    sharpes.push(metrics.sharpe);
    drawdowns.push(metrics.max_drawdown);
    if (targetViolations(metrics, backtest.trades.length) === 0) passCount += 1;
  }

  return {
    simulations,
    median_annual_return: round(quantile(annuals, 0.5), 6),
    p10_annual_return: round(quantile(annuals, 0.1), 6),
    p50_sharpe: round(quantile(sharpes, 0.5), 4),
    p10_sharpe: round(quantile(sharpes, 0.1), 4),
    p90_max_drawdown: round(quantile(drawdowns, 0.9), 6),
    target_pass_rate: round(passCount / simulations, 4),
  };
}

function buildScenarioSensitivity(args: {
  market: Market;
  symbolBars: Record<string, NumericBar[]>;
  dataLineage: SymbolLineage[];
  memberConfigs: StrategyConfig[];
}): Array<{ scenario_id: string; label: string; metrics: BacktestMetrics }> {
  const profile = resolveExecutionRealismProfile({ mode: 'paper' });
  const extraScenarios = [
    {
      scenario_id: 'signal_delay_1bar',
      label: 'Signal delay +1 bar',
      slippage_multiplier: 1,
      spread_multiplier: 1,
      funding_multiplier: 1,
      signal_delay_bars: 1,
    },
    {
      scenario_id: 'adverse_price_shift_10bps',
      label: 'Adverse entry/exit price shift +10 bps',
      slippage_multiplier: 1,
      spread_multiplier: 1,
      funding_multiplier: 1,
      entry_price_offset_bps: 10,
      exit_price_offset_bps: 10,
    },
    {
      scenario_id: 'delay_and_cost_combo',
      label: '1 bar delay + wider spread + more slippage',
      slippage_multiplier: 1.25,
      spread_multiplier: 1.35,
      funding_multiplier: 1,
      signal_delay_bars: 1,
      entry_price_offset_bps: 8,
      exit_price_offset_bps: 8,
    },
  ];
  return [...buildExecutionSensitivityScenarios(profile), ...extraScenarios]
    .filter((scenario: Record<string, unknown>) => !scenario.test_only)
    .map((scenario: Record<string, unknown>) => {
      const stressed = runFixedBundleBacktest({
        market: args.market,
        symbolBars: args.symbolBars,
        dataLineage: args.dataLineage,
        memberConfigs: args.memberConfigs,
        primaryConfig: args.memberConfigs[0],
        scenario,
      }).backtest;
      return {
        scenario_id: String(scenario.scenario_id || 'baseline'),
        label: String(scenario.label || scenario.scenario_id || 'scenario'),
        metrics: stressed.metrics,
      };
    });
}

function buildStabilitySummary(results: GridResult[]) {
  const sharpes = results.map((row) => row.metrics.sharpe);
  const annuals = results.map((row) => row.metrics.annual_return);
  const drawdowns = results.map((row) => row.metrics.max_drawdown);
  const passCount = results.filter((row) => row.target_violations === 0).length;
  return {
    configs_tested: results.length,
    configs_meeting_targets: passCount,
    median_sharpe: round(quantile(sharpes, 0.5), 4),
    median_annual_return: round(quantile(annuals, 0.5), 6),
    median_max_drawdown: round(quantile(drawdowns, 0.5), 6),
    fragile: passCount <= 1,
  };
}

function buildRobustParameterIntervals(results: GridResult[]): ParameterIntervalSummary[] {
  const tradable = results.filter((row) => row.trade_count > 0);
  if (!tradable.length) return [];
  const topScore = tradable[0]?.selection_score ?? 0;
  const cohort = tradable.filter(
    (row) =>
      row.selection_score >= topScore - 4 &&
      row.metrics.max_drawdown <= 0.12 &&
      row.metrics.sharpe >= 0.5,
  );
  const stable = (
    cohort.length >= 2 ? cohort : tradable.slice(0, Math.min(3, tradable.length))
  ).sort((a, b) => b.selection_score - a.selection_score);
  return CORE_ROBUST_PARAMETER_FIELDS.map((field) => {
    const values = [...new Set(stable.map((row) => safeNumber(row.config[field], 0)))].sort(
      (a, b) => a - b,
    );
    return {
      parameter: field,
      min: values[0] ?? 0,
      max: values[values.length - 1] ?? 0,
      values,
      supporting_config_ids: stable.map((row) => row.config.config_id),
    };
  }).filter((row) => row.values.length > 0);
}

function buildParameterHeatmap(results: GridResult[]): ParameterHeatmapSummary {
  const cells = results.map((row) => ({
    config_id: row.config.config_id,
    style: row.config.style,
    x_value: row.config.breakout_lookback,
    y_value: row.config.stop_atr,
    annual_return: row.metrics.annual_return,
    sharpe: row.metrics.sharpe,
    max_drawdown: row.metrics.max_drawdown,
    trade_count: row.trade_count,
    stable:
      row.metrics.sharpe >= 0.8 &&
      row.metrics.annual_return >= 0 &&
      row.metrics.max_drawdown <= 0.1 &&
      row.trade_count >= 3,
  }));
  const stableCells = cells.filter((row) => row.stable);
  return {
    x_axis: 'breakout_lookback',
    y_axis: 'stop_atr',
    stable_cell_count: stableCells.length,
    total_cells: cells.length,
    stable_zone: {
      x_min: stableCells.length ? Math.min(...stableCells.map((row) => row.x_value)) : null,
      x_max: stableCells.length ? Math.max(...stableCells.map((row) => row.x_value)) : null,
      y_min: stableCells.length ? Math.min(...stableCells.map((row) => row.y_value)) : null,
      y_max: stableCells.length ? Math.max(...stableCells.map((row) => row.y_value)) : null,
    },
    cells,
  };
}

function buildSplitAudit(args: {
  symbolBars: Record<string, NumericBar[]>;
  configs: StrategyConfig[];
}): SplitAuditSummary | null {
  const common = minCommonBarCount(args.symbolBars);
  if (!common) return null;
  const warmup = Math.max(...args.configs.map((config) => configWarmup(config)));
  const trainBars = Math.max(warmup + 30, Math.floor(common * 0.65));
  const testBars = Math.max(0, common - trainBars);
  const trainRatio = trainBars / common;
  const testRatio = testBars / common;
  const warmupRatio = warmup / common;
  const reasonable =
    trainRatio >= 0.55 && trainRatio <= 0.8 && testRatio >= 0.18 && warmupRatio <= 0.35;
  return {
    common_bars: common,
    warmup_bars: warmup,
    train_bars: trainBars,
    test_bars: testBars,
    train_ratio: round(trainRatio, 4),
    test_ratio: round(testRatio, 4),
    warmup_ratio: round(warmupRatio, 4),
    reasonable,
    note: reasonable
      ? 'Train/test split leaves a meaningful out-of-sample block after warmup.'
      : 'Train/test split is too short, too imbalanced, or warmup consumes too much history.',
  };
}

function runFixedBundleBacktest(args: {
  market: Market;
  symbolBars: Record<string, NumericBar[]>;
  dataLineage: SymbolLineage[];
  memberConfigs: StrategyConfig[];
  primaryConfig: StrategyConfig;
  scenario?: Record<string, unknown> | null;
}): { backtest: MarketBacktestResult; marketPlan: Map<number, MarketPlanPoint> } {
  const rotationScoresBySymbol = buildRotationScores(
    args.symbolBars,
    Math.max(...args.memberConfigs.map((config) => config.rotation_lookback)),
  );
  const marketPlan = buildMarketPlan(args.market, buildMarketCompositeBars(args.symbolBars));
  const memberBacktests = args.memberConfigs.map((config) =>
    runMarketBacktest({
      market: args.market,
      symbolBars: args.symbolBars,
      config,
      dataLineage: args.dataLineage,
      rotationScoresBySymbol,
      marketPlan,
      scenario: args.scenario || null,
    }),
  );
  const backtest =
    memberBacktests.length === 1
      ? memberBacktests[0]
      : combineStrategyBacktests({
          market: args.market,
          dataLineage: args.dataLineage,
          memberBacktests,
          primaryConfig: args.primaryConfig,
          marketPlan,
        });
  return { backtest, marketPlan };
}

function buildCrossAssetValidation(args: {
  market: Market;
  symbolBars: Record<string, NumericBar[]>;
  dataLineage: SymbolLineage[];
  memberConfigs: StrategyConfig[];
  primaryConfig: StrategyConfig;
}): CrossAssetValidationRow[] {
  return Object.entries(args.symbolBars)
    .map(([symbol, bars]) => {
      const subsetLineage = args.dataLineage.filter((row) => row.symbol === symbol);
      const { backtest } = runFixedBundleBacktest({
        market: args.market,
        symbolBars: { [symbol]: bars },
        dataLineage: subsetLineage,
        memberConfigs: args.memberConfigs,
        primaryConfig: args.primaryConfig,
      });
      return {
        symbol,
        metrics: backtest.metrics,
        trade_count: backtest.trades.length,
        passed:
          backtest.metrics.max_drawdown <= 0.12 &&
          backtest.trades.length >= 1 &&
          backtest.metrics.annual_return >= 0 &&
          backtest.metrics.sharpe >= 0,
      };
    })
    .sort((a, b) => b.metrics.annual_return - a.metrics.annual_return);
}

function buildRegimeValidation(args: {
  backtest: MarketBacktestResult;
  marketPlan: Map<number, MarketPlanPoint>;
}): {
  rows: RegimeValidationRow[];
  dependency: OverfitAuditSummary['regime_dependency'];
} {
  const returnsByRegime = new Map<MarketRegime, number[]>();
  const positivePnlByRegime = new Map<MarketRegime, number>();
  const tradeCountByRegime = new Map<MarketRegime, number>();

  for (const row of args.backtest.bar_returns) {
    const regime = args.marketPlan.get(row.ts_open)?.regime || 'range';
    const list = returnsByRegime.get(regime) || [];
    list.push(row.return_pct);
    returnsByRegime.set(regime, list);
    if (row.return_pct > 0) {
      positivePnlByRegime.set(regime, (positivePnlByRegime.get(regime) || 0) + row.return_pct);
    }
  }

  for (const trade of args.backtest.trades) {
    const regime = args.marketPlan.get(trade.signal_ts)?.regime || 'range';
    tradeCountByRegime.set(regime, (tradeCountByRegime.get(regime) || 0) + 1);
  }

  const totalTrades = Math.max(1, args.backtest.trades.length);
  const positiveTotal = Math.max(
    1e-9,
    Array.from(positivePnlByRegime.values()).reduce((sum, value) => sum + value, 0),
  );
  const rows: RegimeValidationRow[] = (['trend', 'range', 'risk_off'] as MarketRegime[]).map(
    (regime) => {
      const returns = returnsByRegime.get(regime) || [];
      return {
        regime,
        metrics: computeMetrics(returns, args.backtest.bars_per_year),
        trade_count: tradeCountByRegime.get(regime) || 0,
        trade_share: round((tradeCountByRegime.get(regime) || 0) / totalTrades, 4),
        positive_pnl_share: round((positivePnlByRegime.get(regime) || 0) / positiveTotal, 4),
      };
    },
  );

  const dominant = [...rows].sort((a, b) => b.positive_pnl_share - a.positive_pnl_share)[0] || null;
  return {
    rows,
    dependency: {
      dominant_regime: dominant?.regime || null,
      positive_pnl_share: dominant?.positive_pnl_share || 0,
      overdependent: safeNumber(dominant?.positive_pnl_share, 0) >= 0.8,
    },
  };
}

function buildAnomalyCheck(backtest: MarketBacktestResult): OverfitAuditSummary['anomaly_check'] {
  const returns = backtest.bar_returns.map((row) => row.return_pct);
  if (!returns.length) {
    return {
      suspicious: false,
      equity_smoothness: 0,
      explanation: 'No returns available for smoothness audit.',
    };
  }
  const absReturns = returns.map((value) => Math.abs(value)).sort((a, b) => a - b);
  const p50 = quantile(absReturns, 0.5);
  const p95 = quantile(absReturns, 0.95);
  const smoothness = round(1 - p50 / Math.max(p95, 1e-9), 4);
  const suspicious =
    backtest.metrics.sharpe >= 3.5 &&
    backtest.metrics.max_drawdown <= 0.02 &&
    backtest.metrics.win_rate >= 0.72 &&
    smoothness >= 0.72;
  return {
    suspicious,
    equity_smoothness: smoothness,
    explanation: suspicious
      ? 'Return path is unusually smooth relative to Sharpe, win rate, and drawdown.'
      : 'Return path shows normal variation for a cost-aware mid-frequency strategy.',
  };
}

function buildOverfitAudit(args: {
  market: Market;
  configs: StrategyConfig[];
  results: GridResult[];
  selectedBundle: BundleEvaluationResult;
  symbolBars: Record<string, NumericBar[]>;
  dataLineage: SymbolLineage[];
  splitAudit: SplitAuditSummary | null;
  walkForward: {
    windows: WalkForwardWindowSummary[];
    out_of_sample_summary: BacktestMetrics | null;
  };
  scenarioSensitivity: Array<{
    scenario_id: string;
    label: string;
    metrics: BacktestMetrics;
  }>;
  marketPlan: Map<number, MarketPlanPoint>;
}): OverfitAuditSummary {
  const robustIntervals = buildRobustParameterIntervals(args.results);
  const heatmap = buildParameterHeatmap(args.results);
  const memberConfigs = args.configs.filter((config) =>
    args.selectedBundle.member_config_ids.includes(config.config_id),
  );
  const crossAsset = buildCrossAssetValidation({
    market: args.market,
    symbolBars: args.symbolBars,
    dataLineage: args.dataLineage,
    memberConfigs,
    primaryConfig: args.selectedBundle.primary_config,
  });
  const regimeValidation = buildRegimeValidation({
    backtest: args.selectedBundle.backtest,
    marketPlan: args.marketPlan,
  });
  const walkPassRate = args.walkForward.windows.length
    ? args.walkForward.windows.filter(
        (row) =>
          row.test_metrics.sharpe >= 0.8 &&
          row.test_metrics.max_drawdown <= 0.12 &&
          row.test_metrics.annual_return > -0.02,
      ).length / args.walkForward.windows.length
    : 0;
  const perturbationPassRate = args.scenarioSensitivity.length
    ? args.scenarioSensitivity.filter(
        (row) =>
          row.metrics.max_drawdown <= 0.12 &&
          row.metrics.sharpe >= 0.6 &&
          row.metrics.annual_return > -0.04,
      ).length / args.scenarioSensitivity.length
    : 0;
  const anomalyCheck = buildAnomalyCheck(args.selectedBundle.backtest);
  const riskFlags: string[] = [];
  const likelyHotspots: string[] = [];

  if ((args.results[0]?.trade_count || 0) <= 3) {
    riskFlags.push('Top-ranked config uses too few trades to trust without extra skepticism.');
    likelyHotspots.push(
      'Sparse trade count makes local history luck look more reliable than it is.',
    );
  }
  if (heatmap.stable_cell_count <= 1) {
    riskFlags.push(
      'Parameter heatmap has too few stable cells; performance may collapse after small retunes.',
    );
    likelyHotspots.push('Local optimum risk around breakout horizon and stop distance.');
  }
  if (
    crossAsset.filter((row) => row.passed).length < Math.max(2, Math.floor(crossAsset.length / 2))
  ) {
    riskFlags.push(
      'Cross-asset validation is narrow; strategy quality is not broad enough across symbols.',
    );
    likelyHotspots.push(
      'Alpha may depend on only a few symbols instead of a reusable market pattern.',
    );
  }
  if (regimeValidation.dependency.overdependent) {
    riskFlags.push('Strategy depends too heavily on one market regime.');
    likelyHotspots.push(
      `${regimeValidation.dependency.dominant_regime} regime contributes most positive PnL.`,
    );
  }
  if (walkPassRate < 0.5) {
    riskFlags.push('Walk-forward pass rate is too low; out-of-sample performance is unstable.');
    likelyHotspots.push('Rolling sample transfer is weak across adjacent time windows.');
  }
  if (perturbationPassRate < 0.6) {
    riskFlags.push(
      'Perturbation pass rate is too low; costs, delays, or price offsets change the story too much.',
    );
    likelyHotspots.push('Execution realism sensitivity remains elevated.');
  }
  if (args.splitAudit && !args.splitAudit.reasonable) {
    riskFlags.push('Training/test split is imbalanced or too short after warmup.');
    likelyHotspots.push(args.splitAudit.note);
  }
  if (anomalyCheck.suspicious) {
    riskFlags.push('Equity curve is unusually smooth relative to strategy frequency and costs.');
    likelyHotspots.push(anomalyCheck.explanation);
  }
  if (!riskFlags.length) {
    riskFlags.push(
      'No critical overfitting flag tripped, but promotion still requires OOS and stress agreement.',
    );
  }
  if (!likelyHotspots.length) {
    likelyHotspots.push(
      'No single hotspot dominates; remaining risk is spread across normal market transfer uncertainty.',
    );
  }

  return {
    risk_flags: riskFlags,
    likely_hotspots: likelyHotspots,
    declared_parameter_count: DECLARED_PARAMETER_FIELDS.length,
    effective_parameter_count: CORE_ROBUST_PARAMETER_FIELDS.length,
    parameter_budget_ok: CORE_ROBUST_PARAMETER_FIELDS.length <= 6,
    robust_parameter_intervals: robustIntervals,
    parameter_heatmap: heatmap,
    split_audit: args.splitAudit,
    rolling_oos_pass_rate: round(walkPassRate, 4),
    perturbation_pass_rate: round(perturbationPassRate, 4),
    cross_asset_validation: crossAsset,
    time_migration_validation: regimeValidation.rows,
    regime_dependency: regimeValidation.dependency,
    anomaly_check: anomalyCheck,
  };
}

function buildMarketPack(args: {
  market: Market;
  symbolBars: Record<string, NumericBar[]>;
  dataLineage: SymbolLineage[];
  riskProfile: RiskProfileKey;
}): MarketStrategyPack {
  const configs = buildConfigGrid(args.market, args.riskProfile);
  const evaluated = evaluateStrategyUniverse({
    market: args.market,
    symbolBars: args.symbolBars,
    dataLineage: args.dataLineage,
    configs,
  });
  const selected = evaluated.selectedBundle;
  const backtest = selected.backtest;
  const splitAudit = buildSplitAudit({
    symbolBars: args.symbolBars,
    configs,
  });
  const split = splitValidation({
    market: args.market,
    symbolBars: args.symbolBars,
    dataLineage: args.dataLineage,
    configs,
  });
  const wf = walkForward({
    market: args.market,
    symbolBars: args.symbolBars,
    dataLineage: args.dataLineage,
    configs,
  });
  const monteCarlo = buildMonteCarlo(backtest);
  const sensitivity = buildScenarioSensitivity({
    market: args.market,
    symbolBars: args.symbolBars,
    dataLineage: args.dataLineage,
    memberConfigs: configs.filter((config) =>
      selected.member_config_ids.includes(config.config_id),
    ),
  });
  const overfitAudit = buildOverfitAudit({
    market: args.market,
    configs,
    results: evaluated.results,
    selectedBundle: selected,
    symbolBars: args.symbolBars,
    dataLineage: args.dataLineage,
    splitAudit,
    walkForward: wf,
    scenarioSensitivity: sensitivity,
    marketPlan: evaluated.marketPlan,
  });

  return {
    market: args.market,
    strategy_id: args.market === 'US' ? 'NQ_US_MULTI_ALPHA_ROTATION' : 'NQ_CR_MULTI_ALPHA_ROTATION',
    strategy_family: 'Trend Breakout + Trend Pullback + Mean Reversion + Regime Rotation',
    timeframe: selected.primary_config.execution_timeframe,
    selected_config: selected.primary_config,
    selected_bundle: {
      bundle_id: selected.bundle_id,
      styles: selected.styles,
      member_config_ids: selected.member_config_ids,
    },
    grid_results: evaluated.results,
    bundle_results: evaluated.bundleResults.map((row) => ({
      bundle_id: row.bundle_id,
      styles: row.styles,
      metrics: row.backtest.metrics,
      trade_count: row.backtest.trades.length,
      target_violations: row.target_violations,
      selection_score: row.selection_score,
    })),
    stability_summary: buildStabilitySummary(evaluated.results),
    split_validation: split,
    walk_forward: wf,
    monte_carlo: monteCarlo,
    scenario_sensitivity: sensitivity,
    overfit_audit: overfitAudit,
    backtest,
  };
}

function combineDailySeries(packs: MarketStrategyPack[]): {
  capital_split: Record<string, number>;
  metrics: BacktestMetrics | null;
  daily_returns: DailyReturnRow[];
} {
  if (!packs.length) {
    return { capital_split: {}, metrics: null, daily_returns: [] };
  }

  const eligiblePacks = packs.filter(
    (pack) => pack.backtest.metrics.sharpe >= 1 || pack.backtest.metrics.annual_return >= 0.03,
  );
  const activeUniverse = eligiblePacks.length ? eligiblePacks : packs;
  const rowMaps = new Map<Market, Map<string, number>>();
  const weightSums = new Map<Market, number>();
  const weightCounts = new Map<Market, number>();
  const marketHistory = new Map<Market, number[]>();
  let cashWeightSum = 0;
  let cashWeightCount = 0;
  const dateSet = new Set<string>();

  for (const pack of activeUniverse) {
    rowMaps.set(
      pack.market,
      new Map(pack.backtest.daily_returns.map((row) => [row.date, row.return_pct])),
    );
    for (const row of pack.backtest.daily_returns) dateSet.add(row.date);
  }
  for (const pack of packs) {
    weightSums.set(pack.market, 0);
    weightCounts.set(pack.market, 0);
  }

  const dates = Array.from(dateSet.values()).sort((a, b) => a.localeCompare(b));
  const daily_returns: DailyReturnRow[] = [];

  for (const date of dates) {
    const activePacks = activeUniverse
      .map((pack) => ({
        pack,
        returnPct: rowMaps.get(pack.market)?.get(date),
      }))
      .filter((row) => row.returnPct !== undefined);
    if (!activePacks.length) continue;

    const rawWeights = activePacks.map(({ pack }) => {
      const history = marketHistory.get(pack.market) || [];
      const trailing = history.slice(-20);
      const momentum = trailing.reduce((sum, value) => sum + value, 0);
      const vol = stdDev(trailing.length >= 2 ? trailing : [0, 0.0001]);
      const baseQuality =
        0.32 +
        clamp(pack.backtest.metrics.profit_factor - 1, 0, 1.8) * 0.28 +
        clamp(pack.backtest.metrics.win_rate - 0.42, 0, 0.2) * 0.9;
      const sharpeFit = clamp(pack.backtest.metrics.sharpe / TARGET_METRICS.sharpe_min, 0.12, 2.5);
      const annualFit = clamp(
        pack.backtest.metrics.annual_return / Math.max(TARGET_METRICS.annual_return_min, 1e-6),
        0.03,
        2.6,
      );
      const drawdownFit = clamp(
        (TARGET_METRICS.max_drawdown_max - pack.backtest.metrics.max_drawdown) /
          Math.max(TARGET_METRICS.max_drawdown_max, 1e-6),
        0.18,
        1.15,
      );
      const targetFit = Math.pow(sharpeFit, 1.08) * Math.pow(annualFit, 1.55) * drawdownFit;
      const eligibilityHaircut =
        pack.backtest.metrics.sharpe >= 1 && pack.backtest.metrics.annual_return >= 0.03
          ? 1
          : pack.backtest.metrics.sharpe >= 0.8 && pack.backtest.metrics.annual_return >= 0.01
            ? 0.18
            : 0.05;
      const momentumBoost = clamp(
        0.88 + Math.max(0, momentum) * 7 + clamp(momentum / Math.max(vol, 0.002), -1.2, 2.8) * 0.1,
        0.62,
        1.55,
      );
      const raw = baseQuality * targetFit * momentumBoost * eligibilityHaircut;
      return { market: pack.market, raw: Math.max(0.002, raw) };
    });
    const rawWeightTotal = rawWeights.reduce((sum, row) => sum + row.raw, 0);
    const cashRaw =
      rawWeightTotal < 0.08
        ? 0.12
        : rawWeightTotal < 0.18
          ? 0.08
          : rawWeightTotal < 0.4
            ? 0.04
            : 0.02;
    const weightTotal = rawWeightTotal + cashRaw || 1;
    const weights = Object.fromEntries([
      ...rawWeights.map((row) => [row.market, round(row.raw / weightTotal, 6)] as const),
      ['CASH', round(cashRaw / weightTotal, 6)] as const,
    ]) as Record<string, number>;

    const combinedReturn = activePacks.reduce(
      (sum, row) => sum + safeNumber(row.returnPct, 0) * safeNumber(weights[row.pack.market], 0),
      0,
    );
    daily_returns.push({ date, return_pct: round(combinedReturn, 8) });

    for (const pack of packs) {
      weightSums.set(
        pack.market,
        (weightSums.get(pack.market) || 0) + safeNumber(weights[pack.market], 0),
      );
      weightCounts.set(pack.market, (weightCounts.get(pack.market) || 0) + 1);
    }
    cashWeightSum += safeNumber(weights.CASH, 0);
    cashWeightCount += 1;

    for (const { pack, returnPct } of activePacks) {
      const history = marketHistory.get(pack.market) || [];
      history.push(safeNumber(returnPct, 0));
      marketHistory.set(pack.market, history);
    }
  }

  const capital_split = Object.fromEntries([
    ...packs.map((pack) => {
      const avgWeight =
        (weightSums.get(pack.market) || 0) / Math.max(1, weightCounts.get(pack.market) || 0);
      return [pack.market, round(avgWeight, 6)] as const;
    }),
    ['CASH', round(cashWeightSum / Math.max(1, cashWeightCount), 6)] as const,
  ]);

  return {
    capital_split,
    metrics: daily_returns.length
      ? computeMetrics(
          daily_returns.map((row) => row.return_pct),
          365,
        )
      : null,
    daily_returns,
  };
}

function formatMetricLine(label: string, value: number, type: 'pct' | 'ratio' = 'pct'): string {
  if (type === 'ratio') return `${label}: ${round(value, 4)}`;
  return `${label}: ${(value * 100).toFixed(2)}%`;
}

function buildSections(
  pack: ProductionStrategyPack,
): Record<string, { title: string; bullets: string[] }> {
  const combined = pack.combined_portfolio.metrics;
  const topMarket = pack.markets[0];
  return {
    A: {
      title: 'Strategy Hypothesis',
      bullets: [
        'Use a governed blend of trend breakout, trend pullback re-entry, and mean reversion so the system earns in more market states without simply levering up.',
        'Keep the model low-parameter and rule-based so every signal remains auditable.',
        combined
          ? `Current blended target check: Sharpe ${combined.sharpe}, annual ${(combined.annual_return * 100).toFixed(2)}%, max DD ${(combined.max_drawdown * 100).toFixed(2)}%.`
          : 'No blended portfolio metrics were available because market data was insufficient.',
      ],
    },
    B: {
      title: 'Markets And Timeframes',
      bullets: pack.markets.map(
        (marketPack) =>
          `${marketPack.market}: execution on ${marketPack.timeframe}, holding window ${marketPack.selected_config.max_hold_bars} bars max.`,
      ),
    },
    C: {
      title: 'Entry Logic',
      bullets: [
        'Trend breakout entries require fast-above-slow trend, prior-high break, rotation score confirmation, and liquidity filters.',
        'Trend pullback entries buy controlled pullbacks back into EMA support, then re-enter on trend resumption.',
        'Mean reversion entries only activate outside risk-off conditions and require statistically stretched pullbacks that can mean-revert quickly.',
      ],
    },
    D: {
      title: 'Exit Logic',
      bullets: [
        'Hard ATR stop is placed at entry and only tightens afterward.',
        'Large winners switch into profit-lock mode so strong trends can run longer before being exited.',
        'Mean reversion exits harvest back to fast EMA / normalization, while time stops recycle dead capital.',
      ],
    },
    E: {
      title: 'Position Sizing',
      bullets: [
        'Position size is risk-budgeted from stop distance, signal quality, and style-level market budget, then clipped by max position and liquidity participation caps.',
        'Capital is re-routed toward the active style and market sleeve instead of sitting idle in a fixed 65/35 split.',
        topMarket
          ? `Current template range: ${topMarket.grid_results
              .map(
                (row) =>
                  `${row.config.config_id} max position ${(row.config.max_position_pct * 100).toFixed(1)}%`,
              )
              .join(', ')}.`
          : 'No market template loaded.',
      ],
    },
    F: {
      title: 'Risk Controls',
      bullets: [
        'One-bar execution delay, paper-grade slippage/spread assumptions, and partial-fill sizing are always on.',
        'Liquidity filter rejects thin symbols before entry, and risk-off regimes automatically tilt away from breakout risk.',
        'Selection favors lower drawdown and lower trade density when targets conflict.',
      ],
    },
    G: {
      title: 'Anti-Overfitting',
      bullets: [
        'Only a constrained template grid is evaluated. Promotion uses robust parameter intervals, not a single best point.',
        'Each market pack includes train/test split, walk-forward windows, cross-asset validation, regime migration checks, parameter heatmap stability, and perturbation stress.',
        topMarket
          ? `Current robust interval snapshot: ${topMarket.overfit_audit.robust_parameter_intervals
              .slice(0, 4)
              .map((row) => `${row.parameter} ${row.min}-${row.max}`)
              .join(', ')}.`
          : 'No robust interval snapshot available.',
        pack.markets
          .map(
            (marketPack) =>
              `${marketPack.market}: effective parameter budget ${marketPack.overfit_audit.effective_parameter_count}/${marketPack.overfit_audit.declared_parameter_count}, OOS pass ${(
                marketPack.overfit_audit.rolling_oos_pass_rate * 100
              ).toFixed(0)}%, perturbation pass ${(
                marketPack.overfit_audit.perturbation_pass_rate * 100
              ).toFixed(0)}%.`,
          )
          .join(' '),
      ],
    },
    H: {
      title: 'Anti-Lookahead',
      bullets: [
        'Signals are generated from completed bar close only.',
        'Entries always happen on the next bar open, never the same bar.',
        `Detected future-leak violations in this run: ${pack.markets.reduce(
          (sum, marketPack) => sum + marketPack.backtest.diagnostics.future_leak_violations,
          0,
        )}.`,
      ],
    },
    I: {
      title: 'Backtest Realism',
      bullets: [
        'Backtests include spread, slippage, fees, funding/borrow drag proxy, execution delay, and partial-fill sizing.',
        'Stress scenarios include wider spread, more slippage, adverse funding, and stricter fills.',
        pack.markets
          .map((marketPack) => {
            const worst = [...marketPack.scenario_sensitivity].sort(
              (a, b) => a.metrics.annual_return - b.metrics.annual_return,
            )[0];
            return `${marketPack.market} worst stress: ${worst.scenario_id} annual ${(worst.metrics.annual_return * 100).toFixed(2)}%, DD ${(worst.metrics.max_drawdown * 100).toFixed(2)}%.`;
          })
          .join(' '),
      ],
    },
    J: {
      title: 'Key Metrics',
      bullets: combined
        ? [
            formatMetricLine('Combined annual return', combined.annual_return),
            formatMetricLine('Combined max drawdown', combined.max_drawdown),
            formatMetricLine('Combined sharpe', combined.sharpe, 'ratio'),
          ]
        : ['Combined metrics unavailable.'],
    },
    K: {
      title: 'Runnable Code',
      bullets: [
        'Strategy engine: src/server/nova/productionStrategyPack.ts',
        'CLI runner: scripts/run-nova-production-strategy-pack.ts',
        'Coverage test: tests/novaProductionStrategyPack.test.ts',
      ],
    },
    L: {
      title: 'Deployment',
      bullets: [
        `Vercel API: ${pack.deployment.api_route}`,
        `AWS job: ${pack.deployment.aws_command}`,
        pack.deployment.supabase_note,
      ],
    },
    M: {
      title: 'Operator Guide',
      bullets: [
        'Load OHLCV into SQLite/Supabase mirror first, then call the API or run the CLI.',
        'Review the returned sections, grid, walk-forward, and stress blocks before publishing a strategy.',
        'If targets are missed, keep the tighter config; do not loosen filters to chase backtest performance.',
      ],
    },
  };
}

function buildMarkdownReport(
  sections: Record<string, { title: string; bullets: string[] }>,
): string {
  return Object.entries(sections)
    .map(
      ([key, section]) =>
        `${key}. ${section.title}\n${section.bullets.map((bullet) => `- ${bullet}`).join('\n')}`,
    )
    .join('\n\n');
}

export async function generateNovaProductionStrategyPack(
  args: ProductionStrategyPackArgs,
): Promise<ProductionStrategyPack> {
  const generatedAt = new Date().toISOString();
  const traceId = createTraceId('nova-prod-strategy');
  const workflowId = `workflow-nova-prod-strategy-${randomUUID().slice(0, 12)}`;
  const marketScope: MarketScope =
    args.market === 'US' || args.market === 'CRYPTO' ? args.market : 'ALL';
  const riskProfile = normalizeRiskProfile(args.riskProfile);

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'nova_production_strategy_pack',
    workflow_version: 'nova-production-strategy-pack.v1',
    trigger_type: 'manual',
    status: 'RUNNING',
    trace_id: traceId,
    input_json: JSON.stringify({
      market_scope: marketScope,
      symbols: args.symbols || [],
      start: args.start || null,
      end: args.end || null,
      risk_profile: riskProfile,
    }),
    output_json: null,
    attempt_count: 1,
    started_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    completed_at_ms: null,
  });

  const startMs = args.start ? Date.parse(args.start) : undefined;
  const endMs = args.end ? Date.parse(args.end) : undefined;
  const requestedMarkets = marketScope === 'ALL' ? (['US', 'CRYPTO'] as Market[]) : [marketScope];
  const markets: MarketStrategyPack[] = [];

  for (const market of requestedMarkets) {
    const injectedBars = args.symbolBarsByMarket?.[market];
    const loaded = injectedBars
      ? {
          symbolBars: injectedBars,
          lineage: Object.entries(injectedBars).map(
            ([symbol, bars]): SymbolLineage => ({
              symbol,
              market,
              timeframe: market === 'US' ? '1d' : '1h',
              execution_timeframe: market === 'US' ? '1d' : '4h',
              source: bars[0]?.source || 'injected',
              bar_count: bars.length,
              first_ts_open: bars[0]?.ts_open ?? null,
              last_ts_open: bars[bars.length - 1]?.ts_open ?? null,
            }),
          ),
        }
      : loadMarketBars({
          repo: args.repo,
          market,
          symbols: args.symbols,
          startMs,
          endMs,
        });

    if (!Object.keys(loaded.symbolBars).length) continue;
    markets.push(
      buildMarketPack({
        market,
        symbolBars: loaded.symbolBars,
        dataLineage: loaded.lineage,
        riskProfile,
      }),
    );
  }

  const combined = combineDailySeries(markets);
  const packBase: ProductionStrategyPack = {
    generated_at: generatedAt,
    workflow_id: workflowId,
    trace_id: traceId,
    market_scope: marketScope,
    risk_profile: riskProfile,
    target_metrics: TARGET_METRICS,
    markets,
    combined_portfolio: combined,
    sections: {},
    markdown_report: '',
    deployment: {
      api_route: 'POST /api/nova/strategy/production-pack',
      aws_command:
        'npm run nova:strategy:pack -- --market ALL --risk-profile balanced --start 2023-01-01 --end 2026-03-27',
      vercel_note: 'Expose the production pack route from the existing Express/Vercel API layer.',
      supabase_note:
        'Workflow runs and audit events are already mirror-friendly, so the JSON payload can be read from Supabase-backed mirrors without changing the strategy contract.',
    },
  };
  packBase.sections = buildSections(packBase);
  packBase.markdown_report = buildMarkdownReport(packBase.sections);

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'nova_production_strategy_pack',
    workflow_version: 'nova-production-strategy-pack.v1',
    trigger_type: 'manual',
    status: 'SUCCEEDED',
    trace_id: traceId,
    input_json: JSON.stringify({
      market_scope: marketScope,
      symbols: args.symbols || [],
      start: args.start || null,
      end: args.end || null,
      risk_profile: riskProfile,
    }),
    output_json: JSON.stringify(packBase),
    attempt_count: 1,
    started_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    completed_at_ms: Date.now(),
  });

  recordAuditEvent(args.repo, {
    traceId,
    scope: 'nova_production_strategy_pack',
    eventType: 'NOVA_PRODUCTION_STRATEGY_PACK_GENERATED',
    userId: args.userId || null,
    entityType: 'workflow_run',
    entityId: workflowId,
    payload: {
      market_scope: marketScope,
      risk_profile: riskProfile,
      generated_at: generatedAt,
      market_count: markets.length,
      combined_metrics: combined.metrics,
    },
  });

  return packBase;
}

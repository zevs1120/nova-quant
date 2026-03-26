/**
 * Technical Indicators Library — pure computation from OHLCV bars.
 *
 * Ported from daily_stock_analysis/src/stock_analyzer.py.
 * All functions are stateless and operate on arrays.
 */

import { clamp, mean, round, stdDev } from './math.js';

/* ─────────────────────────────────────────────────
 * Moving Averages
 * ───────────────────────────────────────────────── */

/**
 * Simple Moving Average over the last `period` values.
 * Returns NaN if not enough data.
 */
export function sma(close, period) {
  if (!close || close.length < period) return NaN;
  const slice = close.slice(-period);
  return mean(slice);
}

/**
 * Exponential Moving Average (full series).
 * Returns an array the same length as `close`.
 * Uses the standard EMA formula: EMA_t = close_t * k + EMA_{t-1} * (1 - k)
 */
export function emaSeries(close, period) {
  if (!close || close.length === 0) return [];
  const k = 2 / (period + 1);
  const result = [close[0]];
  for (let i = 1; i < close.length; i += 1) {
    result.push(close[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/**
 * Current EMA value (last element of full series).
 */
export function ema(close, period) {
  const series = emaSeries(close, period);
  return series.length ? series[series.length - 1] : NaN;
}

/* ─────────────────────────────────────────────────
 * MACD (12/26/9 default, matching DSA)
 * ───────────────────────────────────────────────── */

/**
 * MACD indicator.
 * - DIF = EMA(fast) - EMA(slow)
 * - DEA = EMA(DIF, signal)
 * - BAR = (DIF - DEA) * 2
 *
 * Returns { dif, dea, bar, histogram[] } where dif/dea/bar are latest values.
 */
export function macd(close, fast = 12, slow = 26, signal = 9) {
  if (!close || close.length < slow) {
    return { dif: 0, dea: 0, bar: 0, histogram: [] };
  }
  const emaFast = emaSeries(close, fast);
  const emaSlow = emaSeries(close, slow);
  const difSeries = emaFast.map((f, i) => f - emaSlow[i]);
  const deaSeries = emaSeries(difSeries, signal);
  const histogram = difSeries.map((d, i) => (d - deaSeries[i]) * 2);

  const last = close.length - 1;
  const prevDifDea = last > 0 ? difSeries[last - 1] - deaSeries[last - 1] : 0;
  const currDifDea = difSeries[last] - deaSeries[last];

  return {
    dif: round(difSeries[last], 4),
    dea: round(deaSeries[last], 4),
    bar: round(histogram[last], 4),
    golden_cross: prevDifDea <= 0 && currDifDea > 0,
    death_cross: prevDifDea >= 0 && currDifDea < 0,
    above_zero: difSeries[last] > 0,
    histogram: histogram.slice(-20).map((v) => round(v, 4)),
  };
}

/* ─────────────────────────────────────────────────
 * RSI
 * ───────────────────────────────────────────────── */

/**
 * Relative Strength Index.
 * Uses rolling avg gain / avg loss (Wilder's method).
 * Returns 0-100.
 */
export function rsi(close, period = 14) {
  if (!close || close.length < period + 1) return 50; // neutral default

  const gains = [];
  const losses = [];
  for (let i = 1; i < close.length; i += 1) {
    const diff = close[i] - close[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  // Initial average (SMA of first `period` values)
  let avgGain = mean(gains.slice(0, period));
  let avgLoss = mean(losses.slice(0, period));

  // Smooth with Wilder's method for remaining values
  for (let i = period; i < gains.length; i += 1) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs), 2);
}

/* ─────────────────────────────────────────────────
 * Bollinger Bands
 * ───────────────────────────────────────────────── */

/**
 * Bollinger Bands.
 * middle = SMA(period), upper = middle + mult * std, lower = middle - mult * std
 */
export function bollingerBands(close, period = 20, mult = 2) {
  if (!close || close.length < period) {
    return { upper: NaN, middle: NaN, lower: NaN, width: 0 };
  }
  const slice = close.slice(-period);
  const middle = mean(slice);
  const std = stdDev(slice);
  const upper = middle + mult * std;
  const lower = middle - mult * std;
  const width = middle > 0 ? round((upper - lower) / middle, 4) : 0;
  return {
    upper: round(upper, 4),
    middle: round(middle, 4),
    lower: round(lower, 4),
    width,
  };
}

/* ─────────────────────────────────────────────────
 * Bias Rate (乖离率)
 * ───────────────────────────────────────────────── */

/**
 * Bias rate: (close - SMA) / SMA * 100%.
 * Positive = above average, negative = below.
 */
export function biasRate(close, period) {
  const ma = sma(close, period);
  if (!Number.isFinite(ma) || ma === 0) return 0;
  const latest = close[close.length - 1];
  return round(((latest - ma) / ma) * 100, 2);
}

/* ─────────────────────────────────────────────────
 * Volume Ratio
 * ───────────────────────────────────────────────── */

/**
 * Volume ratio: current volume / avg volume over prior `avgPeriod` bars.
 */
export function volumeRatio(bars, avgPeriod = 5) {
  if (!bars || bars.length < avgPeriod + 1) return 1;
  const current = bars[bars.length - 1].volume;
  const priorBars = bars.slice(-(avgPeriod + 1), -1);
  const avgVol = mean(priorBars.map((b) => b.volume || 0));
  if (avgVol <= 0) return 1;
  return round(current / avgVol, 2);
}

/* ─────────────────────────────────────────────────
 * MA Alignment (from DSA's _analyze_trend)
 * ───────────────────────────────────────────────── */

/**
 * Classify MA alignment into 5 states: BULL, WEAK_BULL, BEAR, WEAK_BEAR, CONSOLIDATION.
 * Adapted from DSA's TrendStatus (DSA has 7 states including STRONG_BULL/STRONG_BEAR
 * which require historical spread comparison; we simplify to 5 for bar-window data).
 */
export function maAlignment(close) {
  const ma5 = sma(close, 5);
  const ma10 = sma(close, 10);
  const ma20 = sma(close, 20);

  if (!Number.isFinite(ma5) || !Number.isFinite(ma10) || !Number.isFinite(ma20)) {
    return { status: 'CONSOLIDATION', ma5: 0, ma10: 0, ma20: 0 };
  }

  let status;
  if (ma5 > ma10 && ma10 > ma20) {
    status = 'BULL';
  } else if (ma5 > ma10 && ma10 <= ma20) {
    status = 'WEAK_BULL';
  } else if (ma5 < ma10 && ma10 < ma20) {
    status = 'BEAR';
  } else if (ma5 < ma10 && ma10 >= ma20) {
    status = 'WEAK_BEAR';
  } else {
    status = 'CONSOLIDATION';
  }

  return {
    status,
    ma5: round(ma5, 4),
    ma10: round(ma10, 4),
    ma20: round(ma20, 4),
  };
}

/* ─────────────────────────────────────────────────
 * Composite: computeIndicators
 * ───────────────────────────────────────────────── */

/**
 * Compute all indicators from an OHLCV bars array.
 *
 * @param {object[]} bars - Array of { open, high, low, close, volume }
 * @returns {object} Full indicator snapshot
 */
export function computeIndicators(bars) {
  if (!bars || !Array.isArray(bars) || bars.length < 2) {
    return null;
  }

  const close = bars.map((b) => b.close);
  const ma = maAlignment(close);
  const macdResult = macd(close);
  const rsi14 = rsi(close, 14);
  const rsi6 = rsi(close, 6);
  const bb = bollingerBands(close, 20, 2);
  const bias5 = biasRate(close, 5);
  const bias10 = biasRate(close, 10);
  const bias20 = biasRate(close, 20);
  const volRatio = volumeRatio(bars, 5);

  return {
    ma_alignment: ma,
    macd: macdResult,
    rsi_14: rsi14,
    rsi_6: rsi6,
    bollinger: bb,
    bias_rate_5: bias5,
    bias_rate_10: bias10,
    bias_rate_20: bias20,
    volume_ratio: volRatio,
    bar_count: bars.length,
  };
}

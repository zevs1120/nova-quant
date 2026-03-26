/**
 * K-line Pattern Detector — candlestick pattern recognition.
 *
 * Adapted from daily_stock_analysis's one_yang_three_yin and volume_breakout
 * patterns. Pure computation from OHLCV bar data.
 *
 * Each pattern returns a detection result with confidence (0-1) and a
 * score adjustment that can be integrated into signal scoring.
 */

import { clamp, round } from './math.js';

/**
 * Compute the body size of a candle as a ratio of total range.
 * @param {object} bar - { open, high, low, close }
 * @returns {number} Body ratio (0 = doji, 1 = marubozu)
 */
function bodyRatio(bar) {
  const range = bar.high - bar.low;
  if (range <= 0) return 0;
  return Math.abs(bar.close - bar.open) / range;
}

/**
 * Check if a candle is bullish (close > open).
 */
function isBullish(bar) {
  return bar.close > bar.open;
}

/**
 * Detect a Bullish Engulfing pattern.
 * The current bar fully engulfs the previous bar's body.
 *
 * @param {object[]} bars - OHLCV bars (oldest first), need at least 2
 * @returns {object|null} Detection result or null
 */
export function detectBullishEngulfing(bars) {
  if (!bars || bars.length < 2) return null;

  const prev = bars[bars.length - 2];
  const curr = bars[bars.length - 1];

  if (!prev || !curr) return null;

  const prevBearish = prev.close < prev.open;
  const currBullish = curr.close > curr.open;
  const engulfs = curr.open <= prev.close && curr.close >= prev.open;

  if (prevBearish && currBullish && engulfs) {
    const currBody = Math.abs(curr.close - curr.open);
    const prevBody = Math.abs(prev.close - prev.open);
    const bodyRatioMultiple = prevBody > 0 ? currBody / prevBody : 1;
    const confidence = clamp(bodyRatioMultiple / 3, 0.3, 0.95);

    return {
      type: 'bullish_engulfing',
      confidence: round(confidence, 3),
      bar_index: bars.length - 1,
      direction: 'LONG',
      score_adjustment: round(confidence * 8, 2),
    };
  }

  return null;
}

/**
 * Detect a Bearish Engulfing pattern.
 * Mirror of bullish engulfing in the opposite direction.
 *
 * @param {object[]} bars - OHLCV bars (oldest first), need at least 2
 * @returns {object|null} Detection result or null
 */
export function detectBearishEngulfing(bars) {
  if (!bars || bars.length < 2) return null;

  const prev = bars[bars.length - 2];
  const curr = bars[bars.length - 1];

  if (!prev || !curr) return null;

  const prevBullish = prev.close > prev.open;
  const currBearish = curr.close < curr.open;
  const engulfs = curr.open >= prev.close && curr.close <= prev.open;

  if (prevBullish && currBearish && engulfs) {
    const currBody = Math.abs(curr.close - curr.open);
    const prevBody = Math.abs(prev.close - prev.open);
    const bodyRatioMultiple = prevBody > 0 ? currBody / prevBody : 1;
    const confidence = clamp(bodyRatioMultiple / 3, 0.3, 0.95);

    return {
      type: 'bearish_engulfing',
      confidence: round(confidence, 3),
      bar_index: bars.length - 1,
      direction: 'SHORT',
      score_adjustment: round(confidence * 8, 2),
    };
  }

  return null;
}

/**
 * Detect a Hammer / Pin Bar pattern.
 * Long lower shadow with small body at the top of range.
 *
 * @param {object[]} bars - OHLCV bars, need at least 1
 * @returns {object|null} Detection result or null
 */
export function detectHammer(bars) {
  if (!bars || bars.length < 1) return null;

  const bar = bars[bars.length - 1];
  if (!bar) return null;

  const range = bar.high - bar.low;
  if (range <= 0) return null;

  const body = Math.abs(bar.close - bar.open);
  const lowerShadow = Math.min(bar.open, bar.close) - bar.low;
  const upperShadow = bar.high - Math.max(bar.open, bar.close);

  // Hammer: lower shadow >= 2x body, upper shadow < 30% of range
  if (lowerShadow >= body * 2 && upperShadow < range * 0.3) {
    const confidence = clamp(lowerShadow / range, 0.3, 0.85);
    return {
      type: 'hammer',
      confidence: round(confidence, 3),
      bar_index: bars.length - 1,
      direction: 'LONG',
      score_adjustment: round(confidence * 6, 2),
    };
  }

  return null;
}

/**
 * Detect a Doji pattern.
 * Very small body relative to total range, indicating indecision.
 *
 * @param {object[]} bars - OHLCV bars, need at least 1
 * @returns {object|null} Detection result or null
 */
export function detectDoji(bars) {
  if (!bars || bars.length < 1) return null;

  const bar = bars[bars.length - 1];
  if (!bar) return null;

  const range = bar.high - bar.low;
  if (range <= 0) return null;

  const br = bodyRatio(bar);

  if (br < 0.1) {
    const confidence = round(clamp(1 - br * 10, 0.4, 0.8), 3);
    return {
      type: 'doji',
      confidence,
      bar_index: bars.length - 1,
      direction: 'NEUTRAL',
      score_adjustment: -2, // Doji = indecision, slight negative
    };
  }

  return null;
}

/**
 * Detect a Volume Breakout pattern (放量突破).
 * Adapted from daily_stock_analysis's volume_breakout strategy.
 * Current bar has volume > 2x average and closes at range extremes.
 *
 * @param {object[]} bars - OHLCV bars with volume, need at least 6
 * @returns {object|null} Detection result or null
 */
export function detectVolumeBreakout(bars) {
  if (!bars || bars.length < 6) return null;

  const current = bars[bars.length - 1];
  if (!current || !Number.isFinite(current.volume) || current.volume <= 0) return null;

  // Compute average volume over prior 5 bars
  const priorBars = bars.slice(-6, -1);
  const avgVolume = priorBars.reduce((sum, b) => sum + (b.volume || 0), 0) / priorBars.length;
  if (avgVolume <= 0) return null;

  const volumeRatio = current.volume / avgVolume;

  // Need volume > 2x average
  if (volumeRatio < 2.0) return null;

  // Check if close is in the top or bottom 20% of range (strong close)
  const range = current.high - current.low;
  if (range <= 0) return null;

  const closePosition = (current.close - current.low) / range;
  const bullishBreakout = closePosition > 0.8;
  const bearishBreakout = closePosition < 0.2;

  if (!bullishBreakout && !bearishBreakout) return null;

  const confidence = round(clamp(volumeRatio / 4, 0.4, 0.9), 3);
  const direction = bullishBreakout ? 'LONG' : 'SHORT';

  return {
    type: 'volume_breakout',
    confidence,
    bar_index: bars.length - 1,
    direction,
    volume_ratio: round(volumeRatio, 2),
    score_adjustment: round(confidence * 10, 2),
  };
}

/**
 * Run all pattern detectors on a set of OHLCV bars.
 *
 * @param {object[]} bars - Array of { open, high, low, close, volume } bars (oldest first)
 * @returns {object[]} Array of detected patterns, sorted by confidence desc
 */
export function detectPatterns(bars) {
  if (!bars || !Array.isArray(bars) || bars.length === 0) return [];

  const detectors = [
    detectBullishEngulfing,
    detectBearishEngulfing,
    detectHammer,
    detectDoji,
    detectVolumeBreakout,
  ];

  const detected = [];
  for (const detector of detectors) {
    const result = detector(bars);
    if (result) {
      detected.push(result);
    }
  }

  return detected.sort((a, b) => b.confidence - a.confidence);
}

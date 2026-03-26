/**
 * Sentiment Cycle Engine — quantitative market sentiment classification.
 *
 * Adapted from daily_stock_analysis's emotion_cycle.yaml strategy.
 * Classifies market sentiment into 5 phases using velocity, volume, and
 * trend convergence data already available in the Nova pipeline.
 *
 * This is a pure computation module with no external dependencies or API calls.
 * It produces a score adjustment that can shift signal scores up (cold market
 * = contrarian opportunity) or down (euphoric market = chasing risk).
 */

import { SENTIMENT_CYCLE_PARAMS } from './params.js';
import { clamp, round } from './math.js';

const PHASES = ['cold_bottom', 'warming', 'stable', 'heating', 'euphoria_top'];

/**
 * Compute a volume ratio: current volume vs its rolling average.
 * @param {number} currentVolume - Current bar/period volume
 * @param {number} avgVolume - Rolling average volume (e.g., 20-day)
 * @returns {number} Ratio (1.0 = average, 2.0 = 2x average, etc.)
 */
export function computeVolumeRatio(currentVolume, avgVolume) {
  if (!Number.isFinite(currentVolume) || !Number.isFinite(avgVolume) || avgVolume <= 0) {
    return 1.0;
  }
  return currentVolume / avgVolume;
}

/**
 * Compute MA convergence — how tightly clustered the moving averages are.
 * Uses an ATR-normalized spread between trend_strength and vol_percentile
 * as a proxy for MA convergence when raw MAs aren't available.
 *
 * @param {number} trendStrength - Trend strength (0-1), proxy for MA alignment
 * @param {number} volPercentile - Volatility percentile (0-1)
 * @returns {number} Convergence score (0 = tight, 1 = wide)
 */
export function computeMAConvergence(trendStrength, volPercentile) {
  const t = Number.isFinite(trendStrength) ? clamp(trendStrength, 0, 1) : 0.5;
  const v = Number.isFinite(volPercentile) ? clamp(volPercentile, 0, 1) : 0.5;
  // When trend is strong and vol is low, MAs are converged (tight).
  // When vol is high and trend is weak, MAs are diverged (wide).
  return clamp(v * 0.6 + (1 - t) * 0.4, 0, 1);
}

/**
 * Classify the current market sentiment phase.
 *
 * Uses three factors (adapted from DSA's emotion_cycle):
 *   1. Volume ratio — turnover intensity vs rolling average
 *   2. Velocity percentile — price momentum ranking
 *   3. MA convergence — how aligned/compressed moving averages are
 *
 * @param {object} params
 * @param {number} params.volumeRatio - Current volume / average volume
 * @param {number} params.velocityPercentile - Velocity percentile (0-1)
 * @param {number} params.maConvergence - MA convergence score (0=tight, 1=wide)
 * @returns {string} Phase: 'cold_bottom' | 'warming' | 'stable' | 'heating' | 'euphoria_top'
 */
export function classifySentimentPhase({ volumeRatio, velocityPercentile, maConvergence }) {
  const vol = Number.isFinite(volumeRatio) ? volumeRatio : 1.0;
  const vel = Number.isFinite(velocityPercentile) ? clamp(velocityPercentile, 0, 1) : 0.5;
  const conv = Number.isFinite(maConvergence) ? clamp(maConvergence, 0, 1) : 0.5;

  const coldThreshold = SENTIMENT_CYCLE_PARAMS.volume_cold_threshold;
  const hotThreshold = SENTIMENT_CYCLE_PARAMS.volume_hot_threshold;
  const tightThreshold = SENTIMENT_CYCLE_PARAMS.convergence_tight_threshold;
  const wideThreshold = SENTIMENT_CYCLE_PARAMS.convergence_wide_threshold;

  // Cold bottom: low volume + low velocity + tight MA convergence (quiet compression)
  if (vol < coldThreshold && vel < 0.25 && conv < tightThreshold) {
    return 'cold_bottom';
  }

  // Euphoria top: high volume + high velocity + wide MA divergence
  if (vol > hotThreshold && vel > 0.8 && conv > wideThreshold) {
    return 'euphoria_top';
  }

  // Heating: above-average volume + strong velocity
  if (vol > 1.5 && vel > 0.65) {
    return 'heating';
  }

  // Warming: recovering from cold — moderate volume, velocity starting to rise
  if (vol < 1.0 && vel > 0.35 && vel < 0.65 && conv < 0.5) {
    return 'warming';
  }

  return 'stable';
}

/**
 * Compute the signal score adjustment based on sentiment phase.
 *
 * Cold market: positive adjustment (contrarian opportunity).
 * Hot market: negative adjustment (chasing risk / euphoria penalty).
 *
 * @param {string} phase - One of the 5 sentiment phases
 * @returns {number} Score adjustment (-0.15 to +0.12)
 */
export function computeSentimentAdjustment(phase) {
  switch (phase) {
    case 'cold_bottom':
      return SENTIMENT_CYCLE_PARAMS.cold_bonus;
    case 'warming':
      return SENTIMENT_CYCLE_PARAMS.warming_bonus;
    case 'heating':
      return SENTIMENT_CYCLE_PARAMS.heating_penalty;
    case 'euphoria_top':
      return SENTIMENT_CYCLE_PARAMS.euphoria_penalty;
    default:
      return 0;
  }
}

/**
 * Run the full sentiment cycle analysis for a signal.
 *
 * @param {object} params
 * @param {object} params.series - Velocity series data
 * @param {object} params.regime - Regime snapshot
 * @returns {{ phase: string, adjustment: number, factors: object }}
 */
export function runSentimentCycle({ series, regime }) {
  const velocityPercentile = series?.latest?.percentile ?? 0.5;
  const trendStrength = regime?.trend_strength ?? 0.5;
  const volPercentile = regime?.vol_percentile ?? 0.5;

  // Volume ratio: use acceleration as a proxy (positive = expanding, negative = contracting)
  const acceleration = series?.latest?.acceleration ?? 0;
  const volumeRatio = clamp(1.0 + acceleration * 10, 0.1, 4.0);

  const maConvergence = computeMAConvergence(trendStrength, volPercentile);
  const phase = classifySentimentPhase({ volumeRatio, velocityPercentile, maConvergence });
  const adjustment = computeSentimentAdjustment(phase);

  return {
    phase,
    adjustment: round(adjustment, 4),
    factors: {
      volume_ratio: round(volumeRatio, 3),
      velocity_percentile: round(velocityPercentile, 4),
      ma_convergence: round(maConvergence, 4),
    },
  };
}

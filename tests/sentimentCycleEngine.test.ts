import { describe, expect, it } from 'vitest';
import {
  computeVolumeRatio,
  computeMAConvergence,
  classifySentimentPhase,
  computeSentimentAdjustment,
  runSentimentCycle,
} from '../src/engines/sentimentCycleEngine.js';

/* ---------- computeVolumeRatio ---------- */

describe('computeVolumeRatio', () => {
  it('returns ratio of current to average volume', () => {
    expect(computeVolumeRatio(200, 100)).toBe(2.0);
    expect(computeVolumeRatio(50, 100)).toBe(0.5);
    expect(computeVolumeRatio(100, 100)).toBe(1.0);
  });

  it('returns 1.0 for invalid inputs', () => {
    expect(computeVolumeRatio(NaN, 100)).toBe(1.0);
    expect(computeVolumeRatio(100, 0)).toBe(1.0);
    expect(computeVolumeRatio(100, NaN)).toBe(1.0);
    expect(computeVolumeRatio(undefined as any, undefined as any)).toBe(1.0);
  });
});

/* ---------- computeMAConvergence ---------- */

describe('computeMAConvergence', () => {
  it('tight convergence when trend strong and vol low', () => {
    const result = computeMAConvergence(0.9, 0.1);
    expect(result).toBeLessThan(0.3);
  });

  it('wide convergence when trend weak and vol high', () => {
    const result = computeMAConvergence(0.1, 0.9);
    expect(result).toBeGreaterThan(0.7);
  });

  it('clamps output to [0, 1]', () => {
    expect(computeMAConvergence(0, 0)).toBeGreaterThanOrEqual(0);
    expect(computeMAConvergence(0, 0)).toBeLessThanOrEqual(1);
    expect(computeMAConvergence(1, 1)).toBeGreaterThanOrEqual(0);
    expect(computeMAConvergence(1, 1)).toBeLessThanOrEqual(1);
  });

  it('defaults to 0.5 for non-finite inputs', () => {
    const result = computeMAConvergence(NaN, NaN);
    expect(Number.isFinite(result)).toBe(true);
  });
});

/* ---------- classifySentimentPhase ---------- */

describe('classifySentimentPhase', () => {
  it('cold_bottom: low volume, low velocity, tight convergence', () => {
    const phase = classifySentimentPhase({
      volumeRatio: 0.3,
      velocityPercentile: 0.15,
      maConvergence: 0.2,
    });
    expect(phase).toBe('cold_bottom');
  });

  it('euphoria_top: high volume, high velocity, wide divergence', () => {
    const phase = classifySentimentPhase({
      volumeRatio: 2.5,
      velocityPercentile: 0.9,
      maConvergence: 0.85,
    });
    expect(phase).toBe('euphoria_top');
  });

  it('heating: above-average volume + strong velocity', () => {
    const phase = classifySentimentPhase({
      volumeRatio: 1.8,
      velocityPercentile: 0.7,
      maConvergence: 0.5,
    });
    expect(phase).toBe('heating');
  });

  it('warming: recovering from cold', () => {
    const phase = classifySentimentPhase({
      volumeRatio: 0.8,
      velocityPercentile: 0.45,
      maConvergence: 0.35,
    });
    expect(phase).toBe('warming');
  });

  it('stable: when nothing extreme', () => {
    const phase = classifySentimentPhase({
      volumeRatio: 1.0,
      velocityPercentile: 0.5,
      maConvergence: 0.5,
    });
    expect(phase).toBe('stable');
  });

  it('handles missing/NaN inputs as stable', () => {
    const phase = classifySentimentPhase({
      volumeRatio: NaN,
      velocityPercentile: NaN,
      maConvergence: NaN,
    });
    expect(phase).toBe('stable');
  });
});

/* ---------- computeSentimentAdjustment ---------- */

describe('computeSentimentAdjustment', () => {
  it('cold_bottom gives positive bonus', () => {
    const adj = computeSentimentAdjustment('cold_bottom');
    expect(adj).toBeGreaterThan(0);
    expect(adj).toBe(0.12);
  });

  it('warming gives smaller positive bonus', () => {
    const adj = computeSentimentAdjustment('warming');
    expect(adj).toBe(0.06);
  });

  it('heating gives negative penalty', () => {
    const adj = computeSentimentAdjustment('heating');
    expect(adj).toBe(-0.06);
  });

  it('euphoria_top gives strongest negative penalty', () => {
    const adj = computeSentimentAdjustment('euphoria_top');
    expect(adj).toBe(-0.15);
  });

  it('stable gives zero adjustment', () => {
    expect(computeSentimentAdjustment('stable')).toBe(0);
  });

  it('unknown phase gives zero', () => {
    expect(computeSentimentAdjustment('random_string')).toBe(0);
  });
});

/* ---------- runSentimentCycle ---------- */

describe('runSentimentCycle', () => {
  it('returns phase, adjustment, and factors for strong trend', () => {
    const result = runSentimentCycle({
      series: {
        latest: { percentile: 0.6, acceleration: 0.01 },
      },
      regime: { trend_strength: 0.7, vol_percentile: 0.3 },
    }) as any;
    expect(result.phase).toBeTruthy();
    expect(typeof result.adjustment).toBe('number');
    expect(typeof result.factors.volume_ratio).toBe('number');
    expect(typeof result.factors.velocity_percentile).toBe('number');
    expect(typeof result.factors.ma_convergence).toBe('number');
  });

  it('handles null/missing series gracefully', () => {
    const result = runSentimentCycle({ series: null, regime: null }) as any;
    expect(result.phase).toBe('stable');
    expect(result.adjustment).toBe(0);
  });

  it('cold market phase when all indicators are quiet', () => {
    const result = runSentimentCycle({
      series: {
        latest: { percentile: 0.1, acceleration: -0.08 },
      },
      regime: { trend_strength: 0.8, vol_percentile: 0.15 },
    }) as any;
    expect(result.phase).toBe('cold_bottom');
    expect(result.adjustment).toBeGreaterThan(0);
  });

  it('adjustment is bounded', () => {
    const cold = runSentimentCycle({
      series: { latest: { percentile: 0.05, acceleration: -0.1 } },
      regime: { trend_strength: 0.9, vol_percentile: 0.1 },
    }) as any;
    const hot = runSentimentCycle({
      series: { latest: { percentile: 0.95, acceleration: 0.15 } },
      regime: { trend_strength: 0.2, vol_percentile: 0.9 },
    }) as any;
    expect(cold.adjustment).toBeLessThanOrEqual(0.12);
    expect(hot.adjustment).toBeGreaterThanOrEqual(-0.15);
  });
});

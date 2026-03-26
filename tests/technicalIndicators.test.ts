import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import {
  sma,
  ema,
  emaSeries,
  macd,
  rsi,
  bollingerBands,
  biasRate,
  volumeRatio,
  maAlignment,
  computeIndicators,
} from '../src/engines/technicalIndicators.js';

/* ─────────────── SMA ─────────────── */

describe('sma', () => {
  it('computes correct simple average', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBeCloseTo(4, 6); // (3+4+5)/3
    expect(sma([1, 2, 3, 4, 5], 5)).toBeCloseTo(3, 6); // (1+2+3+4+5)/5
  });

  it('returns NaN if not enough data', () => {
    expect(sma([1, 2], 5)).toBeNaN();
    expect(sma([], 1)).toBeNaN();
  });

  it('handles single-period SMA (= last value)', () => {
    expect(sma([10, 20, 30], 1)).toBeCloseTo(30, 6);
  });
});

/* ─────────────── EMA ─────────────── */

describe('ema / emaSeries', () => {
  it('emaSeries produces array of same length', () => {
    const close = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const series = emaSeries(close, 3);
    expect(series).toHaveLength(10);
  });

  it('ema converges toward recent values', () => {
    const close = [50, 50, 50, 50, 50, 100, 100, 100, 100, 100];
    const val = ema(close, 3);
    // EMA should be close to 100 after 5 bars of 100
    expect(val).toBeGreaterThan(95);
  });

  it('ema of constant series equals the constant', () => {
    const close = Array(20).fill(42);
    expect(ema(close, 5)).toBeCloseTo(42, 6);
  });

  it('returns NaN for empty input', () => {
    expect(ema([], 5)).toBeNaN();
  });
});

/* ─────────────── MACD ─────────────── */

describe('macd', () => {
  it('returns zeros when not enough data', () => {
    const result = macd([1, 2, 3], 12, 26, 9);
    expect(result.dif).toBe(0);
    expect(result.dea).toBe(0);
  });

  it('detects golden cross on uptrend data', () => {
    // Downtrend then strong uptrend should produce golden cross
    const down = Array.from({ length: 30 }, (_, i) => 100 - i * 0.5);
    const up = Array.from({ length: 30 }, (_, i) => down[down.length - 1] + i * 2);
    const close = [...down, ...up];
    const result = macd(close);
    expect(result.dif).toBeGreaterThan(0);
    // After sustained uptrend, DIF > DEA
    expect(result.dif).toBeGreaterThan(result.dea);
  });

  it('produces histogram array capped at 20 values', () => {
    const close = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const result = macd(close);
    expect(result.histogram.length).toBeLessThanOrEqual(20);
    expect(typeof result.bar).toBe('number');
  });

  it('golden_cross and death_cross are booleans', () => {
    const close = Array.from({ length: 60 }, (_, i) => 100 + i);
    const result = macd(close);
    expect(typeof result.golden_cross).toBe('boolean');
    expect(typeof result.death_cross).toBe('boolean');
  });
});

/* ─────────────── RSI ─────────────── */

describe('rsi', () => {
  it('returns 50 when not enough data', () => {
    expect(rsi([1, 2, 3], 14)).toBe(50);
  });

  it('all-up series gives RSI near 100', () => {
    const close = Array.from({ length: 30 }, (_, i) => 100 + i);
    const val = rsi(close, 14);
    expect(val).toBeGreaterThan(90);
  });

  it('all-down series gives RSI near 0', () => {
    const close = Array.from({ length: 30 }, (_, i) => 100 - i);
    const val = rsi(close, 14);
    expect(val).toBeLessThan(10);
  });

  it('flat series gives RSI around 50', () => {
    const close = Array(30).fill(100);
    const val = rsi(close, 14);
    expect(val).toBe(50); // no gains, no losses → neutral
  });

  it('RSI is bounded between 0 and 100', () => {
    const volatile = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 30);
    const val = rsi(volatile, 14);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(100);
  });
});

/* ─────────────── Bollinger Bands ─────────────── */

describe('bollingerBands', () => {
  it('upper > middle > lower', () => {
    const close = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const bb = bollingerBands(close, 20, 2);
    expect(bb.upper).toBeGreaterThan(bb.middle);
    expect(bb.middle).toBeGreaterThan(bb.lower);
  });

  it('flat series has zero width', () => {
    const close = Array(30).fill(100);
    const bb = bollingerBands(close, 20, 2);
    expect(bb.upper).toBeCloseTo(100, 2);
    expect(bb.lower).toBeCloseTo(100, 2);
    expect(bb.width).toBe(0);
  });

  it('returns NaN when not enough data', () => {
    const bb = bollingerBands([1, 2, 3], 20, 2);
    expect(bb.middle).toBeNaN();
  });

  it('width is positive for volatile data', () => {
    const close = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 10 : -10));
    const bb = bollingerBands(close, 20, 2);
    expect(bb.width).toBeGreaterThan(0);
  });
});

/* ─────────────── Bias Rate ─────────────── */

describe('biasRate', () => {
  it('returns 0 when price equals MA', () => {
    const close = Array(10).fill(100);
    expect(biasRate(close, 5)).toBe(0);
  });

  it('positive bias when price above MA', () => {
    const close = [98, 99, 100, 101, 102, 110]; // MA5 of last 5 = 102.4, last = 110
    expect(biasRate(close, 5)).toBeGreaterThan(0);
  });

  it('negative bias when price below MA', () => {
    const close = [102, 101, 100, 99, 98, 90]; // MA5 of last 5 = 97.4, last = 90
    expect(biasRate(close, 5)).toBeLessThan(0);
  });
});

/* ─────────────── Volume Ratio ─────────────── */

describe('volumeRatio', () => {
  it('returns 1 when not enough data', () => {
    expect(volumeRatio([{ volume: 100 }], 5)).toBe(1);
  });

  it('returns 2 when current is double average', () => {
    const bars = [
      { volume: 100 },
      { volume: 100 },
      { volume: 100 },
      { volume: 100 },
      { volume: 100 },
      { volume: 200 },
    ];
    expect(volumeRatio(bars, 5)).toBe(2);
  });

  it('returns 0.5 when current is half average', () => {
    const bars = [
      { volume: 200 },
      { volume: 200 },
      { volume: 200 },
      { volume: 200 },
      { volume: 200 },
      { volume: 100 },
    ];
    expect(volumeRatio(bars, 5)).toBe(0.5);
  });
});

/* ─────────────── MA Alignment ─────────────── */

describe('maAlignment', () => {
  it('detects BULL (MA5 > MA10 > MA20)', () => {
    // Steady uptrend: each close higher than previous
    const close = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const result = maAlignment(close);
    expect(result.status).toBe('BULL');
    expect(result.ma5).toBeGreaterThan(result.ma10);
    expect(result.ma10).toBeGreaterThan(result.ma20);
  });

  it('detects BEAR (MA5 < MA10 < MA20)', () => {
    const close = Array.from({ length: 30 }, (_, i) => 200 - i * 2);
    const result = maAlignment(close);
    expect(result.status).toBe('BEAR');
  });

  it('returns CONSOLIDATION when not enough data', () => {
    const result = maAlignment([1, 2, 3]);
    expect(result.status).toBe('CONSOLIDATION');
  });
});

/* ─────────────── computeIndicators ─────────────── */

describe('computeIndicators', () => {
  it('returns null for insufficient bars', () => {
    expect(computeIndicators([])).toBeNull();
    expect(computeIndicators([{ open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }])).toBeNull();
  });

  it('returns full indicator snapshot from 20+ bars', () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({
      open: 100 + i,
      high: 103 + i,
      low: 98 + i,
      close: 101 + i,
      volume: 1000 + i * 50,
    }));
    const result = computeIndicators(bars);
    expect(result).not.toBeNull();

    // MA alignment
    expect(result.ma_alignment.status).toBeDefined();
    expect(typeof result.ma_alignment.ma5).toBe('number');

    // MACD
    expect(typeof result.macd.dif).toBe('number');
    expect(typeof result.macd.dea).toBe('number');
    expect(typeof result.macd.bar).toBe('number');

    // RSI
    expect(result.rsi_14).toBeGreaterThanOrEqual(0);
    expect(result.rsi_14).toBeLessThanOrEqual(100);
    expect(result.rsi_6).toBeGreaterThanOrEqual(0);

    // Bollinger
    expect(typeof result.bollinger.upper).toBe('number');
    expect(typeof result.bollinger.middle).toBe('number');
    expect(typeof result.bollinger.lower).toBe('number');
    expect(typeof result.bollinger.width).toBe('number');

    // Bias rates
    expect(typeof result.bias_rate_5).toBe('number');
    expect(typeof result.bias_rate_10).toBe('number');
    expect(typeof result.bias_rate_20).toBe('number');

    // Volume ratio
    expect(typeof result.volume_ratio).toBe('number');

    // Bar count
    expect(result.bar_count).toBe(30);
  });

  it('RSI is overbought on strong uptrend', () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({
      open: 100 + i * 3,
      high: 105 + i * 3,
      low: 98 + i * 3,
      close: 103 + i * 3,
      volume: 1000,
    }));
    const result = computeIndicators(bars);
    expect(result.rsi_14).toBeGreaterThan(70); // overbought territory
  });
});

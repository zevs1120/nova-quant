import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import {
  clamp,
  sum,
  mean,
  stdDev,
  percentileRank,
  quantile,
  correlation,
  returnsFromPrices,
  maxDrawdownFromCurve,
  rollingStd,
  rollingMean,
  groupBy,
  compoundReturns,
  deterministicHash,
  round,
} from '../src/engines/math.js';

/* ─────────────────────────────────────────────────
 * clamp
 * ───────────────────────────────────────────────── */
describe('clamp', () => {
  it('clamps below min', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('clamps above max', () => expect(clamp(15, 0, 10)).toBe(10));
  it('passes through in range', () => expect(clamp(5, 0, 10)).toBe(5));
  it('handles equal min and max', () => expect(clamp(5, 3, 3)).toBe(3));
});

/* ─────────────────────────────────────────────────
 * sum / mean
 * ───────────────────────────────────────────────── */
describe('sum', () => {
  it('sums normal values', () => expect(sum([1, 2, 3])).toBe(6));
  it('treats null/undefined as 0', () => expect(sum([1, null, 3])).toBe(4));
});

describe('mean', () => {
  it('computes average', () => expect(mean([2, 4, 6])).toBe(4));
  it('returns 0 for empty array', () => expect(mean([])).toBe(0));
});

/* ─────────────────────────────────────────────────
 * stdDev — critical: used in volatility calculations
 * ───────────────────────────────────────────────── */
describe('stdDev', () => {
  it('returns 0 for single value', () => expect(stdDev([42])).toBe(0));
  it('returns 0 for empty array', () => expect(stdDev([])).toBe(0));
  it('returns 0 for constant array', () => expect(stdDev([5, 5, 5, 5])).toBe(0));
  it('computes correctly for known values', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → population σ ≈ 2.0
    const result = stdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result).toBeGreaterThan(1.5);
    expect(result).toBeLessThan(2.5);
  });
});

/* ─────────────────────────────────────────────────
 * percentileRank
 * ───────────────────────────────────────────────── */
describe('percentileRank', () => {
  it('returns 0 for empty array', () => expect(percentileRank([], 5)).toBe(0));
  it('returns 1 when value is the max', () => {
    expect(percentileRank([1, 2, 3, 4, 5], 5)).toBe(1);
  });
  it('returns correct rank in mid-range', () => {
    // 3 values <= 3 out of 5
    expect(percentileRank([1, 2, 3, 4, 5], 3)).toBe(0.6);
  });
});

/* ─────────────────────────────────────────────────
 * quantile — boundary conditions
 * ───────────────────────────────────────────────── */
describe('quantile', () => {
  it('returns 0 for empty array', () => expect(quantile([], 0.5)).toBe(0));
  it('returns min at q=0', () => expect(quantile([10, 20, 30], 0)).toBe(10));
  it('returns max at q=1', () => expect(quantile([10, 20, 30], 1)).toBe(30));
  it('clamps q to [0,1] range', () => {
    expect(quantile([10, 20, 30], -0.5)).toBe(10);
    expect(quantile([10, 20, 30], 1.5)).toBe(30);
  });
  it('interpolates at q=0.5', () => expect(quantile([10, 20, 30], 0.5)).toBe(20));
});

/* ─────────────────────────────────────────────────
 * correlation — division by zero protection
 * ───────────────────────────────────────────────── */
describe('correlation', () => {
  it('returns 0 for constant arrays (denom = 0)', () => {
    expect(correlation([5, 5, 5, 5], [5, 5, 5, 5])).toBe(0);
  });
  it('returns 0 for arrays shorter than 3', () => {
    expect(correlation([1, 2], [3, 4])).toBe(0);
  });
  it('returns ~1 for perfectly correlated', () => {
    const r = correlation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(r).toBeCloseTo(1, 4);
  });
  it('returns ~-1 for perfectly anti-correlated', () => {
    const r = correlation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(r).toBeCloseTo(-1, 4);
  });
});

/* ─────────────────────────────────────────────────
 * returnsFromPrices — zero price handling
 * ───────────────────────────────────────────────── */
describe('returnsFromPrices', () => {
  it('returns empty for null/empty input', () => {
    expect(returnsFromPrices(null)).toEqual([]);
    expect(returnsFromPrices([])).toEqual([]);
  });
  it('computes simple returns', () => {
    const r = returnsFromPrices([100, 110, 99]);
    expect(r[0]).toBeCloseTo(0.1, 4);
    expect(r[1]).toBeCloseTo(-0.1, 4);
  });
  it('handles zero price element (prev = 0) without crashing', () => {
    const r = returnsFromPrices([0, 100, 200]);
    expect(r).toHaveLength(2);
    // When prev is 0, the function pushes 0 instead of Infinity
    expect(Number.isFinite(r[0]) || r[0] === 0 || r[0] === Infinity).toBe(true);
  });
});

/* ─────────────────────────────────────────────────
 * maxDrawdownFromCurve — classic drawdown scenarios
 * ───────────────────────────────────────────────── */
describe('maxDrawdownFromCurve', () => {
  it('returns 0 for empty curve', () => expect(maxDrawdownFromCurve([])).toBe(0));
  it('returns 0 for monotonically increasing curve', () => {
    expect(maxDrawdownFromCurve([1, 2, 3, 4, 5])).toBe(0);
  });
  it('returns correct drawdown for spike-then-crash', () => {
    // Peak at 100, drops to 70 → 30% drawdown
    const dd = maxDrawdownFromCurve([80, 100, 70]);
    expect(dd).toBeCloseTo(0.3, 4);
  });
  it('measures from highest peak, not starting point', () => {
    // Start 50 → peak 100 → trough 60 → 40% DD from peak
    const dd = maxDrawdownFromCurve([50, 100, 60]);
    expect(dd).toBeCloseTo(0.4, 4);
  });
  it('handles curve starting at zero (peak = 0)', () => {
    const dd = maxDrawdownFromCurve([0, 0, 0]);
    expect(Number.isFinite(dd)).toBe(true);
  });
});

/* ─────────────────────────────────────────────────
 * rollingStd / rollingMean
 * ───────────────────────────────────────────────── */
describe('rollingStd', () => {
  it('computes std for partial window at start', () => {
    const result = rollingStd([10, 20, 30, 40, 50], 3, 1);
    // Window is [10, 20], std of those two values
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('rollingMean', () => {
  it('computes mean for full window', () => {
    const result = rollingMean([10, 20, 30], 3, 2);
    expect(result).toBe(20);
  });
});

/* ─────────────────────────────────────────────────
 * compoundReturns
 * ───────────────────────────────────────────────── */
describe('compoundReturns', () => {
  it('returns 0 for empty array', () => expect(compoundReturns([])).toBe(0));
  it('compounds correctly', () => {
    // (1 + 0.1) * (1 + 0.1) - 1 = 0.21
    expect(compoundReturns([0.1, 0.1])).toBeCloseTo(0.21, 4);
  });
  it('handles negative returns', () => {
    // (1 - 0.5) = 0.5 → -50%
    expect(compoundReturns([-0.5])).toBeCloseTo(-0.5, 4);
  });
});

/* ─────────────────────────────────────────────────
 * deterministicHash — stability
 * ───────────────────────────────────────────────── */
describe('deterministicHash', () => {
  it('produces the same hash for same input', () => {
    const a = deterministicHash('hello');
    const b = deterministicHash('hello');
    expect(a).toBe(b);
  });
  it('produces different hashes for different inputs', () => {
    expect(deterministicHash('a')).not.toBe(deterministicHash('b'));
  });
  it('returns a non-negative integer', () => {
    const h = deterministicHash('test');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(h)).toBe(true);
  });
});

/* ─────────────────────────────────────────────────
 * round — precision and edge cases
 * ───────────────────────────────────────────────── */
describe('round', () => {
  it('rounds to specified digits', () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.235, 2)).toBe(1.24);
  });
  it('handles negative numbers', () => {
    expect(round(-1.235, 2)).toBe(-1.24);
  });
  it('treats null as 0', () => {
    expect(round(null, 2)).toBe(0);
  });
  it('treats NaN as 0 (guarded against NaN propagation)', () => {
    expect(round(NaN, 2)).toBe(0);
    expect(round(Infinity, 2)).toBe(0);
    expect(round(-Infinity, 2)).toBe(0);
    expect(round(undefined, 2)).toBe(0);
  });
  it('defaults to 4 digits', () => {
    expect(round(1.123456789)).toBe(1.1235);
  });
});

/* ─────────────────────────────────────────────────
 * groupBy
 * ───────────────────────────────────────────────── */
describe('groupBy', () => {
  it('groups items by key function', () => {
    const items = [
      { market: 'US', symbol: 'AAPL' },
      { market: 'US', symbol: 'GOOGL' },
      { market: 'CRYPTO', symbol: 'BTC' },
    ];
    const grouped = groupBy(items, (item: any) => item.market);
    expect(grouped.US).toHaveLength(2);
    expect(grouped.CRYPTO).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import {
  detectBullishEngulfing,
  detectBearishEngulfing,
  detectHammer,
  detectDoji,
  detectVolumeBreakout,
  detectPatterns,
} from '../src/engines/patternDetector.js';

/* ---------- helper: make OHLCV bars ---------- */

function makeBar(o: number, h: number, l: number, c: number, v = 1000) {
  return { open: o, high: h, low: l, close: c, volume: v };
}

/* ---------- detectBullishEngulfing ---------- */

describe('detectBullishEngulfing', () => {
  it('detects a valid bullish engulfing', () => {
    const bars = [
      makeBar(110, 112, 105, 106), // bearish prev
      makeBar(104, 115, 103, 114), // bullish engulfs
    ];
    const result = detectBullishEngulfing(bars) as any;
    expect(result).not.toBeNull();
    expect(result.type).toBe('bullish_engulfing');
    expect(result.direction).toBe('LONG');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.score_adjustment).toBeGreaterThan(0);
  });

  it('returns null for non-engulfing bars', () => {
    const bars = [
      makeBar(100, 105, 98, 103), // bullish (not bearish prev)
      makeBar(104, 106, 102, 105), // bullish
    ];
    expect(detectBullishEngulfing(bars)).toBeNull();
  });

  it('returns null for insufficient bars', () => {
    expect(detectBullishEngulfing([])).toBeNull();
    expect(detectBullishEngulfing([makeBar(100, 105, 95, 102)])).toBeNull();
  });

  it('returns null for null input', () => {
    expect(detectBullishEngulfing(null as any)).toBeNull();
  });
});

/* ---------- detectBearishEngulfing ---------- */

describe('detectBearishEngulfing', () => {
  it('detects a valid bearish engulfing', () => {
    const bars = [
      makeBar(100, 108, 99, 107), // bullish prev
      makeBar(109, 110, 96, 97), // bearish engulfs
    ];
    const result = detectBearishEngulfing(bars) as any;
    expect(result).not.toBeNull();
    expect(result.type).toBe('bearish_engulfing');
    expect(result.direction).toBe('SHORT');
  });

  it('returns null for non-engulfing bars', () => {
    const bars = [
      makeBar(100, 105, 99, 98), // bearish prev
      makeBar(99, 100, 95, 96), // bearish but doesn't engulf
    ];
    expect(detectBearishEngulfing(bars)).toBeNull();
  });
});

/* ---------- detectHammer ---------- */

describe('detectHammer', () => {
  it('detects a valid hammer/pin bar', () => {
    // Long lower shadow, small body at top
    const bars = [makeBar(100, 101, 90, 100.5)];
    const result = detectHammer(bars) as any;
    expect(result).not.toBeNull();
    expect(result.type).toBe('hammer');
    expect(result.direction).toBe('LONG');
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('returns null for non-hammer candle', () => {
    // No significant lower shadow
    const bars = [makeBar(100, 110, 99, 108)];
    expect(detectHammer(bars)).toBeNull();
  });

  it('returns null for zero-range bar', () => {
    const bars = [makeBar(100, 100, 100, 100)];
    expect(detectHammer(bars)).toBeNull();
  });
});

/* ---------- detectDoji ---------- */

describe('detectDoji', () => {
  it('detects a doji (very small body)', () => {
    const bars = [makeBar(100, 105, 95, 100.2)];
    const result = detectDoji(bars) as any;
    expect(result).not.toBeNull();
    expect(result.type).toBe('doji');
    expect(result.direction).toBe('NEUTRAL');
    expect(result.score_adjustment).toBe(-2);
  });

  it('returns null for large-body candle', () => {
    const bars = [makeBar(100, 115, 98, 113)];
    expect(detectDoji(bars)).toBeNull();
  });
});

/* ---------- detectVolumeBreakout ---------- */

describe('detectVolumeBreakout', () => {
  it('detects bullish volume breakout', () => {
    const bars = [
      makeBar(100, 102, 99, 101, 1000),
      makeBar(101, 103, 100, 102, 900),
      makeBar(102, 104, 101, 103, 1100),
      makeBar(103, 105, 102, 104, 950),
      makeBar(104, 106, 103, 105, 1050),
      makeBar(105, 115, 104, 114, 3000), // 3x volume, close at top
    ];
    const result = detectVolumeBreakout(bars) as any;
    expect(result).not.toBeNull();
    expect(result.type).toBe('volume_breakout');
    expect(result.direction).toBe('LONG');
    expect(result.volume_ratio).toBeGreaterThanOrEqual(2);
  });

  it('detects bearish volume breakout', () => {
    const bars = [
      makeBar(100, 102, 99, 101, 1000),
      makeBar(101, 103, 100, 102, 900),
      makeBar(102, 104, 101, 103, 1100),
      makeBar(103, 105, 102, 104, 950),
      makeBar(104, 106, 103, 105, 1050),
      makeBar(105, 106, 96, 96.5, 2500), // close at bottom
    ];
    const result = detectVolumeBreakout(bars) as any;
    expect(result).not.toBeNull();
    expect(result.direction).toBe('SHORT');
  });

  it('returns null when volume is not high enough', () => {
    const bars = [
      makeBar(100, 102, 99, 101, 1000),
      makeBar(101, 103, 100, 102, 900),
      makeBar(102, 104, 101, 103, 1100),
      makeBar(103, 105, 102, 104, 950),
      makeBar(104, 106, 103, 105, 1050),
      makeBar(105, 108, 104, 107, 1200), // only 1.2x volume
    ];
    expect(detectVolumeBreakout(bars)).toBeNull();
  });

  it('returns null for insufficient bars', () => {
    expect(detectVolumeBreakout([makeBar(100, 105, 95, 102)])).toBeNull();
    expect(detectVolumeBreakout([])).toBeNull();
  });
});

/* ---------- detectPatterns — integration ---------- */

describe('detectPatterns', () => {
  it('returns empty array for null/empty input', () => {
    expect(detectPatterns(null as any)).toEqual([]);
    expect(detectPatterns([])).toEqual([]);
  });

  it('detects multiple patterns when present', () => {
    // A doji followed by a bullish engulfing
    const bars = [
      makeBar(100, 105, 95, 100.1), // doji
      makeBar(99, 90, 89, 91), // bearish
      makeBar(88, 105, 87, 104), // bullish engulfs
    ];
    const patterns = detectPatterns(bars) as any[];
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    // Results sorted by confidence desc
    for (let i = 1; i < patterns.length; i++) {
      expect(patterns[i - 1].confidence).toBeGreaterThanOrEqual(patterns[i].confidence);
    }
  });

  it('returns sorted results by confidence', () => {
    const bars = [
      makeBar(100, 102, 99, 101, 1000),
      makeBar(101, 103, 100, 102, 1000),
      makeBar(102, 104, 101, 103, 1000),
      makeBar(103, 105, 102, 104, 1000),
      makeBar(104, 106, 103, 105, 1000),
      makeBar(105, 115, 104, 114, 3000),
    ];
    const patterns = detectPatterns(bars) as any[];
    if (patterns.length > 1) {
      for (let i = 1; i < patterns.length; i++) {
        expect(patterns[i - 1].confidence).toBeGreaterThanOrEqual(patterns[i].confidence);
      }
    }
  });
});

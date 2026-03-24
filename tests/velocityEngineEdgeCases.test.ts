import { describe, expect, it } from 'vitest';
import { getSeriesKey, runVelocityEngine } from '../src/engines/velocityEngine.js';

/* ---------- helpers ---------- */

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    signal_id: 'sig-1',
    market: 'CRYPTO',
    symbol: 'BTC-USDT',
    timeframe: '4H',
    entry_min: 68000,
    entry_max: 69000,
    ...overrides
  };
}

function makeTrade(overrides: Record<string, unknown> = {}) {
  return {
    signal_id: 'sig-1',
    market: 'CRYPTO',
    symbol: 'BTC-USDT',
    entry: 68500,
    ...overrides
  };
}

const anchorTime = Date.now();

/* ---------- synthetic series generation ---------- */

describe('synthetic series generation', () => {
  it('produces deterministic output for same inputs', () => {
    const r1 = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    const r2 = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    // Same series should produce identical close prices
    const s1 = r1.series[0];
    const s2 = r2.series[0];
    expect(s1.close).toEqual(s2.close);
  });

  it('all generated prices are positive', () => {
    const result = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    for (const series of result.series) {
      expect(series.close.every((p: number) => p > 0)).toBe(true);
    }
  });

  it('always includes BTC-USDT and QQQ benchmark series', () => {
    const result = runVelocityEngine({
      signals: [makeSignal({ market: 'US', symbol: 'AAPL', timeframe: '1D' })],
      trades: [],
      velocitySeed: null,
      featureSeries: null,
      anchorTime
    });
    const keys = Object.keys(result.series_index);
    expect(keys).toContain(getSeriesKey('CRYPTO', 'BTC-USDT', '4H'));
    expect(keys).toContain(getSeriesKey('US', 'QQQ', '1D'));
  });
});

/* ---------- velocity arrays ---------- */

describe('velocity arrays', () => {
  it('output arrays match close array length', () => {
    const result = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    for (const series of result.series) {
      const len = series.close.length;
      expect(series.velocity.v_norm.length).toBe(len);
      expect(series.velocity.acceleration.length).toBe(len);
      expect(series.velocity.percentile.length).toBe(len);
      expect(series.velocity.trend_strength.length).toBe(len);
      expect(series.velocity.vol_percentile.length).toBe(len);
    }
  });

  it('percentile values are bounded between 0 and 1', () => {
    const result = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    for (const series of result.series) {
      for (const p of series.velocity.percentile) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it('acceleration first element is 0', () => {
    const result = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    for (const series of result.series) {
      expect(series.velocity.acceleration[0]).toBe(0);
    }
  });

  it('trend_strength is clamped between 0 and 1', () => {
    const result = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    for (const series of result.series) {
      for (const t of series.velocity.trend_strength) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      }
    }
  });
});

/* ---------- event study ---------- */

describe('event study', () => {
  it('events have valid event types', () => {
    const result = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    for (const series of result.series) {
      for (const event of series.event_study.events) {
        expect(['CROSS_ABOVE_90', 'CROSS_BELOW_10']).toContain(event.event_type);
      }
    }
  });

  it('events include forward returns for configured horizons', () => {
    const result = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    for (const series of result.series) {
      for (const event of series.event_study.events) {
        // horizons = [1, 3, 7]
        expect(event.forward[1]).toBeTruthy();
        expect(typeof event.forward[1].return).toBe('number');
        expect(typeof event.forward[1].max_drawdown).toBe('number');
      }
    }
  });

  it('conditional_stats has both event types', () => {
    const result = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    for (const series of result.series) {
      expect(series.event_study.conditional_stats.CROSS_ABOVE_90).toBeTruthy();
      expect(series.event_study.conditional_stats.CROSS_BELOW_10).toBeTruthy();
    }
  });
});

/* ---------- primary key resolution ---------- */

describe('primary key resolution', () => {
  it('prefers BTC-USDT 4H as primary', () => {
    const result = runVelocityEngine({
      signals: [makeSignal({ market: 'US', symbol: 'AAPL', timeframe: '1D' })],
      trades: [],
      velocitySeed: null,
      featureSeries: null,
      anchorTime
    });
    expect(result.primary_key).toBe(getSeriesKey('CRYPTO', 'BTC-USDT', '4H'));
  });

  it('falls back gracefully with empty signals and trades', () => {
    const result = runVelocityEngine({ signals: [], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    // Still generates BTC-USDT and QQQ benchmark series
    expect(result.series.length).toBeGreaterThanOrEqual(2);
    expect(result.primary_key).toBe(getSeriesKey('CRYPTO', 'BTC-USDT', '4H'));
  });
});

/* ---------- global stats ---------- */

describe('global stats aggregation', () => {
  it('global fields use primary series latest values', () => {
    const result = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    expect(typeof result.global.current).toBe('number');
    expect(typeof result.global.percentile).toBe('number');
    expect(typeof result.global.acceleration).toBe('number');
    expect(result.global.stats_7d).toBeTruthy();
    expect(typeof result.global.stats_7d.n_events).toBe('number');
    expect(typeof result.global.stats_7d.next_7d_up_prob).toBe('number');
  });

  it('includes rule summaries in both languages', () => {
    const result = runVelocityEngine({ signals: [makeSignal()], trades: [], velocitySeed: null, featureSeries: null, anchorTime });
    expect(result.global.rule_summary_en).toBeTruthy();
    expect(result.global.rule_summary_zh).toBeTruthy();
    expect(result.global.how_used_en.length).toBeGreaterThan(0);
    expect(result.global.how_used_zh.length).toBeGreaterThan(0);
  });

  it('uses custom featureSeries when provided', () => {
    const customSeries = [{
      market: 'US',
      symbol: 'SPY',
      timeframe: '1D',
      dates: Array.from({ length: 120 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`),
      close: Array.from({ length: 120 }, (_, i) => 400 + i * 0.5 + Math.sin(i / 5) * 2)
    }];
    const result = runVelocityEngine({
      signals: [],
      trades: [],
      velocitySeed: null,
      featureSeries: customSeries,
      anchorTime
    });
    expect(result.series.length).toBe(1);
    expect(result.series[0].symbol).toBe('SPY');
  });
});

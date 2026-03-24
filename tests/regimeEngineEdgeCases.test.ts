import { describe, expect, it } from 'vitest';
import { runRegimeEngine } from '../src/engines/regimeEngine.js';
import { REGIME_THRESHOLDS } from '../src/engines/params.js';
import { getSeriesKey } from '../src/engines/velocityEngine.js';

/* ---------- helpers ---------- */

function makeSeries(
  market: string,
  symbol: string,
  timeframe: string,
  overrides: { trend_strength?: number; vol_percentile?: number } = {}
) {
  const trend = overrides.trend_strength ?? 0.5;
  const vol = overrides.vol_percentile ?? 0.5;
  return {
    market,
    symbol,
    timeframe,
    close: [100, 101, 102],
    dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
    latest: { trend_strength: trend, vol_percentile: vol, v_norm: 0, acceleration: 0, percentile: 0.5 }
  };
}

function makeSeriesIndex(entries: Array<ReturnType<typeof makeSeries>>) {
  return Object.fromEntries(
    entries.map((s) => [getSeriesKey(s.market, s.symbol, s.timeframe), s])
  );
}

/* ---------- regime classification boundary tests ---------- */

describe('regime classification via runRegimeEngine', () => {
  it('classifies RISK_ON when trend high, vol low, risk-off low', () => {
    const result = runRegimeEngine({
      velocityState: {
        series_index: makeSeriesIndex([
          makeSeries('US', 'QQQ', '1D', { trend_strength: 0.8, vol_percentile: 0.3 }),
          makeSeries('CRYPTO', 'BTC-USDT', '4H', { trend_strength: 0.75, vol_percentile: 0.25 })
        ]),
        primary_key: getSeriesKey('CRYPTO', 'BTC-USDT', '4H')
      }
    });
    expect(result.primary).toBeTruthy();
    // Both series should show strong trend → RISK_ON
    const regimes = Object.values(result.snapshots).map((s: any) => s.regime_label);
    expect(regimes).toContain('RISK_ON');
  });

  it('classifies RISK_OFF when trend weak', () => {
    const result = runRegimeEngine({
      velocityState: {
        series_index: makeSeriesIndex([
          makeSeries('US', 'QQQ', '1D', { trend_strength: 0.1, vol_percentile: 0.9 }),
          makeSeries('CRYPTO', 'BTC-USDT', '4H', { trend_strength: 0.15, vol_percentile: 0.85 })
        ]),
        primary_key: getSeriesKey('US', 'QQQ', '1D')
      }
    });
    const regimes = Object.values(result.snapshots).map((s: any) => s.regime_label);
    expect(regimes.every((r: string) => r === 'RISK_OFF')).toBe(true);
  });

  it('classifies RISK_OFF when vol_percentile >= vol_risk_off threshold', () => {
    const result = runRegimeEngine({
      velocityState: {
        series_index: makeSeriesIndex([
          makeSeries('US', 'QQQ', '1D', {
            trend_strength: 0.6,
            vol_percentile: REGIME_THRESHOLDS.vol_risk_off
          }),
          makeSeries('CRYPTO', 'BTC-USDT', '4H', {
            trend_strength: 0.6,
            vol_percentile: REGIME_THRESHOLDS.vol_risk_off
          })
        ]),
        primary_key: getSeriesKey('US', 'QQQ', '1D')
      }
    });
    const regimes = Object.values(result.snapshots).map((s: any) => s.regime_label);
    // With vol at the risk_off threshold, the blended risk_off_score drives classification
    expect(regimes.every((r: string) => r === 'RISK_OFF')).toBe(true);
  });

  it('classifies NEUTRAL when trend and vol are moderate', () => {
    const result = runRegimeEngine({
      velocityState: {
        series_index: makeSeriesIndex([
          makeSeries('US', 'QQQ', '1D', { trend_strength: 0.45, vol_percentile: 0.5 }),
          makeSeries('CRYPTO', 'BTC-USDT', '4H', { trend_strength: 0.45, vol_percentile: 0.5 })
        ]),
        primary_key: getSeriesKey('CRYPTO', 'BTC-USDT', '4H')
      }
    });
    const regimes = Object.values(result.snapshots).map((s: any) => s.regime_label);
    expect(regimes).toContain('NEUTRAL');
  });
});

/* ---------- cross-market risk snapshot ---------- */

describe('cross-market risk snapshot', () => {
  it('returns all four risk fields clamped between 0 and 1', () => {
    const result = runRegimeEngine({
      velocityState: {
        series_index: makeSeriesIndex([
          makeSeries('US', 'QQQ', '1D', { trend_strength: 0.6, vol_percentile: 0.4 }),
          makeSeries('CRYPTO', 'BTC-USDT', '4H', { trend_strength: 0.7, vol_percentile: 0.3 })
        ]),
        primary_key: getSeriesKey('CRYPTO', 'BTC-USDT', '4H')
      }
    });
    const cm = result.cross_market;
    expect(cm.btc_nasdaq_corr).toBeGreaterThanOrEqual(0);
    expect(cm.btc_nasdaq_corr).toBeLessThanOrEqual(1);
    expect(cm.vol_spike).toBeGreaterThanOrEqual(0);
    expect(cm.vol_spike).toBeLessThanOrEqual(1);
    expect(cm.drawdown_stress).toBeGreaterThanOrEqual(0);
    expect(cm.drawdown_stress).toBeLessThanOrEqual(1);
    expect(cm.risk_off_score).toBeGreaterThanOrEqual(0);
    expect(cm.risk_off_score).toBeLessThanOrEqual(1);
  });

  it('handles empty series_index without crashing', () => {
    const result = runRegimeEngine({
      velocityState: { series_index: {}, primary_key: null }
    });
    expect(result.cross_market).toBeTruthy();
    expect(result.primary).toBeNull();
    expect(Object.keys(result.snapshots)).toHaveLength(0);
  });
});

/* ---------- primary selection ---------- */

describe('primary snapshot selection', () => {
  it('selects the primary_key snapshot', () => {
    const pk = getSeriesKey('US', 'QQQ', '1D');
    const result = runRegimeEngine({
      velocityState: {
        series_index: makeSeriesIndex([
          makeSeries('US', 'QQQ', '1D'),
          makeSeries('CRYPTO', 'BTC-USDT', '4H')
        ]),
        primary_key: pk
      }
    });
    expect(result.primary?.key).toBe(pk);
  });

  it('falls back to first series when primary_key is missing', () => {
    const result = runRegimeEngine({
      velocityState: {
        series_index: makeSeriesIndex([makeSeries('CRYPTO', 'ETH-USDT', '4H')]),
        primary_key: 'nonexistent'
      }
    });
    expect(result.primary).toBeTruthy();
    expect(result.primary?.symbol).toBe('ETH-USDT');
  });
});

/* ---------- output contract ---------- */

describe('regime engine output contract', () => {
  it('each snapshot has all required fields', () => {
    const result = runRegimeEngine({
      velocityState: {
        series_index: makeSeriesIndex([makeSeries('US', 'AAPL', '1D')]),
        primary_key: getSeriesKey('US', 'AAPL', '1D')
      }
    });
    const snap = Object.values(result.snapshots)[0] as any;
    expect(snap.key).toBeTruthy();
    expect(snap.market).toBe('US');
    expect(snap.symbol).toBe('AAPL');
    expect(snap.regime_id).toMatch(/^RGM_/);
    expect(['RISK_ON', 'NEUTRAL', 'RISK_OFF']).toContain(snap.regime_label);
    expect(typeof snap.trend_strength).toBe('number');
    expect(typeof snap.vol_percentile).toBe('number');
    expect(typeof snap.risk_off_score).toBe('number');
    expect(snap.cross_market).toBeTruthy();
  });
});

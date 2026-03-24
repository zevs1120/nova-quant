import { REGIME_THRESHOLDS } from './params.js';
import { clamp, correlation, returnsFromPrices, round } from './math.js';
import { getSeriesKey } from './velocityEngine.js';

function recentDrawdown(close, window = 20) {
  if (!close?.length) return 0;
  const slice = close.slice(-window);
  let peak = slice[0];
  let worst = 0;
  for (const value of slice) {
    peak = Math.max(peak, value);
    const dd = peak === 0 ? 0 : (value - peak) / peak;
    worst = Math.min(worst, dd);
  }
  return Math.abs(worst);
}

function classifyRegime(trendStrength, volPercentile, riskOffScore) {
  if (
    trendStrength >= REGIME_THRESHOLDS.trend_risk_on &&
    volPercentile < REGIME_THRESHOLDS.vol_risk_off &&
    riskOffScore < REGIME_THRESHOLDS.risk_off_soft
  ) {
    return 'RISK_ON';
  }

  if (
    trendStrength <= REGIME_THRESHOLDS.trend_risk_off ||
    volPercentile >= REGIME_THRESHOLDS.vol_risk_off ||
    riskOffScore >= REGIME_THRESHOLDS.risk_off_hard
  ) {
    return 'RISK_OFF';
  }

  return 'NEUTRAL';
}

function fallbackSeries(seriesIndex, market) {
  const values = Object.values(seriesIndex);
  if (!values.length) return null;
  const scoped = values.find((series) => series.market === market);
  return scoped || values[0];
}

function crossMarketRiskSnapshot(seriesIndex) {
  const btc =
    seriesIndex[getSeriesKey('CRYPTO', 'BTC-USDT', '4H')] || fallbackSeries(seriesIndex, 'CRYPTO');
  const qqq = seriesIndex[getSeriesKey('US', 'QQQ', '1D')] || fallbackSeries(seriesIndex, 'US');

  const btcReturns = returnsFromPrices(btc?.close || []);
  const qqqReturns = returnsFromPrices(qqq?.close || []);
  const corr = Math.abs(correlation(btcReturns.slice(-30), qqqReturns.slice(-30)));
  const volSpike = clamp(
    ((btc?.latest?.vol_percentile || 0) + (qqq?.latest?.vol_percentile || 0)) / 2,
    0,
    1,
  );
  const ddStress = clamp((recentDrawdown(btc?.close) + recentDrawdown(qqq?.close)) / 0.3, 0, 1);
  const riskOffScore = clamp(0.35 * corr + 0.45 * volSpike + 0.2 * ddStress, 0, 1);

  return {
    btc_nasdaq_corr: round(corr, 4),
    vol_spike: round(volSpike, 4),
    drawdown_stress: round(ddStress, 4),
    risk_off_score: round(riskOffScore, 4),
  };
}

export function runRegimeEngine({ velocityState }) {
  const seriesIndex = velocityState.series_index || {};
  const crossMarket = crossMarketRiskSnapshot(seriesIndex);
  const snapshots = {};

  for (const [key, series] of Object.entries(seriesIndex)) {
    const trend = series?.latest?.trend_strength ?? 0.5;
    const volPct = series?.latest?.vol_percentile ?? 0.5;
    const riskOff = clamp(
      crossMarket.risk_off_score * 0.65 + volPct * 0.2 + (1 - trend) * 0.15,
      0,
      1,
    );
    const regime = classifyRegime(trend, volPct, riskOff);

    snapshots[key] = {
      key,
      market: series.market,
      symbol: series.symbol,
      timeframe: series.timeframe,
      regime_id: `RGM_${regime}`,
      regime_label: regime,
      trend_strength: round(trend, 4),
      vol_percentile: round(volPct, 4),
      risk_off_score: round(riskOff, 4),
      cross_market: crossMarket,
    };
  }

  return {
    cross_market: crossMarket,
    snapshots,
    primary: snapshots[velocityState.primary_key] || Object.values(snapshots)[0] || null,
  };
}

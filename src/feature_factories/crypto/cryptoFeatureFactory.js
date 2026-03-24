import { annualizedVolatility, mean, pctChange } from '../../quant/math.js';
import { groupBy, sortByDate } from '../../normalizers/utils.js';

function trailingReturns(closes, endIndex, window = 20) {
  const start = Math.max(1, endIndex - window + 1);
  const out = [];
  for (let i = start; i <= endIndex; i += 1) {
    out.push(pctChange(closes[i - 1], closes[i]));
  }
  return out;
}

function rollingAverage(values, endIndex, window = 20) {
  const start = Math.max(0, endIndex - window + 1);
  return mean(values.slice(start, endIndex + 1));
}

function safeRet(closes, i, lag) {
  if (i - lag < 0) return 0;
  return pctChange(closes[i - lag], closes[i]);
}

export function buildCryptoFeatures(normalizedCrypto) {
  const bars = normalizedCrypto?.bars || [];
  const grouped = groupBy(bars, (row) => row.product_id);

  const benchmarkRows = {
    BTC: Object.fromEntries((grouped.get('BTC-USDT') || []).map((row) => [row.date, row])),
    ETH: Object.fromEntries((grouped.get('ETH-USDT') || []).map((row) => [row.date, row])),
  };

  const rows = [];

  for (const [productId, productRows] of grouped.entries()) {
    const ordered = sortByDate(productRows, 'date');
    const closes = ordered.map((row) => row.close);
    const volumes = ordered.map((row) => row.volume);

    for (let i = 0; i < ordered.length; i += 1) {
      const row = ordered[i];
      const mom3 = safeRet(closes, i, 3);
      const mom7 = safeRet(closes, i, 7);
      const mom30 = safeRet(closes, i, 30);
      const vol20 = annualizedVolatility(trailingReturns(closes, i, 20), 365);
      const volExp = row.volume / Math.max(1e-9, rollingAverage(volumes, i, 20));
      const intradayRange = (row.high - row.low) / Math.max(1e-9, row.close);

      const btc = benchmarkRows.BTC[row.date];
      const eth = benchmarkRows.ETH[row.date];
      const btcRel = btc ? row.returns - btc.returns : 0;
      const ethRel = eth ? row.returns - eth.returns : btcRel;
      const benchmarkPulse = ((btc?.returns || 0) + (eth?.returns || 0)) / 2;
      const riskOn =
        benchmarkPulse > 0.004 ? 'risk_on' : benchmarkPulse < -0.004 ? 'risk_off' : 'neutral';

      rows.push({
        asset_class: 'crypto',
        product_id: productId,
        symbol: row.symbol,
        date: row.date,
        timestamp: row.timestamp,
        source: row.source,
        fetched_at: row.fetched_at,
        data_status: 'derived',
        momentum_3d: Number(mom3.toFixed(6)),
        momentum_7d: Number(mom7.toFixed(6)),
        momentum_30d: Number(mom30.toFixed(6)),
        realized_vol_20d: Number(vol20.toFixed(6)),
        volume_expansion_20d: Number(volExp.toFixed(6)),
        intraday_range_proxy: Number(intradayRange.toFixed(6)),
        benchmark_rel_btc: Number(btcRel.toFixed(6)),
        benchmark_rel_eth: Number(ethRel.toFixed(6)),
        regime_risk_proxy: riskOn,
        returns_1d: row.returns,
        trades_count: row.trades_count,
        close: row.close,
      });
    }
  }

  return {
    asset_class: 'crypto',
    feature_set_name: 'crypto_spot_v1',
    feature_manifest: [
      'momentum_3d',
      'momentum_7d',
      'momentum_30d',
      'realized_vol_20d',
      'volume_expansion_20d',
      'intraday_range_proxy',
      'benchmark_rel_btc',
      'benchmark_rel_eth',
      'regime_risk_proxy',
    ],
    rows,
  };
}

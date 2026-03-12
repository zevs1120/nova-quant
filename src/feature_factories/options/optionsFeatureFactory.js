import { mean } from '../../quant/math.js';
import { groupBy, sortByDate } from '../../normalizers/utils.js';

function rollingAvg(values, i, window) {
  const start = Math.max(0, i - window + 1);
  return mean(values.slice(start, i + 1));
}

function buildChainTermMap(snapshots) {
  const grouped = groupBy(snapshots, (row) => `${row.underlying_symbol}:${row.date}`);
  const map = {};
  for (const [key, rows] of grouped.entries()) {
    const near = rows.filter((row) => row.dte > 0 && row.dte <= 20);
    const far = rows.filter((row) => row.dte >= 45 && row.dte <= 90);
    const atm = rows.filter((row) => Math.abs((row.moneyness || 1) - 1) <= 0.05);

    const nearIv = near.length ? mean(near.map((row) => row.implied_volatility)) : 0;
    const farIv = far.length ? mean(far.map((row) => row.implied_volatility)) : nearIv;
    const callIv = rows.filter((row) => row.option_type === 'call');
    const putIv = rows.filter((row) => row.option_type === 'put');

    map[key] = {
      term_structure_proxy: farIv - nearIv,
      skew_proxy: (callIv.length ? mean(callIv.map((row) => row.implied_volatility)) : 0) - (putIv.length ? mean(putIv.map((row) => row.implied_volatility)) : 0),
      atm_iv_level: atm.length ? mean(atm.map((row) => row.implied_volatility)) : mean(rows.map((row) => row.implied_volatility)),
      chain_concentration: rows.length
        ? rows
          .slice()
          .sort((a, b) => b.open_interest - a.open_interest)
          .slice(0, 5)
          .reduce((sum, row) => sum + row.open_interest, 0) / rows.reduce((sum, row) => sum + row.open_interest, 0)
        : 0
    };
  }
  return map;
}

export function buildOptionFeatures(normalizedOptions) {
  const snapshots = normalizedOptions?.snapshots || [];
  const chains = normalizedOptions?.chains || [];
  const chainMap = Object.fromEntries(
    chains.map((row) => [`${row.underlying_symbol}:${row.date}`, row.derived_chain_metrics || {}])
  );
  const chainTermMap = buildChainTermMap(snapshots);
  const groupedByContract = groupBy(snapshots, (row) => row.option_ticker);
  const rows = [];

  for (const [contract, contractRows] of groupedByContract.entries()) {
    const ordered = sortByDate(contractRows, 'date');
    const ivs = ordered.map((row) => row.implied_volatility);
    const mids = ordered.map((row) => row.mid);
    const volumes = ordered.map((row) => row.volume);

    for (let i = 0; i < ordered.length; i += 1) {
      const row = ordered[i];
      const prevIv = ivs[Math.max(0, i - 5)] || ivs[i];
      const prevMid = mids[Math.max(0, i - 3)] || mids[i];
      const avgVol10 = Math.max(1, rollingAvg(volumes, i, 10));
      const spreadPct = row.mid > 0 ? (row.ask - row.bid) / row.mid : 0;
      const signedMoneyness = row.option_type === 'call' ? row.moneyness - 1 : 1 - row.moneyness;

      const key = `${row.underlying_symbol}:${row.date}`;
      const chainMetrics = chainMap[key] || {};
      const chainTerm = chainTermMap[key] || {};

      rows.push({
        asset_class: 'option',
        option_ticker: contract,
        underlying_symbol: row.underlying_symbol,
        option_type: row.option_type,
        date: row.date,
        timestamp: row.timestamp,
        source: row.source,
        fetched_at: row.fetched_at,
        data_status: 'derived',
        moneyness: Number(row.moneyness.toFixed(6)),
        signed_moneyness: Number(signedMoneyness.toFixed(6)),
        dte: row.dte,
        implied_volatility: Number(row.implied_volatility.toFixed(6)),
        implied_vol_change_5d: Number((row.implied_volatility - prevIv).toFixed(6)),
        skew_proxy: Number((chainMetrics.call_put_iv_skew ?? chainTerm.skew_proxy ?? 0).toFixed(6)),
        term_structure_proxy: Number((chainTerm.term_structure_proxy ?? 0).toFixed(6)),
        bid_ask_spread_pct: Number(spreadPct.toFixed(6)),
        chain_concentration: Number((chainMetrics.concentration_top5_oi ?? chainTerm.chain_concentration ?? 0).toFixed(6)),
        oi_volume_anomaly: Number((row.volume / avgVol10).toFixed(6)),
        liquidity_score: Number(((row.open_interest + row.volume) / Math.max(1, spreadPct * 10000)).toFixed(6)),
        underlying_rel_price: Number((row.mid / Math.max(1e-9, row.underlying_price)).toFixed(6)),
        underlying_price: row.underlying_price,
        mid_price: row.mid,
        premium_momentum_3d: Number((row.mid / Math.max(1e-9, prevMid) - 1).toFixed(6))
      });
    }
  }

  return {
    asset_class: 'option',
    feature_set_name: 'options_chain_v1',
    feature_manifest: [
      'moneyness',
      'signed_moneyness',
      'dte',
      'implied_volatility',
      'implied_vol_change_5d',
      'skew_proxy',
      'term_structure_proxy',
      'bid_ask_spread_pct',
      'chain_concentration',
      'oi_volume_anomaly',
      'liquidity_score',
      'underlying_rel_price',
      'premium_momentum_3d'
    ],
    rows
  };
}

import { groupBy, sortByDate } from '../normalizers/utils.js';
import { assignSplitByDate, buildDateSplits, dateRange, splitCounts } from './splitUtils.js';

function buildFutureOptionMap(featureRows, horizon = 3) {
  const grouped = groupBy(featureRows, (row) => row.option_ticker);
  const map = new Map();

  for (const [ticker, rows] of grouped.entries()) {
    const ordered = sortByDate(rows, 'date');
    for (let i = 0; i < ordered.length; i += 1) {
      if (i + horizon >= ordered.length) continue;
      const current = ordered[i];
      const future = ordered[i + horizon];
      const ret = future.mid_price / Math.max(1e-9, current.mid_price) - 1;
      map.set(`${ticker}:${current.date}`, {
        future_option_return: Number(ret.toFixed(6)),
        future_mid: future.mid_price,
        future_date: future.date
      });
    }
  }

  return map;
}

function buildUnderlyingFutureMap(featureRows, horizon = 3) {
  const grouped = groupBy(featureRows, (row) => row.underlying_symbol);
  const map = new Map();

  for (const [underlying, rows] of grouped.entries()) {
    const daily = new Map();
    for (const row of rows) {
      if (!daily.has(row.date)) daily.set(row.date, []);
      daily.get(row.date).push(row.underlying_price);
    }
    const ordered = [...daily.entries()]
      .map(([date, values]) => ({ date, price: values.reduce((sum, value) => sum + value, 0) / values.length }))
      .sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 0; i < ordered.length; i += 1) {
      if (i + horizon >= ordered.length) continue;
      const current = ordered[i];
      const future = ordered[i + horizon];
      const ret = future.price / Math.max(1e-9, current.price) - 1;
      map.set(`${underlying}:${current.date}`, Number(ret.toFixed(6)));
    }
  }

  return map;
}

function payoffDirection(optionType, underlyingFutureRet) {
  if (optionType === 'call') return underlyingFutureRet > 0 ? 'favorable' : 'unfavorable';
  return underlyingFutureRet < 0 ? 'favorable' : 'unfavorable';
}

function volRiskLabel(ivChange) {
  if (ivChange <= -0.035) return 'vol_crush_risk';
  if (ivChange >= 0.035) return 'vol_expansion';
  return 'stable_vol';
}

export function buildOptionsTrainingDataset({ features, asOf }) {
  const createdAt = new Date(asOf).toISOString();
  const futureOptionMap = buildFutureOptionMap(features, 3);
  const underlyingMap = buildUnderlyingFutureMap(features, 3);
  const rows = [];

  for (const feature of features || []) {
    const optionKey = `${feature.option_ticker}:${feature.date}`;
    const optionFuture = futureOptionMap.get(optionKey);
    if (!optionFuture) continue;

    const underlyingFutureRet = underlyingMap.get(`${feature.underlying_symbol}:${feature.date}`) ?? 0;

    rows.push({
      asset_class: 'option',
      option_ticker: feature.option_ticker,
      underlying_symbol: feature.underlying_symbol,
      date: feature.date,
      feature_set_name: 'options_chain_v1',
      features: {
        moneyness: feature.moneyness,
        dte: feature.dte,
        implied_volatility: feature.implied_volatility,
        implied_vol_change_5d: feature.implied_vol_change_5d,
        skew_proxy: feature.skew_proxy,
        term_structure_proxy: feature.term_structure_proxy,
        bid_ask_spread_pct: feature.bid_ask_spread_pct,
        chain_concentration: feature.chain_concentration,
        oi_volume_anomaly: feature.oi_volume_anomaly,
        premium_momentum_3d: feature.premium_momentum_3d
      },
      labels: {
        future_option_return_3d: optionFuture.future_option_return,
        option_direction_3d: optionFuture.future_option_return >= 0 ? 'premium_up' : 'premium_down',
        payoff_alignment_3d: payoffDirection(feature.option_type, underlyingFutureRet),
        vol_risk_label: volRiskLabel(feature.implied_vol_change_5d),
        underlying_future_return_3d: underlyingFutureRet
      },
      source: feature.source,
      data_status: 'derived',
      fetched_at: feature.fetched_at
    });
  }

  const splitMap = buildDateSplits(rows, 'date');
  const splitRows = rows.map((row) => ({ ...row, split: assignSplitByDate(row, splitMap, 'date') }));

  return {
    dataset: {
      dataset_id: `tds-options-chain-v1-${String(asOf).slice(0, 10)}`,
      asset_class: 'option',
      feature_set_name: 'options_chain_v1',
      label_definition: 'future_option_return_3d + option_direction_3d + payoff_alignment_3d + vol_risk_label',
      split: splitCounts(splitRows),
      split_strategy: 'date_ratio_70_15_15',
      created_at: createdAt,
      date_range: dateRange(splitRows, 'date'),
      source_type: 'training_dataset_builder',
      data_status: 'derived',
      version: 'options_chain_v1.0.0',
      status: 'active',
      use_notes: 'Option-specific labels tied to premium dynamics and underlying alignment.',
      license_notes: 'Contains sample fallback options data unless licensed feed is configured.'
    },
    rows: splitRows
  };
}

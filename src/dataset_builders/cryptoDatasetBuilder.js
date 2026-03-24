import { rankMap } from '../quant/math.js';
import { groupBy, sortByDate } from '../normalizers/utils.js';
import { assignSplitByDate, buildDateSplits, dateRange, splitCounts } from './splitUtils.js';

function buildFutureMap(features, horizon = 3) {
  const grouped = groupBy(features, (row) => row.product_id);
  const map = new Map();

  for (const [productId, rows] of grouped.entries()) {
    const ordered = sortByDate(rows, 'date');
    for (let i = 0; i < ordered.length; i += 1) {
      if (i + horizon >= ordered.length) continue;
      const current = ordered[i];
      const future = ordered[i + horizon];
      const ret = future.close / Math.max(1e-9, current.close) - 1;
      map.set(`${productId}:${current.date}`, {
        future_return_3d: Number(ret.toFixed(6)),
        future_date: future.date,
      });
    }
  }

  return map;
}

function directionLabel(value, up = 0.01, down = -0.01) {
  if (value >= up) return 'up';
  if (value <= down) return 'down';
  return 'flat';
}

function volLabel(value) {
  if (value >= 0.9) return 'high';
  if (value <= 0.35) return 'low';
  return 'medium';
}

export function buildCryptoTrainingDataset({ features, asOf }) {
  const createdAt = new Date(asOf).toISOString();
  const futureMap = buildFutureMap(features, 3);
  const rows = [];

  for (const feature of features || []) {
    const label = futureMap.get(`${feature.product_id}:${feature.date}`);
    if (!label) continue;

    rows.push({
      asset_class: 'crypto',
      product_id: feature.product_id,
      symbol: feature.symbol,
      date: feature.date,
      feature_set_name: 'crypto_spot_v1',
      features: {
        momentum_3d: feature.momentum_3d,
        momentum_7d: feature.momentum_7d,
        momentum_30d: feature.momentum_30d,
        realized_vol_20d: feature.realized_vol_20d,
        volume_expansion_20d: feature.volume_expansion_20d,
        intraday_range_proxy: feature.intraday_range_proxy,
        benchmark_rel_btc: feature.benchmark_rel_btc,
        benchmark_rel_eth: feature.benchmark_rel_eth,
      },
      labels: {
        future_return_3d: label.future_return_3d,
        direction_3d: directionLabel(label.future_return_3d),
        volatility_label: volLabel(feature.realized_vol_20d),
        regime_alignment: feature.regime_risk_proxy,
      },
      source: feature.source,
      data_status: 'derived',
      fetched_at: feature.fetched_at,
    });
  }

  const byDate = groupBy(rows, (row) => row.date);
  for (const sameDateRows of byDate.values()) {
    const map = Object.fromEntries(
      sameDateRows.map((row) => [row.product_id, row.labels.future_return_3d]),
    );
    const ranked = rankMap(map);
    for (const row of sameDateRows) {
      row.labels.ranking_label = Number((ranked[row.product_id] || 0).toFixed(6));
    }
  }

  const splitMap = buildDateSplits(rows, 'date');
  const splitRows = rows.map((row) => ({
    ...row,
    split: assignSplitByDate(row, splitMap, 'date'),
  }));

  return {
    dataset: {
      dataset_id: `tds-crypto-spot-v1-${String(asOf).slice(0, 10)}`,
      asset_class: 'crypto',
      feature_set_name: 'crypto_spot_v1',
      label_definition: 'future_return_3d + direction_3d + volatility_label + ranking_label',
      split: splitCounts(splitRows),
      split_strategy: 'date_ratio_70_15_15',
      created_at: createdAt,
      date_range: dateRange(splitRows, 'date'),
      source_type: 'training_dataset_builder',
      data_status: 'derived',
      version: 'crypto_spot_v1.0.0',
      status: 'active',
      use_notes: '24/7 crypto spot training dataset with benchmark-relative features.',
      license_notes:
        'Contains sample fallback crypto data unless live exchange feed is configured.',
    },
    rows: splitRows,
  };
}

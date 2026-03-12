import { rankMap } from '../quant/math.js';
import { groupBy, sortByDate } from '../normalizers/utils.js';
import { assignSplitByDate, buildDateSplits, dateRange, splitCounts } from './splitUtils.js';

function buildFutureReturnMap(normalizedBars, horizon = 5) {
  const grouped = groupBy(normalizedBars, (row) => row.symbol);
  const map = new Map();

  for (const [symbol, rows] of grouped.entries()) {
    const ordered = sortByDate(rows, 'date');
    for (let i = 0; i < ordered.length; i += 1) {
      if (i + horizon >= ordered.length) continue;
      const current = ordered[i];
      const future = ordered[i + horizon];
      const ret = future.adjusted_close / Math.max(1e-9, current.adjusted_close) - 1;
      map.set(`${symbol}:${current.date}`, {
        future_return: Number(ret.toFixed(6)),
        horizon_days: horizon,
        future_date: future.date
      });
    }
  }

  return map;
}

function directionLabel(value, up = 0.005, down = -0.005) {
  if (value >= up) return 'up';
  if (value <= down) return 'down';
  return 'flat';
}

function volatilityLabel(hv20) {
  if (hv20 >= 0.45) return 'high';
  if (hv20 <= 0.2) return 'low';
  return 'medium';
}

export function buildEquityTrainingDataset({ features, normalizedBars, asOf }) {
  const createdAt = new Date(asOf).toISOString();
  const futureMap = buildFutureReturnMap(normalizedBars, 5);
  const rows = [];

  for (const feature of features || []) {
    const key = `${feature.symbol}:${feature.date}`;
    const label = futureMap.get(key);
    if (!label) continue;

    rows.push({
      asset_class: 'equity',
      symbol: feature.symbol,
      date: feature.date,
      feature_set_name: 'equity_core_v1',
      features: {
        trend_ret_5d: feature.trend_ret_5d,
        trend_ret_20d: feature.trend_ret_20d,
        trend_ma_dev_20: feature.trend_ma_dev_20,
        mr_zscore_20: feature.mr_zscore_20,
        mr_rsi_14: feature.mr_rsi_14,
        vol_hv20: feature.vol_hv20,
        liq_volume_adv20: feature.liq_volume_adv20,
        rel_strength_rank: feature.rel_strength_rank,
        benchmark_rel_20: feature.benchmark_rel_20
      },
      labels: {
        future_return_5d: label.future_return,
        direction_5d: directionLabel(label.future_return),
        volatility_label: volatilityLabel(feature.vol_hv20)
      },
      source: feature.source,
      data_status: 'derived',
      fetched_at: feature.fetched_at
    });
  }

  // Cross-sectional ranking label by date
  const byDate = groupBy(rows, (row) => row.date);
  for (const dateRows of byDate.values()) {
    const rankSource = Object.fromEntries(dateRows.map((row) => [row.symbol, row.labels.future_return_5d]));
    const ranked = rankMap(rankSource);
    for (const row of dateRows) {
      row.labels.ranking_label = Number((ranked[row.symbol] || 0).toFixed(6));
    }
  }

  const splitMap = buildDateSplits(rows, 'date');
  const splitRows = rows.map((row) => ({ ...row, split: assignSplitByDate(row, splitMap, 'date') }));

  return {
    dataset: {
      dataset_id: `tds-equity-core-v1-${String(asOf).slice(0, 10)}`,
      asset_class: 'equity',
      feature_set_name: 'equity_core_v1',
      label_definition: 'future_return_5d + direction_5d + volatility_label + ranking_label',
      split: splitCounts(splitRows),
      split_strategy: 'date_ratio_70_15_15',
      created_at: createdAt,
      date_range: dateRange(splitRows, 'date'),
      source_type: 'training_dataset_builder',
      data_status: 'derived',
      version: 'equity_core_v1.0.0',
      status: 'active',
      use_notes: 'Daily equity training dataset for ranking and direction models.',
      license_notes: 'Contains sample fallback data unless live provider feed enabled.'
    },
    rows: splitRows
  };
}

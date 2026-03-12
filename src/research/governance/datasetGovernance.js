import { ENTITY_STAGE, MARKET_TIME_MODE, registryId } from './taxonomy.js';

const FEATURE_GROUP_RULES = [
  { prefix: 'trend_', group: 'trend' },
  { prefix: 'mr_', group: 'mean_reversion' },
  { prefix: 'vol_', group: 'volatility' },
  { prefix: 'liq_', group: 'liquidity' },
  { prefix: 'rel_', group: 'relative_strength' },
  { prefix: 'benchmark_', group: 'benchmark' },
  { prefix: 'style_', group: 'style_rotation' },
  { prefix: 'momentum_', group: 'momentum' },
  { prefix: 'implied_', group: 'iv_surface' },
  { prefix: 'skew_', group: 'iv_surface' },
  { prefix: 'term_', group: 'term_structure' },
  { prefix: 'oi_', group: 'liquidity' },
  { prefix: 'premium_', group: 'premium_dynamics' },
  { prefix: 'underlying_', group: 'underlying_linkage' }
];

const LABEL_MANIFEST_RULES = {
  equity: {
    task: 'cross_sectional_rank_and_direction',
    horizon: '5d',
    cutoff_rule: 'labels use t+5 close, same-day features at market close',
    timestamp_alignment: 'US_TRADING_DAY_EOD',
    calendar_mode: MARKET_TIME_MODE.US_TRADING_DAY
  },
  option: {
    task: 'option_premium_direction_and_alignment',
    horizon: '3d',
    cutoff_rule: 'labels use t+3 option mid and underlying move alignment',
    timestamp_alignment: 'US_TRADING_DAY_EOD',
    calendar_mode: MARKET_TIME_MODE.US_TRADING_DAY
  },
  crypto: {
    task: 'spot_direction_rank_24_7',
    horizon: '3d',
    cutoff_rule: 'labels use rolling 24/7 bars with t+3 horizon',
    timestamp_alignment: 'CRYPTO_24_7_DAILY_CUTOFF',
    calendar_mode: MARKET_TIME_MODE.CRYPTO_24_7
  }
};

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeRatio(num, den) {
  if (!den) return 0;
  return Number((num / den).toFixed(6));
}

function inferFeatureGroup(name) {
  const key = String(name || '').toLowerCase();
  for (const rule of FEATURE_GROUP_RULES) {
    if (key.startsWith(rule.prefix)) return rule.group;
  }
  return 'other';
}

function expectedRange(values) {
  const nums = values.filter((item) => Number.isFinite(Number(item))).map((item) => Number(item));
  if (!nums.length) return null;
  return {
    min: Number(Math.min(...nums).toFixed(6)),
    max: Number(Math.max(...nums).toFixed(6))
  };
}

function deriveFeatureManifest(rows, featureSetName, sourceSummary, asOf) {
  const featureKeySet = new Set();
  for (const row of rows || []) {
    for (const key of Object.keys(row.features || {})) {
      featureKeySet.add(key);
    }
  }

  return [...featureKeySet]
    .sort()
    .map((featureName) => {
      const values = rows.map((row) => row.features?.[featureName]);
      const missing = values.filter((item) => item === null || item === undefined || item === '').length;
      const range = expectedRange(values);
      const isLeakageSensitive = featureName.includes('future_') || featureName.includes('_label');

      return {
        manifest_id: registryId('feature', featureSetName, featureName),
        feature_name: featureName,
        feature_group: inferFeatureGroup(featureName),
        source: sourceSummary,
        derivation_logic: `Derived by feature factory ${featureSetName} from normalized rows.`,
        null_ratio: safeRatio(missing, values.length || 1),
        expected_range: range,
        train_safe: !isLeakageSensitive,
        leakage_sensitive: isLeakageSensitive,
        observed_at: asOf
      };
    });
}

function labelDistribution(values) {
  const counts = new Map();
  for (const raw of values) {
    const key = String(raw ?? 'null');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = values.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      count,
      ratio: safeRatio(count, total)
    }));
}

function deriveLabelManifest(dataset, rows, asOf) {
  const rule = LABEL_MANIFEST_RULES[dataset.asset_class] || {
    task: 'custom_task',
    horizon: '--',
    cutoff_rule: '--',
    timestamp_alignment: '--',
    calendar_mode: MARKET_TIME_MODE.US_TRADING_DAY
  };

  const labelKeys = new Set();
  for (const row of rows || []) {
    for (const key of Object.keys(row.labels || {})) {
      labelKeys.add(key);
    }
  }

  const labels = [...labelKeys]
    .sort()
    .map((labelName) => {
      const values = rows.map((row) => row.labels?.[labelName]);
      const numeric = values.map((item) => Number(item)).filter((n) => Number.isFinite(n));
      return {
        label_name: labelName,
        distribution: labelDistribution(values),
        numeric_summary: numeric.length
          ? {
              mean: Number((numeric.reduce((sum, n) => sum + n, 0) / numeric.length).toFixed(6)),
              min: Number(Math.min(...numeric).toFixed(6)),
              max: Number(Math.max(...numeric).toFixed(6))
            }
          : null
      };
    });

  return {
    manifest_id: registryId('label', dataset.asset_class, dataset.feature_set_name),
    dataset_id: dataset.dataset_id,
    asset_class: dataset.asset_class,
    feature_set_name: dataset.feature_set_name,
    label_definition: dataset.label_definition,
    task: rule.task,
    horizon: rule.horizon,
    cutoff_rule: rule.cutoff_rule,
    timestamp_alignment: rule.timestamp_alignment,
    calendar_mode: rule.calendar_mode,
    labels,
    created_at: asOf
  };
}

function splitStrategy(splitObject) {
  const keys = Object.keys(splitObject || {});
  if (!keys.length) return 'unknown';
  return `date_ratio(${keys.join('/')})`;
}

function suspiciousAnomalies({ dataset, rows, qualityReport }) {
  const anomalies = [];
  if (!rows.length) anomalies.push('empty_dataset_rows');

  const split = dataset.split || {};
  if (safeNumber(split.train) === 0 || safeNumber(split.test) === 0) {
    anomalies.push('split_train_or_test_empty');
  }

  const staleHit = (qualityReport?.stale_data_detection || []).find((row) => row.asset_class === dataset.asset_class && row.stale);
  if (staleHit) anomalies.push('stale_source_detected');

  const schemaIssue = (qualityReport?.schema_validation || []).find((row) => String(row.schema || '').toLowerCase().includes(dataset.asset_class));
  if (schemaIssue?.invalid_ratio > 0.02) {
    anomalies.push('schema_invalid_ratio_high');
  }

  return anomalies;
}

function classBalanceSummary(labelManifest) {
  const summaries = [];
  for (const item of labelManifest.labels || []) {
    if (!item.distribution?.length) continue;
    summaries.push({
      label_name: item.label_name,
      top_classes: item.distribution.slice(0, 5)
    });
  }
  return summaries;
}

function buildDatasetRegistryEntry(dataset, sourceSummary, qualityReport, labelManifest, asOf) {
  return {
    registry_id: registryId('dataset', dataset.asset_class, dataset.feature_set_name, dataset.dataset_id),
    dataset_id: dataset.dataset_id,
    asset_class: dataset.asset_class,
    feature_set_name: dataset.feature_set_name,
    label_definition: dataset.label_definition,
    source_summary: sourceSummary,
    date_range: dataset.date_range,
    split_strategy: dataset.split_strategy || splitStrategy(dataset.split),
    created_at: dataset.created_at || asOf,
    version: dataset.version || `${dataset.feature_set_name}@${String(dataset.dataset_id).slice(-10)}`,
    status: dataset.status || ENTITY_STAGE.PAPER,
    notes: dataset.use_notes || 'Training dataset registry entry.',
    quality_status: qualityReport?.overall_status || '--',
    calendar_mode: labelManifest.calendar_mode
  };
}

function buildDatasetSnapshot(dataset, rows, qualityReport, labelManifest, asOf) {
  return {
    snapshot_id: registryId('dataset_snapshot', dataset.asset_class, dataset.dataset_id, asOf.slice(0, 10)),
    dataset_id: dataset.dataset_id,
    asset_class: dataset.asset_class,
    feature_set_name: dataset.feature_set_name,
    coverage_summary: qualityReport?.coverage_summary?.[dataset.asset_class] || null,
    missingness_summary: qualityReport?.missingness_summary?.[`${dataset.asset_class}_bars`] || qualityReport?.missingness_summary || null,
    class_balance: classBalanceSummary(labelManifest),
    label_distribution: labelManifest.labels || [],
    stale_data_detection: (qualityReport?.stale_data_detection || []).filter((item) => item.asset_class === dataset.asset_class),
    suspicious_anomalies: suspiciousAnomalies({ dataset, rows, qualityReport }),
    last_refresh_time: asOf,
    row_count: rows.length
  };
}

export function buildDatasetGovernance({
  asOf = new Date().toISOString(),
  datasets = [],
  datasetRows = {},
  featureManifests = {},
  sourceSummary = {},
  qualityReport = {}
} = {}) {
  const registry = [];
  const detailedFeatureManifests = {};
  const labelManifests = {};
  const snapshots = [];

  for (const dataset of datasets) {
    const rows = datasetRows[dataset.dataset_id] || [];
    const assetClass = dataset.asset_class;
    const featureSetName = dataset.feature_set_name;

    const featureManifest = deriveFeatureManifest(
      rows,
      featureSetName,
      sourceSummary[assetClass] || sourceSummary,
      asOf
    );
    const labelManifest = deriveLabelManifest(dataset, rows, asOf);
    const registryEntry = buildDatasetRegistryEntry(dataset, sourceSummary, qualityReport, labelManifest, asOf);
    const snapshot = buildDatasetSnapshot(dataset, rows, qualityReport, labelManifest, asOf);

    registry.push(registryEntry);
    snapshots.push(snapshot);
    labelManifests[assetClass] = labelManifest;
    detailedFeatureManifests[assetClass] = featureManifest;
  }

  return {
    generated_at: asOf,
    registry,
    feature_manifests: {
      simple: featureManifests,
      detailed: detailedFeatureManifests
    },
    label_manifests: labelManifests,
    snapshots
  };
}

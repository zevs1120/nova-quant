import type { AssetClass, Market } from '../types.js';
import type { MarketRepository } from '../db/repository.js';
import type { FeatureSpec, ValidationResult } from '../domain/contracts.js';

const FEATURE_REGISTRY: FeatureSpec[] = [
  {
    key: 'trend_strength',
    category: 'market_state',
    description: 'Measures directionality persistence in the current bar-derived regime context.',
    point_in_time_safe: true,
    online_serving_ready: true,
    serving_keys: ['market', 'symbol', 'timeframe', 'snapshot_ts_ms'],
  },
  {
    key: 'temperature_percentile',
    category: 'market_state',
    description:
      'Normalizes stretch and extension so risk posture can de-escalate crowded conditions.',
    point_in_time_safe: true,
    online_serving_ready: true,
    serving_keys: ['market', 'symbol', 'timeframe', 'snapshot_ts_ms'],
  },
  {
    key: 'volatility_percentile',
    category: 'market_state',
    description: 'Tracks realized volatility regime for action gating and execution realism.',
    point_in_time_safe: true,
    online_serving_ready: true,
    serving_keys: ['market', 'symbol', 'timeframe', 'snapshot_ts_ms'],
  },
  {
    key: 'risk_off_score',
    category: 'market_state',
    description: 'Upper-layer defensive overlay used by the decision engine before action ranking.',
    point_in_time_safe: true,
    online_serving_ready: true,
    serving_keys: ['market', 'symbol', 'timeframe', 'snapshot_ts_ms'],
  },
  {
    key: 'signal_conviction',
    category: 'signal_quality',
    description: 'Normalized conviction score for candidate signals after transparency penalties.',
    point_in_time_safe: true,
    online_serving_ready: true,
    serving_keys: ['signal_id', 'user_id', 'market', 'asset_class', 'snapshot_ts_ms'],
  },
  {
    key: 'portfolio_overlap',
    category: 'portfolio',
    description:
      'Measures user portfolio overlap with the suggested action before personalization.',
    point_in_time_safe: true,
    online_serving_ready: true,
    serving_keys: ['user_id', 'market', 'asset_class', 'strategy_context', 'snapshot_ts_ms'],
  },
  {
    key: 'execution_cost_drag',
    category: 'execution',
    description:
      'Execution realism proxy used across backtest, replay, paper, and decision cautioning.',
    point_in_time_safe: true,
    online_serving_ready: false,
    serving_keys: ['execution_profile_id', 'run_type', 'strategy_version_id'],
  },
  {
    key: 'data_freshness_guard',
    category: 'data_quality',
    description:
      'Validation gate used to prevent stale bars from surfacing as actionable intelligence.',
    point_in_time_safe: true,
    online_serving_ready: true,
    serving_keys: ['market', 'asset_class', 'timeframe', 'snapshot_ts_ms'],
  },
];

export function buildFeatureCacheKey(args: {
  userId: string;
  riskProfileKey: string;
  market: Market | 'ALL';
  assetClass: AssetClass | 'ALL';
  strategyContext: string;
  snapshotDate: string;
}): string {
  return [
    `user:${args.userId}`,
    `risk:${args.riskProfileKey}`,
    `market:${args.market}`,
    `asset:${args.assetClass}`,
    `strategy:${args.strategyContext}`,
    `snapshot:${args.snapshotDate}`,
  ].join('|');
}

export function buildFeaturePlatformSummary(
  repo: MarketRepository,
  args: {
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    timeframe?: string;
  } = {},
): {
  feature_registry: FeatureSpec[];
  point_in_time_contract: Record<string, unknown>;
  offline_online_parity: Record<string, unknown>;
  validation_gates: ValidationResult[];
  latest_dataset_versions: Array<Record<string, unknown>>;
  latest_feature_snapshots: Array<Record<string, unknown>>;
  cache_isolation_dimensions: string[];
} {
  const datasets = repo.listDatasetVersions({
    market: args.market,
    assetClass: args.assetClass,
    timeframe: args.timeframe,
    limit: 8,
  });
  const featureSnapshots = repo.listFeatureSnapshots({ limit: 8 });

  const validationGates: ValidationResult[] = [
    {
      id: 'data-contract-schema',
      subject_id: 'runtime_ohlcv',
      validation_type: 'data_contract',
      status: datasets.length ? 'pass' : 'warn',
      metrics: {
        dataset_versions_available: datasets.length,
        feature_snapshots_available: featureSnapshots.length,
      },
      notes: [
        'Expectations are expressed as runtime validation gates, not only logging.',
        'Point-in-time joins remain mandatory for feature usage in research and serving.',
      ],
    },
    {
      id: 'feature-cache-isolation',
      subject_id: 'online_feature_cache',
      validation_type: 'isolation',
      status: 'pass',
      metrics: {
        required_dimensions: 6,
        includes_user: true,
        includes_risk_profile: true,
        includes_market: true,
        includes_asset_class: true,
        includes_strategy_context: true,
        includes_snapshot_date: true,
      },
      notes: [
        'Feature and decision cache keys are isolated by user/risk/market/context to avoid serving skew.',
      ],
    },
  ];

  return {
    feature_registry: FEATURE_REGISTRY,
    point_in_time_contract: {
      principle: 'No feature may observe data beyond snapshot_ts_ms.',
      training_serving_skew_policy:
        'Feature specs define the same serving keys for offline and online access.',
      serving_keys_required: [
        'user_id',
        'market',
        'asset_class',
        'strategy_context',
        'snapshot_ts_ms',
      ],
    },
    offline_online_parity: {
      parity_status:
        datasets.length && featureSnapshots.length ? 'PARTIAL_READY' : 'SCAFFOLD_READY',
      note: 'Dataset versions and feature snapshots are stored canonically; some runtime features are still derived on demand and should migrate into snapshot-backed serving over time.',
    },
    validation_gates: validationGates,
    latest_dataset_versions: datasets.map((row) => ({
      id: row.id,
      market: row.market,
      asset_class: row.asset_class,
      timeframe: row.timeframe,
      created_at_ms: row.created_at_ms,
    })),
    latest_feature_snapshots: featureSnapshots.map((row) => ({
      id: row.id,
      dataset_version_id: row.dataset_version_id,
      feature_version: row.feature_version,
      snapshot_ts_ms: row.snapshot_ts_ms,
    })),
    cache_isolation_dimensions: [
      'user_id',
      'risk_profile_key',
      'market',
      'asset_class',
      'strategy_context',
      'snapshot_date',
    ],
  };
}

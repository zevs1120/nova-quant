import { createEquityAdapter } from '../data_sources/equities/equityAdapter.js';
import { createOptionsAdapter } from '../data_sources/options/optionsAdapter.js';
import { createCryptoSpotAdapter } from '../data_sources/crypto/cryptoSpotAdapter.js';
import { normalizeEquities } from '../normalizers/equitiesNormalizer.js';
import { normalizeOptions } from '../normalizers/optionsNormalizer.js';
import { normalizeCryptoSpot } from '../normalizers/cryptoNormalizer.js';
import { buildEquityFeatures } from '../feature_factories/equities/equityFeatureFactory.js';
import { buildOptionFeatures } from '../feature_factories/options/optionsFeatureFactory.js';
import { buildCryptoFeatures } from '../feature_factories/crypto/cryptoFeatureFactory.js';
import { buildEquityTrainingDataset } from '../dataset_builders/equityDatasetBuilder.js';
import { buildOptionsTrainingDataset } from '../dataset_builders/optionsDatasetBuilder.js';
import { buildCryptoTrainingDataset } from '../dataset_builders/cryptoDatasetBuilder.js';
import { buildDataQualityReport } from './dataQualityChecks.js';
import { buildDatasetGovernance } from './governance/datasetGovernance.js';
import { DATA_TRANSPARENCY, transparencyFromSourceMode } from './governance/taxonomy.js';
import {
  get_dataset_quality_snapshot,
  get_dataset_registry,
  get_dataset_snapshot,
  get_feature_manifest_detailed,
  get_feature_manifest,
  get_label_manifest,
  get_latest_data_status,
  get_source_health,
  get_training_dataset,
  list_available_assets,
  setMultiAssetTrainingContext
} from '../training/multiAssetTrainingService.js';

function compactAdapterInfo(adapter, raw) {
  return {
    id: adapter.id,
    asset_class: adapter.asset_class,
    mode: adapter.mode,
    supports_live: adapter.supports_live,
    primary_source: adapter.primary_source,
    docs: adapter.docs,
    live_path: raw?.live_path || null,
    metadata: raw?.metadata || null
  };
}

function buildDatasetSnapshot(dataset, quality, sourceSummary) {
  const miss = quality?.missingness_summary || {};
  const missingnessByAsset = dataset.asset_class === 'equity'
    ? miss.equity_bars
    : dataset.asset_class === 'option'
      ? miss.option_snapshots
      : miss.crypto_bars;

  const coverage = quality?.coverage_summary?.[dataset.asset_class] || {};

  return {
    dataset_id: dataset.dataset_id,
    asset_class: dataset.asset_class,
    frequency: '1d',
    date_range: dataset.date_range,
    source_summary: sourceSummary,
    coverage_summary: coverage,
    missingness_summary: missingnessByAsset,
    created_at: dataset.created_at
  };
}

function buildSourceSummary(adapters) {
  return Object.fromEntries(
    Object.entries(adapters).map(([key, adapter]) => [
      key,
      {
        id: adapter.id,
        mode: adapter.mode,
        primary_source: adapter.primary_source,
        supports_live: adapter.supports_live
      }
    ])
  );
}

export function buildMultiAssetDataTrainingPipeline({ asOf = new Date().toISOString(), sourceConfig = {} } = {}) {
  const equityAdapter = createEquityAdapter(sourceConfig.equity || {});
  const optionsAdapter = createOptionsAdapter(sourceConfig.options || {});
  const cryptoAdapter = createCryptoSpotAdapter(sourceConfig.crypto || {});

  const raw = {
    equities: equityAdapter.fetchRawSnapshot({ asOf }),
    options: optionsAdapter.fetchRawSnapshot({ asOf }),
    crypto: cryptoAdapter.fetchRawSnapshot({ asOf })
  };

  const normalized = {
    equities: normalizeEquities(raw.equities),
    options: normalizeOptions(raw.options),
    crypto: normalizeCryptoSpot(raw.crypto)
  };

  const assetRegistry = [
    ...(normalized.equities.assets || []),
    ...(normalized.options.assets || []),
    ...(normalized.crypto.assets || [])
  ];

  normalized.asset_registry = assetRegistry;

  const features = {
    equity: buildEquityFeatures(normalized.equities),
    option: buildOptionFeatures(normalized.options),
    crypto: buildCryptoFeatures(normalized.crypto)
  };

  const equityDataset = buildEquityTrainingDataset({
    features: features.equity.rows,
    normalizedBars: normalized.equities.bars,
    asOf
  });
  const optionsDataset = buildOptionsTrainingDataset({
    features: features.option.rows,
    asOf
  });
  const cryptoDataset = buildCryptoTrainingDataset({
    features: features.crypto.rows,
    asOf
  });

  const datasets = [equityDataset.dataset, optionsDataset.dataset, cryptoDataset.dataset];
  const datasetRows = {
    [equityDataset.dataset.dataset_id]: equityDataset.rows,
    [optionsDataset.dataset.dataset_id]: optionsDataset.rows,
    [cryptoDataset.dataset.dataset_id]: cryptoDataset.rows
  };

  const adapters = {
    equity: compactAdapterInfo(equityAdapter, raw.equities),
    options: compactAdapterInfo(optionsAdapter, raw.options),
    crypto: compactAdapterInfo(cryptoAdapter, raw.crypto)
  };

  const qualityReport = buildDataQualityReport({
    asOf,
    adapters: {
      equity: equityAdapter,
      options: optionsAdapter,
      crypto: cryptoAdapter
    },
    normalized,
    features,
    datasets
  });

  const sourceSummary = buildSourceSummary({
    equity: equityAdapter,
    options: optionsAdapter,
    crypto: cryptoAdapter
  });

  const datasetSnapshots = datasets.map((dataset) => buildDatasetSnapshot(dataset, qualityReport, sourceSummary));

  const featureManifests = {
    equity: features.equity.feature_manifest,
    option: features.option.feature_manifest,
    crypto: features.crypto.feature_manifest
  };

  const governance = buildDatasetGovernance({
    asOf,
    datasets,
    datasetRows,
    featureManifests,
    sourceSummary,
    qualityReport
  });

  setMultiAssetTrainingContext({
    datasets,
    datasetRows,
    datasetSnapshots,
    datasetRegistry: governance.registry,
    featureManifests,
    featureManifestsDetailed: governance.feature_manifests.detailed,
    labelManifests: governance.label_manifests,
    datasetQualitySnapshots: governance.snapshots,
    assetRegistry,
    sourceHealth: qualityReport.source_health_summary,
    latestDataStatus: qualityReport.latest_data_status
  });

  const apiPreview = {
    datasets: {
      equity_train: get_training_dataset('equity', 'equity_core_v1', 'train')?.rows?.length || 0,
      option_train: get_training_dataset('option', 'options_chain_v1', 'train')?.rows?.length || 0,
      crypto_train: get_training_dataset('crypto', 'crypto_spot_v1', 'train')?.rows?.length || 0
    },
    assets: {
      equity: list_available_assets('equity').length,
      option: list_available_assets('option').length,
      crypto: list_available_assets('crypto').length
    }
  };

  return {
    generated_at: new Date(asOf).toISOString(),
    pipeline_version: 'multi-asset-v1.0.0',
    source_policy: {
      principle: 'official_first_with_documented_fallback',
      notes: [
        'US equities: Polygon/Stooq path + local deterministic fallback.',
        'US options: Polygon options path + sample chain fallback.',
        'Crypto spot: Coinbase public path + sample fallback.'
      ]
    },
    adapters,
    raw: {
      equities: {
        metadata: raw.equities.metadata,
        bars_count: raw.equities.bars.length,
        asset_count: raw.equities.assets.length
      },
      options: {
        metadata: raw.options.metadata,
        contracts_count: raw.options.contracts.length,
        snapshots_count: raw.options.snapshots.length,
        chains_count: raw.options.chains.length
      },
      crypto: {
        metadata: raw.crypto.metadata,
        products_count: raw.crypto.products.length,
        bars_count: raw.crypto.bars.length
      }
    },
    normalized: {
      asset_registry: assetRegistry,
      equities: normalized.equities,
      options: normalized.options,
      crypto: normalized.crypto
    },
    derived: {
      features,
      datasets,
      dataset_rows: datasetRows,
      dataset_snapshots: datasetSnapshots
    },
    quality_report: qualityReport,
    source_health: get_source_health(),
    latest_data_status: get_latest_data_status(),
    feature_manifests: {
      equity: get_feature_manifest('equity'),
      option: get_feature_manifest('option'),
      crypto: get_feature_manifest('crypto')
    },
    dataset_governance: {
      registry: get_dataset_registry(),
      feature_manifests_detailed: {
        equity: get_feature_manifest_detailed('equity'),
        option: get_feature_manifest_detailed('option'),
        crypto: get_feature_manifest_detailed('crypto')
      },
      label_manifests: {
        equity: get_label_manifest('equity'),
        option: get_label_manifest('option'),
        crypto: get_label_manifest('crypto')
      },
      snapshots: get_dataset_quality_snapshot()
    },
    api_preview: {
      interface_contracts: [
        'get_training_dataset(asset_class, feature_set, split)',
        'list_available_assets(asset_class)',
        'get_dataset_snapshot(asset_class)',
        'get_feature_manifest(asset_class)',
        'get_feature_manifest_detailed(asset_class)',
        'get_label_manifest(asset_class)',
        'get_dataset_registry(asset_class)',
        'get_dataset_quality_snapshot(asset_class)',
        'get_source_health()',
        'get_latest_data_status()'
      ],
      sample_results: apiPreview,
      snapshots_available: get_dataset_snapshot().length
    },
    transparency: {
      real_vs_sample: {
        equity: transparencyFromSourceMode(adapters.equity.mode, adapters.equity.supports_live),
        option: transparencyFromSourceMode(adapters.options.mode, adapters.options.supports_live),
        crypto: transparencyFromSourceMode(adapters.crypto.mode, adapters.crypto.supports_live)
      },
      labels: DATA_TRANSPARENCY,
      notes: 'This build keeps boundaries explicit. Live performance is not fabricated.'
    }
  };
}

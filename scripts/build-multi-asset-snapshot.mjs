import fs from 'node:fs';
import path from 'node:path';
import { buildMultiAssetDataTrainingPipeline } from '../src/research/multiAssetPipeline.js';

const snapshot = buildMultiAssetDataTrainingPipeline({
  asOf: new Date().toISOString(),
});

const compact = {
  generated_at: snapshot.generated_at,
  pipeline_version: snapshot.pipeline_version,
  source_policy: snapshot.source_policy,
  adapters: snapshot.adapters,
  raw: snapshot.raw,
  normalized: {
    asset_registry_count: snapshot.normalized.asset_registry.length,
    equity_bars: snapshot.normalized.equities.bars.length,
    option_contracts: snapshot.normalized.options.contracts.length,
    option_snapshots: snapshot.normalized.options.snapshots.length,
    crypto_bars: snapshot.normalized.crypto.bars.length,
  },
  derived: {
    feature_rows: {
      equity: snapshot.derived.features.equity.rows.length,
      option: snapshot.derived.features.option.rows.length,
      crypto: snapshot.derived.features.crypto.rows.length,
    },
    datasets: snapshot.derived.datasets,
    dataset_snapshots: snapshot.derived.dataset_snapshots,
  },
  quality_report: snapshot.quality_report,
  source_health: snapshot.source_health,
  latest_data_status: snapshot.latest_data_status,
  feature_manifests: snapshot.feature_manifests,
  dataset_governance: snapshot.dataset_governance,
  api_preview: snapshot.api_preview,
  transparency: snapshot.transparency,
};

const target = path.resolve('data/snapshots/multi-asset-status.sample.json');
fs.writeFileSync(target, JSON.stringify(compact, null, 2));
console.log(`Wrote ${target}`);

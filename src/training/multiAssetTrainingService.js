let trainingContext = null;

export function setMultiAssetTrainingContext(context) {
  trainingContext = context || null;
}

function requireContext() {
  return trainingContext || {
    datasets: [],
    datasetRows: {},
    datasetSnapshots: [],
    datasetRegistry: [],
    featureManifests: {},
    featureManifestsDetailed: {},
    labelManifests: {},
    datasetQualitySnapshots: [],
    assetRegistry: [],
    sourceHealth: [],
    latestDataStatus: {}
  };
}

export function get_training_dataset(asset_class, feature_set_name, split = 'train') {
  const ctx = requireContext();
  const dataset = ctx.datasets.find(
    (item) => item.asset_class === asset_class && (!feature_set_name || item.feature_set_name === feature_set_name)
  );
  if (!dataset) return null;

  const rows = ctx.datasetRows[dataset.dataset_id] || [];
  return {
    dataset,
    rows: rows.filter((row) => row.split === split)
  };
}

export function list_available_assets(asset_class) {
  const ctx = requireContext();
  return (ctx.assetRegistry || []).filter((item) => !asset_class || item.asset_class === asset_class);
}

export function get_dataset_snapshot(asset_class) {
  const ctx = requireContext();
  return (ctx.datasetSnapshots || []).filter((item) => !asset_class || item.asset_class === asset_class);
}

export function get_feature_manifest(asset_class) {
  const ctx = requireContext();
  if (!asset_class) return ctx.featureManifests || {};
  return ctx.featureManifests?.[asset_class] || [];
}

export function get_feature_manifest_detailed(asset_class) {
  const ctx = requireContext();
  if (!asset_class) return ctx.featureManifestsDetailed || {};
  return ctx.featureManifestsDetailed?.[asset_class] || [];
}

export function get_label_manifest(asset_class) {
  const ctx = requireContext();
  if (!asset_class) return ctx.labelManifests || {};
  return ctx.labelManifests?.[asset_class] || null;
}

export function get_dataset_registry(asset_class) {
  const ctx = requireContext();
  return (ctx.datasetRegistry || []).filter((item) => !asset_class || item.asset_class === asset_class);
}

export function get_dataset_quality_snapshot(asset_class) {
  const ctx = requireContext();
  return (ctx.datasetQualitySnapshots || []).filter((item) => !asset_class || item.asset_class === asset_class);
}

export function get_source_health() {
  return requireContext().sourceHealth || [];
}

export function get_latest_data_status() {
  return requireContext().latestDataStatus || {};
}

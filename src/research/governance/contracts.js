const REQUIRED_FIELDS = Object.freeze({
  DatasetRegistry: [
    'dataset_id',
    'asset_class',
    'feature_set_name',
    'label_definition',
    'source_summary',
    'date_range',
    'split_strategy',
    'created_at',
    'version',
    'status'
  ],
  FeatureManifest: [
    'feature_name',
    'feature_group',
    'source',
    'derivation_logic',
    'null_ratio',
    'train_safe',
    'leakage_sensitive'
  ],
  LabelManifest: [
    'dataset_id',
    'asset_class',
    'feature_set_name',
    'label_definition',
    'horizon',
    'cutoff_rule',
    'timestamp_alignment'
  ],
  DatasetQualitySnapshot: [
    'dataset_id',
    'asset_class',
    'coverage_summary',
    'missingness_summary',
    'class_balance',
    'label_distribution',
    'stale_data_detection',
    'suspicious_anomalies',
    'last_refresh_time'
  ],
  AlphaRegistry: [
    'alpha_id',
    'family',
    'description',
    'inputs',
    'regime_fit',
    'expected_holding_period',
    'active_status',
    'version'
  ],
  ModelRegistry: [
    'model_id',
    'model_type',
    'asset_class',
    'training_dataset_id',
    'feature_set_name',
    'label_definition',
    'current_stage',
    'evaluation_summary'
  ],
  StrategyRegistry: [
    'strategy_id',
    'asset_scope',
    'enabled_alpha_ids',
    'enabled_model_ids',
    'portfolio_logic',
    'risk_profile',
    'execution_mode',
    'current_stage',
    'change_log'
  ],
  PromotionDecision: [
    'experiment_id',
    'compared_entities',
    'metrics_summary',
    'decision',
    'rationale',
    'reviewer',
    'created_at'
  ],
  PaperDailyRun: [
    'run_id',
    'date',
    'signals',
    'target_portfolio',
    'simulated_orders',
    'fills',
    'positions',
    'equity_snapshot',
    'safety_guards'
  ],
  PaperLedger: ['orders', 'fills', 'positions', 'daily_equity', 'slippage_assumptions', 'notes'],
  InternalIntelligence: ['alpha_health', 'model_health', 'strategy_health', 'data_health', 'weekly_system_review']
});

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function missingFields(row, required) {
  return required.filter((field) => !hasValue(row?.[field]));
}

function validateRows(type, rows = [], required = []) {
  const invalid = [];
  rows.forEach((row, index) => {
    const missing = missingFields(row, required);
    if (missing.length) {
      invalid.push({
        index,
        missing
      });
    }
  });
  return {
    type,
    total: rows.length,
    invalid: invalid.length,
    invalid_ratio: rows.length ? Number((invalid.length / rows.length).toFixed(6)) : 0,
    sample_invalid: invalid.slice(0, 3)
  };
}

export function buildGovernanceContractChecks({
  multiAsset = {},
  research = {},
  internalIntelligence = {}
} = {}) {
  const checks = [
    validateRows(
      'DatasetRegistry',
      multiAsset?.dataset_governance?.registry || [],
      REQUIRED_FIELDS.DatasetRegistry
    ),
    validateRows(
      'FeatureManifest',
      Object.values(multiAsset?.dataset_governance?.feature_manifests_detailed || {}).flat(),
      REQUIRED_FIELDS.FeatureManifest
    ),
    validateRows(
      'LabelManifest',
      Object.values(multiAsset?.dataset_governance?.label_manifests || {}),
      REQUIRED_FIELDS.LabelManifest
    ),
    validateRows(
      'DatasetQualitySnapshot',
      multiAsset?.dataset_governance?.snapshots || [],
      REQUIRED_FIELDS.DatasetQualitySnapshot
    ),
    validateRows(
      'AlphaRegistry',
      research?.registry_system?.alpha_registry || [],
      REQUIRED_FIELDS.AlphaRegistry
    ),
    validateRows(
      'ModelRegistry',
      research?.registry_system?.model_registry || [],
      REQUIRED_FIELDS.ModelRegistry
    ),
    validateRows(
      'StrategyRegistry',
      research?.registry_system?.strategy_registry || [],
      REQUIRED_FIELDS.StrategyRegistry
    ),
    validateRows(
      'PromotionDecision',
      research?.promotion_decisions || [],
      REQUIRED_FIELDS.PromotionDecision
    ),
    validateRows(
      'PaperDailyRun',
      research?.paper_ops?.daily_runs || [],
      REQUIRED_FIELDS.PaperDailyRun
    ),
    validateRows(
      'PaperLedger',
      research?.paper_ops?.ledger ? [research.paper_ops.ledger] : [],
      REQUIRED_FIELDS.PaperLedger
    ),
    validateRows(
      'InternalIntelligence',
      internalIntelligence ? [internalIntelligence] : [],
      REQUIRED_FIELDS.InternalIntelligence
    )
  ];

  const invalidTotal = checks.reduce((sum, row) => sum + row.invalid, 0);
  return {
    generated_at: new Date().toISOString(),
    checks,
    overall_status: invalidTotal === 0 ? 'pass' : 'attention',
    invalid_objects: invalidTotal
  };
}

export { REQUIRED_FIELDS as GOVERNANCE_REQUIRED_FIELDS };

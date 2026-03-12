import hypothesisSeedRaw from '../../../data/reference_seeds/hypothesis_registry_seed.json' with { type: 'json' };
import templateSeedRaw from '../../../data/reference_seeds/strategy_template_seed.json' with { type: 'json' };
import featureCatalogSeedRaw from '../../../data/reference_seeds/feature_catalog_seed.json' with { type: 'json' };
import researchDoctrineSeedRaw from '../../../data/reference_seeds/research_doctrine_seed.json' with { type: 'json' };
import governanceChecklistSeedRaw from '../../../data/reference_seeds/governance_checklist_seed.json' with { type: 'json' };

const STRATEGY_FAMILY_MAP = Object.freeze({
  'momentum / trend': 'Momentum / Trend Following',
  'momentum / trend following': 'Momentum / Trend Following',
  momentum: 'Momentum / Trend Following',
  'mean reversion': 'Mean Reversion',
  'regime transition': 'Regime Transition',
  'relative strength / rotation': 'Relative Strength / Cross-Sectional',
  'relative strength / cross-sectional': 'Relative Strength / Cross-Sectional',
  'volatility / compression / expansion': 'Regime Transition',
  'liquidity / stress / exhaustion': 'Regime Transition',
  'crypto funding / basis / carry': 'Crypto-Native Families',
  'event / risk-off / panic behavior': 'Regime Transition',
  'false breakout / failed move': 'Regime Transition',
  'multi-day continuation / multi-day exhaustion': 'Momentum / Trend Following',
  'breakout continuation': 'Momentum / Trend Following',
  'pullback continuation': 'Momentum / Trend Following',
  'trend acceleration': 'Momentum / Trend Following',
  'multi-day continuation': 'Momentum / Trend Following',
  'multi-day exhaustion': 'Regime Transition',
  'percentile mean reversion': 'Mean Reversion',
  'oversold rebound': 'Mean Reversion',
  'overbought fade': 'Mean Reversion',
  'false breakout fade': 'Regime Transition',
  'trend exhaustion fade': 'Regime Transition',
  'relative strength leader': 'Relative Strength / Cross-Sectional',
  'leader-laggard spread': 'Relative Strength / Cross-Sectional',
  'volatility compression breakout': 'Regime Transition',
  'funding dislocation reversion': 'Crypto-Native Families',
  'basis compression': 'Crypto-Native Families',
  'liquidity shock reversal': 'Crypto-Native Families'
});

const REGIME_ALIAS = Object.freeze({
  trend: 'trend',
  uptrend_normal: 'uptrend_normal',
  uptrend_high_vol: 'uptrend_high_vol',
  downtrend_normal: 'downtrend_normal',
  downtrend_high_vol: 'downtrend_high_vol',
  range: 'range',
  range_normal: 'range_normal',
  range_high_vol: 'range_high_vol',
  high_volatility: 'high_volatility',
  risk_off: 'risk_off',
  stress_risk_off: 'stress_risk_off',
  transition: 'transition',
  risk_recovery: 'risk_recovery'
});

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function toKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function titleCase(text) {
  return String(text || '')
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export function canonicalStrategyFamily(value) {
  const key = toKey(value).replace(/_/g, ' ');
  return STRATEGY_FAMILY_MAP[key] || value || 'Unknown';
}

function normalizeRegimes(input) {
  const values = asArray(input)
    .flatMap((item) => String(item).split(/[,\s]+/))
    .map((item) => toKey(item))
    .filter(Boolean);
  const normalized = values
    .map((item) => REGIME_ALIAS[item] || item)
    .filter(Boolean);
  return [...new Set(normalized)];
}

function normalizeAssetClasses(marketValue, fallbackFamily = '') {
  const normalized = toKey(marketValue);
  const family = toKey(fallbackFamily);

  if (normalized.includes('crypto') && !normalized.includes('equity') && !normalized.includes('stock')) {
    return ['CRYPTO'];
  }
  if (normalized.includes('us') && !normalized.includes('crypto')) {
    return ['US_STOCK'];
  }
  if (
    family.includes('funding') ||
    family.includes('basis') ||
    family.includes('liquidity') ||
    family.includes('crypto')
  ) {
    return ['CRYPTO'];
  }
  return ['US_STOCK', 'CRYPTO'];
}

function normalizeTemplateHintKey(value) {
  return toKey(value).replace(/^tpl_/, '').replace(/_\d+$/, '');
}

function defaultParameterRangesByFamily(family = '') {
  const key = toKey(family);

  if (key.includes('breakout') && !key.includes('false')) {
    return {
      breakout_percentile: { min: 0.6, max: 0.95, step: 0.05 },
      trend_lookback: { min: 10, max: 80, step: 10 },
      volatility_filter: { min: 0.35, max: 0.9, step: 0.05 }
    };
  }
  if (key.includes('pullback')) {
    return {
      pullback_depth_atr: { min: 0.6, max: 2.8, step: 0.2 },
      trend_strength_min: { min: 0.35, max: 0.85, step: 0.05 },
      retest_bars: { min: 1, max: 8, step: 1 }
    };
  }
  if (key.includes('trend') && key.includes('accel')) {
    return {
      acceleration_trigger: { min: 0.35, max: 0.95, step: 0.05 },
      confirmation_bars: { min: 1, max: 6, step: 1 },
      max_hold_bars: { min: 1, max: 6, step: 1 }
    };
  }
  if (key.includes('mean') || key.includes('oversold') || key.includes('overbought') || key.includes('reversion')) {
    return {
      zscore_trigger: { min: 1.0, max: 3.5, step: 0.25 },
      percentile_extreme: { min: 0.75, max: 0.99, step: 0.02 },
      max_hold_bars: { min: 1, max: 10, step: 1 }
    };
  }
  if (key.includes('relative') || key.includes('leader') || key.includes('laggard')) {
    return {
      top_percentile_cutoff: { min: 0.05, max: 0.4, step: 0.05 },
      rebalance_days: { min: 1, max: 20, step: 1 },
      turnover_cap: { min: 0.1, max: 0.8, step: 0.05 }
    };
  }
  if (key.includes('volatility') || key.includes('compression')) {
    return {
      compression_lookback: { min: 5, max: 30, step: 1 },
      breakout_threshold: { min: 0.35, max: 0.95, step: 0.05 },
      max_hold_bars: { min: 1, max: 8, step: 1 }
    };
  }
  if (key.includes('funding') || key.includes('basis')) {
    return {
      funding_z_trigger: { min: 1.0, max: 4.0, step: 0.25 },
      basis_shift_bps: { min: 5, max: 180, step: 5 },
      leverage_cap: { min: 1.0, max: 2.2, step: 0.1 }
    };
  }
  if (key.includes('liquidity') || key.includes('stress')) {
    return {
      spread_cap_bps: { min: 6, max: 60, step: 2 },
      stress_trigger: { min: 0.35, max: 0.95, step: 0.05 },
      size_cap_pct: { min: 0.1, max: 0.8, step: 0.05 }
    };
  }

  return {
    trigger_threshold: { min: 0.4, max: 0.9, step: 0.05 },
    confirmation_bars: { min: 1, max: 8, step: 1 },
    max_hold_bars: { min: 1, max: 10, step: 1 }
  };
}

function normalizeHypothesis(seedRow = {}, index = 0, seedId = 'unknown') {
  const family = canonicalStrategyFamily(seedRow.suggested_strategy_family || seedRow.family || 'unknown');
  const regimes = normalizeRegimes(seedRow.expected_regime || seedRow.relevant_regimes || 'range');
  const templateHints = asArray(seedRow.suggested_template_candidates)
    .map(normalizeTemplateHintKey)
    .filter(Boolean);

  return {
    hypothesis_id: seedRow.hypothesis_id || `HYP-SEED-${String(index + 1).padStart(3, '0')}`,
    description: seedRow.description || seedRow.title || `Seed hypothesis ${index + 1}`,
    title: seedRow.title || seedRow.description || `Seed hypothesis ${index + 1}`,
    economic_intuition: seedRow.economic_intuition || 'No explicit economic intuition documented in seed.',
    relevant_asset_classes: normalizeAssetClasses(seedRow.expected_market, family),
    relevant_regimes: regimes.length ? regimes : ['range'],
    candidate_strategy_families: [...new Set([family].concat(asArray(seedRow.candidate_strategy_families).map(canonicalStrategyFamily)))],
    expected_holding_horizon: seedRow.expected_holding_horizon || '1-5 bars',
    supporting_features: asArray(seedRow.required_feature_hints || seedRow.supporting_features).map((item) => toKey(item)).filter(Boolean),
    candidate_template_hints: templateHints,
    source_metadata: {
      source_type: 'seed_runtime',
      seed_id: seedId,
      seed_index: index,
      seed_file: 'data/reference_seeds/hypothesis_registry_seed.json'
    }
  };
}

function templateAliases(templateId, family) {
  const baseFamily = normalizeTemplateHintKey(family);
  const idAlias = normalizeTemplateHintKey(templateId);
  return [...new Set([baseFamily, idAlias].filter(Boolean))];
}

function normalizeTemplate(seedRow = {}, index = 0, seedId = 'unknown') {
  const family = canonicalStrategyFamily(seedRow.family || seedRow.strategy_family || 'unknown');
  const compatibleRegimes = normalizeRegimes(seedRow.compatible_regimes || ['range']);
  const compatibleFeatures = asArray(seedRow.compatible_features).map((item) => toKey(item)).filter(Boolean);

  return {
    template_id: seedRow.template_id || `TPL-SEED-${String(index + 1).padStart(3, '0')}`,
    template_name:
      seedRow.template_name || titleCase(seedRow.family || seedRow.template_id || `Seed Template ${index + 1}`),
    strategy_family: family,
    entry_logic_structure: seedRow.entry_logic_structure || seedRow.entry_logic || 'Seed-defined entry logic',
    exit_logic_structure: seedRow.exit_logic_structure || seedRow.exit_logic || 'Seed-defined exit logic',
    risk_logic: seedRow.stop_logic_structure || seedRow.risk_logic || 'Risk controls from template seed',
    position_sizing_logic: seedRow.sizing_logic_hints || seedRow.position_sizing_logic || 'Risk-bucket aligned sizing',
    compatible_features: compatibleFeatures,
    parameter_ranges: seedRow.parameter_ranges || defaultParameterRangesByFamily(seedRow.family || family),
    compatible_asset_classes: normalizeAssetClasses(seedRow.supported_market || seedRow.market || seedRow.family, family),
    compatible_regimes: compatibleRegimes.length ? compatibleRegimes : ['range'],
    expected_holding_horizon: seedRow.expected_holding_horizon || '1-5 bars',
    expected_trade_density: seedRow.expected_trade_density || 'medium',
    risk_profile: seedRow.risk_profile || 'balanced',
    template_key_aliases: templateAliases(seedRow.template_id, seedRow.family),
    source_metadata: {
      source_type: 'seed_runtime',
      seed_id: seedId,
      seed_index: index,
      seed_file: 'data/reference_seeds/strategy_template_seed.json'
    }
  };
}

function buildFeatureCatalogIndex(seed = {}) {
  const groups = asArray(seed.feature_groups);
  const byFeature = {};
  const groupRows = groups.map((group) => ({
    group_id: group.group_id || toKey(group.title),
    title: group.title || group.group_id || 'unknown',
    purpose: group.purpose || '',
    example_features: asArray(group.example_features).map((item) => toKey(item))
  }));

  for (const group of groupRows) {
    for (const feature of group.example_features) {
      byFeature[feature] = {
        group_id: group.group_id,
        group_title: group.title
      };
    }
  }

  return {
    seed_id: seed.seed_id || 'feature_catalog_seed',
    generated_at: seed.generated_at || new Date().toISOString(),
    groups: groupRows,
    by_feature: byFeature,
    total_groups: groupRows.length,
    total_features: Object.keys(byFeature).length
  };
}

function resolveSeed(raw, fallback = {}) {
  return raw && typeof raw === 'object' ? raw : fallback;
}

export function loadDiscoverySeedRuntime({
  seedOverrides = {}
} = {}) {
  const hypothesisSeed = resolveSeed(seedOverrides.hypothesis_seed, hypothesisSeedRaw);
  const templateSeed = resolveSeed(seedOverrides.template_seed, templateSeedRaw);
  const featureSeed = resolveSeed(seedOverrides.feature_catalog_seed, featureCatalogSeedRaw);
  const doctrineSeed = resolveSeed(seedOverrides.research_doctrine_seed, researchDoctrineSeedRaw);
  const checklistSeed = resolveSeed(seedOverrides.governance_checklist_seed, governanceChecklistSeedRaw);

  const normalizedHypotheses = asArray(hypothesisSeed.hypotheses).map((row, idx) =>
    normalizeHypothesis(row, idx, hypothesisSeed.seed_id || 'hypothesis_seed')
  );
  const normalizedTemplates = asArray(templateSeed.templates).map((row, idx) =>
    normalizeTemplate(row, idx, templateSeed.seed_id || 'template_seed')
  );
  const featureCatalog = buildFeatureCatalogIndex(featureSeed);

  return {
    loaded_at: new Date().toISOString(),
    runtime_version: 'discovery-seed-runtime.v1',
    hypothesis_seed: {
      seed_id: hypothesisSeed.seed_id || 'hypothesis_seed',
      total: normalizedHypotheses.length
    },
    template_seed: {
      seed_id: templateSeed.seed_id || 'template_seed',
      total: normalizedTemplates.length
    },
    feature_catalog_seed: {
      seed_id: featureCatalog.seed_id,
      total_feature_groups: featureCatalog.total_groups,
      total_features: featureCatalog.total_features
    },
    research_doctrine_seed: {
      version: doctrineSeed.version || doctrineSeed.seed_id || 'unknown',
      principles: asArray(doctrineSeed.principles).length
    },
    governance_checklist_seed: {
      version: checklistSeed.version || checklistSeed.seed_id || 'unknown',
      sections: asArray(checklistSeed.checklist_sections).length
    },
    hypotheses: normalizedHypotheses,
    templates: normalizedTemplates,
    feature_catalog: featureCatalog,
    research_doctrine: doctrineSeed,
    governance_checklist: checklistSeed
  };
}

export function summarizeFeatureAlignment({
  requiredFeatures = [],
  featureCatalog = {}
} = {}) {
  const byFeature = featureCatalog?.by_feature || {};
  const normalizedRequired = asArray(requiredFeatures).map((item) => toKey(item)).filter(Boolean);
  const matched = [];
  const missing = [];
  const groups = new Set();

  for (const feature of normalizedRequired) {
    if (byFeature[feature]) {
      matched.push(feature);
      groups.add(byFeature[feature].group_id);
    } else {
      missing.push(feature);
    }
  }

  return {
    required_features: normalizedRequired,
    catalog_matched_features: matched,
    catalog_missing_features: missing,
    required_feature_groups: [...groups]
  };
}

export function normalizeConstraintList(value) {
  return asArray(value).map((item) => String(item).trim()).filter(Boolean);
}

export function normalizeTemplateHint(value) {
  return normalizeTemplateHintKey(value);
}

import {
  canonicalStrategyFamily,
  loadDiscoverySeedRuntime,
  normalizeConstraintList
} from './seedRuntime.js';

const LEGACY_TEMPLATE_REGISTRY = Object.freeze([
  {
    template_id: 'TMP-BREAKOUT-CONT',
    template_name: 'Breakout Continuation Template',
    strategy_family: 'Momentum / Trend Following',
    entry_logic_structure: 'Breakout above/below range with trend and volume confirmation',
    exit_logic_structure: 'Time stop + trailing stop + momentum decay exit',
    risk_logic: 'Volatility-normalized stop distance with regime guardrails',
    position_sizing_logic: 'Conviction * regime multiplier * risk bucket multiplier',
    compatible_features: ['trend_strength', 'breakout_distance', 'volume_expansion', 'vol_percentile'],
    parameter_ranges: {
      breakout_percentile: { min: 0.6, max: 0.95, step: 0.05 },
      trend_lookback: { min: 10, max: 80, step: 10 },
      volatility_filter: { min: 0.45, max: 0.9, step: 0.05 }
    },
    compatible_asset_classes: ['US_STOCK', 'CRYPTO'],
    compatible_regimes: ['trend', 'uptrend_normal', 'uptrend_high_vol']
  },
  {
    template_id: 'TMP-MEAN-REVERT',
    template_name: 'Mean Reversion Template',
    strategy_family: 'Mean Reversion',
    entry_logic_structure: 'Enter on percentile/z-score overshoot with liquidity confirmation',
    exit_logic_structure: 'Exit on mean reversion target or time decay',
    risk_logic: 'Stop on adverse continuation and volatility shock expansion',
    position_sizing_logic: 'Reduce size under risk-off or weak liquidity',
    compatible_features: ['zscore_lookback', 'percentile_rank', 'vol_spike_score', 'liquidity_score'],
    parameter_ranges: {
      zscore_trigger: { min: 1.0, max: 3.5, step: 0.25 },
      percentile_extreme: { min: 0.75, max: 0.99, step: 0.02 },
      max_hold_bars: { min: 1, max: 10, step: 1 }
    },
    compatible_asset_classes: ['US_STOCK', 'CRYPTO'],
    compatible_regimes: ['range', 'range_high_vol', 'high_volatility']
  },
  {
    template_id: 'TMP-REL-STRENGTH',
    template_name: 'Relative Strength Ranking Template',
    strategy_family: 'Relative Strength / Cross-Sectional',
    entry_logic_structure: 'Select top-ranked assets or sectors by momentum/strength composite',
    exit_logic_structure: 'Periodic rebalance or rank breakdown exit',
    risk_logic: 'Concentration cap and correlation conflict filter',
    position_sizing_logic: 'Rank-proportional with turnover penalty',
    compatible_features: ['sector_relative_strength', 'cross_asset_rank', 'basket_rank', 'turnover_cost_proxy'],
    parameter_ranges: {
      top_percentile_cutoff: { min: 0.05, max: 0.4, step: 0.05 },
      rebalance_days: { min: 1, max: 20, step: 1 },
      turnover_cap: { min: 0.1, max: 0.8, step: 0.05 }
    },
    compatible_asset_classes: ['US_STOCK', 'CRYPTO'],
    compatible_regimes: ['trend', 'range_normal', 'risk_recovery']
  },
  {
    template_id: 'TMP-REGIME-TRANS',
    template_name: 'Regime Transition Template',
    strategy_family: 'Regime Transition',
    entry_logic_structure: 'Activate when transition signals exceed threshold and regime confidence decays',
    exit_logic_structure: 'Exit after transition completion or failed transition reversal',
    risk_logic: 'Aggressive size down under transition uncertainty',
    position_sizing_logic: 'Transition confidence weighted with defensive cap',
    compatible_features: ['risk_on_off_score', 'breadth_decay', 'cross_asset_stress', 'trend_confidence'],
    parameter_ranges: {
      transition_trigger: { min: 0.45, max: 0.95, step: 0.05 },
      confirmation_bars: { min: 1, max: 8, step: 1 },
      defensive_cut_multiplier: { min: 0.15, max: 0.9, step: 0.05 }
    },
    compatible_asset_classes: ['US_STOCK', 'CRYPTO'],
    compatible_regimes: ['transition', 'risk_off', 'high_volatility', 'range_high_vol']
  },
  {
    template_id: 'TMP-FUNDING-BASIS',
    template_name: 'Funding/Basis Dislocation Template',
    strategy_family: 'Crypto-Native Families',
    entry_logic_structure: 'Enter when funding/basis dislocation exceeds constrained threshold',
    exit_logic_structure: 'Exit on carry normalization, basis compression, or stress expansion',
    risk_logic: 'Spread and depth stress gates + leverage cap',
    position_sizing_logic: 'Carry score weighted with liquidity and stress penalty',
    compatible_features: ['funding_rate', 'funding_zscore', 'basis_annualized', 'open_interest_change'],
    parameter_ranges: {
      funding_z_trigger: { min: 1.0, max: 4.0, step: 0.25 },
      basis_shift_bps: { min: 5, max: 180, step: 5 },
      leverage_cap: { min: 1.0, max: 2.5, step: 0.1 }
    },
    compatible_asset_classes: ['CRYPTO'],
    compatible_regimes: ['range', 'high_volatility', 'risk_off', 'trend']
  }
]);

function parseHorizonRange(horizon) {
  const text = String(horizon || '').trim();
  const match = text.match(/(\d+)\s*[-/]?\s*(\d+)?/);
  if (!match) return { avg: 4 };
  const first = Number(match[1]);
  const second = Number(match[2] || match[1]);
  return { avg: (Math.min(first, second) + Math.max(first, second)) / 2 };
}

function parseHorizonConstraint(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return { min: 0, max: raw };
  if (typeof raw === 'object') {
    return {
      min: Number.isFinite(raw.min) ? raw.min : 0,
      max: Number.isFinite(raw.max) ? raw.max : Number.POSITIVE_INFINITY
    };
  }
  const key = String(raw).toLowerCase().trim();
  if (key === 'short') return { min: 0, max: 3 };
  if (key === 'swing' || key === 'medium') return { min: 2, max: 10 };
  if (key === 'long') return { min: 8, max: Number.POSITIVE_INFINITY };
  const parsed = parseHorizonRange(key);
  return { min: Math.max(0, parsed.avg - 1), max: parsed.avg + 1 };
}

function normalizeTemplate(template = {}, index = 0) {
  return {
    template_id: template.template_id || `TMP-LEGACY-${String(index + 1).padStart(3, '0')}`,
    template_name: template.template_name || template.template_id || `Discovery template ${index + 1}`,
    strategy_family: canonicalStrategyFamily(template.strategy_family || template.family || 'unknown'),
    entry_logic_structure: template.entry_logic_structure || template.entry_logic || 'Template entry logic',
    exit_logic_structure: template.exit_logic_structure || template.exit_logic || 'Template exit logic',
    risk_logic: template.risk_logic || template.stop_logic_structure || 'Template risk logic',
    position_sizing_logic: template.position_sizing_logic || template.sizing_logic_hints || 'Template sizing logic',
    compatible_features: Array.isArray(template.compatible_features) ? template.compatible_features : [],
    parameter_ranges: template.parameter_ranges || {},
    compatible_asset_classes: Array.isArray(template.compatible_asset_classes)
      ? template.compatible_asset_classes
      : ['US_STOCK', 'CRYPTO'],
    compatible_regimes: Array.isArray(template.compatible_regimes) ? template.compatible_regimes : ['range'],
    expected_holding_horizon: template.expected_holding_horizon || '1-5 bars',
    expected_trade_density: template.expected_trade_density || 'medium',
    risk_profile: template.risk_profile || 'balanced',
    template_key_aliases: Array.isArray(template.template_key_aliases)
      ? template.template_key_aliases
      : [],
    source_metadata: template.source_metadata || {
      source_type: 'legacy_registry',
      seed_id: null,
      seed_index: index,
      seed_file: null
    }
  };
}

function resolveTemplates({
  seedRuntime = null,
  seedOverrides = {},
  templates = null
} = {}) {
  if (Array.isArray(templates) && templates.length) {
    return templates.map((item, idx) => normalizeTemplate(item, idx));
  }
  const runtime = seedRuntime || loadDiscoverySeedRuntime({ seedOverrides });
  if (Array.isArray(runtime?.templates) && runtime.templates.length) {
    return runtime.templates.map((item, idx) => normalizeTemplate(item, idx));
  }
  return LEGACY_TEMPLATE_REGISTRY.map((item, idx) => normalizeTemplate(item, idx));
}

function normalizeConstraints(constraints = {}) {
  return {
    market: normalizeConstraintList(constraints.market || constraints.markets).map((item) => String(item).toUpperCase()),
    asset_classes: normalizeConstraintList(constraints.asset_class || constraints.asset_classes).map((item) =>
      String(item).toUpperCase()
    ),
    regimes: normalizeConstraintList(constraints.regime || constraints.regimes).map((item) => String(item).toLowerCase()),
    families: normalizeConstraintList(constraints.family || constraints.families).map(canonicalStrategyFamily),
    trade_horizon: parseHorizonConstraint(constraints.trade_horizon || constraints.horizon),
    risk_profile: String(constraints.risk_profile || constraints.riskProfile || '').toLowerCase().trim()
  };
}

function supportsMarket(template, markets = []) {
  if (!markets.length) return true;
  const assets = new Set((template.compatible_asset_classes || []).map((item) => String(item).toUpperCase()));
  if (markets.some((item) => ['US', 'US_STOCK', 'EQUITY'].includes(item)) && !assets.has('US_STOCK')) return false;
  if (markets.some((item) => ['CRYPTO'].includes(item)) && !assets.has('CRYPTO')) return false;
  return true;
}

function supportsAssetClass(template, classes = []) {
  if (!classes.length) return true;
  const assets = new Set((template.compatible_asset_classes || []).map((item) => String(item).toUpperCase()));
  return classes.every((item) => assets.has(item));
}

function supportsRegime(template, regimes = []) {
  if (!regimes.length) return true;
  const available = new Set((template.compatible_regimes || []).map((item) => String(item).toLowerCase()));
  return regimes.some((item) => available.has(item));
}

function supportsFamily(template, families = []) {
  if (!families.length) return true;
  const family = canonicalStrategyFamily(template.strategy_family);
  return families.includes(family);
}

function supportsHorizon(template, horizon = null) {
  if (!horizon) return true;
  const avg = parseHorizonRange(template.expected_holding_horizon).avg;
  return avg >= horizon.min && avg <= horizon.max;
}

function supportsRiskProfile(template, riskProfile = '') {
  if (!riskProfile) return true;
  const templateRisk = String(template.risk_profile || '').toLowerCase();
  const family = String(template.strategy_family || '').toLowerCase();
  if (riskProfile === 'conservative') {
    return !(
      templateRisk.includes('fast') ||
      templateRisk.includes('exhaustion') ||
      family.includes('crypto-native')
    );
  }
  if (riskProfile === 'balanced') {
    return !templateRisk.includes('experimental');
  }
  return true;
}

function applyConstraints(templates = [], constraints = {}) {
  return (templates || []).filter((template) => (
    supportsMarket(template, constraints.market) &&
    supportsAssetClass(template, constraints.asset_classes) &&
    supportsRegime(template, constraints.regimes) &&
    supportsFamily(template, constraints.families) &&
    supportsHorizon(template, constraints.trade_horizon) &&
    supportsRiskProfile(template, constraints.risk_profile)
  ));
}

export function listDiscoveryTemplates({
  seedRuntime = null,
  seedOverrides = {},
  templates = null
} = {}) {
  return resolveTemplates({
    seedRuntime,
    seedOverrides,
    templates
  });
}

export function buildTemplateRegistry({
  asOf = new Date().toISOString(),
  config = {},
  seedRuntime = null,
  seedOverrides = {},
  templates = null
} = {}) {
  const resolved = resolveTemplates({
    seedRuntime,
    seedOverrides,
    templates
  });
  const constraints = normalizeConstraints(config.constraints || config);
  const constrained = applyConstraints(resolved, constraints);
  const seedConsumed = resolved.some((item) => item?.source_metadata?.source_type === 'seed_runtime');
  const fallbackUsed = resolved.some((item) => item?.source_metadata?.source_type === 'legacy_registry');

  return {
    generated_at: asOf,
    registry_version: 'discovery-template-registry.v2',
    registry_source: {
      seed_runtime_consumed: seedConsumed,
      fallback_used: fallbackUsed,
      total_seed_templates:
        seedRuntime?.templates?.length ||
        resolved.filter((item) => item?.source_metadata?.source_type === 'seed_runtime').length
    },
    constraints_applied: constraints,
    templates: constrained,
    total_templates: constrained.length
  };
}

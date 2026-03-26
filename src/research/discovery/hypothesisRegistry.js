import {
  canonicalStrategyFamily,
  loadDiscoverySeedRuntime,
  normalizeConstraintList,
} from './seedRuntime.js';
import { scoreFeatureReadiness } from './runtimeFeatureSupport.js';

const LEGACY_HYPOTHESIS_REGISTRY = Object.freeze([
  {
    hypothesis_id: 'HYP-MOM-PERSIST',
    description: 'Momentum persistence after structure breakout',
    economic_intuition:
      'Institutional flow and positioning inertia can extend directional moves beyond initial breakout.',
    relevant_asset_classes: ['US_STOCK', 'CRYPTO'],
    relevant_regimes: ['trend', 'uptrend_normal', 'uptrend_high_vol'],
    candidate_strategy_families: ['Momentum / Trend Following'],
    expected_holding_horizon: '2-8 bars',
    supporting_features: [
      'trend_strength',
      'breakout_distance',
      'volume_expansion',
      'vol_percentile',
    ],
  },
  {
    hypothesis_id: 'HYP-VOL-EXP-CONT',
    description: 'Volatility expansion continuation when trend is confirmed',
    economic_intuition:
      'Volatility expansion with directional confirmation often reflects information repricing rather than noise.',
    relevant_asset_classes: ['US_STOCK', 'CRYPTO'],
    relevant_regimes: ['uptrend_high_vol', 'downtrend_high_vol', 'high_volatility'],
    candidate_strategy_families: ['Momentum / Trend Following', 'Regime Transition'],
    expected_holding_horizon: '1-5 bars',
    supporting_features: ['vol_percentile', 'range_breakout', 'trend_strength', 'volume_expansion'],
  },
  {
    hypothesis_id: 'HYP-LIQ-SHOCK-REV',
    description: 'Liquidity shocks mean-revert after forced flow exhaustion',
    economic_intuition:
      'Temporary liquidity dislocations can overshoot fair value and then revert as forced flow subsides.',
    relevant_asset_classes: ['US_STOCK', 'CRYPTO'],
    relevant_regimes: ['range_high_vol', 'high_volatility', 'stress_risk_off'],
    candidate_strategy_families: ['Mean Reversion', 'Crypto-Native Families'],
    expected_holding_horizon: '1-4 bars',
    supporting_features: [
      'spread_bps',
      'liquidity_score',
      'zscore_lookback',
      'liquidation_imbalance',
    ],
  },
  {
    hypothesis_id: 'HYP-FUNDING-DISLOCATION',
    description: 'Funding dislocations resolve toward carry equilibrium',
    economic_intuition:
      'Extreme funding states are often unstable and normalize with carry compression or directional unwind.',
    relevant_asset_classes: ['CRYPTO'],
    relevant_regimes: ['range', 'high_volatility', 'risk_off'],
    candidate_strategy_families: ['Crypto-Native Families'],
    expected_holding_horizon: '2-10 bars',
    supporting_features: [
      'funding_rate',
      'funding_zscore',
      'basis_annualized',
      'open_interest_change',
    ],
  },
  {
    hypothesis_id: 'HYP-RS-ROTATION',
    description: 'Relative strength leadership rotation persists over short horizons',
    economic_intuition:
      'Cross-sectional leadership transitions are slow enough to capture with rank-based models.',
    relevant_asset_classes: ['US_STOCK', 'CRYPTO'],
    relevant_regimes: ['trend', 'range_normal', 'risk_recovery'],
    candidate_strategy_families: ['Relative Strength / Cross-Sectional'],
    expected_holding_horizon: '3-12 bars',
    supporting_features: [
      'sector_relative_strength',
      'cross_asset_rank',
      'basket_rank',
      'breadth_ratio',
    ],
  },
]);

function parseHorizonRange(horizon) {
  const text = String(horizon || '').trim();
  if (!text) return { min: 1, max: 8, avg: 4.5 };
  const match = text.match(/(\d+)\s*[-/]?\s*(\d+)?/);
  if (!match) return { min: 1, max: 8, avg: 4.5 };
  const first = Number(match[1]);
  const second = Number(match[2] || match[1]);
  const min = Math.min(first, second);
  const max = Math.max(first, second);
  return {
    min,
    max,
    avg: (min + max) / 2,
  };
}

function normalizeHypothesis(row = {}, index = 0) {
  return {
    hypothesis_id: row.hypothesis_id || `HYP-LEGACY-${String(index + 1).padStart(3, '0')}`,
    description: row.description || row.title || `Discovery hypothesis ${index + 1}`,
    title: row.title || row.description || `Discovery hypothesis ${index + 1}`,
    economic_intuition: row.economic_intuition || 'No explicit economic intuition provided.',
    relevant_asset_classes: Array.isArray(row.relevant_asset_classes)
      ? row.relevant_asset_classes
      : ['US_STOCK', 'CRYPTO'],
    relevant_regimes: Array.isArray(row.relevant_regimes) ? row.relevant_regimes : ['range'],
    candidate_strategy_families: (Array.isArray(row.candidate_strategy_families)
      ? row.candidate_strategy_families
      : [row.family]
    )
      .filter(Boolean)
      .map(canonicalStrategyFamily),
    expected_holding_horizon: row.expected_holding_horizon || '1-5 bars',
    supporting_features: Array.isArray(row.supporting_features) ? row.supporting_features : [],
    candidate_template_hints: Array.isArray(row.candidate_template_hints)
      ? row.candidate_template_hints
      : [],
    source_metadata: row.source_metadata || {
      source_type: 'legacy_registry',
      seed_id: null,
      seed_index: index,
      seed_file: null,
    },
  };
}

function resolveHypotheses({ seedRuntime = null, seedOverrides = {}, hypotheses = null } = {}) {
  if (Array.isArray(hypotheses) && hypotheses.length) {
    return hypotheses.map((item, idx) => normalizeHypothesis(item, idx));
  }

  const runtime = seedRuntime || loadDiscoverySeedRuntime({ seedOverrides });
  if (Array.isArray(runtime?.hypotheses) && runtime.hypotheses.length) {
    return runtime.hypotheses.map((item, idx) => normalizeHypothesis(item, idx));
  }

  return LEGACY_HYPOTHESIS_REGISTRY.map((item, idx) => normalizeHypothesis(item, idx));
}

function parseHorizonConstraint(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return { min: 0, max: raw };
  if (typeof raw === 'object' && Number.isFinite(raw.max || raw.min)) {
    return {
      min: Number.isFinite(raw.min) ? raw.min : 0,
      max: Number.isFinite(raw.max) ? raw.max : Number.POSITIVE_INFINITY,
    };
  }

  const token = String(raw).toLowerCase().trim();
  if (token === 'short') return { min: 0, max: 3 };
  if (token === 'swing' || token === 'medium') return { min: 2, max: 10 };
  if (token === 'long') return { min: 8, max: Number.POSITIVE_INFINITY };

  const range = parseHorizonRange(token);
  return { min: range.min, max: range.max };
}

function normalizeConstraints(constraints = {}) {
  const market = normalizeConstraintList(constraints.market || constraints.markets).map((item) =>
    String(item).toUpperCase(),
  );
  const assetClasses = normalizeConstraintList(
    constraints.asset_class || constraints.asset_classes,
  ).map((item) => String(item).toUpperCase());
  const regimes = normalizeConstraintList(constraints.regime || constraints.regimes).map((item) =>
    String(item).toLowerCase(),
  );
  const families = normalizeConstraintList(constraints.family || constraints.families).map(
    canonicalStrategyFamily,
  );
  const horizon = parseHorizonConstraint(constraints.trade_horizon || constraints.horizon);
  const riskProfile = String(constraints.risk_profile || constraints.riskProfile || '')
    .toLowerCase()
    .trim();

  return {
    market,
    asset_classes: assetClasses,
    regimes,
    families,
    trade_horizon: horizon,
    risk_profile: riskProfile,
  };
}

function supportsMarket(hypothesis, markets = []) {
  if (!markets.length) return true;
  const assets = new Set(
    (hypothesis.relevant_asset_classes || []).map((item) => String(item).toUpperCase()),
  );
  if (
    markets.some((item) => ['US', 'US_STOCK', 'EQUITY'].includes(item)) &&
    !assets.has('US_STOCK')
  )
    return false;
  if (markets.some((item) => ['CRYPTO'].includes(item)) && !assets.has('CRYPTO')) return false;
  return true;
}

function supportsAssetClass(hypothesis, classes = []) {
  if (!classes.length) return true;
  const assets = new Set(
    (hypothesis.relevant_asset_classes || []).map((item) => String(item).toUpperCase()),
  );
  return classes.every((item) => assets.has(item));
}

function supportsRegime(hypothesis, regimes = []) {
  if (!regimes.length) return true;
  const set = new Set(
    (hypothesis.relevant_regimes || []).map((item) => String(item).toLowerCase()),
  );
  return regimes.some((item) => set.has(item));
}

function supportsFamily(hypothesis, families = []) {
  if (!families.length) return true;
  const set = new Set((hypothesis.candidate_strategy_families || []).map(canonicalStrategyFamily));
  return families.some((item) => set.has(item));
}

function supportsHorizon(hypothesis, horizon = null) {
  if (!horizon) return true;
  const parsed = parseHorizonRange(hypothesis.expected_holding_horizon);
  return parsed.avg >= horizon.min && parsed.avg <= horizon.max;
}

function applyConstraints(hypotheses = [], constraints = {}) {
  return (hypotheses || []).filter(
    (hypothesis) =>
      supportsMarket(hypothesis, constraints.market) &&
      supportsAssetClass(hypothesis, constraints.asset_classes) &&
      supportsRegime(hypothesis, constraints.regimes) &&
      supportsFamily(hypothesis, constraints.families) &&
      supportsHorizon(hypothesis, constraints.trade_horizon),
  );
}

function scoreHypothesisFit(
  hypothesis,
  { currentRegime = 'range', starvation = false, decayingFamilies = [] } = {},
) {
  const regimeFit = hypothesis.relevant_regimes.includes(currentRegime) ? 1 : 0.45;
  const starvationBoost = starvation ? 0.16 : 0;
  const decayBoost = hypothesis.candidate_strategy_families.some((family) =>
    decayingFamilies.includes(family),
  )
    ? 0.14
    : 0;
  const runtimeReadiness = scoreFeatureReadiness(
    hypothesis.supporting_features || [],
    hypothesis.relevant_asset_classes || [],
  );
  const publicSeedBoost = String(hypothesis.source_metadata?.seed_id || '').startsWith('public_')
    ? 0.05
    : 0;
  return Math.max(
    0,
    Math.min(
      1,
      regimeFit * 0.44 +
        starvationBoost +
        decayBoost +
        0.21 +
        runtimeReadiness * 0.3 +
        publicSeedBoost,
    ),
  );
}

export function listHypotheses({ seedRuntime = null, seedOverrides = {}, hypotheses = null } = {}) {
  return resolveHypotheses({
    seedRuntime,
    seedOverrides,
    hypotheses,
  });
}

export function buildHypothesisRegistry({
  asOf = new Date().toISOString(),
  context = {},
  config = {},
  seedRuntime = null,
  seedOverrides = {},
  hypotheses = null,
} = {}) {
  const resolved = resolveHypotheses({
    seedRuntime,
    seedOverrides,
    hypotheses,
  });
  const constraints = normalizeConstraints(config.constraints || config);
  const constrained = applyConstraints(resolved, constraints);
  const seedConsumed = resolved.some(
    (item) => item?.source_metadata?.source_type === 'seed_runtime',
  );
  const fallbackUsed = resolved.some(
    (item) => item?.source_metadata?.source_type === 'legacy_registry',
  );
  const scored = constrained
    .map((hypothesis) => ({
      ...hypothesis,
      discovery_priority_score: Number(scoreHypothesisFit(hypothesis, context).toFixed(4)),
    }))
    .sort((a, b) => b.discovery_priority_score - a.discovery_priority_score);

  return {
    generated_at: asOf,
    registry_version: 'hypothesis-registry.v2',
    registry_source: {
      seed_runtime_consumed: seedConsumed,
      fallback_used: fallbackUsed,
      total_seed_hypotheses:
        seedRuntime?.hypotheses?.length ||
        resolved.filter((item) => item?.source_metadata?.source_type === 'seed_runtime').length,
    },
    constraints_applied: constraints,
    hypotheses: scored,
    total_hypotheses: scored.length,
  };
}

import { buildStableAlphaId, type AutonomousAlphaCandidate } from '../alpha_registry/index.js';

type MutationBudget = {
  maxMutations: number;
  simplicityBias: number;
};

const FEATURE_SUBSTITUTIONS: Record<string, string[]> = {
  trend_strength: ['breakout_distance', 'volume_expansion'],
  breakout_distance: ['trend_strength', 'range_breakout'],
  volume_expansion: ['liquidity_score', 'turnover_cost_proxy'],
  liquidity_score: ['spread_bps', 'volume_expansion'],
  funding_rate: ['funding_zscore', 'basis_annualized'],
  basis_annualized: ['funding_rate', 'open_interest_change'],
  cross_asset_rank: ['basket_rank', 'sector_relative_strength'],
  sector_relative_strength: ['cross_asset_rank', 'breadth_ratio']
};

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function simplifyNumericParam(value: number) {
  if (Math.abs(value) >= 100) return Math.round(value / 5) * 5;
  if (Math.abs(value) >= 10) return Math.round(value);
  if (Math.abs(value) >= 1) return round(value, 2);
  return round(value, 3);
}

function pruneRedundantFeatures(features: string[]) {
  return [...new Set(features.filter(Boolean))].slice(0, 5);
}

function mutateParams(params: AutonomousAlphaCandidate['params'], direction: 'tighter' | 'looser') {
  const next: AutonomousAlphaCandidate['params'] = {};
  for (const [key, rawValue] of Object.entries(params || {})) {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      next[key] = rawValue;
      continue;
    }
    const factor = direction === 'tighter' ? 0.9 : 1.1;
    next[key] = simplifyNumericParam(rawValue * factor);
  }
  return next;
}

function substituteFeatures(features: string[]) {
  const base = pruneRedundantFeatures(features);
  const next = [...base];
  for (const feature of base) {
    const substitutes = FEATURE_SUBSTITUTIONS[feature] || [];
    for (const substitute of substitutes) {
      if (!next.includes(substitute)) {
        next.push(substitute);
        break;
      }
    }
    if (next.length >= Math.max(4, base.length)) break;
  }
  return pruneRedundantFeatures(next);
}

function simplifyCandidate(candidate: AutonomousAlphaCandidate): AutonomousAlphaCandidate {
  const simplifiedFeatures = pruneRedundantFeatures(candidate.feature_dependencies);
  const simplifiedParams = Object.fromEntries(
    Object.entries(candidate.params || {}).map(([key, value]) => [
      key,
      typeof value === 'number' && Number.isFinite(value) ? simplifyNumericParam(value) : value
    ])
  );
  const seed = {
    parent: candidate.id,
    type: 'simplified',
    params: simplifiedParams,
    features: simplifiedFeatures
  };

  return {
    ...candidate,
    id: buildStableAlphaId(seed),
    thesis: `${candidate.thesis} [simplified]`,
    params: simplifiedParams,
    feature_dependencies: simplifiedFeatures,
    required_inputs: pruneRedundantFeatures([...candidate.required_inputs, ...simplifiedFeatures]),
    complexity_score: round(Math.max(0.8, candidate.complexity_score * 0.84), 4),
    parent_alpha_id: candidate.id,
    notes: [...(candidate.notes || []), 'simplified_thresholds', 'pruned_redundant_conditions']
  };
}

export function buildAlphaMutations(
  candidate: AutonomousAlphaCandidate,
  budget: MutationBudget
): AutonomousAlphaCandidate[] {
  const mutations: AutonomousAlphaCandidate[] = [];
  if (budget.maxMutations <= 0) return mutations;

  const tighter = {
    ...candidate,
    id: buildStableAlphaId({ parent: candidate.id, type: 'tighter', params: mutateParams(candidate.params, 'tighter') }),
    thesis: `${candidate.thesis} [tighter]`,
    params: mutateParams(candidate.params, 'tighter'),
    complexity_score: round(Math.max(0.8, candidate.complexity_score - 0.15 * budget.simplicityBias), 4),
    parent_alpha_id: candidate.id,
    notes: [...(candidate.notes || []), 'parameter_mutation:tighter']
  };
  mutations.push(tighter);

  if (mutations.length < budget.maxMutations) {
    mutations.push({
      ...candidate,
      id: buildStableAlphaId({
        parent: candidate.id,
        type: 'feature_substitution',
        features: substituteFeatures(candidate.feature_dependencies)
      }),
      thesis: `${candidate.thesis} [feature-substitution]`,
      feature_dependencies: substituteFeatures(candidate.feature_dependencies),
      required_inputs: pruneRedundantFeatures([...candidate.required_inputs, ...substituteFeatures(candidate.feature_dependencies)]),
      complexity_score: round(Math.max(0.85, candidate.complexity_score - 0.08 * budget.simplicityBias), 4),
      parent_alpha_id: candidate.id,
      notes: [...(candidate.notes || []), 'feature_substitution']
    });
  }

  if (mutations.length < budget.maxMutations) {
    mutations.push(simplifyCandidate(candidate));
  }

  if (mutations.length < budget.maxMutations) {
    mutations.push({
      ...candidate,
      id: buildStableAlphaId({ parent: candidate.id, type: 'looser', params: mutateParams(candidate.params, 'looser') }),
      thesis: `${candidate.thesis} [looser]`,
      params: mutateParams(candidate.params, 'looser'),
      complexity_score: round(candidate.complexity_score + 0.06, 4),
      parent_alpha_id: candidate.id,
      notes: [...(candidate.notes || []), 'parameter_mutation:looser']
    });
  }

  return mutations.slice(0, budget.maxMutations);
}

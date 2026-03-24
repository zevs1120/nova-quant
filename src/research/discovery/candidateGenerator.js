import { clamp, deterministicHash, round } from '../../engines/math.js';
import {
  canonicalStrategyFamily,
  normalizeConstraintList,
  normalizeTemplateHint,
  summarizeFeatureAlignment,
} from './seedRuntime.js';

function intersect(a = [], b = []) {
  const set = new Set((b || []).map((item) => String(item).toLowerCase()));
  return (a || []).filter((item) => set.has(String(item).toLowerCase()));
}

function numericRange(range = {}) {
  const min = Number(range.min);
  const max = Number(range.max);
  const step = Number(range.step || 1);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return null;
  }
  return {
    min,
    max,
    step: Number.isFinite(step) && step > 0 ? step : 1,
  };
}

function snapToStep(value, range) {
  if (!range) return Number(value);
  const clipped = clamp(Number(value), range.min, range.max);
  const steps = Math.round((clipped - range.min) / range.step);
  const snapped = range.min + steps * range.step;
  return Number(round(clamp(snapped, range.min, range.max), 6));
}

function midpoint(range) {
  if (!range) return 0;
  return snapToStep((range.min + range.max) / 2, range);
}

function conservativeValue(range, name) {
  if (!range) return 0;
  const lowerName = String(name || '').toLowerCase();
  const isThreshold = /(threshold|trigger|cutoff|min|floor|sigma|zscore)/.test(lowerName);
  const isCap = /(cap|max|ceiling|timeout|hold|rebalance)/.test(lowerName);
  if (isThreshold) return snapToStep(range.max, range);
  if (isCap) return snapToStep(range.min, range);
  return snapToStep((range.max + midpoint(range)) / 2, range);
}

function exploratoryValue(range, name) {
  if (!range) return 0;
  const lowerName = String(name || '').toLowerCase();
  const isThreshold = /(threshold|trigger|cutoff|min|floor|sigma|zscore)/.test(lowerName);
  const isCap = /(cap|max|ceiling|timeout|hold|rebalance)/.test(lowerName);
  if (isThreshold) return snapToStep(range.min, range);
  if (isCap) return snapToStep(range.max, range);
  return snapToStep((range.min + midpoint(range)) / 2, range);
}

function regimeAwareValue(range, name, regime, seed) {
  if (!range) return 0;
  const bias = (seed % 1000) / 999;
  const lowerName = String(name || '').toLowerCase();
  const lowRegime = String(regime || '').toLowerCase();
  const highVol = lowRegime.includes('vol') || lowRegime.includes('risk');
  const thresholdParam = /(threshold|trigger|cutoff|min|floor|sigma|zscore)/.test(lowerName);

  if (highVol && thresholdParam) {
    return snapToStep(range.max - (range.max - range.min) * bias * 0.4, range);
  }
  if (highVol && /(cap|max|ceiling|size|leverage)/.test(lowerName)) {
    return snapToStep(range.min + (range.max - range.min) * bias * 0.3, range);
  }

  return snapToStep(range.min + (range.max - range.min) * bias, range);
}

function buildParameterSet(template, mode, regime, seed) {
  const ranges = template.parameter_ranges || {};
  const set = {};

  for (const [name, rawRange] of Object.entries(ranges)) {
    const range = numericRange(rawRange);
    if (!range) continue;

    if (mode === 'base') {
      set[name] = midpoint(range);
      continue;
    }
    if (mode === 'conservative') {
      set[name] = conservativeValue(range, name);
      continue;
    }
    if (mode === 'exploratory') {
      set[name] = exploratoryValue(range, name);
      continue;
    }
    set[name] = regimeAwareValue(range, name, regime, seed + deterministicHash(name));
  }

  return set;
}

function summarizeParameterBias(template, parameterSet) {
  const ranges = template.parameter_ranges || {};
  let score = 0;
  let count = 0;

  for (const [name, value] of Object.entries(parameterSet || {})) {
    const range = numericRange(ranges[name]);
    if (!range) continue;
    const ratio =
      range.max === range.min ? 0.5 : (Number(value) - range.min) / (range.max - range.min);
    score += clamp(ratio, 0, 1);
    count += 1;
  }

  return {
    normalized_parameter_bias: count ? round(score / count, 4) : 0.5,
    parameter_count: count,
  };
}

function qualityPrior({ hypothesis, template, overlapFeatures, regimeIntersection, context }) {
  const featureCoverage = template.compatible_features?.length
    ? overlapFeatures.length / template.compatible_features.length
    : 0;
  const regimeFit = regimeIntersection.length ? 1 : 0.42;
  const priority = Number(hypothesis.discovery_priority_score || 0.5);
  const starvationBoost = context.starvation ? 0.06 : 0;
  return round(
    clamp(priority * 0.5 + featureCoverage * 0.25 + regimeFit * 0.19 + starvationBoost, 0, 1),
    4,
  );
}

function buildCandidateId(hypothesisId, templateId, parameterSet) {
  const hash = deterministicHash(`${hypothesisId}|${templateId}|${JSON.stringify(parameterSet)}`);
  return `CAND-${String(hash).padStart(10, '0').slice(-10)}`;
}

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
      max: Number.isFinite(raw.max) ? raw.max : Number.POSITIVE_INFINITY,
    };
  }
  const key = String(raw).toLowerCase().trim();
  if (key === 'short') return { min: 0, max: 3 };
  if (key === 'swing' || key === 'medium') return { min: 2, max: 10 };
  if (key === 'long') return { min: 8, max: Number.POSITIVE_INFINITY };
  const parsed = parseHorizonRange(key);
  return { min: Math.max(0, parsed.avg - 1), max: parsed.avg + 1 };
}

function normalizeGenerationConfig(config = {}) {
  const constraints = config.constraints || config;
  return {
    max_candidates: Number(config.discovery_batch_size || config.max_candidates || 64),
    max_hypotheses: Number(config.max_hypotheses || 8),
    max_templates_per_hypothesis: Number(config.max_templates_per_hypothesis || 5),
    min_feature_overlap: Number(config.min_feature_overlap || 1),
    market: normalizeConstraintList(constraints.market || constraints.markets).map((item) =>
      String(item).toUpperCase(),
    ),
    asset_classes: normalizeConstraintList(
      constraints.asset_class || constraints.asset_classes,
    ).map((item) => String(item).toUpperCase()),
    regimes: normalizeConstraintList(constraints.regime || constraints.regimes).map((item) =>
      String(item).toLowerCase(),
    ),
    families: normalizeConstraintList(constraints.family || constraints.families).map(
      canonicalStrategyFamily,
    ),
    trade_horizon: parseHorizonConstraint(constraints.trade_horizon || constraints.horizon),
    risk_profile: String(constraints.risk_profile || constraints.riskProfile || '')
      .toLowerCase()
      .trim(),
  };
}

function supportsMarket(assetClasses = [], markets = []) {
  if (!markets.length) return true;
  const set = new Set((assetClasses || []).map((item) => String(item).toUpperCase()));
  if (markets.some((item) => ['US', 'US_STOCK', 'EQUITY'].includes(item)) && !set.has('US_STOCK'))
    return false;
  if (markets.some((item) => ['CRYPTO'].includes(item)) && !set.has('CRYPTO')) return false;
  return true;
}

function supportsAssetClass(assetClasses = [], expected = []) {
  if (!expected.length) return true;
  const set = new Set((assetClasses || []).map((item) => String(item).toUpperCase()));
  return expected.every((item) => set.has(item));
}

function supportsRegime(regimes = [], expected = []) {
  if (!expected.length) return true;
  const set = new Set((regimes || []).map((item) => String(item).toLowerCase()));
  return expected.some((item) => set.has(item));
}

function supportsFamily(family, expected = []) {
  if (!expected.length) return true;
  return expected.includes(canonicalStrategyFamily(family));
}

function supportsHorizon(horizon, expected = null) {
  if (!expected) return true;
  const avg = parseHorizonRange(horizon).avg;
  return avg >= expected.min && avg <= expected.max;
}

function supportsRiskProfile(template, riskProfile = '') {
  if (!riskProfile) return true;
  const profile = riskProfile.toLowerCase();
  const family = String(template.strategy_family || '').toLowerCase();
  const risk = String(template.risk_profile || '').toLowerCase();

  if (profile === 'conservative') {
    return !(
      family.includes('crypto-native') ||
      risk.includes('fast') ||
      risk.includes('experimental') ||
      risk.includes('exhaustion')
    );
  }
  if (profile === 'balanced') {
    return !risk.includes('experimental');
  }
  return true;
}

function templateHintMatch(hypothesis = {}, template = {}) {
  const hints = (hypothesis.candidate_template_hints || [])
    .map(normalizeTemplateHint)
    .filter(Boolean);
  if (!hints.length) return { pass: true, applied: false };

  const aliases = []
    .concat(template.template_key_aliases || [])
    .concat([template.template_id, template.template_name, template.strategy_family])
    .map(normalizeTemplateHint)
    .filter(Boolean);

  return {
    pass: hints.some((hint) => aliases.includes(hint)),
    applied: true,
  };
}

function initRejectionCounter() {
  return {
    family_mismatch: 0,
    market_mismatch: 0,
    asset_mismatch: 0,
    regime_mismatch: 0,
    risk_profile_mismatch: 0,
    horizon_mismatch: 0,
    template_hint_mismatch: 0,
    feature_mismatch: 0,
    capacity_limit: 0,
  };
}

function templateUsageRows(candidates = []) {
  const map = new Map();
  for (const row of candidates || []) {
    const key = row.template_id;
    map.set(key, {
      template_id: key,
      template_name: row.template_name,
      strategy_family: row.strategy_family,
      count: (map.get(key)?.count || 0) + 1,
    });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function hypothesisUsageRows(candidates = []) {
  const map = new Map();
  for (const row of candidates || []) {
    const key = row.hypothesis_id;
    map.set(key, {
      hypothesis_id: key,
      count: (map.get(key)?.count || 0) + 1,
    });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function buildCandidateGenerator({
  asOf = new Date().toISOString(),
  hypothesisRegistry = {},
  templateRegistry = {},
  seedRuntime = {},
  context = {},
  config = {},
} = {}) {
  const hypotheses = hypothesisRegistry?.hypotheses || [];
  const templates = templateRegistry?.templates || [];
  const normalizedConfig = normalizeGenerationConfig(config);
  const modes =
    normalizedConfig.risk_profile === 'conservative'
      ? ['base', 'conservative', 'regime_tuned']
      : ['base', 'conservative', 'exploratory', 'regime_tuned'];

  const selectedHypotheses = [...hypotheses]
    .sort(
      (a, b) => Number(b.discovery_priority_score || 0) - Number(a.discovery_priority_score || 0),
    )
    .slice(0, normalizedConfig.max_hypotheses);

  const generated = [];
  const counters = initRejectionCounter();
  const perHypothesis = [];
  const mappingFailures = [];

  for (const hypothesis of selectedHypotheses) {
    const hypothesisFamilies = (hypothesis.candidate_strategy_families || []).map(
      canonicalStrategyFamily,
    );
    let localCount = 0;
    let matchedTemplateCount = 0;
    let attemptedTemplateCount = 0;
    const matchedTemplateIds = [];
    const rejectedTemplateCounts = initRejectionCounter();

    for (const template of templates) {
      attemptedTemplateCount += 1;

      const familyMatch = hypothesisFamilies.includes(
        canonicalStrategyFamily(template.strategy_family),
      );
      if (!familyMatch) {
        counters.family_mismatch += 1;
        rejectedTemplateCounts.family_mismatch += 1;
        continue;
      }

      const assetIntersection = intersect(
        hypothesis.relevant_asset_classes,
        template.compatible_asset_classes,
      );
      if (!assetIntersection.length) {
        counters.asset_mismatch += 1;
        rejectedTemplateCounts.asset_mismatch += 1;
        continue;
      }

      const regimeIntersection = intersect(
        hypothesis.relevant_regimes,
        template.compatible_regimes,
      );
      const featureOverlap = intersect(
        hypothesis.supporting_features,
        template.compatible_features,
      );
      const hintMatch = templateHintMatch(hypothesis, template);

      if (!supportsMarket(assetIntersection, normalizedConfig.market)) {
        counters.market_mismatch += 1;
        rejectedTemplateCounts.market_mismatch += 1;
        continue;
      }
      if (!supportsAssetClass(assetIntersection, normalizedConfig.asset_classes)) {
        counters.asset_mismatch += 1;
        rejectedTemplateCounts.asset_mismatch += 1;
        continue;
      }
      if (
        !supportsRegime(
          regimeIntersection.length ? regimeIntersection : template.compatible_regimes,
          normalizedConfig.regimes,
        )
      ) {
        counters.regime_mismatch += 1;
        rejectedTemplateCounts.regime_mismatch += 1;
        continue;
      }
      if (!supportsFamily(template.strategy_family, normalizedConfig.families)) {
        counters.family_mismatch += 1;
        rejectedTemplateCounts.family_mismatch += 1;
        continue;
      }
      if (!supportsHorizon(hypothesis.expected_holding_horizon, normalizedConfig.trade_horizon)) {
        counters.horizon_mismatch += 1;
        rejectedTemplateCounts.horizon_mismatch += 1;
        continue;
      }
      if (!supportsRiskProfile(template, normalizedConfig.risk_profile)) {
        counters.risk_profile_mismatch += 1;
        rejectedTemplateCounts.risk_profile_mismatch += 1;
        continue;
      }
      if (hintMatch.applied && !hintMatch.pass) {
        counters.template_hint_mismatch += 1;
        rejectedTemplateCounts.template_hint_mismatch += 1;
        continue;
      }
      if (featureOverlap.length < normalizedConfig.min_feature_overlap) {
        counters.feature_mismatch += 1;
        rejectedTemplateCounts.feature_mismatch += 1;
        continue;
      }

      matchedTemplateCount += 1;
      matchedTemplateIds.push(template.template_id);
      if (matchedTemplateCount > normalizedConfig.max_templates_per_hypothesis) continue;

      for (const mode of modes) {
        if (generated.length >= normalizedConfig.max_candidates) {
          counters.capacity_limit += 1;
          rejectedTemplateCounts.capacity_limit += 1;
          break;
        }

        const seed = deterministicHash(
          `${hypothesis.hypothesis_id}|${template.template_id}|${mode}|${asOf}`,
        );
        const parameterSet = buildParameterSet(template, mode, context.currentRegime, seed);
        const candidateId = buildCandidateId(
          hypothesis.hypothesis_id,
          template.template_id,
          parameterSet,
        );
        const biasSummary = summarizeParameterBias(template, parameterSet);
        const featureAlignment = summarizeFeatureAlignment({
          requiredFeatures: [
            ...new Set([
              ...(hypothesis.supporting_features || []),
              ...(template.compatible_features || []),
            ]),
          ],
          featureCatalog: seedRuntime?.feature_catalog || {},
        });

        generated.push({
          candidate_id: candidateId,
          strategy_id: `SD-${template.template_id}-${String(candidateId).slice(-4)}`,
          lifecycle_stage: 'DRAFT',
          hypothesis_id: hypothesis.hypothesis_id,
          hypothesis_description: hypothesis.description,
          hypothesis_economic_intuition: hypothesis.economic_intuition,
          template_id: template.template_id,
          template_name: template.template_name,
          strategy_family: template.strategy_family,
          supported_asset_classes: assetIntersection,
          compatible_regimes: regimeIntersection.length
            ? regimeIntersection
            : template.compatible_regimes,
          expected_holding_horizon:
            hypothesis.expected_holding_horizon || template.expected_holding_horizon || '1-5 bars',
          supporting_features: featureOverlap,
          required_features: featureAlignment.required_features,
          required_feature_groups: featureAlignment.required_feature_groups,
          parameter_set: parameterSet,
          parameter_space_reference: template.parameter_ranges,
          generation_mode: mode,
          cost_sensitivity_assumption: template.position_sizing_logic,
          risk_profile: template.risk_logic,
          quality_prior_score: qualityPrior({
            hypothesis,
            template,
            overlapFeatures: featureOverlap,
            regimeIntersection,
            context,
          }),
          candidate_source_metadata: {
            source_type: 'seed_driven_runtime',
            runtime_version: seedRuntime?.runtime_version || 'unknown',
            hypothesis_seed_id: seedRuntime?.hypothesis_seed?.seed_id || null,
            template_seed_id: seedRuntime?.template_seed?.seed_id || null,
            feature_catalog_seed_id: seedRuntime?.feature_catalog_seed?.seed_id || null,
            doctrine_version: seedRuntime?.research_doctrine_seed?.version || null,
            governance_checklist_version: seedRuntime?.governance_checklist_seed?.version || null,
            hypothesis_source: hypothesis.source_metadata || null,
            template_source: template.source_metadata || null,
            feature_alignment: featureAlignment,
            generation_constraints: {
              market: normalizedConfig.market,
              asset_classes: normalizedConfig.asset_classes,
              regimes: normalizedConfig.regimes,
              families: normalizedConfig.families,
              trade_horizon: normalizedConfig.trade_horizon,
              risk_profile: normalizedConfig.risk_profile,
            },
            mapping_quality: {
              feature_overlap_count: featureOverlap.length,
              regime_overlap_count: regimeIntersection.length,
              template_hint_applied: hintMatch.applied,
            },
          },
          traceability: {
            generated_at: asOf,
            generated_by: 'strategy-discovery-engine.v2',
            hypothesis_origin: hypothesis.hypothesis_id,
            template_origin: template.template_id,
            parameter_bias: biasSummary,
          },
        });
        localCount += 1;
      }
    }

    if (matchedTemplateCount === 0) {
      mappingFailures.push({
        hypothesis_id: hypothesis.hypothesis_id,
        reason: 'no_template_match_after_constraints',
        rejected_template_counts: rejectedTemplateCounts,
      });
    }

    perHypothesis.push({
      hypothesis_id: hypothesis.hypothesis_id,
      discovery_priority_score: hypothesis.discovery_priority_score,
      attempted_templates: attemptedTemplateCount,
      matched_templates: matchedTemplateCount,
      mapped_template_ids: matchedTemplateIds.slice(0, 8),
      generated_candidates: localCount,
      rejected_template_counts: rejectedTemplateCounts,
    });
  }

  const hypothesisUsage = hypothesisUsageRows(generated);
  const templateUsage = templateUsageRows(generated);
  const usedHypothesisSet = new Set(hypothesisUsage.map((item) => item.hypothesis_id));
  const usedTemplateSet = new Set(templateUsage.map((item) => item.template_id));
  const allHypothesisIds = selectedHypotheses.map((item) => item.hypothesis_id);
  const allTemplateIds = templates.map((item) => item.template_id);
  const hypothesesWithoutCandidates = allHypothesisIds.filter((id) => !usedHypothesisSet.has(id));
  const templatesUnused = allTemplateIds.filter((id) => !usedTemplateSet.has(id));

  return {
    generated_at: asOf,
    generator_version: 'discovery-candidate-generator.v2',
    config: {
      max_candidates: normalizedConfig.max_candidates,
      max_hypotheses: normalizedConfig.max_hypotheses,
      max_templates_per_hypothesis: normalizedConfig.max_templates_per_hypothesis,
      min_feature_overlap: normalizedConfig.min_feature_overlap,
      discovery_constraints: {
        market: normalizedConfig.market,
        asset_classes: normalizedConfig.asset_classes,
        regimes: normalizedConfig.regimes,
        families: normalizedConfig.families,
        trade_horizon: normalizedConfig.trade_horizon,
        risk_profile: normalizedConfig.risk_profile,
      },
    },
    selected_hypotheses: selectedHypotheses.map((item) => ({
      hypothesis_id: item.hypothesis_id,
      description: item.description,
      discovery_priority_score: item.discovery_priority_score,
    })),
    candidates: generated,
    summary: {
      total_candidates: generated.length,
      candidates_per_hypothesis: perHypothesis,
      rejection_counters: counters,
      runtime_seed_diagnostics: {
        hypotheses_producing_candidates: hypothesisUsage,
        templates_used_most: templateUsage.slice(0, 12),
        hypotheses_without_candidates: hypothesesWithoutCandidates,
        templates_unused: templatesUnused,
        mapping_failures: mappingFailures,
        seeds_unused_count: hypothesesWithoutCandidates.length + templatesUnused.length,
      },
      guided_generation_note:
        'Candidates are generated from seed-driven hypothesis-template-feature alignment with bounded parameter modes and explicit runtime constraints.',
    },
  };
}

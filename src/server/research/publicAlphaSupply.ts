import { RUNTIME_STATUS } from '../runtimeStatus.js';
import type { AssetClass, Market } from '../types.js';
import {
  canonicalStrategyFamily,
  loadDiscoverySeedRuntime,
} from '../../research/discovery/seedRuntime.js';
import { assessFeatureSet } from '../../research/discovery/runtimeFeatureSupport.js';

type PublicAlphaSupplyArgs = {
  market?: Market;
  assetClass?: AssetClass;
};

type SeedRow = {
  hypothesis_id?: string;
  template_id?: string;
  description?: string;
  title?: string;
  template_name?: string;
  strategy_family?: string;
  candidate_strategy_families?: string[];
  relevant_asset_classes?: string[];
  compatible_asset_classes?: string[];
  relevant_regimes?: string[];
  compatible_regimes?: string[];
  expected_holding_horizon?: string;
  supporting_features?: string[];
  compatible_features?: string[];
  source_metadata?: {
    seed_id?: string;
    public_reference_ids?: string[];
  };
};

type PublicAlphaSupplyRow = {
  supply_id: string;
  source: string;
  hypothesis_id: string | null;
  hypothesis_title: string | null;
  template_id: string | null;
  template_name: string | null;
  strategy_family: string;
  supported_asset_classes: string[];
  compatible_regimes: string[];
  expected_holding_horizon: string;
  supporting_features: string[];
  readiness: string;
  deployment_stage: string;
  measured_features: string[];
  adapter_pending_features: string[];
  blocking_features: string[];
  readiness_summary: {
    total_features: number;
    measured_count: number;
    adapter_ready_count: number;
    blocked_count: number;
    measured_ratio: number;
    ready_ratio: number;
  };
  public_reference_ids: string[];
};

function intersect(a: string[] = [], b: string[] = []) {
  const set = new Set((b || []).map((item) => String(item).toUpperCase()));
  return (a || []).filter((item) => set.has(String(item).toUpperCase()));
}

function intersectLower(a: string[] = [], b: string[] = []) {
  const set = new Set((b || []).map((item) => String(item).toLowerCase()));
  return (a || []).filter((item) => set.has(String(item).toLowerCase()));
}

function isPublicSeed(row: SeedRow) {
  return String(row.source_metadata?.seed_id || '').startsWith('public_');
}

function supportsScope(assetClasses: string[] = [], args: PublicAlphaSupplyArgs) {
  const classes = new Set((assetClasses || []).map((item) => String(item).toUpperCase()));
  if (args.market === 'US' && !classes.has('US_STOCK')) return false;
  if (args.market === 'CRYPTO' && !classes.has('CRYPTO')) return false;
  if (args.assetClass && !classes.has(String(args.assetClass).toUpperCase())) return false;
  return true;
}

function readinessRank(readiness: string) {
  if (readiness === 'measured') return 0;
  if (readiness === 'adapter_ready') return 1;
  return 2;
}

function deploymentStage(readiness: string) {
  if (readiness === 'measured') return 'ready_now';
  if (readiness === 'adapter_ready') return 'adapter_quick_win';
  return 'blocked_missing_data';
}

export function buildPublicAlphaSupplyReport(args: PublicAlphaSupplyArgs = {}) {
  const runtime = loadDiscoverySeedRuntime();
  const publicHypotheses = (runtime.hypotheses || [])
    .filter((row: SeedRow) => isPublicSeed(row))
    .filter((row: SeedRow) => supportsScope(row.relevant_asset_classes || [], args));
  const publicTemplates = (runtime.templates || [])
    .filter((row: SeedRow) => isPublicSeed(row))
    .filter((row: SeedRow) => supportsScope(row.compatible_asset_classes || [], args));

  const rows: PublicAlphaSupplyRow[] = publicHypotheses.flatMap((hypothesis: SeedRow) => {
    const hypothesisFamilies =
      hypothesis.candidate_strategy_families || hypothesis.strategy_family || [];
    const familyList = Array.isArray(hypothesisFamilies)
      ? hypothesisFamilies
      : [hypothesisFamilies].filter(Boolean);

    return publicTemplates
      .filter((template: SeedRow) =>
        familyList
          .map((item) => canonicalStrategyFamily(item))
          .includes(canonicalStrategyFamily(template.strategy_family || '')),
      )
      .map((template: SeedRow) => {
        const assetIntersection = intersect(
          hypothesis.relevant_asset_classes || [],
          template.compatible_asset_classes || [],
        );
        if (!assetIntersection.length) return null;

        const featureOverlap = intersectLower(
          hypothesis.supporting_features || [],
          template.compatible_features || [],
        );
        if (!featureOverlap.length) return null;

        const support = assessFeatureSet(
          [
            ...new Set([
              ...(hypothesis.supporting_features || []),
              ...(template.compatible_features || []),
            ]),
          ],
          assetIntersection,
        );

        return {
          supply_id: `${hypothesis.hypothesis_id || 'hyp'}::${template.template_id || 'tpl'}`,
          source: 'public_research_seed_runtime',
          hypothesis_id: hypothesis.hypothesis_id || null,
          hypothesis_title: hypothesis.title || hypothesis.description || null,
          template_id: template.template_id || null,
          template_name: template.template_name || null,
          strategy_family: canonicalStrategyFamily(template.strategy_family || ''),
          supported_asset_classes: assetIntersection,
          compatible_regimes: intersectLower(
            hypothesis.relevant_regimes || [],
            template.compatible_regimes || [],
          ),
          expected_holding_horizon:
            hypothesis.expected_holding_horizon || template.expected_holding_horizon || '1-5 bars',
          supporting_features: featureOverlap,
          readiness: support.readiness,
          deployment_stage: deploymentStage(support.readiness),
          measured_features: support.measured_features,
          adapter_pending_features: support.adapter_pending_features,
          blocking_features: support.blocking_features,
          readiness_summary: support.summary,
          public_reference_ids: [
            ...new Set([
              ...((hypothesis.source_metadata?.public_reference_ids || []) as string[]),
              ...((template.source_metadata?.public_reference_ids || []) as string[]),
            ]),
          ],
        };
      })
      .filter((row: PublicAlphaSupplyRow | null): row is PublicAlphaSupplyRow => Boolean(row));
  });

  const sortedRows = rows.sort((a, b) => {
    const stage = readinessRank(a.readiness) - readinessRank(b.readiness);
    if (stage !== 0) return stage;
    return b.readiness_summary.ready_ratio - a.readiness_summary.ready_ratio;
  });

  const readyNow = sortedRows.filter((row) => row.deployment_stage === 'ready_now');
  const quickWins = sortedRows.filter((row) => row.deployment_stage === 'adapter_quick_win');
  const blocked = sortedRows.filter((row) => row.deployment_stage === 'blocked_missing_data');

  return {
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: RUNTIME_STATUS.MODEL_DERIVED,
    supply: {
      generated_at: new Date().toISOString(),
      runtime_version: runtime.runtime_version,
      scope: {
        market: args.market || null,
        assetClass: args.assetClass || null,
      },
      summary: {
        public_hypothesis_count: publicHypotheses.length,
        public_template_count: publicTemplates.length,
        matched_supply_rows: sortedRows.length,
        ready_now: readyNow.length,
        adapter_quick_win: quickWins.length,
        blocked_missing_data: blocked.length,
      },
      rows: sortedRows,
      notes: [
        'ready_now means the public idea maps cleanly onto currently measured runtime features.',
        'adapter_quick_win means the data is already close enough that a thin adapter can unlock the strategy.',
        'blocked_missing_data means the current runtime still lacks a required data class or persisted artifact.',
      ],
    },
  };
}

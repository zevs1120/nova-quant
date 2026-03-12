import { round } from '../../engines/math.js';

function groupCount(rows = [], keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function byHypothesis(candidates = [], scored = []) {
  const scoreById = new Map((scored || []).map((row) => [row.candidate_id, row]));
  const bucket = new Map();

  for (const candidate of candidates || []) {
    const key = candidate.hypothesis_id || 'unknown';
    const current = bucket.get(key) || {
      hypothesis_id: key,
      generated: 0,
      pass_to_scoring: 0,
      promoted_to_shadow: 0,
      rejected: 0,
      avg_quality_score: 0,
      _qualitySum: 0
    };

    const score = scoreById.get(candidate.candidate_id);
    current.generated += 1;

    if (!score) {
      current.rejected += 1;
    } else if (score.final_status === 'pass_to_scoring') {
      current.pass_to_scoring += 1;
      current._qualitySum += Number(score.candidate_quality_score || 0);
      if (score.recommendation === 'PROMOTE_TO_SHADOW') {
        current.promoted_to_shadow += 1;
      }
    } else {
      current.rejected += 1;
    }

    bucket.set(key, current);
  }

  return Array.from(bucket.values())
    .map((row) => ({
      hypothesis_id: row.hypothesis_id,
      generated: row.generated,
      pass_to_scoring: row.pass_to_scoring,
      promoted_to_shadow: row.promoted_to_shadow,
      rejected: row.rejected,
      success_rate: row.generated ? round(row.promoted_to_shadow / row.generated, 4) : 0,
      avg_quality_score: row.pass_to_scoring ? round(row._qualitySum / row.pass_to_scoring, 4) : 0
    }))
    .sort((a, b) => b.success_rate - a.success_rate);
}

function byRegime(candidates = [], promotedIds = new Set()) {
  const bucket = new Map();

  for (const candidate of candidates || []) {
    for (const regime of candidate.compatible_regimes || ['unknown']) {
      const key = String(regime || 'unknown');
      const row = bucket.get(key) || {
        regime: key,
        generated: 0,
        promoted: 0
      };
      row.generated += 1;
      if (promotedIds.has(candidate.candidate_id)) row.promoted += 1;
      bucket.set(key, row);
    }
  }

  return Array.from(bucket.values())
    .map((row) => ({
      ...row,
      success_rate: row.generated ? round(row.promoted / row.generated, 4) : 0
    }))
    .sort((a, b) => b.generated - a.generated);
}

function byAssetClass(candidates = [], promotedIds = new Set()) {
  const bucket = new Map();

  for (const candidate of candidates || []) {
    for (const asset of candidate.supported_asset_classes || ['unknown']) {
      const key = String(asset || 'unknown');
      const row = bucket.get(key) || {
        asset_class: key,
        generated: 0,
        promoted: 0
      };
      row.generated += 1;
      if (promotedIds.has(candidate.candidate_id)) row.promoted += 1;
      bucket.set(key, row);
    }
  }

  return Array.from(bucket.values())
    .map((row) => ({
      ...row,
      success_rate: row.generated ? round(row.promoted / row.generated, 4) : 0
    }))
    .sort((a, b) => b.generated - a.generated);
}

function topFailureReasons(scored = []) {
  const rejected = (scored || []).filter((row) => row.recommendation === 'REJECT');
  const reasons = rejected.flatMap((row) => row.rejection_reasons || []);
  return groupCount(reasons, (reason) => String(reason || 'unknown'))
    .map((row) => ({ reason: row.key, count: row.count }))
    .slice(0, 10);
}

function recurringFamilyFailures(candidates = [], scored = []) {
  const candidateById = new Map((candidates || []).map((row) => [row.candidate_id, row]));
  const fails = (scored || []).filter((row) => row.recommendation === 'REJECT');

  const map = new Map();
  for (const row of fails) {
    const candidate = candidateById.get(row.candidate_id);
    const family = candidate?.strategy_family || 'unknown';
    const current = map.get(family) || {
      strategy_family: family,
      failed_count: 0,
      promoted_count: 0,
      top_reasons: []
    };
    current.failed_count += 1;
    current.top_reasons.push(...(row.rejection_reasons || []).slice(0, 2));
    map.set(family, current);
  }

  const promoted = (scored || []).filter((row) => row.recommendation === 'PROMOTE_TO_SHADOW');
  for (const row of promoted) {
    const candidate = candidateById.get(row.candidate_id);
    const family = candidate?.strategy_family || 'unknown';
    const current = map.get(family) || {
      strategy_family: family,
      failed_count: 0,
      promoted_count: 0,
      top_reasons: []
    };
    current.promoted_count += 1;
    map.set(family, current);
  }

  return Array.from(map.values())
    .map((row) => ({
      strategy_family: row.strategy_family,
      failed_count: row.failed_count,
      promoted_count: row.promoted_count,
      fail_to_promote_ratio: row.promoted_count ? round(row.failed_count / row.promoted_count, 4) : row.failed_count,
      top_reasons: groupCount(row.top_reasons, (item) => item)
        .map((item) => item.key)
        .slice(0, 3)
    }))
    .sort((a, b) => b.failed_count - a.failed_count)
    .slice(0, 12);
}

function coverageGaps(byRegimeRows = [], byAssetRows = []) {
  const regimeGaps = (byRegimeRows || [])
    .filter((row) => row.generated >= 3 && row.promoted === 0)
    .map((row) => row.regime);
  const assetGaps = (byAssetRows || [])
    .filter((row) => row.generated >= 4 && row.promoted === 0)
    .map((row) => row.asset_class);

  return {
    regime_gaps: regimeGaps,
    asset_class_gaps: assetGaps
  };
}

export function buildDiscoveryDiagnostics({
  asOf = new Date().toISOString(),
  candidates = [],
  scoredCandidates = [],
  generationSummary = {}
} = {}) {
  const promotedRows = (scoredCandidates || []).filter((row) => row.recommendation === 'PROMOTE_TO_SHADOW');
  const promotedIds = new Set(promotedRows.map((row) => row.candidate_id));

  const hypothesisStats = byHypothesis(candidates, scoredCandidates);
  const regimeStats = byRegime(candidates, promotedIds);
  const assetStats = byAssetClass(candidates, promotedIds);

  const generated = (candidates || []).length;
  const promoted = promotedRows.length;

  return {
    generated_at: asOf,
    diagnostics_version: 'strategy-discovery-diagnostics.v2',
    summary: {
      total_generated: generated,
      total_promoted_to_shadow: promoted,
      total_rejected: (scoredCandidates || []).filter((row) => row.recommendation === 'REJECT').length,
      discovery_success_rate: generated ? round(promoted / generated, 4) : 0
    },
    by_hypothesis: hypothesisStats,
    by_regime: regimeStats,
    by_asset_class: assetStats,
    top_failure_reasons: topFailureReasons(scoredCandidates),
    recurring_family_failures: recurringFamilyFailures(candidates, scoredCandidates),
    coverage_gaps: coverageGaps(regimeStats, assetStats),
    seed_runtime_diagnostics: {
      hypotheses_producing_candidates: generationSummary?.runtime_seed_diagnostics?.hypotheses_producing_candidates || [],
      templates_used_most: generationSummary?.runtime_seed_diagnostics?.templates_used_most || [],
      hypotheses_without_candidates: generationSummary?.runtime_seed_diagnostics?.hypotheses_without_candidates || [],
      templates_unused: generationSummary?.runtime_seed_diagnostics?.templates_unused || [],
      mapping_failures: generationSummary?.runtime_seed_diagnostics?.mapping_failures || []
    },
    explainability: {
      key_questions: [
        'Which hypotheses produce robust strategies?',
        'Which families fail repeatedly?',
        'Which regimes and asset classes lack strategy coverage?',
        'Which seed hypotheses and templates remain unused or fail mapping?'
      ]
    }
  };
}

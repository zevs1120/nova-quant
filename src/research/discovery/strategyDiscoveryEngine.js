import { round } from '../../engines/math.js';
import { buildHypothesisRegistry } from './hypothesisRegistry.js';
import { buildTemplateRegistry } from './templateRegistry.js';
import { buildCandidateGenerator } from './candidateGenerator.js';
import { buildCandidateValidationPipeline } from './candidateValidation.js';
import { buildCandidateScoring } from './candidateScoring.js';
import { buildDiscoveryDiagnostics } from './discoveryDiagnostics.js';
import { loadDiscoverySeedRuntime } from './seedRuntime.js';

function decayingFamilies(strategyGovernance = {}) {
  return (strategyGovernance?.strategies || [])
    .filter((row) => row?.degradation_signals?.status === 'warning')
    .map((row) => row.family)
    .filter(Boolean);
}

function analyzeDiscoveryPressure({
  strategyGovernance = {},
  signalFunnel = {},
  regimeState = {},
} = {}) {
  const degraded = (strategyGovernance?.strategies || []).filter(
    (row) => row?.degradation_signals?.status === 'warning',
  );
  const generated = Number(signalFunnel?.overall?.generated || 0);
  const executable = Number(signalFunnel?.overall?.executable || 0);
  const starvation = generated <= 4 || (generated ? executable / generated <= 0.25 : true);

  return {
    current_regime: regimeState?.state?.primary || 'range',
    regime_posture: regimeState?.state?.recommended_user_posture || 'REDUCE',
    starvation_detected: starvation,
    executable_ratio: generated ? round(executable / generated, 4) : 0,
    degraded_strategy_count: degraded.length,
    decaying_families: decayingFamilies(strategyGovernance),
  };
}

function attachValidationAndScore(candidates = [], validation = {}, scoring = {}) {
  const valById = new Map((validation?.candidates || []).map((row) => [row.candidate_id, row]));
  const scoreById = new Map((scoring?.candidates || []).map((row) => [row.candidate_id, row]));

  return (candidates || []).map((candidate) => ({
    ...candidate,
    validation: valById.get(candidate.candidate_id) || null,
    scoring: scoreById.get(candidate.candidate_id) || null,
    traceability: {
      ...candidate.traceability,
      validation_metrics: valById.get(candidate.candidate_id)?.metrics || null,
      rejection_reasons: valById.get(candidate.candidate_id)?.rejection_reasons || [],
      promotion_decision: scoreById.get(candidate.candidate_id)?.recommendation || 'REJECT',
    },
  }));
}

function promotionDecisions(scoring = {}, asOf = new Date().toISOString()) {
  return (scoring?.ranking || []).map((row, idx) => ({
    discovery_decision_id: `discovery-${String(idx + 1).padStart(3, '0')}`,
    candidate_id: row.candidate_id,
    strategy_id: row.strategy_id,
    decision: row.recommendation,
    from_stage: 'DRAFT',
    to_stage: row.next_stage,
    rationale:
      row.recommendation === 'PROMOTE_TO_SHADOW'
        ? 'Candidate quality score and validation outcomes satisfy shadow promotion gate.'
        : row.recommendation === 'HOLD_FOR_RETEST'
          ? 'Candidate shows partial promise; keep in draft and rerun with refined thresholds.'
          : 'Candidate failed quality or robustness requirements; reject for this cycle.',
    metrics_summary: {
      candidate_quality_score: row.candidate_quality_score,
      performance_score: row.component_scores?.performance_score,
      robustness_score: row.component_scores?.robustness_score,
      regime_stability_score: row.component_scores?.regime_stability_score,
      diversification_score: row.component_scores?.diversification_score,
    },
    created_at: asOf,
    reviewer_source: 'system-generated',
  }));
}

function promotedCandidates(scoring = {}, candidates = []) {
  const ids = new Set(
    (scoring?.candidates || [])
      .filter((row) => row.recommendation === 'PROMOTE_TO_SHADOW')
      .map((row) => row.candidate_id),
  );

  return (candidates || [])
    .filter((candidate) => ids.has(candidate.candidate_id))
    .map((candidate) => ({
      candidate_id: candidate.candidate_id,
      strategy_id: candidate.strategy_id,
      hypothesis_id: candidate.hypothesis_id,
      template_id: candidate.template_id,
      next_stage: 'SHADOW',
      promotion_note: 'Promoted by discovery quality gate to SHADOW for controlled observation.',
    }));
}

export function buildStrategyDiscoveryEngine({
  asOf = new Date().toISOString(),
  research = {},
  regimeState = {},
  signalFunnel = {},
  strategyGovernance = {},
  walkForward = {},
  config = {},
} = {}) {
  const pressure = analyzeDiscoveryPressure({
    strategyGovernance,
    signalFunnel,
    regimeState,
  });
  const seedRuntime = loadDiscoverySeedRuntime({
    seedOverrides: config.seed_overrides || {},
  });
  const generationConfig = config.generation || {};
  const runtimeConstraints = generationConfig.constraints || generationConfig;

  const hypothesisRegistry = buildHypothesisRegistry({
    asOf,
    context: {
      currentRegime: pressure.current_regime,
      starvation: pressure.starvation_detected,
      decayingFamilies: pressure.decaying_families,
    },
    config: runtimeConstraints,
    seedRuntime,
  });

  const templateRegistry = buildTemplateRegistry({
    asOf,
    config: runtimeConstraints,
    seedRuntime,
  });

  const generated = buildCandidateGenerator({
    asOf,
    hypothesisRegistry,
    templateRegistry,
    seedRuntime,
    context: {
      currentRegime: pressure.current_regime,
      starvation: pressure.starvation_detected,
      walkforward_promotion_ready: walkForward?.summary?.promotion_ready || [],
    },
    config: generationConfig,
  });

  const validation = buildCandidateValidationPipeline({
    asOf,
    candidates: generated.candidates,
    context: {
      research,
      regimeState,
      signalFunnel,
      strategyGovernance,
      walkForward,
    },
    config: {
      ...(config.validation || {}),
      stage_2: {
        ...(config.validation?.stage_2 || {}),
        execution_realism_profile:
          config.validation?.stage_2?.execution_realism_profile ||
          walkForward?.config?.execution_realism_profile ||
          {},
      },
    },
  });

  const scoring = buildCandidateScoring({
    asOf,
    candidates: generated.candidates,
    validation,
  });

  const diagnostics = buildDiscoveryDiagnostics({
    asOf,
    candidates: generated.candidates,
    scoredCandidates: scoring.candidates,
    generationSummary: generated.summary,
  });

  const decisions = promotionDecisions(scoring, asOf);
  const promoted = promotedCandidates(scoring, generated.candidates);
  const enrichedCandidates = attachValidationAndScore(generated.candidates, validation, scoring);

  return {
    generated_at: asOf,
    engine_version: 'strategy-discovery-engine.v1',
    lifecycle: {
      stages: ['DRAFT', 'SHADOW', 'CANARY', 'PROD', 'RETIRED'],
      promotion_gate: 'Candidate Quality Score + stage validation gate',
      default_entry_stage: 'DRAFT',
    },
    discovery_loop: {
      cycle_steps: [
        'analyze_existing_production_strategies',
        'identify_performance_decay',
        'identify_signal_starvation',
        'select_hypotheses',
        'generate_candidates',
        'run_validation_pipeline',
        'rank_candidates',
        'promote_best_to_shadow',
        'update_discovery_logs',
      ],
      cycle_context: pressure,
    },
    hypothesis_registry: hypothesisRegistry,
    template_registry: templateRegistry,
    candidate_generation: generated,
    candidate_validation: validation,
    candidate_scoring: scoring,
    candidate_diagnostics: diagnostics,
    promotion_decisions: decisions,
    promoted_candidates: promoted,
    candidates: enrichedCandidates,
    seed_runtime: {
      runtime_version: seedRuntime.runtime_version,
      hypothesis_seed: seedRuntime.hypothesis_seed,
      template_seed: seedRuntime.template_seed,
      feature_catalog_seed: seedRuntime.feature_catalog_seed,
      research_doctrine_seed: seedRuntime.research_doctrine_seed,
      governance_checklist_seed: seedRuntime.governance_checklist_seed,
    },
    summary: {
      hypotheses_selected: generated.selected_hypotheses.length,
      generated_candidates: generated.summary.total_candidates,
      survivors_after_validation: validation.summary.survivors,
      promoted_to_shadow: promoted.length,
      discovery_success_rate: generated.summary.total_candidates
        ? round(promoted.length / generated.summary.total_candidates, 4)
        : 0,
      seed_runtime_usage: {
        hypotheses_with_candidates:
          generated.summary.runtime_seed_diagnostics?.hypotheses_producing_candidates?.length || 0,
        templates_used:
          generated.summary.runtime_seed_diagnostics?.templates_used_most?.length || 0,
        seeds_unused_count: generated.summary.runtime_seed_diagnostics?.seeds_unused_count || 0,
      },
      notes: [
        'Structured seed-driven hypothesis-template-feature generation is used instead of brute-force parameter search.',
        'Fragile candidates are rejected through staged validation and quality scoring.',
        'Promotion decisions include full traceability to hypothesis/template/parameters/validation outputs.',
      ],
    },
  };
}

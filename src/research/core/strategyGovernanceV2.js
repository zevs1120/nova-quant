import { mean, round } from '../../engines/math.js';

export const GOVERNANCE_LIFECYCLE = Object.freeze([
  'DRAFT',
  'SHADOW',
  'CANARY',
  'PROD',
  'RETIRED'
]);

const STAGE_ORDER = Object.freeze(
  GOVERNANCE_LIFECYCLE.reduce((acc, stage, idx) => {
    acc[stage] = idx;
    return acc;
  }, {})
);

const STAGE_WORKFLOW = Object.freeze({
  DRAFT: {
    explicit_requirements: [
      'hypothesis-template mapping exists',
      'minimum evidence completeness reached',
      'sanity/quick validation available',
      'clear invalidation conditions'
    ],
    evidence_thresholds: {
      min_evidence_completeness: 0.45,
      require_replay_context: false,
      require_execution_profile: true
    },
    validation_criteria: {
      min_signal_frequency: 3,
      min_oos_positive_ratio: 0,
      require_survive_costs: false,
      require_survive_harsh_execution: false,
      require_stable: false
    },
    monitoring_requirements: ['metadata completeness', 'weekly governance check'],
    promotion_conditions: ['all required checks pass', 'review approved'],
    demotion_conditions: ['n/a']
  },
  SHADOW: {
    explicit_requirements: [
      'walk-forward/OOS evidence present',
      'cost stress survives baseline threshold',
      'regime behavior documented',
      'evidence chain has no critical gap'
    ],
    evidence_thresholds: {
      min_evidence_completeness: 0.62,
      require_replay_context: true,
      require_execution_profile: true
    },
    validation_criteria: {
      min_signal_frequency: 5,
      min_oos_positive_ratio: 0.45,
      require_survive_costs: true,
      require_survive_harsh_execution: true,
      require_stable: true
    },
    monitoring_requirements: ['signal density', 'filter reasons', 'replay-vs-paper drift watch'],
    promotion_conditions: ['all required checks pass', 'review approved', 'no critical unresolved concerns'],
    demotion_conditions: ['persistent validation failure', 'critical evidence degradation']
  },
  CANARY: {
    explicit_requirements: [
      'stable behavior under constrained risk',
      'drawdown profile controlled',
      'risk-budget compliance maintained',
      'rollback readiness confirmed'
    ],
    evidence_thresholds: {
      min_evidence_completeness: 0.72,
      require_replay_context: true,
      require_execution_profile: true
    },
    validation_criteria: {
      min_signal_frequency: 8,
      min_oos_positive_ratio: 0.55,
      require_survive_costs: true,
      require_survive_harsh_execution: true,
      require_stable: true,
      min_operational_confidence: 0.62
    },
    monitoring_requirements: [
      'daily degradation check',
      'execution realism drift watch',
      'concentration and overlap monitor'
    ],
    promotion_conditions: ['all required checks pass', 'review approved', 'no unresolved critical concern'],
    demotion_conditions: ['degradation warning', 'confidence break', 'validation failure']
  },
  PROD: {
    explicit_requirements: [
      'full evidence chain complete',
      'validation current and passing',
      'review state approved',
      'no unresolved critical concern'
    ],
    evidence_thresholds: {
      min_evidence_completeness: 0.8,
      require_replay_context: true,
      require_execution_profile: true
    },
    validation_criteria: {
      min_signal_frequency: 8,
      min_oos_positive_ratio: 0.5,
      require_survive_costs: true,
      require_survive_harsh_execution: true,
      require_stable: true,
      min_operational_confidence: 0.55
    },
    monitoring_requirements: [
      'weekly review required',
      'degradation and slippage drift alerts',
      'risk-budget and concentration compliance'
    ],
    promotion_conditions: ['n/a'],
    demotion_conditions: ['degradation warning', 'critical execution realism breach', 'confidence < threshold']
  },
  RETIRED: {
    explicit_requirements: ['strategy archived with full rationale'],
    evidence_thresholds: {
      min_evidence_completeness: 0,
      require_replay_context: false,
      require_execution_profile: false
    },
    validation_criteria: {
      min_signal_frequency: 0,
      min_oos_positive_ratio: 0,
      require_survive_costs: false,
      require_survive_harsh_execution: false,
      require_stable: false
    },
    monitoring_requirements: ['postmortem reference only'],
    promotion_conditions: ['n/a'],
    demotion_conditions: ['n/a']
  }
});

const INSTITUTIONAL_REQUIREMENTS = Object.freeze({
  SHADOW: {
    min_evidence_completeness: 0.68,
    require_replay_backed: true,
    require_execution_profile: true,
    min_oos_positive_ratio: 0.48,
    require_survive_costs: true,
    require_survive_harsh_execution: true,
    require_strict_fill_monotonicity: true,
    require_stable: true,
    min_operational_confidence: 0.58,
    min_diversification_value: 0.03,
    max_critical_concerns: 1
  },
  CANARY: {
    min_evidence_completeness: 0.76,
    require_replay_backed: true,
    require_execution_profile: true,
    min_oos_positive_ratio: 0.55,
    require_survive_costs: true,
    require_survive_harsh_execution: true,
    require_strict_fill_monotonicity: true,
    require_stable: true,
    min_operational_confidence: 0.68,
    min_diversification_value: 0.06,
    max_critical_concerns: 0
  },
  PROD: {
    min_evidence_completeness: 0.84,
    require_replay_backed: true,
    require_execution_profile: true,
    min_oos_positive_ratio: 0.6,
    require_survive_costs: true,
    require_survive_harsh_execution: true,
    require_strict_fill_monotonicity: true,
    require_stable: true,
    min_operational_confidence: 0.74,
    min_diversification_value: 0.1,
    max_critical_concerns: 0
  }
});

function safe(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toLifecycleStage(stage) {
  const normalized = String(stage || '').toLowerCase();
  if (normalized === 'champion' || normalized === 'prod') return 'PROD';
  if (normalized === 'candidate' || normalized === 'paper' || normalized === 'canary' || normalized === 'degrade') return 'CANARY';
  if (normalized === 'testing' || normalized === 'challenger' || normalized === 'shadow') return 'SHADOW';
  if (normalized === 'retired' || normalized === 'retire') return 'RETIRED';
  return 'DRAFT';
}

function nextLifecycleStage(stage) {
  if (stage === 'DRAFT') return 'SHADOW';
  if (stage === 'SHADOW') return 'CANARY';
  if (stage === 'CANARY') return 'PROD';
  return stage;
}

function collectStrategyRows(research = {}) {
  const strategyRows = research?.registry_system?.strategy_registry || [];
  return strategyRows.map((row) => ({
    strategy_id: row.strategy_id,
    stage: toLifecycleStage(row.current_stage),
    source_stage: row.current_stage,
    execution_mode: row.execution_mode,
    change_log: row.change_log || [],
    notes: row.notes || []
  }));
}

function inferMetaByStrategy(signals = []) {
  const map = new Map();
  for (const signal of signals || []) {
    const key = String(signal.strategy_id || '');
    if (!key || map.has(key)) continue;
    map.set(key, {
      family: signal.strategy_family || 'unknown',
      template: signal.strategy_id || 'unknown'
    });
  }
  return map;
}

function signalFrequencyByStrategy(signals = []) {
  const bucket = new Map();
  for (const signal of signals || []) {
    const key = String(signal.strategy_id || 'unknown');
    bucket.set(key, (bucket.get(key) || 0) + 1);
  }
  return Object.fromEntries(bucket.entries());
}

function extractVersion(notes = []) {
  const hit = (notes || []).find((item) => String(item).startsWith('version='));
  return hit ? String(hit).split('=')[1] : 'v1';
}

function diversificationValue(strategyId, research = {}) {
  if (strategyId === 'champion') return 0;
  const hit = (research?.comparisons || []).find((item) => item.challenger_id === strategyId);
  return Number(hit?.metrics?.uniqueness_vs_champion || 0);
}

function walkforwardById(walkforward = {}) {
  return new Map((walkforward?.strategies || []).map((item) => [item.strategy_id, item]));
}

function evidenceSummaryFor({ strategyId, walkforwardRow, version, family, template }) {
  const fieldCoverage = {
    strategy_id_present: Boolean(strategyId),
    version_present: Boolean(version),
    family_present: Boolean(family),
    template_present: Boolean(template),
    walkforward_present: Boolean(walkforwardRow),
    replay_context_present: Boolean(walkforwardRow?.replay_context),
    replay_backed: Boolean(walkforwardRow?.replay_context?.replay_backed),
    execution_profile_present: Boolean(walkforwardRow?.execution_realism?.assumption_profile?.profile_id)
  };
  const covered = Object.values(fieldCoverage).filter(Boolean).length;
  const completeness = Object.keys(fieldCoverage).length
    ? round(covered / Object.keys(fieldCoverage).length, 4)
    : 0;
  return {
    completeness_score: completeness,
    status: completeness >= 0.8 ? 'complete' : completeness >= 0.6 ? 'partial' : 'weak',
    field_coverage: fieldCoverage
  };
}

function validationSummaryFor(walkforwardRow = {}) {
  if (!walkforwardRow || !Object.keys(walkforwardRow).length) {
    return {
      status: 'missing',
      survives_out_of_sample: false,
      survives_after_costs: false,
      survives_after_harsh_execution: false,
      strict_fill_monotonicity: false,
      stable: false,
      oos_positive_ratio: 0,
      avg_test_cumulative_return: 0
    };
  }
  const verdict = walkforwardRow?.verdict || {};
  const status =
    verdict.survives_out_of_sample &&
    verdict.survives_after_costs &&
    verdict.survives_after_harsh_execution &&
    verdict.stability === 'stable'
      ? 'pass'
      : verdict.survives_out_of_sample || verdict.survives_after_costs
        ? 'watch'
        : 'fail';

  return {
    status,
    survives_out_of_sample: Boolean(verdict.survives_out_of_sample),
    survives_after_costs: Boolean(verdict.survives_after_costs),
    survives_after_harsh_execution: Boolean(verdict.survives_after_harsh_execution),
    strict_fill_monotonicity: Boolean(verdict.strict_fill_monotonicity),
    stable: verdict.stability === 'stable',
    oos_positive_ratio: safe(walkforwardRow?.out_of_sample_summary?.positive_window_ratio, 0),
    avg_test_cumulative_return: safe(walkforwardRow?.out_of_sample_summary?.avg_test_cumulative_return, 0),
    execution_assumption_profile: walkforwardRow?.execution_realism?.assumption_profile || null
  };
}

function institutionalRequirementsFor(stage) {
  return INSTITUTIONAL_REQUIREMENTS[stage] || null;
}

function evaluateInstitutionalReadiness({
  targetStage,
  evidenceSummary,
  validationSummary,
  monitoringSummary,
  operationalConfidence,
  diversification
}) {
  const requirements = institutionalRequirementsFor(targetStage);
  if (!requirements) {
    return {
      target_stage: targetStage,
      requirements: null,
      score: 0,
      pass: false,
      blockers: ['institutional_requirements_not_defined'],
      strengths: []
    };
  }

  const checks = [
    {
      id: 'evidence_completeness',
      pass: safe(evidenceSummary?.completeness_score, 0) >= safe(requirements.min_evidence_completeness, 0)
    },
    {
      id: 'replay_backed',
      pass: !requirements.require_replay_backed || Boolean(evidenceSummary?.field_coverage?.replay_backed)
    },
    {
      id: 'execution_profile',
      pass: !requirements.require_execution_profile || Boolean(evidenceSummary?.field_coverage?.execution_profile_present)
    },
    {
      id: 'oos_positive_ratio',
      pass: safe(validationSummary?.oos_positive_ratio, 0) >= safe(requirements.min_oos_positive_ratio, 0)
    },
    {
      id: 'survive_costs',
      pass: !requirements.require_survive_costs || Boolean(validationSummary?.survives_after_costs)
    },
    {
      id: 'survive_harsh_execution',
      pass: !requirements.require_survive_harsh_execution || Boolean(validationSummary?.survives_after_harsh_execution)
    },
    {
      id: 'strict_fill_monotonicity',
      pass: !requirements.require_strict_fill_monotonicity || Boolean(validationSummary?.strict_fill_monotonicity)
    },
    {
      id: 'stable_validation',
      pass: !requirements.require_stable || Boolean(validationSummary?.stable)
    },
    {
      id: 'operational_confidence',
      pass: safe(operationalConfidence, 0) >= safe(requirements.min_operational_confidence, 0)
    },
    {
      id: 'diversification_value',
      pass: safe(diversification, 0) >= safe(requirements.min_diversification_value, 0)
    },
    {
      id: 'critical_concern_budget',
      pass: safe(monitoringSummary?.critical_count, 0) <= safe(requirements.max_critical_concerns, 0)
    }
  ];

  const passCount = checks.filter((row) => row.pass).length;
  const blockers = checks.filter((row) => !row.pass).map((row) => row.id);
  const strengths = checks.filter((row) => row.pass).map((row) => row.id);

  return {
    target_stage: targetStage,
    requirements,
    score: round(passCount / Math.max(checks.length, 1), 4),
    pass: blockers.length === 0,
    blockers,
    strengths
  };
}

function degradationSignals(walkforwardRow = {}, signalCount = 0) {
  const reasons = [];
  if (walkforwardRow?.degradation_tracking?.trend === 'degrading') reasons.push('return_degradation');
  if (!walkforwardRow?.verdict?.survives_after_costs) reasons.push('cost_fragility');
  if (!walkforwardRow?.verdict?.survives_after_harsh_execution) reasons.push('harsh_execution_fragility');
  if (!walkforwardRow?.verdict?.strict_fill_monotonicity) reasons.push('strict_fill_monotonicity_failure');
  if (walkforwardRow?.verdict?.regime_dependent) reasons.push('regime_dependency');
  if (signalCount <= 2) reasons.push('low_signal_density');

  return {
    status: reasons.length ? 'warning' : 'healthy',
    reasons
  };
}

function scoreOperationalConfidence({ validationSummary, evidenceSummary, diversification, degradation }) {
  const oos = validationSummary.survives_out_of_sample ? validationSummary.oos_positive_ratio : 0;
  const costs = validationSummary.survives_after_costs ? 1 : 0;
  const harsh = validationSummary.survives_after_harsh_execution ? 1 : 0;
  const stable = validationSummary.stable ? 1 : 0;
  const evidence = safe(evidenceSummary?.completeness_score, 0);
  const div = Math.max(0, Math.min(1, safe(diversification, 0)));
  const degradePenalty = degradation.status === 'warning' ? 0.14 : 0;
  const base = 0.2 * oos + 0.16 * costs + 0.14 * harsh + 0.18 * stable + 0.2 * evidence + 0.12 * div;
  return round(Math.max(0, Math.min(1, base - degradePenalty)), 4);
}

function stageCheckRows({
  stage,
  stageSpec,
  evidenceSummary,
  validationSummary,
  monitoringSummary,
  operationalConfidence,
  institutionalReadiness
}) {
  const checks = [];
  const thresholds = stageSpec?.evidence_thresholds || {};
  const validation = stageSpec?.validation_criteria || {};

  checks.push({
    check_id: 'evidence_completeness',
    category: 'evidence',
    required: true,
    threshold: thresholds.min_evidence_completeness,
    value: evidenceSummary.completeness_score,
    pass: evidenceSummary.completeness_score >= safe(thresholds.min_evidence_completeness, 0)
  });
  checks.push({
    check_id: 'replay_context',
    category: 'evidence',
    required: Boolean(thresholds.require_replay_context),
    threshold: true,
    value: evidenceSummary.field_coverage.replay_context_present,
    pass: !thresholds.require_replay_context || Boolean(evidenceSummary.field_coverage.replay_context_present)
  });
  checks.push({
    check_id: 'execution_profile',
    category: 'evidence',
    required: Boolean(thresholds.require_execution_profile),
    threshold: true,
    value: evidenceSummary.field_coverage.execution_profile_present,
    pass: !thresholds.require_execution_profile || Boolean(evidenceSummary.field_coverage.execution_profile_present)
  });
  checks.push({
    check_id: 'signal_frequency',
    category: 'validation',
    required: true,
    threshold: safe(validation.min_signal_frequency, 0),
    value: safe(monitoringSummary.signal_frequency, 0),
    pass: safe(monitoringSummary.signal_frequency, 0) >= safe(validation.min_signal_frequency, 0)
  });
  checks.push({
    check_id: 'oos_positive_ratio',
    category: 'validation',
    required: safe(validation.min_oos_positive_ratio, 0) > 0,
    threshold: safe(validation.min_oos_positive_ratio, 0),
    value: safe(validationSummary.oos_positive_ratio, 0),
    pass: safe(validationSummary.oos_positive_ratio, 0) >= safe(validation.min_oos_positive_ratio, 0)
  });
  checks.push({
    check_id: 'survive_costs',
    category: 'validation',
    required: Boolean(validation.require_survive_costs),
    threshold: true,
    value: validationSummary.survives_after_costs,
    pass: !validation.require_survive_costs || validationSummary.survives_after_costs
  });
  checks.push({
    check_id: 'survive_harsh_execution',
    category: 'validation',
    required: Boolean(validation.require_survive_harsh_execution),
    threshold: true,
    value: validationSummary.survives_after_harsh_execution,
    pass: !validation.require_survive_harsh_execution || validationSummary.survives_after_harsh_execution
  });
  checks.push({
    check_id: 'strict_fill_monotonicity',
    category: 'validation',
    required: stage === 'SHADOW' || stage === 'CANARY' || stage === 'PROD',
    threshold: true,
    value: validationSummary.strict_fill_monotonicity,
    pass: validationSummary.strict_fill_monotonicity
  });
  checks.push({
    check_id: 'stability',
    category: 'validation',
    required: Boolean(validation.require_stable),
    threshold: true,
    value: validationSummary.stable,
    pass: !validation.require_stable || validationSummary.stable
  });
  checks.push({
    check_id: 'operational_confidence',
    category: 'monitoring',
    required: safe(validation.min_operational_confidence, 0) > 0,
    threshold: safe(validation.min_operational_confidence, 0),
    value: operationalConfidence,
    pass: operationalConfidence >= safe(validation.min_operational_confidence, 0)
  });
  checks.push({
    check_id: 'critical_concern_gate',
    category: 'monitoring',
    required: stage === 'CANARY' || stage === 'PROD',
    threshold: 0,
    value: monitoringSummary.critical_count,
    pass: monitoringSummary.critical_count === 0
  });
  checks.push({
    check_id: `institutional_grade_ready_for_${String(institutionalReadiness?.target_stage || stage).toLowerCase()}`,
    category: 'institutional',
    required: stage === 'SHADOW' || stage === 'CANARY' || stage === 'PROD',
    threshold: true,
    value: institutionalReadiness?.score ?? 0,
    pass: Boolean(institutionalReadiness?.pass)
  });
  return checks;
}

function collectUnmetRequiredChecks(checks = []) {
  return (checks || [])
    .filter((row) => row.required && !row.pass)
    .map((row) => row.check_id);
}

function buildEvidenceLinks(strategyId, checks = []) {
  const links = [`strategy_governance.strategies.${strategyId}`];
  if (checks.some((row) => row.check_id === 'replay_context' && row.value)) {
    links.push(`walk_forward_validation.strategies.${strategyId}.replay_context`);
  }
  links.push(`walk_forward_validation.strategies.${strategyId}.execution_realism`);
  links.push(`walk_forward_validation.strategies.${strategyId}.out_of_sample_summary`);
  return [...new Set(links)];
}

function rollbackStandby(rows = []) {
  const canary = rows
    .filter((item) => item.current_stage === 'CANARY' && item.validation_summary.status !== 'fail')
    .sort((a, b) => b.operational_confidence - a.operational_confidence);
  return canary[0]?.strategy_id || null;
}

function decideAction({
  stage,
  requiredUnmet,
  monitoringSummary,
  validationSummary,
  operationalConfidence,
  institutionalReadiness,
  rollbackCandidate,
  strategyId
}) {
  const severe = monitoringSummary.critical_count >= 2 || operationalConfidence < 0.3;
  const retireRecommended = monitoringSummary.retire_recommended;
  const allRequiredPass = requiredUnmet.length === 0;
  const institutionalFail = !institutionalReadiness?.pass;
  const degradationReasons = monitoringSummary?.degradation_signals?.reasons || [];
  const executionCredibilityBreak =
    degradationReasons.includes('harsh_execution_fragility') ||
    degradationReasons.includes('strict_fill_monotonicity_failure');

  if (stage === 'RETIRED') {
    return { action: 'HOLD', to_stage: 'RETIRED', rationale: 'Strategy is retired and archived.' };
  }

  if (retireRecommended && stage !== 'DRAFT') {
    return {
      action: 'RETIRE',
      to_stage: 'RETIRED',
      rationale: 'Critical degradation and realism failure indicate retirement.'
    };
  }

  if (stage === 'PROD') {
    if (severe && rollbackCandidate && rollbackCandidate !== strategyId) {
      return {
        action: 'ROLLBACK',
        to_stage: 'CANARY',
        rationale: `Rollback triggered due to severe warning; standby canary=${rollbackCandidate}.`
      };
    }
    if (executionCredibilityBreak && rollbackCandidate && rollbackCandidate !== strategyId) {
      return {
        action: 'ROLLBACK',
        to_stage: 'CANARY',
        rationale: `Rollback due to execution realism credibility break; standby canary=${rollbackCandidate}.`
      };
    }
    if (institutionalFail) {
      return {
        action: 'DEMOTE',
        to_stage: 'CANARY',
        rationale: `Production strategy fails institutional readiness for PROD: ${(institutionalReadiness?.blockers || []).join(', ')}.`
      };
    }
    if (severe || monitoringSummary.warning_count > 0 || validationSummary.status === 'fail') {
      return {
        action: 'DEMOTE',
        to_stage: 'CANARY',
        rationale: 'Production criteria no longer satisfied; demote for constrained monitoring.'
      };
    }
    return { action: 'HOLD', to_stage: 'PROD', rationale: 'Production governance requirements remain satisfied.' };
  }

  if (stage === 'CANARY') {
    if (allRequiredPass) {
      return {
        action: 'PROMOTE',
        to_stage: 'PROD',
        rationale: 'Canary evidence and validation gates pass promotion thresholds.'
      };
    }
    if (severe || validationSummary.status === 'fail' || executionCredibilityBreak) {
      return {
        action: 'DEMOTE',
        to_stage: 'SHADOW',
        rationale: executionCredibilityBreak
          ? 'Canary fails execution realism credibility checks; demote to SHADOW.'
          : 'Canary fails required checks; demote to SHADOW for controlled retest.'
      };
    }
    return { action: 'HOLD', to_stage: 'CANARY', rationale: 'Canary remains in observation until required checks pass.' };
  }

  if (stage === 'SHADOW') {
    if (allRequiredPass) {
      return {
        action: 'PROMOTE',
        to_stage: 'CANARY',
        rationale: 'Shadow evidence, validation, and review gates pass.'
      };
    }
    if (executionCredibilityBreak || (severe && validationSummary.status === 'fail')) {
      return {
        action: 'DEMOTE',
        to_stage: 'DRAFT',
        rationale: executionCredibilityBreak
          ? 'Shadow strategy failed execution realism credibility checks; return to DRAFT for redesign.'
          : 'Shadow strategy failed critical checks; return to DRAFT for redesign.'
      };
    }
    return { action: 'HOLD', to_stage: 'SHADOW', rationale: 'Shadow strategy remains under monitoring.' };
  }

  if (stage === 'DRAFT') {
    if (allRequiredPass) {
      return {
        action: 'PROMOTE',
        to_stage: 'SHADOW',
        rationale: 'Draft strategy meets entry criteria for SHADOW.'
      };
    }
    return { action: 'HOLD', to_stage: 'DRAFT', rationale: 'Draft strategy lacks required governance evidence.' };
  }

  return { action: 'HOLD', to_stage: stage, rationale: 'No state transition applied.' };
}

function decisionTypeForAction(action) {
  if (action === 'PROMOTE') return 'PromotionDecision';
  if (action === 'DEMOTE') return 'DemotionDecision';
  if (action === 'ROLLBACK') return 'RollbackDecision';
  if (action === 'RETIRE') return 'RetirementDecision';
  return null;
}

function reviewRecord({
  asOf,
  strategyId,
  version,
  stage,
  action,
  actionRationale,
  evidenceLinks,
  unresolvedConcerns,
  reviewer = 'system-generated'
}) {
  let approvalState = 'PENDING';
  if (action === 'PROMOTE') {
    approvalState = unresolvedConcerns.length ? 'REJECTED' : 'APPROVED';
  } else if (['DEMOTE', 'ROLLBACK', 'RETIRE'].includes(action)) {
    approvalState = 'APPROVED';
  } else if (unresolvedConcerns.length) {
    approvalState = 'CONDITIONAL';
  }

  return {
    review_id: `review-${strategyId}-${String(asOf).slice(0, 10)}`,
    strategy_id: strategyId,
    strategy_version: version,
    review_type:
      action === 'PROMOTE'
        ? 'promotion_review'
        : action === 'DEMOTE'
          ? 'demotion_review'
          : action === 'ROLLBACK'
            ? 'rollback_review'
            : action === 'RETIRE'
              ? 'retirement_review'
              : 'periodic_monitor_review',
    reviewer,
    review_timestamp: asOf,
    approval_state: approvalState,
    decision_rationale: actionRationale,
    evidence_links: evidenceLinks,
    unresolved_concerns: unresolvedConcerns,
    stage_at_review: stage
  };
}

function makeDecisionObject({
  asOf,
  strategy,
  actionDecision,
  review,
  evidenceSummary,
  validationSummary,
  monitoringSummary
}) {
  const type = decisionTypeForAction(actionDecision.action);
  if (!type) return null;
  return {
    decision_object_id: `gov-${type.toLowerCase()}-${strategy.strategy_id}-${String(asOf).slice(0, 10)}`,
    decision_type: type,
    strategy_id: strategy.strategy_id,
    family: strategy.family,
    template: strategy.template,
    version: strategy.version,
    from_state: strategy.current_stage,
    to_state: actionDecision.to_stage,
    approval_state: review.approval_state,
    reviewer: review.reviewer,
    review_timestamp: review.review_timestamp,
    decision_rationale: review.decision_rationale,
    evidence_links: review.evidence_links,
    unresolved_concerns: review.unresolved_concerns,
    evidence_summary: evidenceSummary,
    validation_summary: validationSummary,
    monitoring_summary: monitoringSummary,
    created_at: asOf
  };
}

function listDecisionViews(strategyRows = []) {
  return strategyRows.map((row) => ({
    decision_id: `gov-${row.strategy_id}-${String(row.generated_at || '').slice(0, 10)}`,
    strategy_id: row.strategy_id,
    from_stage: row.current_stage,
    to_stage: row.next_stage,
    action: row.action,
    rationale: row.latest_review?.decision_rationale || row.action_rationale,
    reviewer: row.latest_review?.reviewer || 'system-generated',
    created_at: row.generated_at
  }));
}

function priorRecordByStrategy(research = {}) {
  const rows = research?.research_core?.strategy_governance?.strategy_records || [];
  return new Map((rows || []).map((row) => [row.strategy_id, row]));
}

function safeMean(values = []) {
  return values.length ? mean(values) : 0;
}

function rankActionPriority(action) {
  if (action === 'RETIRE') return 1;
  if (action === 'ROLLBACK') return 2;
  if (action === 'DEMOTE') return 3;
  if (action === 'PROMOTE') return 4;
  return 5;
}

export function buildStrategyGovernanceLifecycle({
  asOf = new Date().toISOString(),
  research = {},
  walkforward = {},
  funnelDiagnostics = {},
  signals = [],
  reviewer = 'system-generated'
} = {}) {
  const baseRows = collectStrategyRows(research);
  const frequency = signalFrequencyByStrategy(signals);
  const metaByStrategy = inferMetaByStrategy(signals);
  const versionRegistry = research?.governance?.version_registry || [];
  const previousByStrategy = priorRecordByStrategy(research);
  const wfByStrategy = walkforwardById(walkforward);

  const provisionalRows = baseRows.map((row) => {
    const strategyId = row.strategy_id;
    const walkforwardRow = wfByStrategy.get(strategyId) || null;
    const version = versionRegistry.find((item) => item.strategy_id === strategyId)?.version || extractVersion(row.notes);
    const family = metaByStrategy.get(strategyId)?.family || 'unknown';
    const template = metaByStrategy.get(strategyId)?.template || strategyId;
    const signalFrequency = safe(frequency[strategyId], 0);
    const diversity = diversificationValue(strategyId, research);

    const evidenceSummary = evidenceSummaryFor({
      strategyId,
      walkforwardRow,
      version,
      family,
      template
    });
    const validationSummary = validationSummaryFor(walkforwardRow);
    const degradation = degradationSignals(walkforwardRow, signalFrequency);
    const monitoringSummary = {
      signal_frequency: signalFrequency,
      degradation_signals: degradation,
      warning_count: degradation.status === 'warning' ? degradation.reasons.length : 0,
      critical_count: degradation.reasons.filter((item) =>
        ['harsh_execution_fragility', 'strict_fill_monotonicity_failure', 'return_degradation', 'cost_fragility'].includes(item)
      ).length,
      retire_recommended:
        (degradation.reasons.includes('harsh_execution_fragility') && degradation.reasons.includes('cost_fragility')) ||
        (degradation.reasons.includes('return_degradation') && signalFrequency <= 1)
    };

    const operationalConfidence = scoreOperationalConfidence({
      validationSummary,
      evidenceSummary,
      diversification: diversity,
      degradation
    });
    const institutionalReadiness = evaluateInstitutionalReadiness({
      targetStage: nextLifecycleStage(row.stage),
      evidenceSummary,
      validationSummary,
      monitoringSummary,
      operationalConfidence,
      diversification: diversity
    });

    const stageSpec = STAGE_WORKFLOW[row.stage] || STAGE_WORKFLOW.DRAFT;
    const checks = stageCheckRows({
      stage: row.stage,
      stageSpec,
      evidenceSummary,
      validationSummary,
      monitoringSummary,
      operationalConfidence,
      institutionalReadiness
    });

    return {
      strategy_id: strategyId,
      version,
      family,
      template,
      current_stage: row.stage,
      source_stage: row.source_stage,
      execution_mode: row.execution_mode,
      change_log_size: row.change_log.length,
      compatible_markets: ['US', 'CRYPTO'],
      compatible_regimes: walkforwardRow?.regime_sliced_evaluation?.map((item) => item.regime) || [],
      evidence_summary: evidenceSummary,
      validation_summary: validationSummary,
      monitoring_summary: monitoringSummary,
      institutional_readiness: institutionalReadiness,
      operational_confidence: operationalConfidence,
      diversification_value: round(diversity, 4),
      stage_requirements: stageSpec,
      stage_check_results: checks,
      required_unmet_checks: collectUnmetRequiredChecks(checks),
      generated_at: asOf,
      _walkforward: walkforwardRow,
      _previous: previousByStrategy.get(strategyId) || null
    };
  });

  const rollbackCandidate = rollbackStandby(provisionalRows);

  const strategyRecords = provisionalRows
    .map((row) => {
      const actionDecision = decideAction({
        stage: row.current_stage,
        requiredUnmet: row.required_unmet_checks,
        monitoringSummary: row.monitoring_summary,
        validationSummary: row.validation_summary,
        operationalConfidence: row.operational_confidence,
        institutionalReadiness: row.institutional_readiness,
        rollbackCandidate,
        strategyId: row.strategy_id
      });

      const evidenceLinks = buildEvidenceLinks(row.strategy_id, row.stage_check_results);
      const review = reviewRecord({
        asOf,
        strategyId: row.strategy_id,
        version: row.version,
        stage: row.current_stage,
        action: actionDecision.action,
        actionRationale: actionDecision.rationale,
        evidenceLinks,
        unresolvedConcerns: row.required_unmet_checks,
        reviewer
      });

      const decisionObject = makeDecisionObject({
        asOf,
        strategy: row,
        actionDecision,
        review,
        evidenceSummary: row.evidence_summary,
        validationSummary: row.validation_summary,
        monitoringSummary: row.monitoring_summary
      });
      const holdHint = (() => {
        if (row.current_stage === 'PROD') return 'MAINTAIN_PROD';
        if (row.current_stage === 'RETIRED') return 'NONE_RETIRED';
        const target = row.current_stage === 'DRAFT' ? 'SHADOW' : row.current_stage === 'SHADOW' ? 'CANARY' : 'PROD';
        return row.required_unmet_checks.length ? `REMEDIATE_AND_PROMOTE_TO_${target}` : `PROMOTE_TO_${target}`;
      })();

      const prev = row._previous || {};
      const promotionHistory = [...(prev.promotion_history || [])];
      const demotionHistory = [...(prev.demotion_history || [])];
      const rollbackHistory = [...(prev.rollback_history || [])];

      if (actionDecision.action === 'PROMOTE') {
        promotionHistory.push({
          at: asOf,
          from_state: row.current_stage,
          to_state: actionDecision.to_stage,
          reviewer: review.reviewer,
          rationale: review.decision_rationale
        });
      } else if (actionDecision.action === 'DEMOTE') {
        demotionHistory.push({
          at: asOf,
          from_state: row.current_stage,
          to_state: actionDecision.to_stage,
          reviewer: review.reviewer,
          rationale: review.decision_rationale
        });
      } else if (actionDecision.action === 'ROLLBACK') {
        rollbackHistory.push({
          at: asOf,
          from_state: row.current_stage,
          to_state: actionDecision.to_stage,
          rollback_target: rollbackCandidate,
          reviewer: review.reviewer,
          rationale: review.decision_rationale
        });
      }

      return {
        strategy_id: row.strategy_id,
        family: row.family,
        template: row.template,
        version: row.version,
        current_stage: row.current_stage,
        next_stage: actionDecision.to_stage,
        action: actionDecision.action,
        action_rationale: actionDecision.rationale,
        next_eligible_action: actionDecision.action === 'HOLD'
          ? holdHint
          : `${actionDecision.action}_TO_${actionDecision.to_stage}`,
        evidence_summary: row.evidence_summary,
        validation_summary: row.validation_summary,
        monitoring_summary: row.monitoring_summary,
        institutional_readiness: row.institutional_readiness,
        approval_state: review.approval_state,
        review_status: review.approval_state,
        latest_review: review,
        stage_requirements: row.stage_requirements,
        stage_check_results: row.stage_check_results,
        unresolved_concerns: row.required_unmet_checks,
        evidence_links: evidenceLinks,
        operational_confidence: row.operational_confidence,
        diversification_value: row.diversification_value,
        compatible_markets: row.compatible_markets,
        compatible_regimes: row.compatible_regimes,
        execution_mode: row.execution_mode,
        degradation_signals: row.monitoring_summary.degradation_signals,
        promotion_history: promotionHistory,
        demotion_history: demotionHistory,
        rollback_history: rollbackHistory,
        retirement_reason: actionDecision.action === 'RETIRE' || row.current_stage === 'RETIRED'
          ? actionDecision.rationale
          : null,
        decision_object: decisionObject,
        governance_metadata: {
          source_stage: row.source_stage,
          change_log_size: row.change_log_size,
          execution_realism_profile: row.validation_summary.execution_assumption_profile?.profile_id || null,
          institutional_target_stage: row.institutional_readiness?.target_stage || null,
          institutional_blocker_count: row.institutional_readiness?.blockers?.length || 0
        },
        generated_at: asOf
      };
    })
    .sort((a, b) => rankActionPriority(a.action) - rankActionPriority(b.action));

  const decisionObjects = strategyRecords
    .map((row) => row.decision_object)
    .filter(Boolean);

  const promotionDecisions = decisionObjects.filter((row) => row.decision_type === 'PromotionDecision');
  const demotionDecisions = decisionObjects.filter((row) => row.decision_type === 'DemotionDecision');
  const rollbackDecisions = decisionObjects.filter((row) => row.decision_type === 'RollbackDecision');
  const retirementDecisions = decisionObjects.filter((row) => row.decision_type === 'RetirementDecision');

  const decisions = listDecisionViews(strategyRecords);

  const strategyRegistryView = strategyRecords.map((row) => ({
    strategy_id: row.strategy_id,
    family: row.family,
    template: row.template,
    version: row.version,
    current_state: row.current_stage,
    evidence_status: row.evidence_summary.status,
    evidence_completeness_score: row.evidence_summary.completeness_score,
    validation_status: row.validation_summary.status,
    review_status: row.review_status,
    approval_state: row.approval_state,
    next_eligible_action: row.next_eligible_action,
    next_eligible_state: row.next_stage,
    unresolved_concern_count: row.unresolved_concerns.length,
    last_review_timestamp: row.latest_review.review_timestamp
  }));

  const institutionalSummary = {
    target_profiles: INSTITUTIONAL_REQUIREMENTS,
    ready_for_shadow_count: strategyRecords.filter((item) => item.institutional_readiness?.target_stage === 'SHADOW' && item.institutional_readiness?.pass).length,
    ready_for_canary_count: strategyRecords.filter((item) => item.institutional_readiness?.target_stage === 'CANARY' && item.institutional_readiness?.pass).length,
    ready_for_prod_count: strategyRecords.filter((item) => item.institutional_readiness?.target_stage === 'PROD' && item.institutional_readiness?.pass).length,
    average_readiness_score: round(safeMean(strategyRecords.map((item) => item.institutional_readiness?.score || 0)), 4),
    common_blockers: (() => {
      const counts = new Map();
      for (const row of strategyRecords) {
        for (const blocker of row.institutional_readiness?.blockers || []) {
          counts.set(blocker, (counts.get(blocker) || 0) + 1);
        }
      }
      return [...counts.entries()]
        .map(([blocker, count]) => ({ blocker, count }))
        .sort((a, b) => b.count - a.count);
    })()
  };

  const rollbackLogic = {
    current_prod: strategyRecords.find((item) => item.current_stage === 'PROD')?.strategy_id || null,
    standby_canary: rollbackCandidate,
    trigger_conditions: [
      'critical degradation flags >= 2',
      'operational confidence < 0.30',
      'harsh execution survivability fails'
    ],
    action: rollbackCandidate
      ? 'rollback_to_canary_when_prod_breach_detected'
      : 'no_canary_standby_available'
  };

  return {
    generated_at: asOf,
    lifecycle: GOVERNANCE_LIFECYCLE,
    stage_workflow: STAGE_WORKFLOW,
    promotion_rules: {
      DRAFT_TO_SHADOW: STAGE_WORKFLOW.DRAFT,
      SHADOW_TO_CANARY: STAGE_WORKFLOW.SHADOW,
      CANARY_TO_PROD: STAGE_WORKFLOW.CANARY
    },
    demotion_rules: {
      PROD_TO_CANARY: STAGE_WORKFLOW.PROD,
      CANARY_TO_SHADOW: STAGE_WORKFLOW.CANARY,
      RETIREMENT: STAGE_WORKFLOW.PROD
    },
    strategies: strategyRecords,
    strategy_records: strategyRecords,
    strategy_registry: strategyRegistryView,
    review_workflow: {
      reviewer_mode: 'structured_review_record',
      required_fields: ['reviewer', 'review_timestamp', 'decision_rationale', 'evidence_links', 'unresolved_concerns'],
      reviews: strategyRecords.map((row) => row.latest_review)
    },
    decision_objects: {
      PromotionDecision: promotionDecisions,
      DemotionDecision: demotionDecisions,
      RollbackDecision: rollbackDecisions,
      RetirementDecision: retirementDecisions,
      all: decisionObjects
    },
    promotion_decisions: promotionDecisions,
    demotion_decisions: demotionDecisions,
    rollback_decisions: rollbackDecisions,
    retirement_decisions: retirementDecisions,
    decisions,
    operations: strategyRecords.map((row) => ({
      strategy_id: row.strategy_id,
      supported_operations: ['promote', 'demote', 'rollback', 'retire', 'compare_versions', 'review'],
      recommended_operation:
        row.action === 'PROMOTE'
          ? 'promote'
          : row.action === 'DEMOTE'
            ? 'demote'
            : row.action === 'ROLLBACK'
              ? 'rollback'
              : row.action === 'RETIRE'
                ? 'retire'
                : 'hold',
      rollback_candidate: rollbackCandidate
    })),
    version_comparison: strategyRecords
      .map((item) => ({
        strategy_id: item.strategy_id,
        version: item.version,
        stage: item.current_stage,
        validation_status: item.validation_summary.status,
        evidence_status: item.evidence_summary.status,
        operational_confidence: item.operational_confidence
      }))
      .sort((a, b) => b.operational_confidence - a.operational_confidence),
    rollback_logic: rollbackLogic,
    institutional_readiness: institutionalSummary,
    retirement_watchlist: strategyRecords
      .filter((item) => item.monitoring_summary.retire_recommended || item.action === 'RETIRE')
      .map((item) => ({
        strategy_id: item.strategy_id,
        reasons: item.monitoring_summary.degradation_signals.reasons,
        unresolved_concerns: item.unresolved_concerns
      })),
    audit_trail: decisionObjects,
    governance_summary: {
      prod_count: strategyRecords.filter((item) => item.current_stage === 'PROD').length,
      canary_count: strategyRecords.filter((item) => item.current_stage === 'CANARY').length,
      shadow_count: strategyRecords.filter((item) => item.current_stage === 'SHADOW').length,
      retired_count: strategyRecords.filter((item) => item.current_stage === 'RETIRED').length,
      promotion_count: promotionDecisions.length,
      demotion_count: demotionDecisions.length,
      rollback_count: rollbackDecisions.length,
      retirement_count: retirementDecisions.length,
      average_operational_confidence: round(safeMean(strategyRecords.map((item) => item.operational_confidence)), 4),
      average_institutional_readiness: institutionalSummary.average_readiness_score,
      institutional_prod_ready_count: institutionalSummary.ready_for_prod_count,
      observed_pipeline_bottleneck: funnelDiagnostics?.bottleneck?.stage || 'unknown'
    }
  };
}

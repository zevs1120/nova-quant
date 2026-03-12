import { round } from '../../engines/math.js';

function toMap(rows = [], keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (key == null) continue;
    map.set(key, row);
  }
  return map;
}

function evidenceQuality(entry) {
  const fields = [
    entry.hypothesis_id,
    entry.template_id,
    entry.feature_set?.length,
    Object.keys(entry.parameter_set || {}).length,
    entry.validation_summary?.status,
    entry.walk_forward_results?.summary,
    entry.governance_state?.current_stage,
    entry.assumption_profile?.profile_id
  ];
  const hit = fields.filter(Boolean).length;
  return round(hit / fields.length, 4);
}

function mergePromotionHistory({ candidateId, strategyId, discoveryDecisions = [], governanceDecisions = [] }) {
  const history = [];

  for (const row of discoveryDecisions || []) {
    if (row.candidate_id !== candidateId && row.strategy_id !== strategyId) continue;
    history.push({
      source: 'discovery_engine',
      decision: row.decision,
      from_stage: row.from_stage,
      to_stage: row.to_stage,
      rationale: row.rationale,
      created_at: row.created_at
    });
  }

  for (const row of governanceDecisions || []) {
    if (row.strategy_id !== strategyId) continue;
    history.push({
      source: 'strategy_governance',
      decision: row.action,
      from_stage: row.from_stage,
      to_stage: row.to_stage,
      rationale: row.rationale,
      created_at: row.created_at
    });
  }

  return history.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function buildCandidateEvidence({
  candidate,
  governanceByStrategy,
  walkForwardByStrategy,
  discoveryDecisionByCandidate,
  discoveryDecisions,
  governanceDecisions,
  regimeState,
  productOpportunities
}) {
  const strategyId = candidate.strategy_id;
  const governance = governanceByStrategy.get(strategyId) || null;
  const walkForward = walkForwardByStrategy.get(strategyId) || null;
  const validation = candidate.validation || {};
  const scoring = candidate.scoring || {};
  const discoveryDecision = discoveryDecisionByCandidate.get(candidate.candidate_id) || null;
  const executionRealism = walkForward?.execution_realism || {};

  const matchedOpportunity = (productOpportunities || []).find((item) =>
    String(item.strategy_template || '').toLowerCase() === String(candidate.template_id || '').toLowerCase() ||
    String(item.strategy_template || '').toLowerCase() === String(strategyId || '').toLowerCase()
  );

  const validationStages = validation.validation_stage_results || [];
  const stageMetrics = Object.fromEntries(validationStages.map((row) => [row.stage, row.metrics || {}]));

  return {
    evidence_id: `EVID-${candidate.candidate_id}`,
    strategy_id: strategyId,
    candidate_id: candidate.candidate_id,
    hypothesis_id: candidate.hypothesis_id || null,
    template_id: candidate.template_id || null,
    feature_set: candidate.supporting_features || [],
    parameter_set: candidate.parameter_set || {},
    validation_summary: {
      status: validation.final_status || 'unknown',
      rejected_at_stage: validation.rejected_at_stage || null,
      rejection_reasons: validation.rejection_reasons || [],
      stage_metrics: stageMetrics,
      candidate_quality_score: scoring.candidate_quality_score ?? null
    },
    regime_performance: {
      expected_regimes: candidate.compatible_regimes || [],
      validation_regime_segmentation: stageMetrics.stage_3_robustness_tests?.regime_segmentation || [],
      walk_forward_regime_sliced: walkForward?.regime_sliced_evaluation || [],
      current_regime_posture: regimeState?.state?.recommended_user_posture || '--'
    },
    cost_sensitivity: {
      validation_cost_stress: stageMetrics.stage_3_robustness_tests?.cost_stress || null,
      walk_forward_cost_sensitivity: walkForward?.cost_sensitivity || null,
      walk_forward_slippage_sensitivity: walkForward?.slippage_sensitivity || null,
      walk_forward_execution_realism: executionRealism
    },
    assumption_profile: executionRealism?.assumption_profile || walkForward?.replay_context?.assumption_profile || null,
    cost_realism_notes: [
      `Profile: ${executionRealism?.assumption_profile?.profile_id || 'unknown'}`,
      `Harsh assumption survival: ${executionRealism?.survives_harsh_assumptions ? 'pass' : 'hold'}`
    ],
    fill_realism_notes: [
      `Replay source: ${walkForward?.replay_context?.source || 'legacy_backtest'}`,
      `Replay-backed: ${walkForward?.replay_context?.replay_backed ? 'yes' : 'no'}`
    ],
    funding_realism_notes: [
      stageMetrics.stage_2_quick_backtest?.funding_bps_per_day > 0
        ? `Funding drag modeled (${stageMetrics.stage_2_quick_backtest?.funding_bps_per_day} bps/day).`
        : 'No funding drag in baseline assumption.'
    ],
    walk_forward_results: {
      summary: stageMetrics.stage_4_walkforward || null,
      external_validation: walkForward?.out_of_sample_summary || null,
      replay_context: walkForward?.replay_context || null
    },
    governance_state: {
      current_stage: governance?.current_stage || discoveryDecision?.to_stage || 'DRAFT',
      next_stage: governance?.next_stage || discoveryDecision?.to_stage || 'DRAFT',
      action: governance?.action || scoring?.lifecycle_action || 'HOLD',
      operational_confidence: governance?.operational_confidence ?? null
    },
    promotion_history: mergePromotionHistory({
      candidateId: candidate.candidate_id,
      strategyId,
      discoveryDecisions,
      governanceDecisions
    }),
    production_recommendation: {
      recommendation: scoring?.recommendation || 'REJECT',
      lifecycle_target: scoring?.next_stage || 'DRAFT',
      rationale:
        scoring?.recommendation === 'PROMOTE_TO_SHADOW'
          ? 'Validation and quality score satisfy discovery promotion gate.'
          : scoring?.recommendation === 'HOLD_FOR_RETEST'
            ? 'Candidate has partial evidence; rerun with bounded refinements.'
            : 'Insufficient validation evidence for promotion.'
    },
    audit_chain: {
      hypothesis: candidate.hypothesis_id,
      template: candidate.template_id,
      candidate: candidate.candidate_id,
      validation: validation.final_status || 'unknown',
      governance: governance?.current_stage || discoveryDecision?.to_stage || 'DRAFT',
      recommendation: scoring?.recommendation || 'REJECT'
    },
    linked_product_recommendation: matchedOpportunity
      ? {
          opportunity_id: matchedOpportunity.opportunity_id,
          asset: matchedOpportunity.asset,
          suggested_size_pct: matchedOpportunity.suggested_size_pct,
          risk_bucket: matchedOpportunity.risk_bucket
        }
      : null,
    evidence_quality_score: 0,
    generated_at: candidate.traceability?.generated_at || new Date().toISOString()
  };
}

function buildGovernedStrategyEvidence({
  strategy,
  walkForwardByStrategy,
  governanceDecisions,
  regimeState
}) {
  const walkForward = walkForwardByStrategy.get(strategy.strategy_id) || null;
  const executionRealism = walkForward?.execution_realism || {};

  return {
    evidence_id: `EVID-STRAT-${strategy.strategy_id}`,
    strategy_id: strategy.strategy_id,
    candidate_id: null,
    hypothesis_id: null,
    template_id: strategy.template || null,
    feature_set: [],
    parameter_set: {},
    validation_summary: {
      status: walkForward?.verdict?.promotion_readiness === 'pass' ? 'pass_to_scoring' : 'legacy_or_hold',
      rejected_at_stage: null,
      rejection_reasons: [],
      stage_metrics: {},
      candidate_quality_score: strategy.operational_confidence ?? null
    },
    regime_performance: {
      expected_regimes: strategy.compatible_regimes || [],
      validation_regime_segmentation: [],
      walk_forward_regime_sliced: walkForward?.regime_sliced_evaluation || [],
      current_regime_posture: regimeState?.state?.recommended_user_posture || '--'
    },
    cost_sensitivity: {
      validation_cost_stress: null,
      walk_forward_cost_sensitivity: walkForward?.cost_sensitivity || null,
      walk_forward_slippage_sensitivity: walkForward?.slippage_sensitivity || null,
      walk_forward_execution_realism: executionRealism
    },
    assumption_profile: executionRealism?.assumption_profile || walkForward?.replay_context?.assumption_profile || null,
    cost_realism_notes: [
      `Profile: ${executionRealism?.assumption_profile?.profile_id || 'unknown'}`,
      `Harsh assumption survival: ${executionRealism?.survives_harsh_assumptions ? 'pass' : 'hold'}`
    ],
    fill_realism_notes: [
      `Replay source: ${walkForward?.replay_context?.source || 'legacy_backtest'}`,
      `Replay-backed: ${walkForward?.replay_context?.replay_backed ? 'yes' : 'no'}`
    ],
    funding_realism_notes: [
      'Funding realism follows walk-forward execution profile and market assumptions.'
    ],
    walk_forward_results: {
      summary: walkForward?.out_of_sample_summary || null,
      external_validation: walkForward?.out_of_sample_summary || null,
      replay_context: walkForward?.replay_context || null
    },
    governance_state: {
      current_stage: strategy.current_stage,
      next_stage: strategy.next_stage,
      action: strategy.action,
      operational_confidence: strategy.operational_confidence ?? null
    },
    promotion_history: mergePromotionHistory({
      candidateId: null,
      strategyId: strategy.strategy_id,
      discoveryDecisions: [],
      governanceDecisions
    }),
    production_recommendation: {
      recommendation:
        strategy.action === 'PROMOTE'
          ? 'PROMOTE'
          : strategy.action === 'RETIRE'
            ? 'RETIRE'
            : strategy.action === 'DEGRADE'
              ? 'REDUCE'
              : 'HOLD',
      lifecycle_target: strategy.next_stage || strategy.current_stage,
      rationale: 'Recommendation inferred from strategy governance lifecycle action.'
    },
    audit_chain: {
      hypothesis: null,
      template: strategy.template || null,
      candidate: null,
      validation: walkForward?.verdict?.promotion_readiness || 'unknown',
      governance: strategy.current_stage,
      recommendation: strategy.action
    },
    linked_product_recommendation: null,
    evidence_quality_score: 0,
    generated_at: new Date().toISOString()
  };
}

export function buildResearchEvidenceSystem({
  asOf = new Date().toISOString(),
  strategyDiscovery = {},
  strategyGovernance = {},
  walkForward = {},
  regimeState = {},
  productOpportunities = []
} = {}) {
  const candidates = strategyDiscovery?.candidates || [];
  const discoveryDecisions = strategyDiscovery?.promotion_decisions || [];
  const governanceStrategies = strategyGovernance?.strategies || [];
  const governanceDecisions = strategyGovernance?.decisions || [];

  const governanceByStrategy = toMap(governanceStrategies, (row) => row.strategy_id);
  const walkForwardByStrategy = toMap(walkForward?.strategies || [], (row) => row.strategy_id);
  const discoveryDecisionByCandidate = toMap(discoveryDecisions, (row) => row.candidate_id);

  const candidateEvidence = candidates.map((candidate) =>
    buildCandidateEvidence({
      candidate,
      governanceByStrategy,
      walkForwardByStrategy,
      discoveryDecisionByCandidate,
      discoveryDecisions,
      governanceDecisions,
      regimeState,
      productOpportunities
    })
  );

  const governedOnlyEvidence = governanceStrategies
    .filter((row) => !candidateEvidence.some((item) => item.strategy_id === row.strategy_id))
    .map((strategy) =>
      buildGovernedStrategyEvidence({
        strategy,
        walkForwardByStrategy,
        governanceDecisions,
        regimeState
      })
    );

  const allEvidence = [...candidateEvidence, ...governedOnlyEvidence].map((entry) => ({
    ...entry,
    evidence_quality_score: evidenceQuality(entry)
  }));

  const chainCompleteness = allEvidence.map((row) => ({
    strategy_id: row.strategy_id,
    candidate_id: row.candidate_id,
    evidence_quality_score: row.evidence_quality_score,
    chain_complete: row.evidence_quality_score >= 0.7
  }));

  return {
    generated_at: asOf,
    system_version: 'research-evidence-system.v1',
    evidence_chain_definition: [
      'hypothesis',
      'template',
      'candidate_strategy',
      'validation_results',
      'governance_decision',
      'production_recommendation'
    ],
    strategies: allEvidence,
    chain_completeness: chainCompleteness,
    summary: {
      total_evidence_records: allEvidence.length,
      candidate_backed_records: candidateEvidence.length,
      governance_only_records: governedOnlyEvidence.length,
      average_evidence_quality_score: allEvidence.length
        ? round(allEvidence.reduce((acc, row) => acc + row.evidence_quality_score, 0) / allEvidence.length, 4)
        : 0,
      incomplete_records: chainCompleteness.filter((row) => !row.chain_complete).length,
      replay_validation_summary: {
        total_signals: Number(walkForward?.replay_validation?.summary?.total_signals || 0),
        triggered_trades: Number(walkForward?.replay_validation?.summary?.triggered_trades || 0),
        closed_trades: Number(walkForward?.replay_validation?.summary?.closed_trades || 0)
      }
    }
  };
}

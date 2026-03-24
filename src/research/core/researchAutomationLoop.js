import { round } from '../../engines/math.js';

function deteriorationAlerts(strategyGovernance = {}) {
  return (strategyGovernance?.strategies || [])
    .filter((item) => item.degradation_signals?.status === 'warning')
    .map((item) => ({
      strategy_id: item.strategy_id,
      stage: item.current_stage,
      reasons: item.degradation_signals.reasons,
      confidence: item.operational_confidence,
      severity: item.operational_confidence < 0.4 ? 'high' : 'medium',
    }));
}

function signalStarvation(funnel = {}) {
  const overall = funnel?.overall || {};
  const generated = Number(overall.generated || 0);
  const executable = Number(overall.executable || 0);
  const ratio = generated ? executable / generated : 0;
  const starvation = generated <= 3 || ratio <= 0.25;

  return {
    starvation_detected: starvation,
    generated,
    executable,
    executable_ratio: round(ratio, 4),
    bottleneck: funnel?.bottleneck || null,
    note: starvation
      ? 'Signal density is low relative to generated candidates.'
      : 'No severe starvation in current cycle.',
  };
}

function candidateSuggestions({ starvation, shadowLog, regimeState }) {
  const suggestions = [];
  if (starvation?.starvation_detected) {
    suggestions.push({
      suggestion_type: 'density_recovery',
      title: 'Relax score/risk thresholds in bounded test',
      reason: 'Executable ratio is low and indicates funnel over-filtering risk.',
      suggested_stage: 'SHADOW',
    });
  }

  const strictness = Number(shadowLog?.missed_opportunity_ratio || 0);
  if (strictness >= 0.25) {
    suggestions.push({
      suggestion_type: 'shadow_learned_variant',
      title: 'Create near-threshold challenger variants',
      reason: 'Shadow log indicates potentially over-strict filtering.',
      suggested_stage: 'DRAFT',
    });
  }

  if (regimeState?.state?.primary === 'high_volatility') {
    suggestions.push({
      suggestion_type: 'regime_specialist',
      title: 'Expand high-volatility specialist templates',
      reason: 'Current regime favors transition and defensive families.',
      suggested_stage: 'SHADOW',
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      suggestion_type: 'maintain',
      title: 'Continue current cycle with monitoring',
      reason: 'No urgent structural pressure signal detected.',
      suggested_stage: 'SHADOW',
    });
  }

  return suggestions;
}

function funnelAbnormalities(funnel = {}) {
  const issues = [];
  const overall = funnel?.overall || {};
  if ((overall.generated || 0) > 0 && (overall.filled || 0) === 0) {
    issues.push('generated_without_fills');
  }
  if ((overall.risk_filtered || 0) >= (overall.generated || 0) * 0.4) {
    issues.push('risk_filter_dominant');
  }
  if ((funnel?.threshold_sensitivity?.near_threshold_share || 0) >= 0.35) {
    issues.push('threshold_boundary_congestion');
  }

  return {
    abnormality_flags: issues,
    severity: issues.length >= 2 ? 'high' : issues.length === 1 ? 'medium' : 'low',
  };
}

function weeklySummary({ regimeState, strategyGovernance, starvation, shadowLog }) {
  const posture = regimeState?.state?.recommended_user_posture || '--';
  const degradeCount = (strategyGovernance?.strategies || []).filter(
    (item) => item.degradation_signals?.status === 'warning',
  ).length;
  const strictness = Number(shadowLog?.missed_opportunity_ratio || 0);

  return {
    headline:
      posture === 'SKIP'
        ? 'System is in protective mode; priority is loss avoidance and discipline.'
        : posture === 'REDUCE'
          ? 'System favors selective execution; risk-adjusted opportunity quality is mixed.'
          : 'System posture is constructive with controlled risk deployment.',
    what_improved: [
      `Regime confidence=${regimeState?.regime_confidence ?? '--'}.`,
      `Operational governance decisions generated=${strategyGovernance?.decisions?.length || 0}.`,
    ],
    what_deteriorated: [
      `Degradation alerts=${degradeCount}.`,
      `Signal starvation detected=${starvation.starvation_detected}.`,
      `Shadow strictness ratio=${round(strictness, 4)}.`,
    ],
    confidence_adjustment:
      strictness >= 0.35 || starvation.starvation_detected
        ? 'reduce_confidence'
        : 'maintain_confidence',
  };
}

export function buildResearchAutomationLoop({
  asOf = new Date().toISOString(),
  regimeState = {},
  funnelDiagnostics = {},
  shadowLog = {},
  strategyGovernance = {},
  walkForward = {},
  strategyDiscovery = {},
  aiResearchCopilot = {},
  weeklyCycle = {},
} = {}) {
  const alerts = deteriorationAlerts(strategyGovernance);
  const starvation = signalStarvation(funnelDiagnostics);
  const suggestions = candidateSuggestions({
    starvation,
    shadowLog,
    regimeState,
  });
  const abnormalities = funnelAbnormalities(funnelDiagnostics);
  const summary = weeklySummary({
    regimeState,
    strategyGovernance,
    starvation,
    shadowLog,
  });

  const governanceRecommendations = (strategyGovernance?.decisions || []).map((item) => ({
    strategy_id: item.strategy_id,
    action: item.action,
    to_stage: item.to_stage,
    rationale: item.rationale,
  }));
  const discoveryRecommendations = (strategyDiscovery?.promotion_decisions || [])
    .slice(0, 6)
    .map((item) => ({
      candidate_id: item.candidate_id,
      strategy_id: item.strategy_id,
      decision: item.decision,
      to_stage: item.to_stage,
      quality_score: item.metrics_summary?.candidate_quality_score ?? null,
    }));

  return {
    generated_at: asOf,
    loop_version: 'research-automation-loop.v1',
    cycle_steps: [
      'analyze_current_strategies',
      'detect_deterioration',
      'detect_signal_starvation',
      'suggest_candidate_variants',
      'review_validation_results',
      'generate_governance_recommendations',
      'update_research_logs',
    ],
    deterioration_alerts: alerts,
    signal_starvation: starvation,
    candidate_strategy_suggestions: suggestions,
    funnel_abnormalities: abnormalities,
    regime_specific_recommendations: {
      regime: regimeState?.state?.primary || 'unknown',
      posture: regimeState?.state?.recommended_user_posture || '--',
      recommendation:
        regimeState?.state?.recommended_user_posture === 'SKIP'
          ? 'Prioritize risk reduction and transition-specialist strategy monitoring.'
          : regimeState?.state?.recommended_user_posture === 'REDUCE'
            ? 'Focus on A-quality opportunities and reduced-size execution.'
            : 'Allow selective expansion while monitoring degradation and costs.',
    },
    validation_snapshot: {
      evaluated_strategies: walkForward?.summary?.evaluated_strategies || 0,
      promotion_ready: walkForward?.summary?.promotion_ready || [],
    },
    strategy_discovery_snapshot: {
      generated_candidates: strategyDiscovery?.summary?.generated_candidates || 0,
      promoted_to_shadow: strategyDiscovery?.summary?.promoted_to_shadow || 0,
      discovery_success_rate: strategyDiscovery?.summary?.discovery_success_rate || 0,
      top_promotion_decisions: discoveryRecommendations,
    },
    ai_research_copilot_snapshot: {
      top_actions: aiResearchCopilot?.top_actions?.slice(0, 5) || [],
      insight_count: aiResearchCopilot?.research_insights?.length || 0,
      validation_warning_count: aiResearchCopilot?.validation_warnings?.length || 0,
    },
    weekly_cycle_snapshot: {
      generated_at: weeklyCycle?.generated_at || asOf,
      bottleneck_stage: weeklyCycle?.signal_density_issues?.bottleneck_stage || 'unknown',
      recommendation_count: weeklyCycle?.research_recommendations?.length || 0,
    },
    governance_recommendations: governanceRecommendations,
    weekly_research_summary: summary,
  };
}

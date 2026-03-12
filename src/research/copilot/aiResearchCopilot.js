import { round } from '../../engines/math.js';

function pushInsight(bucket, item) {
  bucket.push({
    severity: item.severity || 'medium',
    title: item.title,
    message: item.message,
    evidence_refs: item.evidence_refs || []
  });
}

function funnelInsights(funnel = {}, insights = []) {
  const ratio = Number(funnel?.overall?.generated || 0)
    ? Number(funnel?.overall?.executable || 0) / Number(funnel?.overall?.generated || 1)
    : 0;

  if (ratio <= 0.25) {
    pushInsight(insights, {
      severity: 'high',
      title: 'Signal starvation detected',
      message: 'Signal funnel executable ratio is low; review score/risk/conflict filters and bounded threshold relaxations.',
      evidence_refs: ['signal_funnel_diagnostics.overall', 'signal_funnel_diagnostics.bottleneck']
    });
  }

  const bottleneck = String(funnel?.bottleneck?.stage || '');
  if (bottleneck === 'risk_filtered') {
    pushInsight(insights, {
      severity: 'medium',
      title: 'Risk filter dominates drop-off',
      message: 'Risk filter currently removes the largest share of candidates; evaluate bucket limits and concentration constraints.',
      evidence_refs: ['signal_funnel_diagnostics.bottleneck', 'risk_bucket_system.decision_summary']
    });
  }

  if (Number(funnel?.threshold_sensitivity?.near_threshold_share || 0) >= 0.35) {
    pushInsight(insights, {
      severity: 'medium',
      title: 'Threshold boundary congestion',
      message: 'Many candidates sit near score thresholds; adaptive threshold policy may improve density without regime-blind loosening.',
      evidence_refs: ['signal_funnel_diagnostics.threshold_sensitivity']
    });
  }
}

function shadowInsights(shadow = {}, insights = []) {
  if (Number(shadow?.missed_opportunity_ratio || 0) >= 0.25) {
    pushInsight(insights, {
      severity: 'medium',
      title: 'Potential over-strict filtering',
      message: 'Shadow logs suggest rejected opportunities may contain usable signal; test reduced-size or bounded threshold variants.',
      evidence_refs: ['shadow_opportunity_log.missed_opportunity_ratio', 'shadow_opportunity_log.under_traded_family_regime_matrix']
    });
  }
}

function validationInsights(walkForward = {}, discovery = {}, insights = []) {
  const fragile = walkForward?.summary?.fragile_strategies || [];
  if (fragile.length) {
    pushInsight(insights, {
      severity: 'high',
      title: 'Fragile strategies identified in walk-forward',
      message: `Walk-forward marks ${fragile.length} strategies as fragile; block promotion until robustness improves under cost stress.`,
      evidence_refs: ['walk_forward_validation.summary.fragile_strategies']
    });
  }

  const coverageGaps = discovery?.candidate_diagnostics?.coverage_gaps || {};
  if ((coverageGaps.regime_gaps || []).length) {
    pushInsight(insights, {
      severity: 'medium',
      title: 'Regime coverage gap in discovery',
      message: 'Discovery diagnostics show regimes with generated candidates but no promotions; add targeted hypotheses/templates.',
      evidence_refs: ['strategy_discovery_engine.candidate_diagnostics.coverage_gaps']
    });
  }

  const recurringFails = discovery?.candidate_diagnostics?.recurring_family_failures || [];
  const noisyFamily = recurringFails.find((row) => Number(row.failed_count || 0) >= 5 && Number(row.promoted_count || 0) <= 1);
  if (noisyFamily) {
    pushInsight(insights, {
      severity: 'medium',
      title: 'Repeated family underperformance in discovery',
      message: `${noisyFamily.strategy_family} shows repeated failures; revisit feature assumptions, parameter bounds, and regime compatibility.`,
      evidence_refs: ['strategy_discovery_engine.candidate_diagnostics.recurring_family_failures']
    });
  }
}

function degradationInsights(governance = {}, regimeState = {}, insights = []) {
  const degraded = (governance?.strategies || []).filter((row) => row?.degradation_signals?.status === 'warning');
  if (degraded.length) {
    pushInsight(insights, {
      severity: 'high',
      title: 'Strategy degradation alerts active',
      message: `${degraded.length} strategies show degradation warnings; prioritize rollback readiness and review stage demotions.`,
      evidence_refs: ['strategy_governance.strategies', 'strategy_governance.decisions']
    });
  }

  if (String(regimeState?.state?.primary || '').toLowerCase() === 'high_volatility') {
    pushInsight(insights, {
      severity: 'medium',
      title: 'High-volatility posture suggests specialist focus',
      message: 'Current regime is high volatility; momentum starves while transition/defensive families should be emphasized.',
      evidence_refs: ['regime_engine.state', 'regime_engine.policy']
    });
  }
}

function portfolioInsights(portfolio = {}, insights = []) {
  const divScore = Number(portfolio?.diagnostics?.diversification_contribution?.diversification_score || 0);
  const drawdown = Number(portfolio?.metrics?.drawdown || 0);

  if (divScore < 0.45) {
    pushInsight(insights, {
      severity: 'medium',
      title: 'Portfolio diversification is weak',
      message: 'Diversification score is below target; promote uncorrelated families and trim concentrated allocation clusters.',
      evidence_refs: ['portfolio_simulation.diagnostics.diversification_contribution']
    });
  }

  if (drawdown > 0.22) {
    pushInsight(insights, {
      severity: 'high',
      title: 'Portfolio drawdown proxy elevated',
      message: 'Simulated drawdown remains elevated; tighten risk budgets and reduce allocation to high-turnover/fragile strategies.',
      evidence_refs: ['portfolio_simulation.metrics.drawdown', 'portfolio_simulation.diagnostics.marginal_strategy_impact']
    });
  }
}

function hypothesisSuggestions(discovery = {}, insights = []) {
  const byHypothesis = discovery?.candidate_diagnostics?.by_hypothesis || [];
  const top = byHypothesis.slice(0, 3);
  const weak = byHypothesis.filter((row) => Number(row.generated || 0) >= 4 && Number(row.promoted_to_shadow || 0) === 0).slice(0, 3);

  const list = [];
  if (top.length) {
    list.push({
      type: 'expand_winning_hypotheses',
      detail: `Expand top-yield hypotheses: ${top.map((row) => row.hypothesis_id).join(', ')}`
    });
  }
  if (weak.length) {
    list.push({
      type: 'repair_or_prune_hypotheses',
      detail: `Repair or prune low-yield hypotheses: ${weak.map((row) => row.hypothesis_id).join(', ')}`
    });
  }

  if (!list.length) {
    list.push({ type: 'maintain', detail: 'No urgent hypothesis coverage warning in this cycle.' });
  }

  return list;
}

function prioritize(insights = []) {
  const order = { high: 3, medium: 2, low: 1 };
  return [...insights].sort((a, b) => (order[b.severity] || 0) - (order[a.severity] || 0));
}

export function buildAiResearchCopilot({
  asOf = new Date().toISOString(),
  funnelDiagnostics = {},
  shadowLog = {},
  walkForward = {},
  strategyGovernance = {},
  regimeState = {},
  strategyDiscovery = {},
  portfolioSimulation = {}
} = {}) {
  const researchInsights = [];
  funnelInsights(funnelDiagnostics, researchInsights);
  shadowInsights(shadowLog, researchInsights);
  validationInsights(walkForward, strategyDiscovery, researchInsights);
  degradationInsights(strategyGovernance, regimeState, researchInsights);
  portfolioInsights(portfolioSimulation, researchInsights);

  const prioritized = prioritize(researchInsights);

  return {
    generated_at: asOf,
    copilot_version: 'ai-research-copilot.v1',
    research_insights: prioritized,
    hypothesis_suggestions: hypothesisSuggestions(strategyDiscovery, prioritized),
    strategy_improvement_suggestions: prioritized
      .filter((item) => item.title.toLowerCase().includes('strategy') || item.title.toLowerCase().includes('filter'))
      .map((item, idx) => ({
        suggestion_id: `copilot-strat-${idx + 1}`,
        action: item.title,
        rationale: item.message,
        evidence_refs: item.evidence_refs
      })),
    regime_coverage_warnings: prioritized
      .filter((item) => item.title.toLowerCase().includes('regime') || item.message.toLowerCase().includes('regime')),
    validation_warnings: prioritized
      .filter((item) => item.title.toLowerCase().includes('fragile') || item.message.toLowerCase().includes('walk-forward')),
    top_actions: prioritized.slice(0, 5).map((item, idx) => ({
      rank: idx + 1,
      severity: item.severity,
      action: item.title,
      why: item.message
    }))
  };
}

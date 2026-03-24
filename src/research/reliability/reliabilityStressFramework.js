import { round } from '../../engines/math.js';
import { runQuantPipeline } from '../../engines/pipeline.js';
import { buildRegimeEngineState } from '../core/regimeEngineV2.js';
import { buildRiskBucketSystem } from '../core/riskBucketSystem.js';
import { buildFeatureSignalLayer } from '../core/featureSignalLayer.js';
import { buildWalkForwardValidation } from '../core/walkForwardValidation.js';
import { buildStrategyDiscoveryEngine } from '../discovery/strategyDiscoveryEngine.js';
import { buildPortfolioSimulationEngine } from '../../portfolio_simulation/portfolioSimulationEngine.js';
import { buildStrategyGovernanceLifecycle } from '../core/strategyGovernanceV2.js';
import { loadReliabilityScenarioPacks } from './scenarioPacks.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function safe(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ratio(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator === 0) return 0;
  return round(safe(numerator, 0) / denominator, 4);
}

function firstFailure(checks = []) {
  return (checks || []).find((row) => !row.pass) || null;
}

function familySensitivityFromDiscovery(discovery = {}, focusReasons = []) {
  const candidates = discovery?.candidates || [];
  const scored = discovery?.candidate_scoring?.candidates || [];
  const byId = new Map(candidates.map((item) => [item.candidate_id, item]));
  const rows = [];

  for (const scoreRow of scored) {
    const reasons = scoreRow.rejection_reasons || [];
    if (!reasons.length) continue;
    if (focusReasons.length && !reasons.some((item) => focusReasons.includes(item))) continue;
    const candidate = byId.get(scoreRow.candidate_id);
    rows.push({
      strategy_family: candidate?.strategy_family || 'unknown',
      reasons,
    });
  }

  const map = new Map();
  for (const row of rows) {
    const key = row.strategy_family;
    const current = map.get(key) || {
      strategy_family: key,
      hit_count: 0,
      reasons: [],
    };
    current.hit_count += 1;
    current.reasons.push(...row.reasons);
    map.set(key, current);
  }

  return Array.from(map.values())
    .map((row) => ({
      strategy_family: row.strategy_family,
      hit_count: row.hit_count,
      top_reasons: Array.from(new Set(row.reasons)).slice(0, 4),
    }))
    .sort((a, b) => b.hit_count - a.hit_count);
}

function check(module, check_id, pass, value, threshold, note) {
  return {
    module,
    check_id,
    pass: Boolean(pass),
    value,
    threshold,
    note,
  };
}

function scaleExecutionProfile(
  profile = {},
  {
    profileId = 'exec-realism.stress.custom',
    slippageMultiplier = 1,
    spreadMultiplier = 1,
    fillEntry = null,
    fillExit = null,
  } = {},
) {
  const out = clone(profile);
  out.profile_id = profileId;

  for (const marketKey of Object.keys(out.markets || {})) {
    const market = out.markets[marketKey];
    for (const bucket of Object.keys(market?.spread_bps_by_vol_bucket || {})) {
      market.spread_bps_by_vol_bucket[bucket] = round(
        safe(market.spread_bps_by_vol_bucket[bucket], 0) * spreadMultiplier,
        6,
      );
    }
    for (const bucket of Object.keys(market?.slippage_bps_by_vol_bucket || {})) {
      const row = market.slippage_bps_by_vol_bucket[bucket];
      row.entry = round(safe(row.entry, 0) * slippageMultiplier, 6);
      row.exit = round(safe(row.exit, 0) * slippageMultiplier, 6);
    }
    if (fillEntry || fillExit) {
      market.fill_policy = market.fill_policy || {};
      if (fillEntry) market.fill_policy.entry = fillEntry;
      if (fillExit) market.fill_policy.exit = fillExit;
    }
  }

  if (fillEntry || fillExit) {
    out.fill_policy = out.fill_policy || {};
    if (fillEntry) out.fill_policy.entry = fillEntry;
    if (fillExit) out.fill_policy.exit = fillExit;
  }

  return out;
}

function baselineContext({ asOf, riskProfileKey }) {
  const state = runQuantPipeline({
    as_of: asOf,
    config: {
      risk_profile: riskProfileKey,
    },
  });
  const core = state?.research?.research_core || {};
  return {
    state,
    core,
    research: state?.research || {},
    championState: {
      ...state,
      research: undefined,
    },
  };
}

function scenarioElevatedVolatility(pack, context) {
  const champion = clone(context.championState);
  champion.insights = champion.insights || {};
  champion.insights.volatility = champion.insights.volatility || {};
  champion.insights.breadth = champion.insights.breadth || {};
  champion.insights.risk_on_off = champion.insights.risk_on_off || {};
  champion.insights.regime = champion.insights.regime || {};
  champion.safety = champion.safety || {};
  champion.insights.regime.tag = 'High Volatility Risk';
  champion.insights.volatility.stress = safe(pack.parameters.volatility_stress, 0.94);
  champion.insights.breadth.ratio = safe(pack.parameters.breadth_ratio, 0.44);
  champion.insights.risk_on_off.score = safe(pack.parameters.risk_on_off_score, 0.48);
  champion.insights.risk_on_off.state = pack.parameters.risk_on_off_state || 'Neutral';
  champion.safety.mode = pack.parameters.safety_mode || 'trade light';

  const regime = buildRegimeEngineState({
    asOf: context.asOf,
    championState: champion,
    strategyFamilyRegistry: context.core.strategy_families,
    historicalSnapshots: context.research.daily_snapshots || [],
    signals: champion.signals || [],
  });
  const risk = buildRiskBucketSystem({
    asOf: context.asOf,
    riskProfileKey: context.riskProfileKey,
    championState: champion,
    regimeState: regime,
    signals: champion.signals || [],
    trades: champion.trades || [],
  });
  const featureLayer = buildFeatureSignalLayer({
    asOf: context.asOf,
    championState: champion,
    regimeState: regime,
    riskBuckets: risk,
    funnelDiagnostics: context.core.signal_funnel_diagnostics,
  });

  const decisions = risk.trade_level_buckets || [];
  const blockedRatio = decisions.length
    ? decisions.filter((row) => row.decision === 'blocked').length / decisions.length
    : 0;
  const reduceOrBlockedRatio = decisions.length
    ? decisions.filter((row) => ['reduce', 'blocked'].includes(row.decision)).length /
      decisions.length
    : 0;
  const checks = [
    check(
      'regime_engine',
      'classifies_volatility_stress',
      ['high_volatility', 'risk_off'].includes(regime?.state?.primary),
      regime?.state?.primary,
      'high_volatility|risk_off',
      'Regime engine should react to elevated volatility input.',
    ),
    check(
      'risk_bucket_system',
      'applies_defensive_posture',
      ['REDUCE', 'SKIP'].includes(regime?.state?.recommended_user_posture),
      regime?.state?.recommended_user_posture,
      'REDUCE|SKIP',
      'Risk posture should become defensive under stress.',
    ),
    check(
      'decision_layer',
      'degrades_gracefully_under_vol_stress',
      featureLayer?.signal_lifecycle?.raw_signals?.length >=
        featureLayer?.signal_lifecycle?.executable_opportunities?.length,
      {
        raw: featureLayer?.signal_lifecycle?.raw_signals?.length || 0,
        executable: featureLayer?.signal_lifecycle?.executable_opportunities?.length || 0,
      },
      'raw >= executable',
      'Product layer should remain structured while reducing executable density.',
    ),
    check(
      'risk_bucket_system',
      'defensive_decision_ratio_under_stress',
      reduceOrBlockedRatio >= 0.3,
      round(reduceOrBlockedRatio, 4),
      '>= 0.3',
      'Risk filter should reduce/block a meaningful share under elevated volatility.',
    ),
  ];

  return {
    scenario_id: pack.scenario_id,
    title: pack.title,
    category: pack.category,
    severity: pack.severity,
    checks,
    metrics: {
      regime_primary: regime?.state?.primary,
      posture: regime?.state?.recommended_user_posture,
      blocked_ratio: round(blockedRatio, 4),
      reduce_or_block_ratio: round(reduceOrBlockedRatio, 4),
    },
    sensitive_families: [],
  };
}

function scenarioRiskOff(pack, context) {
  const champion = clone(context.championState);
  champion.insights = champion.insights || {};
  champion.insights.volatility = champion.insights.volatility || {};
  champion.insights.breadth = champion.insights.breadth || {};
  champion.insights.risk_on_off = champion.insights.risk_on_off || {};
  champion.insights.regime = champion.insights.regime || {};
  champion.safety = champion.safety || {};
  champion.insights.regime.tag = 'High Volatility Risk';
  champion.insights.volatility.stress = safe(pack.parameters.volatility_stress, 0.9);
  champion.insights.breadth.ratio = safe(pack.parameters.breadth_ratio, 0.3);
  champion.insights.risk_on_off.score = safe(pack.parameters.risk_on_off_score, 0.82);
  champion.insights.risk_on_off.state = pack.parameters.risk_on_off_state || 'Risk-Off';
  champion.safety.mode = pack.parameters.safety_mode || 'do not trade';

  const regime = buildRegimeEngineState({
    asOf: context.asOf,
    championState: champion,
    strategyFamilyRegistry: context.core.strategy_families,
    historicalSnapshots: context.research.daily_snapshots || [],
    signals: champion.signals || [],
  });
  const risk = buildRiskBucketSystem({
    asOf: context.asOf,
    riskProfileKey: context.riskProfileKey,
    championState: champion,
    regimeState: regime,
    signals: champion.signals || [],
    trades: champion.trades || [],
  });

  const checks = [
    check(
      'regime_engine',
      'classifies_risk_off',
      regime?.state?.primary === 'risk_off',
      regime?.state?.primary,
      'risk_off',
      'Risk-off shock should classify as risk_off.',
    ),
    check(
      'risk_bucket_system',
      'skip_posture_enforced',
      regime?.state?.recommended_user_posture === 'SKIP',
      regime?.state?.recommended_user_posture,
      'SKIP',
      'Risk-off state should force SKIP posture.',
    ),
    check(
      'risk_bucket_system',
      'no_trade_guidance_present',
      String(risk?.decision_summary?.no_trade_recommendation || '').length > 0,
      risk?.decision_summary?.no_trade_recommendation || '',
      'non-empty',
      'Risk module should provide explicit no-trade guidance.',
    ),
  ];

  return {
    scenario_id: pack.scenario_id,
    title: pack.title,
    category: pack.category,
    severity: pack.severity,
    checks,
    metrics: {
      regime_primary: regime?.state?.primary,
      posture: regime?.state?.recommended_user_posture,
      no_trade_recommendation: risk?.decision_summary?.no_trade_recommendation || '',
    },
    sensitive_families: [],
  };
}

function scenarioConcentratedExposure(pack, context) {
  const champion = clone(context.championState);
  champion.signals = (champion.signals || []).map((row, idx) => {
    if (idx >= safe(pack.parameters.signals_to_concentrate, 8)) return row;
    return {
      ...row,
      status: 'NEW',
      market: 'US',
      asset_class: 'US_STOCK',
      sector: pack.parameters.shared_sector || 'CONCENTRATED_THEME',
      position_advice: {
        ...(row.position_advice || {}),
        position_pct: safe(pack.parameters.position_pct, 14),
      },
    };
  });

  const risk = buildRiskBucketSystem({
    asOf: context.asOf,
    riskProfileKey: context.riskProfileKey,
    championState: champion,
    regimeState: context.core.regime_engine,
    signals: champion.signals || [],
    trades: champion.trades || [],
  });

  const budget = risk?.portfolio_risk_budget || {};
  const reduceOrBlocked = (risk?.trade_level_buckets || []).filter((row) =>
    ['reduce', 'blocked'].includes(row.decision),
  ).length;
  const total = (risk?.trade_level_buckets || []).length || 1;

  const checks = [
    check(
      'risk_bucket_system',
      'budget_status_stressed',
      budget?.budget_status === 'stressed',
      budget?.budget_status,
      'stressed',
      'Concentrated setup should stress portfolio budget.',
    ),
    check(
      'risk_bucket_system',
      'concentration_caps_triggered',
      safe(budget.market_concentration_pct, 0) >= safe(budget.market_concentration_cap_pct, 0) ||
        safe(budget.correlated_exposure_pct, 0) >= safe(budget.correlated_exposure_cap_pct, 0),
      {
        market_concentration_pct: budget.market_concentration_pct,
        market_concentration_cap_pct: budget.market_concentration_cap_pct,
        correlated_exposure_pct: budget.correlated_exposure_pct,
        correlated_exposure_cap_pct: budget.correlated_exposure_cap_pct,
      },
      'concentration >= cap',
      'Concentration guardrails should fire under overloaded exposure.',
    ),
    check(
      'decision_layer',
      'reduce_or_block_ratio_high',
      ratio(reduceOrBlocked, total) >= 0.55,
      ratio(reduceOrBlocked, total),
      '>= 0.55',
      'Decision layer should reduce/block majority under concentration overload.',
    ),
  ];

  return {
    scenario_id: pack.scenario_id,
    title: pack.title,
    category: pack.category,
    severity: pack.severity,
    checks,
    metrics: {
      budget_status: budget?.budget_status,
      concentration_pct: budget?.market_concentration_pct,
      concentration_cap_pct: budget?.market_concentration_cap_pct,
    },
    sensitive_families: [],
  };
}

function scenarioHighSlippage(pack, context) {
  const baseProfile =
    context.core?.walk_forward_validation?.config?.execution_realism_profile || {};
  const stressedProfile = scaleExecutionProfile(baseProfile, {
    profileId: pack.parameters.execution_profile_id || 'exec-realism.backtest.high-slippage.v1',
    slippageMultiplier: safe(pack.parameters.slippage_multiplier, 2.4),
    spreadMultiplier: safe(pack.parameters.spread_multiplier, 1.9),
  });

  const walkForward = buildWalkForwardValidation({
    asOf: context.asOf,
    research: context.research,
    championState: context.championState,
    regimeState: context.core.regime_engine,
    riskBucketSystem: context.core.risk_bucket_system,
    funnelDiagnostics: context.core.signal_funnel_diagnostics,
    config: {
      execution_realism_mode: 'backtest',
      execution_realism_profile: stressedProfile,
    },
  });

  const baseSurvivors = safe(
    context.core?.walk_forward_validation?.summary?.harsh_execution_survivors,
    0,
  );
  const stressedSurvivors = safe(walkForward?.summary?.harsh_execution_survivors, 0);
  const survivalRatio = baseSurvivors > 0 ? stressedSurvivors / baseSurvivors : 1;

  const discovery = buildStrategyDiscoveryEngine({
    asOf: context.asOf,
    research: context.research,
    regimeState: context.core.regime_engine,
    signalFunnel: context.core.signal_funnel_diagnostics,
    strategyGovernance: context.core.strategy_governance,
    walkForward,
    config: {
      generation: {
        risk_profile: context.riskProfileKey,
      },
      validation: {
        stage_2: {
          execution_realism_profile: stressedProfile,
        },
      },
    },
  });

  const checks = [
    check(
      'walk_forward_validation',
      'harsh_execution_survival_ratio',
      survivalRatio >= 0.5,
      round(survivalRatio, 4),
      '>= 0.5',
      'Validation should degrade but remain partially resilient under high slippage.',
    ),
    check(
      'walk_forward_validation',
      'execution_profile_applied',
      Boolean(walkForward?.summary?.execution_assumption_profile?.profile_id),
      walkForward?.summary?.execution_assumption_profile?.profile_id || null,
      'non-empty profile_id',
      'Stress profile must be traceable in validation outputs.',
    ),
  ];

  return {
    scenario_id: pack.scenario_id,
    title: pack.title,
    category: pack.category,
    severity: pack.severity,
    checks,
    metrics: {
      base_harsh_execution_survivors: baseSurvivors,
      stressed_harsh_execution_survivors: stressedSurvivors,
      survival_ratio: round(survivalRatio, 4),
    },
    sensitive_families: familySensitivityFromDiscovery(discovery, [
      'cost_sensitivity_too_high',
      'post_cost_return_too_weak',
      'risk_adjusted_return_too_low',
    ]),
  };
}

function scenarioPoorFills(pack, context) {
  const baseProfile =
    context.core?.walk_forward_validation?.config?.execution_realism_profile || {};
  const stressedProfile = scaleExecutionProfile(baseProfile, {
    profileId: pack.parameters.execution_profile_id || 'exec-realism.backtest.poor-fills.v1',
    slippageMultiplier: safe(pack.parameters.slippage_multiplier, 2.6),
    spreadMultiplier: safe(pack.parameters.spread_multiplier, 2.3),
    fillEntry: pack.parameters.fill_entry || 'conservative_fill',
    fillExit: pack.parameters.fill_exit || 'conservative_fill',
  });

  const walkForward = buildWalkForwardValidation({
    asOf: context.asOf,
    research: context.research,
    championState: context.championState,
    regimeState: context.core.regime_engine,
    riskBucketSystem: context.core.risk_bucket_system,
    funnelDiagnostics: context.core.signal_funnel_diagnostics,
    config: {
      execution_realism_mode: 'backtest',
      execution_realism_profile: stressedProfile,
    },
  });

  const governance = buildStrategyGovernanceLifecycle({
    asOf: context.asOf,
    research: context.research,
    walkforward: walkForward,
    funnelDiagnostics: context.core.signal_funnel_diagnostics,
    signals: context.championState.signals || [],
  });

  const strictFillRows = (walkForward?.strategies || []).map((row) => {
    const base = safe(row?.cost_sensitivity?.base?.cumulative_return, 0);
    const strict = safe(row?.cost_sensitivity?.strict_fill?.cumulative_return, 0);
    return {
      strategy_id: row.strategy_id,
      base,
      strict,
      delta: round(strict - base, 6),
    };
  });
  const strictFillImprovedCount = strictFillRows.filter((row) => row.delta > 0).length;
  const strictFillConsistency = strictFillImprovedCount <= Math.floor(strictFillRows.length / 2);

  const demoteOrRollback =
    safe(governance?.decision_objects?.DemotionDecision?.length, 0) +
    safe(governance?.decision_objects?.RollbackDecision?.length, 0) +
    safe(governance?.decision_objects?.RetirementDecision?.length, 0);

  const checks = [
    check(
      'walk_forward_validation',
      'strict_fill_monotonicity',
      strictFillConsistency,
      {
        improved_count: strictFillImprovedCount,
        total: strictFillRows.length,
      },
      'improved_count <= floor(total/2)',
      'Strict-fill assumptions should not improve most strategies; if they do, realism model is brittle.',
    ),
    check(
      'governance_workflow',
      'demotion_or_rollback_paths_present',
      demoteOrRollback > 0,
      demoteOrRollback,
      '> 0',
      'Governance must remain operational and emit decision artifacts under poor fills.',
    ),
    check(
      'walk_forward_validation',
      'profile_traceability_preserved',
      Boolean(walkForward?.summary?.execution_assumption_profile?.profile_id),
      walkForward?.summary?.execution_assumption_profile?.profile_id || null,
      'non-empty profile_id',
      'Validation traceability should remain intact under poor fill assumptions.',
    ),
  ];

  const discovery = buildStrategyDiscoveryEngine({
    asOf: context.asOf,
    research: context.research,
    regimeState: context.core.regime_engine,
    signalFunnel: context.core.signal_funnel_diagnostics,
    strategyGovernance: governance,
    walkForward,
    config: {
      generation: {
        risk_profile: context.riskProfileKey,
      },
      validation: {
        stage_2: {
          execution_realism_profile: stressedProfile,
        },
      },
    },
  });

  return {
    scenario_id: pack.scenario_id,
    title: pack.title,
    category: pack.category,
    severity: pack.severity,
    checks,
    metrics: {
      strict_fill_monotonicity_ok: strictFillConsistency,
      strict_fill_rows: strictFillRows,
      governance_action_count: (governance?.decision_objects?.all || []).length,
    },
    sensitive_families: familySensitivityFromDiscovery(discovery, [
      'cost_sensitivity_too_high',
      'walkforward_avg_return_too_low',
    ]),
  };
}

function scenarioStrategyStarvation(pack, context) {
  const discovery = buildStrategyDiscoveryEngine({
    asOf: context.asOf,
    research: context.research,
    regimeState: context.core.regime_engine,
    signalFunnel: context.core.signal_funnel_diagnostics,
    strategyGovernance: context.core.strategy_governance,
    walkForward: context.core.walk_forward_validation,
    config: {
      generation: {
        max_candidates: safe(pack.parameters.max_candidates, 20),
        max_hypotheses: safe(pack.parameters.max_hypotheses, 8),
        max_templates_per_hypothesis: safe(pack.parameters.max_templates_per_hypothesis, 4),
        min_feature_overlap: safe(pack.parameters.min_feature_overlap, 99),
        market: pack.parameters.market || 'CRYPTO',
        family: pack.parameters.family || 'Relative Strength / Cross-Sectional',
        risk_profile: context.riskProfileKey,
      },
    },
  });

  const generated = safe(discovery?.candidate_generation?.summary?.total_candidates, 0);
  const failures =
    discovery?.candidate_generation?.summary?.runtime_seed_diagnostics?.mapping_failures || [];
  const checks = [
    check(
      'discovery_engine',
      'starvation_detected',
      generated <= 2,
      generated,
      '<= 2 candidates',
      'Scenario should surface low-density starvation behavior.',
    ),
    check(
      'discovery_engine',
      'starvation_diagnostics_present',
      failures.length > 0,
      failures.length,
      '> 0 mapping failures',
      'Discovery should explain why candidate density collapsed.',
    ),
  ];

  return {
    scenario_id: pack.scenario_id,
    title: pack.title,
    category: pack.category,
    severity: pack.severity,
    checks,
    metrics: {
      generated_candidates: generated,
      mapping_failures: failures.length,
    },
    sensitive_families: discovery?.candidate_diagnostics?.recurring_family_failures || [],
  };
}

function crowdedEvidenceRows(pack) {
  const count = Math.max(4, safe(pack.parameters.crowded_strategy_count, 10));
  const template = pack.parameters.shared_template || 'crowded_momentum_template';
  const asset = pack.parameters.shared_asset || 'SPY';
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      strategy_id: `crowded-${i + 1}`,
      candidate_id: `crowded-cand-${i + 1}`,
      template_id: template,
      audit_chain: { template },
      linked_product_recommendation: { asset },
      validation_summary: {
        candidate_quality_score: 0.66,
        stage_metrics: {
          stage_2_quick_backtest: {
            return: 0.031 - i * 0.0014,
            drawdown: 0.14 + i * 0.003,
            turnover: 0.52 + i * 0.01,
          },
        },
      },
      cost_sensitivity: {
        validation_cost_stress: {
          plus_50pct_cost: 0.012 - i * 0.0007,
        },
      },
      governance_state: {
        current_stage: 'PROD',
        operational_confidence: 0.62,
      },
    });
  }
  return rows;
}

function scenarioCrowding(pack, context) {
  const sim = buildPortfolioSimulationEngine({
    asOf: context.asOf,
    evidenceSystem: {
      strategies: crowdedEvidenceRows(pack),
    },
    regimeState: context.core.regime_engine,
    riskBucketSystem: context.core.risk_bucket_system,
    opportunities: context.core.product_opportunities || [],
    executionRealism: {
      mode: 'paper',
      profile: context.core.walk_forward_validation?.config?.execution_realism_profile || {},
    },
  });

  const diversification = sim?.diagnostics?.diversification_contribution || {};
  const topFamilyExposure = safe(sim?.exposures?.by_strategy_family?.[0]?.exposure, 0);
  const familyCap = safe(sim?.allocation?.crowding_guard?.family_cap, 0.35);
  const trimmedFamilies = safe(sim?.allocation?.crowding_guard?.trimmed_families?.length, 0);
  const checks = [
    check(
      'portfolio_simulation',
      'family_crowding_guard_enforced',
      topFamilyExposure <= familyCap + 0.01,
      {
        top_family_exposure: topFamilyExposure,
        family_cap: familyCap,
        trimmed_families: trimmedFamilies,
      },
      'top_family_exposure <= family_cap + 0.01',
      'Crowding guard should cap family concentration under overloaded same-family strategies.',
    ),
    check(
      'portfolio_simulation',
      'correlation_pressure_visible',
      safe(diversification.avg_pairwise_correlation, 0) >= 0.5,
      diversification.avg_pairwise_correlation,
      '>= 0.5',
      'Even with concentration guard, crowding pressure should still appear in pairwise correlation diagnostics.',
    ),
  ];

  return {
    scenario_id: pack.scenario_id,
    title: pack.title,
    category: pack.category,
    severity: pack.severity,
    checks,
    metrics: {
      top_family_exposure: topFamilyExposure,
      diversification_score: diversification.diversification_score,
      avg_pairwise_correlation: diversification.avg_pairwise_correlation,
    },
    sensitive_families: [],
  };
}

function scenarioDegradedCandidateQuality(pack, context) {
  const baselinePromoted = safe(
    context.core?.strategy_discovery_engine?.summary?.promoted_to_shadow,
    0,
  );

  const discovery = buildStrategyDiscoveryEngine({
    asOf: context.asOf,
    research: context.research,
    regimeState: context.core.regime_engine,
    signalFunnel: context.core.signal_funnel_diagnostics,
    strategyGovernance: context.core.strategy_governance,
    walkForward: context.core.walk_forward_validation,
    config: {
      generation: {
        risk_profile: context.riskProfileKey,
      },
      validation: pack.parameters.validation || {},
    },
  });

  const promoted = safe(discovery?.summary?.promoted_to_shadow, 0);
  const rejected = safe(discovery?.candidate_scoring?.summary?.rejected, 0);
  const total = safe(discovery?.candidate_scoring?.summary?.total_candidates, 1);

  const checks = [
    check(
      'discovery_engine',
      'promotion_rate_reduced_under_quality_degradation',
      promoted <= Math.max(1, Math.floor(baselinePromoted * 0.6)),
      promoted,
      `<= ${Math.max(1, Math.floor(baselinePromoted * 0.6))}`,
      'Stricter quality gates should materially reduce promotions.',
    ),
    check(
      'discovery_engine',
      'rejection_rate_increases_under_quality_stress',
      ratio(rejected, total) >= 0.4,
      ratio(rejected, total),
      '>= 0.4',
      'Degraded candidate quality should be rejected more often.',
    ),
  ];

  return {
    scenario_id: pack.scenario_id,
    title: pack.title,
    category: pack.category,
    severity: pack.severity,
    checks,
    metrics: {
      baseline_promoted: baselinePromoted,
      stressed_promoted: promoted,
      rejection_rate: ratio(rejected, total),
    },
    sensitive_families: discovery?.candidate_diagnostics?.recurring_family_failures || [],
  };
}

function evaluateScenario(pack, context) {
  switch (pack.scenario_id) {
    case 'elevated_volatility':
      return scenarioElevatedVolatility(pack, context);
    case 'risk_off_regime':
      return scenarioRiskOff(pack, context);
    case 'concentrated_exposure':
      return scenarioConcentratedExposure(pack, context);
    case 'high_slippage':
      return scenarioHighSlippage(pack, context);
    case 'poor_fills':
      return scenarioPoorFills(pack, context);
    case 'strategy_starvation':
      return scenarioStrategyStarvation(pack, context);
    case 'strategy_crowding_fake_diversification':
      return scenarioCrowding(pack, context);
    case 'degraded_candidate_quality':
      return scenarioDegradedCandidateQuality(pack, context);
    default:
      return {
        scenario_id: pack.scenario_id,
        title: pack.title,
        category: pack.category,
        severity: pack.severity,
        checks: [
          check(
            'framework',
            'scenario_handler_exists',
            false,
            false,
            true,
            'Scenario id has no registered handler.',
          ),
        ],
        metrics: {},
        sensitive_families: [],
      };
  }
}

function summarizeScenario(row = {}) {
  const checks = row.checks || [];
  const failed = checks.filter((item) => !item.pass);
  const modules = Array.from(new Set(checks.map((item) => item.module)));
  const first = firstFailure(checks);
  const graceful = failed.length <= Math.max(1, Math.floor(checks.length * 0.5));

  return {
    ...row,
    status: failed.length ? 'degraded' : 'resilient',
    failed_count: failed.length,
    passed_count: checks.length - failed.length,
    modules_touched: modules,
    failed_modules: Array.from(new Set(failed.map((item) => item.module))),
    first_failure: first
      ? {
          module: first.module,
          check_id: first.check_id,
          note: first.note,
        }
      : null,
    graceful_degradation: graceful,
  };
}

function aggregateSensitivity(rows = []) {
  const map = new Map();
  for (const row of rows) {
    for (const hit of row.sensitive_families || []) {
      const key = hit.strategy_family || 'unknown';
      const current = map.get(key) || {
        strategy_family: key,
        hit_count: 0,
        scenario_ids: [],
      };
      current.hit_count += safe(hit.hit_count, 1);
      current.scenario_ids.push(row.scenario_id);
      map.set(key, current);
    }
  }
  return Array.from(map.values())
    .map((row) => ({
      ...row,
      scenario_ids: Array.from(new Set(row.scenario_ids)),
    }))
    .sort((a, b) => b.hit_count - a.hit_count)
    .slice(0, 12);
}

function moduleHealth(rows = []) {
  const map = new Map();
  for (const scenario of rows) {
    for (const checkRow of scenario.checks || []) {
      const key = checkRow.module;
      const current = map.get(key) || { module: key, pass: 0, fail: 0 };
      if (checkRow.pass) current.pass += 1;
      else current.fail += 1;
      map.set(key, current);
    }
  }
  return Array.from(map.values())
    .map((row) => ({
      module: row.module,
      pass_count: row.pass,
      fail_count: row.fail,
      pass_rate: row.pass + row.fail ? round(row.pass / (row.pass + row.fail), 4) : 0,
    }))
    .sort((a, b) => a.pass_rate - b.pass_rate);
}

export function runReliabilityStressFramework({
  asOf = '2026-03-08T00:00:00.000Z',
  riskProfileKey = 'balanced',
  scenarioOverrides = {},
} = {}) {
  const packs = loadReliabilityScenarioPacks(scenarioOverrides);
  const context = baselineContext({ asOf, riskProfileKey });
  context.asOf = asOf;
  context.riskProfileKey = riskProfileKey;

  const evaluated = (packs.scenarios || []).map((pack) =>
    summarizeScenario(evaluateScenario(pack, context)),
  );
  const moduleRows = moduleHealth(evaluated);
  const weakest = moduleRows.slice(0, 3);
  const strongest = [...moduleRows].sort((a, b) => b.pass_rate - a.pass_rate).slice(0, 3);
  const failingScenarios = evaluated.filter((row) => row.failed_count > 0);
  const firstFailureChain = failingScenarios.map((row) => ({
    scenario_id: row.scenario_id,
    first_failure: row.first_failure,
  }));
  const gracefulRatio = ratio(
    evaluated.filter((row) => row.graceful_degradation).length,
    evaluated.length || 1,
  );

  return {
    generated_at: asOf,
    framework_version: 'reliability-stress-framework.v1',
    seed_id: packs.seed_id,
    baseline_snapshot: {
      regime: context.core?.regime_engine?.state?.primary || 'unknown',
      posture: context.core?.regime_engine?.state?.recommended_user_posture || 'unknown',
      opportunities: (context.core?.product_opportunities || []).length,
      discovery_candidates: safe(
        context.core?.strategy_discovery_engine?.summary?.generated_candidates,
        0,
      ),
      promoted_candidates: safe(
        context.core?.strategy_discovery_engine?.summary?.promoted_to_shadow,
        0,
      ),
    },
    scenarios: evaluated,
    summary: {
      total_scenarios: evaluated.length,
      degraded_scenarios: failingScenarios.length,
      resilient_scenarios: evaluated.length - failingScenarios.length,
      graceful_degradation_ratio: gracefulRatio,
      first_failure_chain: firstFailureChain,
      weakest_modules: weakest,
      strongest_modules: strongest,
      strategy_family_sensitivity: aggregateSensitivity(evaluated),
    },
  };
}

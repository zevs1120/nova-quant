import { buildNovaQuantSystem } from '../quant/system.js';
import { buildResearchLoop } from '../quant/researchLoop.js';
import { upsertResearchStoreFromLoop } from '../quant/researchStore.js';
import { buildMultiAssetDataTrainingPipeline } from '../research/multiAssetPipeline.js';
import { buildInternalResearchIntelligence } from '../research/governance/internalMonitoring.js';
import { buildGovernanceContractChecks } from '../research/governance/contracts.js';
import { buildResearchCoreUpgrade } from '../research/core/researchCoreUpgrade.js';

function normalizeTrades(trades = []) {
  return [...trades]
    .filter((item) => item && item.symbol)
    .map((item) => ({
      ...item,
      source: item.source || 'PAPER'
    }));
}

export function runQuantPipeline(raw = {}) {
  const nowIso = raw.as_of || raw.generated_at || new Date().toISOString();
  const riskProfileKey = raw.config?.risk_profile || raw.risk_profile || 'balanced';
  const executionTrades = normalizeTrades(raw.trades || []);

  const research = buildResearchLoop({
    endDate: nowIso,
    lookbackDays: 90,
    riskProfileKey
  });
  const multiAsset = buildMultiAssetDataTrainingPipeline({
    asOf: nowIso
  });
  const internalIntelligence = buildInternalResearchIntelligence({
    research,
    multiAsset,
    asOf: nowIso
  });
  const governanceContractChecks = buildGovernanceContractChecks({
    multiAsset,
    research,
    internalIntelligence
  });
  const researchStore = upsertResearchStoreFromLoop(research);
  const researchWithStore = {
    ...research,
    store: researchStore,
    multi_asset: multiAsset,
    internal_intelligence: internalIntelligence,
    weekly_system_review: internalIntelligence.weekly_system_review,
    contract_checks: governanceContractChecks
  };

  const championState =
    researchWithStore?.champion?.current_state ||
    buildNovaQuantSystem({
      asOf: nowIso,
      riskProfileKey,
      executionTrades
    });

  const mergedTrades = [...executionTrades, ...(championState.trades || [])]
    .sort((a, b) => new Date(b.time_out || b.created_at || 0) - new Date(a.time_out || a.created_at || 0))
    .slice(0, 140);
  const championStateWithMergedTrades = {
    ...championState,
    trades: mergedTrades
  };
  const researchCore = buildResearchCoreUpgrade({
    asOf: nowIso,
    riskProfileKey,
    championState: championStateWithMergedTrades,
    research: researchWithStore,
    discoveryConfig: raw.config?.discovery || {}
  });
  const governanceRegistryRows = researchCore?.strategy_governance?.strategy_registry || [];
  const governanceByStrategy = new Map(governanceRegistryRows.map((row) => [row.strategy_id, row]));
  const mergedStrategyRegistry = (researchWithStore?.registry_system?.strategy_registry || []).map((row) => {
    const gov = governanceByStrategy.get(row.strategy_id);
    if (!gov) return row;
    return {
      ...row,
      current_state: gov.current_state,
      evidence_status: gov.evidence_status,
      validation_status: gov.validation_status,
      review_status: gov.review_status,
      next_eligible_action: gov.next_eligible_action,
      next_eligible_state: gov.next_eligible_state,
      unresolved_concern_count: gov.unresolved_concern_count,
      last_review_timestamp: gov.last_review_timestamp
    };
  });
  const researchWithCore = {
    ...researchWithStore,
    registry_system: {
      ...(researchWithStore.registry_system || {}),
      strategy_registry: mergedStrategyRegistry,
      strategy_registry_governance_view: governanceRegistryRows
    },
    research_core: researchCore
  };

  return {
    ...championState,
    trades: mergedTrades,
    research: researchWithCore,
    analytics: {
      ...(championState.analytics || {}),
      research: {
        snapshots: researchWithCore.daily_snapshots.length,
        challengers: researchWithCore.challengers.length,
        experiments: researchWithCore.experiments.length,
        generated_at: researchWithCore.generated_at,
        stored_runs: researchStore?.runs?.length || 0,
        stored_days: researchStore?.daily_snapshots?.length || 0,
        multi_asset: {
          asset_count: multiAsset?.normalized?.asset_registry?.length || 0,
          dataset_count: multiAsset?.derived?.datasets?.length || 0,
          quality_status: multiAsset?.quality_report?.overall_status || '--'
        },
        monitoring: {
          alpha_decaying: internalIntelligence?.alpha_health?.summary?.decaying || 0,
          model_warnings: internalIntelligence?.model_health?.warning_flags || [],
          data_status: internalIntelligence?.data_health?.overall_status || '--'
        },
        governance_contracts: {
          overall_status: governanceContractChecks?.overall_status || '--',
          invalid_objects: governanceContractChecks?.invalid_objects || 0
        },
        research_core: {
          version: researchCore?.version || '--',
          regime: researchCore?.regime_engine?.state?.primary || '--',
          user_posture: researchCore?.regime_engine?.state?.recommended_user_posture || '--',
          regime_confidence: researchCore?.regime_engine?.regime_confidence || 0,
          signal_lifecycle_executable: researchCore?.feature_signal_layer?.quality_summary?.executable_count || 0,
          product_opportunity_count: researchCore?.product_opportunities?.length || 0,
          walk_forward_evaluated: researchCore?.walk_forward_validation?.summary?.evaluated_strategies || 0,
          governance_decisions: researchCore?.strategy_governance?.decisions?.length || 0,
          discovery_generated_candidates: researchCore?.strategy_discovery_engine?.summary?.generated_candidates || 0,
          discovery_promoted_to_shadow: researchCore?.strategy_discovery_engine?.summary?.promoted_to_shadow || 0,
          evidence_records: researchCore?.research_evidence_system?.summary?.total_evidence_records || 0,
          evidence_quality: researchCore?.research_evidence_system?.summary?.average_evidence_quality_score || 0,
          portfolio_sim_sharpe: researchCore?.portfolio_simulation_engine?.metrics?.sharpe || 0,
          portfolio_sim_drawdown: researchCore?.portfolio_simulation_engine?.metrics?.drawdown || 0,
          copilot_insights: researchCore?.ai_research_copilot?.research_insights?.length || 0,
          weekly_recommendations: researchCore?.weekly_research_cycle?.research_recommendations?.length || 0,
          automation_alerts: researchCore?.research_automation_loop?.deterioration_alerts?.length || 0,
          funnel_bottleneck: researchCore?.signal_funnel_diagnostics?.bottleneck?.stage || '--',
          shadow_records: researchCore?.shadow_opportunity_log?.total_records || 0
        }
      }
    }
  };
}

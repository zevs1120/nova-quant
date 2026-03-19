import { buildStrategyFamilyRegistry } from './strategyFamilies.js';
import { buildRegimeEngineState } from './regimeEngineV2.js';
import { buildRiskBucketSystem } from './riskBucketSystem.js';
import { buildSignalFunnelDiagnosticsV2 } from './signalFunnelDiagnosticsV2.js';
import { buildShadowOpportunityLog } from './shadowOpportunityLog.js';
import { buildWalkForwardValidation } from './walkForwardValidation.js';
import { buildStrategyGovernanceLifecycle } from './strategyGovernanceV2.js';
import { buildFeatureSignalLayer } from './featureSignalLayer.js';
import { buildResearchAutomationLoop } from './researchAutomationLoop.js';
import { buildStrategyDiscoveryEngine } from '../discovery/strategyDiscoveryEngine.js';
import { buildResearchEvidenceSystem } from '../evidence/evidenceSystem.js';
import { buildPortfolioSimulationEngine } from '../../portfolio_simulation/portfolioSimulationEngine.js';
import { buildAiResearchCopilot } from '../copilot/aiResearchCopilot.js';
import { buildWeeklyResearchCycle } from '../weekly_cycle/weeklyResearchCycle.js';
import { buildExecutionDriftMonitor } from '../validation/executionDriftMonitor.js';

export function buildResearchCoreUpgrade({
  asOf = new Date().toISOString(),
  riskProfileKey = 'balanced',
  championState = {},
  research = {},
  discoveryConfig = {}
} = {}) {
  const signals = championState?.signals || [];
  const trades = championState?.trades || [];
  const strategyRegistry = research?.registry_system?.strategy_registry || [];
  const universeSize = championState?.layers?.data_layer?.instruments?.length || signals.length;

  const strategyFamilies = buildStrategyFamilyRegistry({
    asOf,
    strategyRegistry
  });

  const regimeEngine = buildRegimeEngineState({
    asOf,
    championState,
    strategyFamilyRegistry: strategyFamilies,
    historicalSnapshots: research?.daily_snapshots || [],
    signals
  });

  const riskBuckets = buildRiskBucketSystem({
    asOf,
    riskProfileKey,
    championState,
    regimeState: regimeEngine,
    signals,
    trades
  });

  const signalFunnel = buildSignalFunnelDiagnosticsV2({
    asOf,
    signals,
    trades,
    tradeLevelBuckets: riskBuckets.trade_level_buckets,
    regimeState: regimeEngine,
    universeSize
  });
  const featureSignalLayer = buildFeatureSignalLayer({
    asOf,
    championState,
    regimeState: regimeEngine,
    riskBuckets,
    funnelDiagnostics: signalFunnel
  });

  const walkForward = buildWalkForwardValidation({
    asOf,
    research,
    championState,
    regimeState: regimeEngine,
    riskBucketSystem: riskBuckets,
    funnelDiagnostics: signalFunnel
  });

  const shadowLog = buildShadowOpportunityLog({
    asOf,
    funnelRecords: signalFunnel.raw_records,
    signals,
    tradeLevelBuckets: riskBuckets.trade_level_buckets,
    replayValidation: walkForward?.replay_validation
  });
  const executionDriftMonitor = buildExecutionDriftMonitor({
    asOf,
    replayValidation: walkForward?.replay_validation,
    trades,
    signals
  });

  const strategyGovernance = buildStrategyGovernanceLifecycle({
    asOf,
    research,
    walkforward: walkForward,
    funnelDiagnostics: signalFunnel,
    signals,
    executionDrift: executionDriftMonitor
  });
  const discoveryConfigWithDefaults = {
    ...(discoveryConfig || {}),
    generation: {
      ...((discoveryConfig || {}).generation || {}),
      risk_profile:
        (discoveryConfig || {}).generation?.risk_profile ||
        (discoveryConfig || {}).risk_profile ||
        riskProfileKey
    }
  };
  const strategyDiscovery = buildStrategyDiscoveryEngine({
    asOf,
    research,
    regimeState: regimeEngine,
    signalFunnel,
    strategyGovernance,
    walkForward,
    config: discoveryConfigWithDefaults
  });
  const researchEvidence = buildResearchEvidenceSystem({
    asOf,
    strategyDiscovery,
    strategyGovernance,
    walkForward,
    regimeState: regimeEngine,
    productOpportunities: featureSignalLayer.opportunity_objects
  });
  const portfolioSimulation = buildPortfolioSimulationEngine({
    asOf,
    evidenceSystem: researchEvidence,
    regimeState: regimeEngine,
    riskBucketSystem: riskBuckets,
    opportunities: featureSignalLayer.opportunity_objects,
    executionDrift: executionDriftMonitor,
    executionRealism: {
      mode: 'paper',
      profile: walkForward?.config?.execution_realism_profile || {}
    }
  });
  const aiResearchCopilot = buildAiResearchCopilot({
    asOf,
    funnelDiagnostics: signalFunnel,
    shadowLog,
    walkForward,
    strategyGovernance,
    regimeState: regimeEngine,
    strategyDiscovery,
    portfolioSimulation
  });
  const weeklyCycle = buildWeeklyResearchCycle({
    asOf,
    regimeState: regimeEngine,
    signalFunnel,
    shadowLog,
    strategyGovernance,
    strategyDiscovery,
    walkForward,
    aiResearchCopilot,
    portfolioSimulation
  });
  const researchAutomation = buildResearchAutomationLoop({
    asOf,
    regimeState: regimeEngine,
    funnelDiagnostics: signalFunnel,
    shadowLog,
    strategyGovernance,
    walkForward,
    strategyDiscovery,
    aiResearchCopilot,
    weeklyCycle
  });

  return {
    generated_at: asOf,
    version: 'research-core.v2',
    component_status: {
      strategy_families: 'MODEL_DERIVED',
      regime_engine: 'MODEL_DERIVED',
      feature_signal_layer: 'MODEL_DERIVED',
      risk_bucket_system: 'MODEL_DERIVED',
      signal_funnel_diagnostics: 'MODEL_DERIVED',
      shadow_opportunity_log: 'EXPERIMENTAL',
      walk_forward_validation: 'EXPERIMENTAL',
      execution_drift_monitor: 'MODEL_DERIVED',
      strategy_governance: 'MODEL_DERIVED',
      strategy_discovery_engine: 'MODEL_DERIVED',
      research_evidence_system: 'MODEL_DERIVED',
      portfolio_simulation_engine: 'EXPERIMENTAL',
      ai_research_copilot: 'MODEL_DERIVED',
      weekly_research_cycle: 'MODEL_DERIVED',
      research_automation_loop: 'MODEL_DERIVED',
      product_opportunity_objects: 'MODEL_DERIVED',
      data_feed: 'MODEL_DERIVED'
    },
    strategy_families: strategyFamilies,
    regime_engine: regimeEngine,
    feature_signal_layer: featureSignalLayer,
    risk_bucket_system: riskBuckets,
    signal_funnel_diagnostics: signalFunnel,
    shadow_opportunity_log: shadowLog,
    walk_forward_validation: walkForward,
    execution_drift_monitor: executionDriftMonitor,
    strategy_governance: strategyGovernance,
    strategy_discovery_engine: strategyDiscovery,
    research_evidence_system: researchEvidence,
    portfolio_simulation_engine: portfolioSimulation,
    ai_research_copilot: aiResearchCopilot,
    weekly_research_cycle: weeklyCycle,
    research_automation_loop: researchAutomation,
    product_opportunities: featureSignalLayer.opportunity_objects,
    explainability_log: {
      signal_reasoning: 'Signals are scored, filtered, and sized with explicit regime and risk explanations.',
      filter_reasoning: 'No-trade and drop-off reasons are persisted in funnel and shadow records.',
      trade_block_reasoning: 'Each trade bucket carries allow/reduce/block rationale.',
      risk_sizing_reasoning: 'Position sizing is reduced by user risk bucket and regime posture multipliers.',
      product_object_lineage: 'Opportunity objects include audit lineage and evidence fields for product and Copilot.',
      evidence_chain: 'Each strategy and candidate is linked via hypothesis -> template -> validation -> governance -> recommendation.',
      portfolio_simulation: 'Portfolio behavior is simulated with regime-aware, risk-budgeted and correlation-aware allocations.',
      copilot_reasoning: 'AI copilot recommendations are derived from funnel, shadow, validation, governance, and portfolio diagnostics.'
    }
  };
}

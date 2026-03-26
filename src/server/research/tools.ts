import { getDb } from '../db/database.js';
import { ensureSchema } from '../db/schema.js';
import { MarketRepository } from '../db/repository.js';
import {
  getMarketState,
  getRuntimeState,
  getSignalContract,
  listSignalContracts,
} from '../api/queries.js';
import {
  getBacktestEvidenceDetail,
  getChampionStrategies,
  listBacktestEvidence,
} from '../evidence/engine.js';
import { RUNTIME_STATUS, normalizeRuntimeStatus } from '../runtimeStatus.js';
import type { AssetClass, Market, SignalContract } from '../types.js';
import {
  getFactorDefinition,
  getFactorInteractions,
  getResearchDoctrineProfile,
  listCrossSectionalModelCatalog,
  listFailedIdeasRegistry,
  listFactorCatalog,
  listRegimeTaxonomy,
  listResearchDoctrinePrinciples,
  listStrategyMetadata,
  summarizeTopicHits,
  type FactorCard,
} from './knowledge.js';
import {
  buildExperimentRegistryView,
  buildFactorResearchSnapshot,
  buildResearchWorkflowPlan,
  listResearchMemory,
  buildStrategyEvaluationReport,
  buildValidationReport,
} from './evaluation.js';
import { buildFactorMeasurementReport } from './factorMeasurements.js';
import { buildPublicAlphaSupplyReport } from './publicAlphaSupply.js';

type ResearchToolArgs = {
  userId?: string;
  signalId?: string;
  symbol?: string;
  factorId?: string;
  topic?: string;
  market?: Market;
  assetClass?: AssetClass;
  runId?: string;
};

function getRepo() {
  const db = getDb();
  ensureSchema(db);
  return new MarketRepository(db);
}

function first<T>(rows: T[]): T | null {
  return rows[0] || null;
}

function pickSignal(args: ResearchToolArgs): SignalContract | null {
  if (args.signalId && args.userId) {
    return getSignalContract(args.signalId, args.userId);
  }
  const rows = listSignalContracts({
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass,
    status: 'ALL',
    limit: 30,
  });
  if (args.symbol) {
    return (
      rows.find((row) => String(row.symbol).toUpperCase() === String(args.symbol).toUpperCase()) ||
      null
    );
  }
  return (
    rows.find((row) => ['NEW', 'TRIGGERED'].includes(String(row.status).toUpperCase())) ||
    rows[0] ||
    null
  );
}

function factorIdsFromSignal(signal: SignalContract | null): string[] {
  if (!signal) return [];
  const tags = Array.isArray(signal.tags) ? signal.tags.map((row) => String(row)) : [];
  const explicit = tags
    .filter((tag) => tag.startsWith('factor:'))
    .map((tag) => tag.replace('factor:', '').toLowerCase())
    .map((value) => {
      if (value.includes('trend') || value.includes('momentum')) return 'momentum';
      if (value.includes('reversal') || value.includes('mean')) return 'reversal';
      if (value.includes('vol')) return 'low_vol';
      if (value.includes('breadth')) return 'breadth';
      return value;
    });

  const family = String(signal.strategy_family || '').toLowerCase();
  const inferred = [];
  if (family.includes('momentum') || family.includes('trend')) inferred.push('momentum');
  if (family.includes('mean')) inferred.push('reversal');
  if (family.includes('relative')) inferred.push('breadth');
  if (family.includes('crypto')) inferred.push('carry');
  return [...new Set([...explicit, ...inferred])];
}

function supportingAndOpposing(signal: SignalContract | null, regimeTag: string | null) {
  const factorIds = factorIdsFromSignal(signal);
  const supporting = factorIds.map((id) => getFactorDefinition(id)).filter(Boolean) as FactorCard[];
  const opposingIds = supporting.flatMap((row) => row.interactions.conflicts);
  return {
    supporting,
    opposing: [...new Set(opposingIds)]
      .map((id) => getFactorDefinition(id))
      .filter(Boolean) as FactorCard[],
    regimeTag,
  };
}

function currentRegimeSummary(args: ResearchToolArgs) {
  const market = args.market || (args.assetClass === 'CRYPTO' ? 'CRYPTO' : 'US');
  const state = getRuntimeState({
    userId: args.userId || 'guest-default',
    market,
    assetClass: args.assetClass,
  });
  const marketRows = getMarketState({
    userId: args.userId || 'guest-default',
    market,
    symbol: args.symbol,
  });
  const firstRow = first(marketRows);
  const firstRowObject = (firstRow || {}) as Record<string, unknown>;
  const stateInsights = ((state?.data?.insights as Record<string, unknown> | undefined) ||
    {}) as Record<string, unknown>;
  const stateRegime = ((stateInsights.regime as Record<string, unknown> | undefined) ||
    {}) as Record<string, unknown>;
  const stateSafety = ((state?.data?.safety as Record<string, unknown> | undefined) ||
    {}) as Record<string, unknown>;
  return {
    runtime: state,
    regime_id: String(
      firstRowObject.regime_id || stateRegime.tag || RUNTIME_STATUS.INSUFFICIENT_DATA,
    ),
    stance: String(firstRowObject.stance || stateSafety.conclusion || ''),
    rows: marketRows,
  };
}

function latestBacktestDetail(runId?: string) {
  const repo = getRepo();
  const run = runId ? repo.getBacktestRun(runId) : repo.listBacktestRuns({ limit: 1 })[0];
  if (!run) {
    return {
      source_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      data_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      detail: null,
    };
  }
  return getBacktestEvidenceDetail(repo, run.id);
}

function artifactMap(detail: ReturnType<typeof latestBacktestDetail>['detail']) {
  const entries = (detail?.artifacts || []).map((row): [string, unknown] => [
    row.artifact_type,
    row.payload,
  ]);
  return new Map(entries);
}

export function getFactorCatalogTool() {
  return {
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: RUNTIME_STATUS.MODEL_DERIVED,
    records: listFactorCatalog(),
  };
}

export function getPublicAlphaSupplyTool(args: ResearchToolArgs = {}) {
  return buildPublicAlphaSupplyReport({
    market: args.market,
    assetClass: args.assetClass,
  });
}

export function getResearchDoctrineTool() {
  return {
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: RUNTIME_STATUS.MODEL_DERIVED,
    doctrine: getResearchDoctrineProfile(),
  };
}

export function getFactorDefinitionTool(factorId?: string) {
  const factor = factorId ? getFactorDefinition(factorId) : null;
  return {
    source_status: factor ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    data_status: factor ? RUNTIME_STATUS.MODEL_DERIVED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    factor,
  };
}

export function getFactorInteractionsTool(factorId?: string) {
  const interactions = factorId ? getFactorInteractions(factorId) : null;
  return {
    source_status: interactions ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    data_status: interactions ? RUNTIME_STATUS.MODEL_DERIVED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    interactions,
  };
}

export function getStrategyRegistryTool() {
  return {
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: RUNTIME_STATUS.MODEL_DERIVED,
    records: listStrategyMetadata(),
    champions: getChampionStrategies(getRepo()),
  };
}

export function getRegimeTaxonomyTool() {
  return {
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: RUNTIME_STATUS.MODEL_DERIVED,
    records: listRegimeTaxonomy(),
  };
}

export function getRegimeDiagnosticsTool(args: ResearchToolArgs) {
  const summary = currentRegimeSummary(args);
  const counts = summary.rows.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.regime_id || 'UNKNOWN');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const coverage = Object.entries(counts)
    .map(([regime, count]) => ({ regime, count }))
    .sort((a, b) => b.count - a.count);

  return {
    source_status: normalizeRuntimeStatus(
      summary.runtime?.source_status,
      RUNTIME_STATUS.INSUFFICIENT_DATA,
    ),
    data_status: summary.rows.length
      ? RUNTIME_STATUS.MODEL_DERIVED
      : RUNTIME_STATUS.INSUFFICIENT_DATA,
    diagnostics: {
      current_regime: summary.regime_id,
      current_stance: summary.stance,
      regime_label_coverage: coverage,
      transition_frequency_proxy: Math.max(0, coverage.length - 1),
      regime_confidence: summary.rows[0]
        ? Number(summary.rows[0].trend_strength || summary.rows[0].risk_off_score || 0).toFixed(2)
        : null,
      notes: summary.rows.length
        ? ['Current diagnostics are derived from market_state rows and runtime state.']
        : ['No market_state rows available; regime diagnostics are insufficient.'],
    },
  };
}

export function runFactorDiagnosticsTool(args: ResearchToolArgs) {
  const signal = pickSignal(args);
  const signalRow = signal as (SignalContract & Record<string, unknown>) | null;
  const regime = currentRegimeSummary(args);
  const factorBreakdown = supportingAndOpposing(signal, regime.regime_id);

  if (!signal) {
    return {
      source_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      data_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      diagnostics: {
        thesis: 'No active signal is available for factor diagnostics.',
        supporting_factors: [],
        opposing_factors: [],
        regime_context: regime.regime_id,
        confidence: null,
        uncertainty: 'No signal candidate passed selection.',
        next_action: 'Wait for the next signal or ask for a regime-level review.',
      },
    };
  }

  return {
    source_status: normalizeRuntimeStatus(
      String(signalRow?.source_status || ''),
      RUNTIME_STATUS.DB_BACKED,
    ),
    data_status: normalizeRuntimeStatus(
      String(signalRow?.data_status || ''),
      RUNTIME_STATUS.MODEL_DERIVED,
    ),
    diagnostics: {
      signal_id: signal.id,
      symbol: signal.symbol,
      thesis: String(
        signalRow?.thesis ||
          signal.strategy_id ||
          signal.strategy_family ||
          'Signal exists because it cleared the current selection rules.',
      ),
      supporting_factors: factorBreakdown.supporting.map((row) => ({
        factor_id: row.factor_id,
        title: row.title,
        why_it_supports: row.definition,
      })),
      opposing_factors: factorBreakdown.opposing.map((row) => ({
        factor_id: row.factor_id,
        title: row.title,
        why_it_pushes_back: row.failure_modes[0] || row.definition,
      })),
      regime_context: regime.regime_id,
      data_quality: normalizeRuntimeStatus(
        String(signalRow?.data_status || ''),
        RUNTIME_STATUS.MODEL_DERIVED,
      ),
      confidence: Number(signal.confidence || 0),
      uncertainty:
        factorBreakdown.opposing.length > 0
          ? 'Supporting and opposing factors both exist, so confidence should not be treated as certainty.'
          : 'No strong opposing factor was detected from current signal metadata.',
      implementation_caveats: [
        `Position guidance ${signal.position_advice?.position_pct ?? '--'}%.`,
        `Strategy family ${signal.strategy_family}.`,
      ],
      next_action:
        'Validate the setup with replay/paper evidence before treating it as a production-quality edge.',
    },
  };
}

function familiesForFactor(factorId?: string) {
  const key = String(factorId || '').toLowerCase();
  if (key === 'momentum') return ['Momentum / Trend', 'Relative Strength'];
  if (key === 'reversal') return ['Mean Reversion'];
  if (key === 'carry') return ['Crypto-Specific', 'Momentum / Trend'];
  if (key === 'low_vol' || key === 'quality' || key === 'value')
    return ['Relative Strength', 'Regime Transition'];
  if (key === 'breadth') return ['Relative Strength', 'Momentum / Trend'];
  return [];
}

export function compareFactorPerformanceByRegimeTool(args: ResearchToolArgs) {
  const factor = args.factorId ? getFactorDefinition(args.factorId) : null;
  const regime = currentRegimeSummary(args);
  const detailWrap = latestBacktestDetail(args.runId);
  const details = detailWrap.detail;
  const artifacts = artifactMap(details);
  const attributionByRegime = artifacts.get('attribution') as Record<string, unknown> | undefined;
  const byRegime = Array.isArray(attributionByRegime?.by_regime)
    ? (attributionByRegime.by_regime as Array<Record<string, unknown>>)
    : [];
  const relevantFamilies = familiesForFactor(args.factorId);
  const measured = args.factorId
    ? buildFactorMeasurementReport(getRepo(), {
        factorId: args.factorId,
        market: args.market,
        assetClass: args.assetClass,
      })
    : null;

  return {
    source_status: factor ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    data_status: factor
      ? byRegime.length || measured?.report?.availability === 'measured'
        ? RUNTIME_STATUS.MODEL_DERIVED
        : RUNTIME_STATUS.INSUFFICIENT_DATA
      : RUNTIME_STATUS.INSUFFICIENT_DATA,
    comparison: {
      factor: factor || null,
      current_regime: regime.regime_id,
      expected_regime_fit: factor
        ? {
            favorable: factor.interactions.supports,
            fragile_when: factor.failure_modes,
          }
        : null,
      relevant_strategy_families: relevantFamilies,
      observed_regime_attribution: byRegime.slice(0, 8),
      measured_regime_diagnostics: measured?.report?.regime_conditioned_metrics || [],
      note: byRegime.length
        ? 'Observed regime attribution comes from the latest backtest artifact and should be interpreted as strategy-level evidence, not pure factor truth.'
        : measured?.report?.availability === 'measured'
          ? 'Measured regime diagnostics come from current OHLCV-based factor evaluation. Treat them as research evidence, not deployable truth.'
          : 'Pure factor-level regime performance history is not persisted yet; returning taxonomy-guided expectations only.',
    },
  };
}

export function getBacktestIntegrityReportTool(args: ResearchToolArgs) {
  const wrap = latestBacktestDetail(args.runId);
  const detail = wrap.detail;
  const metric = detail?.metrics;
  if (!detail || !metric) {
    return {
      source_status: wrap.source_status,
      data_status: wrap.data_status,
      report: null,
    };
  }

  const flags = [];
  if (metric.status === 'WITHHELD') flags.push('withheld_due_to_sample');
  if ((metric.sample_size || 0) < 20) flags.push('low_sample');
  if ((metric.turnover || 0) > 35) flags.push('turnover_heavy');
  if ((metric.cost_drag || 0) > 0.03) flags.push('cost_drag_material');
  if ((metric.sharpe || 0) > 3 && (metric.sample_size || 0) < 25)
    flags.push('possible_overfit_proxy');

  return {
    source_status: wrap.source_status,
    data_status: wrap.data_status,
    report: {
      run_id: detail.run.id,
      run_type: detail.run.run_type,
      sample_size: metric.sample_size,
      realism_grade: metric.realism_grade,
      robustness_grade: metric.robustness_grade,
      withheld_reason: metric.withheld_reason,
      flags,
      verdict:
        flags.length === 0
          ? 'Integrity looks acceptable for deeper review.'
          : 'Integrity needs caution before promotion or heavier use.',
      next_action:
        flags.includes('possible_overfit_proxy') || flags.includes('low_sample')
          ? 'Run additional walk-forward or wider replay windows before trusting this result.'
          : 'Proceed to replay/paper comparison and portfolio-fit review.',
    },
  };
}

export function getStrategyEvaluationReportTool(args: ResearchToolArgs) {
  return buildStrategyEvaluationReport(getRepo(), {
    runId: args.runId,
    market: args.market,
    assetClass: args.assetClass,
  });
}

export function getValidationReportTool(args: ResearchToolArgs) {
  return buildValidationReport(getRepo(), {
    runId: args.runId,
    market: args.market,
    assetClass: args.assetClass,
  });
}

export function getTurnoverCostReportTool(args: ResearchToolArgs) {
  const wrap = latestBacktestDetail(args.runId);
  const detail = wrap.detail;
  const metric = detail?.metrics;
  if (!detail || !metric) {
    return {
      source_status: wrap.source_status,
      data_status: wrap.data_status,
      report: null,
    };
  }
  return {
    source_status: wrap.source_status,
    data_status: wrap.data_status,
    report: {
      run_id: detail.run.id,
      turnover: metric.turnover,
      cost_drag: metric.cost_drag,
      sample_size: metric.sample_size,
      implementation_assessment:
        (metric.turnover || 0) > 35 || (metric.cost_drag || 0) > 0.03
          ? 'Implementation sensitivity is elevated; costs can easily erase edge.'
          : 'Turnover and cost drag look manageable under current assumptions.',
      next_action:
        (metric.turnover || 0) > 35
          ? 'Reduce churn or strengthen filters before scaling.'
          : 'Re-test under harsher spread/slippage assumptions.',
    },
  };
}

export function getExperimentRegistryTool() {
  return buildExperimentRegistryView(getRepo());
}

export function getResearchWorkflowPlanTool(args: ResearchToolArgs) {
  return buildResearchWorkflowPlan({
    topic: args.topic,
    factorId: args.factorId,
    market: args.market,
    assetClass: args.assetClass,
  });
}

export function getFactorMeasuredReportTool(args: ResearchToolArgs) {
  return buildFactorMeasurementReport(getRepo(), {
    factorId: args.factorId,
    market: args.market,
    assetClass: args.assetClass,
  });
}

export function getFactorResearchSnapshotTool(args: ResearchToolArgs) {
  return buildFactorResearchSnapshot(getRepo(), {
    runId: args.runId,
    factorId: args.factorId,
    market: args.market,
    assetClass: args.assetClass,
  });
}

export function getSignalEvidenceTool(args: ResearchToolArgs) {
  return runFactorDiagnosticsTool(args);
}

export function explainWhySignalExistsTool(args: ResearchToolArgs) {
  const result = runFactorDiagnosticsTool(args);
  return {
    ...result,
    explanation: result.diagnostics
      ? {
          thesis: result.diagnostics.thesis,
          supporting_factors: result.diagnostics.supporting_factors,
          opposing_factors: result.diagnostics.opposing_factors,
          regime_context: result.diagnostics.regime_context,
          next_action: result.diagnostics.next_action,
        }
      : null,
  };
}

export function explainWhyNoSignalTool(args: ResearchToolArgs) {
  const rows = listSignalContracts({
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass,
    status: 'ALL',
    limit: 20,
  });
  const active = rows.filter((row) =>
    ['NEW', 'TRIGGERED'].includes(String(row.status).toUpperCase()),
  );
  const regime = currentRegimeSummary(args);
  if (active.length) {
    return {
      source_status: RUNTIME_STATUS.DB_BACKED,
      data_status: RUNTIME_STATUS.MODEL_DERIVED,
      explanation: {
        reason: 'There are active signals, so the system is not currently in a no-signal state.',
        current_regime: regime.regime_id,
        candidate_count: active.length,
      },
    };
  }
  return {
    source_status: normalizeRuntimeStatus(
      regime.runtime?.source_status,
      RUNTIME_STATUS.INSUFFICIENT_DATA,
    ),
    data_status: RUNTIME_STATUS.MODEL_DERIVED,
    explanation: {
      reason:
        'No candidate cleared the current combination of signal quality, regime fit, and risk constraints.',
      current_regime: regime.regime_id,
      likely_filters: ['quality threshold', 'regime mismatch', 'risk posture'],
      next_action:
        'Inspect signal funnel diagnostics or loosen constraints only after evidence review.',
    },
  };
}

export function listFailedExperimentsTool() {
  const repo = getRepo();
  const recent = listBacktestEvidence(repo, { limit: 20 });
  const records = (recent.records || [])
    .filter((row: Record<string, unknown>) => {
      const metrics = row.metrics as Record<string, unknown> | undefined;
      return metrics?.status === 'WITHHELD' || Number(metrics?.net_return || 0) < 0;
    })
    .slice(0, 8)
    .map((row: Record<string, unknown>, index: number) => ({
      failed_id: `recent-failed-${index + 1}`,
      title: String(
        (row.strategy as Record<string, unknown> | undefined)?.strategy_key ||
          row.run_type ||
          'unknown_run',
      ),
      domain: 'backtest',
      likely_causes: [
        Number((row.metrics as Record<string, unknown> | undefined)?.net_return || 0) < 0
          ? 'negative_cost_adjusted_return'
          : 'withheld_result',
        Number((row.metrics as Record<string, unknown> | undefined)?.turnover || 0) > 35
          ? 'high_turnover'
          : 'sample_or_quality_constraint',
      ],
      recommended_actions: ['revisit assumptions', 'inspect realism and overfitting diagnostics'],
      source: 'backtest_registry',
    }));

  return {
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: RUNTIME_STATUS.MODEL_DERIVED,
    records: records.length ? records : listFailedIdeasRegistry(),
  };
}

export function summarizeResearchOnTopicTool(args: ResearchToolArgs) {
  const topic = String(args.topic || '').trim();
  const hits = summarizeTopicHits(topic);
  return {
    source_status: topic ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    data_status: topic ? RUNTIME_STATUS.MODEL_DERIVED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    summary: {
      topic,
      factors: hits.factors.slice(0, 4),
      regimes: hits.regimes.slice(0, 4),
      strategies: hits.strategies.slice(0, 3),
      models: hits.models.slice(0, 3),
      failed_ideas: hits.failed_ideas.slice(0, 3),
      doctrine: listResearchDoctrinePrinciples().slice(0, 5),
      cross_sectional_models: listCrossSectionalModelCatalog().slice(0, 4),
      workflow_hint: buildResearchWorkflowPlan({ topic }).workflow,
    },
  };
}

export function getResearchMemoryTool() {
  return listResearchMemory(getRepo());
}

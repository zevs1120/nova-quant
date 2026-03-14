import type { AssetClass, Market } from '../types.js';
import {
  getMarketState,
  getPerformanceSummary as getPerformanceSummaryQuery,
  getRiskProfile as getRiskProfileQuery,
  getRuntimeState,
  getSignalContract,
  listSignalContracts
} from '../api/queries.js';
import { RUNTIME_STATUS } from '../runtimeStatus.js';
import type { ChatContextInput, ToolContextBundle } from './types.js';
import { answerWithRetrieval } from '../../quant/aiRetrieval.js';
import {
  compareFactorPerformanceByRegimeTool,
  explainWhyNoSignalTool,
  explainWhySignalExistsTool,
  getBacktestIntegrityReportTool,
  getResearchDoctrineTool,
  getExperimentRegistryTool,
  getFactorCatalogTool,
  getFactorDefinitionTool,
  getFactorInteractionsTool,
  getFactorResearchSnapshotTool,
  getRegimeDiagnosticsTool,
  getRegimeTaxonomyTool,
  getResearchMemoryTool,
  getResearchWorkflowPlanTool,
  getStrategyEvaluationReportTool,
  getSignalEvidenceTool,
  getStrategyRegistryTool,
  getTurnoverCostReportTool,
  getValidationReportTool,
  listFailedExperimentsTool,
  runFactorDiagnosticsTool,
  summarizeResearchOnTopicTool
} from '../research/tools.js';

function inferAssetClass(context?: ChatContextInput): AssetClass | undefined {
  if (!context?.assetClass) return undefined;
  const value = String(context.assetClass).toUpperCase();
  if (value === 'OPTIONS' || value === 'US_STOCK' || value === 'CRYPTO') {
    return value as AssetClass;
  }
  return undefined;
}

function inferMarket(context?: ChatContextInput): Market | undefined {
  if (context?.market === 'US' || context?.market === 'CRYPTO') return context.market;
  if (context?.assetClass === 'CRYPTO') return 'CRYPTO';
  if (context?.assetClass === 'US_STOCK' || context?.assetClass === 'OPTIONS') return 'US';
  return undefined;
}

function normalizeDataStatus(row: Record<string, unknown> | null | undefined): string {
  return String(
    row?.data_status ||
      row?.source_label ||
      row?.source_status ||
      (row?.source_transparency as Record<string, unknown> | undefined)?.data_status ||
      RUNTIME_STATUS.INSUFFICIENT_DATA
  ).toUpperCase();
}

function isActionableSignal(row: Record<string, unknown>): boolean {
  const status = String(row.status || '').toUpperCase();
  const dataStatus = normalizeDataStatus(row);
  return ['NEW', 'TRIGGERED'].includes(status) && !['WITHHELD', 'INSUFFICIENT_DATA'].includes(dataStatus);
}

function scoreSignalForContext(row: Record<string, unknown>, context?: ChatContextInput): number {
  const confidence = Number(row.confidence ?? row.conviction ?? 0);
  const score = Number(row.score ?? confidence * 100);
  const symbol = String(row.symbol || '').toUpperCase();
  const targetSymbol = String(context?.symbol || '').toUpperCase();
  const dataPenalty = normalizeDataStatus(row) === RUNTIME_STATUS.DB_BACKED ? 0 : 10;
  const actionBonus = isActionableSignal(row) ? 12 : 0;
  const symbolBonus = targetSymbol && symbol === targetSymbol ? 30 : 0;
  return score + confidence * 20 + actionBonus + symbolBonus - dataPenalty;
}

function pickRelevantSignals(rows: unknown[], context?: ChatContextInput): Record<string, unknown>[] {
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .sort((a, b) => scoreSignalForContext(b, context) - scoreSignalForContext(a, context))
    .slice(0, 5);
}

function inferResearchTopic(message = ''): string | null {
  const lower = String(message || '').toLowerCase();
  const candidates = [
    'value',
    'momentum',
    'quality',
    'carry',
    'low vol',
    'reversal',
    'breadth',
    'regime',
    'overfitting',
    'turnover',
    'portfolio',
    'cross sectional',
    'factor',
    'strategy'
  ];
  return candidates.find((item) => lower.includes(item)) || null;
}

function inferFactorId(message = ''): string | undefined {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('value')) return 'value';
  if (lower.includes('momentum')) return 'momentum';
  if (lower.includes('quality')) return 'quality';
  if (lower.includes('carry')) return 'carry';
  if (lower.includes('low vol') || lower.includes('low-vol') || lower.includes('defensive')) return 'low_vol';
  if (lower.includes('reversal') || lower.includes('mean reversion')) return 'reversal';
  if (lower.includes('breadth')) return 'breadth';
  if (lower.includes('seasonality')) return 'seasonality';
  if (lower.includes('liquidity')) return 'liquidity';
  return undefined;
}

function shouldEnterResearchMode(message = ''): boolean {
  const lower = String(message || '').toLowerCase();
  return [
    'factor',
    'strategy',
    'regime',
    'backtest',
    'experiment',
    'validation',
    'workflow',
    'overfit',
    'overfitting',
    'turnover',
    'cost',
    'capacity',
    'portfolio construction',
    'cross-sectional',
    'cross sectional',
    'ic',
    'rank ic',
    'research',
    'why no signal',
    'failed experiment'
  ].some((token) => lower.includes(token));
}

async function buildResearchToolResults(args: {
  userId: string;
  context?: ChatContextInput;
  message?: string;
}): Promise<ToolContextBundle['researchContext']> {
  const message = String(args.message || '');
  if (!shouldEnterResearchMode(message)) {
    return {
      research_mode: false,
      selected_tools: [],
      tool_results: []
    };
  }

  const factorId = inferFactorId(message);
  const topic = inferResearchTopic(message) || message;
  const selectedTools: string[] = [];
  const toolResults: ToolContextBundle['researchContext']['tool_results'] = [];

  const push = (tool: string, result: Record<string, unknown>) => {
    selectedTools.push(tool);
    toolResults.push({
      tool,
      source_status: String(result.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
      data_status: String(result.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
      payload: result
    });
  };

  push('summarize_research_on_topic', summarizeResearchOnTopicTool({ topic }));
  push('get_research_doctrine', getResearchDoctrineTool());
  push('get_strategy_registry', getStrategyRegistryTool());
  push('get_regime_taxonomy', getRegimeTaxonomyTool());
  push('get_regime_diagnostics', getRegimeDiagnosticsTool({
    userId: args.userId,
    market: inferMarket(args.context),
    assetClass: inferAssetClass(args.context),
    symbol: args.context?.symbol
  }));
  push('get_backtest_integrity_report', getBacktestIntegrityReportTool({ runId: undefined }));
  push('get_strategy_evaluation_report', getStrategyEvaluationReportTool({
    runId: undefined,
    market: inferMarket(args.context),
    assetClass: inferAssetClass(args.context)
  }));
  push('get_validation_report', getValidationReportTool({
    runId: undefined,
    market: inferMarket(args.context),
    assetClass: inferAssetClass(args.context)
  }));
  push('get_turnover_cost_report', getTurnoverCostReportTool({ runId: undefined }));
  push('get_experiment_registry', getExperimentRegistryTool());
  push('get_research_memory', getResearchMemoryTool());
  push('get_research_workflow_plan', getResearchWorkflowPlanTool({
    topic,
    factorId,
    market: inferMarket(args.context),
    assetClass: inferAssetClass(args.context)
  }));
  push('list_failed_experiments', listFailedExperimentsTool());

  if (factorId) {
    push('get_factor_catalog', getFactorCatalogTool());
    push('get_factor_definition', getFactorDefinitionTool(factorId));
    push('get_factor_interactions', getFactorInteractionsTool(factorId));
    push(
      'compare_factor_performance_by_regime',
      compareFactorPerformanceByRegimeTool({
        userId: args.userId,
        factorId,
        market: inferMarket(args.context),
        assetClass: inferAssetClass(args.context)
      })
    );
    push(
      'get_factor_research_snapshot',
      getFactorResearchSnapshotTool({
        factorId,
        market: inferMarket(args.context),
        assetClass: inferAssetClass(args.context)
      })
    );
  }

  if (args.context?.signalId || args.context?.symbol || /signal|why this/i.test(message)) {
    push(
      'get_signal_evidence',
      getSignalEvidenceTool({
        userId: args.userId,
        signalId: args.context?.signalId,
        symbol: args.context?.symbol,
        market: inferMarket(args.context),
        assetClass: inferAssetClass(args.context)
      })
    );
    push(
      'run_factor_diagnostics',
      runFactorDiagnosticsTool({
        userId: args.userId,
        signalId: args.context?.signalId,
        symbol: args.context?.symbol,
        market: inferMarket(args.context),
        assetClass: inferAssetClass(args.context)
      })
    );
    push(
      'explain_why_signal_exists',
      explainWhySignalExistsTool({
        userId: args.userId,
        signalId: args.context?.signalId,
        symbol: args.context?.symbol,
        market: inferMarket(args.context),
        assetClass: inferAssetClass(args.context)
      })
    );
  }

  if (/no signal|why no signal|why isn'?t there a signal|why there is no signal/i.test(message)) {
    push(
      'explain_why_no_signal',
      explainWhyNoSignalTool({
        userId: args.userId,
        market: inferMarket(args.context),
        assetClass: inferAssetClass(args.context)
      })
    );
  }

  return {
    research_mode: true,
    selected_tools: selectedTools,
    tool_results: toolResults.slice(0, 8)
  };
}

export async function getSignalCards(userId: string, assetClass?: string): Promise<unknown[]> {
  const normalizedAssetClass = assetClass ? inferAssetClass({ assetClass: assetClass as AssetClass }) : undefined;
  return listSignalContracts({
    userId,
    assetClass: normalizedAssetClass,
    status: 'ALL',
    limit: 16
  });
}

export async function getSignalDetail(signalId: string, userId: string): Promise<Record<string, unknown> | null> {
  if (!signalId) return null;
  const signal = getSignalContract(signalId, userId);
  return (signal as Record<string, unknown> | null) ?? null;
}

export async function getMarketTemperature(
  userId: string,
  market: string,
  symbol?: string
): Promise<Record<string, unknown> | null> {
  const normalizedMarket = String(market || '').toUpperCase() === 'CRYPTO' ? 'CRYPTO' : 'US';
  const rows = getMarketState({
    userId,
    market: normalizedMarket,
    symbol: symbol?.toUpperCase()
  });
  return (rows[0] as unknown as Record<string, unknown> | undefined) ?? null;
}

export async function getRiskProfile(userId: string): Promise<Record<string, unknown> | null> {
  return (getRiskProfileQuery(userId, { skipSync: true }) as Record<string, unknown> | null) ?? null;
}

export async function getPerformanceSummary(userId: string, market?: string): Promise<Record<string, unknown> | null> {
  const normalizedMarket = market ? (String(market).toUpperCase() === 'CRYPTO' ? 'CRYPTO' : 'US') : undefined;
  return getPerformanceSummaryQuery({
    userId,
    market: normalizedMarket
  });
}

function buildSelectedEvidence(args: {
  signalDetail: Record<string, unknown> | null;
  marketTemperature: Record<string, unknown> | null;
  riskProfile: Record<string, unknown> | null;
  performanceSummary: Record<string, unknown> | null;
  sourceTransparency: ToolContextBundle['sourceTransparency'];
}): string[] {
  const lines: string[] = [];
  const signal = args.signalDetail;
  if (signal) {
    const entryZone = (signal.entry_zone as Record<string, unknown> | undefined) || {};
    const stopLoss = (signal.stop_loss as Record<string, unknown> | undefined) || {};
    lines.push(
      `signal ${String(signal.symbol || 'unknown')} ${String(signal.direction || 'WAIT')} confidence ${Number(signal.confidence || 0).toFixed(0)}`
    );
    lines.push(
      `entry ${String(entryZone.low ?? signal.entry_min ?? '--')} to ${String(entryZone.high ?? signal.entry_max ?? '--')}, stop ${String(stopLoss.price ?? signal.stop_loss ?? '--')}`
    );
  }
  if (args.marketTemperature) {
    lines.push(
      `market regime ${String(args.marketTemperature.regime_id || args.marketTemperature.stance || 'unknown')}, temperature ${String(args.marketTemperature.temperature_percentile ?? '--')}, vol ${String(args.marketTemperature.volatility_percentile ?? '--')}`
    );
  }
  if (args.riskProfile) {
    lines.push(`risk profile ${String(args.riskProfile.profile_key || 'balanced')} with exposure cap ${String(args.riskProfile.exposure_cap ?? '--')}`);
  }
  const firstRecord = (args.performanceSummary?.records as Array<Record<string, unknown>> | undefined)?.[0];
  const overall = firstRecord?.overall as Record<string, unknown> | undefined;
  if (overall) {
    lines.push(`performance source ${String(overall.source_label || args.sourceTransparency.performance_source)}, sample ${String(overall.sample_size ?? '--')}`);
  }
  lines.push(`signal status ${args.sourceTransparency.signal_data_status}`);
  lines.push(`market-state status ${args.sourceTransparency.market_state_status}`);
  return lines.filter(Boolean).slice(0, 8);
}

export async function buildContextBundle(args: {
  userId: string;
  context?: ChatContextInput;
  message?: string;
}): Promise<ToolContextBundle> {
  const { userId, context } = args;
  const market = inferMarket(context);
  const assetClass = inferAssetClass(context);

  const runtime = getRuntimeState({
    userId,
    market,
    assetClass
  });

  const signalCards = pickRelevantSignals(await getSignalCards(userId, assetClass), context);

  let signalDetail: Record<string, unknown> | null = null;
  if (context?.signalId) {
    signalDetail = await getSignalDetail(context.signalId, userId);
  }
  if (!signalDetail && context?.symbol) {
    signalDetail =
      (signalCards.find((item) => {
        const symbol = String(item.symbol || '').toUpperCase();
        return symbol === context.symbol?.toUpperCase();
      }) as Record<string, unknown> | undefined) || null;
  }

  const marketTemperature = market
    ? await getMarketTemperature(userId, market, context?.symbol)
    : (runtime?.data?.velocity as Record<string, unknown> | null) || null;
  const riskProfile = await getRiskProfile(userId);
  const performanceSummary = await getPerformanceSummary(userId, market);
  const researchContext = await buildResearchToolResults(args);

  const sourceTransparency = {
    signal_data_status: runtime?.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA,
    market_state_status:
      runtime?.data_transparency?.data_status || runtime?.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA,
    performance_source: (() => {
      const firstRecord = (performanceSummary?.records as Array<Record<string, unknown>> | undefined)?.[0];
      const overall = firstRecord?.overall as Record<string, unknown> | undefined;
      return String(overall?.source_label || RUNTIME_STATUS.INSUFFICIENT_DATA);
    })(),
    performance_status: runtime?.data_transparency?.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA
  };

  return {
    signalCards,
    signalDetail,
    marketTemperature,
    riskProfile,
    performanceSummary,
    deterministicGuide: args.message
      ? answerWithRetrieval(args.message, {
          ...(runtime?.data || {}),
          user_context: {
            user_id: userId
          }
        })
      : null,
    selectedEvidence: buildSelectedEvidence({
      signalDetail,
      marketTemperature,
      riskProfile,
      performanceSummary,
      sourceTransparency
    }),
    statusSummary: [
      `signals ${sourceTransparency.signal_data_status}`,
      `market ${sourceTransparency.market_state_status}`,
      `performance ${sourceTransparency.performance_source}`
    ],
    sourceTransparency,
    researchContext,
    hasExactSignalData: Boolean(signalDetail)
  };
}

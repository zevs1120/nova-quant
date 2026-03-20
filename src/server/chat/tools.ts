import type { AssetClass, Market } from '../types.js';
import {
  getMarketState,
  getPerformanceSummary as getPerformanceSummaryQuery,
  getRiskProfile as getRiskProfileQuery,
  getRuntimeState,
  getSignalContract,
  listAssets,
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
  getFactorMeasuredReportTool,
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

const ASSET_ALIASES: Array<{ symbol: string; market: Market; assetClass: AssetClass; aliases: string[] }> = [
  { symbol: 'BTC', market: 'CRYPTO', assetClass: 'CRYPTO', aliases: ['btc', 'bitcoin', 'btcusdt', 'btc-usdt', 'xbt'] },
  { symbol: 'ETH', market: 'CRYPTO', assetClass: 'CRYPTO', aliases: ['eth', 'ethereum', 'ethusdt', 'eth-usdt'] },
  { symbol: 'SOL', market: 'CRYPTO', assetClass: 'CRYPTO', aliases: ['sol', 'solana', 'solusdt', 'sol-usdt'] },
  { symbol: 'AAPL', market: 'US', assetClass: 'US_STOCK', aliases: ['aapl', 'apple'] },
  { symbol: 'NVDA', market: 'US', assetClass: 'US_STOCK', aliases: ['nvda', 'nvidia'] },
  { symbol: 'TSLA', market: 'US', assetClass: 'US_STOCK', aliases: ['tsla', 'tesla'] },
  { symbol: 'MSFT', market: 'US', assetClass: 'US_STOCK', aliases: ['msft', 'microsoft'] },
  { symbol: 'SPY', market: 'US', assetClass: 'US_STOCK', aliases: ['spy', 's&p500', 'sp500', 's&p 500'] },
  { symbol: 'QQQ', market: 'US', assetClass: 'US_STOCK', aliases: ['qqq', 'nasdaq', 'nasdaq100', 'nasdaq 100'] }
];

function normalizeLookup(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeCandidateSymbol(symbol: unknown, market?: Market): string {
  const upper = normalizeLookup(symbol);
  if (market === 'CRYPTO' && upper.endsWith('USDT')) return upper.slice(0, -4);
  if (market === 'CRYPTO' && upper.endsWith('USD')) return upper.slice(0, -3);
  return upper;
}

function inferRequestedAsset(args: {
  message?: string;
  context?: ChatContextInput;
  signalCards?: unknown[];
}): { symbol: string | null; market: Market | null; assetClass: AssetClass | null } {
  const contextMarket = inferMarket(args.context);
  const contextAssetClass = inferAssetClass(args.context);
  const explicitSymbol = normalizeCandidateSymbol(args.context?.symbol, contextMarket || undefined);
  if (explicitSymbol) {
    return {
      symbol: explicitSymbol,
      market: contextMarket || (contextAssetClass === 'CRYPTO' ? 'CRYPTO' : 'US'),
      assetClass: contextAssetClass || (contextMarket === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK')
    };
  }

  const message = String(args.message || '');
  const upper = message.toUpperCase();
  const pairMatch = upper.match(/\b([A-Z]{2,8})\s*[-/]\s*(USDT|USD)\b/);
  if (pairMatch) {
    return {
      symbol: normalizeCandidateSymbol(pairMatch[1], 'CRYPTO'),
      market: 'CRYPTO',
      assetClass: 'CRYPTO'
    };
  }

  const allCandidates = [
    ...ASSET_ALIASES,
    ...(args.signalCards || [])
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
      .map((row) => ({
        symbol: normalizeCandidateSymbol(row.symbol, String(row.market || '').toUpperCase() === 'CRYPTO' ? 'CRYPTO' : 'US'),
        market: String(row.market || '').toUpperCase() === 'CRYPTO' ? ('CRYPTO' as const) : ('US' as const),
        assetClass: String(row.asset_class || '').toUpperCase() === 'CRYPTO' ? ('CRYPTO' as const) : ('US_STOCK' as const),
        aliases: [String(row.symbol || '')]
      })),
    ...listAssets()
      .map((asset) => ({
        symbol: normalizeCandidateSymbol(asset.symbol, asset.market === 'CRYPTO' ? 'CRYPTO' : 'US'),
        market: asset.market === 'CRYPTO' ? ('CRYPTO' as const) : ('US' as const),
        assetClass: asset.market === 'CRYPTO' ? ('CRYPTO' as const) : ('US_STOCK' as const),
        aliases: [asset.symbol, asset.base || '', asset.symbol?.replace('USDT', '') || '']
      }))
  ];

  const normalizedMessage = normalizeLookup(message);
  const tokenMatches = upper.match(/\b[A-Z]{2,8}\b/g) || [];
  let best: { symbol: string; market: Market; assetClass: AssetClass; score: number } | null = null;

  for (const candidate of allCandidates) {
    const aliases = [...candidate.aliases, candidate.symbol].map((item) => normalizeLookup(item)).filter(Boolean);
    let score = 0;
    for (const alias of aliases) {
      if (!alias) continue;
      if (tokenMatches.includes(alias)) score = Math.max(score, 100);
      if (normalizedMessage.includes(alias)) score = Math.max(score, 80);
    }
    if (contextMarket && candidate.market === contextMarket) score += 8;
    if (!best || score > best.score) {
      best = score > 0 ? { symbol: candidate.symbol, market: candidate.market, assetClass: candidate.assetClass, score } : best;
    }
  }

  if (!best) {
    return {
      symbol: null,
      market: contextMarket || null,
      assetClass: contextAssetClass || null
    };
  }

  return {
    symbol: best.symbol,
    market: best.market,
    assetClass: best.assetClass
  };
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
  const market = inferMarket(args.context);
  const assetClass = inferAssetClass(args.context);
  const candidates: Array<{
    tool: string;
    priority: number;
    result: Record<string, unknown>;
  }> = [];
  const addCandidate = (tool: string, priority: number, result: Record<string, unknown>) => {
    candidates.push({ tool, priority, result });
  };

  addCandidate('summarize_research_on_topic', 72, summarizeResearchOnTopicTool({ topic }));
  addCandidate('get_research_doctrine', 56, getResearchDoctrineTool());
  addCandidate('get_regime_diagnostics', 78, getRegimeDiagnosticsTool({
    userId: args.userId,
    market,
    assetClass,
    symbol: args.context?.symbol
  }));
  addCandidate('get_research_workflow_plan', 68, getResearchWorkflowPlanTool({
    topic,
    factorId,
    market,
    assetClass
  }));
  addCandidate('get_strategy_evaluation_report', 62, getStrategyEvaluationReportTool({
    runId: undefined,
    market,
    assetClass
  }));
  addCandidate('get_validation_report', 60, getValidationReportTool({
    runId: undefined,
    market,
    assetClass
  }));
  addCandidate('get_backtest_integrity_report', 58, getBacktestIntegrityReportTool({ runId: undefined }));
  addCandidate('get_turnover_cost_report', 57, getTurnoverCostReportTool({ runId: undefined }));
  addCandidate('get_strategy_registry', 48, getStrategyRegistryTool());
  addCandidate('get_regime_taxonomy', 44, getRegimeTaxonomyTool());
  addCandidate('get_experiment_registry', 50, getExperimentRegistryTool());
  addCandidate('get_research_memory', 52, getResearchMemoryTool());
  addCandidate('list_failed_experiments', 46, listFailedExperimentsTool());

  if (factorId) {
    addCandidate('get_factor_definition', 96, getFactorDefinitionTool(factorId));
    addCandidate('get_factor_interactions', 92, getFactorInteractionsTool(factorId));
    addCandidate('get_factor_measured_report', 95, getFactorMeasuredReportTool({
      factorId,
      market,
      assetClass
    }));
    addCandidate(
      'compare_factor_performance_by_regime',
      90,
      compareFactorPerformanceByRegimeTool({
        userId: args.userId,
        factorId,
        market,
        assetClass
      })
    );
    addCandidate(
      'get_factor_research_snapshot',
      88,
      getFactorResearchSnapshotTool({
        factorId,
        market,
        assetClass
      })
    );
    addCandidate('get_factor_catalog', 40, getFactorCatalogTool());
  }

  if (args.context?.signalId || args.context?.symbol || /signal|why this/i.test(message)) {
    addCandidate(
      'get_signal_evidence',
      94,
      getSignalEvidenceTool({
        userId: args.userId,
        signalId: args.context?.signalId,
        symbol: args.context?.symbol,
        market,
        assetClass
      })
    );
    addCandidate(
      'run_factor_diagnostics',
      93,
      runFactorDiagnosticsTool({
        userId: args.userId,
        signalId: args.context?.signalId,
        symbol: args.context?.symbol,
        market,
        assetClass
      })
    );
    addCandidate(
      'explain_why_signal_exists',
      91,
      explainWhySignalExistsTool({
        userId: args.userId,
        signalId: args.context?.signalId,
        symbol: args.context?.symbol,
        market,
        assetClass
      })
    );
  }

  if (/no signal|why no signal|why isn'?t there a signal|why there is no signal/i.test(message)) {
    addCandidate(
      'explain_why_no_signal',
      95,
      explainWhyNoSignalTool({
        userId: args.userId,
        market,
        assetClass
      })
    );
  }

  const deduped = new Map<string, { tool: string; priority: number; result: Record<string, unknown> }>();
  for (const candidate of candidates) {
    const existing = deduped.get(candidate.tool);
    if (!existing || candidate.priority > existing.priority) deduped.set(candidate.tool, candidate);
  }

  const ordered = [...deduped.values()]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);

  return {
    research_mode: true,
    selected_tools: ordered.map((item) => item.tool),
    tool_results: ordered.map((item) => ({
      tool: item.tool,
      source_status: String(item.result.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
      data_status: String(item.result.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
      payload: item.result
    }))
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
  decisionSummary?: ChatContextInput['decisionSummary'];
  holdingsSummary?: ChatContextInput['holdingsSummary'];
  engagementSummary?: ChatContextInput['engagementSummary'];
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
  if (args.decisionSummary) {
    lines.push(
      `decision ${String(args.decisionSummary.today_call || '--')} | posture ${String(args.decisionSummary.risk_posture || '--')} | top action ${String(args.decisionSummary.top_action_label || '--')} ${String(args.decisionSummary.top_action_symbol || '')}`.trim()
    );
  }
  if (args.holdingsSummary) {
    lines.push(
      `holdings ${String(args.holdingsSummary.holdings_count ?? 0)} | total weight ${String(args.holdingsSummary.total_weight_pct ?? '--')} | risk ${String(args.holdingsSummary.risk_level || '--')}`
    );
  }
  if (args.engagementSummary) {
    lines.push(
      `morning check ${String(args.engagementSummary.morning_check_status || '--')} | discipline ${String(args.engagementSummary.discipline_score ?? '--')} | wrap-up ${args.engagementSummary.wrap_up_ready ? 'ready' : 'not_ready'}`
    );
    if (args.engagementSummary.perception_headline || args.engagementSummary.perception_focus) {
      lines.push(
        `perception ${String(args.engagementSummary.perception_status || '--')} | ${String(args.engagementSummary.perception_headline || '--')} | ${String(args.engagementSummary.perception_focus || '--')}`
      );
    }
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
  const seedSignalCards = pickRelevantSignals(await getSignalCards(userId, inferAssetClass(context)), context);
  const inferredAsset = inferRequestedAsset({
    message: args.message,
    context,
    signalCards: seedSignalCards
  });
  const market = inferMarket(context) || inferredAsset.market || undefined;
  const assetClass = inferAssetClass(context) || inferredAsset.assetClass || undefined;
  const requestedSymbol = normalizeCandidateSymbol(context?.symbol || inferredAsset.symbol, market || undefined) || null;

  const runtime = getRuntimeState({
    userId,
    market,
    assetClass
  });

  const signalCards = pickRelevantSignals(await getSignalCards(userId, assetClass), {
    ...(context || {}),
    symbol: requestedSymbol || context?.symbol
  });

  let signalDetail: Record<string, unknown> | null = null;
  if (context?.signalId) {
    signalDetail = await getSignalDetail(context.signalId, userId);
  }
  if (!signalDetail && requestedSymbol) {
    signalDetail =
      (signalCards.find((item) => {
        const signalMarket = String(item.market || '').toUpperCase() === 'CRYPTO' ? 'CRYPTO' : 'US';
        const symbol = normalizeCandidateSymbol(item.symbol, signalMarket);
        return symbol === requestedSymbol;
      }) as Record<string, unknown> | undefined) || null;
  }

  const marketTemperature = market
    ? await getMarketTemperature(userId, market, requestedSymbol || undefined)
    : (runtime?.data?.velocity as Record<string, unknown> | null) || null;
  const riskProfile = await getRiskProfile(userId);
  const performanceSummary = await getPerformanceSummary(userId, market);
  const researchContext = await buildResearchToolResults(args);

  const sourceTransparency = {
    signal_data_status: String(runtime?.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
    market_state_status: String(
      runtime?.data_transparency?.data_status || runtime?.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA
    ),
    performance_source: (() => {
      const firstRecord = (performanceSummary?.records as Array<Record<string, unknown>> | undefined)?.[0];
      const overall = firstRecord?.overall as Record<string, unknown> | undefined;
      return String(overall?.source_label || RUNTIME_STATUS.INSUFFICIENT_DATA);
    })(),
    performance_status: String(runtime?.data_transparency?.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA)
  };

  return {
    requestedSymbol,
    requestedMarket: market || null,
    requestedAssetClass: assetClass || null,
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
      sourceTransparency,
      decisionSummary: context?.decisionSummary,
      holdingsSummary: context?.holdingsSummary,
      engagementSummary: context?.engagementSummary
    }),
    statusSummary: [
      `signals ${sourceTransparency.signal_data_status}`,
      `market ${sourceTransparency.market_state_status}`,
      `performance ${sourceTransparency.performance_source}`,
      context?.decisionSummary?.today_call ? `decision ${context.decisionSummary.today_call}` : '',
      context?.engagementSummary?.morning_check_status ? `check ${context.engagementSummary.morning_check_status}` : ''
    ].filter(Boolean),
    sourceTransparency,
    researchContext,
    hasExactSignalData: Boolean(signalDetail)
  };
}

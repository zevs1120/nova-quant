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
    hasExactSignalData: Boolean(signalDetail)
  };
}

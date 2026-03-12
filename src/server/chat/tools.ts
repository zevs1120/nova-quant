import type { AssetClass, Market } from '../types.js';
import {
  getMarketState,
  getPerformanceSummary as getPerformanceSummaryQuery,
  getRiskProfile as getRiskProfileQuery,
  getRuntimeState,
  getSignalContract,
  listSignalContracts,
} from '../api/queries.js';
import { RUNTIME_STATUS } from '../runtimeStatus.js';
import type { ChatContextInput, ToolContextBundle } from './types.js';

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

export async function getSignalCards(userId: string, assetClass?: string): Promise<unknown[]> {
  const normalizedAssetClass = assetClass ? inferAssetClass({ assetClass: assetClass as AssetClass }) : undefined;
  return listSignalContracts({
    userId,
    assetClass: normalizedAssetClass,
    status: 'ALL',
    limit: 40
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

export async function getPerformanceSummary(
  userId: string,
  market?: string
): Promise<Record<string, unknown> | null> {
  const normalizedMarket = market ? (String(market).toUpperCase() === 'CRYPTO' ? 'CRYPTO' : 'US') : undefined;
  return getPerformanceSummaryQuery({
    userId,
    market: normalizedMarket
  });
}

export async function buildContextBundle(args: {
  userId: string;
  context?: ChatContextInput;
}): Promise<ToolContextBundle> {
  const { userId, context } = args;
  const market = inferMarket(context);
  const assetClass = inferAssetClass(context);

  const runtime = getRuntimeState({
    userId,
    market,
    assetClass
  });

  const signalCards = await getSignalCards(userId, assetClass);

  let signalDetail: Record<string, unknown> | null = null;
  if (context?.signalId) {
    signalDetail = await getSignalDetail(context.signalId, userId);
  }
  if (!signalDetail && context?.symbol) {
    signalDetail =
      (signalCards.find((item) => {
        if (!item || typeof item !== 'object') return false;
        const symbol = String((item as Record<string, unknown>).symbol || '').toUpperCase();
        return symbol === context.symbol?.toUpperCase();
      }) as Record<string, unknown> | undefined) || null;
  }

  const marketTemperature = market
    ? await getMarketTemperature(userId, market, context?.symbol)
    : (runtime?.data?.velocity as Record<string, unknown> | null) || null;
  const riskProfile = await getRiskProfile(userId);
  const performanceSummary = await getPerformanceSummary(userId, market);

  return {
    signalCards,
    signalDetail,
    marketTemperature,
    riskProfile,
    performanceSummary,
    sourceTransparency: {
      signal_data_status: runtime?.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA,
      market_state_status:
        runtime?.data_transparency?.data_status || runtime?.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA,
      performance_source: (() => {
        const firstRecord = (performanceSummary?.records as Array<Record<string, unknown>> | undefined)?.[0];
        const overall = firstRecord?.overall as Record<string, unknown> | undefined;
        return String(overall?.source_label || RUNTIME_STATUS.INSUFFICIENT_DATA);
      })(),
      performance_status: runtime?.data_transparency?.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA
    },
    hasExactSignalData: Boolean(signalDetail)
  };
}

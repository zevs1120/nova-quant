import pLimit from 'p-limit';
import type { Market } from '../types.js';
import type { MarketRepository } from '../db/repository.js';
import { fetchYahooChartSnapshot } from '../ingestion/yahoo.js';
import { buildUsTradingCalendarSeeds } from '../ingestion/tradingCalendar.js';
import { logWarn } from '../utils/log.js';

const GOVERNANCE_CONCURRENCY = 2;

function normalizeSymbol(symbol: string): string {
  return String(symbol || '')
    .trim()
    .toUpperCase();
}

export async function syncCorporateActionsForSymbol(args: {
  repo: MarketRepository;
  market: Market;
  symbol: string;
  venue?: string;
}) {
  const symbol = normalizeSymbol(args.symbol);
  if (args.market !== 'US' || !symbol) {
    return {
      market: args.market,
      symbol,
      fetched: false,
      skipped: true,
      actions_upserted: 0,
      error: null,
    };
  }

  const asset = args.repo.upsertAsset({
    market: 'US',
    symbol,
    venue: args.venue || 'STOOQ',
    quote: 'USD',
    status: 'ACTIVE',
  });

  try {
    const snapshot = await fetchYahooChartSnapshot(symbol, '1d');
    for (const action of snapshot.corporateActions) {
      args.repo.upsertCorporateAction({
        assetId: asset.asset_id,
        effectiveTs: action.effectiveTs,
        actionType: action.actionType,
        splitRatio: action.splitRatio ?? null,
        cashAmount: action.cashAmount ?? null,
        source: 'YAHOO_CHART_SYNC',
        notes: action.notes ?? null,
      });
    }
    return {
      market: 'US' as const,
      symbol,
      fetched: true,
      skipped: false,
      actions_upserted: snapshot.corporateActions.length,
      error: null,
    };
  } catch (error) {
    logWarn('Corporate action sync failed', {
      symbol,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      market: 'US' as const,
      symbol,
      fetched: false,
      skipped: false,
      actions_upserted: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function syncTradingCalendar(args: {
  repo: MarketRepository;
  market?: Market | 'ALL';
  years?: number[];
}) {
  const market = args.market || 'ALL';
  const currentYear = new Date().getUTCFullYear();
  const years = args.years?.length ? args.years : [currentYear - 1, currentYear, currentYear + 1];
  let rowsUpserted = 0;

  if (market === 'ALL' || market === 'US') {
    const seeds = buildUsTradingCalendarSeeds(years);
    for (const seed of seeds) {
      args.repo.upsertTradingCalendarException({
        market: 'US',
        dayKey: seed.dayKey,
        status: seed.status,
        reason: seed.reason,
        source: seed.source,
      });
      rowsUpserted += 1;
    }
  }

  return {
    market,
    years,
    rows_upserted: rowsUpserted,
  };
}

export async function refreshGovernanceData(args: {
  repo: MarketRepository;
  market?: Market | 'ALL';
  usSymbols: string[];
  refreshCorporateActions?: boolean;
  refreshTradingCalendar?: boolean;
}) {
  const targets = args.usSymbols
    .map((symbol) => ({ market: 'US' as const, symbol: normalizeSymbol(symbol) }))
    .filter((row) => row.symbol)
    .filter((row) => !args.market || args.market === 'ALL' || row.market === args.market);

  const limit = pLimit(GOVERNANCE_CONCURRENCY);
  const [corporateResults, tradingCalendar] = await Promise.all([
    args.refreshCorporateActions === false
      ? Promise.resolve([] as Awaited<ReturnType<typeof syncCorporateActionsForSymbol>>[])
      : Promise.all(
          targets.map((target) =>
            limit(() =>
              syncCorporateActionsForSymbol({
                repo: args.repo,
                market: target.market,
                symbol: target.symbol,
              }),
            ),
          ),
        ),
    args.refreshTradingCalendar === false
      ? Promise.resolve({ market: args.market || 'ALL', years: [], rows_upserted: 0 })
      : syncTradingCalendar({
          repo: args.repo,
          market: args.market,
        }),
  ]);

  return {
    market: args.market || 'ALL',
    corporate_actions: {
      targets: targets.length,
      refreshed_symbols: corporateResults.filter((row) => row.fetched).length,
      skipped_symbols: corporateResults.filter((row) => row.skipped).length,
      rows_upserted: corporateResults.reduce((acc, row) => acc + row.actions_upserted, 0),
      errors: corporateResults
        .filter((row) => row.error)
        .map((row) => ({ symbol: row.symbol, error: row.error })),
    },
    trading_calendar: tradingCalendar,
  };
}

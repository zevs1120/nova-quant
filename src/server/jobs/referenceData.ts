import pLimit from 'p-limit';
import type { Market } from '../types.js';
import type { MarketRepository } from '../db/repository.js';
import {
  fetchAlphaVantageFundamentalSnapshot,
  fetchFinnhubFundamentalSnapshot,
  fetchYahooOptionSnapshots
} from '../ingestion/hostedData.js';
import { logWarn } from '../utils/log.js';

const FUNDAMENTALS_TTL_MS = 1000 * 60 * 60 * 24;
const OPTIONS_TTL_MS = 1000 * 60 * 60 * 6;
const REF_CONCURRENCY = 2;

function normalizeSymbol(symbol: string): string {
  return String(symbol || '').trim().toUpperCase();
}

export async function ensureFreshFundamentalsForSymbol(args: {
  repo: MarketRepository;
  market: Market;
  symbol: string;
}) {
  const symbol = normalizeSymbol(args.symbol);
  if (args.market !== 'US') {
    return {
      market: args.market,
      symbol,
      fetched: false,
      skipped: true,
      rows_upserted: 0,
      error: null
    };
  }

  const latest = args.repo.listFundamentalSnapshots({ market: 'US', symbol, limit: 1 })[0] || null;
  if (latest && Date.now() - latest.updated_at_ms < FUNDAMENTALS_TTL_MS) {
    return {
      market: 'US' as const,
      symbol,
      fetched: false,
      skipped: true,
      rows_upserted: 0,
      error: null
    };
  }

  const rows = (
    await Promise.all([
      fetchAlphaVantageFundamentalSnapshot(symbol).catch(() => null),
      fetchFinnhubFundamentalSnapshot(symbol).catch(() => null)
    ])
  ).filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!rows.length) {
    return {
      market: 'US' as const,
      symbol,
      fetched: false,
      skipped: false,
      rows_upserted: 0,
      error: 'no_provider_data'
    };
  }

  args.repo.upsertFundamentalSnapshots(rows);
  return {
    market: 'US' as const,
    symbol,
    fetched: true,
    skipped: false,
    rows_upserted: rows.length,
    error: null
  };
}

export async function ensureFreshOptionsForSymbol(args: {
  repo: MarketRepository;
  market: Market;
  symbol: string;
}) {
  const symbol = normalizeSymbol(args.symbol);
  if (args.market !== 'US') {
    return {
      market: args.market,
      symbol,
      fetched: false,
      skipped: true,
      rows_upserted: 0,
      error: null
    };
  }

  const latest = args.repo.listOptionChainSnapshots({ market: 'US', symbol, limit: 1 })[0] || null;
  if (latest && Date.now() - latest.updated_at_ms < OPTIONS_TTL_MS) {
    return {
      market: 'US' as const,
      symbol,
      fetched: false,
      skipped: true,
      rows_upserted: 0,
      error: null
    };
  }

  let fetchError: string | null = null;
  const rows = await fetchYahooOptionSnapshots(symbol).catch((error) => {
    fetchError = error instanceof Error ? error.message : String(error);
    return [];
  });
  if (!rows.length) {
    logWarn('Yahoo option-chain refresh produced no rows', {
      symbol,
      error: fetchError || 'fetch_failed'
    });
    return {
      market: 'US' as const,
      symbol,
      fetched: false,
      skipped: false,
      rows_upserted: 0,
      error: fetchError || 'fetch_failed'
    };
  }

  args.repo.upsertOptionChainSnapshots(rows);
  return {
    market: 'US' as const,
    symbol,
    fetched: true,
    skipped: false,
    rows_upserted: rows.length,
    error: null
  };
}

export async function refreshTrainingReferenceData(args: {
  repo: MarketRepository;
  market?: Market | 'ALL';
  usSymbols: string[];
  refreshFundamentals?: boolean;
  refreshOptions?: boolean;
}) {
  const targets = args.usSymbols
    .map((symbol) => ({ market: 'US' as const, symbol: normalizeSymbol(symbol) }))
    .filter((row) => row.symbol)
    .filter((row) => !args.market || args.market === 'ALL' || row.market === args.market);

  const limit = pLimit(REF_CONCURRENCY);
  const [fundamentalResults, optionsResults] = await Promise.all([
    args.refreshFundamentals === false
      ? Promise.resolve([] as Awaited<ReturnType<typeof ensureFreshFundamentalsForSymbol>>[])
      : Promise.all(
          targets.map((target) =>
            limit(() =>
              ensureFreshFundamentalsForSymbol({
                repo: args.repo,
                market: target.market,
                symbol: target.symbol
              })
            )
          )
        ),
    args.refreshOptions === false
      ? Promise.resolve([] as Awaited<ReturnType<typeof ensureFreshOptionsForSymbol>>[])
      : Promise.all(
          targets.map((target) =>
            limit(() =>
              ensureFreshOptionsForSymbol({
                repo: args.repo,
                market: target.market,
                symbol: target.symbol
              })
            )
          )
        )
  ]);

  return {
    market: args.market || 'ALL',
    fundamentals: {
      targets: targets.length,
      refreshed_symbols: fundamentalResults.filter((row) => row.fetched).length,
      skipped_symbols: fundamentalResults.filter((row) => row.skipped).length,
      rows_upserted: fundamentalResults.reduce((acc, row) => acc + row.rows_upserted, 0),
      errors: fundamentalResults.filter((row) => row.error).map((row) => ({ symbol: row.symbol, error: row.error }))
    },
    options: {
      targets: targets.length,
      refreshed_symbols: optionsResults.filter((row) => row.fetched).length,
      skipped_symbols: optionsResults.filter((row) => row.skipped).length,
      rows_upserted: optionsResults.reduce((acc, row) => acc + row.rows_upserted, 0),
      errors: optionsResults.filter((row) => row.error).map((row) => ({ symbol: row.symbol, error: row.error }))
    }
  };
}

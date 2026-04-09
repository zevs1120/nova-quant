import pLimit from 'p-limit';
import type { Market } from '../types.js';
import type { MarketRepository } from '../db/repository.js';
import { fetchAlphaVantageCorporateActions } from '../ingestion/hostedData.js';
import { fetchYahooChartSnapshot } from '../ingestion/yahoo.js';
import { buildUsTradingCalendarSeeds } from '../ingestion/tradingCalendar.js';
import { logWarn } from '../utils/log.js';

const GOVERNANCE_CONCURRENCY = 2;

function normalizeSymbol(symbol: string): string {
  return String(symbol || '')
    .trim()
    .toUpperCase();
}

function parseMetricsJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return {};
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
    const [snapshot, alphaActions] = await Promise.all([
      fetchYahooChartSnapshot(symbol, '1d'),
      fetchAlphaVantageCorporateActions(symbol).catch(() => []),
    ]);
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
    for (const action of alphaActions) {
      args.repo.upsertCorporateAction({
        assetId: asset.asset_id,
        effectiveTs: action.effectiveTs,
        actionType: action.actionType,
        splitRatio: action.splitRatio ?? null,
        cashAmount: action.cashAmount ?? null,
        source: action.source,
        notes: action.notes ?? null,
      });
    }
    const validation = validateCorporateActionConsensus({
      repo: args.repo,
      assetId: asset.asset_id,
    });
    return {
      market: 'US' as const,
      symbol,
      fetched: true,
      skipped: false,
      actions_upserted: snapshot.corporateActions.length + alphaActions.length,
      validation,
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
      validation: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeConsensusKey(args: { effectiveTs: number; actionType: string }) {
  return `${new Date(args.effectiveTs).toISOString().slice(0, 10)}:${args.actionType}`;
}

function parseNotesNumber(notes: string | null | undefined): number | null {
  const match = String(notes || '').match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function actionComparableValue(action: {
  action_type: string;
  split_ratio?: number | null;
  cash_amount?: number | null;
  notes?: string | null;
}) {
  if (action.action_type === 'SPLIT') {
    return Number(action.split_ratio);
  }
  if (action.action_type === 'DIVIDEND') {
    const raw = Number(action.cash_amount);
    if (Number.isFinite(raw)) return raw;
    return parseNotesNumber(action.notes);
  }
  return null;
}

export function validateCorporateActionConsensus(args: {
  repo: MarketRepository;
  assetId: number;
}) {
  const actions = args.repo.listCorporateActions({
    assetId: args.assetId,
  });
  const grouped = new Map<string, typeof actions>();
  for (const action of actions) {
    const key = normalizeConsensusKey({
      effectiveTs: action.effective_ts,
      actionType: action.action_type,
    });
    const bucket = grouped.get(key) || [];
    bucket.push(action);
    grouped.set(key, bucket);
  }

  let mismatchCount = 0;
  let confirmedCount = 0;
  const mismatches: Array<{
    event_key: string;
    values: Array<{ source: string; value: number | null; notes: string | null }>;
  }> = [];
  for (const [key, bucket] of grouped.entries()) {
    const providerCount = new Set(bucket.map((row) => row.source)).size;
    if (providerCount < 2) continue;
    const comparable = bucket
      .map((row) => actionComparableValue(row))
      .filter((value): value is number => Number.isFinite(value));
    if (comparable.length < 2) continue;
    const baseline = comparable[0];
    const mismatch = comparable.some((value) => Math.abs(value / baseline - 1) > 0.08);
    if (mismatch) {
      mismatchCount += 1;
      mismatches.push({
        event_key: key,
        values: bucket.map((row) => ({
          source: row.source,
          value: actionComparableValue(row),
          notes: row.notes,
        })),
      });
      args.repo.logAnomaly({
        assetId: args.assetId,
        timeframe: '1d',
        tsOpen: Date.parse(`${key.split(':')[0]}T00:00:00.000Z`),
        anomalyType: 'CORPORATE_ACTION_SOURCE_CONFLICT',
        detail: `Corporate action mismatch across providers for ${key}`,
      });
    } else {
      confirmedCount += 1;
    }
  }

  if (mismatchCount > 0) {
    const existingState = args.repo.getOhlcvQualityState({
      assetId: args.assetId,
      timeframe: '1d',
    });
    args.repo.upsertOhlcvQualityState({
      assetId: args.assetId,
      timeframe: '1d',
      status: 'SUSPECT',
      reason: 'CORPORATE_ACTION_SOURCE_CONFLICT',
      metricsJson: JSON.stringify({
        ...parseMetricsJson(existingState?.metrics_json),
        corporate_action_validation: {
          mismatch_count: mismatchCount,
          confirmed_count: confirmedCount,
          mismatches,
        },
      }),
    });
  }

  return {
    mismatch_count: mismatchCount,
    confirmed_count: confirmedCount,
    mismatches,
  };
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
      refreshed_symbol_list: corporateResults.filter((row) => row.fetched).map((row) => row.symbol),
      skipped_symbols: corporateResults.filter((row) => row.skipped).length,
      rows_upserted: corporateResults.reduce((acc, row) => acc + row.actions_upserted, 0),
      mismatch_symbols: corporateResults.filter((row) => (row.validation?.mismatch_count ?? 0) > 0)
        .length,
      mismatch_symbol_list: corporateResults
        .filter((row) => (row.validation?.mismatch_count ?? 0) > 0)
        .map((row) => row.symbol),
      errors: corporateResults
        .filter((row) => row.error)
        .map((row) => ({ symbol: row.symbol, error: row.error })),
    },
    trading_calendar: tradingCalendar,
  };
}

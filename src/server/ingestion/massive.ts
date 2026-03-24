/**
 * Massive.com (formerly Polygon.io) REST API ingestion module.
 *
 * Endpoint:  GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}
 * Auth:      ?apiKey=<key>
 * Docs:      https://massive.com/docs/rest/stocks/aggregates-bars
 *
 * Response shape:
 * {
 *   ticker: string,
 *   queryCount: number,
 *   resultsCount: number,
 *   adjusted: boolean,
 *   results: [{ v, vw, o, c, h, l, t, n }],
 *   status: string,
 *   request_id: string,
 *   next_url?: string
 * }
 */
import { getConfig } from '../config.js';
import { MarketRepository } from '../db/repository.js';
import type { Market, NormalizedBar, Timeframe } from '../types.js';
import { logInfo, logWarn } from '../utils/log.js';
import { sleep } from '../utils/time.js';
import { normalizeBars } from './normalize.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single aggregate bar as returned by the Massive API */
export interface MassiveAggBar {
  /** Volume */
  v: number;
  /** Volume-Weighted Average Price */
  vw?: number;
  /** Open */
  o: number;
  /** Close */
  c: number;
  /** High */
  h: number;
  /** Low */
  l: number;
  /** Unix ms timestamp for the start of the aggregate window */
  t: number;
  /** Number of transactions */
  n?: number;
  /** OTC flag */
  otc?: boolean;
}

export interface MassiveAggsResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results?: MassiveAggBar[];
  status: string;
  request_id: string;
  next_url?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map our Timeframe to Massive's {multiplier, timespan} pair */
export function mapTimeframe(tf: Timeframe): { multiplier: number; timespan: string } {
  switch (tf) {
    case '1m':
      return { multiplier: 1, timespan: 'minute' };
    case '5m':
      return { multiplier: 5, timespan: 'minute' };
    case '15m':
      return { multiplier: 15, timespan: 'minute' };
    case '1h':
      return { multiplier: 1, timespan: 'hour' };
    case '1d':
      return { multiplier: 1, timespan: 'day' };
    default:
      return { multiplier: 1, timespan: 'day' };
  }
}

/** Convert a Massive agg bar to our NormalizedBar */
export function massiveBarToNormalized(bar: MassiveAggBar): NormalizedBar {
  return {
    ts_open: bar.t,
    open: String(bar.o),
    high: String(bar.h),
    low: String(bar.l),
    close: String(bar.c),
    volume: String(bar.v ?? 0),
  };
}

/** Format a date to YYYY-MM-DD for the Massive API */
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build the aggregates URL */
function buildAggsUrl(
  baseUrl: string,
  ticker: string,
  multiplier: number,
  timespan: string,
  from: string,
  to: string,
  apiKey: string,
  limit = 50000,
): string {
  const params = new URLSearchParams({
    adjusted: 'true',
    sort: 'asc',
    limit: String(limit),
    apiKey,
  });
  return `${baseUrl}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${from}/${to}?${params.toString()}`;
}

// ─── Core Fetch ──────────────────────────────────────────────────────────────

/**
 * Fetch all aggregate bars for a single ticker and timeframe,
 * handling pagination via `next_url`.
 */
export async function fetchMassiveAggs(params: {
  ticker: string;
  timeframe: Timeframe;
  from: Date;
  to: Date;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  retry: { attempts: number; baseDelayMs: number };
  requestDelayMs: number;
}): Promise<NormalizedBar[]> {
  const { ticker, timeframe, from, to, apiKey, baseUrl, timeoutMs, retry, requestDelayMs } = params;
  const { multiplier, timespan } = mapTimeframe(timeframe);
  const bars: NormalizedBar[] = [];

  let url: string | null = buildAggsUrl(
    baseUrl,
    ticker,
    multiplier,
    timespan,
    formatDate(from),
    formatDate(to),
    apiKey,
  );

  let pageCount = 0;
  const MAX_PAGES = 100; // safety cap

  while (url && pageCount < MAX_PAGES) {
    pageCount += 1;

    // Append apiKey to next_url if not already present
    const urlWithKey = url.includes('apiKey=')
      ? url
      : `${url}${url.includes('?') ? '&' : '?'}apiKey=${apiKey}`;

    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetch(urlWithKey, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      // Network / timeout error — apply retry logic
      logWarn('Massive API fetch error', { ticker, error: String(error) });
      if (pageCount <= retry.attempts) {
        await sleep(retry.baseDelayMs * 2 ** (pageCount - 1));
        continue;
      }
      break;
    }

    if (response.status === 429) {
      logWarn('Massive API rate-limited, waiting 15s', { ticker });
      await sleep(15_000);
      continue;
    }

    if (!response.ok) {
      logWarn('Massive API non-OK response', {
        ticker,
        status: response.status,
        statusText: response.statusText,
      });
      break;
    }

    let body: MassiveAggsResponse;
    try {
      body = (await response.json()) as MassiveAggsResponse;
    } catch {
      logWarn('Massive API invalid JSON response', { ticker });
      break;
    }

    if (body.results && body.results.length > 0) {
      for (const bar of body.results) {
        bars.push(massiveBarToNormalized(bar));
      }
    }

    url = body.next_url || null;

    // Respect rate limit (Basic tier = 5 req/min = 12s between requests)
    if (url) {
      await sleep(requestDelayMs);
    }
  }

  return bars;
}

// ─── Public Backfill Functions ───────────────────────────────────────────────

/**
 * Backfill US stock OHLCV bars from Massive.com API.
 */
export async function backfillMassiveStocks(params: {
  repo: MarketRepository;
  symbols?: string[];
  timeframes?: Timeframe[];
  fromDate?: Date;
  toDate?: Date;
  source?: string;
}): Promise<void> {
  const config = getConfig();
  const massive = config.massive;
  if (!massive) {
    logWarn('Massive config section not found, skipping backfillMassiveStocks');
    return;
  }
  if (!massive.apiKey) {
    logWarn('MASSIVE_API_KEY not set, skipping backfillMassiveStocks');
    return;
  }

  const { repo } = params;
  const source = params.source || 'MASSIVE';
  const symbols = params.symbols || config.markets.US.symbols;
  const timeframes = params.timeframes || (['1d'] as Timeframe[]);

  const to = params.toDate || new Date();
  const from =
    params.fromDate || new Date(to.getTime() - massive.defaultLookbackDays * 24 * 60 * 60 * 1000);

  logInfo('Starting Massive stocks backfill', {
    symbols: symbols.length,
    timeframes,
    from: formatDate(from),
    to: formatDate(to),
  });

  for (const symbol of symbols) {
    const asset = repo.upsertAsset({
      market: 'US',
      symbol,
      venue: 'MASSIVE',
      quote: 'USD',
      status: 'ACTIVE',
    });

    for (const tf of timeframes) {
      try {
        const bars = await fetchMassiveAggs({
          ticker: symbol,
          timeframe: tf,
          from,
          to,
          apiKey: massive.apiKey,
          baseUrl: massive.baseUrl,
          timeoutMs: massive.timeoutMs,
          retry: massive.retry,
          requestDelayMs: massive.requestDelayMs,
        });

        if (bars.length > 0) {
          const normalized = normalizeBars(bars);
          repo.upsertOhlcvBars(asset.asset_id, tf, normalized, source);
          logInfo('Massive stocks ingested', { symbol, timeframe: tf, bars: normalized.length });
        }
      } catch (error) {
        logWarn('Massive stocks backfill failed for symbol', {
          symbol,
          timeframe: tf,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Rate-limit pause between symbols/timeframes
      await sleep(massive.requestDelayMs);
    }
  }

  logInfo('Massive stocks backfill complete');
}

/**
 * Backfill crypto OHLCV bars from Massive.com API.
 * Massive crypto tickers use the format X:<BASE><QUOTE>, e.g. X:BTCUSD
 */
export async function backfillMassiveCrypto(params: {
  repo: MarketRepository;
  symbols?: string[];
  timeframes?: Timeframe[];
  fromDate?: Date;
  toDate?: Date;
  source?: string;
}): Promise<void> {
  const config = getConfig();
  const massive = config.massive;
  if (!massive) {
    logWarn('Massive config section not found, skipping backfillMassiveCrypto');
    return;
  }
  if (!massive.apiKey) {
    logWarn('MASSIVE_API_KEY not set, skipping backfillMassiveCrypto');
    return;
  }

  const { repo } = params;
  const source = params.source || 'MASSIVE';
  const symbols = params.symbols || config.markets.CRYPTO.symbols;
  const timeframes = params.timeframes || (['1d'] as Timeframe[]);

  const to = params.toDate || new Date();
  const from =
    params.fromDate || new Date(to.getTime() - massive.defaultLookbackDays * 24 * 60 * 60 * 1000);

  logInfo('Starting Massive crypto backfill', {
    symbols: symbols.length,
    timeframes,
    from: formatDate(from),
    to: formatDate(to),
  });

  for (const symbol of symbols) {
    // Convert Binance-style BTCUSDT → Massive-style X:BTCUSD
    const massiveTicker = convertCryptoSymbol(symbol);

    const asset = repo.upsertAsset({
      market: 'CRYPTO',
      symbol,
      venue: 'MASSIVE',
      base: symbol.replace(/USD[T]?$/i, ''),
      quote: 'USD',
      status: 'ACTIVE',
    });

    for (const tf of timeframes) {
      try {
        const bars = await fetchMassiveAggs({
          ticker: massiveTicker,
          timeframe: tf,
          from,
          to,
          apiKey: massive.apiKey,
          baseUrl: massive.baseUrl,
          timeoutMs: massive.timeoutMs,
          retry: massive.retry,
          requestDelayMs: massive.requestDelayMs,
        });

        if (bars.length > 0) {
          const normalized = normalizeBars(bars);
          repo.upsertOhlcvBars(asset.asset_id, tf, normalized, source);
          logInfo('Massive crypto ingested', {
            symbol,
            massiveTicker,
            timeframe: tf,
            bars: normalized.length,
          });
        }
      } catch (error) {
        logWarn('Massive crypto backfill failed for symbol', {
          symbol,
          timeframe: tf,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Rate-limit pause between symbols/timeframes
      await sleep(massive.requestDelayMs);
    }
  }

  logInfo('Massive crypto backfill complete');
}

/**
 * Convert a Binance-style crypto symbol (e.g. BTCUSDT, ETHUSDT)
 * to Massive.com format (e.g. X:BTCUSD).
 */
export function convertCryptoSymbol(binanceSymbol: string): string {
  // Strip trailing 'T' from USDT pairs → USD for Massive
  const cleaned = binanceSymbol.replace(/USDT$/i, 'USD');
  return `X:${cleaned.toUpperCase()}`;
}

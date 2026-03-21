import { createHash } from 'node:crypto';
import { getConfig } from '../config.js';
import type {
  FundamentalSnapshotRecord,
  Market,
  NewsItemRecord,
  NormalizedBar,
  OptionChainSnapshotRecord,
  Timeframe
} from '../types.js';
import { fetchWithRetry } from '../utils/http.js';
import { normalizeBars } from './normalize.js';

type JsonObject = Record<string, unknown>;

const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const NEWSAPI_BASE_URL = 'https://newsapi.org/v2';
const YAHOO_OPTIONS_BASE_URLS = [
  'https://query2.finance.yahoo.com/v7/finance/options',
  'https://query1.finance.yahoo.com/v7/finance/options'
];

function hashId(parts: Array<string | number | null | undefined>) {
  return createHash('sha1')
    .update(parts.map((part) => String(part ?? '')).join(':'))
    .digest('hex')
    .slice(0, 24);
}

function safeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : Number.NaN;
}

function round(value: number, digits = 4): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function toDateKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function toDateFromEpochSeconds(value: number | null | undefined): string | null {
  if (!Number.isFinite(Number(value))) return null;
  return new Date(Number(value) * 1000).toISOString().slice(0, 10);
}

function normalizeSymbol(value: string): string {
  return String(value || '').trim().toUpperCase();
}

function normalizeUrl(value: string | null | undefined): string | null {
  const url = String(value || '').trim();
  return url || null;
}

function normalizeHeadlineId(prefix: string, market: Market, symbol: string, headline: string, publishedAtMs: number) {
  return `${prefix}-${hashId([market, symbol, headline, publishedAtMs])}`;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 15_000): Promise<unknown> {
  const response = await fetchWithRetry(
    url,
    init,
    { attempts: 3, baseDelayMs: 1_000 },
    timeoutMs
  );
  if (!response.ok) {
    throw new Error(`Hosted data request failed (${response.status})`);
  }
  return response.json();
}

async function fetchAlphaVantage(functionName: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = String(process.env.ALPHA_VANTAGE_API_KEY || '').trim();
  if (!apiKey) throw new Error('Alpha Vantage API key not configured');

  const url = new URL(ALPHA_VANTAGE_BASE_URL);
  url.searchParams.set('function', functionName);
  url.searchParams.set('apikey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const payload = (await fetchJson(url.toString(), {
    headers: {
      Accept: 'application/json'
    }
  })) as JsonObject;
  if (payload['Error Message']) {
    throw new Error(String(payload['Error Message']));
  }
  return payload;
}

async function fetchFinnhub(path: string, params: Record<string, string>): Promise<unknown> {
  const token = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!token) throw new Error('Finnhub API key not configured');

  const url = new URL(`${FINNHUB_BASE_URL}/${path.replace(/^\/+/, '')}`);
  url.searchParams.set('token', token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return fetchJson(url.toString(), {
    headers: {
      Accept: 'application/json'
    }
  });
}

export async function fetchAlphaVantageDailyBars(symbol: string): Promise<NormalizedBar[]> {
  const payload = (await fetchAlphaVantage('TIME_SERIES_DAILY_ADJUSTED', {
    symbol,
    outputsize: 'full'
  })) as JsonObject;
  const series = payload['Time Series (Daily)'];
  if (!series || typeof series !== 'object') return [];

  const rows = Object.entries(series as Record<string, JsonObject>)
    .map(([date, raw]) => {
      const ts = Date.parse(`${date}T00:00:00.000Z`);
      const open = raw['1. open'];
      const high = raw['2. high'];
      const low = raw['3. low'];
      const close = raw['4. close'];
      const volume = raw['6. volume'] ?? raw['5. volume'];
      if (!Number.isFinite(ts)) return null;
      if (![open, high, low, close].every((value) => Number.isFinite(Number(value)))) return null;
      return {
        ts_open: ts,
        open: String(open),
        high: String(high),
        low: String(low),
        close: String(close),
        volume: Number.isFinite(Number(volume)) ? String(volume) : '0'
      } satisfies NormalizedBar;
    })
    .filter((row): row is NormalizedBar => Boolean(row))
    .sort((a, b) => a.ts_open - b.ts_open);

  return normalizeBars(rows);
}

export async function fetchAlphaVantageFundamentalSnapshot(symbol: string): Promise<FundamentalSnapshotRecord | null> {
  const normalized = normalizeSymbol(symbol);
  if (!String(process.env.ALPHA_VANTAGE_API_KEY || '').trim()) return null;

  const [overview, incomeStatement, balanceSheet, earnings] = await Promise.all([
    fetchAlphaVantage('OVERVIEW', { symbol: normalized }).catch(() => null),
    fetchAlphaVantage('INCOME_STATEMENT', { symbol: normalized }).catch(() => null),
    fetchAlphaVantage('BALANCE_SHEET', { symbol: normalized }).catch(() => null),
    fetchAlphaVantage('EARNINGS', { symbol: normalized }).catch(() => null)
  ]);

  if (!overview && !incomeStatement && !balanceSheet && !earnings) return null;

  const now = Date.now();
  return {
    id: `fund-${hashId(['alpha-vantage', normalized, toDateKey(now)])}`,
    market: 'US',
    symbol: normalized,
    source: 'ALPHA_VANTAGE',
    asof_date: toDateKey(now),
    payload_json: JSON.stringify({
      provider: 'alpha_vantage',
      fetched_at: new Date(now).toISOString(),
      overview,
      income_statement: incomeStatement,
      balance_sheet: balanceSheet,
      earnings
    }),
    updated_at_ms: now
  };
}

export async function fetchFinnhubFundamentalSnapshot(symbol: string): Promise<FundamentalSnapshotRecord | null> {
  const normalized = normalizeSymbol(symbol);
  if (!String(process.env.FINNHUB_API_KEY || '').trim()) return null;

  const [metrics, financials] = await Promise.all([
    fetchFinnhub('stock/metric', { symbol: normalized, metric: 'all' }).catch(() => null),
    fetchFinnhub('stock/financials-reported', { symbol: normalized, freq: 'annual' }).catch(() => null)
  ]);

  if (!metrics && !financials) return null;

  const now = Date.now();
  return {
    id: `fund-${hashId(['finnhub', normalized, toDateKey(now)])}`,
    market: 'US',
    symbol: normalized,
    source: 'FINNHUB',
    asof_date: toDateKey(now),
    payload_json: JSON.stringify({
      provider: 'finnhub',
      fetched_at: new Date(now).toISOString(),
      metrics,
      financials_reported: financials
    }),
    updated_at_ms: now
  };
}

type FinnhubNewsRow = {
  id?: number | string;
  headline?: string;
  source?: string;
  summary?: string;
  url?: string;
  image?: string;
  datetime?: number;
};

export async function fetchFinnhubNewsItems(market: Market, symbol: string): Promise<NewsItemRecord[]> {
  if (market !== 'US') return [];
  if (!String(process.env.FINNHUB_API_KEY || '').trim()) return [];
  const normalized = normalizeSymbol(symbol);
  const to = toDateKey();
  const from = toDateKey(Date.now() - 1000 * 60 * 60 * 24 * 5);
  const payload = (await fetchFinnhub('company-news', {
    symbol: normalized,
    from,
    to
  }).catch(() => [])) as FinnhubNewsRow[];

  if (!Array.isArray(payload)) return [];
  const now = Date.now();
  return payload.slice(0, 6).map((row, index) => {
    const headline = String(row.headline || `${normalized} news`).trim();
    const publishedAtMs = Number(row.datetime) > 0 ? Number(row.datetime) * 1000 : now - index * 60_000;
    return {
      id: normalizeHeadlineId('news-finnhub', market, normalized, headline, publishedAtMs),
      market,
      symbol: normalized,
      headline,
      source: String(row.source || 'Finnhub').trim() || 'Finnhub',
      url: normalizeUrl(row.url),
      published_at_ms: publishedAtMs,
      sentiment_label: 'NEUTRAL',
      relevance_score: 0.45,
      payload_json: JSON.stringify({
        provider: 'finnhub_news',
        summary: String(row.summary || '').trim() || null,
        imageUrl: normalizeUrl(row.image)
      }),
      updated_at_ms: now
    } satisfies NewsItemRecord;
  });
}

type NewsApiArticle = {
  title?: string;
  description?: string;
  url?: string;
  urlToImage?: string;
  publishedAt?: string;
  source?: {
    name?: string;
  };
};

export async function fetchNewsApiItems(market: Market, symbol: string, query: string): Promise<NewsItemRecord[]> {
  const apiKey = String(process.env.NEWSAPI_API_KEY || '').trim();
  if (!apiKey) return [];

  const url = new URL(`${NEWSAPI_BASE_URL}/everything`);
  url.searchParams.set('q', query);
  url.searchParams.set('language', 'en');
  url.searchParams.set('pageSize', '6');
  url.searchParams.set('sortBy', 'publishedAt');

  const payload = (await fetchJson(
    url.toString(),
    {
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json'
      }
    },
    15_000
  ).catch(() => null)) as { articles?: NewsApiArticle[] } | null;

  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  const now = Date.now();
  const normalized = normalizeSymbol(symbol);
  return articles.map((row, index) => {
    const headline = String(row.title || `${normalized} news`).trim();
    const publishedAtMs = Date.parse(String(row.publishedAt || '')) || now - index * 60_000;
    return {
      id: normalizeHeadlineId('news-newsapi', market, normalized, headline, publishedAtMs),
      market,
      symbol: normalized,
      headline,
      source: String(row.source?.name || 'NewsAPI').trim() || 'NewsAPI',
      url: normalizeUrl(row.url),
      published_at_ms: publishedAtMs,
      sentiment_label: 'NEUTRAL',
      relevance_score: 0.42,
      payload_json: JSON.stringify({
        provider: 'newsapi',
        summary: String(row.description || '').trim() || null,
        imageUrl: normalizeUrl(row.urlToImage)
      }),
      updated_at_ms: now
    } satisfies NewsItemRecord;
  });
}

type YahooOptionsContract = {
  contractSymbol?: string;
  strike?: number;
  currency?: string;
  lastPrice?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  inTheMoney?: boolean;
};

type YahooOptionsResponse = {
  optionChain?: {
    result?: Array<{
      expirationDates?: number[];
      quote?: {
        regularMarketPrice?: number;
      };
      options?: Array<{
        expirationDate?: number;
        calls?: YahooOptionsContract[];
        puts?: YahooOptionsContract[];
      }>;
    }>;
  };
};

type CboeOptionsContract = {
  option?: string;
  iv?: number | string;
  open_interest?: number | string;
  volume?: number | string;
  delta?: number | string;
  gamma?: number | string;
};

type CboeOptionsResponse = {
  timestamp?: string;
  data?: {
    options?: CboeOptionsContract[];
    current_price?: number | string;
  };
};

function summarizeContracts(symbol: string, expiryEpochSeconds: number, spotPrice: number, calls: YahooOptionsContract[], puts: YahooOptionsContract[]) {
  const callIvs = calls.map((row) => safeNumber(row.impliedVolatility)).filter((row) => Number.isFinite(row));
  const putIvs = puts.map((row) => safeNumber(row.impliedVolatility)).filter((row) => Number.isFinite(row));
  const avgCallIv = callIvs.length ? callIvs.reduce((sum, row) => sum + row, 0) / callIvs.length : 0;
  const avgPutIv = putIvs.length ? putIvs.reduce((sum, row) => sum + row, 0) / putIvs.length : 0;
  const totalCallOi = calls.reduce((sum, row) => sum + Math.max(0, Number(row.openInterest) || 0), 0);
  const totalPutOi = puts.reduce((sum, row) => sum + Math.max(0, Number(row.openInterest) || 0), 0);
  const totalCallVolume = calls.reduce((sum, row) => sum + Math.max(0, Number(row.volume) || 0), 0);
  const totalPutVolume = puts.reduce((sum, row) => sum + Math.max(0, Number(row.volume) || 0), 0);
  return {
    underlying_symbol: symbol,
    spot_price: Number.isFinite(spotPrice) ? round(spotPrice, 4) : null,
    expiration_date: toDateFromEpochSeconds(expiryEpochSeconds),
    contracts_count: calls.length + puts.length,
    average_call_iv: Number.isFinite(avgCallIv) ? round(avgCallIv, 6) : null,
    average_put_iv: Number.isFinite(avgPutIv) ? round(avgPutIv, 6) : null,
    iv_skew: Number.isFinite(avgCallIv - avgPutIv) ? round(avgCallIv - avgPutIv, 6) : null,
    total_open_interest: totalCallOi + totalPutOi,
    call_open_interest: totalCallOi,
    put_open_interest: totalPutOi,
    total_volume: totalCallVolume + totalPutVolume,
    put_call_open_interest_ratio: totalCallOi > 0 ? round(totalPutOi / totalCallOi, 6) : null
  };
}

async function fetchYahooOptionChain(symbol: string, expiryEpochSeconds?: number): Promise<YahooOptionsResponse> {
  let lastError: unknown = null;
  for (const baseUrl of YAHOO_OPTIONS_BASE_URLS) {
    try {
      const url = new URL(`${baseUrl}/${encodeURIComponent(symbol)}`);
      if (Number.isFinite(expiryEpochSeconds)) {
        url.searchParams.set('date', String(expiryEpochSeconds));
      }
      return (await fetchJson(url.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 NovaQuant/1.0',
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/options`
        }
      })) as YahooOptionsResponse;
    } catch (error) {
      lastError = error;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error('Yahoo options fetch failed'));
}

async function fetchCboeOptionSnapshot(symbol: string): Promise<OptionChainSnapshotRecord | null> {
  const normalized = normalizeSymbol(symbol);
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(normalized)}.json`;
  const payload = (await fetchJson(
    url,
    {
      headers: {
        Referer: 'https://www.cboe.com/',
        'User-Agent': 'Mozilla/5.0 NovaQuant/1.0',
        Accept: 'application/json'
      }
    },
    20_000
  )) as CboeOptionsResponse;

  const options = Array.isArray(payload?.data?.options) ? payload.data.options : [];
  if (!options.length) return null;

  const clean = options.filter((row) => Number.isFinite(Number(row.iv)) && Number.isFinite(Number(row.open_interest)));
  if (!clean.length) return null;

  const spot = safeNumber(payload?.data?.current_price);
  let ivNum = 0;
  let ivDen = 0;
  let totalOi = 0;
  let totalVol = 0;
  let absDeltaNum = 0;
  let absDeltaDen = 0;
  let gammaExposure = 0;

  for (const row of clean) {
    const iv = Number(row.iv || 0);
    const oi = Number(row.open_interest || 0);
    const vol = Number(row.volume || 0);
    const weight = Math.max(oi, vol, 1);
    totalOi += Math.max(0, oi);
    totalVol += Math.max(0, vol);
    ivNum += iv * weight;
    ivDen += weight;
    absDeltaNum += Math.abs(Number(row.delta || 0)) * weight;
    absDeltaDen += weight;
    gammaExposure += Number(row.gamma || 0) * oi * 100 * Math.max(Number(spot || 0), 0) ** 2;
  }

  const now = Date.now();
  return {
    id: `opt-${hashId(['cboe-options', normalized, now])}`,
    market: 'US',
    symbol: normalized,
    expiration_date: null,
    snapshot_ts_ms: now,
    source: 'CBOE_OPTIONS',
    payload_json: JSON.stringify({
      provider: 'cboe_options',
      fetched_at: new Date(now).toISOString(),
      summary: {
        underlying_symbol: normalized,
        spot_price: Number.isFinite(spot) ? round(spot, 4) : null,
        expiration_date: null,
        contracts_count: clean.length,
        average_call_iv: ivDen ? round(ivNum / ivDen, 6) : null,
        average_put_iv: null,
        iv_skew: null,
        total_open_interest: totalOi,
        call_open_interest: null,
        put_open_interest: null,
        total_volume: totalVol,
        put_call_open_interest_ratio: null,
        avg_abs_delta: absDeltaDen ? round(absDeltaNum / absDeltaDen, 6) : null,
        gamma_exposure: Number.isFinite(gammaExposure) ? round(gammaExposure, 2) : null
      }
    }),
    updated_at_ms: now
  };
}

function snapshotFromYahooOptionsPayload(args: {
  symbol: string;
  now: number;
  payload: YahooOptionsResponse | null;
}): OptionChainSnapshotRecord | null {
  const primary = args.payload?.optionChain?.result?.[0];
  const optionEntry = primary?.options?.[0];
  if (!primary || !optionEntry) return null;
  const spot = safeNumber(primary.quote?.regularMarketPrice);
  const expiryEpochSeconds = Number(optionEntry.expirationDate);
  const summary = summarizeContracts(
    args.symbol,
    expiryEpochSeconds,
    spot,
    Array.isArray(optionEntry.calls) ? optionEntry.calls : [],
    Array.isArray(optionEntry.puts) ? optionEntry.puts : []
  );
  return {
    id: `opt-${hashId(['yahoo-options', args.symbol, summary.expiration_date, args.now])}`,
    market: 'US',
    symbol: args.symbol,
    expiration_date: summary.expiration_date,
    snapshot_ts_ms: args.now,
    source: 'YAHOO_OPTIONS',
    payload_json: JSON.stringify({
      provider: 'yahoo_options',
      fetched_at: new Date(args.now).toISOString(),
      summary
    }),
    updated_at_ms: args.now
  };
}

export async function fetchYahooOptionSnapshots(symbol: string, maxExpirations = 2): Promise<OptionChainSnapshotRecord[]> {
  const normalized = normalizeSymbol(symbol);
  let rootError: unknown = null;
  const root = await fetchYahooOptionChain(normalized).catch((error) => {
    rootError = error;
    return null;
  });
  const primary = root?.optionChain?.result?.[0];
  if (!primary) {
    const rootMessage = rootError instanceof Error ? rootError.message : String(rootError || '');
    if (rootMessage.includes('(401)')) {
      const fallback = await fetchCboeOptionSnapshot(normalized).catch(() => null);
      if (fallback) return [fallback];
    }
    throw (rootError instanceof Error ? rootError : new Error(`Yahoo options root response missing result for ${normalized}`));
  }

  const expirations = Array.isArray(primary.expirationDates) ? primary.expirationDates.slice(0, maxExpirations) : [];
  const now = Date.now();
  const snapshots: OptionChainSnapshotRecord[] = [];
  let datedError: unknown = null;
  const rootSnapshot = snapshotFromYahooOptionsPayload({
    symbol: normalized,
    now,
    payload: root
  });
  if (rootSnapshot) {
    snapshots.push(rootSnapshot);
  }

  for (const expiryEpochSeconds of expirations) {
    if (rootSnapshot?.expiration_date === toDateFromEpochSeconds(expiryEpochSeconds)) continue;
    const payload = await fetchYahooOptionChain(normalized, expiryEpochSeconds).catch((error) => {
      datedError = error;
      return null;
    });
    const snapshot = snapshotFromYahooOptionsPayload({
      symbol: normalized,
      now,
      payload
    });
    if (snapshot) snapshots.push(snapshot);
  }

  const deduped = new Map<string, OptionChainSnapshotRecord>();
  for (const row of snapshots) {
    const key = `${row.symbol}:${row.expiration_date || 'none'}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  const rows = [...deduped.values()];
  if (!rows.length) {
    throw (
      (datedError instanceof Error && datedError) ||
      (rootError instanceof Error && rootError) ||
      new Error(`Yahoo options returned no option snapshots for ${normalized}`)
    );
  }
  return rows;
}

export async function backfillAlphaVantageDaily(params: {
  repo: import('../db/repository.js').MarketRepository;
  symbols: string[];
  timeframe: Timeframe;
  source?: string;
}): Promise<void> {
  if (params.timeframe !== '1d') {
    throw new Error('Alpha Vantage backfill currently supports only 1d timeframe');
  }
  const venue = getConfig().markets.US.venue || 'ALPHA_VANTAGE';
  const source = params.source || 'ALPHA_VANTAGE_DAILY';
  for (const rawSymbol of params.symbols) {
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol) continue;
    const asset = params.repo.upsertAsset({
      market: 'US',
      symbol,
      venue,
      quote: 'USD',
      status: 'ACTIVE'
    });
    const bars = await fetchAlphaVantageDailyBars(symbol);
    params.repo.upsertOhlcvBars(asset.asset_id, '1d', bars, source);
    if (bars.length) {
      params.repo.setCursor(asset.asset_id, '1d', bars[bars.length - 1].ts_open, source);
    }
  }
}

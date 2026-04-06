import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketRepository } from '../../db/repository.js';
import { getRuntimeRepo } from '../../db/runtimeRepository.js';
import { getConfig } from '../../config.js';
import type { AssetClass, Market, Timeframe } from '../../types.js';
import {
  buildNewsContext,
  ensureFreshNewsForSymbol,
  ensureFreshNewsForUniverse,
} from '../../news/provider.js';
import { fetchWithRetry } from '../../utils/http.js';
import { getPublicBrowseHome } from '../../public/browseService.js';
import { recordFrontendCacheOutcome } from '../../observability/spine.js';

type AssetSearchResult = {
  symbol: string;
  name: string;
  hint: string;
  market: Market;
  assetClass: AssetClass;
  venue: string | null;
  source: 'live' | 'reference' | 'remote';
  score: number;
};

type ReferenceUniverseInstrument = {
  symbol: string;
  market: string;
  category?: string;
  notes?: string;
};

type SearchCandidate = {
  symbol: string;
  market: Market;
  assetClass: AssetClass;
  venue: string | null;
  name: string;
  hint: string;
  source: 'live' | 'reference' | 'remote';
  aliases: string[];
  heuristicDirect?: boolean;
};

type BrowseChartPoint = {
  ts: number;
  close: number;
  label?: string | null;
};

type BrowseChartSnapshot = {
  requestedSymbol: string;
  resolvedSymbol: string;
  market: Market;
  name: string;
  venue: string | null;
  currency: string;
  source: string;
  sourceStatus: 'LIVE' | 'CACHED';
  timeframe: string;
  asOf: string | null;
  latest: number | null;
  previousClose: number | null;
  change: number | null;
  points: BrowseChartPoint[];
  note: string;
};

type BrowseNewsFeedItem = {
  id: string;
  market: Market;
  symbol: string;
  headline: string;
  source: string;
  publisher?: string | null;
  sourceUrl?: string | null;
  url: string | null;
  publishedAt: string | null;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL';
  relevance: number;
  summary?: string | null;
  imageUrl?: string | null;
};

type BrowseAssetOverview = {
  symbol: string;
  market: Market;
  name: string;
  venue: string | null;
  currency: string;
  assetType: string;
  profile: {
    tradingVenue: string | null;
    quoteCurrency: string;
    tradingSchedule: string;
    proxyType: string;
  };
  tradingStats: {
    latestClose: number | null;
    previousClose: number | null;
    changePct: number | null;
    rangeHigh: number | null;
    rangeLow: number | null;
    avgVolume30d: number | null;
    latestVolume: number | null;
    barsAvailable: number;
  };
  fundamentals: Array<{ label: string; value: string; source: 'derived' | 'live' | 'reference' }>;
  earnings: {
    status: string;
    note: string;
  };
  relatedEtfs: string[];
  optionEntries: Array<{ label: string; description: string }>;
  newsContext: ReturnType<typeof buildNewsContext>;
  topNews: BrowseNewsFeedItem[];
};

type BrowseAssetDetailBundle = {
  chart: BrowseChartSnapshot | null;
  overview: BrowseAssetOverview | null;
  news: BrowseNewsFeedItem[];
};

const referenceUniverseFiles = [
  'us_equities_extended.json',
  'us_equities_core.json',
  'us_sector_etfs.json',
  'market_proxies.json',
  'crypto_core.json',
];

const commonEquityAliases: Record<string, string[]> = {
  AAPL: ['apple'],
  MSFT: ['microsoft'],
  NVDA: ['nvidia'],
  AMZN: ['amazon'],
  GOOGL: ['google', 'alphabet'],
  META: ['meta', 'facebook'],
  TSLA: ['tesla'],
  NFLX: ['netflix'],
  AMD: ['amd', 'advanced micro devices'],
  PLTR: ['palantir'],
  COIN: ['coinbase'],
  UBER: ['uber'],
  'BRK.B': ['berkshire', 'berkshire hathaway'],
};

const commonCryptoNames: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc'],
  ETH: ['ethereum', 'eth'],
  SOL: ['solana', 'sol'],
  BNB: ['bnb', 'binance coin'],
  XRP: ['xrp', 'ripple'],
  DOGE: ['dogecoin', 'doge'],
  ADA: ['cardano', 'ada'],
  TRX: ['tron', 'trx'],
  AVAX: ['avalanche', 'avax'],
  LINK: ['chainlink', 'link'],
  LTC: ['litecoin', 'ltc'],
  TON: ['ton', 'the open network'],
};

const knownEtfSymbols = new Set([
  'SPY',
  'QQQ',
  'IWM',
  'DIA',
  'ARKK',
  'XLK',
  'XLF',
  'XLE',
  'XLV',
  'XLI',
  'XLY',
  'XLP',
  'XLB',
  'XLRE',
  'XLU',
  'XLC',
  'SMH',
  'SOXX',
  'VTI',
  'VOO',
]);

const relatedEtfMap: Record<string, string[]> = {
  AAPL: ['QQQ', 'XLK', 'VTI'],
  MSFT: ['QQQ', 'XLK', 'VUG'],
  NVDA: ['SMH', 'SOXX', 'QQQ'],
  AMD: ['SMH', 'SOXX', 'XLK'],
  META: ['XLC', 'QQQ', 'VUG'],
  AMZN: ['XLY', 'QQQ', 'VTI'],
  GOOGL: ['XLC', 'QQQ', 'VUG'],
  TSLA: ['XLY', 'ARKK', 'QQQ'],
  NFLX: ['XLC', 'QQQ', 'VUG'],
  COIN: ['ARKK', 'IBIT', 'VGT'],
  BTC: ['IBIT', 'FBTC', 'ARKB'],
  BTCUSDT: ['IBIT', 'FBTC', 'ARKB'],
  ETH: ['ETHA', 'ETHE', 'QQQ'],
  ETHUSDT: ['ETHA', 'ETHE', 'QQQ'],
  SOL: ['ARKK', 'QQQ', 'SMH'],
  SOLUSDT: ['ARKK', 'QQQ', 'SMH'],
};

const REMOTE_SEARCH_TTL_MS = 1000 * 60 * 8;
const REMOTE_SEARCH_TIMEOUT_MS = 3200;
const SEC_UNIVERSE_TTL_MS = 1000 * 60 * 60 * 24;
const BROWSE_SERVER_CACHE_MIN_TTL_MS = 5_000;
const browseServerReadCache = new Map<string, { expiresAt: number; value: unknown }>();
const browseServerReadInflight = new Map<string, Promise<unknown>>();
const remoteSearchCache = new Map<string, { expiresAt: number; results: SearchCandidate[] }>();
let cachedReferenceSearchUniverse: SearchCandidate[] | null = null;
let cachedSecUniverse: { expiresAt: number; results: SearchCandidate[] } | null = null;

function getRepo(): MarketRepository {
  return getRuntimeRepo();
}

function normalizeSearchText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '');
}

function stableCacheValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableCacheValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableCacheValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function buildBrowseServerReadCacheKey(scope: string, args: unknown) {
  return `${scope}:${JSON.stringify(stableCacheValue(args))}`;
}

async function cachedBrowseServerRead<T>(
  scope: string,
  args: unknown,
  read: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const key = buildBrowseServerReadCacheKey(scope, args);
  const now = Date.now();
  const cached = browseServerReadCache.get(key);
  if (cached && cached.expiresAt > now) {
    recordFrontendCacheOutcome(scope, 'hit');
    return cached.value as T;
  }

  const inflight = browseServerReadInflight.get(key);
  if (inflight) {
    recordFrontendCacheOutcome(scope, 'inflight');
    return (await inflight) as T;
  }

  recordFrontendCacheOutcome(scope, 'miss');
  const next = read()
    .then((value) => {
      browseServerReadCache.set(key, {
        value,
        expiresAt: Date.now() + Math.max(BROWSE_SERVER_CACHE_MIN_TTL_MS, ttlMs),
      });
      return value;
    })
    .finally(() => {
      browseServerReadInflight.delete(key);
    });
  browseServerReadInflight.set(key, next as Promise<unknown>);
  return await next;
}

export function __resetBrowseServerReadCacheForTesting() {
  browseServerReadCache.clear();
  browseServerReadInflight.clear();
}

function sentenceCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function parseNumericValue(value: unknown): number | null {
  const next = Number(
    String(value ?? '')
      .replace(/[$,%\s,]/g, '')
      .trim(),
  );
  return Number.isFinite(next) ? next : null;
}

function formatCompactMetric(value: number | null, digits = 2): string {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value as number);
  if (abs >= 1_000_000_000) return `${((value as number) / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${((value as number) / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${((value as number) / 1_000).toFixed(1)}K`;
  return Number(value).toFixed(digits);
}

const cryptoAliasLookup = Object.entries(commonCryptoNames).reduce<Record<string, string>>(
  (acc, [symbol, aliases]) => {
    acc[normalizeSearchText(symbol)] = symbol;
    aliases.forEach((alias) => {
      acc[normalizeSearchText(alias)] = symbol;
    });
    return acc;
  },
  {},
);

function getAlphaVantageApiKey(): string {
  return String(
    process.env.ALPHA_VANTAGE_API_KEY ||
      process.env.ALPHAVANTAGE_API_KEY ||
      process.env.NOVA_SEARCH_ALPHA_VANTAGE_KEY ||
      '',
  ).trim();
}

function getCoinGeckoApiKey(): string {
  return String(
    process.env.COINGECKO_DEMO_API_KEY ||
      process.env.COINGECKO_API_KEY ||
      process.env.COINGECKO_PRO_API_KEY ||
      '',
  ).trim();
}

function getSearchUserAgent(): string {
  return String(
    process.env.BROWSE_SEARCH_USER_AGENT || 'NovaQuant/1.0 support@novaquant.local',
  ).trim();
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = REMOTE_SEARCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function cacheRemoteSearch(key: string, results: SearchCandidate[]) {
  remoteSearchCache.set(key, {
    expiresAt: Date.now() + REMOTE_SEARCH_TTL_MS,
    results,
  });
}

function readRemoteSearchCache(key: string): SearchCandidate[] | null {
  const hit = remoteSearchCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    remoteSearchCache.delete(key);
    return null;
  }
  return hit.results;
}

function searchUniverseDir(): string {
  const queriesDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(queriesDir, '../../../../data/reference_universes');
}

function parseCryptoBaseQuote(symbol: string): { base: string; quote: string } | null {
  const upper = String(symbol || '').toUpperCase();
  if (upper.endsWith('USDT') && upper.length > 4) {
    return { base: upper.slice(0, -4), quote: 'USDT' };
  }
  return null;
}

function parseCryptoLookupSymbol(
  value: string,
): { base: string; quote: string; resolvedSymbol: string; gatePair: string } | null {
  const compact = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace('/', '_')
    .replace('-', '_');

  const exactPair = compact.match(/^([A-Z0-9]{2,15})_?(USDT|USD)$/);
  if (exactPair) {
    const [, base, quote] = exactPair;
    return {
      base,
      quote,
      resolvedSymbol: `${base}${quote}`,
      gatePair: `${base}_${quote}`,
    };
  }

  const alias = cryptoAliasLookup[normalizeSearchText(compact)];
  if (alias) {
    return {
      base: alias,
      quote: 'USDT',
      resolvedSymbol: `${alias}USDT`,
      gatePair: `${alias}_USDT`,
    };
  }

  return null;
}

function normalizeBrowseNewsItem(row: import('../../types.js').NewsItemRecord): BrowseNewsFeedItem {
  let payload: Record<string, unknown> | null = null;
  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : null;
  } catch {
    payload = null;
  }
  return {
    id: row.id,
    market: row.market === 'CRYPTO' ? 'CRYPTO' : 'US',
    symbol: String(row.symbol || '').toUpperCase(),
    headline: row.headline,
    source: row.source,
    publisher: typeof payload?.publisher === 'string' ? payload.publisher : row.source,
    sourceUrl: typeof payload?.sourceUrl === 'string' ? payload.sourceUrl : null,
    url: row.url || null,
    publishedAt: Number.isFinite(row.published_at_ms)
      ? new Date(row.published_at_ms).toISOString()
      : null,
    sentiment: row.sentiment_label,
    relevance: Number(row.relevance_score || 0),
    summary: typeof payload?.summary === 'string' ? payload.summary : null,
    imageUrl: typeof payload?.imageUrl === 'string' ? payload.imageUrl : null,
  };
}

function deriveRelatedEtfs(symbol: string, market: Market): string[] {
  const upper = String(symbol || '').toUpperCase();
  if (relatedEtfMap[upper]?.length) return relatedEtfMap[upper];
  if (market === 'CRYPTO') return ['IBIT', 'FBTC', 'ARKB'];
  return ['SPY', 'QQQ', 'VTI'];
}

function deriveOptionEntries(args: {
  market: Market;
  symbol: string;
}): Array<{ label: string; description: string }> {
  if (args.market !== 'US') {
    return [
      { label: 'Perps', description: 'Perpetual/futures execution context' },
      { label: 'Basis', description: 'Cross-venue basis and carry view' },
    ];
  }
  return [
    { label: 'Calls', description: `${args.symbol} bullish directional options entry` },
    { label: 'Puts', description: `${args.symbol} downside hedge and event protection` },
    { label: 'Flow', description: 'Watch unusual flow and implied vol shifts' },
  ];
}

function buildDirectEquityCandidate(symbolInput: string): SearchCandidate {
  const symbol = String(symbolInput || '')
    .trim()
    .toUpperCase();
  return {
    symbol,
    market: 'US',
    assetClass: 'US_STOCK',
    venue: null,
    name: symbol,
    hint: 'Direct ticker lookup',
    source: 'remote',
    aliases: [symbol],
    heuristicDirect: true,
  };
}

function buildDirectCryptoCandidate(symbolInput: string): SearchCandidate {
  const pair = parseCryptoLookupSymbol(symbolInput);
  const base =
    pair?.base ||
    String(symbolInput || '')
      .trim()
      .toUpperCase();
  const quote = pair?.quote || 'USDT';
  const symbol = pair?.resolvedSymbol || base;
  return {
    symbol,
    market: 'CRYPTO',
    assetClass: 'CRYPTO',
    venue: 'GATEIO',
    name: `${base} / ${quote}`,
    hint: 'Direct crypto lookup',
    source: 'remote',
    aliases: [
      symbol,
      base,
      `${base}${quote}`,
      `${base}/${quote}`,
      symbolInput,
      ...(commonCryptoNames[base] || []),
    ],
    heuristicDirect: true,
  };
}

function buildHeuristicSearchCandidates(query: string, market?: Market): SearchCandidate[] {
  const trimmed = String(query || '').trim();
  const compact = trimmed.toUpperCase().replace(/\s+/g, '');
  const normalized = normalizeSearchText(trimmed);
  const isAllUpperOrLower = trimmed === compact || trimmed === compact.toLowerCase();
  const candidates = new Map<string, SearchCandidate>();

  if (!compact) return [];

  if (
    (!market || market === 'US') &&
    /^[A-Z][A-Z0-9.]{0,9}$/.test(compact) &&
    isAllUpperOrLower &&
    !compact.includes('/') &&
    !compact.includes('-') &&
    !compact.endsWith('USDT') &&
    !compact.endsWith('USD') &&
    !cryptoAliasLookup[normalized]
  ) {
    const candidate = buildDirectEquityCandidate(compact);
    candidates.set(`${candidate.market}:${candidate.symbol}`, candidate);
  }

  const cryptoSymbol = cryptoAliasLookup[normalized] || compact;
  if (
    (!market || market === 'CRYPTO') &&
    (Boolean(cryptoAliasLookup[normalized]) ||
      /[/_-]/.test(compact) ||
      compact.endsWith('USDT') ||
      compact.endsWith('USD'))
  ) {
    const candidate = buildDirectCryptoCandidate(cryptoSymbol);
    candidates.set(`${candidate.market}:${candidate.symbol}`, candidate);
  }

  return Array.from(candidates.values());
}

function buildLiveAssetCandidate(
  asset: ReturnType<MarketRepository['listAssets']>[number],
): SearchCandidate {
  const market = asset.market === 'CRYPTO' ? 'CRYPTO' : 'US';
  const assetClass = market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK';
  const cryptoPair = parseCryptoBaseQuote(asset.symbol);
  const base = asset.base || cryptoPair?.base || null;
  const quote = asset.quote || cryptoPair?.quote || null;
  const aliases = [
    asset.symbol,
    base,
    quote ? `${base || ''}${quote}` : null,
    base && quote ? `${base}/${quote}` : null,
    ...(base ? commonCryptoNames[base] || [] : []),
    ...(commonEquityAliases[asset.symbol] || []),
  ].filter(Boolean) as string[];

  return {
    symbol: asset.symbol,
    market,
    assetClass,
    venue: asset.venue,
    name:
      market === 'CRYPTO' ? `${base || asset.symbol}${quote ? ` / ${quote}` : ''}` : asset.symbol,
    hint:
      market === 'CRYPTO'
        ? `Crypto${asset.venue ? ` · ${asset.venue}` : ''}`
        : `US stock${asset.venue ? ` · ${asset.venue}` : ''}`,
    source: 'live',
    aliases,
  };
}

function buildReferenceAssetCandidate(item: ReferenceUniverseInstrument): SearchCandidate {
  const isCrypto = String(item.market || '')
    .toUpperCase()
    .includes('CRYPTO');
  const market: Market = isCrypto ? 'CRYPTO' : 'US';
  const assetClass: AssetClass = isCrypto ? 'CRYPTO' : 'US_STOCK';
  const pair = parseCryptoBaseQuote(item.symbol);
  const base = pair?.base || null;
  const quote = pair?.quote || null;
  const aliases = [
    item.symbol,
    base,
    quote ? `${base || ''}${quote}` : null,
    base && quote ? `${base}/${quote}` : null,
    item.category,
    ...(base ? commonCryptoNames[base] || [] : []),
    ...(commonEquityAliases[item.symbol] || []),
  ].filter(Boolean) as string[];

  return {
    symbol: item.symbol,
    market,
    assetClass,
    venue: null,
    name: market === 'CRYPTO' ? `${base || item.symbol}${quote ? ` / ${quote}` : ''}` : item.symbol,
    hint:
      market === 'CRYPTO'
        ? sentenceCase(item.category || 'crypto')
        : sentenceCase(item.category || 'US equity'),
    source: 'reference',
    aliases,
  };
}

function buildRemoteEquityCandidate(input: {
  symbol: string;
  name: string;
  region?: string;
  exchange?: string;
  currency?: string;
  type?: string;
}): SearchCandidate {
  const symbol = String(input.symbol || '').toUpperCase();
  const region = String(input.region || '').trim();
  const exchange = String(input.exchange || '').trim();
  const type = String(input.type || '').trim();
  const currency = String(input.currency || '').trim();
  const aliases = [
    symbol,
    input.name,
    region,
    exchange,
    type,
    ...(commonEquityAliases[symbol] || []),
  ].filter(Boolean) as string[];
  const hintParts = [type || 'Equity', region, exchange, currency].filter(Boolean);

  return {
    symbol,
    market: 'US',
    assetClass: 'US_STOCK',
    venue: exchange || null,
    name: String(input.name || symbol).trim() || symbol,
    hint: hintParts.join(' · '),
    source: 'remote',
    aliases,
  };
}

function buildRemoteCryptoCandidate(input: {
  symbol: string;
  name: string;
  rank?: number | null;
}): SearchCandidate {
  const symbol = String(input.symbol || '').toUpperCase();
  const aliases = [symbol, input.name, ...(commonCryptoNames[symbol] || [])].filter(
    Boolean,
  ) as string[];
  const rank =
    Number.isFinite(Number(input.rank)) && Number(input.rank) > 0
      ? `Rank #${Number(input.rank)}`
      : 'Crypto asset';

  return {
    symbol,
    market: 'CRYPTO',
    assetClass: 'CRYPTO',
    venue: null,
    name: String(input.name || symbol).trim() || symbol,
    hint: rank,
    source: 'remote',
    aliases,
  };
}

async function getSecSearchUniverse(): Promise<SearchCandidate[]> {
  if (cachedSecUniverse && cachedSecUniverse.expiresAt > Date.now()) {
    return cachedSecUniverse.results;
  }

  try {
    const payload = (await fetchJsonWithTimeout('https://www.sec.gov/files/company_tickers.json', {
      headers: {
        'user-agent': getSearchUserAgent(),
        accept: 'application/json',
      },
    })) as Record<string, { ticker?: string; title?: string }>;

    const results = Object.values(payload || {})
      .map((row) =>
        buildRemoteEquityCandidate({
          symbol: String(row?.ticker || '').toUpperCase(),
          name: String(row?.title || '').trim(),
          type: 'Equity',
          region: 'United States',
          exchange: 'SEC',
          currency: 'USD',
        }),
      )
      .filter((candidate) => candidate.symbol);

    cachedSecUniverse = {
      expiresAt: Date.now() + SEC_UNIVERSE_TTL_MS,
      results,
    };
    return results;
  } catch {
    return [];
  }
}

async function searchAlphaVantageEquities(
  query: string,
  limit: number,
): Promise<SearchCandidate[]> {
  const apiKey = getAlphaVantageApiKey();
  if (!apiKey) return [];

  const cacheKey = `alpha:${normalizeSearchText(query)}:${limit}`;
  const cached = readRemoteSearchCache(cacheKey);
  if (cached) return cached;

  try {
    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'SYMBOL_SEARCH');
    url.searchParams.set('keywords', query);
    url.searchParams.set('apikey', apiKey);

    const payload = (await fetchJsonWithTimeout(url.toString())) as {
      bestMatches?: Array<Record<string, string>>;
    };

    const results = (payload.bestMatches || [])
      .map((row) =>
        buildRemoteEquityCandidate({
          symbol: row['1. symbol'],
          name: row['2. name'],
          type: row['3. type'],
          region: row['4. region'],
          exchange: row['4. region'] === 'United States' ? 'US' : row['4. region'],
          currency: row['8. currency'],
        }),
      )
      .filter((candidate) => candidate.symbol)
      .slice(0, limit);

    cacheRemoteSearch(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

async function searchCoinGeckoCrypto(query: string, limit: number): Promise<SearchCandidate[]> {
  const cacheKey = `coingecko:${normalizeSearchText(query)}:${limit}`;
  const cached = readRemoteSearchCache(cacheKey);
  if (cached) return cached;

  const headers: Record<string, string> = {};
  const apiKey = getCoinGeckoApiKey();
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  try {
    const url = new URL('https://api.coingecko.com/api/v3/search');
    url.searchParams.set('query', query);
    const payload = (await fetchJsonWithTimeout(url.toString(), { headers })) as {
      coins?: Array<{ symbol?: string; name?: string; market_cap_rank?: number | null }>;
    };

    const results = (payload.coins || [])
      .map((row) =>
        buildRemoteCryptoCandidate({
          symbol: row.symbol || '',
          name: row.name || '',
          rank: row.market_cap_rank,
        }),
      )
      .filter((candidate) => candidate.symbol)
      .slice(0, limit);

    cacheRemoteSearch(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

async function searchRemoteAssets(
  query: string,
  limit: number,
  market?: Market,
): Promise<SearchCandidate[]> {
  if (query.trim().length < 2) return [];

  const tasks: Promise<SearchCandidate[]>[] = [];
  if (!market || market === 'US') {
    tasks.push(getSecSearchUniverse());
    tasks.push(searchAlphaVantageEquities(query, limit));
  }
  if (!market || market === 'CRYPTO') {
    tasks.push(searchCoinGeckoCrypto(query, limit));
  }

  if (!tasks.length) return [];

  const settled = await Promise.allSettled(tasks);
  const merged = new Map<string, SearchCandidate>();
  settled.forEach((row) => {
    if (row.status !== 'fulfilled') return;
    row.value
      .filter((candidate) => scoreAssetCandidate(query, candidate) > 0)
      .forEach((candidate) => {
        const key = `${candidate.market}:${candidate.symbol}`;
        if (!merged.has(key)) merged.set(key, candidate);
      });
  });
  return Array.from(merged.values()).slice(0, limit * 3);
}

function getReferenceSearchUniverse(): SearchCandidate[] {
  if (cachedReferenceSearchUniverse) return cachedReferenceSearchUniverse;
  const byKey = new Map<string, SearchCandidate>();
  for (const file of referenceUniverseFiles) {
    const filePath = path.join(searchUniverseDir(), file);
    if (!fs.existsSync(filePath)) continue;
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      instruments?: ReferenceUniverseInstrument[];
    };
    for (const item of payload.instruments || []) {
      if (!item?.symbol) continue;
      const candidate = buildReferenceAssetCandidate(item);
      const key = `${candidate.market}:${candidate.symbol}`;
      if (!byKey.has(key)) {
        byKey.set(key, candidate);
      }
    }
  }
  cachedReferenceSearchUniverse = Array.from(byKey.values());
  return cachedReferenceSearchUniverse;
}

export function getReferenceSearchAssetCount(market?: Market) {
  return getReferenceSearchUniverse().filter((candidate) => !market || candidate.market === market)
    .length;
}

function scoreAssetCandidate(query: string, candidate: SearchCandidate): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;
  const symbol = normalizeSearchText(candidate.symbol);
  const name = normalizeSearchText(candidate.name);
  const hint = normalizeSearchText(candidate.hint);
  const exactHeuristicPenalty = candidate.heuristicDirect ? 260 : 0;
  const prefixHeuristicPenalty = candidate.heuristicDirect ? 120 : 0;
  let score = 0;

  if (symbol === normalizedQuery) score = 1200 - exactHeuristicPenalty;
  else if (symbol.startsWith(normalizedQuery)) score = 980 - prefixHeuristicPenalty;
  else if (symbol.includes(normalizedQuery)) score = 760 - prefixHeuristicPenalty;

  if (name === normalizedQuery) score = Math.max(score, 1180 - exactHeuristicPenalty);
  else if (name.startsWith(normalizedQuery)) score = Math.max(score, 1040 - prefixHeuristicPenalty);
  else if (name.includes(normalizedQuery)) score = Math.max(score, 820 - prefixHeuristicPenalty);

  if (hint.startsWith(normalizedQuery)) score = Math.max(score, 520);
  else if (hint.includes(normalizedQuery)) score = Math.max(score, 420);

  for (const alias of candidate.aliases) {
    const normalizedAlias = normalizeSearchText(alias);
    if (!normalizedAlias) continue;
    if (normalizedAlias === normalizedQuery) {
      score = Math.max(
        score,
        (candidate.market === 'CRYPTO' ? 1210 : 1120) - exactHeuristicPenalty,
      );
    } else if (normalizedAlias.startsWith(normalizedQuery))
      score = Math.max(score, 900 - prefixHeuristicPenalty);
    else if (normalizedAlias.includes(normalizedQuery))
      score = Math.max(score, 640 - prefixHeuristicPenalty);
  }

  if (candidate.market === 'CRYPTO' && symbol.endsWith(`${normalizedQuery}usdt`)) {
    score = Math.max(score, 940);
  }

  return score;
}

function toSearchResult(candidate: SearchCandidate, score: number): AssetSearchResult {
  return {
    symbol: candidate.symbol,
    name: candidate.name,
    hint: candidate.hint,
    market: candidate.market,
    assetClass: candidate.assetClass,
    venue: candidate.venue,
    source: candidate.source,
    score,
  };
}

export async function searchAssets(args: { query: string; limit?: number; market?: Market }) {
  return await cachedBrowseServerRead(
    'browse_search',
    {
      query: String(args.query || '')
        .trim()
        .toUpperCase(),
      limit: Number(args.limit || 24),
      market: args.market || 'ALL',
    },
    async () => {
      const query = String(args.query || '').trim();
      if (!query) return [];

      const limit = Math.max(1, Math.min(Number(args.limit || 24), 50));
      const repo = getRepo();
      const candidates = new Map<string, SearchCandidate>();

      for (const asset of repo.listAssets(args.market)) {
        const candidate = buildLiveAssetCandidate(asset);
        candidates.set(`${candidate.market}:${candidate.symbol}`, candidate);
      }

      for (const candidate of buildHeuristicSearchCandidates(query, args.market)) {
        candidates.set(`${candidate.market}:${candidate.symbol}`, candidate);
      }

      const remoteCandidates = await searchRemoteAssets(query, limit, args.market);
      for (const candidate of remoteCandidates) {
        const key = `${candidate.market}:${candidate.symbol}`;
        const existing = candidates.get(key);
        if (!existing || existing.source === 'reference') {
          candidates.set(key, candidate);
        }
      }

      for (const candidate of getReferenceSearchUniverse()) {
        if (args.market && candidate.market !== args.market) continue;
        const key = `${candidate.market}:${candidate.symbol}`;
        if (!candidates.has(key)) {
          candidates.set(key, candidate);
        }
      }

      return Array.from(candidates.values())
        .map((candidate) => ({
          candidate,
          score: scoreAssetCandidate(query, candidate),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.candidate.source !== b.candidate.source) {
            const rank = { live: 0, remote: 1, reference: 2 };
            return rank[a.candidate.source] - rank[b.candidate.source];
          }
          return a.candidate.symbol.localeCompare(b.candidate.symbol);
        })
        .slice(0, limit)
        .map(({ candidate, score }) => toSearchResult(candidate, score));
    },
    30_000,
  );
}

export function getSearchHealth(args?: { market?: Market; query?: string; resultCount?: number }) {
  const repo = getRepo();
  const liveAssets = repo.listAssets(args?.market).length;
  const referenceAssets = getReferenceSearchAssetCount(args?.market);
  const query = String(args?.query || '').trim();
  const resultCount = Number(args?.resultCount || 0);
  const status =
    resultCount > 0 ? 'READY' : liveAssets > 0 || referenceAssets > 0 ? 'DEGRADED' : 'UNAVAILABLE';
  const reason =
    resultCount > 0
      ? null
      : !query
        ? 'QUERY_EMPTY'
        : liveAssets === 0 && referenceAssets === 0
          ? 'NO_ASSET_UNIVERSE'
          : 'NO_MATCHES';

  return {
    status,
    reason,
    market: args?.market || 'ALL',
    query: query || null,
    result_count: resultCount,
    live_asset_count: liveAssets,
    reference_asset_count: referenceAssets,
    remote_lookup_enabled: query.length >= 2,
  };
}

export async function getBrowseHomePayload(args?: { view?: string }) {
  return await cachedBrowseServerRead(
    'browse_home',
    {
      view: args?.view || 'NOW',
    },
    async () =>
      await getPublicBrowseHome({
        view: args?.view,
      }),
    30_000,
  );
}

type NasdaqBrowseChartResponse = {
  data?: {
    symbol?: string;
    company?: string;
    timeAsOf?: string;
    lastSalePrice?: string;
    previousClose?: string;
    exchange?: string;
    chart?: Array<{
      x?: number;
      y?: number | string;
      z?: {
        dateTime?: string;
        value?: string;
      } | null;
    }>;
  } | null;
};

function assetClassesForBrowseSymbol(symbol: string): Array<'stocks' | 'etf'> {
  return knownEtfSymbols.has(String(symbol || '').toUpperCase())
    ? ['etf', 'stocks']
    : ['stocks', 'etf'];
}

function normalizeNasdaqBrowseChart(
  requestedSymbol: string,
  assetClass: 'stocks' | 'etf',
  payload: NasdaqBrowseChartResponse,
): BrowseChartSnapshot | null {
  const data = payload.data;
  const points = (data?.chart || []).reduce<BrowseChartPoint[]>((acc, point) => {
    const ts = Number(point?.x);
    const close = parseNumericValue(point?.y ?? point?.z?.value);
    if (!Number.isFinite(ts) || close === null) return acc;
    acc.push({
      ts,
      close,
      label: point?.z?.dateTime || null,
    });
    return acc;
  }, []);

  const lastPoint = points[points.length - 1] || null;
  const firstPoint = points[0] || null;
  const latest = parseNumericValue(data?.lastSalePrice) ?? lastPoint?.close ?? null;
  const previousClose = parseNumericValue(data?.previousClose);
  const change =
    latest !== null && previousClose !== null && previousClose
      ? (latest - previousClose) / previousClose
      : points.length >= 2 && firstPoint?.close
        ? ((lastPoint?.close || 0) - firstPoint.close) / firstPoint.close
        : null;

  if (!Number.isFinite(latest) && points.length < 2) return null;

  return {
    requestedSymbol,
    resolvedSymbol: String(data?.symbol || requestedSymbol).toUpperCase(),
    market: 'US',
    name: String(data?.company || requestedSymbol).trim() || requestedSymbol,
    venue: data?.exchange ? String(data.exchange) : assetClass === 'etf' ? 'ETF' : 'US',
    currency: 'USD',
    source: 'Nasdaq',
    sourceStatus: 'LIVE',
    timeframe: '1m',
    asOf: lastPoint ? new Date(lastPoint.ts).toISOString() : null,
    latest,
    previousClose,
    change,
    points,
    note: 'Today intraday chart from Nasdaq',
  };
}

async function fetchNasdaqBrowseChart(symbol: string): Promise<BrowseChartSnapshot | null> {
  const config = getConfig();
  for (const assetClass of assetClassesForBrowseSymbol(symbol)) {
    try {
      const url = new URL(`${config.nasdaq.baseUrl}/quote/${encodeURIComponent(symbol)}/chart`);
      url.searchParams.set('assetclass', assetClass);
      const response = await fetchWithRetry(
        url.toString(),
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 NovaQuant/1.0',
            Accept: 'application/json',
            Referer: 'https://www.nasdaq.com/',
          },
        },
        { attempts: 2, baseDelayMs: 900 },
        config.nasdaq.timeoutMs,
      );
      if (!response.ok) continue;
      const payload = (await response.json()) as NasdaqBrowseChartResponse;
      const normalized = normalizeNasdaqBrowseChart(symbol, assetClass, payload);
      if (normalized) return normalized;
    } catch {
      // Try the next asset class or fallback.
    }
  }
  return null;
}

function startOfLocalDayUnixSeconds(nowMs = Date.now()): number {
  const local = new Date(nowMs);
  local.setHours(0, 0, 0, 0);
  return Math.floor(local.getTime() / 1000);
}

function normalizeGateCryptoChart(
  requestedSymbol: string,
  pair: string,
  payload: unknown,
): BrowseChartSnapshot | null {
  if (!Array.isArray(payload)) return null;

  const points = payload
    .reduce<BrowseChartPoint[]>((acc, row) => {
      if (!Array.isArray(row) || row.length < 3) return acc;
      const ts = Number(row[0]) * 1000;
      const close = parseNumericValue(row[2]);
      if (!Number.isFinite(ts) || close === null) return acc;
      acc.push({ ts, close, label: null });
      return acc;
    }, [])
    .sort((a, b) => a.ts - b.ts);

  if (points.length < 2) return null;

  const [base, quote = 'USDT'] = pair.split('_');
  const lastPoint = points[points.length - 1] || null;
  const firstPoint = points[0] || null;
  const latest = lastPoint?.close ?? null;
  const first = firstPoint?.close ?? null;
  const change = latest !== null && first !== null && first ? (latest - first) / first : null;

  return {
    requestedSymbol,
    resolvedSymbol: `${base}${quote}`,
    market: 'CRYPTO',
    name: `${base} / ${quote}`,
    venue: 'GATEIO',
    currency: quote,
    source: 'Gate.io spot',
    sourceStatus: 'LIVE',
    timeframe: '5m',
    asOf: lastPoint ? new Date(lastPoint.ts).toISOString() : null,
    latest,
    previousClose: first,
    change,
    points,
    note: 'Today intraday chart from Gate.io spot',
  };
}

async function fetchGateCryptoBrowseChart(symbol: string): Promise<BrowseChartSnapshot | null> {
  const parsed = parseCryptoLookupSymbol(symbol);
  if (!parsed) return null;

  try {
    const url = new URL('https://api.gateio.ws/api/v4/spot/candlesticks');
    url.searchParams.set('currency_pair', parsed.gatePair);
    url.searchParams.set('interval', '5m');
    url.searchParams.set('from', String(startOfLocalDayUnixSeconds()));
    url.searchParams.set('limit', '400');

    const response = await fetchWithRetry(
      url.toString(),
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': getSearchUserAgent(),
        },
      },
      { attempts: 2, baseDelayMs: 900 },
      12_000,
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    return normalizeGateCryptoChart(symbol, parsed.gatePair, payload);
  } catch {
    return null;
  }
}

function buildLocalBrowseChart(args: {
  market: Market;
  symbol: string;
}): BrowseChartSnapshot | null {
  const repo = getRepo();
  const directSymbol = String(args.symbol || '')
    .trim()
    .toUpperCase();
  const cryptoResolved =
    args.market === 'CRYPTO'
      ? parseCryptoLookupSymbol(directSymbol)?.resolvedSymbol || directSymbol
      : directSymbol;
  const symbol = args.market === 'CRYPTO' ? cryptoResolved : directSymbol;
  const asset = repo.getAssetBySymbol(args.market, symbol);
  if (!asset) return null;

  const timeframes: Timeframe[] = args.market === 'CRYPTO' ? ['5m', '1h', '1d'] : ['1h', '1d'];
  for (const timeframe of timeframes) {
    const limit = timeframe === '5m' ? 288 : timeframe === '1h' ? 72 : 90;
    const rows = repo.getOhlcv({
      assetId: asset.asset_id,
      timeframe,
      limit,
    });
    const points = rows.reduce<BrowseChartPoint[]>((acc, row) => {
      const ts = Number(row.ts_open);
      const close = parseNumericValue(row.close);
      if (!Number.isFinite(ts) || close === null) return acc;
      acc.push({ ts, close, label: null });
      return acc;
    }, []);

    if (points.length < 2) continue;

    const lastPoint = points[points.length - 1] || null;
    const firstPoint = points[0] || null;
    const latest = lastPoint?.close ?? null;
    const first = firstPoint?.close ?? null;
    const change = latest !== null && first !== null && first ? (latest - first) / first : null;
    const name =
      args.market === 'CRYPTO'
        ? `${asset.base || parseCryptoBaseQuote(asset.symbol)?.base || asset.symbol} / ${
            asset.quote || parseCryptoBaseQuote(asset.symbol)?.quote || 'USDT'
          }`
        : asset.symbol;

    return {
      requestedSymbol: directSymbol,
      resolvedSymbol: asset.symbol,
      market: args.market,
      name,
      venue: asset.venue,
      currency: asset.quote || 'USD',
      source: `Local cache${rows[rows.length - 1]?.source ? ` · ${rows[rows.length - 1].source}` : ''}`,
      sourceStatus: 'CACHED',
      timeframe,
      asOf: lastPoint ? new Date(lastPoint.ts).toISOString() : null,
      latest,
      previousClose: first,
      change,
      points,
      note: 'Latest cached market data from local store',
    };
  }

  return null;
}

export async function getBrowseAssetChart(args: {
  market: Market;
  symbol: string;
}): Promise<BrowseChartSnapshot | null> {
  return await cachedBrowseServerRead(
    'browse_chart',
    {
      market: args.market,
      symbol: String(args.symbol || '')
        .trim()
        .toUpperCase(),
    },
    async () => {
      const market = args.market;
      const symbol = String(args.symbol || '')
        .trim()
        .toUpperCase();
      if (!symbol) return null;

      if (market === 'US') {
        return (await fetchNasdaqBrowseChart(symbol)) || buildLocalBrowseChart({ market, symbol });
      }

      return (
        (await fetchGateCryptoBrowseChart(symbol)) || buildLocalBrowseChart({ market, symbol })
      );
    },
    20_000,
  );
}

export async function getBrowseNewsFeed(args: {
  market?: Market | 'ALL';
  symbol?: string;
  limit?: number;
}) {
  return await cachedBrowseServerRead(
    'browse_news',
    {
      market: args.market || 'ALL',
      symbol: String(args.symbol || '')
        .trim()
        .toUpperCase(),
      limit: Number(args.limit || 8),
    },
    async () => {
      const repo = getRepo();
      const symbol = String(args.symbol || '')
        .trim()
        .toUpperCase();
      const market = args.market || 'ALL';
      if (symbol && market !== 'ALL') {
        await ensureFreshNewsForSymbol({
          repo,
          market,
          symbol,
        });
      } else {
        await ensureFreshNewsForUniverse({
          repo,
          market,
        });
      }
      const rows = repo.listNewsItems({
        market: market === 'ALL' ? undefined : market,
        symbol: symbol || undefined,
        limit: args.limit || 8,
      });
      return rows.map(normalizeBrowseNewsItem);
    },
    30_000,
  );
}

export async function getBrowseAssetOverview(args: {
  market: Market;
  symbol: string;
}): Promise<BrowseAssetOverview | null> {
  return await cachedBrowseServerRead(
    'browse_overview',
    {
      market: args.market,
      symbol: String(args.symbol || '')
        .trim()
        .toUpperCase(),
    },
    async () => {
      const repo = getRepo();
      const symbol = String(args.symbol || '')
        .trim()
        .toUpperCase();
      if (!symbol) return null;

      const asset = repo.getAssetBySymbol(
        args.market,
        args.market === 'CRYPTO'
          ? parseCryptoLookupSymbol(symbol)?.resolvedSymbol || symbol
          : symbol,
      );
      if (!asset) return null;

      const history = repo.getOhlcv({
        assetId: asset.asset_id,
        timeframe: '1d',
        limit: args.market === 'CRYPTO' ? 180 : 260,
      });
      const closes = history
        .map((row) => parseNumericValue(row.close))
        .filter((value): value is number => Number.isFinite(value));
      const highs = history
        .map((row) => parseNumericValue(row.high))
        .filter((value): value is number => Number.isFinite(value));
      const lows = history
        .map((row) => parseNumericValue(row.low))
        .filter((value): value is number => Number.isFinite(value));
      const volumes = history
        .map((row) => parseNumericValue(row.volume))
        .filter((value): value is number => Number.isFinite(value));
      const latestClose = closes[closes.length - 1] ?? null;
      const previousClose = closes.length >= 2 ? closes[closes.length - 2] : null;
      const changePct =
        latestClose !== null && previousClose !== null && previousClose
          ? (latestClose - previousClose) / previousClose
          : null;
      const rangeHigh = highs.length ? Math.max(...highs) : null;
      const rangeLow = lows.length ? Math.min(...lows) : null;
      const latestVolume = volumes[volumes.length - 1] ?? null;
      const avgVolume30d = volumes.length
        ? volumes.slice(-30).reduce((sum, value) => sum + value, 0) /
          Math.max(1, Math.min(30, volumes.length))
        : null;
      const assetType =
        args.market === 'CRYPTO'
          ? 'Crypto spot'
          : knownEtfSymbols.has(asset.symbol)
            ? 'ETF'
            : 'US equity';
      const quoteCurrency = asset.quote || (args.market === 'CRYPTO' ? 'USDT' : 'USD');
      const newsRows = await getBrowseNewsFeed({
        market: args.market,
        symbol: asset.symbol,
        limit: 6,
      });
      const newsContext = buildNewsContext(
        repo.listNewsItems({
          market: args.market,
          symbol: asset.symbol,
          limit: 6,
        }),
        asset.symbol,
      );

      const earnings =
        args.market === 'US'
          ? {
              status: 'Watch',
              note: knownEtfSymbols.has(asset.symbol)
                ? 'ETF basket does not have a single earnings event; watch top-weight constituents instead.'
                : 'No direct calendar feed is wired yet; use news and signal context around earnings windows.',
            }
          : {
              status: '24/7',
              note: 'Crypto does not follow quarterly earnings; monitor exchange, ETF-flow, and funding headlines instead.',
            };

      return {
        symbol: asset.symbol,
        market: args.market,
        name:
          args.market === 'CRYPTO'
            ? `${asset.base || parseCryptoBaseQuote(asset.symbol)?.base || asset.symbol} / ${
                asset.quote || parseCryptoBaseQuote(asset.symbol)?.quote || 'USDT'
              }`
            : asset.symbol,
        venue: asset.venue,
        currency: quoteCurrency,
        assetType,
        profile: {
          tradingVenue: asset.venue,
          quoteCurrency,
          tradingSchedule:
            args.market === 'CRYPTO' ? '24/7 continuous' : 'US session + pre/post market',
          proxyType: assetType,
        },
        tradingStats: {
          latestClose,
          previousClose,
          changePct,
          rangeHigh,
          rangeLow,
          avgVolume30d,
          latestVolume,
          barsAvailable: history.length,
        },
        fundamentals: [
          { label: 'Asset type', value: assetType, source: 'reference' },
          {
            label: '52W / lookback high',
            value: formatCompactMetric(rangeHigh),
            source: 'derived',
          },
          { label: '52W / lookback low', value: formatCompactMetric(rangeLow), source: 'derived' },
          { label: '30D avg volume', value: formatCompactMetric(avgVolume30d), source: 'derived' },
          { label: 'Latest volume', value: formatCompactMetric(latestVolume), source: 'derived' },
        ],
        earnings,
        relatedEtfs: deriveRelatedEtfs(asset.symbol, args.market),
        optionEntries: deriveOptionEntries({
          market: args.market,
          symbol: asset.symbol,
        }),
        newsContext,
        topNews: newsRows,
      };
    },
    30_000,
  );
}

export async function getBrowseAssetDetailBundle(args: {
  market: Market;
  symbol: string;
  limit?: number;
}): Promise<BrowseAssetDetailBundle> {
  return await cachedBrowseServerRead(
    'browse_detail_bundle',
    {
      market: args.market,
      symbol: String(args.symbol || '')
        .trim()
        .toUpperCase(),
      limit: Number(args.limit || 6),
    },
    async () => {
      const [chart, overview] = await Promise.all([
        getBrowseAssetChart({
          market: args.market,
          symbol: args.symbol,
        }),
        getBrowseAssetOverview({
          market: args.market,
          symbol: args.symbol,
        }),
      ]);

      const newsLimit = Math.max(1, Math.min(Number(args.limit || 6), 12));
      const news = Array.isArray(overview?.topNews)
        ? overview.topNews.slice(0, newsLimit)
        : await getBrowseNewsFeed({
            market: args.market,
            symbol: args.symbol,
            limit: newsLimit,
          });

      return {
        chart,
        overview,
        news,
      };
    },
    20_000,
  );
}

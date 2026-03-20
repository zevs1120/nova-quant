import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetClass, Market, Timeframe } from '../types.js';
import { getConfig } from '../config.js';
import { fetchWithRetry } from '../utils/http.js';

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

type ReferenceUniverseInstrument = {
  symbol: string;
  market: string;
  category?: string;
  notes?: string;
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
  url: string | null;
  publishedAt: string | null;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL';
  relevance: number;
  body?: string | null;
};

type BrowseOverview = {
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
  newsContext: {
    symbol: string;
    headline_count: number;
    tone: 'NEGATIVE' | 'POSITIVE' | 'MIXED' | 'NEUTRAL' | 'NONE';
    top_headlines: string[];
    updated_at: string | null;
    source: string;
  };
  topNews: BrowseNewsFeedItem[];
};

type PublicOhlcvRow = {
  ts_open: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

const REMOTE_SEARCH_TIMEOUT_MS = 3200;
const remoteSearchCache = new Map<string, { expiresAt: number; results: SearchCandidate[] }>();
const REMOTE_SEARCH_TTL_MS = 1000 * 60 * 8;
const SEC_UNIVERSE_TTL_MS = 1000 * 60 * 60 * 24;
let cachedSecUniverse: { expiresAt: number; results: SearchCandidate[] } | null = null;
let cachedReferenceSearchUniverse: SearchCandidate[] | null = null;

const referenceUniverseFiles = [
  'us_equities_extended.json',
  'us_equities_core.json',
  'us_sector_etfs.json',
  'market_proxies.json',
  'crypto_core.json'
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
  'BRK.B': ['berkshire', 'berkshire hathaway']
};

const commonCryptoNames: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc'],
  ETH: ['ethereum', 'eth'],
  SOL: ['solana', 'sol'],
  BNB: ['bnb', 'binance coin'],
  XRP: ['xrp', 'ripple'],
  DOGE: ['dogecoin', 'doge'],
  ADA: ['cardano', 'ada'],
  AVAX: ['avalanche', 'avax'],
  LINK: ['chainlink', 'link'],
  LTC: ['litecoin', 'ltc']
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
  'IBIT',
  'FBTC',
  'ARKB',
  'ETHA',
  'ETHE'
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
  COIN: ['IBIT', 'ARKK', 'QQQ'],
  BTC: ['IBIT', 'FBTC', 'ARKB'],
  BTCUSDT: ['IBIT', 'FBTC', 'ARKB'],
  ETH: ['ETHA', 'ETHE', 'QQQ'],
  ETHUSDT: ['ETHA', 'ETHE', 'QQQ'],
  SOL: ['ARKK', 'QQQ', 'SMH'],
  SOLUSDT: ['ARKK', 'QQQ', 'SMH']
};

const usNewsAliases: Record<string, string[]> = {
  AAPL: ['Apple'],
  MSFT: ['Microsoft'],
  NVDA: ['NVIDIA'],
  TSLA: ['Tesla'],
  SPY: ['S&P 500'],
  QQQ: ['Nasdaq 100']
};

const cryptoNewsAliases: Record<string, string[]> = {
  BTCUSDT: ['Bitcoin'],
  ETHUSDT: ['Ethereum'],
  SOLUSDT: ['Solana'],
  BTC: ['Bitcoin'],
  ETH: ['Ethereum'],
  SOL: ['Solana']
};

const positiveTokens = ['beat', 'surge', 'growth', 'record', 'bullish', 'upgrade', 'approval', 'partnership', 'launch', 'buyback'];
const negativeTokens = ['miss', 'drop', 'lawsuit', 'downgrade', 'risk', 'probe', 'ban', 'hack', 'fraud', 'delay', 'cuts'];

const cryptoAliasLookup = Object.entries(commonCryptoNames).reduce<Record<string, string>>((acc, [symbol, aliases]) => {
  acc[normalizeSearchText(symbol)] = symbol;
  aliases.forEach((alias) => {
    acc[normalizeSearchText(alias)] = symbol;
  });
  return acc;
}, {});

function normalizeSearchText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '');
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
      .trim()
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

function searchUniverseDir(): string {
  const fileDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(fileDir, '../../../data/reference_universes');
}

function getSearchUserAgent(): string {
  return String(process.env.BROWSE_SEARCH_USER_AGENT || 'NovaQuant/1.0 support@novaquant.local').trim();
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REMOTE_SEARCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
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
    results
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

function parseCryptoBaseQuote(symbol: string): { base: string; quote: string } | null {
  const upper = String(symbol || '').toUpperCase();
  if (upper.endsWith('USDT') && upper.length > 4) {
    return { base: upper.slice(0, -4), quote: 'USDT' };
  }
  return null;
}

function parseCryptoLookupSymbol(value: string): { base: string; quote: string; resolvedSymbol: string; gatePair: string } | null {
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
      gatePair: `${base}_${quote}`
    };
  }

  const alias = cryptoAliasLookup[normalizeSearchText(compact)];
  if (alias) {
    return {
      base: alias,
      quote: 'USDT',
      resolvedSymbol: `${alias}USDT`,
      gatePair: `${alias}_USDT`
    };
  }

  return null;
}

function buildReferenceAssetCandidate(item: ReferenceUniverseInstrument): SearchCandidate {
  const isCrypto = String(item.market || '').toUpperCase().includes('CRYPTO');
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
    ...(commonEquityAliases[item.symbol] || [])
  ].filter(Boolean) as string[];

  return {
    symbol: item.symbol,
    market,
    assetClass,
    venue: null,
    name: market === 'CRYPTO' ? `${base || item.symbol}${quote ? ` / ${quote}` : ''}` : item.symbol,
    hint: market === 'CRYPTO' ? sentenceCase(item.category || 'crypto') : sentenceCase(item.category || 'US equity'),
    source: 'reference',
    aliases
  };
}

function getReferenceSearchUniverse(): SearchCandidate[] {
  if (cachedReferenceSearchUniverse) return cachedReferenceSearchUniverse;
  const byKey = new Map<string, SearchCandidate>();
  for (const file of referenceUniverseFiles) {
    const filePath = path.join(searchUniverseDir(), file);
    if (!fs.existsSync(filePath)) continue;
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { instruments?: ReferenceUniverseInstrument[] };
    for (const item of payload.instruments || []) {
      if (!item?.symbol) continue;
      const candidate = buildReferenceAssetCandidate(item);
      const key = `${candidate.market}:${candidate.symbol}`;
      if (!byKey.has(key)) byKey.set(key, candidate);
    }
  }
  cachedReferenceSearchUniverse = Array.from(byKey.values());
  return cachedReferenceSearchUniverse;
}

function buildDirectEquityCandidate(symbolInput: string): SearchCandidate {
  const symbol = String(symbolInput || '').trim().toUpperCase();
  return {
    symbol,
    market: 'US',
    assetClass: 'US_STOCK',
    venue: null,
    name: symbol,
    hint: 'Direct ticker lookup',
    source: 'remote',
    aliases: [symbol],
    heuristicDirect: true
  };
}

function buildDirectCryptoCandidate(symbolInput: string): SearchCandidate {
  const pair = parseCryptoLookupSymbol(symbolInput);
  const base = pair?.base || String(symbolInput || '').trim().toUpperCase();
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
    aliases: [symbol, base, `${base}${quote}`, `${base}/${quote}`, symbolInput, ...(commonCryptoNames[base] || [])],
    heuristicDirect: true
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
    (Boolean(cryptoAliasLookup[normalized]) || /[/_-]/.test(compact) || compact.endsWith('USDT') || compact.endsWith('USD'))
  ) {
    const candidate = buildDirectCryptoCandidate(cryptoSymbol);
    candidates.set(`${candidate.market}:${candidate.symbol}`, candidate);
  }

  return Array.from(candidates.values());
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
  const aliases = [symbol, input.name, region, exchange, type, ...(commonEquityAliases[symbol] || [])].filter(Boolean) as string[];
  return {
    symbol,
    market: 'US',
    assetClass: 'US_STOCK',
    venue: exchange || null,
    name: String(input.name || symbol).trim() || symbol,
    hint: [type || 'Equity', region, exchange, currency].filter(Boolean).join(' · '),
    source: 'remote',
    aliases
  };
}

function buildRemoteCryptoCandidate(input: { symbol: string; name: string; rank?: number | null }): SearchCandidate {
  const symbol = String(input.symbol || '').toUpperCase();
  return {
    symbol,
    market: 'CRYPTO',
    assetClass: 'CRYPTO',
    venue: null,
    name: String(input.name || symbol).trim() || symbol,
    hint: Number.isFinite(Number(input.rank)) && Number(input.rank) > 0 ? `Rank #${Number(input.rank)}` : 'Crypto asset',
    source: 'remote',
    aliases: [symbol, input.name, ...(commonCryptoNames[symbol] || [])].filter(Boolean) as string[]
  };
}

async function getSecSearchUniverse(): Promise<SearchCandidate[]> {
  if (cachedSecUniverse && cachedSecUniverse.expiresAt > Date.now()) {
    return cachedSecUniverse.results;
  }
  try {
    const payload = (await fetchJsonWithTimeout('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'user-agent': getSearchUserAgent(), accept: 'application/json' }
    })) as Record<string, { ticker?: string; title?: string }>;
    const results = Object.values(payload || [])
      .map((row) =>
        buildRemoteEquityCandidate({
          symbol: String(row?.ticker || '').toUpperCase(),
          name: String(row?.title || '').trim(),
          type: 'Equity',
          region: 'United States',
          exchange: 'SEC',
          currency: 'USD'
        })
      )
      .filter((candidate) => candidate.symbol);
    cachedSecUniverse = { expiresAt: Date.now() + SEC_UNIVERSE_TTL_MS, results };
    return results;
  } catch {
    return [];
  }
}

function getAlphaVantageApiKey(): string {
  return String(process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY || process.env.NOVA_SEARCH_ALPHA_VANTAGE_KEY || '').trim();
}

function getCoinGeckoApiKey(): string {
  return String(process.env.COINGECKO_DEMO_API_KEY || process.env.COINGECKO_API_KEY || process.env.COINGECKO_PRO_API_KEY || '').trim();
}

async function searchAlphaVantageEquities(query: string, limit: number): Promise<SearchCandidate[]> {
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
    const payload = (await fetchJsonWithTimeout(url.toString())) as { bestMatches?: Array<Record<string, string>> };
    const results = (payload.bestMatches || [])
      .map((row) =>
        buildRemoteEquityCandidate({
          symbol: row['1. symbol'],
          name: row['2. name'],
          type: row['3. type'],
          region: row['4. region'],
          exchange: row['4. region'] === 'United States' ? 'US' : row['4. region'],
          currency: row['8. currency']
        })
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
          rank: row.market_cap_rank
        })
      )
      .filter((candidate) => candidate.symbol)
      .slice(0, limit);
    cacheRemoteSearch(cacheKey, results);
    return results;
  } catch {
    return [];
  }
}

async function searchRemoteAssets(query: string, limit: number, market?: Market): Promise<SearchCandidate[]> {
  if (query.trim().length < 2) return [];
  const tasks: Promise<SearchCandidate[]>[] = [];
  if (!market || market === 'US') {
    tasks.push(getSecSearchUniverse());
    tasks.push(searchAlphaVantageEquities(query, limit));
  }
  if (!market || market === 'CRYPTO') {
    tasks.push(searchCoinGeckoCrypto(query, limit));
  }
  const settled = await Promise.allSettled(tasks);
  const merged = new Map<string, SearchCandidate>();
  settled.forEach((row) => {
    if (row.status !== 'fulfilled') return;
    row.value.forEach((candidate) => {
      const key = `${candidate.market}:${candidate.symbol}`;
      if (!merged.has(key)) merged.set(key, candidate);
    });
  });
  return Array.from(merged.values()).slice(0, limit * 3);
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
    if (normalizedAlias === normalizedQuery) score = Math.max(score, (candidate.market === 'CRYPTO' ? 1210 : 1120) - exactHeuristicPenalty);
    else if (normalizedAlias.startsWith(normalizedQuery)) score = Math.max(score, 900 - prefixHeuristicPenalty);
    else if (normalizedAlias.includes(normalizedQuery)) score = Math.max(score, 640 - prefixHeuristicPenalty);
  }
  if (candidate.market === 'CRYPTO' && symbol.endsWith(`${normalizedQuery}usdt`)) score = Math.max(score, 940);
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
    score
  };
}

export function listPublicAssets(market?: Market) {
  const config = getConfig();
  const usSymbols = config.markets.US.symbols || ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA'];
  const cryptoSymbols = config.markets.CRYPTO.symbols || ['BTCUSDT', 'ETHUSDT'];
  const targets = [
    ...((!market || market === 'US')
      ? usSymbols.map((symbol) => ({
          symbol: String(symbol).toUpperCase(),
          market: 'US' as const,
          assetClass: 'US_STOCK' as const,
          venue: knownEtfSymbols.has(String(symbol).toUpperCase()) ? 'ETF' : 'US',
          base: null,
          quote: 'USD'
        }))
      : []),
    ...((!market || market === 'CRYPTO')
      ? cryptoSymbols.map((symbol) => {
          const parsed = parseCryptoLookupSymbol(String(symbol));
          return {
            symbol: parsed?.resolvedSymbol || String(symbol).toUpperCase(),
            market: 'CRYPTO' as const,
            assetClass: 'CRYPTO' as const,
            venue: 'GATEIO',
            base: parsed?.base || String(symbol).toUpperCase().replace(/USDT$/, ''),
            quote: parsed?.quote || 'USDT'
          };
        })
      : [])
  ];

  return targets.map((item) => ({
    symbol: item.symbol,
    market: item.market,
    assetClass: item.assetClass,
    venue: item.venue,
    base: item.base,
    quote: item.quote,
    name: item.market === 'CRYPTO' ? `${item.base} / ${item.quote}` : item.symbol
  }));
}

export async function searchPublicAssets(args: { query: string; limit?: number; market?: Market }) {
  const query = String(args.query || '').trim();
  if (!query) return [];
  const limit = Math.max(1, Math.min(Number(args.limit || 24), 50));
  const candidates = new Map<string, SearchCandidate>();

  for (const candidate of buildHeuristicSearchCandidates(query, args.market)) {
    candidates.set(`${candidate.market}:${candidate.symbol}`, candidate);
  }
  for (const candidate of getReferenceSearchUniverse()) {
    if (args.market && candidate.market !== args.market) continue;
    const key = `${candidate.market}:${candidate.symbol}`;
    if (!candidates.has(key)) candidates.set(key, candidate);
  }
  const remoteCandidates = await searchRemoteAssets(query, limit, args.market);
  for (const candidate of remoteCandidates) {
    const key = `${candidate.market}:${candidate.symbol}`;
    const existing = candidates.get(key);
    if (!existing || existing.source === 'reference') candidates.set(key, candidate);
  }

  return Array.from(candidates.values())
    .map((candidate) => ({ candidate, score: scoreAssetCandidate(query, candidate) }))
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
}

type NasdaqBrowseChartResponse = {
  data?: {
    symbol?: string;
    company?: string;
    lastSalePrice?: string;
    previousClose?: string;
    exchange?: string;
    chart?: Array<{ x?: number; y?: number | string; z?: { dateTime?: string; value?: string } | null }>;
  } | null;
};

function assetClassesForBrowseSymbol(symbol: string): Array<'stocks' | 'etf'> {
  return knownEtfSymbols.has(String(symbol || '').toUpperCase()) ? ['etf', 'stocks'] : ['stocks', 'etf'];
}

function normalizeNasdaqBrowseChart(requestedSymbol: string, assetClass: 'stocks' | 'etf', payload: NasdaqBrowseChartResponse): BrowseChartSnapshot | null {
  const data = payload.data;
  const points = (data?.chart || []).reduce<BrowseChartPoint[]>((acc, point) => {
    const ts = Number(point?.x);
    const close = parseNumericValue(point?.y ?? point?.z?.value);
    if (!Number.isFinite(ts) || close === null) return acc;
    acc.push({ ts, close, label: point?.z?.dateTime || null });
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
    note: 'Today intraday chart from Nasdaq'
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
            Referer: 'https://www.nasdaq.com/'
          }
        },
        { attempts: 2, baseDelayMs: 900 },
        config.nasdaq.timeoutMs
      );
      if (!response.ok) continue;
      const payload = (await response.json()) as NasdaqBrowseChartResponse;
      const normalized = normalizeNasdaqBrowseChart(symbol, assetClass, payload);
      if (normalized) return normalized;
    } catch {
      // fallback later
    }
  }
  return null;
}

function startOfLocalDayUnixSeconds(nowMs = Date.now()): number {
  const local = new Date(nowMs);
  local.setHours(0, 0, 0, 0);
  return Math.floor(local.getTime() / 1000);
}

function normalizeGateCryptoChart(requestedSymbol: string, pair: string, payload: unknown): BrowseChartSnapshot | null {
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
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const latest = lastPoint?.close ?? null;
  const first = firstPoint?.close ?? null;
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
    change: latest !== null && first !== null && first ? (latest - first) / first : null,
    points,
    note: 'Today intraday chart from Gate.io spot'
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
      { headers: { Accept: 'application/json', 'User-Agent': getSearchUserAgent() } },
      { attempts: 2, baseDelayMs: 900 },
      12_000
    );
    if (!response.ok) return null;
    return normalizeGateCryptoChart(symbol, parsed.gatePair, await response.json());
  } catch {
    return null;
  }
}

function stooqSymbol(symbol: string): string {
  return `${String(symbol || '').toLowerCase().replace('.', '-')}.us`;
}

async function fetchUsDailyOhlcv(symbol: string, limit = 120): Promise<PublicOhlcvRow[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol(symbol))}&i=d`;
  const response = await fetchWithRetry(
    url,
    { headers: { 'User-Agent': getSearchUserAgent(), Accept: 'text/csv' } },
    { attempts: 2, baseDelayMs: 900 },
    12_000
  );
  if (!response.ok) return [];
  const text = await response.text();
  const rows = text
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date, open, high, low, close, volume] = line.split(',');
      const ts = Date.parse(`${date}T00:00:00Z`);
      return {
        ts_open: ts,
        open: parseNumericValue(open),
        high: parseNumericValue(high),
        low: parseNumericValue(low),
        close: parseNumericValue(close),
        volume: parseNumericValue(volume)
      };
    })
    .filter((row) => Number.isFinite(row.ts_open) && row.close !== null);
  return rows.slice(-Math.max(2, limit));
}

async function fetchGateOhlcv(symbol: string, timeframe: Timeframe, limit = 120): Promise<PublicOhlcvRow[]> {
  const parsed = parseCryptoLookupSymbol(symbol);
  if (!parsed) return [];
  const interval = timeframe === '5m' ? '5m' : timeframe === '1h' ? '1h' : '1d';
  const url = new URL('https://api.gateio.ws/api/v4/spot/candlesticks');
  url.searchParams.set('currency_pair', parsed.gatePair);
  url.searchParams.set('interval', interval);
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 2), 500)));
  const response = await fetchWithRetry(
    url.toString(),
    { headers: { Accept: 'application/json', 'User-Agent': getSearchUserAgent() } },
    { attempts: 2, baseDelayMs: 900 },
    12_000
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) return null;
      return {
        ts_open: Number(row[0]) * 1000,
        volume: parseNumericValue(row[1]),
        close: parseNumericValue(row[2]),
        high: parseNumericValue(row[3]),
        low: parseNumericValue(row[4]),
        open: parseNumericValue(row[5])
      } satisfies PublicOhlcvRow;
    })
    .filter((row): row is PublicOhlcvRow => Boolean(row) && Number.isFinite(row.ts_open) && row.close !== null)
    .sort((a, b) => a.ts_open - b.ts_open);
}

export async function queryPublicOhlcv(args: {
  market: Market;
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
}) {
  const symbol = String(args.symbol || '').trim().toUpperCase();
  const market = args.market;
  const timeframe = args.timeframe;
  const limit = Math.max(2, Math.min(Number(args.limit || 120), 500));
  const rows =
    market === 'CRYPTO'
      ? await fetchGateOhlcv(symbol, timeframe, limit)
      : timeframe === '1d'
        ? await fetchUsDailyOhlcv(symbol, limit)
        : [];
  return {
    asset: rows.length
      ? {
          symbol,
          market,
          venue: market === 'CRYPTO' ? 'GATEIO' : knownEtfSymbols.has(symbol) ? 'ETF' : 'US',
          base: market === 'CRYPTO' ? parseCryptoLookupSymbol(symbol)?.base || symbol : null,
          quote: market === 'CRYPTO' ? parseCryptoLookupSymbol(symbol)?.quote || 'USDT' : 'USD'
        }
      : null,
    rows
  };
}

export async function getPublicBrowseAssetChart(args: { market: Market; symbol: string }): Promise<BrowseChartSnapshot | null> {
  const symbol = String(args.symbol || '').trim().toUpperCase();
  if (!symbol) return null;
  if (args.market === 'US') {
    const live = await fetchNasdaqBrowseChart(symbol);
    if (live) return live;
    const history = await fetchUsDailyOhlcv(symbol, 30);
    if (history.length < 2) return null;
    const first = history[0];
    const last = history[history.length - 1];
    return {
      requestedSymbol: symbol,
      resolvedSymbol: symbol,
      market: 'US',
      name: symbol,
      venue: knownEtfSymbols.has(symbol) ? 'ETF' : 'US',
      currency: 'USD',
      source: 'Stooq daily',
      sourceStatus: 'CACHED',
      timeframe: '1d',
      asOf: new Date(last.ts_open).toISOString(),
      latest: last.close,
      previousClose: first.close,
      change: last.close !== null && first.close !== null && first.close ? (last.close - first.close) / first.close : null,
      points: history.map((row) => ({ ts: row.ts_open, close: row.close || 0, label: null })),
      note: 'Latest cached daily chart from Stooq'
    };
  }
  const live = await fetchGateCryptoBrowseChart(symbol);
  if (live) return live;
  const history = await fetchGateOhlcv(symbol, '1d', 30);
  if (history.length < 2) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const parsed = parseCryptoLookupSymbol(symbol);
  return {
    requestedSymbol: symbol,
    resolvedSymbol: parsed?.resolvedSymbol || symbol,
    market: 'CRYPTO',
    name: `${parsed?.base || symbol} / ${parsed?.quote || 'USDT'}`,
    venue: 'GATEIO',
    currency: parsed?.quote || 'USDT',
    source: 'Gate.io daily',
    sourceStatus: 'CACHED',
    timeframe: '1d',
    asOf: new Date(last.ts_open).toISOString(),
    latest: last.close,
    previousClose: first.close,
    change: last.close !== null && first.close !== null && first.close ? (last.close - first.close) / first.close : null,
    points: history.map((row) => ({ ts: row.ts_open, close: row.close || 0, label: null })),
    note: 'Latest cached daily chart from Gate.io'
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function scoreHeadline(headline: string): { sentiment: BrowseNewsFeedItem['sentiment']; relevance: number } {
  const lower = headline.toLowerCase();
  const pos = positiveTokens.filter((token) => lower.includes(token)).length;
  const neg = negativeTokens.filter((token) => lower.includes(token)).length;
  const relevance = Math.min(1, 0.35 + (pos + neg) * 0.12);
  if (pos > neg) return { sentiment: 'POSITIVE', relevance };
  if (neg > pos) return { sentiment: 'NEGATIVE', relevance };
  return { sentiment: pos + neg > 0 ? 'MIXED' : 'NEUTRAL', relevance: pos + neg > 0 ? relevance : 0.35 };
}

function aliasQuery(market: Market, symbol: string): string {
  const normalized = String(symbol || '').trim().toUpperCase();
  const aliases = market === 'CRYPTO' ? cryptoNewsAliases[normalized] || [normalized.replace(/USDT$/, '')] : usNewsAliases[normalized] || [normalized];
  return aliases[0] || normalized;
}

async function fetchTextWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 2600): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'user-agent': 'NovaQuant/1.0 support@novaquant.local',
        ...(init.headers || {})
      }
    });
    if (!response.ok) throw new Error(`News request failed (${response.status})`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseGoogleNewsRss(xml: string, market: Market, symbol: string): BrowseNewsFeedItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);
  const now = Date.now();
  return items.map((match, index) => {
    const item = match[1] || '';
    const title = decodeXml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || `${symbol} news`);
    const link = decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '');
    const pubDate = Date.parse(decodeXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '')) || now - index * 60_000;
    const scored = scoreHeadline(title);
    return {
      id: `news-${createHash('sha1').update(`${market}:${symbol}:${title}:${pubDate}`).digest('hex').slice(0, 24)}`,
      market,
      symbol,
      headline: title,
      source: 'google_news_rss',
      url: link || null,
      publishedAt: new Date(pubDate).toISOString(),
      sentiment: scored.sentiment,
      relevance: Number(scored.relevance.toFixed(4)),
      body: null
    };
  });
}

export async function getPublicBrowseNewsFeed(args: { market?: Market | 'ALL'; symbol?: string; limit?: number }) {
  const market = args.market || 'ALL';
  const limit = Math.max(1, Math.min(Number(args.limit || 8), 20));
  const targets: Array<{ market: Market; symbol: string }> = args.symbol && market !== 'ALL'
    ? [{ market, symbol: String(args.symbol || '').toUpperCase() }]
    : [
        ...getConfig().markets.US.symbols.slice(0, 4).map((symbol) => ({ market: 'US' as const, symbol: String(symbol).toUpperCase() })),
        ...getConfig().markets.CRYPTO.symbols.slice(0, 3).map((symbol) => ({ market: 'CRYPTO' as const, symbol: String(symbol).toUpperCase() }))
      ].filter((row) => market === 'ALL' || row.market === market);

  const settled = await Promise.allSettled(
    targets.map(async (target) => {
      const query = target.market === 'CRYPTO' ? `${aliasQuery(target.market, target.symbol)} crypto` : `${aliasQuery(target.market, target.symbol)} stock`;
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const xml = await fetchTextWithTimeout(url);
      return parseGoogleNewsRss(xml, target.market, target.symbol);
    })
  );

  const merged = settled
    .flatMap((row) => (row.status === 'fulfilled' ? row.value : []))
    .sort((a, b) => Date.parse(String(b.publishedAt || 0)) - Date.parse(String(a.publishedAt || 0)));

  const deduped = new Map<string, BrowseNewsFeedItem>();
  merged.forEach((item) => {
    const key = item.url || `${item.market}:${item.symbol}:${item.headline}`;
    if (!deduped.has(key)) deduped.set(key, item);
  });
  return Array.from(deduped.values()).slice(0, limit);
}

function buildNewsContext(rows: BrowseNewsFeedItem[], symbol: string) {
  const top = rows.slice(0, 3);
  const toneCounts = top.reduce((acc, row) => {
    acc[row.sentiment] = (acc[row.sentiment] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const tone =
    toneCounts.NEGATIVE > toneCounts.POSITIVE
      ? 'NEGATIVE'
      : toneCounts.POSITIVE > toneCounts.NEGATIVE
        ? 'POSITIVE'
        : toneCounts.MIXED
          ? 'MIXED'
          : top.length
            ? 'NEUTRAL'
            : 'NONE';
  return {
    symbol: String(symbol || '').toUpperCase(),
    headline_count: rows.length,
    tone,
    top_headlines: top.map((row) => row.headline),
    updated_at: top[0]?.publishedAt || null,
    source: top[0]?.source || 'none'
  } as const;
}

function deriveRelatedEtfs(symbol: string, market: Market): string[] {
  const upper = String(symbol || '').toUpperCase();
  if (relatedEtfMap[upper]?.length) return relatedEtfMap[upper];
  return market === 'CRYPTO' ? ['IBIT', 'FBTC', 'ARKB'] : ['SPY', 'QQQ', 'VTI'];
}

function deriveOptionEntries(args: { market: Market; symbol: string }): Array<{ label: string; description: string }> {
  if (args.market !== 'US') {
    return [
      { label: 'Perps', description: 'Perpetual/futures execution context' },
      { label: 'Basis', description: 'Cross-venue basis and carry view' }
    ];
  }
  return [
    { label: 'Calls', description: `${args.symbol} bullish directional options entry` },
    { label: 'Puts', description: `${args.symbol} downside hedge and event protection` },
    { label: 'Flow', description: 'Watch unusual flow and implied vol shifts' }
  ];
}

export async function getPublicBrowseAssetOverview(args: { market: Market; symbol: string }): Promise<BrowseOverview | null> {
  const symbol = String(args.symbol || '').trim().toUpperCase();
  if (!symbol) return null;
  const history = await queryPublicOhlcv({
    market: args.market,
    symbol,
    timeframe: '1d',
    limit: args.market === 'CRYPTO' ? 180 : 260
  });
  if (!history.rows.length) return null;

  const closes = history.rows.map((row) => row.close).filter((value): value is number => Number.isFinite(value));
  const highs = history.rows.map((row) => row.high).filter((value): value is number => Number.isFinite(value));
  const lows = history.rows.map((row) => row.low).filter((value): value is number => Number.isFinite(value));
  const volumes = history.rows.map((row) => row.volume).filter((value): value is number => Number.isFinite(value));
  const latestClose = closes[closes.length - 1] ?? null;
  const previousClose = closes.length >= 2 ? closes[closes.length - 2] : null;
  const changePct = latestClose !== null && previousClose !== null && previousClose ? (latestClose - previousClose) / previousClose : null;
  const rangeHigh = highs.length ? Math.max(...highs) : null;
  const rangeLow = lows.length ? Math.min(...lows) : null;
  const latestVolume = volumes[volumes.length - 1] ?? null;
  const avgVolume30d = volumes.length ? volumes.slice(-30).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(30, volumes.length)) : null;
  const parsedCrypto = args.market === 'CRYPTO' ? parseCryptoLookupSymbol(symbol) : null;
  const assetType = args.market === 'CRYPTO' ? 'Crypto spot' : knownEtfSymbols.has(symbol) ? 'ETF' : 'US equity';
  const quoteCurrency = args.market === 'CRYPTO' ? parsedCrypto?.quote || 'USDT' : 'USD';
  const topNews = await getPublicBrowseNewsFeed({ market: args.market, symbol, limit: 6 });
  const newsContext = buildNewsContext(topNews, symbol);

  return {
    symbol,
    market: args.market,
    name: args.market === 'CRYPTO' ? `${parsedCrypto?.base || symbol} / ${quoteCurrency}` : symbol,
    venue: args.market === 'CRYPTO' ? 'GATEIO' : knownEtfSymbols.has(symbol) ? 'ETF' : 'US',
    currency: quoteCurrency,
    assetType,
    profile: {
      tradingVenue: args.market === 'CRYPTO' ? 'GATEIO' : knownEtfSymbols.has(symbol) ? 'ETF' : 'US',
      quoteCurrency,
      tradingSchedule: args.market === 'CRYPTO' ? '24/7 continuous' : 'US session + pre/post market',
      proxyType: assetType
    },
    tradingStats: {
      latestClose,
      previousClose,
      changePct,
      rangeHigh,
      rangeLow,
      avgVolume30d,
      latestVolume,
      barsAvailable: history.rows.length
    },
    fundamentals: [
      { label: 'Asset type', value: assetType, source: 'reference' },
      { label: '52W / lookback high', value: formatCompactMetric(rangeHigh), source: 'derived' },
      { label: '52W / lookback low', value: formatCompactMetric(rangeLow), source: 'derived' },
      { label: '30D avg volume', value: formatCompactMetric(avgVolume30d), source: 'derived' },
      { label: 'Latest volume', value: formatCompactMetric(latestVolume), source: 'derived' }
    ],
    earnings:
      args.market === 'US'
        ? {
            status: 'Watch',
            note: knownEtfSymbols.has(symbol)
              ? 'ETF basket does not have a single earnings event; watch top-weight constituents instead.'
              : 'No direct calendar feed is wired yet; use news and signal context around earnings windows.'
          }
        : {
            status: '24/7',
            note: 'Crypto does not follow quarterly earnings; monitor exchange, ETF-flow, and funding headlines instead.'
          },
    relatedEtfs: deriveRelatedEtfs(symbol, args.market),
    optionEntries: deriveOptionEntries({ market: args.market, symbol }),
    newsContext,
    topNews
  };
}

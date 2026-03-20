import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../db/database.js';
import { MarketRepository } from '../db/repository.js';
import type { AssetClass, Market, Timeframe } from '../types.js';
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
  publisher?: string | null;
  sourceUrl?: string | null;
  url: string | null;
  publishedAt: string | null;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL';
  relevance: number;
  summary?: string | null;
  imageUrl?: string | null;
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

type BrowseHomeCard = {
  symbol: string;
  market: Market;
  title: string;
  subtitle: string;
  latest: number | null;
  change: number | null;
  asOf: string | null;
  values: number[];
};

type BrowseHomeChip = {
  symbol: string;
  market: Market;
  name: string;
  latest: number | null;
  change: number | null;
};

type BrowseHomeList = {
  id: string;
  title: string;
  subtitle: string;
  items: BrowseHomeChip[];
};

type BrowseHomeEarningsItem = {
  symbol: string;
  market: Market;
  title: string;
  note: string;
  timing: string;
};

type BrowseHomePayload = {
  view: 'STOCK' | 'CRYPTO';
  updatedAt: string;
  futuresMarkets: BrowseHomeCard[];
  topMovers: BrowseHomeChip[];
  cryptoMovers: BrowseHomeChip[];
  earnings: BrowseHomeEarningsItem[];
  screeners: BrowseHomeList[];
  trendingLists: BrowseHomeList[];
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
const browseHomeCache = new Map<string, { expiresAt: number; data: BrowseHomePayload }>();
const browseChartCache = new Map<string, { expiresAt: number; data: BrowseChartSnapshot | null }>();
const browseChartInflight = new Map<string, Promise<BrowseChartSnapshot | null>>();
const DEFAULT_PUBLIC_US_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'NFLX', 'COIN', 'MSTR', 'HOOD', 'PLTR'];
const DEFAULT_PUBLIC_CRYPTO_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT'];
const DEFAULT_PUBLIC_NASDAQ_BASE_URL = 'https://api.nasdaq.com/api';
const DEFAULT_PUBLIC_NASDAQ_TIMEOUT_MS = 2_500;

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
  SMCI: ['super micro computer', 'supermicro'],
  MSTR: ['microstrategy', 'strategy'],
  HOOD: ['robinhood'],
  SOFI: ['sofi'],
  RBLX: ['roblox'],
  APP: ['applovin'],
  AVGO: ['broadcom'],
  TSM: ['taiwan semiconductor', 'tsmc'],
  ARM: ['arm holdings'],
  MRVL: ['marvell'],
  DIS: ['disney'],
  DKNG: ['draftkings'],
  TKO: ['tko group'],
  EA: ['electronic arts'],
  TTWO: ['take two', 'take-two'],
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
  LTC: ['litecoin', 'ltc'],
  SHIB: ['shiba inu', 'shib'],
  OP: ['optimism', 'op'],
  XTZ: ['tezos', 'xtz'],
  QNT: ['quant', 'qnt'],
  SNX: ['synthetix', 'snx'],
  WIF: ['dogwifhat', 'wif'],
  TON: ['toncoin', 'ton'],
  TRX: ['tron', 'trx']
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

const STATIC_US_BROWSE_FALLBACK: Record<string, Array<[number, number]>> = {
  AAPL: [[1769558400000, 256.44], [1769644800000, 258.28], [1769731200000, 259.48], [1769990400000, 270.01], [1770076800000, 269.48], [1770163200000, 276.49], [1770249600000, 275.91], [1770336000000, 278.12], [1770595200000, 274.62], [1770681600000, 273.68], [1770768000000, 275.5], [1770854400000, 261.73], [1770940800000, 255.78], [1771286400000, 263.88], [1771372800000, 264.35], [1771459200000, 260.58], [1771545600000, 264.58], [1771804800000, 266.18], [1771891200000, 272.14], [1771977600000, 274.23], [1772064000000, 272.95], [1772150400000, 264.18], [1772409600000, 264.72], [1772496000000, 263.75], [1772582400000, 262.52], [1772668800000, 260.29], [1772755200000, 257.46], [1773014400000, 259.88], [1773100800000, 260.83], [1773187200000, 260.81], [1773273600000, 255.76], [1773360000000, 250.12], [1773619200000, 252.82], [1773705600000, 254.23], [1773792000000, 249.94], [1773878400000, 248.96]],
  NVDA: [[1769558400000, 191.52], [1769644800000, 192.51], [1769731200000, 191.13], [1769990400000, 185.61], [1770076800000, 180.34], [1770163200000, 174.19], [1770249600000, 171.88], [1770336000000, 185.41], [1770595200000, 190.04], [1770681600000, 188.54], [1770768000000, 190.05], [1770854400000, 186.94], [1770940800000, 182.81], [1771286400000, 184.97], [1771372800000, 187.98], [1771459200000, 187.9], [1771545600000, 189.82], [1771804800000, 191.55], [1771891200000, 192.85], [1771977600000, 195.56], [1772064000000, 184.89], [1772150400000, 177.19], [1772409600000, 182.48], [1772496000000, 180.05], [1772582400000, 183.04], [1772668800000, 183.34], [1772755200000, 177.82], [1773014400000, 182.65], [1773100800000, 184.77], [1773187200000, 186.03], [1773273600000, 183.14], [1773360000000, 180.25], [1773619200000, 183.22], [1773705600000, 181.93], [1773792000000, 180.4], [1773878400000, 178.56]],
  MSFT: [[1769558400000, 481.63], [1769644800000, 433.5], [1769731200000, 430.29], [1769990400000, 423.37], [1770076800000, 411.21], [1770163200000, 414.19], [1770249600000, 393.67], [1770336000000, 401.14], [1770595200000, 413.6], [1770681600000, 413.27], [1770768000000, 404.37], [1770854400000, 401.84], [1770940800000, 401.32], [1771286400000, 396.86], [1771372800000, 399.6], [1771459200000, 398.46], [1771545600000, 397.23], [1771804800000, 384.47], [1771891200000, 389], [1771977600000, 400.6], [1772064000000, 401.72], [1772150400000, 392.74], [1772409600000, 398.55], [1772496000000, 403.93], [1772582400000, 405.2], [1772668800000, 410.68], [1772755200000, 408.96], [1773014400000, 409.41], [1773100800000, 405.76], [1773187200000, 404.88], [1773273600000, 401.86], [1773360000000, 395.55], [1773619200000, 399.95], [1773705600000, 399.41], [1773792000000, 391.79], [1773878400000, 389.02]],
  TSLA: [[1769558400000, 431.46], [1769644800000, 416.56], [1769731200000, 430.41], [1769990400000, 421.81], [1770076800000, 421.96], [1770163200000, 406.01], [1770249600000, 397.21], [1770336000000, 411.11], [1770595200000, 417.32], [1770681600000, 425.21], [1770768000000, 428.27], [1770854400000, 417.07], [1770940800000, 417.44], [1771286400000, 410.63], [1771372800000, 411.32], [1771459200000, 411.71], [1771545600000, 411.82], [1771804800000, 399.83], [1771891200000, 409.38], [1771977600000, 417.4], [1772064000000, 408.58], [1772150400000, 402.51], [1772409600000, 403.32], [1772496000000, 392.43], [1772582400000, 405.94], [1772668800000, 405.55], [1772755200000, 396.73], [1773014400000, 398.68], [1773100800000, 399.235], [1773187200000, 407.82], [1773273600000, 395.01], [1773360000000, 391.2], [1773619200000, 395.56], [1773705600000, 399.27], [1773792000000, 392.78], [1773878400000, 380.3]],
  SPY: [[1769558400000, 695.42], [1769644800000, 694.04], [1769731200000, 691.97], [1769990400000, 695.41], [1770076800000, 689.53], [1770163200000, 686.19], [1770249600000, 677.62], [1770336000000, 690.62], [1770595200000, 693.95], [1770681600000, 692.12], [1770768000000, 691.96], [1770854400000, 681.27], [1770940800000, 681.75], [1771286400000, 682.85], [1771372800000, 686.29], [1771459200000, 684.48], [1771545600000, 689.43], [1771804800000, 682.39], [1771891200000, 687.35], [1771977600000, 693.15], [1772064000000, 689.3], [1772150400000, 685.99], [1772409600000, 686.38], [1772496000000, 680.33], [1772582400000, 685.13], [1772668800000, 681.31], [1772755200000, 672.38], [1773014400000, 678.27], [1773100800000, 677.18], [1773187200000, 676.33], [1773273600000, 666.06], [1773360000000, 662.29], [1773619200000, 669.03], [1773705600000, 670.79], [1773792000000, 661.43], [1773878400000, 659.8]],
  QQQ: [[1769558400000, 633.22], [1769644800000, 629.43], [1769731200000, 621.87], [1769990400000, 626.14], [1770076800000, 616.52], [1770163200000, 605.75], [1770249600000, 597.03], [1770336000000, 609.65], [1770595200000, 614.32], [1770681600000, 611.47], [1770768000000, 613.11], [1770854400000, 600.64], [1770940800000, 601.92], [1771286400000, 601.3], [1771372800000, 605.79], [1771459200000, 603.47], [1771545600000, 608.81], [1771804800000, 601.41], [1771891200000, 607.87], [1771977600000, 616.68], [1772064000000, 609.24], [1772150400000, 607.29], [1772409600000, 608.09], [1772496000000, 601.58], [1772582400000, 610.75], [1772668800000, 608.91], [1772755200000, 599.75], [1773014400000, 607.76], [1773100800000, 607.77], [1773187200000, 607.69], [1773273600000, 597.26], [1773360000000, 593.72], [1773619200000, 600.38], [1773705600000, 603.31], [1773792000000, 594.9], [1773878400000, 593.02]]
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

function readPublicSymbolsEnv(value: string | undefined, fallback: readonly string[]): string[] {
  const parsed = String(value || '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length ? parsed : [...fallback];
}

function getPublicUniverseSymbols(market: Market): string[] {
  if (market === 'US') {
    return readPublicSymbolsEnv(process.env.US_SYMBOLS, DEFAULT_PUBLIC_US_SYMBOLS);
  }
  return readPublicSymbolsEnv(process.env.CRYPTO_SYMBOLS, DEFAULT_PUBLIC_CRYPTO_SYMBOLS);
}

function getPublicNasdaqConfig() {
  const timeoutMs = Number(process.env.NASDAQ_TIMEOUT_MS || DEFAULT_PUBLIC_NASDAQ_TIMEOUT_MS);
  return {
    baseUrl: String(process.env.NASDAQ_BASE_URL || DEFAULT_PUBLIC_NASDAQ_BASE_URL).trim() || DEFAULT_PUBLIC_NASDAQ_BASE_URL,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_PUBLIC_NASDAQ_TIMEOUT_MS
  };
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

function getStaticUsFallbackRows(symbol: string, limit = 90): PublicOhlcvRow[] {
  const rows = STATIC_US_BROWSE_FALLBACK[String(symbol || '').toUpperCase()] || [];
  return rows.slice(-Math.max(2, limit)).map(([ts_open, close]) => ({
    ts_open,
    open: close,
    high: close,
    low: close,
    close,
    volume: 0
  }));
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
  const equityAlias = commonEquityAliases[item.symbol]?.[0] || null;
  const cryptoAlias = base ? commonCryptoNames[base]?.[0] || null : null;

  return {
    symbol: item.symbol,
    market,
    assetClass,
    venue: null,
    name:
      market === 'CRYPTO'
        ? `${base || item.symbol}${quote ? ` / ${quote}` : ''}`
        : equityAlias
          ? sentenceCase(equityAlias)
          : item.symbol,
    hint: market === 'CRYPTO' ? sentenceCase(item.category || 'crypto') : sentenceCase(item.category || 'US equity'),
    source: 'reference',
    aliases: [...aliases, equityAlias, cryptoAlias].filter(Boolean) as string[]
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
  const byKey = new Map<string, ReturnType<typeof buildReferenceAssetCandidate>>();
  getReferenceSearchUniverse()
    .filter((item) => !market || item.market === market)
    .forEach((item) => {
      byKey.set(`${item.market}:${item.symbol}`, item);
    });

  getPublicUniverseSymbols('US').forEach((symbol) => {
    const upper = String(symbol).toUpperCase();
    const key = `US:${upper}`;
    if (!byKey.has(key)) byKey.set(key, buildDirectEquityCandidate(upper));
  });
  getPublicUniverseSymbols('CRYPTO').forEach((symbol) => {
    const parsed = parseCryptoLookupSymbol(String(symbol));
    if (!parsed) return;
    const key = `CRYPTO:${parsed.resolvedSymbol}`;
    if (!byKey.has(key)) byKey.set(key, buildDirectCryptoCandidate(parsed.resolvedSymbol));
  });

  return Array.from(byKey.values()).map((item) => {
    const parsed = item.market === 'CRYPTO' ? parseCryptoLookupSymbol(item.symbol) : null;
    return {
      symbol: item.symbol,
      market: item.market,
      assetClass: item.assetClass,
      venue: item.venue || (item.market === 'CRYPTO' ? 'GATEIO' : knownEtfSymbols.has(item.symbol) ? 'ETF' : 'US'),
      base: parsed?.base || null,
      quote: parsed?.quote || (item.market === 'US' ? 'USD' : null),
      name: item.name
    };
  });
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

  const localResults = Array.from(candidates.values())
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

  if (localResults.length >= Math.min(limit, 8) || process.env.BROWSE_REMOTE_SEARCH !== '1') {
    return localResults;
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
  if (points.length < 2) return null;
  if (!Number.isFinite(latest)) return null;
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
  const config = getPublicNasdaqConfig();
  for (const assetClass of assetClassesForBrowseSymbol(symbol)) {
    try {
      const url = new URL(`${config.baseUrl}/quote/${encodeURIComponent(symbol)}/chart`);
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
      { attempts: 1, baseDelayMs: 300 },
      Math.min(config.timeoutMs, 2_500)
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

let browseRepoSingleton: MarketRepository | null = null;

function shouldUseLocalBrowseStore() {
  if (process.env.BROWSE_DISABLE_LOCAL_STORE === '1') return false;
  if (process.env.VERCEL) return false;
  return true;
}

function getBrowseRepo() {
  if (!shouldUseLocalBrowseStore()) return null;
  if (browseRepoSingleton) return browseRepoSingleton;
  browseRepoSingleton = new MarketRepository(getDb());
  return browseRepoSingleton;
}

function queryLocalOhlcv(args: {
  market: Market;
  symbol: string;
  timeframe: Timeframe;
  start?: number;
  end?: number;
  limit?: number;
}): { asset: ReturnType<MarketRepository['getAssetBySymbol']>; rows: PublicOhlcvRow[] } {
  const repo = getBrowseRepo();
  if (!repo) return { asset: null, rows: [] };
  try {
  const asset = repo.getAssetBySymbol(args.market, args.symbol);
  if (!asset) return { asset: null, rows: [] };
  const rows = repo
    .getOhlcv({
      assetId: asset.asset_id,
      timeframe: args.timeframe,
      start: args.start,
      end: args.end,
      limit: args.limit
    })
    .map((row) => ({
      ts_open: Number(row.ts_open),
      open: parseNumericValue(row.open),
      high: parseNumericValue(row.high),
      low: parseNumericValue(row.low),
      close: parseNumericValue(row.close),
      volume: parseNumericValue(row.volume)
    }))
    .filter((row) => Number.isFinite(row.ts_open) && row.close !== null);
  return { asset, rows };
  } catch {
    return { asset: null, rows: [] };
  }
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
      { attempts: 1, baseDelayMs: 300 },
      2_500
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
    { attempts: 1, baseDelayMs: 300 },
    2_500
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
    { attempts: 1, baseDelayMs: 300 },
    2_500
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
    .filter((row): row is PublicOhlcvRow => row !== null && Number.isFinite(row.ts_open) && row.close !== null)
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
  const local = queryLocalOhlcv({ market, symbol, timeframe, limit });
  if (local.asset && local.rows.length) {
    return {
      asset: {
        symbol,
        market,
        venue: local.asset.venue || (market === 'CRYPTO' ? 'GATEIO' : knownEtfSymbols.has(symbol) ? 'ETF' : 'US'),
        base: local.asset.base ?? (market === 'CRYPTO' ? parseCryptoLookupSymbol(symbol)?.base || symbol : null),
        quote: local.asset.quote ?? (market === 'CRYPTO' ? parseCryptoLookupSymbol(symbol)?.quote || 'USDT' : 'USD')
      },
      rows: local.rows
    };
  }
  let rows: PublicOhlcvRow[] = [];
  try {
    rows =
      market === 'CRYPTO'
        ? await fetchGateOhlcv(symbol, timeframe, limit)
        : timeframe === '1d'
          ? await fetchUsDailyOhlcv(symbol, limit)
          : [];
  } catch {
    rows = [];
  }
  if (!rows.length && market === 'US') {
    rows = getStaticUsFallbackRows(symbol, limit);
  }
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
  const cacheKey = `${args.market}:${symbol}`;
  const cached = readBrowseChartCache(cacheKey);
  if (cached !== undefined) return cached;
  const inflight = browseChartInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    if (args.market === 'US') {
      const live = await fetchNasdaqBrowseChart(symbol);
      if (live) {
        writeBrowseChartCache(cacheKey, live);
        return live;
      }
      const local = queryLocalOhlcv({ market: 'US', symbol, timeframe: '1d', limit: 30 });
      let history: PublicOhlcvRow[] = local.rows;
      if (history.length < 2) {
        try {
          history = await fetchUsDailyOhlcv(symbol, 30);
        } catch {
          history = [];
        }
      }
      if (history.length < 2) {
        history = getStaticUsFallbackRows(symbol, 30);
      }
      if (history.length < 2) {
        writeBrowseChartCache(cacheKey, null);
        return null;
      }
      const first = history[0];
      const last = history[history.length - 1];
      const snapshot = {
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
      } satisfies BrowseChartSnapshot;
      writeBrowseChartCache(cacheKey, snapshot);
      return snapshot;
    }

    const live = await fetchGateCryptoBrowseChart(symbol);
    if (live) {
      writeBrowseChartCache(cacheKey, live);
      return live;
    }
    const local = queryLocalOhlcv({ market: 'CRYPTO', symbol, timeframe: '1d', limit: 30 });
    let history: PublicOhlcvRow[] = local.rows;
    if (history.length < 2) {
      try {
        history = await fetchGateOhlcv(symbol, '1d', 30);
      } catch {
        history = [];
      }
    }
    if (history.length < 2) {
      writeBrowseChartCache(cacheKey, null);
      return null;
    }
    const first = history[0];
    const last = history[history.length - 1];
    const parsed = parseCryptoLookupSymbol(symbol);
    const snapshot = {
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
    } satisfies BrowseChartSnapshot;
    writeBrowseChartCache(cacheKey, snapshot);
    return snapshot;
  })().finally(() => {
    browseChartInflight.delete(cacheKey);
  });

  browseChartInflight.set(cacheKey, request);
  return request;
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

function stripHtml(value: string): string {
  return String(value || '')
    .replace(/<img[\s\S]*?>/gi, ' ')
    .replace(/<a[\s\S]*?>/gi, ' ')
    .replace(/<\/a>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitHeadlinePublisher(title: string): { headline: string; publisher: string | null } {
  const parts = String(title || '')
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return {
      headline: String(title || '').trim(),
      publisher: null
    };
  }
  const publisher = parts[parts.length - 1] || null;
  if (!publisher || publisher.length > 72) {
    return {
      headline: String(title || '').trim(),
      publisher: null
    };
  }
  return {
    headline: parts.slice(0, -1).join(' - ').trim(),
    publisher
  };
}

function parseSourceUrl(item: string): string | null {
  const match = item.match(/<source[^>]*url="([^"]+)"/i);
  return match?.[1] ? decodeXml(match[1]) : null;
}

function sourceHostLabel(value: string | null): string | null {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname.replace(/^www\./i, '');
    return hostname || null;
  } catch {
    return null;
  }
}

function extractDescriptionParts(item: string): { summary: string | null; imageUrl: string | null } {
  const descriptionRaw = item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '';
  const description = decodeXml(descriptionRaw);
  const imageUrl =
    decodeXml(item.match(/<media:content[^>]*url="([^"]+)"/i)?.[1] || '') ||
    decodeXml(item.match(/<media:thumbnail[^>]*url="([^"]+)"/i)?.[1] || '') ||
    decodeXml(item.match(/<enclosure[^>]*url="([^"]+)"/i)?.[1] || '') ||
    decodeXml(description.match(/<img[^>]+src="([^"]+)"/i)?.[1] || '') ||
    null;
  const summary = stripHtml(description)
    .replace(/\s*Continue reading.*$/i, '')
    .slice(0, 220)
    .trim();
  return {
    summary: summary || null,
    imageUrl
  };
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
    const rawTitle = decodeXml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || `${symbol} news`);
    const titleParts = splitHeadlinePublisher(rawTitle);
    const link = decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '');
    const pubDate = Date.parse(decodeXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '')) || now - index * 60_000;
    const sourceUrl = parseSourceUrl(item);
    const sourceTag = decodeXml(item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || '');
    const description = extractDescriptionParts(item);
    const source = sourceTag || titleParts.publisher || sourceHostLabel(sourceUrl) || 'Google News';
    const scored = scoreHeadline(titleParts.headline);
    return {
      id: `news-${createHash('sha1').update(`${market}:${symbol}:${rawTitle}:${pubDate}`).digest('hex').slice(0, 24)}`,
      market,
      symbol,
      headline: titleParts.headline || rawTitle,
      source,
      publisher: source,
      sourceUrl,
      url: link || null,
      publishedAt: new Date(pubDate).toISOString(),
      sentiment: scored.sentiment,
      relevance: Number(scored.relevance.toFixed(4)),
      summary: description.summary,
      imageUrl: description.imageUrl,
      body: description.summary
    };
  });
}

export async function getPublicBrowseNewsFeed(args: { market?: Market | 'ALL'; symbol?: string; limit?: number }) {
  const market = args.market || 'ALL';
  const limit = Math.max(1, Math.min(Number(args.limit || 8), 20));
  const targets: Array<{ market: Market; symbol: string }> = args.symbol && market !== 'ALL'
    ? [{ market, symbol: String(args.symbol || '').toUpperCase() }]
    : [
        ...getPublicUniverseSymbols('US').slice(0, 4).map((symbol) => ({ market: 'US' as const, symbol: String(symbol).toUpperCase() })),
        ...getPublicUniverseSymbols('CRYPTO').slice(0, 3).map((symbol) => ({ market: 'CRYPTO' as const, symbol: String(symbol).toUpperCase() }))
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

const browseHomeConfig = {
  STOCK: {
    featured: [
      { symbol: 'AAPL', market: 'US' as const, title: 'Apple', subtitle: 'Large-cap tech' },
      { symbol: 'NVDA', market: 'US' as const, title: 'NVIDIA', subtitle: 'AI leader' },
      { symbol: 'MSFT', market: 'US' as const, title: 'Microsoft', subtitle: 'Mega-cap software' },
      { symbol: 'TSLA', market: 'US' as const, title: 'Tesla', subtitle: 'High-beta leader' },
      { symbol: 'QQQ', market: 'US' as const, title: 'Nasdaq 100', subtitle: 'Growth proxy' }
    ],
    usPool: ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'SPY', 'QQQ'],
    cryptoPool: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'XRPUSDT'],
    earnings: ['NVDA', 'AAPL', 'AMZN', 'NFLX'],
    screeners: [
      { id: 'daily-price-jumps', title: 'Daily price jumps', subtitle: 'Stocks with the biggest price increases today' },
      { id: 'daily-price-dips', title: 'Daily price dips', subtitle: 'Stocks with the biggest price decreases today' },
      { id: 'upcoming-earnings', title: 'Upcoming earnings', subtitle: 'Liquid names to watch into the next reports' }
    ],
    trending: [
      { id: 'newly-listed-crypto', title: 'Newly Listed Crypto', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] },
      { id: 'ipo-access', title: 'IPO Access', symbols: ['ARM', 'HOOD', 'COIN'] },
      { id: 'early-dividend-stocks', title: 'Early Dividend Stocks', symbols: ['SPY', 'XLF', 'DIA'] },
      { id: 'altcoins', title: 'Altcoins', symbols: ['SOLUSDT', 'AVAXUSDT', 'LINKUSDT'] },
      { id: 'closed-end-funds', title: 'Closed-end Funds', symbols: ['DIA', 'TLT', 'GLD'] },
      { id: 'tradable-crypto', title: 'Tradable Crypto', symbols: ['BTCUSDT', 'ETHUSDT', 'DOGEUSDT'] }
    ]
  },
  CRYPTO: {
    featured: [
      { symbol: 'BTCUSDT', market: 'CRYPTO' as const, title: 'Bitcoin', subtitle: 'BTC / USDT' },
      { symbol: 'ETHUSDT', market: 'CRYPTO' as const, title: 'Ethereum', subtitle: 'ETH / USDT' },
      { symbol: 'SOLUSDT', market: 'CRYPTO' as const, title: 'Solana', subtitle: 'SOL / USDT' },
      { symbol: 'XRPUSDT', market: 'CRYPTO' as const, title: 'XRP', subtitle: 'XRP / USDT' }
    ],
    usPool: ['COIN', 'MSTR', 'HOOD', 'NVDA', 'TSLA', 'PLTR'],
    cryptoPool: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT'],
    earnings: ['COIN', 'MSTR', 'NVDA', 'TSLA'],
    screeners: [
      { id: 'crypto-breakouts', title: 'Crypto breakouts', subtitle: 'Large caps pressing near recent highs' },
      { id: 'crypto-dips', title: 'Crypto pullbacks', subtitle: 'Names with the sharpest downside retracements' },
      { id: 'btc-linked-equities', title: 'BTC-linked equities', subtitle: 'US names with strong crypto beta' }
    ],
    trending: [
      { id: 'majors', title: 'Majors', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] },
      { id: 'alt-beta', title: 'Alt Beta', symbols: ['DOGEUSDT', 'AVAXUSDT', 'LINKUSDT'] },
      { id: 'exchange-beta', title: 'Exchange Beta', symbols: ['COIN', 'HOOD', 'MSTR'] },
      { id: 'layer-1s', title: 'Layer 1s', symbols: ['SOLUSDT', 'ADAUSDT', 'AVAXUSDT'] }
    ]
  }
} as const;

function readBrowseHomeCache(key: string): BrowseHomePayload | null {
  const hit = browseHomeCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    browseHomeCache.delete(key);
    return null;
  }
  return hit.data;
}

function writeBrowseHomeCache(key: string, data: BrowseHomePayload) {
  browseHomeCache.set(key, {
    expiresAt: Date.now() + 1000,
    data
  });
}

function readBrowseChartCache(key: string): BrowseChartSnapshot | null | undefined {
  const hit = browseChartCache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    browseChartCache.delete(key);
    return undefined;
  }
  return hit.data;
}

function writeBrowseChartCache(key: string, data: BrowseChartSnapshot | null) {
  const ttlMs = data?.sourceStatus === 'LIVE' ? 900 : 12_000;
  browseChartCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    data
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeBrowseHomeView(value?: string): keyof typeof browseHomeConfig {
  const upper = String(value || 'STOCK').trim().toUpperCase();
  if (upper === 'CRYPTO') return upper;
  if (upper === 'NOW') return 'STOCK';
  return 'STOCK';
}

async function buildBrowseCard(spec: { symbol: string; market: Market; title: string; subtitle: string }): Promise<BrowseHomeCard | null> {
  const chart = await withTimeout(getPublicBrowseAssetChart({ market: spec.market, symbol: spec.symbol }), 1200, null);
  if (!chart) {
    const history = await withTimeout(
      queryPublicOhlcv({
        market: spec.market,
        symbol: spec.symbol,
        timeframe: '1d',
        limit: 36
      }),
      800,
      { asset: null, rows: [] as PublicOhlcvRow[] }
    );
    const closes = history.rows.map((row) => row.close).filter((value): value is number => Number.isFinite(value));
    if (closes.length < 2) return null;
    const latest = closes[closes.length - 1] ?? null;
    const first = closes[0] ?? null;
    return {
      symbol: spec.symbol,
      market: spec.market,
      title: spec.title,
      subtitle: spec.subtitle,
      latest,
      change: latest !== null && first ? (latest - first) / first : null,
      asOf: new Date(Number(history.rows[history.rows.length - 1]?.ts_open || Date.now())).toISOString(),
      values: closes.slice(-36)
    };
  }
  return {
    symbol: chart.resolvedSymbol || spec.symbol,
    market: spec.market,
    title: spec.title,
    subtitle: spec.subtitle,
    latest: chart.latest,
    change: chart.change,
    asOf: chart.asOf,
    values: (chart.points || []).map((point) => point.close).filter((value) => Number.isFinite(value)).slice(-36)
  };
}

async function buildBrowseChip(symbol: string, market: Market): Promise<BrowseHomeChip | null> {
  const chart = await withTimeout(getPublicBrowseAssetChart({ market, symbol }), 900, null);
  if (chart && Number.isFinite(chart.change)) {
    return {
      symbol,
      market,
      name: chart.name || (market === 'CRYPTO' ? `${displaySymbolForStatic(symbol)} / USDT` : commonEquityAliases[symbol]?.[0] ? sentenceCase(commonEquityAliases[symbol][0]) : symbol),
      latest: chart.latest,
      change: chart.change
    };
  }
  const rows = await withTimeout(
    queryPublicOhlcv({
      market,
      symbol,
      timeframe: '1d',
      limit: 5
    }),
    2600,
    { asset: null, rows: [] as PublicOhlcvRow[] }
  );
  if (!rows.rows.length) return null;
  const closes = rows.rows.map((row) => row.close).filter((value): value is number => Number.isFinite(value));
  if (!closes.length) return null;
  const latest = closes[closes.length - 1] ?? null;
  const previous = closes.length >= 2 ? closes[closes.length - 2] : closes[0];
  const change = latest !== null && previous ? (latest - previous) / previous : null;
  const parsed = market === 'CRYPTO' ? parseCryptoLookupSymbol(symbol) : null;
  return {
    symbol,
    market,
    name: market === 'CRYPTO' ? `${parsed?.base || symbol.replace(/USDT$/, '')} / ${parsed?.quote || 'USDT'}` : commonEquityAliases[symbol]?.[0] ? sentenceCase(commonEquityAliases[symbol][0]) : symbol,
    latest,
    change
  };
}

async function buildBrowseChipList(symbols: readonly string[], market: Market, limit = 6): Promise<BrowseHomeChip[]> {
  const settled = await Promise.allSettled(symbols.map((symbol) => buildBrowseChip(symbol, market)));
  return settled
    .filter((row): row is PromiseFulfilledResult<BrowseHomeChip | null> => row.status === 'fulfilled')
    .map((row) => row.value)
    .filter((item): item is BrowseHomeChip => item !== null && Number.isFinite(item.change))
    .sort((a, b) => Math.abs((b.change || 0)) - Math.abs((a.change || 0)))
    .slice(0, limit);
}

function splitPositiveNegative(items: BrowseHomeChip[]) {
  const positive = items.filter((item) => Number(item.change) > 0).sort((a, b) => Number(b.change) - Number(a.change));
  const negative = items.filter((item) => Number(item.change) < 0).sort((a, b) => Number(a.change) - Number(b.change));
  return { positive, negative };
}

async function buildBrowseEarnings(symbols: readonly string[]): Promise<BrowseHomeEarningsItem[]> {
  return symbols.slice(0, 4).map((symbol, index) => ({
    symbol,
    market: 'US',
    title: commonEquityAliases[symbol]?.[0] ? sentenceCase(commonEquityAliases[symbol][0]) : symbol,
    note: index % 2 === 0 ? 'Watch sizing into the next event window.' : 'Avoid chasing before the next report.',
    timing: index % 2 === 0 ? 'After close' : 'Coming up'
  }));
}

function buildBrowseList(id: string, title: string, subtitle: string, items: BrowseHomeChip[]): BrowseHomeList {
  return { id, title, subtitle, items };
}

function makeStaticBrowseChip(symbol: string): BrowseHomeChip {
  const market = parseCryptoLookupSymbol(symbol) ? 'CRYPTO' : 'US';
  return {
    symbol,
    market,
    name: market === 'CRYPTO' ? `${displaySymbolForStatic(symbol)} / USDT` : commonEquityAliases[symbol]?.[0] ? sentenceCase(commonEquityAliases[symbol][0]) : symbol,
    latest: null,
    change: null
  };
}

function displaySymbolForStatic(symbol: string) {
  const upper = String(symbol || '').toUpperCase();
  return upper.replace(/USDT$/, '').replace(/USD$/, '');
}

export async function getPublicBrowseHome(args: { view?: string }): Promise<BrowseHomePayload> {
  const view = normalizeBrowseHomeView(args.view);
  const cached = readBrowseHomeCache(view);
  if (cached) return cached;

  const config = browseHomeConfig[view];
  const isCryptoView = view === 'CRYPTO';
  const [featured, primaryMovers, earnings] = await Promise.all([
    Promise.all(config.featured.slice(0, 3).map((item) => buildBrowseCard(item))),
    isCryptoView ? buildBrowseChipList(config.cryptoPool, 'CRYPTO', 6) : buildBrowseChipList(config.usPool, 'US', 6),
    isCryptoView ? Promise.resolve([] as BrowseHomeEarningsItem[]) : buildBrowseEarnings(config.earnings)
  ]);

  const moveBuckets = splitPositiveNegative(primaryMovers);
  const screenerLists: BrowseHomeList[] = [
    buildBrowseList(config.screeners[0].id, config.screeners[0].title, config.screeners[0].subtitle, moveBuckets.positive.slice(0, 6)),
    buildBrowseList(config.screeners[1].id, config.screeners[1].title, config.screeners[1].subtitle, moveBuckets.negative.slice(0, 6)),
    buildBrowseList(
      config.screeners[2].id,
      config.screeners[2].title,
      config.screeners[2].subtitle,
      isCryptoView
        ? config.usPool.slice(0, 4).map((symbol) => makeStaticBrowseChip(symbol))
        : earnings.map((item) => ({
            symbol: item.symbol,
            market: item.market,
            name: item.title,
            latest: null,
            change: null
          }))
    )
  ];

  const trendingLists: BrowseHomeList[] = await Promise.all(
    config.trending.map(async (list) => buildBrowseList(list.id, list.title, `${list.symbols.length} symbols`, list.symbols.map(makeStaticBrowseChip)))
  );

  const payload: BrowseHomePayload = {
    view,
    updatedAt: new Date().toISOString(),
    futuresMarkets: featured.filter((item): item is BrowseHomeCard => Boolean(item)).slice(0, 3),
    topMovers: isCryptoView ? [] : primaryMovers,
    cryptoMovers: isCryptoView ? primaryMovers : [],
    earnings,
    screeners: screenerLists,
    trendingLists
  };
  writeBrowseHomeCache(view, payload);
  return payload;
}

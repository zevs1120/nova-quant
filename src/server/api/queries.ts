import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../db/database.js';
import { MarketRepository } from '../db/repository.js';
import { ensureSchema } from '../db/schema.js';
import type {
  AssetClass,
  DecisionSnapshotRecord,
  ExecutionAction,
  ExecutionMode,
  Market,
  NovaTaskType,
  RiskProfileKey,
  SignalContract,
  Timeframe,
  UserHoldingInput
} from '../types.js';
import { createExecutionRecord, decodeSignalContract, ensureQuantData } from '../quant/service.js';
import {
  getBacktestEvidenceDetail,
  getChampionStrategies,
  getSignalEvidenceDetail,
  getTopSignalEvidence,
  listBacktestEvidence,
  listReconciliationEvidence,
  runEvidenceEngine
} from '../evidence/engine.js';
import { getConfig } from '../config.js';
import {
  RUNTIME_STATUS,
  derivePerformanceSourceStatus,
  normalizeRuntimeStatus,
  withComponentStatus
} from '../runtimeStatus.js';
import { buildDecisionSnapshot } from '../decision/engine.js';
import { buildEngagementSnapshot, defaultNotificationPreferences } from '../engagement/engine.js';
import { buildBackendBackboneSummary } from '../backbone/service.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';
import { applyLocalNovaDecisionLanguage, applyLocalNovaWrapUpLanguage, logNovaAssistantAnswer } from '../nova/service.js';
import { buildMlxLmTrainingDataset } from '../nova/training.js';
import { getNovaModelPlan, getNovaRoutingPolicies, getNovaRuntimeMode } from '../ai/llmOps.js';
import { inspectNovaHealth } from '../nova/health.js';
import { labelNovaRun } from '../nova/service.js';
import { runNovaTrainingFlywheel, type NovaTrainerKind } from '../nova/flywheel.js';
import { generateGovernedNovaStrategies } from '../nova/strategyLab.js';
import { buildNewsContext, ensureFreshNewsForSymbol, ensureFreshNewsForUniverse } from '../news/provider.js';
import { buildEvidenceLineage } from '../evidence/lineage.js';
import { fetchWithRetry } from '../utils/http.js';
import { getPublicBrowseHome } from '../public/browseService.js';

const RISK_PROFILE_PRESETS = {
  conservative: {
    max_loss_per_trade: 0.7,
    max_daily_loss: 1.8,
    max_drawdown: 8,
    exposure_cap: 35,
    leverage_cap: 1.5
  },
  balanced: {
    max_loss_per_trade: 1.0,
    max_daily_loss: 3.0,
    max_drawdown: 12,
    exposure_cap: 55,
    leverage_cap: 2
  },
  aggressive: {
    max_loss_per_trade: 1.4,
    max_daily_loss: 4.5,
    max_drawdown: 18,
    exposure_cap: 75,
    leverage_cap: 3
  }
} as const;

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
  url: string | null;
  publishedAt: string | null;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL';
  relevance: number;
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
  TRX: ['tron', 'trx'],
  AVAX: ['avalanche', 'avax'],
  LINK: ['chainlink', 'link'],
  LTC: ['litecoin', 'ltc'],
  TON: ['ton', 'the open network']
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
  'VOO'
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
  SOLUSDT: ['ARKK', 'QQQ', 'SMH']
};

const cryptoAliasLookup = Object.entries(commonCryptoNames).reduce<Record<string, string>>((acc, [symbol, aliases]) => {
  acc[normalizeSearchText(symbol)] = symbol;
  aliases.forEach((alias) => {
    acc[normalizeSearchText(alias)] = symbol;
  });
  return acc;
}, {});

let cachedReferenceSearchUniverse: SearchCandidate[] | null = null;
const remoteSearchCache = new Map<string, { expiresAt: number; results: SearchCandidate[] }>();
const REMOTE_SEARCH_TTL_MS = 1000 * 60 * 8;
const REMOTE_SEARCH_TIMEOUT_MS = 3200;
const SEC_UNIVERSE_TTL_MS = 1000 * 60 * 60 * 24;
let cachedSecUniverse: { expiresAt: number; results: SearchCandidate[] } | null = null;

function getAlphaVantageApiKey(): string {
  return String(
    process.env.ALPHA_VANTAGE_API_KEY ||
      process.env.ALPHAVANTAGE_API_KEY ||
      process.env.NOVA_SEARCH_ALPHA_VANTAGE_KEY ||
      ''
  ).trim();
}

function getCoinGeckoApiKey(): string {
  return String(
    process.env.COINGECKO_DEMO_API_KEY ||
      process.env.COINGECKO_API_KEY ||
      process.env.COINGECKO_PRO_API_KEY ||
      ''
  ).trim();
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

async function getSecSearchUniverse(): Promise<SearchCandidate[]> {
  if (cachedSecUniverse && cachedSecUniverse.expiresAt > Date.now()) {
    return cachedSecUniverse.results;
  }

  try {
    const payload = (await fetchJsonWithTimeout('https://www.sec.gov/files/company_tickers.json', {
      headers: {
        'user-agent': getSearchUserAgent(),
        accept: 'application/json'
      }
    })) as Record<string, { ticker?: string; title?: string }>;

    const results = Object.values(payload || {})
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

    cachedSecUniverse = {
      expiresAt: Date.now() + SEC_UNIVERSE_TTL_MS,
      results
    };
    return results;
  } catch {
    return [];
  }
}

function getRepo(): MarketRepository {
  const db = getDb();
  ensureSchema(db);
  return new MarketRepository(db);
}

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

function normalizeBrowseNewsItem(row: import('../types.js').NewsItemRecord): BrowseNewsFeedItem {
  return {
    id: row.id,
    market: row.market === 'CRYPTO' ? 'CRYPTO' : 'US',
    symbol: String(row.symbol || '').toUpperCase(),
    headline: row.headline,
    source: row.source,
    url: row.url || null,
    publishedAt: Number.isFinite(row.published_at_ms) ? new Date(row.published_at_ms).toISOString() : null,
    sentiment: row.sentiment_label,
    relevance: Number(row.relevance_score || 0)
  };
}

function deriveRelatedEtfs(symbol: string, market: Market): string[] {
  const upper = String(symbol || '').toUpperCase();
  if (relatedEtfMap[upper]?.length) return relatedEtfMap[upper];
  if (market === 'CRYPTO') return ['IBIT', 'FBTC', 'ARKB'];
  return ['SPY', 'QQQ', 'VTI'];
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

function isBrowseChartPoint(value: unknown): value is BrowseChartPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as BrowseChartPoint;
  return Number.isFinite(point.ts) && Number.isFinite(point.close);
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

function parseCryptoBaseQuote(symbol: string): { base: string; quote: string } | null {
  const upper = String(symbol || '').toUpperCase();
  if (upper.endsWith('USDT') && upper.length > 4) {
    return { base: upper.slice(0, -4), quote: 'USDT' };
  }
  return null;
}

function searchUniverseDir(): string {
  const queriesDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(queriesDir, '../../../data/reference_universes');
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

function buildLiveAssetCandidate(asset: ReturnType<MarketRepository['listAssets']>[number]): SearchCandidate {
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
    ...(commonEquityAliases[asset.symbol] || [])
  ].filter(Boolean) as string[];

  return {
    symbol: asset.symbol,
    market,
    assetClass,
    venue: asset.venue,
    name:
      market === 'CRYPTO'
        ? `${base || asset.symbol}${quote ? ` / ${quote}` : ''}`
        : asset.symbol,
    hint:
      market === 'CRYPTO'
        ? `Crypto${asset.venue ? ` · ${asset.venue}` : ''}`
        : `US stock${asset.venue ? ` · ${asset.venue}` : ''}`,
    source: 'live',
    aliases
  };
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
    name:
      market === 'CRYPTO'
        ? `${base || item.symbol}${quote ? ` / ${quote}` : ''}`
        : item.symbol,
    hint:
      market === 'CRYPTO'
        ? sentenceCase(item.category || 'crypto')
        : sentenceCase(item.category || 'US equity'),
    source: 'reference',
    aliases
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
  const aliases = [symbol, input.name, region, exchange, type, ...(commonEquityAliases[symbol] || [])].filter(Boolean) as string[];
  const hintParts = [type || 'Equity', region, exchange, currency].filter(Boolean);

  return {
    symbol,
    market: 'US',
    assetClass: 'US_STOCK',
    venue: exchange || null,
    name: String(input.name || symbol).trim() || symbol,
    hint: hintParts.join(' · '),
    source: 'remote',
    aliases
  };
}

function buildRemoteCryptoCandidate(input: {
  symbol: string;
  name: string;
  rank?: number | null;
}): SearchCandidate {
  const symbol = String(input.symbol || '').toUpperCase();
  const aliases = [symbol, input.name, ...(commonCryptoNames[symbol] || [])].filter(Boolean) as string[];
  const rank =
    Number.isFinite(Number(input.rank)) && Number(input.rank) > 0 ? `Rank #${Number(input.rank)}` : 'Crypto asset';

  return {
    symbol,
    market: 'CRYPTO',
    assetClass: 'CRYPTO',
    venue: null,
    name: String(input.name || symbol).trim() || symbol,
    hint: rank,
    source: 'remote',
    aliases
  };
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
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { instruments?: ReferenceUniverseInstrument[] };
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
      score = Math.max(score, (candidate.market === 'CRYPTO' ? 1210 : 1120) - exactHeuristicPenalty);
    }
    else if (normalizedAlias.startsWith(normalizedQuery)) score = Math.max(score, 900 - prefixHeuristicPenalty);
    else if (normalizedAlias.includes(normalizedQuery)) score = Math.max(score, 640 - prefixHeuristicPenalty);
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
    score
  };
}

type RuntimeSyncContext = {
  riskProfileKey?: RiskProfileKey;
  market?: Market;
  assetClass?: AssetClass;
  timeframe?: string;
  universeScope?: string;
};

export function listAssets(market?: Market) {
  const repo = getRepo();
  return repo.listAssets(market);
}

export async function searchAssets(args: { query: string; limit?: number; market?: Market }) {
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
      score: scoreAssetCandidate(query, candidate)
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
}

export function getSearchHealth(args?: { market?: Market; query?: string; resultCount?: number }) {
  const repo = getRepo();
  const liveAssets = repo.listAssets(args?.market).length;
  const referenceAssets = getReferenceSearchUniverse().filter((candidate) => !args?.market || candidate.market === args.market).length;
  const query = String(args?.query || '').trim();
  const resultCount = Number(args?.resultCount || 0);
  const status =
    resultCount > 0
      ? 'READY'
      : liveAssets > 0 || referenceAssets > 0
        ? 'DEGRADED'
        : 'UNAVAILABLE';
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
    remote_lookup_enabled: query.length >= 2
  };
}

export async function getBrowseHomePayload(args?: { view?: string }) {
  return await getPublicBrowseHome({
    view: args?.view
  });
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
  return knownEtfSymbols.has(String(symbol || '').toUpperCase()) ? ['etf', 'stocks'] : ['stocks', 'etf'];
}

function normalizeNasdaqBrowseChart(
  requestedSymbol: string,
  assetClass: 'stocks' | 'etf',
  payload: NasdaqBrowseChartResponse
): BrowseChartSnapshot | null {
  const data = payload.data;
  const points = (data?.chart || []).reduce<BrowseChartPoint[]>((acc, point) => {
      const ts = Number(point?.x);
      const close = parseNumericValue(point?.y ?? point?.z?.value);
      if (!Number.isFinite(ts) || close === null) return acc;
      acc.push({
        ts,
        close,
        label: point?.z?.dateTime || null
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
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': getSearchUserAgent()
        }
      },
      { attempts: 2, baseDelayMs: 900 },
      12_000
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    return normalizeGateCryptoChart(symbol, parsed.gatePair, payload);
  } catch {
    return null;
  }
}

function buildLocalBrowseChart(args: { market: Market; symbol: string }): BrowseChartSnapshot | null {
  const repo = getRepo();
  const directSymbol = String(args.symbol || '').trim().toUpperCase();
  const cryptoResolved = args.market === 'CRYPTO' ? parseCryptoLookupSymbol(directSymbol)?.resolvedSymbol || directSymbol : directSymbol;
  const symbol = args.market === 'CRYPTO' ? cryptoResolved : directSymbol;
  const asset = repo.getAssetBySymbol(args.market, symbol);
  if (!asset) return null;

  const timeframes: Timeframe[] = args.market === 'CRYPTO' ? ['5m', '1h', '1d'] : ['1h', '1d'];
  for (const timeframe of timeframes) {
    const limit = timeframe === '5m' ? 288 : timeframe === '1h' ? 72 : 90;
    const rows = repo.getOhlcv({
      assetId: asset.asset_id,
      timeframe,
      limit
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
      note: 'Latest cached market data from local store'
    };
  }

  return null;
}

export async function getBrowseAssetChart(args: { market: Market; symbol: string }): Promise<BrowseChartSnapshot | null> {
  const market = args.market;
  const symbol = String(args.symbol || '').trim().toUpperCase();
  if (!symbol) return null;

  if (market === 'US') {
    return (await fetchNasdaqBrowseChart(symbol)) || buildLocalBrowseChart({ market, symbol });
  }

  return (await fetchGateCryptoBrowseChart(symbol)) || buildLocalBrowseChart({ market, symbol });
}

export async function getBrowseNewsFeed(args: { market?: Market | 'ALL'; symbol?: string; limit?: number }) {
  const repo = getRepo();
  const symbol = String(args.symbol || '').trim().toUpperCase();
  const market = args.market || 'ALL';
  if (symbol && market !== 'ALL') {
    await ensureFreshNewsForSymbol({
      repo,
      market,
      symbol
    });
  } else {
    await ensureFreshNewsForUniverse({
      repo,
      market
    });
  }
  const rows = repo.listNewsItems({
    market: market === 'ALL' ? undefined : market,
    symbol: symbol || undefined,
    limit: args.limit || 8
  });
  return rows.map(normalizeBrowseNewsItem);
}

export async function getBrowseAssetOverview(args: { market: Market; symbol: string }): Promise<BrowseAssetOverview | null> {
  const repo = getRepo();
  const symbol = String(args.symbol || '').trim().toUpperCase();
  if (!symbol) return null;

  const asset = repo.getAssetBySymbol(args.market, args.market === 'CRYPTO' ? parseCryptoLookupSymbol(symbol)?.resolvedSymbol || symbol : symbol);
  if (!asset) return null;

  const history = repo.getOhlcv({
    assetId: asset.asset_id,
    timeframe: '1d',
    limit: args.market === 'CRYPTO' ? 180 : 260
  });
  const closes = history.map((row) => parseNumericValue(row.close)).filter((value): value is number => Number.isFinite(value));
  const highs = history.map((row) => parseNumericValue(row.high)).filter((value): value is number => Number.isFinite(value));
  const lows = history.map((row) => parseNumericValue(row.low)).filter((value): value is number => Number.isFinite(value));
  const volumes = history.map((row) => parseNumericValue(row.volume)).filter((value): value is number => Number.isFinite(value));
  const latestClose = closes[closes.length - 1] ?? null;
  const previousClose = closes.length >= 2 ? closes[closes.length - 2] : null;
  const changePct = latestClose !== null && previousClose !== null && previousClose ? (latestClose - previousClose) / previousClose : null;
  const rangeHigh = highs.length ? Math.max(...highs) : null;
  const rangeLow = lows.length ? Math.min(...lows) : null;
  const latestVolume = volumes[volumes.length - 1] ?? null;
  const avgVolume30d = volumes.length ? volumes.slice(-30).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(30, volumes.length)) : null;
  const assetType = args.market === 'CRYPTO' ? 'Crypto spot' : knownEtfSymbols.has(asset.symbol) ? 'ETF' : 'US equity';
  const quoteCurrency = asset.quote || (args.market === 'CRYPTO' ? 'USDT' : 'USD');
  const newsRows = await getBrowseNewsFeed({
    market: args.market,
    symbol: asset.symbol,
    limit: 6
  });
  const newsContext = buildNewsContext(
    repo.listNewsItems({
      market: args.market,
      symbol: asset.symbol,
      limit: 6
    }),
    asset.symbol
  );

  const earnings =
    args.market === 'US'
      ? {
          status: 'Watch',
          note: knownEtfSymbols.has(asset.symbol)
            ? 'ETF basket does not have a single earnings event; watch top-weight constituents instead.'
            : 'No direct calendar feed is wired yet; use news and signal context around earnings windows.'
        }
      : {
          status: '24/7',
          note: 'Crypto does not follow quarterly earnings; monitor exchange, ETF-flow, and funding headlines instead.'
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
      barsAvailable: history.length
    },
    fundamentals: [
      { label: 'Asset type', value: assetType, source: 'reference' },
      { label: '52W / lookback high', value: formatCompactMetric(rangeHigh), source: 'derived' },
      { label: '52W / lookback low', value: formatCompactMetric(rangeLow), source: 'derived' },
      { label: '30D avg volume', value: formatCompactMetric(avgVolume30d), source: 'derived' },
      { label: 'Latest volume', value: formatCompactMetric(latestVolume), source: 'derived' }
    ],
    earnings,
    relatedEtfs: deriveRelatedEtfs(asset.symbol, args.market),
    optionEntries: deriveOptionEntries({
      market: args.market,
      symbol: asset.symbol
    }),
    newsContext,
    topNews: newsRows
  };
}

export function queryOhlcv(args: {
  market: Market;
  symbol: string;
  timeframe: Timeframe;
  start?: number;
  end?: number;
  limit?: number;
}) {
  const repo = getRepo();
  const asset = repo.getAssetBySymbol(args.market, args.symbol);
  if (!asset) {
    return { asset: null, rows: [] as ReturnType<typeof repo.getOhlcv> };
  }

  const rows = repo.getOhlcv({
    assetId: asset.asset_id,
    timeframe: args.timeframe,
    start: args.start,
    end: args.end,
    limit: args.limit
  });

  return { asset, rows };
}

export function syncQuantState(userId = 'guest-default', force = false, context: RuntimeSyncContext = {}) {
  const repo = getRepo();
  return ensureQuantData(repo, userId, force, {
    riskProfileKey: context.riskProfileKey,
    market: context.market,
    assetClass: context.assetClass,
    timeframe: context.timeframe,
    universeScope: context.universeScope
  });
}

export function listSignalContracts(args: {
  userId?: string;
  assetClass?: AssetClass;
  market?: Market;
  symbol?: string;
  status?: 'ALL' | 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED';
  limit?: number;
}): SignalContract[] {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    assetClass: args.assetClass
  });
  const rows = repo.listSignals({
    assetClass: args.assetClass,
    market: args.market,
    symbol: args.symbol,
    status: args.status,
    limit: args.limit
  });
  return rows
    .map((row) => decodeSignalContract(row))
    .filter((row): row is SignalContract => Boolean(row));
}

export function getSignalContract(signalId: string, userId = 'guest-default'): SignalContract | null {
  const repo = getRepo();
  syncQuantState(userId);
  const row = repo.getSignal(signalId);
  if (!row) return null;
  return decodeSignalContract(row);
}

export function upsertExecution(args: {
  userId: string;
  signalId: string;
  mode: ExecutionMode;
  action: ExecutionAction;
  note?: string;
  pnlPct?: number | null;
}): { ok: boolean; executionId?: string; error?: string } {
  const repo = getRepo();
  syncQuantState(args.userId);
  const row = repo.getSignal(args.signalId);
  if (!row) return { ok: false, error: 'Signal not found' };
  const signal = decodeSignalContract(row);
  if (!signal) return { ok: false, error: 'Signal payload is invalid' };
  const execution = createExecutionRecord({
    signal,
    userId: args.userId,
    mode: args.mode,
    action: args.action,
    note: args.note,
    pnlPct: args.pnlPct
  });
  repo.upsertExecution(execution);
  repo.appendSignalEvent(signal.id, `EXECUTION_${args.action}`, {
    mode: args.mode,
    execution_id: execution.execution_id
  });
  syncQuantState(args.userId, true, {
    market: signal.market,
    assetClass: signal.asset_class
  });
  return { ok: true, executionId: execution.execution_id };
}

export function listExecutions(args: {
  userId?: string;
  market?: Market;
  mode?: ExecutionMode;
  signalId?: string;
  limit?: number;
}) {
  const repo = getRepo();
  return repo.listExecutions({
    userId: args.userId,
    market: args.market,
    mode: args.mode,
    signalId: args.signalId,
    limit: args.limit
  });
}

export function getMarketState(args: {
  userId?: string;
  market?: Market;
  symbol?: string;
  timeframe?: string;
}) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    timeframe: args.timeframe
  });
  return repo.listMarketState({
    market: args.market,
    symbol: args.symbol,
    timeframe: args.timeframe
  });
}

export function getPerformanceSummary(args: { userId?: string; market?: Market; range?: string }) {
  const repo = getRepo();
  const state = syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    timeframe: args.range
  });
  const rows = repo.listPerformanceSnapshots({
    market: args.market,
    range: args.range
  });
  const grouped = rows.reduce<Record<string, Record<string, unknown>>>((acc, row) => {
    const key = `${row.market}:${row.range}`;
    if (!acc[key]) {
      acc[key] = {
        market: row.market,
        range: row.range,
        overall: null,
        by_strategy: [],
        by_regime: [],
        deviation: null
      };
    }
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    if (row.segment_type === 'OVERALL') acc[key].overall = payload;
    if (row.segment_type === 'STRATEGY') (acc[key].by_strategy as Record<string, unknown>[]).push(payload);
    if (row.segment_type === 'REGIME') (acc[key].by_regime as Record<string, unknown>[]).push(payload);
    if (row.segment_type === 'DEVIATION') acc[key].deviation = payload;
    return acc;
  }, {});

  return {
    asof: new Date(state.asofMs).toISOString(),
    source_status: normalizeRuntimeStatus(state.sourceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA),
    records: Object.values(grouped)
  };
}

export function getRiskProfile(userId = 'guest-default', opts?: { skipSync?: boolean }) {
  const repo = getRepo();
  const existing = repo.getUserRiskProfile(userId);
  if (existing) return existing;
  if (!opts?.skipSync) {
    syncQuantState(userId);
    return repo.getUserRiskProfile(userId);
  }
  syncQuantState(userId);
  return repo.getUserRiskProfile(userId);
}

export function setRiskProfile(userId: string, profileKey: 'conservative' | 'balanced' | 'aggressive') {
  const repo = getRepo();
  const preset = RISK_PROFILE_PRESETS[profileKey] || RISK_PROFILE_PRESETS.balanced;
  repo.upsertUserRiskProfile({
    user_id: userId,
    profile_key: profileKey,
    max_loss_per_trade: preset.max_loss_per_trade,
    max_daily_loss: preset.max_daily_loss,
    max_drawdown: preset.max_drawdown,
    exposure_cap: preset.exposure_cap,
    leverage_cap: preset.leverage_cap,
    updated_at_ms: Date.now()
  });
  return repo.getUserRiskProfile(userId);
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function ensureDefaultPublicSignalsApiKey(): string {
  const repo = getRepo();
  const plainKey = String(process.env.PUBLIC_SIGNALS_API_KEY || 'nova-public-default-key');
  repo.upsertApiKey({
    key_id: 'public-signals-default',
    key_hash: hashApiKey(plainKey),
    label: 'Default Public Signals Key',
    scope: 'signals:read',
    status: 'ACTIVE'
  });
  return plainKey;
}

export function verifyPublicSignalsApiKey(rawKey?: string): boolean {
  if (!rawKey) return false;
  const repo = getRepo();
  const row = repo.getApiKeyByHash(hashApiKey(rawKey));
  return Boolean(row && row.status === 'ACTIVE');
}

export function getMarketModules(args?: { market?: Market; assetClass?: AssetClass }) {
  const repo = getRepo();
  const rows = repo.listMarketState({
    market: args?.market
  });

  const scoped = rows.filter((row) => {
    if (!args?.assetClass) return true;
    if (args.assetClass === 'CRYPTO') return row.market === 'CRYPTO';
    return row.market === 'US';
  });

  const bySymbol = new Map<string, (typeof scoped)[number]>();
  for (const row of scoped) {
    const existing = bySymbol.get(row.symbol);
    if (!existing || row.updated_at_ms > existing.updated_at_ms) bySymbol.set(row.symbol, row);
  }

  return Array.from(bySymbol.values())
    .slice(0, 36)
    .map((row, index) => {
      const event = row.event_stats_json ? (JSON.parse(row.event_stats_json) as Record<string, unknown>) : {};
      const moduleStatus = withComponentStatus({
        overallDataStatus: normalizeRuntimeStatus(event.data_status, RUNTIME_STATUS.MODEL_DERIVED),
        componentSourceStatus: normalizeRuntimeStatus(event.source_status, RUNTIME_STATUS.DB_BACKED)
      });
      return {
        id: `module-${row.market}-${row.symbol}-${index + 1}`,
        market: row.market,
        asset_class: row.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK',
        title: `${row.symbol} ${row.regime_id}`,
        summary: row.stance,
        metric: `Trend ${Number(row.trend_strength || 0).toFixed(2)} · Vol ${Number(row.volatility_percentile || 0).toFixed(1)}p`,
        source_status: moduleStatus.source_status,
        data_status: moduleStatus.data_status,
        source_label: moduleStatus.source_label,
        as_of: new Date(row.updated_at_ms).toISOString()
      };
    });
}

export function upsertExternalConnection(args: {
  userId: string;
  connectionType: 'BROKER' | 'EXCHANGE';
  provider: string;
  mode: 'READ_ONLY' | 'TRADING';
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
  meta?: Record<string, unknown>;
}) {
  const repo = getRepo();
  const id = `${args.connectionType}-${args.provider}-${args.userId}`;
  repo.upsertExternalConnection({
    connection_id: id,
    user_id: args.userId,
    connection_type: args.connectionType,
    provider: args.provider,
    mode: args.mode,
    status: args.status,
    meta_json: args.meta ? JSON.stringify(args.meta) : null
  });
  return { connection_id: id };
}

export function listExternalConnections(args: { userId: string; connectionType?: 'BROKER' | 'EXCHANGE' }) {
  const repo = getRepo();
  const rows = repo.listExternalConnections({
    userId: args.userId,
    connectionType: args.connectionType
  });
  return rows.map((row) => ({
    ...row,
    meta: row.meta_json ? JSON.parse(row.meta_json) : null
  }));
}

function toUiSignal(signal: SignalContract): Record<string, unknown> {
  const grade = signal.score >= 75 ? 'A' : signal.score >= 63 ? 'B' : 'C';
  const statusTag = signal.tags.find((tag) => String(tag).startsWith('status:'))?.split(':')[1] || RUNTIME_STATUS.MODEL_DERIVED;
  const sourceTag = signal.tags.find((tag) => String(tag).startsWith('source:'))?.split(':')[1] || RUNTIME_STATUS.DB_BACKED;
  const status = withComponentStatus({
    overallDataStatus: normalizeRuntimeStatus(statusTag, RUNTIME_STATUS.MODEL_DERIVED),
    componentSourceStatus: normalizeRuntimeStatus(sourceTag, RUNTIME_STATUS.DB_BACKED)
  });
  return {
    ...signal,
    signal_id: signal.id,
    grade,
    source_status: status.source_status,
    source_label: status.source_label,
    data_status: status.data_status
  };
}

function modeFromRiskProfile(profile?: { profile_key?: string | null }): string {
  const key = String(profile?.profile_key || 'balanced').toLowerCase();
  if (key === 'conservative') return 'do not trade';
  if (key === 'aggressive') return 'normal risk';
  return 'trade light';
}

type RuntimeStateCore = {
  repo: MarketRepository;
  userId: string;
  market: Market;
  assetClass?: AssetClass;
  state: ReturnType<typeof syncQuantState>;
  risk: ReturnType<typeof getRiskProfile>;
  signals: Record<string, unknown>[];
  marketState: ReturnType<typeof getMarketState>;
  modules: ReturnType<typeof getMarketModules>;
  performance: ReturnType<typeof getPerformanceSummary>;
  performanceSource: ReturnType<typeof derivePerformanceSourceStatus>;
  hasPerformanceSample: boolean;
  active: Record<string, unknown>[];
  topSignal: Record<string, unknown> | null;
  avgVol: number | null;
  avgTemp: number | null;
  avgRiskOff: number | null;
  mode: string;
  suggestedGross: number;
  suggestedNet: number;
  today: Record<string, unknown>;
  safety: Record<string, unknown>;
  insights: Record<string, unknown>;
  runtimeStateStatus: string;
  runtimeTransparency: Record<string, unknown>;
};

function loadRuntimeStateCore(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  forceSync?: boolean;
}): RuntimeStateCore {
  const repo = getRepo();
  const userId = args.userId || 'guest-default';
  const market = args.market || (args.assetClass === 'CRYPTO' ? 'CRYPTO' : 'US');
  const state = syncQuantState(userId, Boolean(args.forceSync), {
    market: args.market,
    assetClass: args.assetClass
  });
  const risk = getRiskProfile(userId, { skipSync: true });

  const signals = listSignalContracts({
    userId,
    market: args.market,
    assetClass: args.assetClass,
    status: 'ALL',
    limit: 60
  }).map(toUiSignal);

  const marketState = getMarketState({ userId, market });
  const modules = getMarketModules({ market, assetClass: args.assetClass });
  const performance = getPerformanceSummary({ userId, market });
  const performanceRecords = Array.isArray(performance?.records) ? performance.records : [];
  const hasPerformanceSample = performanceRecords.some((record) => {
    const overall = record?.overall as Record<string, unknown> | null;
    const sampleSize = Number(overall?.sample_size || 0);
    return Number.isFinite(sampleSize) && sampleSize > 0;
  });
  const sourceLabels = performanceRecords
    .map((record) => (record?.overall as Record<string, unknown> | null)?.source_label)
    .filter(Boolean) as string[];
  const performanceSource = derivePerformanceSourceStatus(sourceLabels);

  const active = signals
    .filter((row) => ['NEW', 'TRIGGERED'].includes(String(row.status)))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const topSignal = active[0] || null;

  const avgVol = marketState.length
    ? marketState.reduce((acc, row) => acc + Number(row.volatility_percentile || 0), 0) / marketState.length
    : null;
  const avgTemp = marketState.length
    ? marketState.reduce((acc, row) => acc + Number(row.temperature_percentile || 0), 0) / marketState.length
    : null;
  const avgRiskOff = marketState.length
    ? marketState.reduce((acc, row) => acc + Number(row.risk_off_score || 0), 0) / marketState.length
    : null;

  const mode = modeFromRiskProfile(risk || undefined);
  const suggestedGross = mode === 'do not trade' ? 18 : mode === 'trade light' ? 35 : 55;
  const suggestedNet = mode === 'do not trade' ? 8 : mode === 'trade light' ? 20 : 35;

  const today = {
    is_trading_day: true,
    trading_day_message: market === 'CRYPTO' ? 'Crypto market runs 24/7.' : 'US market session inferred from bar updates.',
    suggested_gross_exposure_pct: suggestedGross,
    suggested_net_exposure_pct: suggestedNet,
    style_hint:
      topSignal && String(topSignal.strategy_family || '').toLowerCase().includes('mean')
        ? 'mean reversion'
        : topSignal && String(topSignal.strategy_family || '').toLowerCase().includes('trend')
          ? 'trend'
          : 'watchful',
    why_today: [
      topSignal
        ? `Top setup ${String(topSignal.symbol)} from ${String(topSignal.strategy_id)} under ${String(topSignal.regime_id)}.`
        : 'No high-quality setup passed rule filters today.',
      topSignal && typeof topSignal.news_context === 'object'
        ? `News tone: ${String((topSignal.news_context as Record<string, unknown>).tone || 'NONE').toLowerCase()}.`
        : 'No fresh news context is attached to the current top setup.',
      avgVol === null ? 'Volatility percentile unavailable due to insufficient bars.' : `Average volatility percentile: ${avgVol.toFixed(1)}.`,
      avgRiskOff === null ? 'Risk-off score unavailable.' : `Average risk-off score: ${avgRiskOff.toFixed(2)}.`
    ]
  };

  const safety = {
    mode,
    safety_score: avgRiskOff === null ? 50 : Math.max(0, Math.min(100, Math.round((1 - avgRiskOff) * 100))),
    suggested_gross_exposure_pct: suggestedGross,
    suggested_net_exposure_pct: suggestedNet,
    conclusion:
      mode === 'do not trade'
        ? 'Risk-off pressure is high; preserve capital and avoid forced entries.'
        : mode === 'trade light'
          ? 'Mixed regime signals; keep size selective and controlled.'
          : 'Risk posture allows normal sizing within profile caps.',
    primary_risks: [
      avgVol !== null && avgVol > 75 ? 'Volatility percentile is elevated.' : 'Volatility is not at panic level.',
      avgTemp !== null && avgTemp > 82 ? 'Temperature is stretched; avoid chasing.' : 'Temperature is within normal range.',
      state.sourceStatus !== RUNTIME_STATUS.DB_BACKED
        ? 'Data coverage is insufficient for high-confidence actions.'
        : 'Signals are DB-backed from derived OHLCV state.'
    ],
    cards: {
      market: {
        title: 'Market',
        score: avgRiskOff === null ? 50 : Number(((1 - avgRiskOff) * 100).toFixed(1)),
        lines: ['Derived from OHLCV trend/volatility/risk-off features.']
      },
      portfolio: {
        title: 'Portfolio',
        score: mode === 'do not trade' ? 35 : mode === 'trade light' ? 55 : 70,
        lines: ['Exposure caps follow user risk profile.']
      },
      instrument: {
        title: 'Instrument',
        score: topSignal ? Number(topSignal.score || 50) : 45,
        lines: [topSignal ? `Top candidate: ${String(topSignal.symbol)}` : 'No active candidate in NEW/TRIGGERED state.']
      }
    },
    rules: [
      { id: 'size-cap', title: 'Size cap', rule: `Gross exposure cap ${risk?.exposure_cap ?? '--'}%` },
      { id: 'hard-stop', title: 'Hard stop', rule: 'Every trade requires invalidation placement before entry.' },
      { id: 'skip-on-data-gap', title: 'Data guard', rule: 'If bars are stale or missing, strategy should skip.' }
    ]
  };

  const insights = {
    regime: {
      tag: marketState[0]?.regime_id || RUNTIME_STATUS.INSUFFICIENT_DATA,
      description: marketState[0]?.stance || 'No reliable market-state record available.'
    },
    short_commentary: topSignal
      ? `Current best opportunity: ${String(topSignal.symbol)} (${String(topSignal.strategy_id)}).`
      : 'No high-quality opportunity currently passed filters.',
    breadth: {
      ratio: marketState.length
        ? Number((marketState.filter((row) => Number(row.trend_strength || 0) >= 0.55).length / marketState.length).toFixed(4))
        : null
    },
    volatility: {
      label: avgVol === null ? 'insufficient_data' : avgVol >= 80 ? 'elevated' : avgVol >= 60 ? 'moderate' : 'calm'
    },
    risk_on_off: {
      state: avgRiskOff === null ? 'insufficient_data' : avgRiskOff >= 0.7 ? 'risk_off' : avgRiskOff >= 0.55 ? 'neutral' : 'risk_on'
    },
    style: {
      preference: today.style_hint
    },
    leadership: {
      leaders: active.slice(0, 3).map((row) => ({ sector: String(row.symbol), score: Number(row.score || 0) / 100 })),
      laggards: active.slice(-3).map((row) => ({ sector: String(row.symbol), score: Number(row.score || 0) / 100 }))
    },
    why_signals_today: today.why_today
  };

  const runtimeStateStatus = normalizeRuntimeStatus(state.sourceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA);
  const runtimeLineage = buildEvidenceLineage({
    runtimeStatus: runtimeStateStatus,
    performanceStatus: performanceSource,
    sourceStatus: runtimeStateStatus,
    dataStatus: runtimeStateStatus
  });
  const runtimeTransparency = {
    as_of: new Date(state.asofMs).toISOString(),
    source_status: runtimeStateStatus,
    data_status: runtimeStateStatus,
    evidence_mode: runtimeLineage.display_mode,
    performance_mode: runtimeLineage.performance_mode,
    validation_mode: runtimeLineage.validation_mode,
    freshness_summary: state.freshnessSummary,
    coverage_summary: state.coverageSummary,
    db_backed: runtimeStateStatus === RUNTIME_STATUS.DB_BACKED,
    paper_only: performanceSource === RUNTIME_STATUS.PAPER_ONLY,
    realized: performanceSource === RUNTIME_STATUS.REALIZED,
    backtest_only: performanceSource === RUNTIME_STATUS.BACKTEST_ONLY,
    model_derived: signals.length > 0,
    experimental: runtimeStateStatus === RUNTIME_STATUS.EXPERIMENTAL,
    disconnected: false,
    performance_source: performanceSource
  };

  return {
    repo,
    userId,
    market,
    assetClass: args.assetClass,
    state,
    risk,
    signals,
    marketState,
    modules,
    performance,
    performanceSource,
    hasPerformanceSample,
    active,
    topSignal,
    avgVol,
    avgTemp,
    avgRiskOff,
    mode,
    suggestedGross,
    suggestedNet,
    today,
    safety,
    insights,
    runtimeStateStatus,
    runtimeTransparency
  };
}

function parseJsonObject(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function parseJsonArray(text: string | null | undefined): Array<Record<string, unknown>> {
  if (!text) return [];
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

function snapshotDateKey(iso: string): string {
  return String(iso || '').slice(0, 10);
}

function todayDateKey(input = new Date()): string {
  return String(input.toISOString()).slice(0, 10);
}

function localHourOrNow(hour?: number): number {
  if (Number.isFinite(hour)) {
    return Math.max(0, Math.min(23, Number(hour)));
  }
  return new Date().getHours();
}

function localDateOrToday(date?: string): string {
  const value = String(date || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayDateKey();
}

function weekStartKey(dateKey: string): string {
  const base = new Date(`${dateKey}T00:00:00`);
  if (!Number.isFinite(base.getTime())) return dateKey;
  const weekday = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - weekday);
  return todayDateKey(base);
}

function parseOptionalJson(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function decisionSnapshotFromRow(row: DecisionSnapshotRecord) {
  const summary = parseJsonObject(row.summary_json) || {};
  return {
    as_of: new Date(row.updated_at_ms).toISOString(),
    evidence_mode: row.evidence_mode,
    performance_mode: row.performance_mode,
    source_status: row.source_status,
    data_status: row.data_status,
    today_call: summary.today_call || null,
    risk_state: parseJsonObject(row.risk_state_json) || {},
    portfolio_context: parseJsonObject(row.portfolio_context_json) || {},
    ranked_action_cards: parseJsonArray(row.actions_json),
    top_action_id: row.top_action_id,
    summary,
    audit_snapshot_id: row.id,
    trace_id: null,
    from_cache: true
  };
}

function buildDecisionContextHash(args: {
  userId: string;
  market: Market;
  assetClass?: AssetClass;
  riskProfileKey?: string | null;
  runtimeStatus: string;
  holdings?: UserHoldingInput[];
  topActions: Array<{ signal_id?: string; symbol?: string }>;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass || 'ALL',
        riskProfileKey: args.riskProfileKey || 'balanced',
        runtimeStatus: args.runtimeStatus,
        holdings: (args.holdings || []).map((row) => ({
          symbol: row.symbol,
          asset_class: row.asset_class,
          market: row.market,
          weight_pct: row.weight_pct,
          quantity: row.quantity,
          sector: row.sector
        })),
        topActions: args.topActions
      })
    )
    .digest('hex');
}

function persistDecisionSnapshot(args: {
  core: RuntimeStateCore;
  decision: Record<string, unknown>;
  holdings?: UserHoldingInput[];
}) {
  const snapshotDate = snapshotDateKey(String(args.core.runtimeTransparency.as_of));
  const contextHash = buildDecisionContextHash({
    userId: args.core.userId,
    market: args.core.market,
    assetClass: args.core.assetClass,
    riskProfileKey: args.core.risk?.profile_key,
    runtimeStatus: String(args.core.runtimeTransparency.source_status),
    holdings: args.holdings,
    topActions: ((args.decision.ranked_action_cards as Array<Record<string, unknown>> | undefined) || []).map((row) => ({
      signal_id: String(row.signal_id || ''),
      symbol: String(row.symbol || '')
    }))
  });
  const snapshotId = `decision-${createHash('sha256')
    .update(`${args.core.userId}:${args.core.market}:${args.core.assetClass || 'ALL'}:${snapshotDate}:${contextHash}`)
    .digest('hex')
    .slice(0, 24)}`;
  const nowMs = Date.now();
  args.core.repo.upsertDecisionSnapshot({
    id: snapshotId,
    user_id: args.core.userId,
    market: args.core.market,
    asset_class: args.core.assetClass || 'ALL',
    snapshot_date: snapshotDate,
    context_hash: contextHash,
    evidence_mode: (String(args.decision.evidence_mode || 'UNAVAILABLE') as import('../types.js').EvidenceMode),
    performance_mode: (String(args.decision.performance_mode || 'UNAVAILABLE') as import('../types.js').EvidenceMode),
    source_status: String(args.decision.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
    data_status: String(args.decision.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
    risk_state_json: JSON.stringify(args.decision.risk_state || {}),
    portfolio_context_json: JSON.stringify(args.decision.portfolio_context || {}),
    actions_json: JSON.stringify(args.decision.ranked_action_cards || []),
    summary_json: JSON.stringify(args.decision.summary || {}),
    top_action_id: String(args.decision.top_action_id || '') || null,
    created_at_ms: nowMs,
    updated_at_ms: nowMs
  });
  const traceId = createTraceId('decision');
  recordAuditEvent(args.core.repo, {
    traceId,
    scope: 'decision_engine',
    eventType: 'decision_snapshot_generated',
    userId: args.core.userId,
    entityType: 'decision_snapshot',
    entityId: snapshotId,
    payload: {
      market: args.core.market,
      asset_class: args.core.assetClass || 'ALL',
      top_action_id: args.decision.top_action_id || null,
      ranked_action_count: Array.isArray(args.decision.ranked_action_cards) ? args.decision.ranked_action_cards.length : 0,
      evidence_mode: args.decision.evidence_mode || 'UNAVAILABLE',
      performance_mode: args.decision.performance_mode || 'UNAVAILABLE',
      source_status: args.decision.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA,
      data_status: args.decision.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA
    }
  });
  return {
    snapshotId,
    traceId
  };
}

function buildDecisionSnapshotFromCore(args: {
  core: RuntimeStateCore;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  const evidenceTop = getTopSignalEvidence(args.core.repo, {
    userId: args.core.userId,
    market: args.core.market,
    assetClass: args.core.assetClass,
    limit: 6
  });
  const previousRow = args.core.repo.getLatestDecisionSnapshot({
    userId: args.core.userId,
    market: args.core.market,
    assetClass: args.core.assetClass || 'ALL'
  });
  const previousDecision = previousRow?.summary_json ? { summary: parseJsonObject(previousRow.summary_json) || {} } : null;
  const decision = buildDecisionSnapshot({
    userId: args.core.userId,
    market: args.core.market,
    assetClass: args.core.assetClass,
    asOf: String(args.core.runtimeTransparency.as_of),
    locale: args.locale,
    runtimeSourceStatus: String(args.core.runtimeTransparency.source_status),
    performanceSourceStatus: String(args.core.performanceSource || RUNTIME_STATUS.INSUFFICIENT_DATA),
    riskProfile: args.core.risk,
    signals: args.core.signals,
    evidenceSignals: evidenceTop.records || [],
    marketState: args.core.marketState,
    executions: listExecutions({
      userId: args.core.userId,
      market: args.core.market,
      limit: 60
    }),
    holdings: args.holdings,
    previousDecision
  });

  return decision;
}

export async function getDecisionSnapshot(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  const repo = getRepo();
  await ensureFreshNewsForUniverse({ repo, market: args.market || 'ALL' });
  const core = loadRuntimeStateCore({
    ...args,
    forceSync: true
  });
  const deterministic = buildDecisionSnapshotFromCore({
    core,
    holdings: args.holdings,
    locale: args.locale
  });
  const snapshotDate = snapshotDateKey(String(core.runtimeTransparency.as_of));
  const contextHash = buildDecisionContextHash({
    userId: core.userId,
    market: core.market,
    assetClass: core.assetClass,
    riskProfileKey: core.risk?.profile_key,
    runtimeStatus: String(core.runtimeTransparency.source_status),
    holdings: args.holdings,
    topActions: ((deterministic.ranked_action_cards as Array<Record<string, unknown>> | undefined) || []).map((row) => ({
      signal_id: String(row.signal_id || ''),
      symbol: String(row.symbol || '')
    }))
  });
  const latest = core.repo.getLatestDecisionSnapshot({
    userId: core.userId,
    market: core.market,
    assetClass: core.assetClass || 'ALL'
  });
  const latestSummary = parseJsonObject(latest?.summary_json);
  const latestNovaMeta =
    latestSummary?.nova_local && typeof latestSummary.nova_local === 'object'
      ? (latestSummary.nova_local as Record<string, unknown>)
      : null;
  const cachedNovaApplied = Boolean(latestNovaMeta?.applied);
  const cachedNovaAttempted = Boolean(latestNovaMeta?.attempted);
  const cachedNovaFreshFailure =
    cachedNovaAttempted && !cachedNovaApplied && latest ? Date.now() - latest.updated_at_ms < 5 * 60 * 1000 : false;
  if (
    latest &&
    latest.snapshot_date === snapshotDate &&
    latest.context_hash === contextHash &&
    (cachedNovaApplied || cachedNovaFreshFailure || String(process.env.NOVA_DISABLE_LOCAL_GENERATION || '') === '1')
  ) {
    return decisionSnapshotFromRow(latest);
  }
  const enriched = await applyLocalNovaDecisionLanguage({
    repo: core.repo,
    userId: core.userId,
    locale: args.locale,
    decision: deterministic as Record<string, unknown>
  });
  const persisted = persistDecisionSnapshot({
    core,
    decision: enriched,
    holdings: args.holdings
  });
  return {
    ...enriched,
    audit_snapshot_id: persisted.snapshotId,
    trace_id: persisted.traceId
  };
}

async function getDecisionRowsForEngagement(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  await getDecisionSnapshot(args);
  const repo = getRepo();
  const rows = repo.listDecisionSnapshots({
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass || undefined,
    limit: 6
  });
  const current = rows[0] || null;
  const previous = rows[1] || null;
  return { current, previous };
}

function serializeNotificationRows(rows: Array<ReturnType<MarketRepository['listNotificationEvents']>[number]>) {
  return rows.map((row) => ({
    ...row,
    reason: parseOptionalJson(row.reason_json)
  }));
}

function resolveNotificationPreferences(repo: MarketRepository, userId: string) {
  const existing = repo.getUserNotificationPreferences(userId);
  if (existing) return existing;
  const defaults = defaultNotificationPreferences(userId);
  repo.upsertUserNotificationPreferences(defaults);
  return defaults;
}

export async function getEngagementState(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  const repo = getRepo();
  const userId = args.userId || 'guest-default';
  const market = args.market || 'US';
  const assetClass = args.assetClass || 'ALL';
  const { current, previous } = await getDecisionRowsForEngagement(args);
  const preferences = resolveNotificationPreferences(repo, userId);
  const rituals = repo.listUserRitualEvents({
    userId,
    market,
    assetClass,
    limit: 120
  });

  const snapshot = buildEngagementSnapshot({
    userId,
    market,
    assetClass,
    localDate: localDateOrToday(args.localDate),
    localHour: localHourOrNow(args.localHour),
    locale: args.locale,
    decisionRow: current,
    previousDecisionRow: previous,
    ritualEvents: rituals,
    notificationPreferences: preferences
  });

  for (const notification of snapshot.notification_center.notifications || []) {
    repo.upsertNotificationEvent(notification);
  }

  const persistedNotifications = repo.listNotificationEvents({
    userId,
    market,
    assetClass,
    status: 'ACTIVE',
    limit: 12
  });

  const enrichedSnapshot = await applyLocalNovaWrapUpLanguage({
    repo,
    userId,
    locale: args.locale,
    engagement: snapshot,
    decision: {
      today_call: parseOptionalJson(current?.summary_json)?.today_call || null,
      risk_state: parseOptionalJson(current?.risk_state_json) || {},
      ranked_action_cards: parseJsonArray(current?.actions_json)
    }
  });

  return {
    ...enrichedSnapshot,
    notification_center: {
      ...((enrichedSnapshot.notification_center as Record<string, unknown>) || {}),
      active_count: persistedNotifications.length,
      notifications: serializeNotificationRows(persistedNotifications)
    },
    decision_snapshot_id: current?.id || null
  };
}

function buildRitualEventId(args: {
  userId: string;
  market: Market;
  assetClass: AssetClass | 'ALL';
  eventDate: string;
  eventType: string;
}) {
  return `ritual-${createHash('sha256')
    .update(`${args.userId}:${args.market}:${args.assetClass}:${args.eventDate}:${args.eventType}`)
    .digest('hex')
    .slice(0, 20)}`;
}

async function recordRitualEvent(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  locale?: string;
  eventType: 'MORNING_CHECK_COMPLETED' | 'RISK_BOUNDARY_CONFIRMED' | 'WRAP_UP_COMPLETED' | 'WEEKLY_REVIEW_COMPLETED';
  reason?: Record<string, unknown>;
  holdings?: UserHoldingInput[];
}) {
  const repo = getRepo();
  const userId = args.userId || 'guest-default';
  const market = args.market || 'US';
  const assetClass = args.assetClass || 'ALL';
  const eventDate = localDateOrToday(args.localDate);
  const { current } = await getDecisionRowsForEngagement(args);
  const summary = parseOptionalJson(current?.summary_json);
  const nowMs = Date.now();

  repo.upsertUserRitualEvent({
    id: buildRitualEventId({
      userId,
      market,
      assetClass,
      eventDate,
      eventType: args.eventType
    }),
    user_id: userId,
    market,
    asset_class: assetClass,
    event_date: eventDate,
    week_key: args.eventType === 'WEEKLY_REVIEW_COMPLETED' ? weekStartKey(eventDate) : null,
    event_type: args.eventType,
    snapshot_id: current?.id || null,
    reason_json: JSON.stringify({
      risk_posture: summary?.risk_posture || null,
      top_action_id: current?.top_action_id || null,
      today_call: summary?.today_call || null,
      ...(args.reason || {})
    }),
    created_at_ms: nowMs,
    updated_at_ms: nowMs
  });

  return getEngagementState({
    userId,
    market,
    assetClass: assetClass === 'ALL' ? undefined : assetClass,
    localDate: eventDate,
    localHour: args.localHour,
    holdings: args.holdings,
    locale: args.locale
  });
}

export async function completeMorningCheck(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  return recordRitualEvent({
    ...args,
    eventType: 'MORNING_CHECK_COMPLETED',
    reason: { source: 'today_check' }
  });
}

export async function confirmRiskBoundary(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  return recordRitualEvent({
    ...args,
    eventType: 'RISK_BOUNDARY_CONFIRMED',
    reason: { source: 'user_boundary_confirmation' }
  });
}

export async function completeWrapUp(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  return recordRitualEvent({
    ...args,
    eventType: 'WRAP_UP_COMPLETED',
    reason: { source: 'daily_wrap_up' }
  });
}

export async function completeWeeklyReview(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  return recordRitualEvent({
    ...args,
    eventType: 'WEEKLY_REVIEW_COMPLETED',
    reason: { source: 'weekly_review' }
  });
}

export async function getWidgetSummary(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  const snapshot = await getEngagementState(args);
  return {
    as_of: snapshot.as_of,
    source_status: snapshot.source_status,
    data_status: snapshot.data_status,
    perception_layer: snapshot.perception_layer,
    widget_summary: snapshot.widget_summary,
    ui_regime_state: snapshot.ui_regime_state,
    recommendation_change: snapshot.recommendation_change
  };
}

export async function getNotificationPreview(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  localDate?: string;
  localHour?: number;
  holdings?: UserHoldingInput[];
  locale?: string;
}) {
  const snapshot = await getEngagementState(args);
  return {
    as_of: snapshot.as_of,
    source_status: snapshot.source_status,
    data_status: snapshot.data_status,
    notification_center: snapshot.notification_center
  };
}

export function getNotificationPreferencesState(userId = 'guest-default') {
  const repo = getRepo();
  return resolveNotificationPreferences(repo, userId);
}

export function setNotificationPreferencesState(args: {
  userId?: string;
  updates: Partial<{
    morning_enabled: number;
    state_shift_enabled: number;
    protective_enabled: number;
    wrap_up_enabled: number;
    frequency: 'LOW' | 'NORMAL';
    quiet_start_hour: number | null;
    quiet_end_hour: number | null;
  }>;
}) {
  const repo = getRepo();
  const userId = args.userId || 'guest-default';
  const current = resolveNotificationPreferences(repo, userId);
  const sanitizedUpdates = Object.fromEntries(
    Object.entries(args.updates || {}).filter(([, value]) => value !== undefined)
  ) as typeof args.updates;
  const next = {
    ...current,
    ...sanitizedUpdates,
    updated_at_ms: Date.now()
  };
  repo.upsertUserNotificationPreferences(next);
  return next;
}

export function getNovaRuntimeState() {
  const plan = getNovaModelPlan();
  const mode = getNovaRuntimeMode();
  return {
    endpoint: plan.endpoint,
    plan,
    routing: getNovaRoutingPolicies(),
    provider: plan.provider,
    local_only: plan.local_only,
    mode,
    availability_reason:
      mode === 'local-ollama'
        ? 'Local Ollama is the active Nova runtime.'
        : mode === 'cloud-openai-compatible'
          ? 'Cloud OpenAI-compatible inference is the active Nova runtime.'
          : 'No live Nova provider is configured; deterministic fallback remains available.'
  };
}

export async function getNovaHealthState() {
  return await inspectNovaHealth();
}

export function listNovaRuns(args?: {
  userId?: string;
  threadId?: string;
  taskType?: string;
  status?: string;
  limit?: number;
}) {
  const repo = getRepo();
  const rows = repo.listNovaTaskRuns({
    userId: args?.userId,
    threadId: args?.threadId,
    taskType: args?.taskType,
    status: args?.status,
    limit: args?.limit || 60
  });
  return {
    count: rows.length,
    records: rows.map((row) => ({
      ...row,
      input: parseOptionalJson(row.input_json),
      context: parseOptionalJson(row.context_json),
      output: parseOptionalJson(row.output_json)
    }))
  };
}

export function createNovaReviewLabel(args: {
  runId: string;
  reviewerId?: string;
  label: string;
  score?: number | null;
  notes?: string | null;
  includeInTraining?: boolean;
}) {
  const repo = getRepo();
  return labelNovaRun({
    repo,
    runId: args.runId,
    reviewerId: args.reviewerId || 'manual-review',
    label: args.label,
    score: args.score,
    notes: args.notes,
    includeInTraining: args.includeInTraining
  });
}

export function exportNovaTrainingDataset(args?: { onlyIncluded?: boolean; limit?: number }) {
  const repo = getRepo();
  return buildMlxLmTrainingDataset(repo, args);
}

export async function runNovaTrainingFlywheelNow(args?: {
  userId?: string;
  trainer?: NovaTrainerKind;
  onlyIncluded?: boolean;
  limit?: number;
  taskTypes?: NovaTaskType[];
}) {
  const repo = getRepo();
  return await runNovaTrainingFlywheel({
    repo,
    userId: args?.userId || null,
    trainer: args?.trainer,
    onlyIncluded: args?.onlyIncluded,
    limit: args?.limit,
    taskTypes: args?.taskTypes
  });
}

export async function runNovaStrategyGeneration(args: {
  userId?: string;
  prompt: string;
  locale?: string;
  market?: Market;
  riskProfile?: string;
  maxCandidates?: number;
}) {
  const repo = getRepo();
  return await generateGovernedNovaStrategies({
    repo,
    userId: args.userId || null,
    prompt: args.prompt,
    locale: args.locale || 'en',
    market: args.market || null,
    riskProfile: args.riskProfile || null,
    maxCandidates: args.maxCandidates
  });
}

export async function recordNovaAssistantRun(args: {
  userId: string;
  threadId?: string;
  context?: Record<string, unknown>;
  message: string;
  responseText: string;
  provider: string;
  status: 'SUCCEEDED' | 'FAILED';
  error?: string;
}) {
  const repo = getRepo();
  await logNovaAssistantAnswer({
    repo,
    userId: args.userId,
    threadId: args.threadId,
    context: args.context || {},
    message: args.message,
    responseText: args.responseText,
    provider: args.provider,
    status: args.status,
    error: args.error
  });
}

export function listDecisionAudit(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  limit?: number;
}) {
  const repo = getRepo();
  const rows = repo.listDecisionSnapshots({
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass || undefined,
    limit: args.limit || 20
  });
  return {
    count: rows.length,
    records: rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      market: row.market,
      asset_class: row.asset_class,
      snapshot_date: row.snapshot_date,
      source_status: row.source_status,
      data_status: row.data_status,
      top_action_id: row.top_action_id,
      summary: parseJsonObject(row.summary_json),
      risk_state: parseJsonObject(row.risk_state_json),
      portfolio_context: parseJsonObject(row.portfolio_context_json),
      actions: (() => {
        try {
          return JSON.parse(row.actions_json || '[]');
        } catch {
          return [];
        }
      })(),
      updated_at_ms: row.updated_at_ms
    }))
  };
}

export function getRuntimeState(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
}) {
  const core = loadRuntimeStateCore(args);
  const decision = buildDecisionSnapshotFromCore({
    core
  });

  return {
    asof: core.runtimeTransparency.as_of,
    source_status: core.runtimeTransparency.source_status,
    data_status: core.runtimeTransparency.data_status,
    data_transparency: core.runtimeTransparency,
    data: {
      signals: core.signals,
      performance: core.performance,
      decision,
      trades: listExecutions({ userId: core.userId, market: core.market, limit: 200 }).map((row) => ({
        ...row,
        time_in: new Date(row.created_at_ms).toISOString(),
        time_out: new Date(row.created_at_ms).toISOString(),
        entry: row.entry_price,
        exit: row.tp_price ?? row.entry_price
      })),
      velocity: {
        as_of: core.runtimeTransparency.as_of,
        market: core.market,
        volatility_percentile: core.avgVol,
        temperature_percentile: core.avgTemp,
        risk_off_score: core.avgRiskOff,
        ...withComponentStatus({
          overallDataStatus: normalizeRuntimeStatus(core.runtimeTransparency.data_status, RUNTIME_STATUS.INSUFFICIENT_DATA),
          componentSourceStatus: RUNTIME_STATUS.MODEL_DERIVED
        })
      },
      config: {
        last_updated: core.runtimeTransparency.as_of,
        ...withComponentStatus({
          overallDataStatus: normalizeRuntimeStatus(core.runtimeTransparency.data_status, RUNTIME_STATUS.INSUFFICIENT_DATA),
          componentSourceStatus: RUNTIME_STATUS.MODEL_DERIVED
        }),
        risk_rules: {
          per_trade_risk_pct: core.risk?.max_loss_per_trade ?? null,
          daily_loss_pct: core.risk?.max_daily_loss ?? null,
          max_dd_pct: core.risk?.max_drawdown ?? null,
          exposure_cap_pct: core.risk?.exposure_cap ?? null,
          vol_switch: true
        },
        risk_status: {
          current_risk_bucket: core.mode.toUpperCase(),
          bucket_state: core.mode.toUpperCase(),
          diagnostics: {
            daily_pnl_pct: null,
            max_dd_pct: null
          }
        },
        runtime: core.runtimeTransparency
      },
      market_modules: core.modules,
      analytics: {
        source_status: core.runtimeTransparency.source_status,
        runtime: core.runtimeTransparency,
        status_flags: {
          runtime_source: core.runtimeTransparency.source_status,
          performance_source: core.performanceSource,
          has_performance_sample: core.hasPerformanceSample
        }
      },
      research: {
        ...withComponentStatus({
          overallDataStatus: normalizeRuntimeStatus(core.runtimeTransparency.data_status, RUNTIME_STATUS.INSUFFICIENT_DATA),
          componentSourceStatus: RUNTIME_STATUS.MODEL_DERIVED
        }),
        notes: [
          core.runtimeTransparency.data_status === RUNTIME_STATUS.DB_BACKED
            ? 'Runtime app state is DB-backed; advanced research modules remain experimental in this API path.'
            : 'Runtime app state is currently insufficient for high-confidence research overlays.'
        ]
      },
      today: core.today,
      safety: core.safety,
      insights: core.insights,
      ai: {
        source_transparency: core.runtimeTransparency
      },
      layers: {
        data_layer: {
          instruments: core.marketState.map((row) => ({
            ticker: row.symbol,
            market: row.market,
            latest_close: null,
            sector: row.market === 'CRYPTO' ? 'Crypto' : 'US'
          }))
        },
        portfolio_layer: {
          candidates: core.active.slice(0, 12).map((row) => ({
            ticker: row.symbol,
            direction: row.direction,
            grade: row.grade,
            confidence: row.confidence,
            risk_score: row.volatility_percentile,
            entry_plan: {
              entry_zone: row.entry_zone
            }
          })),
          filtered_out: core.signals
            .filter((row) => !['NEW', 'TRIGGERED'].includes(String(row.status)))
            .slice(0, 12)
            .map((row) => ({ ticker: row.symbol, reason: row.status }))
        }
      }
    }
  };
}

export async function getControlPlaneStatus(args?: { userId?: string }) {
  const repo = getRepo();
  const userId = args?.userId || 'guest-default';
  const markets: Market[] = ['US', 'CRYPTO'];
  const runtime = markets.map((market) => {
    const core = loadRuntimeStateCore({
      userId,
      market
    });
    const decision = buildDecisionSnapshotFromCore({
      core
    });
    const topAction = ((decision.ranked_action_cards as Array<Record<string, unknown>> | undefined) || [])[0] || null;
    return {
      market,
      as_of: core.runtimeTransparency.as_of,
      source_status: core.runtimeTransparency.source_status,
      data_status: core.runtimeTransparency.data_status,
      signal_count: core.signals.length,
      active_signal_count: core.active.length,
      decision_code: String((decision.today_call as Record<string, unknown> | undefined)?.code || 'WAIT'),
      top_action_symbol: topAction ? String(topAction.symbol || '') || null : null,
      top_action_label: topAction ? String(topAction.action_label || '') || null : null,
      coverage: core.runtimeTransparency.coverage_summary || null,
      freshness: core.runtimeTransparency.freshness_summary || null
    };
  });

  const activeNotifications = repo.listNotificationEvents({
    userId,
    status: 'ACTIVE',
    limit: 50
  });
  const workflowRuns = repo.listWorkflowRuns({
    workflowKey: 'nova_strategy_lab',
    status: 'SUCCEEDED',
    limit: 10
  });
  const latestStrategyLabRun = workflowRuns[0] || null;
  const browseHome = await getBrowseHomePayload({
    view: 'NOW'
  }).catch(() => null);

  return {
    as_of: new Date().toISOString(),
    search: {
      ...getSearchHealth(),
      query_path: '/api/assets/search',
      browse_home_status: browseHome ? 'READY' : 'UNAVAILABLE',
      browse_home_featured_count: browseHome?.futuresMarkets?.length || 0,
      browse_home_movers_count: browseHome?.topMovers?.length || 0
    },
    runtime,
    strategy_factory: {
      latest_run_at: latestStrategyLabRun ? new Date(latestStrategyLabRun.updated_at_ms).toISOString() : null,
      latest_status: latestStrategyLabRun?.status || 'IDLE',
      recent_run_count: workflowRuns.length
    },
    delivery: {
      active_notification_count: activeNotifications.length,
      latest_notification_at: activeNotifications[0] ? new Date(activeNotifications[0].updated_at_ms).toISOString() : null
    }
  };
}

export function getBackendBackbone(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
}) {
  return buildBackendBackboneSummary(args);
}

export function runEvidence(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  timeframe?: string;
  maxSignals?: number;
  force?: boolean;
}) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    assetClass: args.assetClass,
    timeframe: args.timeframe
  });
  return runEvidenceEngine(repo, {
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass,
    timeframe: args.timeframe,
    maxSignals: args.maxSignals,
    force: args.force
  });
}

export function getEvidenceTopSignals(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  limit?: number;
}) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    assetClass: args.assetClass
  });
  return getTopSignalEvidence(repo, {
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass,
    limit: args.limit
  });
}

export function getEvidenceSignalDetail(args: { signalId: string; userId?: string }) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false);
  return getSignalEvidenceDetail(repo, {
    signalId: args.signalId,
    userId: args.userId || 'guest-default'
  });
}

export function listEvidenceBacktests(args?: {
  runType?: string;
  status?: string;
  strategyVersionId?: string;
  limit?: number;
}) {
  const repo = getRepo();
  return listBacktestEvidence(repo, {
    runType: args?.runType,
    status: args?.status,
    strategyVersionId: args?.strategyVersionId,
    limit: args?.limit
  });
}

export function getEvidenceBacktestDetail(runId: string) {
  const repo = getRepo();
  return getBacktestEvidenceDetail(repo, runId);
}

export function listEvidenceReconciliation(args?: {
  replayRunId?: string;
  symbol?: string;
  strategyVersionId?: string;
  status?: 'RECONCILED' | 'PAPER_DATA_UNAVAILABLE' | 'REPLAY_DATA_UNAVAILABLE' | 'PARTIAL';
  limit?: number;
}) {
  const repo = getRepo();
  return listReconciliationEvidence(repo, {
    replayRunId: args?.replayRunId,
    symbol: args?.symbol,
    strategyVersionId: args?.strategyVersionId,
    status: args?.status,
    limit: args?.limit
  });
}

export function getEvidenceChampionStrategies() {
  const repo = getRepo();
  return getChampionStrategies(repo);
}

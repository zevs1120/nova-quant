import { createHash } from 'node:crypto';
import pLimit from 'p-limit';
import type { Market, NewsItemRecord } from '../types.js';
import type { MarketRepository } from '../db/repository.js';
import { getConfig } from '../config.js';

const NEWS_TTL_MS = 1000 * 60 * 90;
const NEWS_TIMEOUT_MS = 2600;
const NEWS_CONCURRENCY = 4;
const positiveTokens = ['beat', 'surge', 'growth', 'record', 'bullish', 'upgrade', 'approval', 'partnership', 'launch', 'buyback'];
const negativeTokens = ['miss', 'drop', 'lawsuit', 'downgrade', 'risk', 'probe', 'ban', 'hack', 'fraud', 'delay', 'cuts'];

const usAliases: Record<string, string[]> = {
  AAPL: ['Apple'],
  MSFT: ['Microsoft'],
  NVDA: ['NVIDIA'],
  TSLA: ['Tesla'],
  SPY: ['S&P 500'],
  QQQ: ['Nasdaq 100']
};

const cryptoAliases: Record<string, string[]> = {
  BTCUSDT: ['Bitcoin'],
  ETHUSDT: ['Ethereum'],
  SOLUSDT: ['Solana'],
  BTC: ['Bitcoin'],
  ETH: ['Ethereum'],
  SOL: ['Solana']
};

function normalizeSymbol(symbol: string): string {
  return String(symbol || '').trim().toUpperCase();
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

function scoreHeadline(headline: string): { sentiment: NewsItemRecord['sentiment_label']; relevance: number } {
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

function parseGoogleNewsRss(xml: string, market: Market, symbol: string): NewsItemRecord[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6);
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
      url: link || null,
      published_at_ms: pubDate,
      sentiment_label: scored.sentiment,
      relevance_score: Number(scored.relevance.toFixed(4)),
      payload_json: JSON.stringify({
        provider: 'google_news_rss',
        symbol,
        market,
        publisher: source,
        sourceUrl,
        summary: description.summary,
        imageUrl: description.imageUrl
      }),
      updated_at_ms: now
    } satisfies NewsItemRecord;
  });
}

async function fetchTextWithTimeout(url: string, init: RequestInit = {}, timeoutMs = NEWS_TIMEOUT_MS): Promise<string> {
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
    if (!response.ok) {
      throw new Error(`News request failed (${response.status})`);
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function aliasQuery(market: Market, symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  const aliases = market === 'CRYPTO' ? cryptoAliases[normalized] || [normalized.replace(/USDT$/, '')] : usAliases[normalized] || [normalized];
  return aliases[0] || normalized;
}

async function fetchGoogleNewsItems(market: Market, symbol: string): Promise<NewsItemRecord[]> {
  const query = market === 'CRYPTO' ? `${aliasQuery(market, symbol)} crypto` : `${aliasQuery(market, symbol)} stock`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await fetchTextWithTimeout(url);
  return parseGoogleNewsRss(xml, market, normalizeSymbol(symbol));
}

export async function ensureFreshNewsForSymbol(args: { repo: MarketRepository; market: Market; symbol: string }) {
  const symbol = normalizeSymbol(args.symbol);
  const latest = args.repo.listNewsItems({ market: args.market, symbol, limit: 1 })[0] || null;
  if (latest && Date.now() - latest.updated_at_ms < NEWS_TTL_MS) {
    return {
      market: args.market,
      symbol,
      fetched: false,
      skipped: true,
      rows_upserted: 0,
      error: null
    };
  }
  try {
    const rows = await fetchGoogleNewsItems(args.market, symbol);
    if (rows.length) args.repo.upsertNewsItems(rows);
    return {
      market: args.market,
      symbol,
      fetched: true,
      skipped: false,
      rows_upserted: rows.length,
      error: null
    };
  } catch {
    // leave stale news in place if fetch fails
    return {
      market: args.market,
      symbol,
      fetched: false,
      skipped: false,
      rows_upserted: 0,
      error: 'fetch_failed'
    };
  }
}

export function buildNewsContext(rows: NewsItemRecord[], symbol: string) {
  const top = rows.slice(0, 3);
  const toneCounts = top.reduce(
    (acc, row) => {
      acc[row.sentiment_label] = (acc[row.sentiment_label] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
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
    symbol: normalizeSymbol(symbol),
    headline_count: rows.length,
    tone,
    top_headlines: top.map((row) => row.headline),
    updated_at: top[0] ? new Date(top[0].updated_at_ms).toISOString() : null,
    source: top[0]?.source || 'none'
  } as const;
}

export async function ensureFreshNewsForUniverse(args: { repo: MarketRepository; market?: Market | 'ALL' }) {
  const config = getConfig();
  const targets: Array<{ market: Market; symbol: string }> = [
    ...config.markets.US.symbols.map((symbol) => ({ market: 'US' as const, symbol })),
    ...config.markets.CRYPTO.symbols.map((symbol) => ({ market: 'CRYPTO' as const, symbol }))
  ].filter((row) => !args.market || args.market === 'ALL' || row.market === args.market);

  const limit = pLimit(NEWS_CONCURRENCY);
  const results = await Promise.all(
    targets.map((target) =>
      limit(() =>
        ensureFreshNewsForSymbol({
          repo: args.repo,
          market: target.market,
          symbol: target.symbol
        })
      )
    )
  );

  return {
    market: args.market || 'ALL',
    targets: targets.length,
    refreshed_symbols: results.filter((row) => row.fetched).length,
    skipped_symbols: results.filter((row) => row.skipped).length,
    rows_upserted: results.reduce((acc, row) => acc + Number(row.rows_upserted || 0), 0),
    errors: results.filter((row) => row.error).map((row) => ({ market: row.market, symbol: row.symbol, error: row.error }))
  };
}

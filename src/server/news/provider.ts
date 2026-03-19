import { createHash } from 'node:crypto';
import type { Market, NewsItemRecord } from '../types.js';
import type { MarketRepository } from '../db/repository.js';
import { getConfig } from '../config.js';

const NEWS_TTL_MS = 1000 * 60 * 90;
const NEWS_TIMEOUT_MS = 2600;
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

function parseGoogleNewsRss(xml: string, market: Market, symbol: string): NewsItemRecord[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6);
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
      published_at_ms: pubDate,
      sentiment_label: scored.sentiment,
      relevance_score: Number(scored.relevance.toFixed(4)),
      payload_json: JSON.stringify({ provider: 'google_news_rss', symbol, market }),
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

  await Promise.all(
    targets.map(async (target) => {
      const latest = args.repo.listNewsItems({ market: target.market, symbol: target.symbol, limit: 1 })[0] || null;
      if (latest && Date.now() - latest.updated_at_ms < NEWS_TTL_MS) return;
      try {
        const rows = await fetchGoogleNewsItems(target.market, target.symbol);
        if (rows.length) args.repo.upsertNewsItems(rows);
      } catch {
        // leave stale news in place if fetch fails
      }
    })
  );
}

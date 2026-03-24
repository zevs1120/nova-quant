import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { ensureFreshNewsForSymbol } from '../src/server/news/provider.js';
import {
  ensureFreshFundamentalsForSymbol,
  ensureFreshOptionsForSymbol,
} from '../src/server/jobs/referenceData.js';

function makeJsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function makeTextResponse(text: string) {
  return {
    ok: true,
    json: async () => ({ text }),
    text: async () => text,
  };
}

describe('hosted reference data ingestion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('stores Alpha Vantage and Finnhub fundamentals for US symbols', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    vi.stubEnv('ALPHA_VANTAGE_API_KEY', 'alpha-key');
    vi.stubEnv('FINNHUB_API_KEY', 'finnhub-key');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('alphavantage.co') && url.includes('function=OVERVIEW')) {
          return makeJsonResponse({ Symbol: 'AAPL', PERatio: '28.4' });
        }
        if (url.includes('alphavantage.co') && url.includes('function=INCOME_STATEMENT')) {
          return makeJsonResponse({ symbol: 'AAPL', annualReports: [{ totalRevenue: '1000' }] });
        }
        if (url.includes('alphavantage.co') && url.includes('function=BALANCE_SHEET')) {
          return makeJsonResponse({ symbol: 'AAPL', annualReports: [{ totalAssets: '2000' }] });
        }
        if (url.includes('alphavantage.co') && url.includes('function=EARNINGS')) {
          return makeJsonResponse({
            symbol: 'AAPL',
            annualEarnings: [{ fiscalDateEnding: '2025-12-31' }],
          });
        }
        if (url.includes('finnhub.io') && url.includes('/stock/metric')) {
          return makeJsonResponse({ metric: { peTTM: 27.1, epsGrowthTTMYoy: 0.14 } });
        }
        if (url.includes('finnhub.io') && url.includes('/stock/financials-reported')) {
          return makeJsonResponse({ data: [{ year: 2025, report: { ic: { revenue: 1000 } } }] });
        }
        throw new Error(`Unhandled URL ${url}`);
      }),
    );

    const result = await ensureFreshFundamentalsForSymbol({
      repo,
      market: 'US',
      symbol: 'AAPL',
    });

    expect(result.fetched).toBe(true);
    expect(result.rows_upserted).toBe(2);
    const snapshots = repo.listFundamentalSnapshots({ market: 'US', symbol: 'AAPL', limit: 10 });
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((row) => row.source).sort()).toEqual(['ALPHA_VANTAGE', 'FINNHUB']);
  });

  it('stores Yahoo option chain summaries for US symbols', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/v7/finance/options/AAPL') && !url.includes('date=')) {
          return makeJsonResponse({
            optionChain: {
              result: [
                {
                  expirationDates: [1_760_000_000],
                  quote: { regularMarketPrice: 188.5 },
                },
              ],
            },
          });
        }
        if (url.includes('/v7/finance/options/AAPL') && url.includes('date=1760000000')) {
          return makeJsonResponse({
            optionChain: {
              result: [
                {
                  options: [
                    {
                      expirationDate: 1_760_000_000,
                      calls: [
                        {
                          contractSymbol: 'AAPL-C1',
                          impliedVolatility: 0.22,
                          openInterest: 1200,
                          volume: 180,
                        },
                      ],
                      puts: [
                        {
                          contractSymbol: 'AAPL-P1',
                          impliedVolatility: 0.26,
                          openInterest: 1500,
                          volume: 160,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          });
        }
        throw new Error(`Unhandled URL ${url}`);
      }),
    );

    const result = await ensureFreshOptionsForSymbol({
      repo,
      market: 'US',
      symbol: 'AAPL',
    });

    expect(result.fetched).toBe(true);
    expect(result.rows_upserted).toBe(1);
    const snapshots = repo.listOptionChainSnapshots({ market: 'US', symbol: 'AAPL', limit: 5 });
    expect(snapshots).toHaveLength(1);
    const payload = JSON.parse(snapshots[0].payload_json) as Record<string, any>;
    expect(payload.summary.total_open_interest).toBe(2700);
    expect(payload.summary.iv_skew).toBeCloseTo(-0.04, 6);
  });

  it('falls back to the root Yahoo options payload when dated option calls are unavailable', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/v7/finance/options/AAPL') && !url.includes('date=')) {
          return makeJsonResponse({
            optionChain: {
              result: [
                {
                  expirationDates: [1_760_000_000],
                  quote: { regularMarketPrice: 188.5 },
                  options: [
                    {
                      expirationDate: 1_760_000_000,
                      calls: [
                        {
                          contractSymbol: 'AAPL-C1',
                          impliedVolatility: 0.22,
                          openInterest: 1200,
                          volume: 180,
                        },
                      ],
                      puts: [
                        {
                          contractSymbol: 'AAPL-P1',
                          impliedVolatility: 0.26,
                          openInterest: 1500,
                          volume: 160,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          });
        }
        return new Response('blocked', { status: 500 });
      }),
    );

    const result = await ensureFreshOptionsForSymbol({
      repo,
      market: 'US',
      symbol: 'AAPL',
    });

    expect(result.fetched).toBe(true);
    expect(result.rows_upserted).toBe(1);
  });

  it('surfaces Yahoo option fetch errors instead of a generic fetch_failed marker', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('blocked', { status: 401 })),
    );

    const result = await ensureFreshOptionsForSymbol({
      repo,
      market: 'US',
      symbol: 'SPY',
    });

    expect(result.fetched).toBe(false);
    expect(result.error).toContain('401');
  });

  it('falls back to a CBOE option snapshot when Yahoo returns 401', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('finance.yahoo.com')) {
          return new Response('blocked', { status: 401 });
        }
        if (url.includes('cdn.cboe.com')) {
          return makeJsonResponse({
            data: {
              current_price: 500.25,
              options: [
                {
                  option: 'SPY240101C00500000',
                  iv: 0.21,
                  open_interest: 1000,
                  volume: 120,
                  delta: 0.45,
                  gamma: 0.01,
                },
                {
                  option: 'SPY240101P00500000',
                  iv: 0.24,
                  open_interest: 1300,
                  volume: 110,
                  delta: -0.42,
                  gamma: 0.012,
                },
              ],
            },
          });
        }
        throw new Error(`Unhandled URL ${url}`);
      }),
    );

    const result = await ensureFreshOptionsForSymbol({
      repo,
      market: 'US',
      symbol: 'SPY',
    });

    expect(result.fetched).toBe(true);
    expect(result.rows_upserted).toBe(1);
    const snapshots = repo.listOptionChainSnapshots({ market: 'US', symbol: 'SPY', limit: 5 });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].source).toBe('CBOE_OPTIONS');
  });

  it('merges Google, Finnhub, and NewsAPI headlines before Gemini analysis', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    vi.stubEnv('FINNHUB_API_KEY', 'finnhub-key');
    vi.stubEnv('NEWSAPI_API_KEY', 'newsapi-key');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('news.google.com')) {
          return makeTextResponse(`
            <rss><channel>
              <item>
                <title>Apple demand jumps after launch - Reuters</title>
                <link>https://example.com/google-1</link>
                <pubDate>Fri, 21 Mar 2026 10:00:00 GMT</pubDate>
                <description><![CDATA[<p>Google summary</p>]]></description>
              </item>
            </channel></rss>
          `);
        }
        if (url.includes('finnhub.io') && url.includes('/company-news')) {
          return makeJsonResponse([
            {
              headline: 'Apple suppliers guide higher',
              source: 'Finnhub Wire',
              summary: 'Finnhub summary',
              url: 'https://example.com/finnhub-1',
              datetime: 1_774_050_000,
            },
          ]);
        }
        if (url.includes('newsapi.org')) {
          return makeJsonResponse({
            articles: [
              {
                title: 'Apple options demand stays strong',
                description: 'NewsAPI summary',
                url: 'https://example.com/newsapi-1',
                publishedAt: '2026-03-21T09:00:00Z',
                source: { name: 'NewsAPI Wire' },
              },
            ],
          });
        }
        throw new Error(`Unhandled URL ${url}`);
      }),
    );

    const result = await ensureFreshNewsForSymbol({
      repo,
      market: 'US',
      symbol: 'AAPL',
    });

    expect(result.fetched).toBe(true);
    expect(result.rows_upserted).toBe(3);
    const rows = repo.listNewsItems({ market: 'US', symbol: 'AAPL', limit: 10 });
    expect(rows.map((row) => row.source)).toEqual(
      expect.arrayContaining(['Reuters', 'Finnhub Wire', 'NewsAPI Wire']),
    );
  });
});

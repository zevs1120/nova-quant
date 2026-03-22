import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewsItemRecord } from '../src/server/types.js';
import Database from 'better-sqlite3';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { enrichNewsRowsWithGeminiFactors } from '../src/server/news/geminiFactors.js';
import { buildNewsContext, ensureFreshNewsForSymbol } from '../src/server/news/provider.js';

function makeRow(id: string, headline: string): NewsItemRecord {
  return {
    id,
    market: 'US',
    symbol: 'AAPL',
    headline,
    source: 'Example Wire',
    url: null,
    published_at_ms: 1_710_000_000_000,
    sentiment_label: 'NEUTRAL',
    relevance_score: 0.35,
    payload_json: JSON.stringify({
      provider: 'google_news_rss',
      summary: `${headline} summary`
    }),
    updated_at_ms: 1_710_000_000_000
  };
}

describe('news provider with Gemini factors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('enriches fetched headlines with Gemini factor payloads', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    summary: 'Apple headlines are supportive but event-driven.',
                    sentiment_score: 0.52,
                    event_risk_score: 0.41,
                    macro_policy_score: 0.18,
                    earnings_impact_score: 0.73,
                    trading_bias: 'BULLISH',
                    factor_tags: ['earnings', 'product_cycle'],
                    items: [
                      {
                        id: 'news-1',
                        sentiment_score: 0.66,
                        relevance_score: 0.82,
                        event_type: 'earnings',
                        impact_horizon: 'near_term',
                        thesis: 'Fresh earnings optimism is dominating the tape.'
                      }
                    ]
                  })
                }
              ]
            }
          }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const enriched = await enrichNewsRowsWithGeminiFactors({
      market: 'US',
      symbol: 'AAPL',
      rows: [makeRow('news-1', 'Apple rallies after upbeat guidance')]
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(enriched[0].sentiment_label).toBe('POSITIVE');
    expect(enriched[0].relevance_score).toBe(0.82);

    const payload = JSON.parse(enriched[0].payload_json) as Record<string, any>;
    expect(payload.gemini_analysis.batch.trading_bias).toBe('BULLISH');
    expect(payload.gemini_analysis.headline.event_type).toBe('earnings');
  });

  it('builds factor-aware news context from enriched payloads', () => {
    const rows: NewsItemRecord[] = [
      {
        ...makeRow('news-1', 'Apple rallies after upbeat guidance'),
        sentiment_label: 'POSITIVE',
        relevance_score: 0.82,
        payload_json: JSON.stringify({
          provider: 'google_news_rss',
          summary: 'summary',
          gemini_analysis: {
            batch: {
              provider: 'gemini',
              summary: 'Supportive earnings tone with manageable macro drag.',
              sentiment_score: 0.52,
              event_risk_score: 0.41,
              macro_policy_score: 0.18,
              earnings_impact_score: 0.73,
              trading_bias: 'BULLISH',
              factor_tags: ['earnings', 'product_cycle']
            },
            headline: {
              sentiment_score: 0.66,
              relevance_score: 0.82
            }
          }
        })
      },
      {
        ...makeRow('news-2', 'Apple supply chain remains stable'),
        sentiment_label: 'NEUTRAL',
        relevance_score: 0.51,
        payload_json: JSON.stringify({
          provider: 'google_news_rss',
          summary: 'summary 2',
          gemini_analysis: {
            batch: {
              provider: 'gemini',
              summary: 'Supportive earnings tone with manageable macro drag.',
              sentiment_score: 0.52,
              event_risk_score: 0.41,
              macro_policy_score: 0.18,
              earnings_impact_score: 0.73,
              trading_bias: 'BULLISH',
              factor_tags: ['earnings', 'product_cycle']
            },
            headline: {
              sentiment_score: 0.38,
              relevance_score: 0.51
            }
          }
        })
      }
    ];

    const context = buildNewsContext(rows, 'AAPL');
    expect(context.analysis_provider).toBe('gemini');
    expect(context.trading_bias).toBe('BULLISH');
    expect(context.factor_tags).toEqual(['earnings', 'product_cycle']);
    expect(context.factor_score).toBe(0.52);
    expect(context.earnings_impact_score).toBe(0.73);
  });

  it('backfills Gemini factors onto cached fresh news rows', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');

    const freshRow = makeRow('news-1', 'Apple rallies after upbeat guidance');
    freshRow.updated_at_ms = Date.now();
    repo.upsertNewsItems([freshRow]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    summary: 'Apple headlines are supportive but event-driven.',
                    sentiment_score: 0.52,
                    event_risk_score: 0.41,
                    macro_policy_score: 0.18,
                    earnings_impact_score: 0.73,
                    trading_bias: 'BULLISH',
                    factor_tags: ['earnings', 'product_cycle'],
                    items: [
                      {
                        id: 'news-1',
                        sentiment_score: 0.66,
                        relevance_score: 0.82,
                        event_type: 'earnings',
                        impact_horizon: 'near_term',
                        thesis: 'Fresh earnings optimism is dominating the tape.'
                      }
                    ]
                  })
                }
              ]
            }
          }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureFreshNewsForSymbol({
      repo,
      market: 'US',
      symbol: 'AAPL'
    });

    expect(result.fetched).toBe(true);
    expect(result.rows_upserted).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rows = repo.listNewsItems({ market: 'US', symbol: 'AAPL', limit: 5 });
    const payload = JSON.parse(rows[0].payload_json) as Record<string, any>;
    expect(payload.gemini_analysis.batch.trading_bias).toBe('BULLISH');
  });

  it('falls back to heuristic structured factors when Gemini output is unusable', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');
    vi.stubEnv('NOVA_NEWS_HEURISTIC_FACTORS_ENABLED', '1');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'unstructured response that is not json'
                }
              ]
            }
          }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const enriched = await enrichNewsRowsWithGeminiFactors({
      market: 'US',
      symbol: 'AAPL',
      rows: [makeRow('news-heuristic', 'Apple gains after analyst upgrade and product launch optimism')]
    });

    const payload = JSON.parse(enriched[0].payload_json) as Record<string, any>;
    expect(payload.gemini_analysis.batch.provider).toBe('heuristic');
    expect(payload.gemini_analysis.batch.factor_tags.length).toBeGreaterThan(0);
    expect(payload.gemini_analysis.headline.event_type).not.toBe('other');
  });
});

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { buildPrivateMarvixOpsReport, isLoopbackAddress } from '../src/server/ops/privateMarvixOps.js';

describe('private Marvix ops report', () => {
  it('accepts only loopback addresses for private ops access', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('10.0.0.5')).toBe(false);
  });

  it('builds a private report with workflow and Gemini news summaries', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();

    repo.upsertWorkflowRun({
      id: 'workflow-free-data-1',
      workflow_key: 'free_data_flywheel',
      workflow_version: 'free-data-flywheel.v1',
      trigger_type: 'manual',
      status: 'SUCCEEDED',
      trace_id: 'trace-free-data-1',
      input_json: JSON.stringify({ market: 'ALL' }),
      output_json: JSON.stringify({
        news: {
          refreshed_symbols: 4,
          rows_upserted: 12
        }
      }),
      attempt_count: 1,
      started_at_ms: now - 5_000,
      updated_at_ms: now - 2_000,
      completed_at_ms: now - 2_000
    });

    repo.upsertNewsItems([
      {
        id: 'news-aapl-1',
        market: 'US',
        symbol: 'AAPL',
        headline: 'Apple demand strengthens after product event',
        source: 'Example Wire',
        url: null,
        published_at_ms: now - 60_000,
        sentiment_label: 'POSITIVE',
        relevance_score: 0.88,
        payload_json: JSON.stringify({
          provider: 'google_news_rss',
          gemini_analysis: {
            batch: {
              provider: 'gemini',
              trading_bias: 'BULLISH',
              factor_tags: ['product_cycle', 'demand'],
              summary: 'Demand and product-cycle tone remain supportive.',
              sentiment_score: 0.53,
              event_risk_score: 0.32
            },
            headline: {
              sentiment_score: 0.67,
              relevance_score: 0.88
            }
          }
        }),
        updated_at_ms: now - 30_000
      }
    ]);

    repo.upsertFundamentalSnapshots([
      {
        id: 'fund-aapl-1',
        market: 'US',
        symbol: 'AAPL',
        source: 'FINNHUB',
        asof_date: '2026-03-21',
        payload_json: JSON.stringify({
          provider: 'finnhub',
          metrics: { peTTM: 28.1 }
        }),
        updated_at_ms: now - 25_000
      }
    ]);

    repo.upsertOptionChainSnapshots([
      {
        id: 'opt-aapl-1',
        market: 'US',
        symbol: 'AAPL',
        expiration_date: '2026-04-17',
        snapshot_ts_ms: now - 20_000,
        source: 'YAHOO_OPTIONS',
        payload_json: JSON.stringify({
          summary: {
            contracts_count: 24,
            total_open_interest: 12000,
            total_volume: 1800,
            iv_skew: -0.03
          }
        }),
        updated_at_ms: now - 20_000
      }
    ]);

    const report = buildPrivateMarvixOpsReport(repo);
    expect(report.visibility).toBe('private-loopback-only');
    expect(report.workflows[0]?.workflow_key).toBe('free_data_flywheel');
    expect(report.recent_news_factors[0]?.analysis_provider).toBe('gemini');
    expect(report.recent_news_factors[0]?.factor_tags).toContain('product_cycle');
    expect(report.reference_data.fundamentals[0]?.symbol).toBe('AAPL');
    expect(report.reference_data.option_chains[0]?.source).toBe('YAHOO_OPTIONS');
  });
});

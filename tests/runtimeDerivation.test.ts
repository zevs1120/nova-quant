import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { deriveRuntimeState } from '../src/server/quant/runtimeDerivation.js';
import type { NormalizedBar } from '../src/server/types.js';

function buildTrendBars(startTs: number, stepMs: number, startPrice: number, count: number): NormalizedBar[] {
  const rows: NormalizedBar[] = [];
  let px = startPrice;
  for (let i = 0; i < count; i += 1) {
    const open = px;
    const drift = 0.25 + i * 0.001;
    const close = open + drift;
    const high = Math.max(open, close) + 0.15;
    const low = Math.min(open, close) - 0.12;
    rows.push({
      ts_open: startTs + i * stepMs,
      open: open.toFixed(4),
      high: high.toFixed(4),
      low: low.toFixed(4),
      close: close.toFixed(4),
      volume: String(1000 + i * 3)
    });
    px = close;
  }
  return rows;
}

describe('derive runtime state', () => {
  it('derives market state/signals/performance from DB bars and executions', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    const us = repo.upsertAsset({
      symbol: 'SPY',
      market: 'US',
      venue: 'STOOQ'
    });
    const crypto = repo.upsertAsset({
      symbol: 'BTCUSDT',
      market: 'CRYPTO',
      venue: 'BINANCE_UM',
      base: 'BTC',
      quote: 'USDT'
    });

    const now = Date.now();
    repo.upsertOhlcvBars(us.asset_id, '1d', buildTrendBars(now - 120 * 86_400_000, 86_400_000, 450, 120), 'TEST');
    repo.upsertOhlcvBars(crypto.asset_id, '1h', buildTrendBars(now - 240 * 3_600_000, 3_600_000, 65000, 240), 'TEST');
    repo.upsertFundingRates(
      crypto.asset_id,
      [
        { ts_open: now - 24 * 3_600_000, funding_rate: '0.0001' },
        { ts_open: now - 16 * 3_600_000, funding_rate: '0.0002' },
        { ts_open: now - 8 * 3_600_000, funding_rate: '0.0003' }
      ],
      'TEST'
    );
    repo.upsertBasisSnapshots(
      crypto.asset_id,
      [
        { ts_open: now - 12 * 3_600_000, basis_bps: '4.5' },
        { ts_open: now - 6 * 3_600_000, basis_bps: '7.5' },
        { ts_open: now - 2 * 3_600_000, basis_bps: '12' }
      ],
      'TEST'
    );
    repo.upsertNewsItems([
      {
        id: 'news-spy-1',
        market: 'US',
        symbol: 'SPY',
        headline: 'Fed tone cools and broad equity risk appetite improves',
        source: 'Example Wire',
        url: null,
        published_at_ms: now - 30 * 60_000,
        sentiment_label: 'POSITIVE',
        relevance_score: 0.84,
        payload_json: JSON.stringify({
          provider: 'google_news_rss',
          summary: 'Risk appetite improved after a softer macro tone.',
          gemini_analysis: {
            batch: {
              provider: 'gemini',
              summary: 'Macro tone is supportive but still event-sensitive.',
              sentiment_score: 0.44,
              event_risk_score: 0.39,
              macro_policy_score: 0.71,
              earnings_impact_score: 0.12,
              trading_bias: 'BULLISH',
              factor_tags: ['macro', 'risk_on']
            },
            headline: {
              sentiment_score: 0.44,
              relevance_score: 0.84
            }
          }
        }),
        updated_at_ms: now - 20 * 60_000
      }
    ]);

    repo.upsertUserRiskProfile({
      user_id: 'test-user',
      profile_key: 'balanced',
      max_loss_per_trade: 1,
      max_daily_loss: 3,
      max_drawdown: 12,
      exposure_cap: 55,
      leverage_cap: 2,
      updated_at_ms: now
    });

    const runtime = deriveRuntimeState({
      repo,
      userId: 'test-user',
      riskProfile: {
        user_id: 'test-user',
        profile_key: 'balanced',
        max_loss_per_trade: 1,
        max_daily_loss: 3,
        max_drawdown: 12,
        exposure_cap: 55,
        leverage_cap: 2,
        updated_at_ms: now
      }
    });

    expect(runtime.sourceStatus).toBe('DB_BACKED');
    expect(runtime.marketState.length).toBeGreaterThan(0);
    expect(runtime.coverageSummary).toBeTruthy();
    expect(runtime.performanceSnapshots.length).toBeGreaterThan(0);
    expect(Array.isArray(runtime.signals)).toBe(true);
    const cryptoState = runtime.marketState.find((row) => row.market === 'CRYPTO' && row.symbol === 'BTCUSDT');
    expect(cryptoState).toBeTruthy();
    const eventStats = JSON.parse(String(cryptoState?.event_stats_json || '{}')) as Record<string, unknown>;
    const micro = (eventStats.crypto_microstructure || {}) as Record<string, unknown>;
    expect(micro.fundingRateCurrent).toBe(0.0003);
    expect(micro.fundingRate24h).toBe(0.0006);
    expect(micro.basisBps).toBe(12);
    if (runtime.signals.length > 0) {
      const tagBlob = runtime.signals.flatMap((row) => row.tags || []);
      expect(tagBlob.some((tag) => String(tag).startsWith('auto_learning:'))).toBe(true);
      expect(tagBlob.some((tag) => String(tag).startsWith('factor:'))).toBe(true);
      const signalWithNews = runtime.signals.find((row) => (row.news_context?.headline_count || 0) > 0);
      expect(signalWithNews?.news_context?.analysis_provider).toBe('gemini');
      expect(signalWithNews?.news_context?.factor_tags).toContain('macro');
    }
  });
});

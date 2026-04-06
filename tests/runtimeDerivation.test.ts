import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { deriveRuntimeState } from '../src/server/quant/runtimeDerivation.js';
import type { NormalizedBar } from '../src/server/types.js';

function buildTrendBars(
  startTs: number,
  stepMs: number,
  startPrice: number,
  count: number,
): NormalizedBar[] {
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
      volume: String(1000 + i * 3),
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
      venue: 'STOOQ',
    });
    const crypto = repo.upsertAsset({
      symbol: 'BTCUSDT',
      market: 'CRYPTO',
      venue: 'BINANCE_UM',
      base: 'BTC',
      quote: 'USDT',
    });

    const now = Date.now();
    repo.upsertOhlcvBars(
      us.asset_id,
      '1d',
      buildTrendBars(now - 120 * 86_400_000, 86_400_000, 450, 120),
      'TEST',
    );
    repo.upsertOhlcvBars(
      crypto.asset_id,
      '1h',
      buildTrendBars(now - 240 * 3_600_000, 3_600_000, 65000, 240),
      'TEST',
    );
    repo.upsertFundingRates(
      crypto.asset_id,
      [
        { ts_open: now - 24 * 3_600_000, funding_rate: '0.0001' },
        { ts_open: now - 16 * 3_600_000, funding_rate: '0.0002' },
        { ts_open: now - 8 * 3_600_000, funding_rate: '0.0003' },
      ],
      'TEST',
    );
    repo.upsertBasisSnapshots(
      crypto.asset_id,
      [
        { ts_open: now - 12 * 3_600_000, basis_bps: '4.5' },
        { ts_open: now - 6 * 3_600_000, basis_bps: '7.5' },
        { ts_open: now - 2 * 3_600_000, basis_bps: '12' },
      ],
      'TEST',
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
              factor_tags: ['macro', 'risk_on'],
            },
            headline: {
              sentiment_score: 0.44,
              relevance_score: 0.84,
            },
          },
        }),
        updated_at_ms: now - 20 * 60_000,
      },
    ]);

    repo.upsertUserRiskProfile({
      user_id: 'test-user',
      profile_key: 'balanced',
      max_loss_per_trade: 1,
      max_daily_loss: 3,
      max_drawdown: 12,
      exposure_cap: 55,
      leverage_cap: 2,
      updated_at_ms: now,
    });

    repo.upsertWorkflowRun({
      id: `workflow-factory-${now}`,
      workflow_key: 'nova_strategy_lab',
      workflow_version: 'nova-strategy-lab.test',
      trigger_type: 'manual',
      status: 'SUCCEEDED',
      trace_id: `trace-factory-${now}`,
      input_json: JSON.stringify({
        market: 'US',
        constraints: { market: 'US' },
      }),
      output_json: JSON.stringify({
        portfolio_fit:
          'Promote public template-backed momentum ideas when trend regime is already live.',
        risk_note:
          'Keep new factory cards in shadow posture until execution drift remains contained.',
        selected_candidates: [
          {
            candidate_id: 'cand-public-tsmom',
            strategy_id: 'SD-TIME_SERIES_MOMENTUM-TS1',
            strategy_family: 'Momentum / Trend Following',
            template_name: 'Time-Series Momentum Template',
            template_id: 'time_series_momentum',
            recommendation: 'PROMOTE_TO_SHADOW',
            next_stage: 'shadow',
            candidate_quality_score_pct: 88,
            supporting_features: ['trend_strength', 'volume_expansion', 'seasonality'],
            supported_asset_classes: ['US_STOCK'],
            compatible_regimes: ['trend'],
            quality_prior_score: 0.81,
            generation_mode: 'conservative',
            public_reference_ids: ['aqr_trend_following', 'aqr_vme'],
            candidate_source_metadata: {
              template_source: {
                public_reference_ids: ['aqr_trend_following', 'aqr_vme'],
              },
              mapping_quality: {
                feature_overlap_count: 3,
              },
            },
          },
        ],
      }),
      attempt_count: 1,
      started_at_ms: now - 1_000,
      updated_at_ms: now - 500,
      completed_at_ms: now - 500,
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
        updated_at_ms: now,
      },
    });

    expect(runtime.sourceStatus).toBe('DB_BACKED');
    expect(runtime.marketState.length).toBeGreaterThan(0);
    expect(runtime.coverageSummary).toBeTruthy();
    expect(runtime.performanceSnapshots.length).toBeGreaterThan(0);
    expect(Array.isArray(runtime.signals)).toBe(true);
    const cryptoState = runtime.marketState.find(
      (row) => row.market === 'CRYPTO' && row.symbol === 'BTCUSDT',
    );
    expect(cryptoState).toBeTruthy();
    const eventStats = JSON.parse(String(cryptoState?.event_stats_json || '{}')) as Record<
      string,
      unknown
    >;
    const micro = (eventStats.crypto_microstructure || {}) as Record<string, unknown>;
    expect(micro.fundingRateCurrent).toBe(0.0003);
    expect(micro.fundingRate24h).toBe(0.0006);
    expect(micro.basisBps).toBe(12);
    if (runtime.signals.length > 0) {
      const tagBlob = runtime.signals.flatMap((row) => row.tags || []);
      expect(tagBlob.some((tag) => String(tag).startsWith('auto_learning:'))).toBe(true);
      expect(tagBlob.some((tag) => String(tag).startsWith('factor:'))).toBe(true);
      expect(tagBlob.includes('source:nova_factory')).toBe(true);
      const factorySignal = runtime.signals.find((row) =>
        row.tags?.includes('source:nova_factory'),
      );
      expect(factorySignal).toBeTruthy();
      expect((factorySignal as Record<string, any>)?.factory_metadata?.template_name).toBe(
        'Time-Series Momentum Template',
      );
      const signalWithNews = runtime.signals.find(
        (row) => (row.news_context?.headline_count || 0) > 0,
      );
      expect(signalWithNews?.news_context?.analysis_provider).toBe('gemini');
      expect(signalWithNews?.news_context?.factor_tags).toContain('macro');
    }
  });

  it('gates runtime derivation when too many invalid bars survive into storage', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const asset = repo.upsertAsset({
      symbol: 'SPY',
      market: 'US',
      venue: 'STOOQ',
    });
    const now = Date.now();

    const dirtyBars: NormalizedBar[] = Array.from({ length: 120 }, (_, index) => ({
      ts_open: now - (120 - index) * 86_400_000,
      open: index % 3 === 0 ? '0' : '100',
      high: '101',
      low: '99',
      close: '100.5',
      volume: '10',
    }));

    repo.upsertOhlcvBars(asset.asset_id, '1d', dirtyBars, 'TEST');

    const runtime = deriveRuntimeState({
      repo,
      userId: 'gate-user',
      riskProfile: {
        user_id: 'gate-user',
        profile_key: 'balanced',
        max_loss_per_trade: 1,
        max_daily_loss: 3,
        max_drawdown: 12,
        exposure_cap: 55,
        leverage_cap: 2,
        updated_at_ms: now,
      },
    });

    expect(runtime.sourceStatus).toBe('INSUFFICIENT_DATA');
    expect(runtime.marketState).toHaveLength(0);
    const freshnessRows = Array.isArray((runtime.freshnessSummary as { rows?: unknown }).rows)
      ? ((runtime.freshnessSummary as { rows?: unknown[] }).rows as Record<string, unknown>[])
      : [];
    const freshnessRow = freshnessRows.find((row) => row.symbol === 'SPY');
    expect(freshnessRow?.quality_gate_reason).toBe('TOO_MANY_INVALID_BARS');
  });
});

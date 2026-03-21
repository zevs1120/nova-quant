import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import type { SignalContract } from '../src/server/types.js';
import { persistAlphaCandidate, type AutonomousAlphaCandidate } from '../src/server/alpha_registry/index.js';
import { buildPrivateMarvixOpsReport, isLoopbackAddress } from '../src/server/ops/privateMarvixOps.js';

function buildCandidate(id: string): AutonomousAlphaCandidate {
  return {
    id,
    thesis: 'Alpha overlay test candidate',
    family: 'confidence_calibration_overlay',
    formula: { overlay: 'confidence' },
    params: { confidence_cutoff: 0.6 },
    feature_dependencies: ['trend_strength', 'volume_expansion'],
    regime_constraints: ['trend'],
    compatible_markets: ['US'],
    intended_holding_period: '2-6 bars',
    entry_logic: { trigger: 'overlay' },
    exit_logic: { mode: 'overlay' },
    sizing_hint: { path: 'confidence_modifier' },
    required_inputs: ['trend_strength'],
    complexity_score: 0.94,
    integration_path: 'confidence_modifier',
    created_at: new Date().toISOString(),
    source: 'autonomous_discovery',
    strategy_candidate: null
  };
}

function buildSignal(id: string, symbol = 'AAPL'): SignalContract {
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 86_400_000).toISOString();
  return {
    id,
    created_at: now,
    expires_at: later,
    asset_class: 'US_STOCK',
    market: 'US',
    symbol,
    timeframe: '1d',
    strategy_id: 'TREND_PULLBACK',
    strategy_family: 'Momentum / Trend Following',
    strategy_version: 'test.v1',
    regime_id: 'TREND',
    temperature_percentile: 63,
    volatility_percentile: 51,
    direction: 'LONG',
    strength: 74,
    confidence: 0.69,
    entry_zone: {
      low: 100,
      high: 101,
      method: 'LIMIT'
    },
    invalidation_level: 97,
    stop_loss: {
      type: 'ATR',
      price: 97,
      rationale: 'test stop'
    },
    take_profit_levels: [
      {
        price: 104,
        size_pct: 0.6,
        rationale: 'tp1'
      },
      {
        price: 107,
        size_pct: 0.4,
        rationale: 'tp2'
      }
    ],
    trailing_rule: {
      type: 'EMA',
      params: { ema_fast: 10, ema_slow: 30 }
    },
    position_advice: {
      position_pct: 5,
      leverage_cap: 1,
      risk_bucket_applied: 'BASE',
      rationale: 'test sizing'
    },
    cost_model: {
      fee_bps: 1.5,
      spread_bps: 1,
      slippage_bps: 1.8
    },
    expected_metrics: {
      expected_R: 1.1,
      hit_rate_est: 0.54,
      sample_size: 16
    },
    explain_bullets: ['test signal'],
    execution_checklist: ['check data'],
    tags: ['status:DB_BACKED'],
    status: 'NEW',
    payload: {
      kind: 'STOCK_SWING',
      data: {
        horizon: 'MEDIUM',
        catalysts: ['test']
      }
    },
    score: 79,
    payload_version: '1'
  };
}

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

    persistAlphaCandidate(repo, {
      candidate: buildCandidate('alpha-ops-1'),
      status: 'SHADOW',
      acceptanceScore: 0.81
    });
    repo.upsertSignals([buildSignal('sig-aapl-1', 'AAPL')]);
    repo.insertAlphaEvaluation({
      id: 'alpha-eval-ops-1',
      alpha_candidate_id: 'alpha-ops-1',
      workflow_run_id: 'workflow-alpha-discovery-1',
      backtest_run_id: 'alpha-backtest-ops-1',
      evaluation_status: 'PASS',
      acceptance_score: 0.81,
      metrics_json: JSON.stringify({
        correlation_to_active: 0.22,
        stability_score: 0.71
      }),
      rejection_reasons_json: JSON.stringify([]),
      notes: 'ready for shadow',
      created_at_ms: now - 10_000
    });
    repo.upsertAlphaShadowObservations([
      {
        id: 'alpha-shadow-ops-1',
        alpha_candidate_id: 'alpha-ops-1',
        workflow_run_id: 'workflow-alpha-shadow-1',
        signal_id: 'sig-aapl-1',
        market: 'US',
        symbol: 'AAPL',
        shadow_action: 'BOOST',
        alignment_score: 0.79,
        adjusted_confidence: 0.73,
        suggested_weight_multiplier: 1.05,
        realized_pnl_pct: 0.82,
        realized_source: 'paper',
        payload_json: JSON.stringify({}),
        created_at_ms: now - 8_000,
        updated_at_ms: now - 8_000
      }
    ]);

    const report = buildPrivateMarvixOpsReport(repo);
    expect(report.visibility).toBe('private-loopback-only');
    expect(report.workflows[0]?.workflow_key).toBe('free_data_flywheel');
    expect(report.recent_news_factors[0]?.analysis_provider).toBe('gemini');
    expect(report.recent_news_factors[0]?.factor_tags).toContain('product_cycle');
    expect(report.reference_data.fundamentals[0]?.symbol).toBe('AAPL');
    expect(report.reference_data.option_chains[0]?.source).toBe('YAHOO_OPTIONS');
    expect(report.alpha_inventory.SHADOW).toBe(1);
    expect(report.alpha_top_candidates[0]?.id).toBe('alpha-ops-1');
  });
});

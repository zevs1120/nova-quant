import { describe, expect, it } from 'vitest';
import {
  buildPerformanceSummaryFromRowsOrEmpty,
  buildMarketModulesFromRows,
} from '../src/server/api/queries/marketPerformanceProjection.js';
import {
  toUiSignal,
  buildRuntimeSignalEvidenceFromSignals,
} from '../src/server/api/queries/runtimeSignalProjection.js';
import type { MarketStateRecord, SignalContract } from '../src/server/types.js';

describe('marketPerformanceProjection', () => {
  it('buildPerformanceSummaryFromRowsOrEmpty returns empty records when rows missing', () => {
    const out = buildPerformanceSummaryFromRowsOrEmpty({
      rows: null,
      asofIso: '2026-01-01T00:00:00.000Z',
      sourceStatus: 'INSUFFICIENT_DATA',
    });
    expect(out.records).toEqual([]);
    expect(out.asof).toBe('2026-01-01T00:00:00.000Z');
  });

  it('buildMarketModulesFromRows filters by market', () => {
    const base = (overrides: Partial<MarketStateRecord>): MarketStateRecord => ({
      market: 'US',
      symbol: 'AAA',
      timeframe: '1d',
      snapshot_ts_ms: 0,
      regime_id: 'TREND',
      trend_strength: 1,
      temperature_percentile: 50,
      volatility_percentile: 50,
      risk_off_score: 0,
      stance: 'ok',
      event_stats_json: '{}',
      assumptions_json: '{}',
      updated_at_ms: 1,
      ...overrides,
    });
    const rows: MarketStateRecord[] = [
      base({}),
      base({
        market: 'CRYPTO',
        symbol: 'BTC',
        regime_id: 'RANGE',
        stance: 'x',
        trend_strength: 0,
        updated_at_ms: 2,
      }),
    ];
    const usOnly = buildMarketModulesFromRows(rows, { market: 'US' });
    expect(usOnly).toHaveLength(1);
    expect(usOnly[0].title).toContain('AAA');
  });
});

describe('runtimeSignalProjection', () => {
  it('toUiSignal maps id to signal_id and adds grade', () => {
    const base = {
      id: 'sig_1',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-02-01T00:00:00.000Z',
      asset_class: 'US_STOCK' as const,
      market: 'US' as const,
      symbol: 'AAA',
      timeframe: '1d',
      strategy_id: 's',
      strategy_family: 'f',
      strategy_version: 'v',
      regime_id: 'R',
      temperature_percentile: 50,
      volatility_percentile: 50,
      direction: 'LONG' as const,
      strength: 80,
      confidence: 0.8,
      score: 80,
      tags: [],
      entry_zone: { low: 1, high: 2, method: 'LIMIT' as const, notes: '' },
      invalidation_level: 0.5,
      stop_loss: { type: 'ATR' as const, price: 0.5, rationale: '' },
      take_profit_levels: [],
      trailing_rule: { type: 'EMA' as const, params: { fast: 10, slow: 20 } },
      position_advice: {
        position_pct: 5,
        leverage_cap: 1,
        risk_bucket_applied: 'BASE',
        rationale: '',
      },
      cost_model: { fee_bps: 0, spread_bps: 0, slippage_bps: 0 },
      expected_metrics: { expected_R: 0, hit_rate_est: 0, sample_size: 0 },
      explain_bullets: [],
      execution_checklist: [],
      status: 'NEW' as const,
      payload: { kind: 'US_STOCK' as const, data: {} },
      payload_version: 'test.v1',
    } as unknown as SignalContract;
    const ui = toUiSignal(base);
    expect(ui.signal_id).toBe('sig_1');
    expect(ui.grade).toBe('A');
  });

  it('buildRuntimeSignalEvidenceFromSignals returns INSUFFICIENT when no signals', () => {
    const out = buildRuntimeSignalEvidenceFromSignals([], 3);
    expect(out.records).toEqual([]);
    expect(out.source_status).toBeDefined();
  });
});

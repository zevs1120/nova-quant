import { describe, expect, it } from 'vitest';
import {
  buildSignalListItemFromContract,
  buildSignalListItemFromPgRow,
} from '../src/server/quant/signalListProjection.js';

describe('signal list projection', () => {
  it('builds a compact list item from a decoded signal contract', () => {
    const item = buildSignalListItemFromContract({
      id: 'sig-1',
      signal_id: 'sig-1',
      created_at: '2026-03-30T14:00:00.000Z',
      expires_at: '2026-03-30T16:00:00.000Z',
      asset_class: 'US_STOCK',
      market: 'US',
      symbol: 'MSFT',
      timeframe: '1d',
      strategy_id: 'trend-pullback',
      strategy_family: 'Momentum',
      strategy_version: 'v1',
      regime_id: 'TREND',
      direction: 'LONG',
      confidence: 0.77,
      entry_zone: { low: 420.15, high: 422.4, method: 'LIMIT', notes: 'Wait for pullback' },
      invalidation_level: 414.5,
      stop_loss: { type: 'ATR', price: 414.5, rationale: '1.2 ATR stop' },
      take_profit_levels: [{ price: 431.2, size_pct: 0.6, rationale: 'Primary target' }],
      trailing_rule: { type: 'EMA', params: { ema_fast: 10, ema_slow: 30 } },
      position_advice: {
        position_pct: 9.5,
        leverage_cap: 2,
        risk_bucket_applied: 'BASE',
        rationale: 'Keep size light.',
      },
      explain_bullets: ['Trend is intact.', 'Pullback entry is cleaner.'],
      execution_checklist: ['Wait for entry.', 'Place stop immediately.'],
      status: 'NEW',
      score: 88,
      payload: { kind: 'STOCK_SWING', data: { horizon: 'MEDIUM' } },
      references: { docs_url: 'docs/RUNTIME_DATA_LINEAGE.md' },
      payload_version: 'signal-contract.v1',
      strategy_source: 'AI quant strategy',
      grade: 'A',
      source_status: 'DB_BACKED',
      source_label: 'DB_BACKED',
      data_status: 'DB_BACKED',
      risk_warnings: ['Normal execution risk.'],
      holding_horizon_days: 2.8,
      risk_score: 48,
      regime_compatibility: 77,
      validity: '24H',
      model_version: 'model-v1',
    } as any);

    expect(item.signal_id).toBe('sig-1');
    expect(item.summary).toBe('Trend is intact.');
    expect(item.take_profit).toBe(431.2);
    expect(item.position_advice.position_pct).toBe(9.5);
    expect(item.execution_checklist).toEqual(['Wait for entry.', 'Place stop immediately.']);
  });

  it('builds a compact list item from a postgres summary row', () => {
    const item = buildSignalListItemFromPgRow({
      signal_id: 'sig-2',
      created_at_ms: Date.parse('2026-03-30T14:00:00.000Z'),
      expires_at_ms: Date.parse('2026-03-30T16:00:00.000Z'),
      asset_class: 'CRYPTO',
      market: 'CRYPTO',
      symbol: 'BTCUSDT',
      timeframe: '4h',
      strategy_id: 'funding-dislocation',
      strategy_family: 'Carry',
      strategy_version: 'v2',
      regime_id: 'HIGH_VOL',
      direction: 'SHORT',
      confidence: 0.69,
      entry_low: 68100,
      entry_high: 68420,
      entry_method: 'LIMIT',
      invalidation_level: 68980,
      stop_type: 'ATR',
      stop_price: 68980,
      tp1_price: 66850,
      tp1_size_pct: 0.6,
      tp2_price: 66120,
      tp2_size_pct: 0.4,
      position_pct: 7.2,
      leverage_cap: 2,
      risk_bucket_applied: 'BASE',
      status: 'NEW',
      score: 83,
      generated_at: '2026-03-30T14:01:00.000Z',
      strategy_source: 'Marvix AI Engine',
      grade: 'B',
      source_status: 'DB_BACKED',
      source_label: 'DB_BACKED',
      data_status: 'DB_BACKED',
      validity: '24H',
      model_version: 'model-v2',
      quick_pnl_pct: 0.8,
      holding_horizon_days: 1.5,
      risk_score: 58,
      regime_compatibility: 70,
      explain_bullets_json: ['Funding is stretched.', 'Momentum is fading.'],
      execution_checklist_json: ['Wait for the zone.', 'Respect the stop.'],
      risk_warnings_json: ['Elevated volatility.'],
    });

    expect(item.market).toBe('CRYPTO');
    expect(item.take_profit_levels).toHaveLength(2);
    expect(item.take_profit_levels[0]?.price).toBe(66850);
    expect(item.summary).toBe('Funding is stretched.');
    expect(item.strategy_source).toBe('Marvix AI Engine');
    expect(item.risk_warnings).toEqual(['Elevated volatility.']);
  });
});

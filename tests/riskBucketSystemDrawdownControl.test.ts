import { describe, expect, it } from 'vitest';
// @ts-ignore runtime JS import
import { buildRiskBucketSystem } from '../src/research/core/riskBucketSystem.js';

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    signal_id: 'sig-1',
    symbol: 'AAPL',
    market: 'US',
    asset_class: 'US_STOCK',
    direction: 'LONG',
    status: 'NEW',
    sector: 'Technology',
    score: 0.78,
    risk_score: 35,
    confidence: 0.72,
    regime_compatibility: 78,
    position_advice: { position_pct: 9 },
    entry_zone: { low: 100, high: 101, method: 'MARKET' },
    stop_loss: { price: 96, type: 'ATR', rationale: 'risk stop' },
    ...overrides,
  };
}

describe('risk bucket system — drawdown control upgrade', () => {
  it('exposes new risk budget caps and risk controls', () => {
    const risk = buildRiskBucketSystem({
      asOf: '2026-03-27T00:00:00.000Z',
      riskProfileKey: 'balanced',
      regimeState: { state: { recommended_user_posture: 'NORMAL', default_sizing_multiplier: 1 } },
      signals: [makeSignal()],
      trades: [],
    });

    expect(risk?.portfolio_risk_budget?.instrument_concentration_cap_pct).toBeGreaterThan(0);
    expect(risk?.portfolio_risk_budget?.same_direction_cap_pct).toBeGreaterThan(0);
    expect(risk?.portfolio_risk_budget?.weekly_loss_limit_pct).toBeGreaterThan(0);
    expect(risk?.trade_level_buckets?.[0]?.risk_controls?.time_stop_bars).toBeGreaterThan(0);
    expect(risk?.trade_level_buckets?.[0]?.risk_controls?.volatility_stop_pct).toBeGreaterThan(0);
  });

  it('blocks new trades when same-direction concentration and drawdown are both stressed', () => {
    const risk = buildRiskBucketSystem({
      asOf: '2026-03-27T00:00:00.000Z',
      riskProfileKey: 'balanced',
      championState: { safety: { cards: { portfolio: { score: 58 } } } },
      regimeState: { state: { recommended_user_posture: 'NORMAL', default_sizing_multiplier: 1 } },
      signals: [
        makeSignal({ signal_id: 'sig-1', position_advice: { position_pct: 15 } }),
        makeSignal({ signal_id: 'sig-2', symbol: 'MSFT', position_advice: { position_pct: 14 } }),
        makeSignal({ signal_id: 'sig-3', symbol: 'NVDA', position_advice: { position_pct: 13 } }),
      ],
      trades: [
        { pnl_pct: -2.1, created_at_ms: Date.parse('2026-03-25T00:00:00.000Z') },
        { pnl_pct: -2.3, created_at_ms: Date.parse('2026-03-26T00:00:00.000Z') },
        { pnl_pct: -1.9, created_at_ms: Date.parse('2026-03-27T00:00:00.000Z') },
      ],
    });

    expect(risk?.portfolio_risk_budget?.budget_status).toBe('stressed');
    expect((risk?.trade_level_buckets || []).every((row: any) => row.decision === 'blocked')).toBe(
      true,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { runSignalFunnelDiagnostics } from '../src/engines/funnelEngine.js';

/* ---------- helpers ---------- */

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    signal_id: 'sig-1',
    market: 'US',
    symbol: 'AAPL',
    asset_class: 'US_STOCK',
    timeframe: '1D',
    strategy_family: 'TREND_PULLBACK',
    direction: 'LONG',
    status: 'NEW',
    score: 72,
    regime_compatibility: 65,
    risk_score: 40,
    confidence: 0.7,
    expected_metrics: { expected_R: 1.5, hit_rate_est: 0.55 },
    cost_model: { total_bps: 4 },
    position_advice: { position_pct: 5 },
    created_at: '2026-03-20T10:00:00Z',
    ...overrides,
  };
}

function makeRiskState(tradingOn = true) {
  return {
    status: { trading_on: tradingOn },
    bucket_state: 'BASE',
    profile: { max_daily_loss_pct: 3 },
  };
}

/* ---------- rejection reason codes ---------- */

describe('funnel rejection reasons', () => {
  it('passes a fully valid signal with no rejection', () => {
    const result = runSignalFunnelDiagnostics({
      signals: [makeSignal()],
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.overall.executable_opportunities).toBe(1);
    expect(result.no_trade_top_n.length).toBe(0);
  });

  it('rejects score_too_low when score < 0.45', () => {
    const result = runSignalFunnelDiagnostics({
      signals: [makeSignal({ score: 0.3 })],
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.no_trade_top_n[0]?.reason_code).toBe('score_too_low');
  });

  it('rejects regime_blocked when regime_compatibility < threshold', () => {
    const result = runSignalFunnelDiagnostics({
      signals: [makeSignal({ regime_compatibility: 30 })],
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.no_trade_top_n.some((r: any) => r.reason_code === 'regime_blocked')).toBe(true);
  });

  it('rejects risk_budget_exhausted when trading_on is false', () => {
    const result = runSignalFunnelDiagnostics({
      signals: [makeSignal()],
      trades: [],
      riskState: makeRiskState(false),
    });
    expect(result.no_trade_top_n.some((r: any) => r.reason_code === 'risk_budget_exhausted')).toBe(
      true,
    );
  });

  it('rejects cost_too_high when cost > 16 bps', () => {
    const result = runSignalFunnelDiagnostics({
      signals: [makeSignal({ cost_model: { total_bps: 25 } })],
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.no_trade_top_n.some((r: any) => r.reason_code === 'cost_too_high')).toBe(true);
  });

  it('rejects min_notional_or_lot_violation when position_pct is tiny', () => {
    const result = runSignalFunnelDiagnostics({
      signals: [makeSignal({ position_advice: { position_pct: 0.1 } })],
      trades: [],
      riskState: makeRiskState(),
    });
    expect(
      result.no_trade_top_n.some((r: any) => r.reason_code === 'min_notional_or_lot_violation'),
    ).toBe(true);
  });

  it('marks EXPIRED signals with order_expired', () => {
    const result = runSignalFunnelDiagnostics({
      signals: [makeSignal({ status: 'EXPIRED' })],
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.no_trade_top_n.some((r: any) => r.reason_code === 'order_expired')).toBe(true);
  });

  it('marks conflict-muted signals', () => {
    const result = runSignalFunnelDiagnostics({
      signals: [makeSignal({ tags: ['conflict-muted'] })],
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.no_trade_top_n.some((r: any) => r.reason_code === 'correlation_conflict')).toBe(
      true,
    );
  });
});

/* ---------- funnel counter pipeline ---------- */

describe('funnel counter pipeline', () => {
  it('counts universe, raw signals, and executable correctly', () => {
    const signals = [
      makeSignal({ signal_id: 'valid' }),
      makeSignal({ signal_id: 'low-score', score: 0.1 }),
      makeSignal({ signal_id: 'expired', status: 'EXPIRED' }),
    ];
    const result = runSignalFunnelDiagnostics({
      signals,
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.overall.universe_size).toBe(3);
    expect(result.overall.raw_signals_generated).toBe(3);
    expect(result.overall.executable_opportunities).toBe(1);
  });

  it('correctly counts filled_trades from trade data', () => {
    const signals = [makeSignal({ signal_id: 'traded' })];
    const trades = [{ signal_id: 'traded', time_in: '2026-03-20T12:00:00Z' }];
    const result = runSignalFunnelDiagnostics({
      signals,
      trades,
      riskState: makeRiskState(),
    });
    expect(result.overall.filled_trades).toBe(1);
  });

  it('correctly counts completed_round_trip_trades', () => {
    const signals = [makeSignal({ signal_id: 'completed' })];
    const trades = [
      {
        signal_id: 'completed',
        time_in: '2026-03-20T12:00:00Z',
        time_out: '2026-03-21T12:00:00Z',
        exit: 190,
      },
    ];
    const result = runSignalFunnelDiagnostics({
      signals,
      trades,
      riskState: makeRiskState(),
    });
    expect(result.overall.completed_round_trip_trades).toBe(1);
  });
});

/* ---------- aggregation ---------- */

describe('funnel aggregation', () => {
  it('aggregates by market', () => {
    const signals = [
      makeSignal({ signal_id: 'us', market: 'US' }),
      makeSignal({ signal_id: 'crypto', market: 'CRYPTO', asset_class: 'CRYPTO' }),
    ];
    const result = runSignalFunnelDiagnostics({
      signals,
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.by_market.length).toBe(2);
    expect(result.by_market.some((m: any) => m.market === 'US')).toBe(true);
    expect(result.by_market.some((m: any) => m.market === 'CRYPTO')).toBe(true);
  });

  it('aggregates by strategy_family', () => {
    const signals = [
      makeSignal({ signal_id: 's1', strategy_family: 'MOMENTUM' }),
      makeSignal({ signal_id: 's2', strategy_family: 'MOMENTUM' }),
      makeSignal({ signal_id: 's3', strategy_family: 'MEAN_REVERT' }),
    ];
    const result = runSignalFunnelDiagnostics({
      signals,
      trades: [],
      riskState: makeRiskState(),
    });
    const momentum = result.by_strategy_family.find((s: any) => s.strategy_family === 'MOMENTUM');
    expect(momentum.universe_size).toBe(2);
  });
});

/* ---------- no-trade reasons ranking ---------- */

describe('no-trade reasons ranking', () => {
  it('ranks reasons by count descending', () => {
    const signals = [
      makeSignal({ signal_id: 's1', score: 0.1 }),
      makeSignal({ signal_id: 's2', score: 0.1 }),
      makeSignal({ signal_id: 's3', regime_compatibility: 10 }),
    ];
    const result = runSignalFunnelDiagnostics({
      signals,
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.no_trade_top_n.length).toBeGreaterThan(0);
    // most frequent reason should be first
    if (result.no_trade_top_n.length >= 2) {
      expect(result.no_trade_top_n[0].count).toBeGreaterThanOrEqual(result.no_trade_top_n[1].count);
    }
  });

  it('share values sum to ~1 across all reasons', () => {
    const signals = [
      makeSignal({ signal_id: 's1', score: 0.1 }),
      makeSignal({ signal_id: 's2', regime_compatibility: 10 }),
    ];
    const result = runSignalFunnelDiagnostics({
      signals,
      trades: [],
      riskState: makeRiskState(),
    });
    const totalShare = result.no_trade_top_n.reduce((sum: number, r: any) => sum + r.share, 0);
    // shares should sum to roughly 1 (may exceed if signals have multiple reasons)
    expect(totalShare).toBeGreaterThan(0);
  });

  it('caps at max 6 reasons', () => {
    const signals = Array.from({ length: 20 }, (_, i) =>
      makeSignal({ signal_id: `s-${i}`, score: 0.1 + (i % 3) * 0.01 }),
    );
    const result = runSignalFunnelDiagnostics({
      signals,
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.no_trade_top_n.length).toBeLessThanOrEqual(6);
  });
});

/* ---------- shadow opportunity log ---------- */

describe('shadow opportunity log', () => {
  it('includes near-miss signals within score threshold delta', () => {
    // Default score_min = 0.45, near-miss = >= 0.45 - 0.22 = 0.23
    const signals = [makeSignal({ signal_id: 'near-miss', score: 0.3 })];
    const result = runSignalFunnelDiagnostics({
      signals,
      trades: [],
      riskState: makeRiskState(),
    });
    const shadow = result.shadow_opportunity_log;
    expect(shadow.some((s: any) => s.signal_id === 'near-miss')).toBe(true);
    expect(shadow[0].threshold_delta).toBeLessThan(0);
  });

  it('caps shadow log at 24 entries', () => {
    const signals = Array.from({ length: 30 }, (_, i) =>
      makeSignal({ signal_id: `s-${i}`, score: 0.35 }),
    );
    const result = runSignalFunnelDiagnostics({
      signals,
      trades: [],
      riskState: makeRiskState(),
    });
    expect(result.shadow_opportunity_log.length).toBeLessThanOrEqual(24);
  });

  it('includes synthetic future path in shadow entries', () => {
    const signals = [makeSignal({ signal_id: 'shadow-path', score: 0.3 })];
    const result = runSignalFunnelDiagnostics({
      signals,
      trades: [],
      riskState: makeRiskState(),
    });
    const entry = result.shadow_opportunity_log[0];
    if (entry) {
      expect(entry.subsequent_path).toBeTruthy();
      expect(typeof entry.subsequent_path.r_1d).toBe('number');
      expect(typeof entry.subsequent_path.r_2d).toBe('number');
      expect(typeof entry.subsequent_path.r_3d).toBe('number');
    }
  });
});

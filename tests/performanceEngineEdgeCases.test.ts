import { describe, expect, it } from 'vitest';
import { runPerformanceEngine } from '../src/engines/performanceEngine.js';

/* ---------- helpers ---------- */

function makeTrade(overrides: Record<string, unknown> = {}) {
  return {
    signal_id: 'sig-1',
    market: 'US',
    symbol: 'AAPL',
    time_in: '2026-03-10T10:00:00Z',
    time_out: '2026-03-15T10:00:00Z',
    entry: 180,
    exit: 185,
    pnl_pct: 2.8,
    strategy_id: 'TREND_PULLBACK',
    regime_id: 'RGM_RISK_ON',
    ...overrides
  };
}

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    signal_id: 'sig-1',
    strategy_id: 'TREND_PULLBACK',
    regime_id: 'RGM_RISK_ON',
    cost_estimate: { total_bps: 4 },
    ...overrides
  };
}

function makePerformance(records: unknown[] = []) {
  return {
    last_updated: '2026-03-20T00:00:00Z',
    records
  };
}

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    market: 'US',
    range: 'ALL',
    equity_curve: { backtest: [1, 1.05, 1.08], live: [1, 1.02, 1.04] },
    assumptions: { slippage_bps: 2 },
    ...overrides
  };
}

/* ---------- trade metrics ---------- */

describe('trade metrics via runPerformanceEngine', () => {
  it('returns zero metrics for empty trades', () => {
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord()]),
      trades: [],
      signals: []
    });
    const overall = result.records[0].attribution.overall;
    expect(overall.sample_size).toBe(0);
    expect(overall.win_rate).toBe(0);
    expect(overall.sharpe).toBe(0);
    expect(overall.max_dd).toBe(0);
    expect(overall.total_return).toBe(0);
  });

  it('computes correct win_rate for all-winners', () => {
    const trades = [
      makeTrade({ pnl_pct: 3 }),
      makeTrade({ signal_id: 'sig-2', pnl_pct: 5 }),
      makeTrade({ signal_id: 'sig-3', pnl_pct: 1

 })
    ];
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord()]),
      trades,
      signals: trades.map((t) => makeSignal({ signal_id: t.signal_id }))
    });
    expect(result.records[0].attribution.overall.win_rate).toBe(1);
  });

  it('computes correct win_rate for all-losers', () => {
    const trades = [
      makeTrade({ pnl_pct: -2 }),
      makeTrade({ signal_id: 'sig-2', pnl_pct: -4 })
    ];
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord()]),
      trades,
      signals: trades.map((t) => makeSignal({ signal_id: t.signal_id }))
    });
    expect(result.records[0].attribution.overall.win_rate).toBe(0);
  });

  it('computes correct win_rate for mixed trades', () => {
    const trades = [
      makeTrade({ pnl_pct: 5 }),
      makeTrade({ signal_id: 'sig-2', pnl_pct: -3 }),
      makeTrade({ signal_id: 'sig-3', pnl_pct: 2 }),
      makeTrade({ signal_id: 'sig-4', pnl_pct: -1 })
    ];
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord()]),
      trades,
      signals: trades.map((t) => makeSignal({ signal_id: t.signal_id }))
    });
    expect(result.records[0].attribution.overall.win_rate).toBe(0.5);
  });

  it('max_dd is non-negative', () => {
    const trades = [
      makeTrade({ pnl_pct: -5 }),
      makeTrade({ signal_id: 'sig-2', pnl_pct: -8 }),
      makeTrade({ signal_id: 'sig-3', pnl_pct: 3 })
    ];
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord()]),
      trades,
      signals: trades.map((t) => makeSignal({ signal_id: t.signal_id }))
    });
    expect(result.records[0].attribution.overall.max_dd).toBeGreaterThanOrEqual(0);
  });
});

/* ---------- attribution ---------- */

describe('performance attribution', () => {
  it('groups trades by strategy_id', () => {
    const trades = [
      makeTrade({ pnl_pct: 3, strategy_id: 'MOMENTUM' }),
      makeTrade({ signal_id: 'sig-2', pnl_pct: -1, strategy_id: 'MOMENTUM' }),
      makeTrade({ signal_id: 'sig-3', pnl_pct: 5, strategy_id: 'MEAN_REVERT' })
    ];
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord()]),
      trades,
      signals: trades.map((t) => makeSignal({ signal_id: t.signal_id, strategy_id: t.strategy_id }))
    });
    const byStrategy = result.records[0].attribution.by_strategy;
    expect(byStrategy.length).toBe(2);
    const momentum = byStrategy.find((s: any) => s.id === 'MOMENTUM');
    expect(momentum.sample_size).toBe(2);
    const meanRevert = byStrategy.find((s: any) => s.id === 'MEAN_REVERT');
    expect(meanRevert.sample_size).toBe(1);
  });

  it('groups trades by regime_id', () => {
    const trades = [
      makeTrade({ pnl_pct: 3 }),
      makeTrade({ signal_id: 'sig-2', pnl_pct: -1, regime_id: 'RGM_NEUTRAL' })
    ];
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord()]),
      trades,
      signals: trades.map((t) => makeSignal({ signal_id: t.signal_id, regime_id: (t as any).regime_id }))
    });
    const byRegime = result.records[0].attribution.by_regime;
    expect(byRegime.length).toBeGreaterThanOrEqual(1);
  });
});

/* ---------- backtest-live deviation ---------- */

describe('backtest-live deviation', () => {
  it('total gap = backtest - live return', () => {
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord({
        equity_curve: { backtest: [1, 1.10], live: [1, 1.04] }
      })]),
      trades: [makeTrade()],
      signals: [makeSignal()]
    });
    const dev = result.records[0].attribution.backtest_live_deviation;
    const expectedGap = dev.backtest_return - dev.live_return;
    expect(Math.abs(dev.total_gap - expectedGap)).toBeLessThan(0.001);
  });

  it('decomposition sums to total gap', () => {
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord()]),
      trades: [makeTrade()],
      signals: [makeSignal()]
    });
    const dev = result.records[0].attribution.backtest_live_deviation;
    const sum = dev.decomposition.cost + dev.decomposition.slippage + dev.decomposition.fill_quality;
    expect(Math.abs(sum - dev.total_gap)).toBeLessThan(0.001);
  });
});

/* ---------- range filtering ---------- */

describe('range filtering', () => {
  it('ALL range includes all trades', () => {
    const oldTrade = makeTrade({
      signal_id: 'old',
      time_out: '2025-01-01T00:00:00Z'
    });
    const recentTrade = makeTrade({
      signal_id: 'recent',
      time_out: '2026-03-18T00:00:00Z'
    });
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord({ range: 'ALL' })]),
      trades: [oldTrade, recentTrade],
      signals: [makeSignal({ signal_id: 'old' }), makeSignal({ signal_id: 'recent' })]
    });
    expect(result.records[0].attribution.overall.sample_size).toBe(2);
  });

  it('3M range excludes trades older than 90 days', () => {
    const oldTrade = makeTrade({
      signal_id: 'old',
      time_out: '2025-01-01T00:00:00Z'
    });
    const recentTrade = makeTrade({
      signal_id: 'recent',
      time_out: '2026-03-18T00:00:00Z'
    });
    const result = runPerformanceEngine({
      performance: makePerformance([makeRecord({ range: '3M' })]),
      trades: [oldTrade, recentTrade],
      signals: [makeSignal({ signal_id: 'old' }), makeSignal({ signal_id: 'recent' })]
    });
    expect(result.records[0].attribution.overall.sample_size).toBe(1);
  });
});

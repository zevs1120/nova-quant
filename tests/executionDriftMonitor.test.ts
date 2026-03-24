import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { buildExecutionDriftMonitor } from '../src/research/validation/executionDriftMonitor.js';

describe('execution drift monitor', () => {
  it('reconciles replay rows with paper/live trades and surfaces drift blockers', () => {
    const replayValidation = {
      replayed_signals: [
        {
          signal_id: 'SIG-1',
          strategy_id: 'EQ_MOMO_A',
          strategy_family: 'momentum',
          symbol: 'AAPL',
          market: 'US',
          direction: 'LONG',
          signal_time: '2026-03-01T14:30:00.000Z',
          replay_entry_event: {
            triggered: true,
            entry_time: '2026-03-01T15:00:00.000Z',
            entry_price: 100,
          },
          replay_exit_event: {
            exit_type: 'take_profit',
            exit_time: '2026-03-03T15:00:00.000Z',
          },
          realized_holding_duration: { days: 2 },
          realized_pnl_pct: 0.015,
          slippage_assumption_used: {
            volatility_bucket: 'normal',
            session_state: 'regular',
            liquidity_bucket: 'normal',
          },
        },
        {
          signal_id: 'SIG-2',
          strategy_id: 'EQ_REV_B',
          strategy_family: 'reversion',
          symbol: 'MSFT',
          market: 'US',
          direction: 'SHORT',
          signal_time: '2026-03-02T14:30:00.000Z',
          replay_entry_event: {
            triggered: true,
            entry_time: '2026-03-02T15:00:00.000Z',
            entry_price: 200,
          },
          replay_exit_event: {
            exit_type: 'stop_loss',
            exit_time: '2026-03-03T15:00:00.000Z',
          },
          realized_holding_duration: { days: 1 },
          realized_pnl_pct: -0.01,
          slippage_assumption_used: {
            volatility_bucket: 'high',
            session_state: 'opening_auction',
            liquidity_bucket: 'thin',
          },
        },
      ],
    };

    const trades = [
      {
        signal_id: 'SIG-1',
        source: 'PAPER',
        symbol: 'AAPL',
        market: 'US',
        side: 'LONG',
        entry: 100.18,
        exit: 101.25,
        pnl_pct: 1.3,
        time_in: '2026-03-01T15:08:00.000Z',
        time_out: '2026-03-03T14:40:00.000Z',
      },
      {
        signal_id: 'SIG-2',
        source: 'LIVE',
        symbol: 'MSFT',
        market: 'US',
        side: 'SHORT',
        entry: 204.8,
        exit: 209.5,
        pnl_pct: -4.2,
        time_in: '2026-03-02T16:20:00.000Z',
        time_out: '2026-03-03T18:00:00.000Z',
      },
    ];

    const monitor = buildExecutionDriftMonitor({
      asOf: '2026-03-10T00:00:00.000Z',
      replayValidation,
      trades,
    });

    expect(monitor.summary.matched_trade_count).toBe(2);
    expect(monitor.summary.capture_rate).toBe(1);
    expect(monitor.by_strategy.length).toBe(2);
    expect(monitor.by_source.some((row: any) => row.source === 'LIVE')).toBe(true);
    expect(monitor.reconciliation_rows.some((row: any) => row.status === 'breach')).toBe(true);
    expect(monitor.institutional_gate.blockers.length).toBeGreaterThan(0);
  });
});

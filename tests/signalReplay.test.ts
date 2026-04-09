import { describe, expect, it } from 'vitest';
import { replaySignalOutcome } from '../scripts/backtest-signal-replay.js';
import type { SignalRecord } from '../src/server/types.js';

const DAY = 24 * 3600 * 1000;

function signal(overrides: Partial<SignalRecord> = {}): SignalRecord {
  return {
    signal_id: 'SIG-REPLAY-1',
    created_at_ms: Date.parse('2026-04-06T18:00:00.000Z'),
    market: 'US',
    symbol: 'AAPL',
    strategy_family: 'Regime Transition',
    strategy_id: 'VOL_BREAKDOWN',
    direction: 'SHORT',
    entry_low: 100,
    entry_high: 102,
    stop_price: 106,
    invalidation_level: 106,
    tp1_price: 94,
    ...overrides,
  } as SignalRecord;
}

function bar(dayOffset: number, overrides: Record<string, number> = {}) {
  const price = overrides.open ?? 100;
  return {
    ts_open: Date.parse('2026-04-06T13:30:00.000Z') + dayOffset * DAY,
    open: price,
    high: overrides.high ?? price,
    low: overrides.low ?? price,
    close: overrides.close ?? price,
  };
}

describe('signal replay', () => {
  it('skips strict entry-zone shorts when the next tradable open gaps through stop', () => {
    const out = replaySignalOutcome(
      signal(),
      [
        bar(0, { open: 101, high: 103, low: 99, close: 101 }),
        bar(1, { open: 109, high: 111, low: 104, close: 108 }),
      ],
      { entryMode: 'entry-zone', maxEntryWaitBars: 3, maxHoldBars: 8 },
    );

    expect(out.trade).toBeNull();
    expect(out.skip?.reason).toBe('GAP_THROUGH_STOP');
  });

  it('can still run the old next-open replay as an explicit comparison mode', () => {
    const out = replaySignalOutcome(
      signal(),
      [
        bar(0, { open: 101, high: 103, low: 99, close: 101 }),
        bar(1, { open: 109, high: 111, low: 104, close: 108 }),
        bar(2, { open: 108, high: 110, low: 105, close: 109 }),
      ],
      { entryMode: 'next-open', maxEntryWaitBars: 1, maxHoldBars: 2 },
    );

    expect(out.skip).toBeNull();
    expect(out.trade?.entry).toBe(109);
    expect(out.trade?.exit_reason).toBe('STOP');
    expect(out.trade?.return_pct).toBeGreaterThan(0);
  });

  it('fills inside the entry zone and credits a short take-profit only after entry', () => {
    const out = replaySignalOutcome(
      signal(),
      [
        bar(0, { open: 101, high: 103, low: 99, close: 101 }),
        bar(1, { open: 103, high: 104, low: 100, close: 101 }),
        bar(2, { open: 100, high: 101, low: 93, close: 95 }),
      ],
      { entryMode: 'entry-zone', maxEntryWaitBars: 3, maxHoldBars: 8 },
    );

    expect(out.skip).toBeNull();
    expect(out.trade?.entry).toBe(102);
    expect(out.trade?.exit).toBe(94);
    expect(out.trade?.exit_reason).toBe('TP1');
    expect(out.trade?.return_pct).toBeGreaterThan(0);
  });

  it('skips malformed short setups before they contaminate research metrics', () => {
    const out = replaySignalOutcome(
      signal({ stop_price: 98, invalidation_level: 98, tp1_price: 110 }),
      [bar(1, { open: 101, high: 102, low: 100, close: 101 })],
      { entryMode: 'entry-zone', maxEntryWaitBars: 3, maxHoldBars: 8 },
    );

    expect(out.trade).toBeNull();
    expect(out.skip?.reason).toBe('MALFORMED_SIGNAL_BOUNDS');
  });
});

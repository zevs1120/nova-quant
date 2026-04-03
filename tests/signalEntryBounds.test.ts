import { describe, expect, it } from 'vitest';
import { resolveSignalEntryBounds } from '../src/utils/signalEntryBounds.js';

describe('resolveSignalEntryBounds', () => {
  it('prefers entry_zone low/high over legacy min/max', () => {
    const { entryMin, entryMax } = resolveSignalEntryBounds({
      entry_zone: { low: 1, high: 9 },
      entry_min: 0,
      entry_max: 99,
    });
    expect(entryMin).toBe(1);
    expect(entryMax).toBe(9);
  });

  it('falls back to entry_min / entry_max when zone missing sides', () => {
    const { entryMin, entryMax } = resolveSignalEntryBounds({
      entry_zone: {},
      entry_min: 10,
      entry_max: 20,
    });
    expect(entryMin).toBe(10);
    expect(entryMax).toBe(20);
  });

  it('resolves stop from stop_loss.price then stop_loss_value', () => {
    expect(
      resolveSignalEntryBounds({
        stop_loss: { price: 55 },
        stop_loss_value: 44,
      }).stopLossPrice,
    ).toBe(55);
    expect(
      resolveSignalEntryBounds({
        stop_loss_value: 44,
      }).stopLossPrice,
    ).toBe(44);
    expect(
      resolveSignalEntryBounds({
        stop_loss: 33,
      }).stopLossPrice,
    ).toBe(33);
  });

  it('maps take_profit_levels objects and numbers', () => {
    const { takeProfitLevels } = resolveSignalEntryBounds({
      take_profit_levels: [{ price: 100 }, 101, { price: 102 }],
    });
    expect(takeProfitLevels).toEqual([100, 101, 102]);
  });

  it('uses single take_profit when levels absent', () => {
    expect(resolveSignalEntryBounds({ take_profit: 200 }).takeProfitLevels).toEqual([200]);
  });

  it('drops null take_profit only', () => {
    expect(resolveSignalEntryBounds({ take_profit: null }).takeProfitLevels).toEqual([]);
  });

  it('returns empty take profits when nothing set', () => {
    expect(resolveSignalEntryBounds({}).takeProfitLevels).toEqual([]);
  });

  it('handles empty take_profit_levels array like absent', () => {
    const { takeProfitLevels } = resolveSignalEntryBounds({
      take_profit_levels: [],
      take_profit: 5,
    });
    expect(takeProfitLevels).toEqual([5]);
  });
});

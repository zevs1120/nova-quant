import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { buildNovaQuantSystem } from '../src/quant/system.js';

describe('signal generation integrity', () => {
  const state = buildNovaQuantSystem({
    asOf: '2026-03-08T00:00:00.000Z',
    riskProfileKey: 'balanced',
    executionTrades: [],
  });

  it('generates actionable signals with plan fields', () => {
    expect(state.signals.length).toBeGreaterThan(0);
    const signal = state.signals[0];

    expect(signal.signal_id).toBeTruthy();
    expect(signal.strategy_id).toBeTruthy();
    expect(signal.entry_zone?.low).toBeTypeOf('number');
    expect(signal.entry_zone?.high).toBeTypeOf('number');
    expect(signal.stop_loss?.price).toBeTypeOf('number');
    expect(signal.take_profit_levels?.length).toBeGreaterThan(0);
    expect(signal.explain_bullets?.length).toBeGreaterThan(0);
  });
});

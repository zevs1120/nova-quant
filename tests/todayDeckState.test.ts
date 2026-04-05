import { describe, expect, it } from 'vitest';
import { buildTodayDeckState } from '../src/components/today/todayDeckState.js';

describe('todayDeckState', () => {
  it('prefers decision signals and respects membership card limits', () => {
    const result = buildTodayDeckState({
      decision: {
        membership_gate: {
          hidden_action_cards: 3,
        },
      },
      signals: [{ id: 'fallback' }],
      topSignalEvidence: [],
      assetClass: 'US_STOCK',
      now: new Date('2026-04-05T00:00:00.000Z'),
      desiredSignalCount: 5,
      investorDemoEnabled: false,
      todayCardLimit: 1,
      helpers: {
        pickBestSignal: () => ({ id: 'best' }),
        buildSignalsFromDecision: () => [{ id: 'decision-1' }, { id: 'decision-2' }],
        buildSignalRail: () => [{ id: 'fallback-1' }, { id: 'fallback-2' }],
        buildDemoFallbackSignal: () => ({ id: 'demo' }),
        sortSignalsForDisplay: (rows: Array<{ id: string }>) => rows,
      },
    });

    expect(result.bestSignal).toEqual({ id: 'best' });
    expect(result.actionSignals).toEqual([{ id: 'decision-1' }, { id: 'decision-2' }]);
    expect(result.visibleDeckSignals).toEqual([{ id: 'decision-1' }]);
    expect(result.hiddenDeckCount).toBe(3);
  });
});

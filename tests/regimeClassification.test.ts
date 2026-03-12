import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { buildRegimeEngineState } from '../src/research/core/regimeEngineV2.js';

describe('regime classification v2', () => {
  it('classifies risk-off under stress inputs', () => {
    const regime = buildRegimeEngineState({
      asOf: '2026-03-08T00:00:00.000Z',
      championState: {
        insights: {
          regime: { tag: 'High Volatility Risk' },
          breadth: { ratio: 0.32 },
          volatility: { stress: 0.86 },
          risk_on_off: { score: 0.73, state: 'Risk-Off' }
        },
        safety: { mode: 'do not trade' }
      },
      strategyFamilyRegistry: { templates: [] }
    });

    expect(regime.state.primary).toBe('risk_off');
    expect(regime.state.recommended_user_posture).toBe('SKIP');
  });

  it('classifies trend when breadth and trend context are healthy', () => {
    const regime = buildRegimeEngineState({
      asOf: '2026-03-08T00:00:00.000Z',
      championState: {
        insights: {
          regime: { tag: 'Trend Up' },
          breadth: { ratio: 0.67 },
          volatility: { stress: 0.22 },
          risk_on_off: { score: 0.64, state: 'Risk-On' }
        },
        safety: { mode: 'normal risk' }
      },
      strategyFamilyRegistry: { templates: [] }
    });

    expect(regime.state.primary).toBe('trend');
    expect(['GO', 'REDUCE']).toContain(regime.state.recommended_user_posture);
  });
});

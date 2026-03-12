import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { buildRiskBucketSystem } from '../src/research/core/riskBucketSystem.js';

describe('risk bucket trade filtering', () => {
  it('explains allow/reduce/blocked trade outcomes', () => {
    const result = buildRiskBucketSystem({
      asOf: '2026-03-08T00:00:00.000Z',
      riskProfileKey: 'balanced',
      championState: {
        safety: { cards: { portfolio: { score: 72 } } }
      },
      regimeState: {
        state: {
          recommended_user_posture: 'REDUCE',
          default_sizing_multiplier: 0.7
        }
      },
      signals: [
        {
          signal_id: 'S1',
          symbol: 'AAPL',
          market: 'US',
          status: 'NEW',
          score: 0.82,
          confidence: 0.8,
          risk_score: 35,
          regime_compatibility: 78,
          position_advice: { position_pct: 10 }
        },
        {
          signal_id: 'S2',
          symbol: 'TSLA',
          market: 'US',
          status: 'NEW',
          score: 0.52,
          confidence: 0.55,
          risk_score: 58,
          regime_compatibility: 62,
          position_advice: { position_pct: 8 }
        },
        {
          signal_id: 'S3',
          symbol: 'XRP-USDT',
          market: 'CRYPTO',
          status: 'NEW',
          score: 0.31,
          confidence: 0.33,
          risk_score: 90,
          regime_compatibility: 20,
          position_advice: { position_pct: 6 }
        }
      ],
      trades: []
    });

    const decisions = result.trade_level_buckets.map((item: any) => item.decision);
    expect(decisions).toContain('reduce');
    expect(decisions).toContain('blocked');

    const blocked = result.trade_level_buckets.find((item: any) => item.signal_id === 'S3');
    expect(blocked).toBeTruthy();
    expect(blocked.recommended_position_pct).toBe(0);
    expect(blocked.reasons.length).toBeGreaterThan(0);
  });
});

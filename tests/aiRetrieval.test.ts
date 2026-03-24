import { describe, expect, it } from 'vitest';
import { answerWithRetrieval } from '../src/quant/aiRetrieval.js';

describe('answerWithRetrieval', () => {
  it('returns simple structured guidance for buy or wait questions', () => {
    const result = answerWithRetrieval('Should I buy or wait?', {
      config: { runtime: { source_status: 'DB_BACKED' } },
      safety: { mode: 'normal risk' },
      signals: [
        {
          symbol: 'BTC-USDT',
          direction: 'LONG',
          status: 'NEW',
          data_status: 'DB_BACKED',
          confidence: 0.76,
          score: 82,
          created_at: new Date().toISOString(),
          position_advice: { position_pct: 12 },
          stop_loss: { price: 61800 },
          take_profit_levels: [{ price: 66100 }],
          tags: ['auto_learning:enabled', 'auto_position:0.12', 'factor:trend_strength'],
        },
      ],
    });

    expect(result.intent).toBe('buy_or_sell');
    expect(result.text).toContain('VERDICT:');
    expect(result.text).toContain('BTC-USDT');
    expect(result.text).toContain('12%');
    expect(result.text).toContain('trend strength');
    expect(result.text).toContain('live database path');
  });

  it('handles missing holdings with an honest fallback', () => {
    const result = answerWithRetrieval('What is my biggest holdings risk?', {
      config: { runtime: { source_status: 'DB_BACKED' } },
      safety: { mode: 'trade light' },
      user_context: {
        holdings_review: {
          rows: [],
        },
      },
    });

    expect(result.intent).toBe('holdings_risk');
    expect(result.text).toContain('I cannot judge your holdings yet');
    expect(result.text).toContain('Open Holdings and add what you own now');
  });
});

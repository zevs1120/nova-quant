import { describe, expect, it } from 'vitest';
import { getRuntimeState } from '../src/server/api/queries.js';
import { createBrokerAdapter } from '../src/server/connect/adapters.js';

describe('api runtime state', () => {
  it('serves runtime state with transparency metadata', async () => {
    const res = getRuntimeState({
      userId: 'guest-default',
      market: 'US',
      assetClass: 'US_STOCK'
    });

    expect(res).toHaveProperty('source_status');
    expect(res).toHaveProperty('data_transparency');
    expect(res.data).toHaveProperty('signals');
    expect(res.data).toHaveProperty('performance');
    expect(res.data).toHaveProperty('decision');
    expect(res.data.decision).toHaveProperty('ranked_action_cards');
    expect(res.data.decision).toHaveProperty('risk_state');
    expect(res.data.decision).toHaveProperty('summary');
    if (res.data_transparency?.data_status === 'INSUFFICIENT_DATA') {
      expect(res.data?.velocity?.source_label).toBe('INSUFFICIENT_DATA');
      expect(res.data?.config?.source_label).toBe('INSUFFICIENT_DATA');
    }
  });

  it('serves honest disconnected broker snapshot when not configured', async () => {
    process.env.ALPACA_API_KEY = '';
    process.env.ALPACA_API_SECRET = '';
    const adapter = createBrokerAdapter('ALPACA');
    const snapshot = await adapter.fetchSnapshot();

    expect(snapshot.status).toBe('DISCONNECTED');
    expect(snapshot.buying_power).toBeNull();
    expect(Array.isArray(snapshot.positions)).toBe(true);
    expect(snapshot.positions).toHaveLength(0);
  });
});

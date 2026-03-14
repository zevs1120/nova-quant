import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../src/server/api/app.js';

describe('api runtime state', () => {
  it('serves runtime state with transparency metadata', async () => {
    const app = createApiApp();
    const res = await request(app).get('/api/runtime-state').query({
      userId: 'guest-default',
      market: 'US',
      assetClass: 'US_STOCK'
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('source_status');
    expect(res.body).toHaveProperty('data_transparency');
    expect(res.body.data).toHaveProperty('signals');
    expect(res.body.data).toHaveProperty('performance');
    expect(res.body.data).toHaveProperty('decision');
    expect(res.body.data.decision).toHaveProperty('ranked_action_cards');
    expect(res.body.data.decision).toHaveProperty('risk_state');
    expect(res.body.data.decision).toHaveProperty('summary');
    if (res.body.data_transparency?.data_status === 'INSUFFICIENT_DATA') {
      expect(res.body.data?.velocity?.source_label).toBe('INSUFFICIENT_DATA');
      expect(res.body.data?.config?.source_label).toBe('INSUFFICIENT_DATA');
    }
  });

  it('serves honest disconnected broker snapshot when not configured', async () => {
    process.env.ALPACA_API_KEY = '';
    process.env.ALPACA_API_SECRET = '';
    const app = createApiApp();
    const res = await request(app).get('/api/connect/broker').query({
      userId: 'guest-default',
      provider: 'ALPACA'
    });

    expect(res.status).toBe(200);
    expect(res.body.snapshot.status).toBe('DISCONNECTED');
    expect(res.body.snapshot.buying_power).toBeNull();
    expect(Array.isArray(res.body.snapshot.positions)).toBe(true);
    expect(res.body.snapshot.positions).toHaveLength(0);
  });
});

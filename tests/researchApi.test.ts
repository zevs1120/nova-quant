import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../src/server/api/app.js';

describe('research api contracts', () => {
  it('serves factor catalog and factor definitions', async () => {
    const app = createApiApp();

    const catalogRes = await request(app).get('/api/research/factors');
    expect(catalogRes.status).toBe(200);
    expect(Array.isArray(catalogRes.body.records)).toBe(true);
    expect(catalogRes.body.records.some((row: { factor_id: string }) => row.factor_id === 'momentum')).toBe(true);

    const factorRes = await request(app).get('/api/research/factors/momentum');
    expect(factorRes.status).toBe(200);
    expect(factorRes.body.factor?.factor_id).toBe('momentum');
  });

  it('serves research topic summaries and regime diagnostics', async () => {
    const app = createApiApp();

    const topicRes = await request(app).get('/api/research/topic').query({ topic: 'momentum' });
    expect(topicRes.status).toBe(200);
    expect(topicRes.body.summary?.topic).toBe('momentum');
    expect(Array.isArray(topicRes.body.summary?.factors)).toBe(true);

    const regimeRes = await request(app).get('/api/research/diagnostics/regime').query({
      userId: 'guest-default',
      market: 'US',
      assetClass: 'US_STOCK'
    });
    expect(regimeRes.status).toBe(200);
    expect(regimeRes.body.diagnostics).toBeTruthy();
    expect(regimeRes.body.diagnostics).toHaveProperty('current_regime');
  });
});

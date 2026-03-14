import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../src/server/api/app.js';

describe('research api contracts', () => {
  it('serves factor catalog and factor definitions', async () => {
    const app = createApiApp();

    const doctrineRes = await request(app).get('/api/research/doctrine');
    expect(doctrineRes.status).toBe(200);
    expect(doctrineRes.body.doctrine?.market_scope?.priority?.[0]).toBe('COMMODITY_FUTURES');

    const catalogRes = await request(app).get('/api/research/factors');
    expect(catalogRes.status).toBe(200);
    expect(Array.isArray(catalogRes.body.records)).toBe(true);
    expect(catalogRes.body.records.some((row: { factor_id: string }) => row.factor_id === 'momentum')).toBe(true);

    const factorRes = await request(app).get('/api/research/factors/momentum');
    expect(factorRes.status).toBe(200);
    expect(factorRes.body.factor?.factor_id).toBe('momentum');

    const measuredRes = await request(app).get('/api/research/factors/momentum/measured').query({ market: 'US' });
    expect(measuredRes.status).toBe(200);
    expect(measuredRes.body).toHaveProperty('report');
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

  it('serves evaluation, workflow, and experiment registry endpoints', async () => {
    const app = createApiApp();

    const evaluationRes = await request(app).get('/api/research/evaluation/strategy');
    expect(evaluationRes.status).toBe(200);
    expect(evaluationRes.body).toHaveProperty('report');

    const workflowRes = await request(app).get('/api/research/workflow').query({ topic: 'momentum' });
    expect(workflowRes.status).toBe(200);
    expect(workflowRes.body.workflow?.stages?.length).toBeGreaterThanOrEqual(5);

    const experimentsRes = await request(app).get('/api/research/experiments');
    expect(experimentsRes.status).toBe(200);
    expect(Array.isArray(experimentsRes.body.records)).toBe(true);
  });
});

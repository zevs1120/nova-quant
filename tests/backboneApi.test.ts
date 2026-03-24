import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../src/server/api/app.js';

describe('backend backbone api', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('surfaces unified research / decision / risk / registry / llm ops backbone summary', async () => {
    const app = createApiApp();
    const userId = `backbone-${Date.now()}`;

    await request(app).post('/api/decision/today').send({
      userId,
      market: 'US',
      assetClass: 'US_STOCK',
      holdings: [
        { symbol: 'AAPL', market: 'US', asset_class: 'US_STOCK', weight_pct: 12, sector: 'Technology' },
        { symbol: 'QQQ', market: 'US', asset_class: 'US_STOCK', weight_pct: 16, sector: 'ETF' }
      ]
    });

    const res = await request(app).get('/api/backbone/summary').query({
      userId,
      market: 'US',
      assetClass: 'US_STOCK'
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('research_kernel');
    expect(res.body).toHaveProperty('decision_engine');
    expect(res.body).toHaveProperty('risk_governance');
    expect(res.body).toHaveProperty('feature_platform');
    expect(res.body).toHaveProperty('registries');
    expect(res.body).toHaveProperty('llm_ops');
    expect(res.body).toHaveProperty('durable_workflows');
    expect(res.body).toHaveProperty('observability');
    expect(res.body).toHaveProperty('portfolio_allocator');
    expect(res.body).toHaveProperty('evidence_review');
    expect(res.body).toHaveProperty('canonical_semantics');

    expect(Array.isArray(res.body.decision_engine.ranked_action_cards)).toBe(true);
    expect(Array.isArray(res.body.decision_engine.evidence_bundles)).toBe(true);
    expect(res.body.feature_platform.cache_isolation_dimensions).toContain('user_id');
    expect(res.body.llm_ops.runtime.endpoint).toContain('127.0.0.1:11434');
    expect(Array.isArray(res.body.llm_ops.model_registry)).toBe(true);
    expect(res.body.llm_ops.model_registry.some((row: { model_key?: string }) => row.model_key === 'Marvix-Core')).toBe(true);
    expect(Array.isArray(res.body.durable_workflows.workflow_blueprints)).toBe(true);
  });
});

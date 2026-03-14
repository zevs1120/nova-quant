import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../src/server/api/app.js';

describe('decision api', () => {
  it('builds a personalized decision snapshot and persists an audit record', async () => {
    const app = createApiApp();
    const userId = `decision-user-${Date.now()}`;

    const decisionRes = await request(app)
      .post('/api/decision/today')
      .send({
        userId,
        market: 'US',
        assetClass: 'US_STOCK',
        holdings: [
          {
            symbol: 'AAPL',
            market: 'US',
            asset_class: 'US_STOCK',
            weight_pct: 14,
            sector: 'Technology'
          },
          {
            symbol: 'QQQ',
            market: 'US',
            asset_class: 'US_STOCK',
            weight_pct: 18,
            sector: 'ETF'
          }
        ]
      });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body).toHaveProperty('audit_snapshot_id');
    expect(decisionRes.body).toHaveProperty('ranked_action_cards');
    expect(Array.isArray(decisionRes.body.ranked_action_cards)).toBe(true);
    expect(decisionRes.body).toHaveProperty('portfolio_context');
    expect(decisionRes.body.portfolio_context.availability).toBe('PERSONALIZED');
    expect(decisionRes.body).toHaveProperty('risk_state');
    expect(decisionRes.body).toHaveProperty('summary');

    const topAction = decisionRes.body.ranked_action_cards[0];
    expect(topAction).toHaveProperty('action_id');
    expect(topAction).toHaveProperty('action_label');
    expect(topAction).toHaveProperty('evidence_bundle');
    expect(topAction.evidence_bundle).toHaveProperty('thesis');
    expect(topAction.evidence_bundle).toHaveProperty('regime_context');
    expect(topAction.evidence_bundle).toHaveProperty('data_quality');

    const auditRes = await request(app).get('/api/decision/audit').query({
      userId,
      market: 'US',
      assetClass: 'US_STOCK',
      limit: 5
    });

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.count).toBeGreaterThan(0);
    expect(Array.isArray(auditRes.body.records)).toBe(true);
    expect(auditRes.body.records[0]).toHaveProperty('summary');
    expect(auditRes.body.records[0]).toHaveProperty('risk_state');
    expect(auditRes.body.records[0]).toHaveProperty('portfolio_context');
    expect(auditRes.body.records[0]).toHaveProperty('actions');
  });
});

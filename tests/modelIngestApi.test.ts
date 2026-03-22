import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/api/app.js';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';

describe('model signal ingest api', () => {
  afterEach(() => {
    process.env.NOVA_MODEL_INGEST_TOKEN = '';
    const db = getDb();
    ensureSchema(db);
    db.prepare("DELETE FROM signals WHERE strategy_id = 'TREND_PULLBACK_V3'").run();
  });

  it('accepts standard model payloads and stores normalized signals', async () => {
    process.env.NOVA_MODEL_INGEST_TOKEN = 'secret-token';
    const app = createApiApp();
    const response = await request(app)
      .post('/api/model/signals/ingest')
      .set('Authorization', 'Bearer secret-token')
      .send({
        signals: [
          {
            market: 'US',
            symbol: 'AAPL',
            side: 'LONG',
            entry: 212.4,
            stop: 206.8,
            take1: 218,
            take2: 223.5,
            risk: 0.02,
            strategy: 'trend_pullback_v3',
            time: '2026-03-22T09:30:00Z'
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.ingested).toBe(1);

    const db = getDb();
    const row = db
      .prepare("SELECT signal_id, symbol, market, strategy_id, payload_json FROM signals WHERE strategy_id = 'TREND_PULLBACK_V3' LIMIT 1")
      .get() as { signal_id: string; symbol: string; market: string; payload_json: string } | undefined;

    expect(row?.signal_id).toBeTruthy();
    expect(row?.symbol).toBe('AAPL');
    expect(row?.market).toBe('US');
    expect(row?.payload_json).toContain('"strategy_family":"MODEL_PUSH"');
  });
});

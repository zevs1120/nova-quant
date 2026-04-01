import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/api/app.js';
import {
  executeSync,
  qualifyBusinessTable,
  queryRowSync,
} from '../src/server/db/postgresSyncBridge.js';
import { requestLocalHttp } from './helpers/httpTestClient.js';

describe('model signal ingest api', () => {
  afterEach(() => {
    process.env.NOVA_MODEL_INGEST_TOKEN = '';
    executeSync(
      `DELETE FROM ${qualifyBusinessTable('signals')}
       WHERE strategy_id IN ('TREND_PULLBACK_V3', 'SPX_BREAKOUT_OPTIONS_V1')`,
    );
  });

  it('accepts standard model payloads and stores normalized signals', async () => {
    process.env.NOVA_MODEL_INGEST_TOKEN = 'secret-token';
    const app = createApiApp();
    const response = await requestLocalHttp(app, {
      method: 'POST',
      path: '/api/model/signals/ingest',
      headers: { Authorization: 'Bearer secret-token' },
      body: {
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
            time: '2026-03-22T09:30:00Z',
          },
        ],
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.ingested).toBe(1);

    const row = queryRowSync(
      `SELECT signal_id, symbol, market, strategy_id, payload_json
       FROM ${qualifyBusinessTable('signals')}
       WHERE strategy_id = 'TREND_PULLBACK_V3'
       LIMIT 1`,
    ) as { signal_id: string; symbol: string; market: string; payload_json: string } | undefined;

    expect(row?.signal_id).toBeTruthy();
    expect(row?.symbol).toBe('AAPL');
    expect(row?.market).toBe('US');
    expect(row?.payload_json).toContain('"strategy_family":"MODEL_PUSH"');
  });

  it('infers OPTIONS for high-strike OCC symbols during model ingest', async () => {
    process.env.NOVA_MODEL_INGEST_TOKEN = 'secret-token';
    const app = createApiApp();
    const response = await requestLocalHttp(app, {
      method: 'POST',
      path: '/api/model/signals/ingest',
      headers: { Authorization: 'Bearer secret-token' },
      body: {
        signals: [
          {
            market: 'US',
            symbol: 'SPX260619C01200000',
            side: 'LONG',
            entry: 12.4,
            stop: 8.1,
            take1: 19.8,
            take2: 24.5,
            risk: 0.015,
            strategy: 'spx_breakout_options_v1',
            time: '2026-03-22T09:30:00Z',
          },
        ],
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.ingested).toBe(1);

    const row = queryRowSync(
      `SELECT signal_id, symbol, market, asset_class, strategy_id, payload_json
       FROM ${qualifyBusinessTable('signals')}
       WHERE strategy_id = 'SPX_BREAKOUT_OPTIONS_V1'
       LIMIT 1`,
    ) as
      | {
          signal_id: string;
          symbol: string;
          market: string;
          asset_class: string;
          strategy_id: string;
          payload_json: string;
        }
      | undefined;

    expect(row?.signal_id).toBeTruthy();
    expect(row?.symbol).toBe('SPX260619C01200000');
    expect(row?.market).toBe('US');
    expect(row?.asset_class).toBe('OPTIONS');
    expect(row?.strategy_id).toBe('SPX_BREAKOUT_OPTIONS_V1');
    expect(row?.payload_json).toContain('"asset_class":"OPTIONS"');
    expect(row?.payload_json).toContain('"strategy_family":"MODEL_PUSH"');
  });
});

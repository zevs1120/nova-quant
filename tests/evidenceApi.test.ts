import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { createApiApp } from '../src/server/api/app.js';
import type { SignalContract } from '../src/server/types.js';

function seedSignal(id: string, symbol: string, createdAt: string, entry: number): SignalContract {
  return {
    id,
    created_at: createdAt,
    expires_at: new Date(Date.parse(createdAt) + 3 * 24 * 3600_000).toISOString(),
    asset_class: 'US_STOCK',
    market: 'US',
    symbol,
    timeframe: '1d',
    strategy_id: 'EQ_EVD_API',
    strategy_family: 'Momentum / Trend Following',
    strategy_version: 'runtime-bars-rules.v1',
    regime_id: 'TREND',
    temperature_percentile: 50,
    volatility_percentile: 44,
    direction: 'LONG',
    strength: 75,
    confidence: 0.7,
    entry_zone: { low: entry - 0.5, high: entry + 0.5, method: 'LIMIT', notes: 'seed' },
    invalidation_level: entry - 1.1,
    stop_loss: { type: 'ATR', price: entry - 1.1, rationale: 'seed' },
    take_profit_levels: [{ price: entry + 1.6, size_pct: 0.6, rationale: 'seed' }],
    trailing_rule: { type: 'EMA', params: { fast: 10, slow: 30 } },
    position_advice: {
      position_pct: 7,
      leverage_cap: 1.4,
      risk_bucket_applied: 'BASE',
      rationale: 'seed',
    },
    cost_model: { fee_bps: 1.2, spread_bps: 1.1, slippage_bps: 2.2, basis_est: 0 },
    expected_metrics: {
      expected_R: 1.2,
      hit_rate_est: 0.56,
      sample_size: 20,
      expected_max_dd_est: 0.08,
    },
    explain_bullets: ['API seed signal'],
    execution_checklist: ['seed'],
    tags: ['status:MODEL_DERIVED', 'source:DB_BACKED'],
    status: 'NEW',
    payload: { kind: 'STOCK_SWING', data: { horizon: 'MEDIUM', catalysts: ['seed'] } },
    score: 76,
    payload_version: 'signal-contract.v1',
  };
}

describe('evidence api', () => {
  it('exposes top signals/backtests/reconciliation/champion endpoints with transparency', async () => {
    const db = getDb();
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();
    const start = now - 110 * 24 * 3600_000;
    const asset = repo.upsertAsset({
      symbol: 'SPY',
      market: 'US',
      venue: 'STOOQ',
    });

    const bars = Array.from({ length: 120 }).map((_, i) => {
      const open = 430 + i * 0.3;
      const close = open + 0.24;
      return {
        ts_open: start + i * 24 * 3600_000,
        open: open.toFixed(4),
        high: (close + 0.45).toFixed(4),
        low: (open - 0.4).toFixed(4),
        close: close.toFixed(4),
        volume: String(3000 + i * 12),
      };
    });
    repo.upsertOhlcvBars(asset.asset_id, '1d', bars, 'TEST');

    const signalA = seedSignal(
      'SIG-API-EVD-1',
      'SPY',
      new Date(start + 90 * 24 * 3600_000).toISOString(),
      457,
    );
    const signalB = seedSignal(
      'SIG-API-EVD-2',
      'SPY',
      new Date(start + 92 * 24 * 3600_000).toISOString(),
      458,
    );
    repo.upsertSignal(signalA);
    repo.upsertSignal(signalB);

    repo.upsertExecution({
      execution_id: 'EXE-API-EVD-1',
      signal_id: signalA.id,
      user_id: 'api-evidence-user',
      mode: 'PAPER',
      action: 'EXECUTE',
      market: 'US',
      symbol: 'SPY',
      entry_price: 457.2,
      stop_price: 455.8,
      tp_price: 459,
      size_pct: 7,
      pnl_pct: null,
      note: 'seed',
      created_at_ms: now - 2 * 24 * 3600_000,
      updated_at_ms: now - 2 * 24 * 3600_000,
    });

    const app = createApiApp();

    const runRes = await request(app).post('/api/evidence/run').send({
      userId: 'api-evidence-user',
      market: 'US',
      assetClass: 'US_STOCK',
      timeframe: '1d',
      maxSignals: 30,
    });
    expect(runRes.status).toBe(200);
    expect(runRes.body.run_id).toBeTruthy();

    const topRes = await request(app).get('/api/evidence/signals/top').query({
      userId: 'api-evidence-user',
      market: 'US',
      assetClass: 'US_STOCK',
      limit: 3,
    });
    expect(topRes.status).toBe(200);
    expect(topRes.body.source_status).toBe('DB_BACKED');
    expect(Array.isArray(topRes.body.records)).toBe(true);
    if (topRes.body.records.length > 0) {
      expect(topRes.body.records[0]).toHaveProperty('supporting_run_id');
      expect(topRes.body.records[0]).toHaveProperty('source_transparency');
    }

    const runsRes = await request(app).get('/api/evidence/backtests').query({ limit: 10 });
    expect(runsRes.status).toBe(200);
    expect(Array.isArray(runsRes.body.records)).toBe(true);
    const runId = runsRes.body.records?.[0]?.id;
    expect(runId).toBeTruthy();

    const runDetailRes = await request(app).get(`/api/evidence/backtests/${runId}`);
    expect(runDetailRes.status).toBe(200);
    expect(runDetailRes.body.detail).toHaveProperty('run');
    expect(runDetailRes.body.detail).toHaveProperty('metrics');
    expect(runDetailRes.body.detail).toHaveProperty('transparency');

    const reconRes = await request(app)
      .get('/api/evidence/reconciliation')
      .query({ replayRunId: runId });
    expect(reconRes.status).toBe(200);
    expect(Array.isArray(reconRes.body.records)).toBe(true);

    const championRes = await request(app).get('/api/evidence/strategies/champion');
    expect(championRes.status).toBe(200);
    expect(Array.isArray(championRes.body.records)).toBe(true);
  });
});

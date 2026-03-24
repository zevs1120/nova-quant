import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import type { SignalContract } from '../src/server/types.js';
import {
  getExecutionGovernance,
  listExecutions,
  setExecutionKillSwitch,
  submitExecution,
} from '../src/server/api/queries.js';

function seedSignal(id: string, symbol: string, createdAt: string, entry: number): SignalContract {
  return {
    id,
    created_at: createdAt,
    expires_at: new Date(Date.parse(createdAt) + 2 * 24 * 3600_000).toISOString(),
    asset_class: 'US_STOCK',
    market: 'US',
    symbol,
    timeframe: '1d',
    strategy_id: 'SD-TIME_SERIES_MOMENTUM-TS1',
    strategy_family: 'Momentum / Trend Following',
    strategy_version: 'nova-factory.shadow',
    regime_id: 'TREND',
    temperature_percentile: 41,
    volatility_percentile: 38,
    direction: 'LONG',
    strength: 82,
    confidence: 0.74,
    entry_zone: {
      low: entry - 0.25,
      high: entry + 0.25,
      method: 'LIMIT',
      notes: 'seeded factory card',
    },
    invalidation_level: entry - 1.2,
    stop_loss: { type: 'ATR', price: entry - 1.2, rationale: 'seed' },
    take_profit_levels: [{ price: entry + 2.1, size_pct: 0.6, rationale: 'seed' }],
    trailing_rule: { type: 'EMA', params: { fast: 10, slow: 30 } },
    position_advice: {
      position_pct: 8,
      leverage_cap: 1.5,
      risk_bucket_applied: 'BASE',
      rationale: 'seed',
    },
    cost_model: { fee_bps: 1.2, spread_bps: 1.1, slippage_bps: 1.8, basis_est: 0 },
    expected_metrics: {
      expected_R: 1.3,
      hit_rate_est: 0.57,
      sample_size: 28,
      expected_max_dd_est: 0.08,
    },
    explain_bullets: ['Seeded public-template signal'],
    execution_checklist: ['seed'],
    tags: [
      'status:MODEL_DERIVED',
      'source:nova_factory',
      'factory_quality:88',
      'factory_stage:shadow',
    ],
    status: 'NEW',
    payload: { kind: 'STOCK_SWING', data: { horizon: 'MEDIUM', catalysts: ['seed'] } },
    score: 84,
    payload_version: 'signal-contract.v1',
  };
}

describe('execution governance', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.env.NOVA_ENABLE_ORDER_ROUTING = '';
    process.env.NOVA_ENABLE_ALPACA_TRADING = '';
    process.env.ALPACA_API_KEY = '';
    process.env.ALPACA_API_SECRET = '';
    await setExecutionKillSwitch({
      enabled: false,
      provider: 'ALPACA',
      reason: 'test cleanup',
    });
  });

  it('creates live champion + paper challenger pair and reconciles the order state', async () => {
    const db = getDb();
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();
    const userId = `exec-governance-${now}`;
    const signal = seedSignal(
      `SIG-EXEC-GOV-${now}`,
      'SPY',
      new Date(now - 5 * 60_000).toISOString(),
      501.25,
    );
    repo.upsertSignal(signal);

    process.env.ALPACA_API_KEY = 'key';
    process.env.ALPACA_API_SECRET = 'secret';
    process.env.NOVA_ENABLE_ALPACA_TRADING = '1';

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'ord_exec_1',
            client_order_id: 'client_exec_1',
            symbol: 'SPY',
            side: 'buy',
            type: 'limit',
            time_in_force: 'day',
            status: 'new',
            qty: '1',
            filled_qty: '0',
            notional: null,
            limit_price: '501.25',
            submitted_at: '2026-03-21T00:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ) as never,
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'ord_exec_1',
            client_order_id: 'client_exec_1',
            symbol: 'SPY',
            side: 'buy',
            type: 'limit',
            time_in_force: 'day',
            status: 'filled',
            qty: '1',
            filled_qty: '1',
            filled_avg_price: '501.30',
            notional: null,
            limit_price: '501.25',
            submitted_at: '2026-03-21T00:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ) as never,
      );

    const result = await submitExecution({
      userId,
      signalId: signal.id,
      mode: 'LIVE',
      action: 'EXECUTE',
      provider: 'ALPACA',
      qty: 1,
    });

    expect(result, `submitExecution returned: ${JSON.stringify(result)}`).toHaveProperty(
      'ok',
      true,
    );
    if (!result.ok || !result.executionId) throw new Error('expected live execution to succeed');
    const shadowExecutionId = 'shadowExecutionId' in result ? result.shadowExecutionId : null;
    expect(shadowExecutionId).toBeTruthy();

    const executions = listExecutions({
      userId,
      signalId: signal.id,
      limit: 10,
    });
    expect(executions.some((row) => row.mode === 'LIVE')).toBe(true);
    expect(executions.some((row) => row.mode === 'PAPER')).toBe(true);

    const live = executions.find((row) => row.mode === 'LIVE');
    expect(live).toBeTruthy();
    const liveNote = JSON.parse(String(live?.note || '{}')) as Record<string, any>;
    expect(liveNote.routing?.route_key).toBe('live_champion_paper_challenger');
    expect(liveNote.routing?.shadow_execution_id).toBe(shadowExecutionId);

    const governance = await getExecutionGovernance({
      userId,
      provider: 'ALPACA',
      refreshOrders: true,
    });
    expect(governance.champion_challenger.paired_count).toBe(1);
    expect(governance.reconciliation.summary.total).toBe(1);
    expect(governance.reconciliation.rows[0].reconciliation_status).toBe('RECONCILED');
    expect(governance.kill_switch.active).toBe(false);
  });

  it('blocks new live routing when the manual kill switch is enabled', async () => {
    const db = getDb();
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();
    const userId = `exec-kill-${now}`;
    const signal = seedSignal(
      `SIG-EXEC-KILL-${now}`,
      'SPY',
      new Date(now - 5 * 60_000).toISOString(),
      499.8,
    );
    repo.upsertSignal(signal);

    process.env.ALPACA_API_KEY = 'key';
    process.env.ALPACA_API_SECRET = 'secret';
    process.env.NOVA_ENABLE_ALPACA_TRADING = '1';

    const killSwitch = await setExecutionKillSwitch({
      userId,
      enabled: true,
      provider: 'ALPACA',
      reason: 'manual breach drill',
    });
    expect(killSwitch.kill_switch.active).toBe(true);

    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await submitExecution({
      userId,
      signalId: signal.id,
      mode: 'LIVE',
      action: 'EXECUTE',
      provider: 'ALPACA',
      qty: 1,
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect('error' in result ? String(result.error) : '').toContain('kill switch');
  });
});

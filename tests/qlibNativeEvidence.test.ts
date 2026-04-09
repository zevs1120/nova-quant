import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { createApiApp } from '../src/server/api/app.js';
import { resetConfigCache } from '../src/server/config.js';
import { runQlibNativeBacktestEvidence } from '../src/server/evidence/qlibNative.js';
import { requestLocalHttp } from './helpers/httpTestClient.js';

function buildBridgeResult() {
  return {
    status: 'ok',
    metrics: {
      sharpe: 1.23,
      annualized_return: 0.31,
      max_drawdown: -0.08,
      avg_daily_return: 0.0012,
      trading_days: 20,
    },
    elapsed_ms: 345,
    notes: ['mock qlib native result'],
  };
}

describe('qlib native evidence bridge', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetConfigCache();
  });

  it('persists native Qlib backtest as auditable backtest evidence', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    const out = await runQlibNativeBacktestEvidence({
      repo,
      request: {
        symbols: ['aapl', 'msft'],
        start_date: '2025-01-01',
        end_date: '2025-03-31',
        factor_set: 'Alpha158',
        benchmark: 'spy',
        topk: 1,
      },
      bridgeResult: buildBridgeResult(),
    });

    const run = repo.getBacktestRun(out.run_id);
    const metric = repo.getBacktestMetric(out.run_id);
    const artifacts = repo.listBacktestArtifacts(out.run_id);

    expect(run?.run_type).toBe('portfolio_replay');
    expect(run?.status).toBe('SUCCESS');
    expect(run?.notes).toContain('Qlib native backtest');
    expect(run?.execution_profile_id).toBe('exec-qlib-native-v1');
    expect(metric?.status).toBe('READY');
    expect(metric?.sharpe).toBe(1.23);
    expect(metric?.sample_size).toBe(20);
    expect(metric?.net_return).toBeCloseTo(0.024, 6);
    expect(artifacts.map((row) => row.artifact_type)).toEqual(
      expect.arrayContaining([
        'qlib_native_request',
        'qlib_native_response',
        'qlib_native_metrics',
      ]),
    );
    expect(
      JSON.parse(
        String(
          artifacts.find((row) => row.artifact_type === 'qlib_native_request')?.path_or_payload,
        ),
      ).symbols,
    ).toEqual(['AAPL', 'MSFT']);
  });

  it('exposes an API endpoint that calls the Qlib native bridge and stores the run', async () => {
    vi.stubEnv('QLIB_BRIDGE_ENABLED', 'true');
    vi.stubEnv('QLIB_BRIDGE_URL', 'http://qlib.test');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
    resetConfigCache();

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('http://qlib.test/api/v2/backtest/native');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body || '{}'));
      expect(body.symbols).toEqual(['AAPL', 'MSFT']);
      return {
        ok: true,
        async json() {
          return buildBridgeResult();
        },
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = createApiApp();
    const res = await requestLocalHttp(app, {
      method: 'POST',
      path: '/api/evidence/qlib-native/run',
      body: {
        symbols: ['AAPL', 'MSFT'],
        startDate: '2025-01-01',
        endDate: '2025-03-31',
        factorSet: 'Alpha158',
        benchmark: 'spy',
        topk: 1,
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.run_id).toContain('qlib-native-');
    expect(res.body.native_status).toBe('ok');
    expect(res.body.metric.sharpe).toBe(1.23);

    const detail = await requestLocalHttp(app, {
      path: `/api/evidence/backtests/${res.body.run_id}`,
    });
    expect(detail.status).toBe(200);
    expect(detail.body.detail.run.notes).toContain('Qlib native backtest');
    expect(
      detail.body.detail.artifacts.some(
        (artifact: { artifact_type: string }) => artifact.artifact_type === 'qlib_native_response',
      ),
    ).toBe(true);
  });
});

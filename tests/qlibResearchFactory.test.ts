import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { createApiApp } from '../src/server/api/app.js';
import { resetConfigCache } from '../src/server/config.js';
import { runQlibResearchFactoryJob } from '../src/server/jobs/qlibResearchFactory.js';
import { runQlibResearchFactory } from '../src/server/research/qlibFactory.js';
import { requestLocalHttp } from './helpers/httpTestClient.js';

function buildBars(symbolOffset = 0) {
  const start = Date.parse('2024-09-01T00:00:00.000Z');
  return Array.from({ length: 95 }, (_, index) => {
    const close = 100 + symbolOffset + index * 0.2;
    return {
      ts_open: start + index * 86_400_000,
      open: (close - 0.1).toFixed(4),
      high: (close + 0.5).toFixed(4),
      low: (close - 0.7).toFixed(4),
      close: close.toFixed(4),
      volume: String(1_000_000 + index * 1000),
    };
  });
}

function buildFactorResult() {
  return {
    status: 'ok',
    factor_set: 'Alpha158',
    factor_count: 158,
    row_count: 4,
    symbols_used: ['AAPL', 'MSFT'],
    date_range: { start: '2025-01-01', end: '2025-01-03' },
    elapsed_ms: 12,
    rows: [
      {
        symbol: 'AAPL',
        date: '2025-01-02',
        factors: {
          ROCP5: 0.02,
          RESI5: -0.4,
          WVMA5: 1.2,
        },
      },
      {
        symbol: 'AAPL',
        date: '2025-01-03',
        factors: {
          ROCP5: 0.03,
          RESI5: -0.2,
          WVMA5: 1.3,
        },
      },
      {
        symbol: 'MSFT',
        date: '2025-01-02',
        factors: {
          ROCP5: 0.01,
          RESI5: 0.1,
          WVMA5: 1.1,
        },
      },
      {
        symbol: 'MSFT',
        date: '2025-01-03',
        factors: {
          ROCP5: 0.015,
          RESI5: -0.05,
          WVMA5: 1.05,
        },
      },
    ],
  };
}

function buildModelResult() {
  return {
    status: 'ok',
    model_name: 'lightgbm-alpha158',
    predict_date: '2025-01-03',
    prediction_count: 2,
    elapsed_ms: 18,
    predictions: [
      { symbol: 'AAPL', score: 0.72, rank: 1 },
      { symbol: 'MSFT', score: 0.33, rank: 2 },
    ],
  };
}

function buildNativeEvidence() {
  return {
    run_id: 'qlib-native-test-run',
    status: 'SUCCESS' as const,
    native_status: 'ok',
    dataset_version_id: 'qlib-dataset-test',
    universe_version_id: 'qlib-universe-test',
    execution_profile_id: 'exec-qlib-native-v1',
    metric: {
      backtest_run_id: 'qlib-native-test-run',
      gross_return: 0.12,
      net_return: 0.11,
      sharpe: 1.4,
      sortino: null,
      max_drawdown: -0.08,
      turnover: null,
      win_rate: null,
      hit_rate: null,
      cost_drag: null,
      sample_size: 20,
      withheld_reason: null,
      realism_grade: 'B' as const,
      robustness_grade: 'A' as const,
      status: 'READY' as const,
      created_at_ms: Date.now(),
      updated_at_ms: Date.now(),
    },
    result: {
      status: 'ok',
      metrics: {
        sharpe: 1.4,
        annualized_return: 0.3,
        max_drawdown: -0.08,
        avg_daily_return: 0.001,
        trading_days: 20,
      },
      elapsed_ms: 33,
      notes: ['mock native evidence'],
    },
  };
}

describe('qlib research factory', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetConfigCache();
  });

  it('turns Qlib factors and model scores into registered and evaluated alpha candidates', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    const out = await runQlibResearchFactory(
      repo,
      {
        symbols: ['aapl', 'msft'],
        startDate: '2025-01-01',
        endDate: '2025-01-03',
        modelName: 'lightgbm-alpha158',
        runNativeBacktest: true,
      },
      {
        fetchFactors: async () => buildFactorResult(),
        predictModel: async () => buildModelResult(),
        runNativeBacktestEvidence: async () => buildNativeEvidence(),
      },
    );

    expect(out.workflow_id).toContain('workflow-qlib-factory-');
    expect(out.factor_pull.row_count).toBe(4);
    expect(out.model_pull?.prediction_count).toBe(2);
    expect(out.generation_summary.candidates_registered).toBe(3);
    expect(out.evaluation_summary.evaluated).toBe(3);
    expect(out.promotion_review).toEqual(
      expect.objectContaining({
        accepted: expect.any(Array),
        rejected: expect.any(Array),
        watchlist: expect.any(Array),
      }),
    );
    expect(out.native_backtest?.run_id).toBe('qlib-native-test-run');

    const workflow = repo.listWorkflowRuns({ workflowKey: 'qlib_research_factory', limit: 1 })[0];
    expect(workflow?.status).toBe('SUCCEEDED');

    const candidates = repo.listAlphaCandidates({ limit: 10 });
    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.family)).toEqual(
      expect.arrayContaining([
        'trend_continuation_refinement',
        'cross_asset_lead_lag',
        'mean_reversion_refinement',
      ]),
    );
    expect(candidates[0]?.metadata_json).toContain('qlib_research_factory');

    const firstEvaluation = repo.listAlphaEvaluations({ limit: 1 })[0];
    expect(firstEvaluation?.workflow_run_id).toBe(out.workflow_id);
    const artifacts = repo.listBacktestArtifacts(String(firstEvaluation?.backtest_run_id || ''));
    expect(artifacts.map((artifact) => artifact.artifact_type)).toEqual(
      expect.arrayContaining([
        'qlib_factory_factor_request',
        'qlib_factory_factor_snapshot',
        'qlib_factory_model_predictions',
        'qlib_factory_candidate_lineage',
      ]),
    );
  });

  it('exposes the cloud API route for running the Qlib research factory', async () => {
    vi.stubEnv('QLIB_BRIDGE_ENABLED', 'true');
    vi.stubEnv('QLIB_BRIDGE_URL', 'http://qlib.test');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
    resetConfigCache();

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/factors/compute')) {
        return {
          ok: true,
          async json() {
            return buildFactorResult();
          },
        };
      }
      if (String(input).endsWith('/api/models/predict')) {
        return {
          ok: true,
          async json() {
            return buildModelResult();
          },
        };
      }
      if (String(input).endsWith('/api/v2/backtest/native')) {
        return {
          ok: true,
          async json() {
            return buildNativeEvidence().result;
          },
        };
      }
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = createApiApp();
    const res = await requestLocalHttp(app, {
      method: 'POST',
      path: '/api/research/qlib-factory/run',
      body: {
        symbols: ['AAPL', 'MSFT'],
        startDate: '2025-01-01',
        endDate: '2025-01-03',
        modelName: 'lightgbm-alpha158',
        benchmark: 'SPY',
        topk: 1,
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.workflow_id).toContain('workflow-qlib-factory-');
    expect(res.body.generation_summary.candidates_registered).toBe(3);
    expect(res.body.evaluation_summary.evaluated).toBe(3);
    expect(res.body.native_backtest.status).toBe('SUCCESS');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://qlib.test/api/factors/compute',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://qlib.test/api/models/predict',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://qlib.test/api/v2/backtest/native',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('runs as a scheduled job against the repository-backed universe', async () => {
    vi.stubEnv('QLIB_BRIDGE_ENABLED', 'true');
    vi.stubEnv('QLIB_BRIDGE_URL', 'http://qlib.test');
    resetConfigCache();

    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const aapl = repo.upsertAsset({
      symbol: 'AAPL',
      market: 'US',
      venue: 'TEST',
      status: 'ACTIVE',
    });
    const msft = repo.upsertAsset({
      symbol: 'MSFT',
      market: 'US',
      venue: 'TEST',
      status: 'ACTIVE',
    });
    repo.upsertOhlcvBars(aapl.asset_id, '1d', buildBars(0), 'TEST');
    repo.upsertOhlcvBars(msft.asset_id, '1d', buildBars(10), 'TEST');

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/factors/compute')) {
        return {
          ok: true,
          async json() {
            return buildFactorResult();
          },
        };
      }
      if (String(input).endsWith('/api/v2/backtest/native')) {
        return {
          ok: true,
          async json() {
            return buildNativeEvidence().result;
          },
        };
      }
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await runQlibResearchFactoryJob({
      repo,
      triggerType: 'scheduled',
      userId: 'job-user',
      runNativeBacktest: true,
      maxSymbols: 8,
    });

    expect('skipped' in out ? out.skipped : false).toBe(false);
    expect(out.workflow_id).toContain('workflow-qlib-factory-');
    if ('skipped' in out) throw new Error(`job unexpectedly skipped: ${out.reason}`);
    expect(out.job_context.universe_source).toBe('repository_daily_bars');
    expect(out.job_context.symbols).toEqual(['AAPL', 'MSFT']);
    expect(out.generation_summary.candidates_registered).toBe(2);
    expect(out.promotion_review).toEqual(
      expect.objectContaining({
        accepted: expect.any(Array),
        rejected: expect.any(Array),
        watchlist: expect.any(Array),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://qlib.test/api/factors/compute',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"symbols":["AAPL","MSFT"]'),
      }),
    );
  });
});

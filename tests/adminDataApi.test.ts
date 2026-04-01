import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAdminLogin } from '../src/server/api/authHandlers.js';
import {
  handleAdminAlphas,
  handleAdminOverview,
  handleAdminOverviewHeadline,
  handleAdminSignals,
  handleAdminSystem,
  handleAdminUsers,
} from '../src/server/api/adminHandlers.js';
import { getRuntimeRepo } from '../src/server/db/runtimeRepository.js';
import {
  persistAlphaCandidate,
  type AutonomousAlphaCandidate,
} from '../src/server/alpha_registry/index.js';
import { signupAuthUser } from '../src/server/auth/service.js';
import { pgGetUserByEmail, pgUpsertUserState } from '../src/server/auth/postgresStore.js';
import type { SignalContract } from '../src/server/types.js';
import { _resetAdminCachesForTesting } from '../src/server/admin/service.js';

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

async function callHandler(
  handler: (req: Record<string, unknown>, res: MockResponse) => Promise<void>,
  args: { body?: unknown; cookie?: string },
) {
  const res = createMockResponse();
  await handler(
    {
      body: args.body,
      headers: args.cookie ? { cookie: args.cookie } : {},
      header(name: string) {
        if (name.toLowerCase() === 'cookie') return args.cookie || '';
        return '';
      },
    },
    res,
  );
  return res;
}

function buildCandidate(id: string): AutonomousAlphaCandidate {
  return {
    id,
    thesis: 'Alpha discovery candidate for admin api test',
    family: 'trend_continuation_refinement',
    formula: { rule: 'breakout_with_volume' },
    params: { breakout_window: 20, volume_ratio: 1.6 },
    feature_dependencies: ['trend_strength', 'relative_volume'],
    regime_constraints: ['trend'],
    compatible_markets: ['US'],
    intended_holding_period: '2-5 days',
    entry_logic: { trigger: 'close_above_breakout' },
    exit_logic: { stop: 'atr_2x', tp: 'rr_2' },
    sizing_hint: { path: 'signal_input' },
    required_inputs: ['close', 'volume'],
    complexity_score: 0.42,
    integration_path: 'signal_input',
    created_at: new Date().toISOString(),
    source: 'autonomous_discovery',
    strategy_candidate: null,
  };
}

function buildSignal(id: string, symbol = 'AAPL'): SignalContract {
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 86_400_000).toISOString();
  return {
    id,
    created_at: now,
    expires_at: later,
    asset_class: 'US_STOCK',
    market: 'US',
    symbol,
    timeframe: '1d',
    strategy_id: 'TREND_PULLBACK',
    strategy_family: 'Momentum / Trend Following',
    strategy_version: 'admin-test.v1',
    regime_id: 'TREND',
    temperature_percentile: 58,
    volatility_percentile: 49,
    direction: 'LONG',
    strength: 76,
    confidence: 0.71,
    entry_zone: {
      low: 100,
      high: 101,
      method: 'LIMIT',
    },
    invalidation_level: 96,
    stop_loss: {
      type: 'ATR',
      price: 96,
      rationale: 'test stop',
    },
    take_profit_levels: [
      {
        price: 105,
        size_pct: 0.6,
        rationale: 'tp1',
      },
    ],
    trailing_rule: {
      type: 'EMA',
      params: { ema_fast: 10, ema_slow: 30 },
    },
    position_advice: {
      position_pct: 5,
      leverage_cap: 1,
      risk_bucket_applied: 'BASE',
      rationale: 'admin api test sizing',
    },
    cost_model: {
      fee_bps: 1.2,
      spread_bps: 1.1,
      slippage_bps: 1.4,
    },
    expected_metrics: {
      expected_R: 1.24,
      hit_rate_est: 0.56,
      sample_size: 18,
    },
    explain_bullets: ['趋势延续伴随成交量放大。'],
    execution_checklist: ['确认数据新鲜度'],
    tags: ['admin-test'],
    status: 'NEW',
    news_context: {
      symbol,
      headline_count: 3,
      tone: 'POSITIVE',
      top_headlines: ['Positive guidance', 'Analyst upgrade'],
      updated_at: now,
      source: 'Finnhub',
      factor_score: 0.62,
      factor_tags: ['earnings', 'momentum'],
      analysis_provider: 'gemini',
    },
    payload: {
      kind: 'STOCK_SWING',
      data: {
        horizon: 'MEDIUM',
        catalysts: ['earnings_revision'],
      },
    },
    score: 84,
    payload_version: 'signal-contract.v1',
  };
}

function cleanupAdminData(email: string) {
  void email;
}

async function seedAuthUser(email: string, name: string) {
  const result = await signupAuthUser({
    email,
    password: 'StrongPass123',
    name,
    tradeMode: 'active',
    broker: 'Other',
  });
  expect(result.ok).toBe(true);
}

describe('admin data api', () => {
  const email = 'admin-data-api@example.com';

  beforeEach(() => {
    _resetAdminCachesForTesting();
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_DATA_PG_SCHEMA', 'novaquant_data');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://supabase-test-host/db');
  });

  afterEach(() => {
    process.env.NOVA_ADMIN_EMAILS = '';
    cleanupAdminData(email);
    vi.unstubAllEnvs();
  });

  it('rejects admin data access without an admin session', async () => {
    const res = await callHandler(handleAdminOverview, {});
    expect(res.statusCode).toBe(401);
    expect((res.body as { error?: string }).error).toBe('ADMIN_UNAUTHORIZED');
  });

  it('returns real user, alpha, signal and system snapshots for authorized admins', async () => {
    process.env.NOVA_ADMIN_EMAILS = email;
    await seedAuthUser(email, 'Admin Data Tester');

    const login = await callHandler(handleAdminLogin, {
      body: {
        email,
        password: 'StrongPass123',
      },
    });
    expect(login.statusCode).toBe(200);

    const cookie = login.headers['Set-Cookie'];
    expect(typeof cookie).toBe('string');

    const repo = getRuntimeRepo();
    const user = await pgGetUserByEmail(email);
    expect(user).toBeTruthy();
    const userId = user?.user_id as string;
    const now = Date.now();

    await pgUpsertUserState(
      userId,
      {
        assetClass: 'US_STOCK',
        market: 'US',
        uiMode: 'standard',
        riskProfileKey: 'balanced',
        watchlist: ['AAPL', 'MSFT'],
        holdings: [{ symbol: 'AAPL', weight: 0.25 }],
        executions: [],
        disciplineLog: {
          checkins: ['1'],
          boundary_kept: ['1'],
          weekly_reviews: ['1'],
        },
      },
      now,
    );

    repo.upsertUserRiskProfile({
      user_id: userId,
      profile_key: 'balanced',
      max_loss_per_trade: 0.02,
      max_daily_loss: 0.04,
      max_drawdown: 0.12,
      exposure_cap: 0.8,
      leverage_cap: 1,
      updated_at_ms: now,
    });

    repo.upsertNotificationEvent({
      id: 'admin-data-note-1',
      user_id: userId,
      market: 'US',
      asset_class: 'US_STOCK',
      category: 'RHYTHM',
      trigger_type: 'daily_digest',
      fingerprint: 'admin-data-note-1',
      title: 'Daily digest',
      body: 'Latest signal ready',
      tone: 'neutral',
      status: 'ACTIVE',
      action_target: null,
      reason_json: '{}',
      created_at_ms: now - 10_000,
      updated_at_ms: now - 10_000,
    });

    repo.upsertSignal(buildSignal('admin-data-signal-1'));

    repo.upsertExecution({
      execution_id: 'admin-data-execution-1',
      signal_id: 'admin-data-signal-1',
      user_id: userId,
      mode: 'PAPER',
      action: 'EXECUTE',
      market: 'US',
      symbol: 'AAPL',
      size_pct: 5,
      pnl_pct: 2.4,
      note: 'admin api execution',
      created_at_ms: now - 8_000,
      updated_at_ms: now - 8_000,
    });

    repo.upsertWorkflowRun({
      id: 'admin-data-workflow-1',
      workflow_key: 'free_data_flywheel',
      workflow_version: 'test.v1',
      trigger_type: 'manual',
      status: 'SUCCEEDED',
      trace_id: 'admin-data-trace-1',
      input_json: '{}',
      output_json: JSON.stringify({
        news: { refreshed_symbols: 3, rows_upserted: 9 },
        fundamentals: { rows_upserted: 1, errors: [] },
        options: { rows_upserted: 1, errors: [] },
      }),
      attempt_count: 1,
      started_at_ms: now - 12_000,
      updated_at_ms: now - 7_000,
      completed_at_ms: now - 7_000,
    });

    repo.upsertWorkflowRun({
      id: 'admin-data-workflow-2',
      workflow_key: 'alpha_discovery_loop',
      workflow_version: 'test.v1',
      trigger_type: 'scheduled',
      status: 'SUCCEEDED',
      trace_id: 'admin-data-trace-2',
      input_json: '{}',
      output_json: JSON.stringify({
        evaluation_summary: { accepted: 1, rejected: 2 },
        alpha_registry: { top_candidates: ['admin-data-alpha-1'] },
      }),
      attempt_count: 1,
      started_at_ms: now - 6_000,
      updated_at_ms: now - 4_000,
      completed_at_ms: now - 4_000,
    });

    repo.upsertNewsItem({
      id: 'admin-data-news-1',
      market: 'US',
      symbol: 'AAPL',
      headline: 'Apple guidance improves after product cycle reset',
      source: 'Finnhub',
      url: null,
      published_at_ms: now - 60_000,
      sentiment_label: 'POSITIVE',
      relevance_score: 0.91,
      payload_json: JSON.stringify({
        gemini_analysis: {
          batch: {
            provider: 'gemini',
            factor_tags: ['product_cycle', 'earnings_revision'],
            summary: 'Revenue revision tone remains constructive.',
            sentiment_score: 0.64,
            event_risk_score: 0.22,
          },
          headline: {
            sentiment_score: 0.69,
          },
        },
      }),
      updated_at_ms: now - 30_000,
    });

    repo.upsertFundamentalSnapshot({
      id: 'admin-data-fundamental-1',
      market: 'US',
      symbol: 'AAPL',
      source: 'FINNHUB',
      asof_date: '2026-03-22',
      payload_json: JSON.stringify({
        metrics: { peTTM: 28.4 },
      }),
      updated_at_ms: now - 25_000,
    });

    repo.upsertOptionChainSnapshot({
      id: 'admin-data-option-1',
      market: 'US',
      symbol: 'AAPL',
      expiration_date: '2026-04-17',
      snapshot_ts_ms: now - 20_000,
      source: 'CBOE_OPTIONS',
      payload_json: JSON.stringify({
        summary: {
          contracts_count: 3200,
          total_open_interest: 980000,
          total_volume: 145000,
        },
      }),
      updated_at_ms: now - 20_000,
    });

    repo.upsertNovaTaskRun({
      id: 'admin-data-nova-run-1',
      user_id: userId,
      thread_id: 'thread-admin-data-1',
      task_type: 'assistant_grounded_answer',
      route_alias: 'Marvix-Core',
      model_name: 'gemini-2.5-flash',
      endpoint: 'https://example.test',
      trace_id: 'admin-data-task-trace-1',
      prompt_version_id: 'prompt.v1',
      parent_run_id: null,
      input_json: '{}',
      context_json: '{}',
      output_json: '{"result":"ok"}',
      status: 'SUCCEEDED',
      error: null,
      created_at_ms: now - 15_000,
      updated_at_ms: now - 15_000,
    });

    const candidate = buildCandidate('admin-data-alpha-1');
    persistAlphaCandidate(repo, {
      candidate,
      status: 'SHADOW',
      acceptanceScore: 0.86,
    });

    repo.insertAlphaEvaluation({
      id: 'admin-data-eval-1',
      alpha_candidate_id: candidate.id,
      workflow_run_id: 'admin-data-workflow-2',
      backtest_run_id: null,
      evaluation_status: 'PASS',
      acceptance_score: 0.86,
      metrics_json: JSON.stringify({
        net_pnl: 12.4,
        sharpe: 1.72,
        sortino: 2.11,
        max_drawdown: 0.11,
        win_rate: 0.58,
        payoff_ratio: 1.46,
        turnover: 0.32,
        cost_sensitivity: {
          plus_25pct_cost: 10.9,
          plus_50pct_cost: 9.6,
          strict_fill: 8.8,
        },
        performance_by_subperiod: [],
        performance_by_regime: [],
        stability_score: 0.81,
        correlation_to_active: 0.18,
        complexity_score: 0.42,
        concentration_score: 0.24,
        backtest_proxy: {
          gross_return: 15.2,
          net_return: 12.4,
          note: 'proxy',
        },
        proxy_only: true,
      }),
      rejection_reasons_json: '[]',
      notes: 'passed',
      created_at_ms: now - 3_000,
    });

    repo.upsertAlphaShadowObservation({
      id: 'admin-data-shadow-1',
      alpha_candidate_id: candidate.id,
      workflow_run_id: 'admin-data-workflow-2',
      signal_id: 'admin-data-signal-1',
      market: 'US',
      symbol: 'AAPL',
      shadow_action: 'BOOST',
      alignment_score: 0.84,
      adjusted_confidence: 0.78,
      suggested_weight_multiplier: 1.12,
      realized_pnl_pct: 1.8,
      realized_source: 'paper',
      payload_json: '{}',
      created_at_ms: now - 2_000,
      updated_at_ms: now - 2_000,
    });

    const overview = await callHandler(handleAdminOverview, { cookie });
    const users = await callHandler(handleAdminUsers, { cookie });
    const alphas = await callHandler(handleAdminAlphas, { cookie });
    const signals = await callHandler(handleAdminSignals, { cookie });
    const system = await callHandler(handleAdminSystem, { cookie });

    expect(overview.statusCode).toBe(200);
    expect(users.statusCode).toBe(200);
    expect(alphas.statusCode).toBe(200);
    expect(signals.statusCode).toBe(200);
    expect(system.statusCode).toBe(200);

    expect(
      (overview.body as { data: { headline_metrics: { total_users: number } } }).data
        .headline_metrics.total_users,
    ).toBeGreaterThanOrEqual(1);
    expect((users.body as { data: { users: Array<{ email: string }> } }).data.users[0]?.email).toBe(
      email,
    );
    expect(
      (alphas.body as { data: { inventory: Record<string, number> } }).data.inventory.SHADOW,
    ).toBe(1);
    expect(
      (signals.body as { data: { summary: { active_signals: number } } }).data.summary
        .active_signals,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (
        system.body as {
          data: { data_summary: { option_chain_count: number; fundamentals_count: number } };
        }
      ).data.data_summary.option_chain_count,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (
        system.body as {
          data: { data_summary: { option_chain_count: number; fundamentals_count: number } };
        }
      ).data.data_summary.fundamentals_count,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (
        system.body as {
          data: { throughput_controls: { alpha_discovery: { max_candidates_per_cycle: number } } };
        }
      ).data.throughput_controls.alpha_discovery.max_candidates_per_cycle,
    ).toBeGreaterThan(0);
    expect(
      (
        system.body as {
          data: { throughput_controls: { news_pipeline: { ttl_minutes: number } } };
        }
      ).data.throughput_controls.news_pipeline.ttl_minutes,
    ).toBeGreaterThan(0);
  }, 15_000);

  it('headline endpoint returns partial data with headline metrics', async () => {
    process.env.NOVA_ADMIN_EMAILS = email;
    await seedAuthUser(email, 'Headline Tester');

    const login = await callHandler(handleAdminLogin, {
      body: { email, password: 'StrongPass123' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers['Set-Cookie'];
    expect(typeof cookie).toBe('string');

    const headline = await callHandler(handleAdminOverviewHeadline, { cookie });
    expect(headline.statusCode).toBe(200);

    const data = (headline.body as { data: Record<string, unknown> }).data;
    expect(data._partial).toBe(true);
    expect(data.headline_metrics).toBeDefined();
    expect(data.workflow_timeline).toBeDefined();
    expect(data.top_symbols).toBeDefined();
    expect(data.system_cards).toBeNull();
  });

  it('headline returns cached overview when full overview is in cache', async () => {
    process.env.NOVA_ADMIN_EMAILS = email;
    await seedAuthUser(email, 'Cache Tester');

    const login = await callHandler(handleAdminLogin, {
      body: { email, password: 'StrongPass123' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers['Set-Cookie'];

    // Load full overview to populate cache
    const overview = await callHandler(handleAdminOverview, { cookie });
    expect(overview.statusCode).toBe(200);

    // Headline should return full cached data (no _partial flag)
    const headline = await callHandler(handleAdminOverviewHeadline, { cookie });
    expect(headline.statusCode).toBe(200);
    const data = (headline.body as { data: Record<string, unknown> }).data;
    expect(data._partial).toBeUndefined();
    expect(data.system_cards).toBeDefined();
  }, 15_000);

  it('overview cache returns same data within fresh TTL', async () => {
    process.env.NOVA_ADMIN_EMAILS = email;
    await seedAuthUser(email, 'SWR Tester');

    const login = await callHandler(handleAdminLogin, {
      body: { email, password: 'StrongPass123' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers['Set-Cookie'];

    // First call populates cache
    const first = await callHandler(handleAdminOverview, { cookie });
    expect(first.statusCode).toBe(200);
    const firstTs = (first.body as { data: { generated_at: string } }).data.generated_at;

    // Second call within fresh TTL should return cached data (same generated_at)
    const second = await callHandler(handleAdminOverview, { cookie });
    expect(second.statusCode).toBe(200);
    const secondTs = (second.body as { data: { generated_at: string } }).data.generated_at;
    expect(secondTs).toBe(firstTs);
  }, 15_000);
});

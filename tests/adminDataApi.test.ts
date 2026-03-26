import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { handleAdminLogin, handleAuthSignup } from '../src/server/api/authHandlers.js';
import {
  handleAdminAlphas,
  handleAdminOverview,
  handleAdminSignals,
  handleAdminSystem,
  handleAdminUsers,
} from '../src/server/api/adminHandlers.js';
import {
  persistAlphaCandidate,
  type AutonomousAlphaCandidate,
} from '../src/server/alpha_registry/index.js';
import type { SignalContract } from '../src/server/types.js';

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
  const db = getDb();
  ensureSchema(db);
  const row = db.prepare('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1').get(email) as
    | { user_id?: string }
    | undefined;
  const userId = row?.user_id || null;

  db.prepare("DELETE FROM alpha_shadow_observations WHERE id LIKE 'admin-data-%'").run();
  db.prepare("DELETE FROM alpha_lifecycle_events WHERE id LIKE 'admin-data-%'").run();
  db.prepare("DELETE FROM alpha_evaluations WHERE id LIKE 'admin-data-%'").run();
  db.prepare("DELETE FROM alpha_candidates WHERE id LIKE 'admin-data-%'").run();
  db.prepare("DELETE FROM workflow_runs WHERE id LIKE 'admin-data-%'").run();
  db.prepare("DELETE FROM nova_task_runs WHERE id LIKE 'admin-data-%'").run();
  db.prepare("DELETE FROM news_items WHERE id LIKE 'admin-data-%'").run();
  db.prepare("DELETE FROM fundamental_snapshots WHERE id LIKE 'admin-data-%'").run();
  db.prepare("DELETE FROM option_chain_snapshots WHERE id LIKE 'admin-data-%'").run();
  db.prepare("DELETE FROM executions WHERE execution_id LIKE 'admin-data-%'").run();
  db.prepare("DELETE FROM signals WHERE signal_id LIKE 'admin-data-%'").run();

  if (userId) {
    db.prepare('DELETE FROM notification_events WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_risk_profiles WHERE user_id = ?').run(userId);
    db.prepare(
      'DELETE FROM manual_referrals WHERE inviter_user_id = ? OR referred_user_id = ?',
    ).run(userId, userId);
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM auth_user_roles WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM auth_user_state_sync WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM manual_user_state WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM auth_users WHERE user_id = ?').run(userId);
  }
}

describe('admin data api', () => {
  const email = 'admin-data-api@example.com';

  beforeEach(() => {
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', '');
    vi.stubEnv('NOVA_DATA_PG_SCHEMA', '');
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
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

    const signup = await callHandler(handleAuthSignup, {
      body: {
        email,
        password: 'StrongPass123',
        name: 'Admin Data Tester',
        tradeMode: 'active',
        broker: 'Other',
      },
    });
    expect(signup.statusCode).toBe(200);

    const login = await callHandler(handleAdminLogin, {
      body: {
        email,
        password: 'StrongPass123',
      },
    });
    expect(login.statusCode).toBe(200);

    const cookie = login.headers['Set-Cookie'];
    expect(typeof cookie).toBe('string');

    const db = getDb();
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const userRow = db
      .prepare('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1')
      .get(email) as { user_id: string };
    const userId = userRow.user_id;
    const now = Date.now();

    db.prepare(
      `
        INSERT OR REPLACE INTO auth_user_state_sync(
          user_id, asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json, updated_at_ms
        ) VALUES(
          @user_id, 'US_STOCK', 'US', 'standard', 'balanced', '["AAPL","MSFT"]', '[{"symbol":"AAPL","weight":0.25}]', '[]',
          '{"checkins":[1],"boundary_kept":[1],"weekly_reviews":[1]}', @updated_at_ms
        )
      `,
    ).run({ user_id: userId, updated_at_ms: now });

    db.prepare(
      `
        INSERT OR REPLACE INTO user_risk_profiles(
          user_id, profile_key, max_loss_per_trade, max_daily_loss, max_drawdown, exposure_cap, leverage_cap, updated_at_ms
        ) VALUES(
          @user_id, 'balanced', 0.02, 0.04, 0.12, 0.8, 1.0, @updated_at_ms
        )
      `,
    ).run({ user_id: userId, updated_at_ms: now });

    db.prepare(
      `
        INSERT OR REPLACE INTO notification_events(
          id, user_id, market, asset_class, category, trigger_type, fingerprint, title, body, tone, status,
          action_target, reason_json, created_at_ms, updated_at_ms
        ) VALUES(
          'admin-data-note-1', @user_id, 'US', 'US_STOCK', 'RHYTHM', 'daily_digest', 'admin-data-note-1',
          'Daily digest', 'Latest signal ready', 'neutral', 'ACTIVE', null, '{}', @created_at_ms, @updated_at_ms
        )
      `,
    ).run({ user_id: userId, created_at_ms: now - 10_000, updated_at_ms: now - 10_000 });

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
});

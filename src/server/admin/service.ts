import { getConfig } from '../config.js';
import { getDb } from '../db/database.js';
import { qualifyBusinessTable, queryRowsSync } from '../db/postgresSyncBridge.js';
import { getRuntimeRepo } from '../db/runtimeRepository.js';
import { decodeSignalContract } from '../quant/service.js';
import { readAlphaDiscoveryConfig } from '../alpha_discovery/index.js';
import { readNewsPipelineConfig } from '../news/provider.js';
import { buildAdminResearchOpsSnapshot } from './liveOps.js';
import { buildAdminAlphaSnapshot as buildLiveAdminAlphaSnapshot } from './liveAlpha.js';

type JsonObject = Record<string, unknown>;

type AdminUserRow = {
  user_id: string;
  email: string;
  name: string;
  trade_mode: string;
  broker: string;
  locale: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  last_login_at_ms: number | null;
  market: string | null;
  asset_class: string | null;
  ui_mode: string | null;
  risk_profile_key: string | null;
  watchlist_json: string | null;
  holdings_json: string | null;
  active_session_count: number | null;
  decision_count: number | null;
  latest_decision_at_ms: number | null;
  execution_count: number | null;
  paper_execution_count: number | null;
  live_execution_count: number | null;
  avg_execution_pnl_pct: number | null;
  latest_execution_at_ms: number | null;
  notification_count: number | null;
  latest_notification_at_ms: number | null;
  vip_days_balance: number | null;
  vip_days_redeemed_total: number | null;
  invite_code: string | null;
  referral_count: number | null;
  roles_csv: string | null;
};

function getRepo() {
  return getRuntimeRepo();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') {
    return value as T;
  }
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function toIso(ms: number | null | undefined) {
  return Number.isFinite(ms) ? new Date(Number(ms)).toISOString() : null;
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function countBy<T>(rows: T[], keyFn: (row: T) => string | null | undefined) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(keyFn(row) || '').trim();
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function queryAdminUsers(): AdminUserRow[] {
  if (getConfig().database.driver === 'postgres') {
    return queryRowsSync<AdminUserRow>(
      `
        SELECT
          u.user_id,
          u.email,
          u.name,
          u.trade_mode,
          u.broker,
          u.locale,
          u.created_at_ms,
          u.updated_at_ms,
          u.last_login_at_ms,
          state.market,
          state.asset_class,
          state.ui_mode,
          COALESCE(risk.profile_key, state.risk_profile_key) AS risk_profile_key,
          state.watchlist_json,
          state.holdings_json,
          sessions.active_session_count,
          decisions.decision_count,
          decisions.latest_decision_at_ms,
          execs.execution_count,
          execs.paper_execution_count,
          execs.live_execution_count,
          execs.avg_execution_pnl_pct,
          execs.latest_execution_at_ms,
          notifications.notification_count,
          notifications.latest_notification_at_ms,
          manual.vip_days_balance,
          manual.vip_days_redeemed_total,
          manual.invite_code,
          referrals.referral_count,
          roles.roles_csv
        FROM auth_users u
        LEFT JOIN auth_user_state_sync state ON state.user_id = u.user_id
        LEFT JOIN ${qualifyBusinessTable('user_risk_profiles')} risk ON risk.user_id = u.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS active_session_count
          FROM auth_sessions
          WHERE revoked_at_ms IS NULL AND expires_at_ms > $1
          GROUP BY user_id
        ) sessions ON sessions.user_id = u.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS decision_count, MAX(updated_at_ms) AS latest_decision_at_ms
          FROM ${qualifyBusinessTable('decision_snapshots')}
          GROUP BY user_id
        ) decisions ON decisions.user_id = u.user_id
        LEFT JOIN (
          SELECT
            user_id,
            COUNT(*) AS execution_count,
            SUM(CASE WHEN mode = 'PAPER' THEN 1 ELSE 0 END) AS paper_execution_count,
            SUM(CASE WHEN mode = 'LIVE' THEN 1 ELSE 0 END) AS live_execution_count,
            AVG(CASE WHEN pnl_pct IS NOT NULL THEN pnl_pct END) AS avg_execution_pnl_pct,
            MAX(updated_at_ms) AS latest_execution_at_ms
          FROM ${qualifyBusinessTable('executions')}
          GROUP BY user_id
        ) execs ON execs.user_id = u.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS notification_count, MAX(updated_at_ms) AS latest_notification_at_ms
          FROM ${qualifyBusinessTable('notification_events')}
          GROUP BY user_id
        ) notifications ON notifications.user_id = u.user_id
        LEFT JOIN ${qualifyBusinessTable('manual_user_state')} manual ON manual.user_id = u.user_id
        LEFT JOIN (
          SELECT inviter_user_id AS user_id, COUNT(*) AS referral_count
          FROM ${qualifyBusinessTable('manual_referrals')}
          GROUP BY inviter_user_id
        ) referrals ON referrals.user_id = u.user_id
        LEFT JOIN (
          SELECT user_id, STRING_AGG(role, ',' ORDER BY granted_at_ms DESC) AS roles_csv
          FROM auth_user_roles
          GROUP BY user_id
        ) roles ON roles.user_id = u.user_id
        ORDER BY COALESCE(u.last_login_at_ms, u.created_at_ms) DESC, u.created_at_ms DESC
      `,
      [Date.now()],
    );
  }
  const db = getDb();
  const now = Date.now();
  return db
    .prepare(
      `
        SELECT
          u.user_id,
          u.email,
          u.name,
          u.trade_mode,
          u.broker,
          u.locale,
          u.created_at_ms,
          u.updated_at_ms,
          u.last_login_at_ms,
          state.market,
          state.asset_class,
          state.ui_mode,
          COALESCE(risk.profile_key, state.risk_profile_key) AS risk_profile_key,
          state.watchlist_json,
          state.holdings_json,
          sessions.active_session_count,
          decisions.decision_count,
          decisions.latest_decision_at_ms,
          execs.execution_count,
          execs.paper_execution_count,
          execs.live_execution_count,
          execs.avg_execution_pnl_pct,
          execs.latest_execution_at_ms,
          notifications.notification_count,
          notifications.latest_notification_at_ms,
          manual.vip_days_balance,
          manual.vip_days_redeemed_total,
          manual.invite_code,
          referrals.referral_count,
          roles.roles_csv
        FROM auth_users u
        LEFT JOIN auth_user_state_sync state ON state.user_id = u.user_id
        LEFT JOIN user_risk_profiles risk ON risk.user_id = u.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS active_session_count
          FROM auth_sessions
          WHERE revoked_at_ms IS NULL AND expires_at_ms > @now_ms
          GROUP BY user_id
        ) sessions ON sessions.user_id = u.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS decision_count, MAX(updated_at_ms) AS latest_decision_at_ms
          FROM decision_snapshots
          GROUP BY user_id
        ) decisions ON decisions.user_id = u.user_id
        LEFT JOIN (
          SELECT
            user_id,
            COUNT(*) AS execution_count,
            SUM(CASE WHEN mode = 'PAPER' THEN 1 ELSE 0 END) AS paper_execution_count,
            SUM(CASE WHEN mode = 'LIVE' THEN 1 ELSE 0 END) AS live_execution_count,
            AVG(CASE WHEN pnl_pct IS NOT NULL THEN pnl_pct END) AS avg_execution_pnl_pct,
            MAX(updated_at_ms) AS latest_execution_at_ms
          FROM executions
          GROUP BY user_id
        ) execs ON execs.user_id = u.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS notification_count, MAX(updated_at_ms) AS latest_notification_at_ms
          FROM notification_events
          GROUP BY user_id
        ) notifications ON notifications.user_id = u.user_id
        LEFT JOIN manual_user_state manual ON manual.user_id = u.user_id
        LEFT JOIN (
          SELECT inviter_user_id AS user_id, COUNT(*) AS referral_count
          FROM manual_referrals
          GROUP BY inviter_user_id
        ) referrals ON referrals.user_id = u.user_id
        LEFT JOIN (
          SELECT user_id, GROUP_CONCAT(role, ',') AS roles_csv
          FROM auth_user_roles
          GROUP BY user_id
        ) roles ON roles.user_id = u.user_id
        ORDER BY COALESCE(u.last_login_at_ms, u.created_at_ms) DESC, u.created_at_ms DESC
      `,
    )
    .all({ now_ms: now }) as AdminUserRow[];
}

function mapAdminUsers(rows: AdminUserRow[]) {
  const now = Date.now();
  const sevenDaysAgo = now - 1000 * 60 * 60 * 24 * 7;
  const thirtyDaysAgo = now - 1000 * 60 * 60 * 24 * 30;

  const users = rows.map((row) => {
    const watchlist = parseJson<string[]>(row.watchlist_json, []);
    const holdings = parseJson<unknown[]>(row.holdings_json, []);
    const roles = String(row.roles_csv || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const lastSeenMs =
      row.last_login_at_ms ??
      row.latest_execution_at_ms ??
      row.latest_notification_at_ms ??
      row.created_at_ms;
    const status = roles.includes('ADMIN')
      ? '管理员'
      : row.last_login_at_ms && row.last_login_at_ms >= sevenDaysAgo
        ? '近 7 天活跃'
        : row.execution_count
          ? '已有使用记录'
          : '低活跃';

    return {
      user_id: row.user_id,
      email: row.email,
      name: row.name,
      trade_mode: row.trade_mode,
      broker: row.broker,
      locale: row.locale || 'zh-CN',
      created_at: toIso(row.created_at_ms),
      updated_at: toIso(row.updated_at_ms),
      last_login_at: toIso(row.last_login_at_ms),
      last_seen_at: toIso(lastSeenMs),
      roles,
      market: row.market || 'US',
      asset_class: row.asset_class || 'US_STOCK',
      ui_mode: row.ui_mode || 'standard',
      risk_profile_key: row.risk_profile_key || 'balanced',
      watchlist_count: watchlist.length,
      holding_count: holdings.length,
      active_session_count: Number(row.active_session_count || 0),
      decision_count: Number(row.decision_count || 0),
      execution_count: Number(row.execution_count || 0),
      paper_execution_count: Number(row.paper_execution_count || 0),
      live_execution_count: Number(row.live_execution_count || 0),
      avg_execution_pnl_pct:
        row.avg_execution_pnl_pct === null ? null : round(Number(row.avg_execution_pnl_pct), 4),
      latest_decision_at: toIso(row.latest_decision_at_ms),
      latest_execution_at: toIso(row.latest_execution_at_ms),
      notification_count: Number(row.notification_count || 0),
      latest_notification_at: toIso(row.latest_notification_at_ms),
      vip_days_balance: Number(row.vip_days_balance || 0),
      vip_days_redeemed_total: Number(row.vip_days_redeemed_total || 0),
      invite_code: row.invite_code,
      referral_count: Number(row.referral_count || 0),
      status,
    };
  });

  const signupTrend = Array.from({ length: 8 }).map((_, index) => {
    const start = new Date(now - (7 - index) * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const count = users.filter((row) => {
      const created = Date.parse(String(row.created_at || ''));
      return Number.isFinite(created) && created >= start.getTime() && created < end.getTime();
    }).length;
    return {
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      value: count,
    };
  });

  return {
    summary: {
      total_users: users.length,
      active_last_7d: users.filter(
        (row) => row.last_login_at && Date.parse(row.last_login_at) >= sevenDaysAgo,
      ).length,
      active_last_30d: users.filter(
        (row) => row.last_login_at && Date.parse(row.last_login_at) >= thirtyDaysAgo,
      ).length,
      admin_count: users.filter((row) => row.roles.includes('ADMIN')).length,
      total_watchlists: users.reduce((sum, row) => sum + row.watchlist_count, 0),
      total_notifications: users.reduce((sum, row) => sum + row.notification_count, 0),
      total_referrals: users.reduce((sum, row) => sum + row.referral_count, 0),
    },
    trade_mode_mix: countBy(users, (row) => row.trade_mode),
    risk_profile_mix: countBy(users, (row) => row.risk_profile_key),
    status_mix: countBy(users, (row) => row.status),
    signup_trend: signupTrend,
    users,
  };
}

export function buildAdminUsersSnapshot() {
  const rows = queryAdminUsers();
  return {
    generated_at: new Date().toISOString(),
    ...mapAdminUsers(rows),
  };
}

export async function buildAdminAlphaSnapshot(args?: { timeZone?: string; localDate?: string }) {
  return await buildLiveAdminAlphaSnapshot(args);
}

export function buildAdminSignalsSnapshot() {
  const repo = getRepo();
  const signalRows = repo.listSignals({ status: 'ALL', limit: 160 });
  const executionRows = repo.listExecutions({ limit: 240 });
  const signals = signalRows
    .map((row) => {
      const signal = decodeSignalContract(row);
      const executions = executionRows.filter((execution) => execution.signal_id === row.signal_id);
      return {
        signal_id: row.signal_id,
        market: row.market,
        asset_class: row.asset_class,
        symbol: row.symbol,
        strategy_id: row.strategy_id,
        direction: row.direction,
        status: row.status,
        score: row.score,
        confidence: row.confidence,
        created_at: toIso(row.created_at_ms),
        explain: signal?.explain_bullets?.[0] || null,
        factor_tags: signal?.news_context?.factor_tags || [],
        tone: signal?.news_context?.tone || null,
        execution_count: executions.length,
        live_execution_count: executions.filter((item) => item.mode === 'LIVE').length,
        paper_execution_count: executions.filter((item) => item.mode === 'PAPER').length,
      };
    })
    .slice(0, 40);

  const activeSignals = signals.filter((row) => row.status === 'NEW' || row.status === 'TRIGGERED');
  const topSymbols = countBy(activeSignals, (row) => row.symbol).slice(0, 8);
  const directionMix = countBy(activeSignals, (row) => row.direction);
  const marketMix = countBy(activeSignals, (row) => row.market);

  const executionSummary = {
    total: executionRows.length,
    paper: executionRows.filter((row) => row.mode === 'PAPER').length,
    live: executionRows.filter((row) => row.mode === 'LIVE').length,
    avg_pnl_pct:
      executionRows.filter((row) => row.pnl_pct !== undefined && row.pnl_pct !== null).length > 0
        ? round(
            executionRows
              .filter((row) => row.pnl_pct !== undefined && row.pnl_pct !== null)
              .reduce((sum, row) => sum + Number(row.pnl_pct || 0), 0) /
              executionRows.filter((row) => row.pnl_pct !== undefined && row.pnl_pct !== null)
                .length,
            4,
          )
        : null,
  };

  return {
    generated_at: new Date().toISOString(),
    summary: {
      total_signals: signalRows.length,
      active_signals: activeSignals.length,
      avg_confidence: activeSignals.length
        ? round(
            activeSignals.reduce((sum, row) => sum + Number(row.confidence || 0), 0) /
              activeSignals.length,
            4,
          )
        : 0,
      top_symbols: topSymbols,
      direction_mix: directionMix,
      market_mix: marketMix,
    },
    execution_summary: executionSummary,
    recent_executions: executionRows.slice(0, 20).map((row) => ({
      execution_id: row.execution_id,
      user_id: row.user_id,
      signal_id: row.signal_id,
      mode: row.mode,
      action: row.action,
      market: row.market,
      symbol: row.symbol,
      size_pct: row.size_pct ?? null,
      pnl_pct: row.pnl_pct ?? null,
      updated_at: toIso(row.updated_at_ms),
    })),
    signals,
  };
}

export async function buildAdminSystemSnapshot() {
  const config = getConfig();
  const ops = await buildAdminResearchOpsSnapshot();
  const discoveryConfig = readAlphaDiscoveryConfig();
  const newsPipeline = readNewsPipelineConfig();
  const diagnostics: Array<{ severity: 'INFO' | 'WARN'; title: string; detail: string }> = [];
  const factorCoveragePct = Number(ops.data_summary.news_factor_coverage_pct || 0);
  const newsItems72h = Number(ops.data_summary.news_items_72h || 0);

  if (ops.data_source.mode === 'local-fallback') {
    diagnostics.push({
      severity: 'WARN',
      title: 'EC2 live 数据暂时不可达，当前已切回本地库',
      detail: `已尝试连接 ${ops.data_source.upstream_base_url || 'configured upstream'}，但拉取失败。当前页面展示的是本地回退数据。`,
    });
  }
  if (newsItems72h >= 6 && ops.recent_news_factors.length === 0) {
    diagnostics.push({
      severity: 'WARN',
      title: '新闻有流入，但结构化因子产出偏低',
      detail: `近 72 小时新闻 ${newsItems72h} 条，但结构化因子为 0。当前已启用 heuristic 回退，仍建议继续观察 Gemini 与 NewsAPI 覆盖。`,
    });
  }
  if (discoveryConfig.intervalHours >= 8 || discoveryConfig.searchBudget <= 10) {
    diagnostics.push({
      severity: 'WARN',
      title: 'Alpha 发现节奏偏保守',
      detail: `当前 discovery 间隔 ${discoveryConfig.intervalHours} 小时，搜索预算 ${discoveryConfig.searchBudget}，更适合稳态筛选而不是高产探索。`,
    });
  }
  if (factorCoveragePct >= 25) {
    diagnostics.push({
      severity: 'INFO',
      title: '新闻因子链已经开始沉淀',
      detail: `近 72 小时结构化覆盖率 ${factorCoveragePct}% ，说明新闻到因子的主链正在工作。`,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    data_source: ops.data_source,
    runtime: ops.runtime,
    workflow_summary: ops.workflow_summary,
    ai_summary: ops.ai_summary,
    data_summary: ops.data_summary,
    throughput_controls: {
      service_envelope: {
        target_active_clients: config.serviceEnvelope?.targetActiveClients || 50,
        target_daily_symbols: config.serviceEnvelope?.targetDailySymbols || 50,
        us_symbol_universe: config.markets.US.symbols.length,
        crypto_symbol_universe: config.markets.CRYPTO.symbols.length,
        action_cards: {
          conservative: Number(
            process.env.NOVA_ACTION_CARD_LIMIT_CONSERVATIVE ||
              config.serviceEnvelope?.targetDailyActionCards?.conservative ||
              10,
          ),
          balanced: Number(
            process.env.NOVA_ACTION_CARD_LIMIT_BALANCED ||
              config.serviceEnvelope?.targetDailyActionCards?.balanced ||
              12,
          ),
          aggressive: Number(
            process.env.NOVA_ACTION_CARD_LIMIT_AGGRESSIVE ||
              config.serviceEnvelope?.targetDailyActionCards?.aggressive ||
              15,
          ),
        },
      },
      alpha_discovery: {
        interval_hours: discoveryConfig.intervalHours,
        max_candidates_per_cycle: discoveryConfig.maxCandidatesPerCycle,
        search_budget: discoveryConfig.searchBudget,
        min_acceptance_score: discoveryConfig.minAcceptanceScore,
        family_coverage_targets: discoveryConfig.familyCoverageTargets,
        shadow_admission_min_acceptance_score:
          discoveryConfig.shadowAdmissionThresholds.minAcceptanceScore,
        shadow_admission_max_drawdown: discoveryConfig.shadowAdmissionThresholds.maxDrawdown,
        max_correlation_to_active: discoveryConfig.maxCorrelationToActive,
      },
      news_pipeline: {
        ttl_minutes: newsPipeline.ttl_minutes,
        refresh_concurrency: newsPipeline.refresh_concurrency,
        min_rows_for_expansion: newsPipeline.min_rows_for_expansion,
        google_limit: newsPipeline.google_limit,
        heuristic_factor_fallback: newsPipeline.heuristic_factor_fallback,
        gemini_factor_concurrency: Math.max(1, Number(process.env.GEMINI_NEWS_CONCURRENCY || 3)),
        gemini_request_gap_ms: Math.max(
          0,
          Number(process.env.GEMINI_NEWS_MIN_REQUEST_GAP_MS || 350),
        ),
      },
    },
    throughput_recent: ops.throughput_recent,
    diagnostics,
    workflows: ops.workflows,
    recent_news_factors: ops.recent_news_factors,
    reference_data: ops.reference_data,
    active_signals: ops.active_signals,
    recent_nova_runs: ops.recent_nova_runs,
    daily_ops: ops.daily_ops,
  };
}

export async function buildAdminOverviewSnapshot() {
  const repo = getRepo();
  const [users, alpha, signals, system, workflows] = await Promise.all([
    Promise.resolve(buildAdminUsersSnapshot()),
    buildAdminAlphaSnapshot(),
    Promise.resolve(buildAdminSignalsSnapshot()),
    buildAdminSystemSnapshot(),
    Promise.resolve(repo.listWorkflowRuns({ limit: 16 })),
  ]);

  return {
    generated_at: new Date().toISOString(),
    headline_metrics: {
      total_users: users.summary.total_users,
      active_users_7d: users.summary.active_last_7d,
      active_signals: signals.summary.active_signals,
      shadow_candidates: Number(alpha.inventory.SHADOW || 0),
      canary_candidates: Number(alpha.inventory.CANARY || 0),
      recent_news_factors: system.data_summary.news_factor_count,
      ai_runs: system.ai_summary.total,
    },
    user_mix: users.trade_mode_mix,
    alpha_lifecycle: Object.entries(alpha.inventory).map(([label, value]) => ({
      label,
      value: Number(value || 0),
    })),
    signal_direction_mix: signals.summary.direction_mix,
    top_symbols: signals.summary.top_symbols,
    workflow_timeline: workflows.slice(0, 10).map((row) => ({
      workflow_key: row.workflow_key,
      status: row.status,
      trigger_type: row.trigger_type,
      updated_at: toIso(row.updated_at_ms),
    })),
    data_story: [
      {
        label: '前端用户层',
        value: `${users.summary.total_users} 个账户`,
        detail: `近 7 天活跃 ${users.summary.active_last_7d} 个，管理员 ${users.summary.admin_count} 个。`,
      },
      {
        label: '策略与 Alpha 层',
        value: `${Number(alpha.inventory.SHADOW || 0)} 个 Shadow 候选`,
        detail: `当前 CANARY ${Number(alpha.inventory.CANARY || 0)} 个，PROD ${Number(alpha.inventory.PROD || 0)} 个。`,
      },
      {
        label: '因子与 AI 层',
        value: `${system.data_summary.news_factor_count} 条新闻因子`,
        detail: `最近 AI 运行 ${system.ai_summary.total} 次，新闻源 ${system.data_summary.news_items_72h} 条，结构化覆盖 ${system.data_summary.news_factor_coverage_pct}%。`,
      },
    ],
    guardrails: [
      { label: '先 Shadow 再上线', value: 100 },
      { label: '实盘自动直推关闭', value: 100 },
      { label: '数据因子覆盖', value: Math.min(100, system.data_summary.news_factor_count * 8) },
      {
        label: 'Alpha 发现活跃度',
        value: Math.min(
          100,
          Number(alpha.inventory.DRAFT || 0) * 8 + Number(alpha.inventory.SHADOW || 0) * 12,
        ),
      },
      { label: '用户使用活跃度', value: Math.min(100, users.summary.active_last_30d * 10) },
    ],
    system_cards: {
      runtime_provider: system.runtime.provider,
      runtime_mode: system.runtime.mode,
      news_factor_count: system.data_summary.news_factor_count,
      option_chain_count: system.data_summary.option_chain_count,
    },
  };
}

export async function buildAdminTodayOpsSnapshot(args?: { timeZone?: string; localDate?: string }) {
  return await buildAdminResearchOpsSnapshot(args);
}

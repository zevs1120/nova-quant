import { getConfig } from '../config.js';
import { qualifyBusinessTable, queryRowsSync } from '../db/postgresSyncBridge.js';
import { getRuntimeRepo } from '../db/runtimeRepository.js';
import { decodeSignalContract } from '../quant/service.js';
import { readAlphaDiscoveryConfig } from '../alpha_discovery/index.js';
import { readNewsPipelineConfig } from '../news/provider.js';
import { buildAdminResearchOpsSnapshot } from './liveOps.js';
import { buildAdminAlphaSnapshot as buildLiveAdminAlphaSnapshot } from './liveAlpha.js';
import { logWarn } from '../utils/log.js';

// ── Qlib Bridge admin helpers ──────────────────────────────

type QlibBridgeState = 'disabled' | 'offline' | 'data_not_ready' | 'online';

interface QlibBridgeAdminStatus {
  enabled: boolean;
  healthy: boolean;
  state: QlibBridgeState;
  version: string | null;
  qlib_ready: boolean;
  uptime_seconds: number | null;
  provider_uri: string | null;
  region: string | null;
  max_universe_size: number | null;
  available_factor_sets: Array<{ id: string; factor_count: number; description: string }>;
  available_models: Array<{ name: string; file: string | null; size_kb: number }>;
}

const QLIB_STATUS_DISABLED: QlibBridgeAdminStatus = {
  enabled: false,
  healthy: false,
  state: 'disabled',
  version: null,
  qlib_ready: false,
  uptime_seconds: null,
  provider_uri: null,
  region: null,
  max_universe_size: null,
  available_factor_sets: [],
  available_models: [],
};

const QLIB_ADMIN_FETCH_TIMEOUT_MS = 4000;
const QLIB_HEADLINE_FETCH_TIMEOUT_MS = 800;
const QLIB_HEADLINE_CACHE_TTL_MS = 15_000;

let _qlibHeadlineCache: { data: QlibBridgeAdminStatus; fetchedAt: number } | null = null;

function deriveQlibBridgeState(args: {
  enabled: boolean;
  healthy: boolean;
  qlibReady: boolean;
}): QlibBridgeState {
  if (!args.enabled) return 'disabled';
  if (!args.healthy) return 'offline';
  if (!args.qlibReady) return 'data_not_ready';
  return 'online';
}

async function safeFetchQlibBridgeJson<T>(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, { method: 'GET', signal: controller.signal });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchQlibBridgeStatusSummary(args?: {
  includeInventory?: boolean;
  timeoutMs?: number;
}): Promise<QlibBridgeAdminStatus> {
  const config = getConfig();
  const bridge = config.qlibBridge;
  if (!bridge?.enabled) return { ...QLIB_STATUS_DISABLED };

  const baseUrl = bridge.baseUrl;
  const includeInventory = args?.includeInventory ?? true;
  const timeoutMs = args?.timeoutMs ?? QLIB_ADMIN_FETCH_TIMEOUT_MS;
  try {
    const status = await safeFetchQlibBridgeJson<Record<string, unknown>>(
      baseUrl,
      '/api/status',
      timeoutMs,
      {},
    );
    const healthy = status.status === 'running';
    const qlibReady = Boolean(status.qlib_ready);
    const summary: QlibBridgeAdminStatus = {
      enabled: true,
      healthy,
      state: deriveQlibBridgeState({ enabled: true, healthy, qlibReady }),
      version: (status.version as string) || null,
      qlib_ready: qlibReady,
      uptime_seconds: typeof status.uptime_seconds === 'number' ? status.uptime_seconds : null,
      provider_uri: (status.provider_uri as string) || null,
      region: (status.region as string) || null,
      max_universe_size:
        typeof status.max_universe_size === 'number' ? status.max_universe_size : null,
      available_factor_sets: [],
      available_models: [],
    };

    if (!includeInventory || !healthy) return summary;

    const [factorSets, models] = await Promise.all([
      safeFetchQlibBridgeJson<Array<Record<string, unknown>>>(
        baseUrl,
        '/api/factors/sets',
        timeoutMs,
        [],
      ),
      safeFetchQlibBridgeJson<Array<Record<string, unknown>>>(
        baseUrl,
        '/api/models',
        timeoutMs,
        [],
      ),
    ]);

    return {
      ...summary,
      available_factor_sets: (factorSets || []).map((fs) => ({
        id: String(fs.id || ''),
        factor_count: Number(fs.factor_count || 0),
        description: String(fs.description || ''),
      })),
      available_models: (models || [])
        .filter((m) => m.name !== '(none)')
        .map((m) => ({
          name: String(m.name || ''),
          file: (m.file as string) || null,
          size_kb: Number(m.size_kb || 0),
        })),
    };
  } catch (error) {
    logWarn('Failed to fetch Qlib Bridge admin status', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ...QLIB_STATUS_DISABLED,
      enabled: true,
      state: 'offline',
    };
  }
}

async function fetchQlibBridgeAdminStatus(): Promise<QlibBridgeAdminStatus> {
  return await fetchQlibBridgeStatusSummary({ includeInventory: true });
}

async function fetchQlibBridgeHeadlineStatus(): Promise<QlibBridgeAdminStatus> {
  if (
    _qlibHeadlineCache &&
    Date.now() - _qlibHeadlineCache.fetchedAt < QLIB_HEADLINE_CACHE_TTL_MS
  ) {
    return _qlibHeadlineCache.data;
  }
  const data = await fetchQlibBridgeStatusSummary({
    includeInventory: false,
    timeoutMs: QLIB_HEADLINE_FETCH_TIMEOUT_MS,
  });
  _qlibHeadlineCache = { data, fetchedAt: Date.now() };
  return data;
}

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

type AdminUserRoleRow = {
  user_id: string;
  role: string;
  granted_at_ms: number;
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
  const rows = queryRowsSync<AdminUserRow>(
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
        NULL::text AS roles_csv
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
      ORDER BY COALESCE(u.last_login_at_ms, u.created_at_ms) DESC, u.created_at_ms DESC
    `,
    [Date.now()],
  );
  const roleRows = queryRowsSync<AdminUserRoleRow>(
    `
      SELECT user_id, role, granted_at_ms
      FROM auth_user_roles
      ORDER BY granted_at_ms DESC
    `,
  );
  const rolesByUser = new Map<string, string[]>();
  for (const row of roleRows) {
    const userRoles = rolesByUser.get(row.user_id) || [];
    userRoles.push(row.role);
    rolesByUser.set(row.user_id, userRoles);
  }
  return rows.map((row) => ({
    ...row,
    roles_csv: rolesByUser.get(row.user_id)?.join(',') || null,
  }));
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

let _usersCache: {
  data: { generated_at: string } & ReturnType<typeof mapAdminUsers>;
  fetchedAt: number;
} | null = null;
const USERS_CACHE_TTL_MS = 30_000;

export function buildAdminUsersSnapshot() {
  if (_usersCache && Date.now() - _usersCache.fetchedAt < USERS_CACHE_TTL_MS) {
    return _usersCache.data;
  }
  const rows = queryAdminUsers();
  const result = {
    generated_at: new Date().toISOString(),
    ...mapAdminUsers(rows),
  };
  _usersCache = { data: result, fetchedAt: Date.now() };
  return result;
}

export async function buildAdminAlphaSnapshot(args?: { timeZone?: string; localDate?: string }) {
  return await buildLiveAdminAlphaSnapshot(args);
}

export function buildAdminSignalsSnapshot() {
  const repo = getRepo();
  const signalRows = repo.listSignals({ status: 'ALL', limit: 160 });
  const executionRows = repo.listExecutions({ limit: 240 });

  const executionsBySignal = new Map<string, typeof executionRows>();
  for (const exec of executionRows) {
    const key = exec.signal_id;
    const bucket = executionsBySignal.get(key);
    if (bucket) bucket.push(exec);
    else executionsBySignal.set(key, [exec]);
  }

  const signals = signalRows
    .map((row) => {
      const signal = decodeSignalContract(row);
      const executions = executionsBySignal.get(row.signal_id) || [];
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
  const [ops, qlibBridge] = await Promise.all([
    buildAdminResearchOpsSnapshot(),
    fetchQlibBridgeAdminStatus(),
  ]);
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
  // Qlib Bridge diagnostics
  if (qlibBridge.enabled && !qlibBridge.healthy) {
    diagnostics.push({
      severity: 'WARN',
      title: 'Qlib Bridge 已启用但当前不可达',
      detail: `Bridge 配置为 ${config.qlibBridge?.baseUrl || 'unknown'}，但健康检查失败。因子增强和模型推理不可用。`,
    });
  }
  if (qlibBridge.enabled && qlibBridge.healthy && !qlibBridge.qlib_ready) {
    diagnostics.push({
      severity: 'WARN',
      title: 'Qlib Bridge 在线但数据未就绪',
      detail: 'Bridge 服务在运行，但 Qlib 核心尚未初始化。请先执行 POST /api/data/sync 同步数据。',
    });
  }
  if (qlibBridge.enabled && qlibBridge.healthy && qlibBridge.qlib_ready) {
    const factorSetNames = qlibBridge.available_factor_sets.map((fs) => fs.id).join(', ') || 'none';
    const modelCount = qlibBridge.available_models.length;
    diagnostics.push({
      severity: 'INFO',
      title: 'Qlib Bridge 因子引擎在线',
      detail: `因子集: ${factorSetNames}，预训练模型: ${modelCount} 个，uptime ${Math.round(qlibBridge.uptime_seconds || 0)}s。`,
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
    qlib_bridge: qlibBridge,
  };
}

// -- Overview snapshot with stale-while-revalidate cache --
type OverviewSnapshot = Awaited<ReturnType<typeof buildAdminOverviewSnapshotUncached>>;
let _overviewCache: { data: OverviewSnapshot; fetchedAt: number } | null = null;
let _overviewInflight: Promise<OverviewSnapshot> | null = null;
const OVERVIEW_FRESH_TTL_MS = 20_000;
const OVERVIEW_STALE_TTL_MS = 90_000;

export async function buildAdminOverviewSnapshot(): Promise<OverviewSnapshot> {
  const age = _overviewCache ? Date.now() - _overviewCache.fetchedAt : Infinity;

  // Fresh cache -- return immediately
  if (_overviewCache && age < OVERVIEW_FRESH_TTL_MS) {
    return _overviewCache.data;
  }

  // Stale cache -- return stale data, refresh in background
  if (_overviewCache && age < OVERVIEW_STALE_TTL_MS) {
    if (!_overviewInflight) {
      _overviewInflight = buildAdminOverviewSnapshotUncached().finally(() => {
        _overviewInflight = null;
      });
      // Prevent unhandled rejection -- caller already received stale cache data
      _overviewInflight.catch(() => {});
    }
    return _overviewCache.data;
  }

  // No cache -- block on fresh data (deduplicate concurrent requests)
  if (_overviewInflight) return _overviewInflight;
  _overviewInflight = buildAdminOverviewSnapshotUncached().finally(() => {
    _overviewInflight = null;
  });
  return _overviewInflight;
}

async function buildAdminOverviewSnapshotUncached() {
  const repo = getRepo();
  const [users, alpha, signals, system, workflows] = await Promise.all([
    Promise.resolve(buildAdminUsersSnapshot()),
    buildAdminAlphaSnapshot(),
    Promise.resolve(buildAdminSignalsSnapshot()),
    buildAdminSystemSnapshot(),
    Promise.resolve(repo.listWorkflowRuns({ limit: 16 })),
  ]);

  const result = {
    generated_at: new Date().toISOString(),
    headline_metrics: {
      total_users: users.summary.total_users,
      active_users_7d: users.summary.active_last_7d,
      active_signals: signals.summary.active_signals,
      shadow_candidates: Number(alpha.inventory.SHADOW || 0),
      canary_candidates: Number(alpha.inventory.CANARY || 0),
      recent_news_factors: system.data_summary.news_factor_count,
      ai_runs: system.ai_summary.total,
      qlib_bridge_enabled: system.qlib_bridge?.enabled ?? false,
      qlib_bridge_healthy: system.qlib_bridge?.healthy ?? false,
      qlib_bridge_ready: system.qlib_bridge?.qlib_ready ?? false,
      qlib_bridge_state: system.qlib_bridge?.state ?? 'disabled',
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
      qlib_bridge_enabled: system.qlib_bridge?.enabled ?? false,
      qlib_bridge_healthy: system.qlib_bridge?.healthy ?? false,
      qlib_bridge_ready: system.qlib_bridge?.qlib_ready ?? false,
      qlib_bridge_state: system.qlib_bridge?.state ?? 'disabled',
      qlib_bridge_version: system.qlib_bridge?.version ?? null,
    },
  };
  _overviewCache = { data: result, fetchedAt: Date.now() };
  return result;
}

// -- Fast headline: only local queries, no Postgres cascade --
export async function buildAdminOverviewHeadlineFast() {
  // If a full overview is cached and still within stale window, return it directly
  if (_overviewCache && Date.now() - _overviewCache.fetchedAt < OVERVIEW_STALE_TTL_MS) {
    return _overviewCache.data;
  }

  // Compute headline from fast local sources + lightweight Qlib status
  const repo = getRepo();
  const [users, qlibBridge] = await Promise.all([
    Promise.resolve(buildAdminUsersSnapshot()),
    fetchQlibBridgeHeadlineStatus(),
  ]);
  const signalRows = repo.listSignals({ status: 'ALL', limit: 160 });
  const activeSignals = signalRows.filter(
    (row) => row.status === 'NEW' || row.status === 'TRIGGERED',
  );
  const topSymbols = countBy(activeSignals, (row) => row.symbol).slice(0, 8);
  const directionMix = countBy(activeSignals, (row) => row.direction);
  const workflows = repo.listWorkflowRuns({ limit: 16 });

  return {
    generated_at: new Date().toISOString(),
    _partial: true as const,
    headline_metrics: {
      total_users: users.summary.total_users,
      active_users_7d: users.summary.active_last_7d,
      active_signals: activeSignals.length,
      shadow_candidates: 0,
      canary_candidates: 0,
      recent_news_factors: 0,
      ai_runs: 0,
      qlib_bridge_enabled: qlibBridge.enabled,
      qlib_bridge_healthy: qlibBridge.healthy,
      qlib_bridge_ready: qlibBridge.qlib_ready,
      qlib_bridge_state: qlibBridge.state,
    },
    user_mix: users.trade_mode_mix,
    alpha_lifecycle: [],
    signal_direction_mix: directionMix,
    top_symbols: topSymbols,
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
        value: '加载中...',
        detail: '正在拉取策略库存数据。',
      },
      {
        label: '因子与 AI 层',
        value: '加载中...',
        detail: qlibBridge.enabled
          ? `Qlib Bridge ${qlibBridge.state === 'online' ? '✅ 在线' : qlibBridge.state === 'data_not_ready' ? '⚠️ 数据未就绪' : '❌ 不可达'}，AI 数据加载中。`
          : '正在拉取 AI 运行与新闻因子数据。',
      },
    ],
    guardrails: [
      { label: '先 Shadow 再上线', value: 100 },
      { label: '实盘自动直推关闭', value: 100 },
      { label: '数据因子覆盖', value: 0 },
      { label: 'Alpha 发现活跃度', value: 0 },
      { label: '用户使用活跃度', value: Math.min(100, users.summary.active_last_30d * 10) },
    ],
    system_cards: {
      runtime_provider: null,
      runtime_mode: null,
      news_factor_count: 0,
      option_chain_count: 0,
      qlib_bridge_enabled: qlibBridge.enabled,
      qlib_bridge_healthy: qlibBridge.healthy,
      qlib_bridge_ready: qlibBridge.qlib_ready,
      qlib_bridge_state: qlibBridge.state,
      qlib_bridge_version: qlibBridge.version,
    },
  };
}

export async function buildAdminTodayOpsSnapshot(args?: { timeZone?: string; localDate?: string }) {
  return await buildAdminResearchOpsSnapshot(args);
}

/** Clear in-memory caches -- test-only */
export function _resetAdminCachesForTesting() {
  _overviewCache = null;
  _overviewInflight = null;
  _usersCache = null;
  _qlibHeadlineCache = null;
}

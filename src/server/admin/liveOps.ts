import { getConfig } from '../config.js';
import { getDb } from '../db/database.js';
import { qualifyBusinessTable, queryRowSync, queryRowsSync } from '../db/postgresSyncBridge.js';
import { getRuntimeRepo } from '../db/runtimeRepository.js';
import { buildPrivateMarvixOpsReport } from '../ops/privateMarvixOps.js';
import { decodeSignalContract } from '../quant/service.js';
import { MIN_AUTOMATIC_TRAINING_ROWS } from '../nova/flywheel.js';
import type { NovaTaskRunRecord, WorkflowRunRecord } from '../types.js';
import {
  buildPostgresAdminResearchOpsSnapshot,
  hasPostgresBusinessMirror,
} from './postgresBusinessRead.js';

type JsonObject = Record<string, unknown>;

type CountItem = {
  label: string;
  value: number;
};

type DailyWorkflowCount = {
  workflow_key: string;
  run_count: number;
  first_ms: number | null;
  last_ms: number | null;
  first_at_utc: string | null;
  last_at_utc: string | null;
};

type DailyTableCount = {
  count: number;
  last_ms: number | null;
  last_at: string | null;
};

type TrainingRunSummary = {
  id: string;
  workflow_key: string;
  status: string;
  trigger_type: string;
  updated_at: string | null;
  completed_at: string | null;
  trainer: string | null;
  dataset_count: number;
  ready_for_training: boolean;
  manifest_path: string | null;
  task_types: string[];
  execution: {
    attempted: boolean;
    executed: boolean;
    success: boolean;
    reason: string | null;
    exit_code: number | null;
  };
};

export type AdminResearchOpsSnapshot = {
  generated_at: string;
  data_source: {
    mode: 'local-db' | 'postgres-mirror' | 'live-upstream' | 'local-fallback';
    label: string;
    live_connected: boolean;
    timezone: string;
    local_date: string;
    upstream_base_url: string | null;
    error: string | null;
  };
  runtime: ReturnType<typeof buildPrivateMarvixOpsReport>['runtime'];
  workflow_summary: {
    total: number;
    by_status: CountItem[];
    by_workflow: CountItem[];
  };
  ai_summary: {
    total: number;
    by_status: CountItem[];
    by_task: CountItem[];
    by_route: CountItem[];
  };
  data_summary: {
    news_items_72h: number;
    news_factor_count: number;
    news_factor_coverage_pct: number;
    fundamentals_count: number;
    option_chain_count: number;
    source_mix: CountItem[];
    factor_tag_mix: CountItem[];
  };
  throughput_recent: {
    latest_free_data: JsonObject | null;
    latest_alpha_discovery: JsonObject | null;
    latest_shadow_monitoring: JsonObject | null;
    latest_training: TrainingRunSummary | null;
  };
  workflows: ReturnType<typeof buildPrivateMarvixOpsReport>['workflows'];
  recent_news_factors: ReturnType<typeof buildPrivateMarvixOpsReport>['recent_news_factors'];
  reference_data: ReturnType<typeof buildPrivateMarvixOpsReport>['reference_data'];
  active_signals: ReturnType<typeof buildPrivateMarvixOpsReport>['active_signals'];
  recent_nova_runs: ReturnType<typeof buildPrivateMarvixOpsReport>['recent_nova_runs'];
  daily_ops: {
    timezone: string;
    local_date: string;
    since_utc: string;
    workflow_counts: DailyWorkflowCount[];
    table_counts: Record<string, DailyTableCount>;
    alpha_eval_summary: Array<{
      evaluation_status: string;
      cnt: number;
      avg_acceptance: number;
      max_acceptance: number;
      avg_net_pnl: number | null;
      best_net_pnl: number | null;
      avg_sharpe: number | null;
    }>;
    top_backtests: Array<{
      backtest_run_id: string;
      net_return: number | null;
      sharpe: number | null;
      max_dd: number | null;
      realism_grade: string | null;
      robustness_grade: string | null;
      sample_size: number | null;
      status: string;
      started_at: string | null;
      completed_at: string | null;
    }>;
    recent_signals: Array<{
      signal_id: string;
      market: string;
      symbol: string;
      strategy_id: string;
      direction: string;
      score: number;
      confidence: number;
      created_at_ms: number;
      created_at_utc: string | null;
      explain: string | null;
    }>;
    recent_workflows: Array<{
      id: string;
      workflow_key: string;
      status: string;
      trigger_type: string;
      updated_at: string | null;
      completed_at: string | null;
      trace_id: string | null;
      summary: JsonObject | null;
    }>;
    training: {
      minimum_training_rows: number;
      today_run_count: number;
      latest_run: TrainingRunSummary | null;
      recent_runs: TrainingRunSummary[];
      latest_run_at: string | null;
      current_dataset_count: number;
      ready_for_training: boolean;
      latest_execution_reason: string | null;
      latest_execution_success: boolean | null;
    };
  };
};

const UPSTREAM_SOFT_TIMEOUT_MS = Math.max(
  400,
  Number(process.env.NOVA_ADMIN_UPSTREAM_FETCH_TIMEOUT_MS || 1200),
);
const UPSTREAM_HARD_TIMEOUT_MS = Math.max(
  UPSTREAM_SOFT_TIMEOUT_MS + 800,
  Number(process.env.NOVA_ADMIN_UPSTREAM_HARD_TIMEOUT_MS || 6500),
);
const UPSTREAM_SUCCESS_CACHE_TTL_MS = Math.max(
  1_000,
  Number(process.env.NOVA_ADMIN_UPSTREAM_SUCCESS_CACHE_TTL_MS || 15_000),
);
const UPSTREAM_FAILURE_COOLDOWN_MS = Math.max(
  1_000,
  Number(process.env.NOVA_ADMIN_UPSTREAM_FAILURE_COOLDOWN_MS || 30_000),
);
const POSTGRES_SOFT_TIMEOUT_MS = Math.max(
  400,
  Number(process.env.NOVA_ADMIN_PG_FETCH_TIMEOUT_MS || 900),
);
const POSTGRES_SUCCESS_CACHE_TTL_MS = Math.max(
  1_000,
  Number(process.env.NOVA_ADMIN_PG_SUCCESS_CACHE_TTL_MS || 15_000),
);
const POSTGRES_FAILURE_COOLDOWN_MS = Math.max(
  1_000,
  Number(process.env.NOVA_ADMIN_PG_FAILURE_COOLDOWN_MS || 30_000),
);

const upstreamSnapshotCache = new Map<
  string,
  { baseUrl: string; payload: AdminResearchOpsSnapshot; fetchedAt: number }
>();
const upstreamFailureCache = new Map<string, { error: string; failedAt: number }>();
const upstreamInflight = new Map<
  string,
  Promise<{ baseUrl: string; payload: AdminResearchOpsSnapshot } | null>
>();
const postgresSnapshotCache = new Map<
  string,
  { payload: AdminResearchOpsSnapshot; fetchedAt: number }
>();
const postgresFailureCache = new Map<string, { error: string; failedAt: number }>();
const postgresInflight = new Map<string, Promise<AdminResearchOpsSnapshot>>();

// Cache cleanup interval (run every 5 minutes)
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

function pruneExpiredCache(
  snapshotCache: Map<string, { fetchedAt: number }>,
  failureCache: Map<string, { failedAt: number }>,
  successTtlMs: number,
  failureTtlMs: number,
) {
  const now = Date.now();
  // Evict expired success entries
  for (const [key, entry] of snapshotCache.entries()) {
    if (now - entry.fetchedAt > successTtlMs) {
      snapshotCache.delete(key);
    }
  }
  // Evict expired failure entries
  for (const [key, entry] of failureCache.entries()) {
    if (now - entry.failedAt > failureTtlMs) {
      failureCache.delete(key);
    }
  }
  // If still too large, evict oldest entries
  if (snapshotCache.size > MAX_CACHE_ENTRIES) {
    const sorted = [...snapshotCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
    const toRemove = sorted.slice(0, Math.ceil(MAX_CACHE_ENTRIES * 0.3));
    toRemove.forEach(([key]) => snapshotCache.delete(key));
  }
  if (failureCache.size > MAX_CACHE_ENTRIES) {
    const sorted = [...failureCache.entries()].sort((a, b) => a[1].failedAt - b[1].failedAt);
    const toRemove = sorted.slice(0, Math.ceil(MAX_CACHE_ENTRIES * 0.3));
    toRemove.forEach(([key]) => failureCache.delete(key));
  }
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCacheCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    pruneExpiredCache(
      upstreamSnapshotCache,
      upstreamFailureCache,
      UPSTREAM_SUCCESS_CACHE_TTL_MS,
      UPSTREAM_FAILURE_COOLDOWN_MS,
    );
    pruneExpiredCache(
      postgresSnapshotCache,
      postgresFailureCache,
      POSTGRES_SUCCESS_CACHE_TTL_MS,
      POSTGRES_FAILURE_COOLDOWN_MS,
    );
  }, CACHE_CLEANUP_INTERVAL_MS);
  // Ensure cleanup does not prevent process exit
  cleanupTimer.unref();
}

// Start cleanup on module load
startCacheCleanup();

function getRepo() {
  return getRuntimeRepo();
}

function parseJsonObject(value: string | null | undefined): JsonObject {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as JsonObject;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
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
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function summarizeNovaRuns(rows: NovaTaskRunRecord[]) {
  return {
    total: rows.length,
    by_status: countBy(rows, (row) => row.status),
    by_task: countBy(rows, (row) => row.task_type),
    by_route: countBy(rows, (row) => row.route_alias || 'unrouted'),
  };
}

function workflowSummaryForRow(row: WorkflowRunRecord): JsonObject | null {
  const output = parseJsonObject(row.output_json);
  const news = output.news && typeof output.news === 'object' ? (output.news as JsonObject) : null;
  const fundamentals =
    output.fundamentals && typeof output.fundamentals === 'object'
      ? (output.fundamentals as JsonObject)
      : null;
  const options =
    output.options && typeof output.options === 'object' ? (output.options as JsonObject) : null;
  if (row.workflow_key === 'free_data_flywheel') {
    return {
      refreshed_symbols: news?.refreshed_symbols ?? null,
      rows_upserted: news?.rows_upserted ?? null,
      fundamentals_rows_upserted: fundamentals?.rows_upserted ?? null,
      options_rows_upserted: options?.rows_upserted ?? null,
    };
  }
  if (row.workflow_key === 'alpha_discovery_loop') {
    const evaluationSummary =
      output.evaluation_summary && typeof output.evaluation_summary === 'object'
        ? (output.evaluation_summary as JsonObject)
        : null;
    const alphaRegistry =
      output.alpha_registry && typeof output.alpha_registry === 'object'
        ? (output.alpha_registry as JsonObject)
        : null;
    return {
      accepted: evaluationSummary?.accepted ?? null,
      rejected: evaluationSummary?.rejected ?? null,
      watch: evaluationSummary?.watch ?? null,
      top_candidates: Array.isArray(alphaRegistry?.top_candidates)
        ? (alphaRegistry?.top_candidates as unknown[]).length
        : null,
    };
  }
  if (row.workflow_key === 'alpha_shadow_runner') {
    const shadow =
      output.shadow && typeof output.shadow === 'object' ? (output.shadow as JsonObject) : null;
    const promotion =
      output.promotion && typeof output.promotion === 'object'
        ? (output.promotion as JsonObject)
        : null;
    return {
      candidates_processed: shadow?.candidates_processed ?? null,
      promoted_to_canary: Array.isArray(promotion?.promoted_to_canary)
        ? (promotion.promoted_to_canary as unknown[]).length
        : null,
      retired: Array.isArray(promotion?.retired) ? (promotion.retired as unknown[]).length : null,
    };
  }
  if (row.workflow_key === 'nova_training_flywheel') {
    const execution =
      output.execution && typeof output.execution === 'object'
        ? (output.execution as JsonObject)
        : null;
    return {
      dataset_count: output.dataset_count ?? null,
      ready_for_training: output.ready_for_training ?? null,
      trainer: output.trainer ?? null,
      execution_reason: execution?.reason ?? null,
    };
  }
  return Object.keys(output).length ? output : null;
}

function summarizeTrainingRun(row: WorkflowRunRecord): TrainingRunSummary {
  const output = parseJsonObject(row.output_json);
  const execution =
    output.execution && typeof output.execution === 'object'
      ? (output.execution as JsonObject)
      : null;
  const datasetCount = Math.max(0, Number(output.dataset_count || 0));
  return {
    id: row.id,
    workflow_key: row.workflow_key,
    status: row.status,
    trigger_type: row.trigger_type,
    updated_at: toIso(row.updated_at_ms),
    completed_at: toIso(row.completed_at_ms),
    trainer: output.trainer ? String(output.trainer) : null,
    dataset_count: datasetCount,
    ready_for_training: datasetCount >= MIN_AUTOMATIC_TRAINING_ROWS,
    manifest_path: output.manifest_path ? String(output.manifest_path) : null,
    task_types: Array.isArray(output.task_types)
      ? output.task_types.map((item) => String(item))
      : [],
    execution: {
      attempted: Boolean(execution?.attempted),
      executed: Boolean(execution?.executed),
      success: Boolean(execution?.success),
      reason: execution?.reason ? String(execution.reason) : null,
      exit_code: Number.isFinite(Number(execution?.exit_code))
        ? Number(execution?.exit_code)
        : null,
    },
  };
}

function getTimeZoneFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatted = getTimeZoneFormatter(timeZone)
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
  return {
    year: Number(formatted.year || 0),
    month: Number(formatted.month || 1),
    day: Number(formatted.day || 1),
    hour: Number(formatted.hour || 0),
    minute: Number(formatted.minute || 0),
    second: Number(formatted.second || 0),
  };
}

function getTimeZoneDateKey(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const actualUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );
  return zonedAsUtc - actualUtc;
}

function getStartOfDayUtcMs(timeZone: string, localDate?: string) {
  const normalizedDate =
    typeof localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(localDate)
      ? localDate
      : getTimeZoneDateKey(new Date(), timeZone);
  const [yearText, monthText, dayText] = normalizedDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  let utcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let index = 0; index < 3; index += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    const nextUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs;
    if (nextUtcMs === utcMs) break;
    utcMs = nextUtcMs;
  }
  return {
    localDate: normalizedDate,
    sinceMs: utcMs,
  };
}

function queryTableCount(table: string, column: string, sinceMs: number): DailyTableCount {
  const row =
    getConfig().database.driver === 'postgres'
      ? queryRowSync<{ count?: number; last_ms?: number | null }>(
          `SELECT COUNT(*) AS count, MAX(${column}) AS last_ms
           FROM ${qualifyBusinessTable(table)}
           WHERE ${column} >= $1`,
          [sinceMs],
        )
      : ((getDb()
          .prepare(
            `SELECT COUNT(*) AS count, MAX(${column}) AS last_ms FROM ${table} WHERE ${column} >= @since_ms`,
          )
          .get({ since_ms: sinceMs }) as { count?: number; last_ms?: number | null } | undefined) ??
        null);
  const count = Number(row?.count || 0);
  const lastMs = row?.last_ms ?? null;
  return {
    count,
    last_ms: lastMs,
    last_at: toIso(lastMs),
  };
}

function orderEvaluationStatus(status: string) {
  if (status === 'PASS') return 0;
  if (status === 'WATCH') return 1;
  if (status === 'REJECT') return 2;
  return 3;
}

function buildLocalSnapshot(args?: {
  timeZone?: string;
  localDate?: string;
}): AdminResearchOpsSnapshot {
  const repo = getRepo();
  const usePostgres = getConfig().database.driver === 'postgres';
  const db = usePostgres ? null : getDb();
  const timeZone = resolveReportTimeZone(args?.timeZone);
  const { localDate, sinceMs } = getStartOfDayUtcMs(timeZone, args?.localDate);
  const now = Date.now();
  const ops = buildPrivateMarvixOpsReport(repo);
  const recentNewsItems = repo.listNewsItems({ limit: 60, sinceMs: now - 1000 * 60 * 60 * 72 });
  const factorTagMix = countBy(
    ops.recent_news_factors.flatMap((row) =>
      Array.isArray(row.factor_tags) ? row.factor_tags : [],
    ),
    (row) => String(row),
  );
  const sourceMix = countBy(recentNewsItems, (row) => row.source);
  const novaRuns = repo.listNovaTaskRuns({ limit: 60 });

  const workflowCountRows = usePostgres
    ? queryRowsSync<{
        workflow_key: string;
        run_count: number;
        first_ms: number | null;
        last_ms: number | null;
      }>(
        `
          SELECT workflow_key, COUNT(*) AS run_count, MIN(updated_at_ms) AS first_ms, MAX(updated_at_ms) AS last_ms
          FROM ${qualifyBusinessTable('workflow_runs')}
          WHERE updated_at_ms >= $1
          GROUP BY workflow_key
          ORDER BY run_count DESC, workflow_key ASC
        `,
        [sinceMs],
      )
    : (db
        ?.prepare(
          `
            SELECT workflow_key, COUNT(*) AS run_count, MIN(updated_at_ms) AS first_ms, MAX(updated_at_ms) AS last_ms
            FROM workflow_runs
            WHERE updated_at_ms >= @since_ms
            GROUP BY workflow_key
            ORDER BY run_count DESC, workflow_key ASC
          `,
        )
        .all({ since_ms: sinceMs }) as Array<{
        workflow_key: string;
        run_count: number;
        first_ms: number | null;
        last_ms: number | null;
      }>);

  const workflowCounts: DailyWorkflowCount[] = workflowCountRows.map((row) => ({
    workflow_key: row.workflow_key,
    run_count: Number(row.run_count || 0),
    first_ms: row.first_ms ?? null,
    last_ms: row.last_ms ?? null,
    first_at_utc: toIso(row.first_ms),
    last_at_utc: toIso(row.last_ms),
  }));

  const workflowSummaryTotal = workflowCounts.reduce((sum, row) => sum + row.run_count, 0);

  const tableCounts = {
    news_items: queryTableCount('news_items', 'updated_at_ms', sinceMs),
    signals: queryTableCount('signals', 'created_at_ms', sinceMs),
    option_chain_snapshots: queryTableCount('option_chain_snapshots', 'updated_at_ms', sinceMs),
    fundamental_snapshots: queryTableCount('fundamental_snapshots', 'updated_at_ms', sinceMs),
    backtest_runs: queryTableCount('backtest_runs', 'started_at_ms', sinceMs),
    backtest_metrics: queryTableCount('backtest_metrics', 'updated_at_ms', sinceMs),
    dataset_versions: queryTableCount('dataset_versions', 'created_at_ms', sinceMs),
  };

  const alphaEvaluations = usePostgres
    ? queryRowsSync<{
        evaluation_status: string;
        acceptance_score: number;
        metrics_json: string;
      }>(
        `
          SELECT evaluation_status, acceptance_score, metrics_json
          FROM ${qualifyBusinessTable('alpha_evaluations')}
          WHERE created_at_ms >= $1
          ORDER BY created_at_ms DESC
        `,
        [sinceMs],
      )
    : (db
        ?.prepare(
          `
            SELECT evaluation_status, acceptance_score, metrics_json
            FROM alpha_evaluations
            WHERE created_at_ms >= @since_ms
            ORDER BY created_at_ms DESC
          `,
        )
        .all({ since_ms: sinceMs }) as Array<{
        evaluation_status: string;
        acceptance_score: number;
        metrics_json: string;
      }>);

  const alphaEvalMap = new Map<
    string,
    {
      evaluation_status: string;
      cnt: number;
      acceptance_sum: number;
      max_acceptance: number;
      net_pnl_values: number[];
      sharpe_values: number[];
    }
  >();
  alphaEvaluations.forEach((row) => {
    const metrics = parseJsonObject(row.metrics_json);
    const netPnl = Number.isFinite(Number(metrics.net_pnl))
      ? Number(metrics.net_pnl)
      : Number.isFinite(Number(metrics.net_return))
        ? Number(metrics.net_return)
        : null;
    const sharpe = Number.isFinite(Number(metrics.sharpe)) ? Number(metrics.sharpe) : null;
    const current = alphaEvalMap.get(row.evaluation_status) || {
      evaluation_status: row.evaluation_status,
      cnt: 0,
      acceptance_sum: 0,
      max_acceptance: Number.NEGATIVE_INFINITY,
      net_pnl_values: [],
      sharpe_values: [],
    };
    current.cnt += 1;
    current.acceptance_sum += Number(row.acceptance_score || 0);
    current.max_acceptance = Math.max(current.max_acceptance, Number(row.acceptance_score || 0));
    if (netPnl !== null) current.net_pnl_values.push(netPnl);
    if (sharpe !== null) current.sharpe_values.push(sharpe);
    alphaEvalMap.set(row.evaluation_status, current);
  });

  const alphaEvalSummary = Array.from(alphaEvalMap.values())
    .map((row) => ({
      evaluation_status: row.evaluation_status,
      cnt: row.cnt,
      avg_acceptance: row.cnt ? round(row.acceptance_sum / row.cnt, 4) : 0,
      max_acceptance:
        row.max_acceptance > Number.NEGATIVE_INFINITY ? round(row.max_acceptance, 4) : 0,
      avg_net_pnl: row.net_pnl_values.length
        ? round(
            row.net_pnl_values.reduce((sum, value) => sum + value, 0) / row.net_pnl_values.length,
            4,
          )
        : null,
      best_net_pnl: row.net_pnl_values.length ? round(Math.max(...row.net_pnl_values), 4) : null,
      avg_sharpe: row.sharpe_values.length
        ? round(
            row.sharpe_values.reduce((sum, value) => sum + value, 0) / row.sharpe_values.length,
            4,
          )
        : null,
    }))
    .sort(
      (a, b) =>
        orderEvaluationStatus(a.evaluation_status) - orderEvaluationStatus(b.evaluation_status),
    );

  const topBacktests = repo
    .listBacktestRuns({ limit: 160 })
    .filter((row) => Number(row.started_at_ms || 0) >= sinceMs)
    .map((row) => {
      const metric = repo.getBacktestMetric(row.id);
      return {
        backtest_run_id: row.id,
        net_return: metric?.net_return ?? null,
        sharpe: metric?.sharpe ?? null,
        max_dd: metric?.max_drawdown ?? null,
        realism_grade: metric?.realism_grade ?? null,
        robustness_grade: metric?.robustness_grade ?? null,
        sample_size: metric?.sample_size ?? null,
        status: metric?.status || row.status,
        started_at: toIso(row.started_at_ms),
        completed_at: toIso(row.completed_at_ms),
      };
    })
    .sort(
      (a, b) =>
        Number(b.net_return || -Infinity) - Number(a.net_return || -Infinity) ||
        Number(b.sharpe || -Infinity) - Number(a.sharpe || -Infinity),
    )
    .slice(0, 8);

  const recentSignals = usePostgres
    ? queryRowsSync<{
        signal_id: string;
        market: string;
        symbol: string;
        strategy_id: string;
        direction: string;
        score: number;
        confidence: number;
        created_at_ms: number;
        payload_json: string;
      }>(
        `
          SELECT signal_id, market, symbol, strategy_id, direction, score, confidence, created_at_ms, payload_json
          FROM ${qualifyBusinessTable('signals')}
          WHERE created_at_ms >= $1
          ORDER BY created_at_ms DESC, score DESC
          LIMIT 12
        `,
        [sinceMs],
      )
    : (db
        ?.prepare(
          `
            SELECT signal_id, market, symbol, strategy_id, direction, score, confidence, created_at_ms, payload_json
            FROM signals
            WHERE created_at_ms >= @since_ms
            ORDER BY created_at_ms DESC, score DESC
            LIMIT 12
          `,
        )
        .all({ since_ms: sinceMs }) as Array<{
        signal_id: string;
        market: string;
        symbol: string;
        strategy_id: string;
        direction: string;
        score: number;
        confidence: number;
        created_at_ms: number;
        payload_json: string;
      }>);

  const mappedRecentSignals = recentSignals.map((row) => {
    const decoded = decodeSignalContract({
      signal_id: row.signal_id,
      market: row.market as never,
      symbol: row.symbol,
      strategy_id: row.strategy_id,
      direction: row.direction as never,
      score: row.score,
      confidence: row.confidence,
      created_at_ms: row.created_at_ms,
      payload_json: row.payload_json,
    } as never);
    return {
      signal_id: row.signal_id,
      market: row.market,
      symbol: row.symbol,
      strategy_id: row.strategy_id,
      direction: row.direction,
      score: Number(row.score || 0),
      confidence: Number(row.confidence || 0),
      created_at_ms: row.created_at_ms,
      created_at_utc: toIso(row.created_at_ms),
      explain: decoded?.explain_bullets?.[0] || null,
    };
  });

  const recentWorkflows = repo
    .listWorkflowRuns({ limit: 180 })
    .filter((row) => Number(row.updated_at_ms || 0) >= sinceMs)
    .map((row) => ({
      id: row.id,
      workflow_key: row.workflow_key,
      status: row.status,
      trigger_type: row.trigger_type,
      updated_at: toIso(row.updated_at_ms),
      completed_at: toIso(row.completed_at_ms),
      trace_id: row.trace_id || null,
      summary: workflowSummaryForRow(row),
    }))
    .slice(0, 24);

  const trainingRuns = repo
    .listWorkflowRuns({ workflowKey: 'nova_training_flywheel', limit: 12 })
    .map(summarizeTrainingRun);
  const latestTraining = trainingRuns[0] || null;
  const todayTrainingRunCount = trainingRuns.filter((row) => {
    const updatedAtMs = row.updated_at ? Date.parse(row.updated_at) : NaN;
    return Number.isFinite(updatedAtMs) && updatedAtMs >= sinceMs;
  }).length;

  const latestFreeData =
    ops.workflows.find((row) => row.workflow_key === 'free_data_flywheel') || null;
  const latestDiscovery =
    ops.workflows.find((row) => row.workflow_key === 'alpha_discovery_loop') || null;
  const latestShadow =
    ops.workflows.find((row) => row.workflow_key === 'alpha_shadow_runner') || null;
  const factorCoveragePct = recentNewsItems.length
    ? round((ops.recent_news_factors.length / recentNewsItems.length) * 100, 1)
    : 0;

  return {
    generated_at: new Date().toISOString(),
    data_source: {
      mode: 'local-db',
      label: 'Local DB',
      live_connected: false,
      timezone: timeZone,
      local_date: localDate,
      upstream_base_url: null,
      error: null,
    },
    runtime: ops.runtime,
    workflow_summary: {
      total: workflowSummaryTotal || ops.workflows.length,
      by_status: workflowSummaryTotal
        ? countBy(recentWorkflows, (row) => row.status)
        : countBy(ops.workflows, (row) => row.status),
      by_workflow: workflowSummaryTotal
        ? countBy(recentWorkflows, (row) => row.workflow_key)
        : countBy(ops.workflows, (row) => row.workflow_key),
    },
    ai_summary: summarizeNovaRuns(novaRuns),
    data_summary: {
      news_items_72h: recentNewsItems.length,
      news_factor_count: ops.recent_news_factors.length,
      news_factor_coverage_pct: factorCoveragePct,
      fundamentals_count: ops.reference_data.fundamentals.length,
      option_chain_count: ops.reference_data.option_chains.length,
      source_mix: sourceMix,
      factor_tag_mix: factorTagMix,
    },
    throughput_recent: {
      latest_free_data: (latestFreeData?.summary as JsonObject | null) || null,
      latest_alpha_discovery: (latestDiscovery?.summary as JsonObject | null) || null,
      latest_shadow_monitoring: (latestShadow?.summary as JsonObject | null) || null,
      latest_training: latestTraining,
    },
    workflows: ops.workflows,
    recent_news_factors: ops.recent_news_factors,
    reference_data: ops.reference_data,
    active_signals: ops.active_signals,
    recent_nova_runs: ops.recent_nova_runs,
    daily_ops: {
      timezone: timeZone,
      local_date: localDate,
      since_utc: new Date(sinceMs).toISOString(),
      workflow_counts: workflowCounts,
      table_counts: tableCounts,
      alpha_eval_summary: alphaEvalSummary,
      top_backtests: topBacktests,
      recent_signals: mappedRecentSignals,
      recent_workflows: recentWorkflows,
      training: {
        minimum_training_rows: MIN_AUTOMATIC_TRAINING_ROWS,
        today_run_count: todayTrainingRunCount,
        latest_run: latestTraining,
        recent_runs: trainingRuns,
        latest_run_at: latestTraining?.updated_at || null,
        current_dataset_count: latestTraining?.dataset_count || 0,
        ready_for_training: latestTraining?.ready_for_training || false,
        latest_execution_reason: latestTraining?.execution.reason || null,
        latest_execution_success: latestTraining ? latestTraining.execution.success : null,
      },
    },
  };
}

function resolveLiveApiBase() {
  const candidates = [
    process.env.NOVA_ADMIN_LIVE_API_BASE,
    process.env.NOVA_LIVE_API_BASE,
    process.env.NOVA_CONTROL_PLANE_API_BASE,
  ];
  return (
    candidates
      .map((value) =>
        String(value || '')
          .trim()
          .replace(/\/+$/, ''),
      )
      .find(Boolean) || ''
  );
}

function resolveLiveApiToken() {
  return String(
    process.env.NOVA_ADMIN_LIVE_API_TOKEN || process.env.NOVA_CONTROL_PLANE_API_TOKEN || '',
  ).trim();
}

function resolveReportTimeZone(explicitTimeZone?: string) {
  return (
    String(explicitTimeZone || process.env.NOVA_ADMIN_REPORT_TIMEZONE || 'Asia/Shanghai').trim() ||
    'Asia/Shanghai'
  );
}

function normalizeLocalDate(value?: string) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function buildSnapshotScopeKey(timeZone: string, localDate?: string) {
  return `${timeZone}|${normalizeLocalDate(localDate) || 'today'}`;
}

function buildUpstreamCacheKey(baseUrl: string, timeZone: string, localDate?: string) {
  return `${baseUrl}|${buildSnapshotScopeKey(timeZone, localDate)}`;
}

function getFreshCachedUpstreamSnapshot(cacheKey: string) {
  const cached = upstreamSnapshotCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > UPSTREAM_SUCCESS_CACHE_TTL_MS) {
    upstreamSnapshotCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function getRecentUpstreamFailure(cacheKey: string) {
  const failed = upstreamFailureCache.get(cacheKey);
  if (!failed) return null;
  if (Date.now() - failed.failedAt > UPSTREAM_FAILURE_COOLDOWN_MS) {
    upstreamFailureCache.delete(cacheKey);
    return null;
  }
  return failed;
}

function getFreshCachedPostgresSnapshot(cacheKey: string) {
  const cached = postgresSnapshotCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > POSTGRES_SUCCESS_CACHE_TTL_MS) {
    postgresSnapshotCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function getRecentPostgresFailure(cacheKey: string) {
  const failed = postgresFailureCache.get(cacheKey);
  if (!failed) return null;
  if (Date.now() - failed.failedAt > POSTGRES_FAILURE_COOLDOWN_MS) {
    postgresFailureCache.delete(cacheKey);
    return null;
  }
  return failed;
}

function rememberUpstreamSuccess(
  cacheKey: string,
  result: { baseUrl: string; payload: AdminResearchOpsSnapshot },
) {
  upstreamSnapshotCache.set(cacheKey, {
    ...result,
    fetchedAt: Date.now(),
  });
  upstreamFailureCache.delete(cacheKey);
}

function rememberUpstreamFailure(cacheKey: string, error: unknown) {
  upstreamFailureCache.set(cacheKey, {
    error: error instanceof Error ? error.message : String(error || 'UPSTREAM_FETCH_FAILED'),
    failedAt: Date.now(),
  });
}

function rememberPostgresSuccess(cacheKey: string, payload: AdminResearchOpsSnapshot) {
  postgresSnapshotCache.set(cacheKey, {
    payload,
    fetchedAt: Date.now(),
  });
  postgresFailureCache.delete(cacheKey);
}

function rememberPostgresFailure(cacheKey: string, error: unknown) {
  postgresFailureCache.set(cacheKey, {
    error: error instanceof Error ? error.message : String(error || 'POSTGRES_READ_FAILED'),
    failedAt: Date.now(),
  });
}

function markLiveUpstreamSnapshot(
  snapshot: AdminResearchOpsSnapshot,
  upstreamBaseUrl: string,
): AdminResearchOpsSnapshot {
  return {
    ...snapshot,
    data_source: {
      ...snapshot.data_source,
      mode: 'live-upstream',
      label: 'EC2 live upstream',
      live_connected: true,
      upstream_base_url: upstreamBaseUrl,
      error: null,
    },
  };
}

function markLocalFallbackSnapshot(
  snapshot: AdminResearchOpsSnapshot,
  upstreamBaseUrl: string,
  error: string,
): AdminResearchOpsSnapshot {
  return {
    ...snapshot,
    data_source: {
      ...snapshot.data_source,
      mode: 'local-fallback',
      label: 'Local fallback',
      upstream_base_url: upstreamBaseUrl,
      error,
    },
  };
}

function withSoftTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutLabel: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutLabel)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function fetchPostgresSnapshot(args?: { timeZone?: string; localDate?: string }) {
  const timeZone = resolveReportTimeZone(args?.timeZone);
  const localDate = normalizeLocalDate(args?.localDate);
  const cacheKey = buildSnapshotScopeKey(timeZone, localDate);
  const existing = postgresInflight.get(cacheKey);
  if (existing) return await existing;

  const trackedRequest = buildPostgresAdminResearchOpsSnapshot({
    timeZone,
    localDate,
  }).then(
    (snapshot) => {
      rememberPostgresSuccess(cacheKey, snapshot);
      return snapshot;
    },
    (error) => {
      rememberPostgresFailure(cacheKey, error);
      throw error;
    },
  );

  postgresInflight.set(cacheKey, trackedRequest);
  try {
    return await trackedRequest;
  } finally {
    postgresInflight.delete(cacheKey);
  }
}

async function fetchUpstreamSnapshot(args?: { timeZone?: string; localDate?: string }) {
  const baseUrl = resolveLiveApiBase();
  if (!baseUrl) return null;
  const timeZone = resolveReportTimeZone(args?.timeZone);
  const localDate = normalizeLocalDate(args?.localDate);
  const cacheKey = buildUpstreamCacheKey(baseUrl, timeZone, localDate);
  const existing = upstreamInflight.get(cacheKey);
  if (existing) return await existing;
  const url = new URL('/api/control-plane/research-ops', baseUrl);
  url.searchParams.set('tz', timeZone);
  if (localDate) url.searchParams.set('localDate', localDate);

  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_HARD_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {};
      const token = resolveLiveApiToken();
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`UPSTREAM_HTTP_${response.status}`);
      }
      const payload = (await response.json()) as AdminResearchOpsSnapshot;
      return {
        baseUrl,
        payload,
      };
    } finally {
      clearTimeout(timer);
    }
  })();

  const trackedRequest = request.then(
    (result) => {
      if (result?.payload) {
        rememberUpstreamSuccess(cacheKey, result);
      }
      return result;
    },
    (error) => {
      rememberUpstreamFailure(cacheKey, error);
      throw error;
    },
  );

  upstreamInflight.set(cacheKey, trackedRequest);
  try {
    return await trackedRequest;
  } finally {
    upstreamInflight.delete(cacheKey);
  }
}

export async function buildLocalAdminResearchOpsSnapshot(args?: {
  timeZone?: string;
  localDate?: string;
}): Promise<AdminResearchOpsSnapshot> {
  const timeZone = resolveReportTimeZone(args?.timeZone);
  const localDate = normalizeLocalDate(args?.localDate);
  if (!hasPostgresBusinessMirror()) {
    return buildLocalSnapshot({
      timeZone,
      localDate,
    });
  }

  const cacheKey = buildSnapshotScopeKey(timeZone, localDate);
  const cached = getFreshCachedPostgresSnapshot(cacheKey);
  if (cached) {
    return cached.payload;
  }

  const recentFailure = getRecentPostgresFailure(cacheKey);
  if (recentFailure) {
    const localSnapshot = buildLocalSnapshot({
      timeZone,
      localDate,
    });
    return {
      ...localSnapshot,
      data_source: {
        ...localSnapshot.data_source,
        mode: 'local-fallback' as const,
        label: 'Local fallback',
        error: recentFailure.error,
      },
    };
  }

  try {
    return await withSoftTimeout(
      fetchPostgresSnapshot({
        timeZone,
        localDate,
      }),
      POSTGRES_SOFT_TIMEOUT_MS,
      'POSTGRES_FAST_TIMEOUT',
    );
  } catch (error) {
    rememberPostgresFailure(cacheKey, error);
    const localSnapshot = buildLocalSnapshot({
      timeZone,
      localDate,
    });
    return {
      ...localSnapshot,
      data_source: {
        ...localSnapshot.data_source,
        mode: 'local-fallback' as const,
        label: 'Local fallback',
        error: error instanceof Error ? error.message : String(error || 'POSTGRES_READ_FAILED'),
      },
    };
  }
}

export async function buildAdminResearchOpsSnapshot(args?: {
  timeZone?: string;
  localDate?: string;
}) {
  const upstreamBaseUrl = resolveLiveApiBase();
  if (!upstreamBaseUrl) {
    return await buildLocalAdminResearchOpsSnapshot(args);
  }

  const timeZone = resolveReportTimeZone(args?.timeZone);
  const localDate = normalizeLocalDate(args?.localDate);
  const cacheKey = buildUpstreamCacheKey(upstreamBaseUrl, timeZone, localDate);

  const cached = getFreshCachedUpstreamSnapshot(cacheKey);
  if (cached) {
    return markLiveUpstreamSnapshot(cached.payload, cached.baseUrl);
  }

  const recentFailure = getRecentUpstreamFailure(cacheKey);
  if (recentFailure) {
    const localSnapshot = await buildLocalAdminResearchOpsSnapshot({
      timeZone,
      localDate,
    });
    return markLocalFallbackSnapshot(localSnapshot, upstreamBaseUrl, recentFailure.error);
  }

  try {
    const result = await withSoftTimeout(
      fetchUpstreamSnapshot({
        timeZone,
        localDate,
      }),
      UPSTREAM_SOFT_TIMEOUT_MS,
      'UPSTREAM_FAST_TIMEOUT',
    );
    if (!result?.payload) {
      rememberUpstreamFailure(cacheKey, 'UPSTREAM_EMPTY');
      const localSnapshot = await buildLocalAdminResearchOpsSnapshot(args);
      return markLocalFallbackSnapshot(localSnapshot, upstreamBaseUrl, 'UPSTREAM_EMPTY');
    }
    return markLiveUpstreamSnapshot(result.payload, result.baseUrl);
  } catch (error) {
    rememberUpstreamFailure(cacheKey, error);
    const localSnapshot = await buildLocalAdminResearchOpsSnapshot({
      timeZone,
      localDate,
    });
    return markLocalFallbackSnapshot(
      localSnapshot,
      upstreamBaseUrl,
      error instanceof Error ? error.message : String(error || 'UPSTREAM_FETCH_FAILED'),
    );
  }
}

import { Pool } from 'pg';
import type { AdminAlphaSnapshot } from './liveAlpha.js';
import type { AdminResearchOpsSnapshot } from './liveOps.js';
import { getNovaModelPlan, getNovaRoutingPolicies, getNovaRuntimeMode } from '../ai/llmOps.js';
import type { AlphaEvaluationMetrics } from '../alpha_registry/index.js';
import { readAlphaDiscoveryConfig } from '../alpha_discovery/index.js';
import { MIN_AUTOMATIC_TRAINING_ROWS } from '../nova/flywheel.js';
import {
  qualifyPgTable,
  quotePgIdentifier,
  resolvePostgresBusinessUrl,
} from '../db/postgresMigration.js';
import { decodeSignalContract } from '../quant/service.js';
import type {
  AlphaIntegrationPath,
  AlphaLifecycleState,
  AssetClass,
  DecisionSnapshotRecord,
  ExecutionMode,
  ExecutionRecord,
  Market,
  MarketStateRecord,
  NotificationEventRecord,
  NotificationPreferenceRecord,
  PerformanceSnapshotRecord,
  SignalRecord,
  UserRiskProfileRecord,
  UserRitualEventRecord,
} from '../types.js';

type JsonObject = Record<string, unknown>;

type CountItem = {
  label: string;
  value: number;
};

type AlphaCandidateRow = {
  id: string;
  thesis: string;
  family: string;
  integration_path: AlphaIntegrationPath | string;
  status: AlphaLifecycleState | string;
  acceptance_score: number | null;
  updated_at_ms: number;
};

type AlphaEvaluationRow = {
  id: string;
  alpha_candidate_id: string;
  evaluation_status: string;
  acceptance_score: number | null;
  metrics_json: string;
  rejection_reasons_json: string;
  created_at_ms: number;
};

type AlphaLifecycleEventRow = {
  id: string;
  alpha_candidate_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  created_at_ms: number;
};

type AlphaShadowObservationRow = {
  id: string;
  alpha_candidate_id: string;
  signal_id: string;
  market: string;
  symbol: string;
  shadow_action: string;
  alignment_score: number;
  adjusted_confidence: number | null;
  suggested_weight_multiplier: number | null;
  realized_pnl_pct: number | null;
  realized_source: string | null;
  payload_json: string;
  created_at_ms: number;
  updated_at_ms: number;
};

type WorkflowRunRow = {
  id: string;
  workflow_key: string;
  workflow_version: string;
  trigger_type: string;
  status: string;
  trace_id: string | null;
  input_json: string;
  output_json: string | null;
  attempt_count: number;
  started_at_ms: number;
  updated_at_ms: number;
  completed_at_ms: number | null;
};

type NewsItemRow = {
  id: string;
  market: string;
  symbol: string;
  headline: string;
  source: string;
  published_at_ms: number;
  sentiment_label: string;
  relevance_score: number;
  payload_json: string;
  updated_at_ms: number;
};

type FundamentalSnapshotRow = {
  id: string;
  symbol: string;
  source: string;
  asof_date: string;
  payload_json: string;
  updated_at_ms: number;
};

type OptionChainSnapshotRow = {
  id: string;
  symbol: string;
  expiration_date: string | null;
  snapshot_ts_ms: number;
  source: string;
  payload_json: string;
  updated_at_ms: number;
};

type SignalRow = {
  signal_id: string;
  market: string;
  asset_class: string;
  symbol: string;
  strategy_id: string;
  direction: string;
  status: string;
  score: number;
  confidence: number;
  created_at_ms: number;
  payload_json: string;
};

type ApiKeyRow = {
  key_id: string;
  key_hash: string;
  label: string;
  scope: string;
  status: string;
};

type ExternalConnectionRow = {
  connection_id: string;
  user_id: string;
  connection_type: 'BROKER' | 'EXCHANGE';
  provider: string;
  mode: 'READ_ONLY' | 'TRADING';
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
  meta_json: string | null;
  updated_at_ms: number;
};

type NovaTaskRunRow = {
  id: string;
  task_type: string;
  route_alias: string;
  model_name: string;
  status: string;
  error: string | null;
  created_at_ms: number;
};

type BacktestRunMetricRow = {
  backtest_run_id: string;
  started_at_ms: number;
  completed_at_ms: number | null;
  run_status: string;
  net_return: number | null;
  sharpe: number | null;
  max_drawdown: number | null;
  realism_grade: string | null;
  robustness_grade: string | null;
  sample_size: number | null;
  metric_status: string | null;
};

type DailyWorkflowCountRow = {
  workflow_key: string;
  run_count: number;
  first_ms: number | null;
  last_ms: number | null;
};

type DailyTableCount = {
  count: number;
  last_ms: number | null;
  last_at: string | null;
};

type TrainingRunSummary = NonNullable<
  AdminResearchOpsSnapshot['throughput_recent']['latest_training']
>;

type DiscoveryAcceptedCandidate = NonNullable<
  AdminAlphaSnapshot['today']['recent_acceptances']
>[number];

type DiscoveryRejectedCandidate = NonNullable<
  AdminAlphaSnapshot['today']['recent_rejections']
>[number];

type RecentDiscoveryRun = NonNullable<AdminAlphaSnapshot['today']['recent_discovery_runs']>[number];
type RecentShadowRun = NonNullable<AdminAlphaSnapshot['today']['recent_shadow_runs']>[number];

type AlphaSummaryRecord = NonNullable<AdminAlphaSnapshot['candidates']>[number];

type AlphaRegistryBundle = {
  counts: Record<string, number>;
  registry_records: AdminAlphaSnapshot['top_candidates'];
  candidate_rows: AlphaSummaryRecord[];
  top_candidates: AdminAlphaSnapshot['top_candidates'];
  decaying_candidates: AdminAlphaSnapshot['decaying_candidates'];
  correlation_map: AdminAlphaSnapshot['correlation_map'];
  state_transitions: AdminAlphaSnapshot['state_transitions'];
  evaluationMap: Map<
    string,
    {
      evaluation: AlphaEvaluationRow | null;
      metrics: (AlphaEvaluationMetrics & JsonObject) | null;
      rejection_reasons: string[];
    }
  >;
};

let poolSingleton: Pool | null = null;

const PG_ALPHA_SHADOW_CANDIDATE_LIMIT = Math.max(
  40,
  Number(process.env.NOVA_ADMIN_PG_ALPHA_SHADOW_CANDIDATE_LIMIT || 120),
);
const PG_ALPHA_SHADOW_OBSERVATION_LIMIT = Math.max(
  40,
  Number(process.env.NOVA_ADMIN_PG_ALPHA_SHADOW_OBSERVATION_LIMIT || 160),
);

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
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

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNullableNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNullableString(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function toIso(ms: number | null | undefined) {
  return Number.isFinite(ms) ? new Date(Number(ms)).toISOString() : null;
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function countBy<T>(rows: T[], keyFn: (row: T) => string | null | undefined): CountItem[] {
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

function resolveReportTimeZone(explicitTimeZone?: string) {
  return (
    String(explicitTimeZone || process.env.NOVA_ADMIN_REPORT_TIMEZONE || 'Asia/Shanghai').trim() ||
    'Asia/Shanghai'
  );
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

function shouldUseSsl(connectionString: string) {
  if (
    String(process.env.NOVA_DATA_PG_SSL || '')
      .trim()
      .toLowerCase() === 'disable'
  ) {
    return false;
  }
  return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
}

function resolvePostgresBusinessSchema() {
  return String(process.env.NOVA_DATA_PG_SCHEMA || 'novaquant_data').trim() || 'novaquant_data';
}

function qualifyBusinessTable(tableName: string) {
  return qualifyPgTable(resolvePostgresBusinessSchema(), tableName);
}

export function hasPostgresBusinessMirror() {
  return Boolean(resolvePostgresBusinessUrl());
}

function getBusinessPool() {
  if (!hasPostgresBusinessMirror()) {
    throw new Error('POSTGRES_BUSINESS_STORE_NOT_CONFIGURED');
  }
  if (poolSingleton) return poolSingleton;
  const connectionString = resolvePostgresBusinessUrl();
  poolSingleton = new Pool({
    connectionString,
    max: Math.max(1, Number(process.env.NOVA_DATA_PG_POOL_MAX || 5)),
    connectionTimeoutMillis: Math.max(
      500,
      Number(process.env.NOVA_DATA_PG_CONNECT_TIMEOUT_MS || 1_200),
    ),
    idleTimeoutMillis: Math.max(1_000, Number(process.env.NOVA_DATA_PG_IDLE_TIMEOUT_MS || 10_000)),
    query_timeout: Math.max(1_000, Number(process.env.NOVA_DATA_PG_QUERY_TIMEOUT_MS || 8_000)),
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  return poolSingleton;
}

async function queryRows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const pool = getBusinessPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

async function queryRow<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const rows = await queryRows<T>(sql, params);
  return rows[0] || null;
}

async function listAlphaCandidates(limit = 200): Promise<AlphaCandidateRow[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT id, thesis, family, integration_path, status, acceptance_score, updated_at_ms
      FROM ${qualifyBusinessTable('alpha_candidates')}
      ORDER BY updated_at_ms DESC, acceptance_score DESC
      LIMIT $1
    `,
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    thesis: String(row.thesis || ''),
    family: String(row.family || ''),
    integration_path: String(row.integration_path || ''),
    status: String(row.status || ''),
    acceptance_score: toNullableNumber(row.acceptance_score),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

async function listLatestAlphaEvaluations(candidateIds: string[]): Promise<AlphaEvaluationRow[]> {
  if (!candidateIds.length) return [];
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT DISTINCT ON (alpha_candidate_id)
        id,
        alpha_candidate_id,
        evaluation_status,
        acceptance_score,
        metrics_json,
        rejection_reasons_json,
        created_at_ms
      FROM ${qualifyBusinessTable('alpha_evaluations')}
      WHERE alpha_candidate_id = ANY($1::text[])
      ORDER BY alpha_candidate_id ASC, created_at_ms DESC
    `,
    [candidateIds],
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    alpha_candidate_id: String(row.alpha_candidate_id || ''),
    evaluation_status: String(row.evaluation_status || ''),
    acceptance_score: toNullableNumber(row.acceptance_score),
    metrics_json: String(row.metrics_json || '{}'),
    rejection_reasons_json: String(row.rejection_reasons_json || '[]'),
    created_at_ms: toNumber(row.created_at_ms),
  }));
}

async function listAlphaLifecycleEvents(limit = 120): Promise<AlphaLifecycleEventRow[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT id, alpha_candidate_id, from_status, to_status, reason, created_at_ms
      FROM ${qualifyBusinessTable('alpha_lifecycle_events')}
      ORDER BY created_at_ms DESC
      LIMIT $1
    `,
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    alpha_candidate_id: String(row.alpha_candidate_id || ''),
    from_status: toNullableString(row.from_status),
    to_status: String(row.to_status || ''),
    reason: toNullableString(row.reason),
    created_at_ms: toNumber(row.created_at_ms),
  }));
}

async function listAlphaShadowObservations(
  candidateIds: string[],
  perCandidateLimit = 400,
): Promise<AlphaShadowObservationRow[]> {
  if (!candidateIds.length) return [];
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        id,
        alpha_candidate_id,
        signal_id,
        market,
        symbol,
        shadow_action,
        alignment_score,
        adjusted_confidence,
        suggested_weight_multiplier,
        realized_pnl_pct,
        realized_source,
        payload_json,
        created_at_ms,
        updated_at_ms
      FROM (
        SELECT
          id,
          alpha_candidate_id,
          signal_id,
          market,
          symbol,
          shadow_action,
          alignment_score,
          adjusted_confidence,
          suggested_weight_multiplier,
          realized_pnl_pct,
          realized_source,
          payload_json,
          created_at_ms,
          updated_at_ms,
          ROW_NUMBER() OVER (
            PARTITION BY alpha_candidate_id
            ORDER BY updated_at_ms DESC, created_at_ms DESC
          ) AS rn
        FROM ${qualifyBusinessTable('alpha_shadow_observations')}
        WHERE alpha_candidate_id = ANY($1::text[])
      ) ranked
      WHERE rn <= $2
      ORDER BY alpha_candidate_id ASC, updated_at_ms DESC, created_at_ms DESC
    `,
    [candidateIds, perCandidateLimit],
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    alpha_candidate_id: String(row.alpha_candidate_id || ''),
    signal_id: String(row.signal_id || ''),
    market: String(row.market || ''),
    symbol: String(row.symbol || ''),
    shadow_action: String(row.shadow_action || ''),
    alignment_score: toNumber(row.alignment_score),
    adjusted_confidence: toNullableNumber(row.adjusted_confidence),
    suggested_weight_multiplier: toNullableNumber(row.suggested_weight_multiplier),
    realized_pnl_pct: toNullableNumber(row.realized_pnl_pct),
    realized_source: toNullableString(row.realized_source),
    payload_json: String(row.payload_json || '{}'),
    created_at_ms: toNumber(row.created_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

async function listWorkflowRuns(limit: number, workflowKeys?: string[]): Promise<WorkflowRunRow[]> {
  const params: unknown[] = [limit];
  const filterSql = workflowKeys?.length ? `WHERE workflow_key = ANY($2::text[])` : '';
  if (workflowKeys?.length) params.push(workflowKeys);
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        id,
        workflow_key,
        workflow_version,
        trigger_type,
        status,
        trace_id,
        input_json,
        output_json,
        attempt_count,
        started_at_ms,
        updated_at_ms,
        completed_at_ms
      FROM ${qualifyBusinessTable('workflow_runs')}
      ${filterSql}
      ORDER BY updated_at_ms DESC
      LIMIT $1
    `,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    workflow_key: String(row.workflow_key || ''),
    workflow_version: String(row.workflow_version || ''),
    trigger_type: String(row.trigger_type || ''),
    status: String(row.status || ''),
    trace_id: toNullableString(row.trace_id),
    input_json: String(row.input_json || '{}'),
    output_json: toNullableString(row.output_json),
    attempt_count: toNumber(row.attempt_count),
    started_at_ms: toNumber(row.started_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
    completed_at_ms: toNullableNumber(row.completed_at_ms),
  }));
}

async function listNewsItems(limit: number, sinceMs?: number): Promise<NewsItemRow[]> {
  const params: unknown[] = [];
  const whereSql = typeof sinceMs === 'number' ? 'WHERE published_at_ms >= $1' : '';
  if (typeof sinceMs === 'number') params.push(sinceMs);
  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        id,
        market,
        symbol,
        headline,
        source,
        published_at_ms,
        sentiment_label,
        relevance_score,
        payload_json,
        updated_at_ms
      FROM ${qualifyBusinessTable('news_items')}
      ${whereSql}
      ORDER BY published_at_ms DESC, updated_at_ms DESC
      LIMIT ${limitPlaceholder}
    `,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    market: String(row.market || ''),
    symbol: String(row.symbol || ''),
    headline: String(row.headline || ''),
    source: String(row.source || ''),
    published_at_ms: toNumber(row.published_at_ms),
    sentiment_label: String(row.sentiment_label || ''),
    relevance_score: toNumber(row.relevance_score),
    payload_json: String(row.payload_json || '{}'),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

async function listFundamentalSnapshots(
  limit: number,
  market?: string,
): Promise<FundamentalSnapshotRow[]> {
  const params: unknown[] = [];
  const whereSql = market ? 'WHERE market = $1' : '';
  if (market) params.push(market);
  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT id, symbol, source, asof_date, payload_json, updated_at_ms
      FROM ${qualifyBusinessTable('fundamental_snapshots')}
      ${whereSql}
      ORDER BY updated_at_ms DESC
      LIMIT ${limitPlaceholder}
    `,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    symbol: String(row.symbol || ''),
    source: String(row.source || ''),
    asof_date: String(row.asof_date || ''),
    payload_json: String(row.payload_json || '{}'),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

async function listOptionChainSnapshots(
  limit: number,
  market?: string,
): Promise<OptionChainSnapshotRow[]> {
  const params: unknown[] = [];
  const whereSql = market ? 'WHERE market = $1' : '';
  if (market) params.push(market);
  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT id, symbol, expiration_date, snapshot_ts_ms, source, payload_json, updated_at_ms
      FROM ${qualifyBusinessTable('option_chain_snapshots')}
      ${whereSql}
      ORDER BY snapshot_ts_ms DESC, updated_at_ms DESC
      LIMIT ${limitPlaceholder}
    `,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    symbol: String(row.symbol || ''),
    expiration_date: toNullableString(row.expiration_date),
    snapshot_ts_ms: toNumber(row.snapshot_ts_ms),
    source: String(row.source || ''),
    payload_json: String(row.payload_json || '{}'),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

async function listSignals(limit: number, args?: { status?: string; sinceMs?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (args?.status && args.status !== 'ALL') {
    params.push(args.status);
    where.push(`status = $${params.length}`);
  }
  if (typeof args?.sinceMs === 'number') {
    params.push(args.sinceMs);
    where.push(`created_at_ms >= $${params.length}`);
  }
  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        signal_id,
        market,
        asset_class,
        symbol,
        strategy_id,
        direction,
        status,
        score,
        confidence,
        created_at_ms,
        payload_json
      FROM ${qualifyBusinessTable('signals')}
      ${whereSql}
      ORDER BY score DESC, created_at_ms DESC
      LIMIT ${limitPlaceholder}
    `,
    params,
  );
  return rows.map((row) => ({
    signal_id: String(row.signal_id || ''),
    market: String(row.market || ''),
    asset_class: String(row.asset_class || ''),
    symbol: String(row.symbol || ''),
    strategy_id: String(row.strategy_id || ''),
    direction: String(row.direction || ''),
    status: String(row.status || ''),
    score: toNumber(row.score),
    confidence: toNumber(row.confidence),
    created_at_ms: toNumber(row.created_at_ms),
    payload_json: String(row.payload_json || '{}'),
  })) as SignalRow[];
}

async function listRecentSignalsSince(limit: number, sinceMs: number): Promise<SignalRow[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        signal_id,
        market,
        asset_class,
        symbol,
        strategy_id,
        direction,
        status,
        score,
        confidence,
        created_at_ms,
        payload_json
      FROM ${qualifyBusinessTable('signals')}
      WHERE created_at_ms >= $1
      ORDER BY created_at_ms DESC, score DESC
      LIMIT $2
    `,
    [sinceMs, limit],
  );
  return rows.map((row) => ({
    signal_id: String(row.signal_id || ''),
    market: String(row.market || ''),
    asset_class: String(row.asset_class || ''),
    symbol: String(row.symbol || ''),
    strategy_id: String(row.strategy_id || ''),
    direction: String(row.direction || ''),
    status: String(row.status || ''),
    score: toNumber(row.score),
    confidence: toNumber(row.confidence),
    created_at_ms: toNumber(row.created_at_ms),
    payload_json: String(row.payload_json || '{}'),
  }));
}

function mapSignalRecord(row: Record<string, unknown>): SignalRecord {
  return {
    signal_id: String(row.signal_id || ''),
    created_at_ms: toNumber(row.created_at_ms),
    expires_at_ms: toNumber(row.expires_at_ms),
    asset_class: String(row.asset_class || 'US_STOCK') as SignalRecord['asset_class'],
    market: String(row.market || 'US') as Market,
    symbol: String(row.symbol || ''),
    timeframe: String(row.timeframe || ''),
    strategy_id: String(row.strategy_id || ''),
    strategy_family: String(row.strategy_family || ''),
    strategy_version: String(row.strategy_version || ''),
    regime_id: String(row.regime_id || ''),
    temperature_percentile: toNumber(row.temperature_percentile),
    volatility_percentile: toNumber(row.volatility_percentile),
    direction: String(row.direction || 'LONG') as SignalRecord['direction'],
    strength: toNumber(row.strength),
    confidence: toNumber(row.confidence),
    entry_low: toNumber(row.entry_low),
    entry_high: toNumber(row.entry_high),
    entry_method: String(row.entry_method || ''),
    invalidation_level: toNumber(row.invalidation_level),
    stop_type: String(row.stop_type || ''),
    stop_price: toNumber(row.stop_price),
    tp1_price: toNullableNumber(row.tp1_price),
    tp1_size_pct: toNullableNumber(row.tp1_size_pct),
    tp2_price: toNullableNumber(row.tp2_price),
    tp2_size_pct: toNullableNumber(row.tp2_size_pct),
    trailing_type: String(row.trailing_type || ''),
    trailing_params_json: String(row.trailing_params_json || '{}'),
    position_pct: toNumber(row.position_pct),
    leverage_cap: toNumber(row.leverage_cap),
    risk_bucket_applied: String(row.risk_bucket_applied || ''),
    fee_bps: toNumber(row.fee_bps),
    spread_bps: toNumber(row.spread_bps),
    slippage_bps: toNumber(row.slippage_bps),
    funding_est_bps: toNullableNumber(row.funding_est_bps),
    basis_est: toNullableNumber(row.basis_est),
    expected_r: toNumber(row.expected_r),
    hit_rate_est: toNumber(row.hit_rate_est),
    sample_size: toNumber(row.sample_size),
    expected_max_dd_est: toNullableNumber(row.expected_max_dd_est),
    status: String(row.status || 'NEW') as SignalRecord['status'],
    score: toNumber(row.score),
    payload_json: String(row.payload_json || '{}'),
    updated_at_ms: toNumber(row.updated_at_ms),
  };
}

export async function readPostgresSignalRecords(args?: {
  assetClass?: AssetClass;
  market?: Market;
  symbol?: string;
  status?: 'ALL' | 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED';
  limit?: number;
}): Promise<SignalRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (args?.assetClass) {
    params.push(args.assetClass);
    where.push(`asset_class = $${params.length}`);
  }
  if (args?.market) {
    params.push(args.market);
    where.push(`market = $${params.length}`);
  }
  if (args?.symbol) {
    params.push(String(args.symbol).toUpperCase());
    where.push(`symbol = $${params.length}`);
  }
  if (args?.status && args.status !== 'ALL') {
    params.push(args.status);
    where.push(`status = $${params.length}`);
  }
  params.push(Math.max(1, Number(args?.limit || 40)));
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        signal_id,
        created_at_ms,
        expires_at_ms,
        asset_class,
        market,
        symbol,
        timeframe,
        strategy_id,
        strategy_family,
        strategy_version,
        regime_id,
        temperature_percentile,
        volatility_percentile,
        direction,
        strength,
        confidence,
        entry_low,
        entry_high,
        entry_method,
        invalidation_level,
        stop_type,
        stop_price,
        tp1_price,
        tp1_size_pct,
        tp2_price,
        tp2_size_pct,
        trailing_type,
        trailing_params_json,
        position_pct,
        leverage_cap,
        risk_bucket_applied,
        fee_bps,
        spread_bps,
        slippage_bps,
        funding_est_bps,
        basis_est,
        expected_r,
        hit_rate_est,
        sample_size,
        expected_max_dd_est,
        status,
        score,
        payload_json,
        updated_at_ms
      FROM ${qualifyBusinessTable('signals')}
      ${whereSql}
      ORDER BY score DESC, created_at_ms DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return rows.map(mapSignalRecord);
}

export async function readPostgresSignalRecord(signalId: string): Promise<SignalRecord | null> {
  const row = await queryRow<Record<string, unknown>>(
    `
      SELECT
        signal_id,
        created_at_ms,
        expires_at_ms,
        asset_class,
        market,
        symbol,
        timeframe,
        strategy_id,
        strategy_family,
        strategy_version,
        regime_id,
        temperature_percentile,
        volatility_percentile,
        direction,
        strength,
        confidence,
        entry_low,
        entry_high,
        entry_method,
        invalidation_level,
        stop_type,
        stop_price,
        tp1_price,
        tp1_size_pct,
        tp2_price,
        tp2_size_pct,
        trailing_type,
        trailing_params_json,
        position_pct,
        leverage_cap,
        risk_bucket_applied,
        fee_bps,
        spread_bps,
        slippage_bps,
        funding_est_bps,
        basis_est,
        expected_r,
        hit_rate_est,
        sample_size,
        expected_max_dd_est,
        status,
        score,
        payload_json,
        updated_at_ms
      FROM ${qualifyBusinessTable('signals')}
      WHERE signal_id = $1
      LIMIT 1
    `,
    [signalId],
  );
  return row ? mapSignalRecord(row) : null;
}

export async function readPostgresExecutionRecords(args?: {
  userId?: string;
  market?: Market;
  mode?: ExecutionMode;
  signalId?: string;
  limit?: number;
}): Promise<ExecutionRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (args?.userId) {
    params.push(args.userId);
    where.push(`user_id = $${params.length}`);
  }
  if (args?.market) {
    params.push(args.market);
    where.push(`market = $${params.length}`);
  }
  if (args?.mode) {
    params.push(args.mode);
    where.push(`mode = $${params.length}`);
  }
  if (args?.signalId) {
    params.push(args.signalId);
    where.push(`signal_id = $${params.length}`);
  }
  params.push(Math.max(1, Number(args?.limit || 200)));
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        execution_id,
        signal_id,
        user_id,
        mode,
        action,
        market,
        symbol,
        entry_price,
        stop_price,
        tp_price,
        size_pct,
        pnl_pct,
        note,
        created_at_ms,
        updated_at_ms
      FROM ${qualifyBusinessTable('executions')}
      ${whereSql}
      ORDER BY created_at_ms DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return rows.map((row) => ({
    execution_id: String(row.execution_id || ''),
    signal_id: String(row.signal_id || ''),
    user_id: String(row.user_id || ''),
    mode: String(row.mode || 'PAPER') as ExecutionMode,
    action: String(row.action || 'EXECUTE') as ExecutionRecord['action'],
    market: String(row.market || 'US') as Market,
    symbol: String(row.symbol || ''),
    entry_price: toNullableNumber(row.entry_price),
    stop_price: toNullableNumber(row.stop_price),
    tp_price: toNullableNumber(row.tp_price),
    size_pct: toNullableNumber(row.size_pct),
    pnl_pct: toNullableNumber(row.pnl_pct),
    note: toNullableString(row.note),
    created_at_ms: toNumber(row.created_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

export async function readPostgresRiskProfile(
  userId: string,
): Promise<UserRiskProfileRecord | null> {
  const row = await queryRow<Record<string, unknown>>(
    `
      SELECT
        user_id,
        profile_key,
        max_loss_per_trade,
        max_daily_loss,
        max_drawdown,
        exposure_cap,
        leverage_cap,
        updated_at_ms
      FROM ${qualifyBusinessTable('user_risk_profiles')}
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId],
  );
  if (!row) return null;
  return {
    user_id: String(row.user_id || ''),
    profile_key: String(row.profile_key || 'balanced') as UserRiskProfileRecord['profile_key'],
    max_loss_per_trade: toNumber(row.max_loss_per_trade),
    max_daily_loss: toNumber(row.max_daily_loss),
    max_drawdown: toNumber(row.max_drawdown),
    exposure_cap: toNumber(row.exposure_cap),
    leverage_cap: toNumber(row.leverage_cap),
    updated_at_ms: toNumber(row.updated_at_ms),
  };
}

export async function readPostgresMarketState(args?: {
  market?: Market;
  symbol?: string;
  timeframe?: string;
}): Promise<MarketStateRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (args?.market) {
    params.push(args.market);
    where.push(`market = $${params.length}`);
  }
  if (args?.symbol) {
    params.push(String(args.symbol).toUpperCase());
    where.push(`symbol = $${params.length}`);
  }
  if (args?.timeframe) {
    params.push(args.timeframe);
    where.push(`timeframe = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        market,
        symbol,
        timeframe,
        snapshot_ts_ms,
        regime_id,
        trend_strength,
        temperature_percentile,
        volatility_percentile,
        risk_off_score,
        stance,
        event_stats_json,
        assumptions_json,
        updated_at_ms
      FROM ${qualifyBusinessTable('market_state')}
      ${whereSql}
      ORDER BY temperature_percentile DESC, updated_at_ms DESC
    `,
    params,
  );
  return rows.map((row) => ({
    market: String(row.market || 'US') as Market,
    symbol: String(row.symbol || ''),
    timeframe: String(row.timeframe || ''),
    snapshot_ts_ms: toNumber(row.snapshot_ts_ms),
    regime_id: String(row.regime_id || ''),
    trend_strength: toNumber(row.trend_strength),
    temperature_percentile: toNumber(row.temperature_percentile),
    volatility_percentile: toNumber(row.volatility_percentile),
    risk_off_score: toNumber(row.risk_off_score),
    stance: String(row.stance || ''),
    event_stats_json: String(row.event_stats_json || '{}'),
    assumptions_json: String(row.assumptions_json || '{}'),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

export async function readPostgresPerformanceSnapshots(args?: {
  market?: Market;
  range?: string;
  segmentType?: string;
}): Promise<PerformanceSnapshotRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (args?.market) {
    params.push(args.market);
    where.push(`market = $${params.length}`);
  }
  if (args?.range) {
    params.push(args.range);
    where.push(`range = $${params.length}`);
  }
  if (args?.segmentType) {
    params.push(args.segmentType);
    where.push(`segment_type = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        market,
        range,
        segment_type,
        segment_key,
        source_label,
        sample_size,
        payload_json,
        asof_ms,
        updated_at_ms
      FROM ${qualifyBusinessTable('performance_snapshots')}
      ${whereSql}
      ORDER BY asof_ms DESC, sample_size DESC
    `,
    params,
  );
  return rows.map((row) => ({
    market: String(row.market || 'US') as Market,
    range: String(row.range || ''),
    segment_type: String(
      row.segment_type || 'OVERALL',
    ) as PerformanceSnapshotRecord['segment_type'],
    segment_key: String(row.segment_key || ''),
    source_label: String(
      row.source_label || 'BACKTEST',
    ) as PerformanceSnapshotRecord['source_label'],
    sample_size: toNumber(row.sample_size),
    payload_json: String(row.payload_json || '{}'),
    asof_ms: toNumber(row.asof_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

export async function readPostgresLatestDecisionSnapshot(args: {
  userId: string;
  market?: Market | 'ALL';
  assetClass?: AssetClass | 'ALL';
}): Promise<DecisionSnapshotRecord | null> {
  const where = ['user_id = $1'];
  const params: unknown[] = [args.userId];
  if (args.market) {
    params.push(args.market);
    where.push(`market = $${params.length}`);
  }
  if (args.assetClass) {
    params.push(args.assetClass);
    where.push(`asset_class = $${params.length}`);
  }
  const row = await queryRow<Record<string, unknown>>(
    `
      SELECT
        id,
        user_id,
        market,
        asset_class,
        snapshot_date,
        context_hash,
        evidence_mode,
        performance_mode,
        source_status,
        data_status,
        risk_state_json,
        portfolio_context_json,
        actions_json,
        summary_json,
        top_action_id,
        created_at_ms,
        updated_at_ms
      FROM ${qualifyBusinessTable('decision_snapshots')}
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at_ms DESC
      LIMIT 1
    `,
    params,
  );
  if (!row) return null;
  return {
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    market: String(row.market || 'US') as DecisionSnapshotRecord['market'],
    asset_class: String(row.asset_class || 'ALL') as DecisionSnapshotRecord['asset_class'],
    snapshot_date: String(row.snapshot_date || ''),
    context_hash: String(row.context_hash || ''),
    evidence_mode: String(
      row.evidence_mode || 'UNAVAILABLE',
    ) as DecisionSnapshotRecord['evidence_mode'],
    performance_mode: String(
      row.performance_mode || 'UNAVAILABLE',
    ) as DecisionSnapshotRecord['performance_mode'],
    source_status: String(row.source_status || ''),
    data_status: String(row.data_status || ''),
    risk_state_json: String(row.risk_state_json || '{}'),
    portfolio_context_json: String(row.portfolio_context_json || '{}'),
    actions_json: String(row.actions_json || '[]'),
    summary_json: String(row.summary_json || '{}'),
    top_action_id: toNullableString(row.top_action_id),
    created_at_ms: toNumber(row.created_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
  };
}

export async function readPostgresDecisionSnapshots(args: {
  userId: string;
  market?: Market | 'ALL';
  assetClass?: AssetClass | 'ALL';
  limit?: number;
}): Promise<DecisionSnapshotRecord[]> {
  const where = ['user_id = $1'];
  const params: unknown[] = [args.userId];
  if (args.market) {
    params.push(args.market);
    where.push(`market = $${params.length}`);
  }
  if (args.assetClass) {
    params.push(args.assetClass);
    where.push(`asset_class = $${params.length}`);
  }
  params.push(Math.max(1, Number(args.limit || 6)));
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        id,
        user_id,
        market,
        asset_class,
        snapshot_date,
        context_hash,
        evidence_mode,
        performance_mode,
        source_status,
        data_status,
        risk_state_json,
        portfolio_context_json,
        actions_json,
        summary_json,
        top_action_id,
        created_at_ms,
        updated_at_ms
      FROM ${qualifyBusinessTable('decision_snapshots')}
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at_ms DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    market: String(row.market || 'US') as DecisionSnapshotRecord['market'],
    asset_class: String(row.asset_class || 'ALL') as DecisionSnapshotRecord['asset_class'],
    snapshot_date: String(row.snapshot_date || ''),
    context_hash: String(row.context_hash || ''),
    evidence_mode: String(
      row.evidence_mode || 'UNAVAILABLE',
    ) as DecisionSnapshotRecord['evidence_mode'],
    performance_mode: String(
      row.performance_mode || 'UNAVAILABLE',
    ) as DecisionSnapshotRecord['performance_mode'],
    source_status: String(row.source_status || ''),
    data_status: String(row.data_status || ''),
    risk_state_json: String(row.risk_state_json || '{}'),
    portfolio_context_json: String(row.portfolio_context_json || '{}'),
    actions_json: String(row.actions_json || '[]'),
    summary_json: String(row.summary_json || '{}'),
    top_action_id: toNullableString(row.top_action_id),
    created_at_ms: toNumber(row.created_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

export async function readPostgresUserRitualEvents(args: {
  userId: string;
  market?: Market | 'ALL';
  assetClass?: AssetClass | 'ALL';
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<UserRitualEventRecord[]> {
  const where = ['user_id = $1'];
  const params: unknown[] = [args.userId];
  if (args.market) {
    params.push(args.market);
    where.push(`market = $${params.length}`);
  }
  if (args.assetClass) {
    params.push(args.assetClass);
    where.push(`asset_class = $${params.length}`);
  }
  if (args.fromDate) {
    params.push(args.fromDate);
    where.push(`event_date >= $${params.length}`);
  }
  if (args.toDate) {
    params.push(args.toDate);
    where.push(`event_date <= $${params.length}`);
  }
  params.push(Math.max(1, Number(args.limit || 120)));
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        id,
        user_id,
        market,
        asset_class,
        event_date,
        week_key,
        event_type,
        snapshot_id,
        reason_json,
        created_at_ms,
        updated_at_ms
      FROM ${qualifyBusinessTable('user_ritual_events')}
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at_ms DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    market: String(row.market || 'US') as UserRitualEventRecord['market'],
    asset_class: String(row.asset_class || 'ALL') as UserRitualEventRecord['asset_class'],
    event_date: String(row.event_date || ''),
    week_key: toNullableString(row.week_key),
    event_type: String(
      row.event_type || 'MORNING_CHECK_COMPLETED',
    ) as UserRitualEventRecord['event_type'],
    snapshot_id: toNullableString(row.snapshot_id),
    reason_json: String(row.reason_json || '{}'),
    created_at_ms: toNumber(row.created_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

export async function readPostgresNotificationPreferences(
  userId: string,
): Promise<NotificationPreferenceRecord | null> {
  const row = await queryRow<Record<string, unknown>>(
    `
      SELECT
        user_id,
        morning_enabled,
        state_shift_enabled,
        protective_enabled,
        wrap_up_enabled,
        frequency,
        quiet_start_hour,
        quiet_end_hour,
        updated_at_ms
      FROM ${qualifyBusinessTable('user_notification_preferences')}
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId],
  );
  if (!row) return null;
  return {
    user_id: String(row.user_id || ''),
    morning_enabled: toNumber(row.morning_enabled),
    state_shift_enabled: toNumber(row.state_shift_enabled),
    protective_enabled: toNumber(row.protective_enabled),
    wrap_up_enabled: toNumber(row.wrap_up_enabled),
    frequency: String(row.frequency || 'NORMAL') as NotificationPreferenceRecord['frequency'],
    quiet_start_hour: toNullableNumber(row.quiet_start_hour),
    quiet_end_hour: toNullableNumber(row.quiet_end_hour),
    updated_at_ms: toNumber(row.updated_at_ms),
  };
}

export async function readPostgresNotificationEvents(args: {
  userId: string;
  market?: Market | 'ALL';
  assetClass?: AssetClass | 'ALL';
  status?: string;
  limit?: number;
}): Promise<NotificationEventRecord[]> {
  const where = ['user_id = $1'];
  const params: unknown[] = [args.userId];
  if (args.market) {
    params.push(args.market);
    where.push(`market = $${params.length}`);
  }
  if (args.assetClass) {
    params.push(args.assetClass);
    where.push(`asset_class = $${params.length}`);
  }
  if (args.status) {
    params.push(args.status);
    where.push(`status = $${params.length}`);
  }
  params.push(Math.max(1, Number(args.limit || 12)));
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        id,
        user_id,
        market,
        asset_class,
        category,
        trigger_type,
        fingerprint,
        title,
        body,
        tone,
        status,
        action_target,
        reason_json,
        created_at_ms,
        updated_at_ms
      FROM ${qualifyBusinessTable('notification_events')}
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at_ms DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    market: String(row.market || 'US') as NotificationEventRecord['market'],
    asset_class: String(row.asset_class || 'ALL') as NotificationEventRecord['asset_class'],
    category: String(row.category || 'RHYTHM') as NotificationEventRecord['category'],
    trigger_type: String(row.trigger_type || ''),
    fingerprint: String(row.fingerprint || ''),
    title: String(row.title || ''),
    body: String(row.body || ''),
    tone: String(row.tone || ''),
    status: String(row.status || 'ACTIVE') as NotificationEventRecord['status'],
    action_target: toNullableString(row.action_target),
    reason_json: String(row.reason_json || '{}'),
    created_at_ms: toNumber(row.created_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

export async function readPostgresExternalConnections(args: {
  userId: string;
  connectionType?: 'BROKER' | 'EXCHANGE';
}): Promise<ExternalConnectionRow[]> {
  const where = ['user_id = $1'];
  const params: unknown[] = [args.userId];
  if (args.connectionType) {
    params.push(args.connectionType);
    where.push(`connection_type = $${params.length}`);
  }
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        connection_id,
        user_id,
        connection_type,
        provider,
        mode,
        status,
        meta_json,
        updated_at_ms
      FROM ${qualifyBusinessTable('external_connections')}
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at_ms DESC
    `,
    params,
  );
  return rows.map((row) => ({
    connection_id: String(row.connection_id || ''),
    user_id: String(row.user_id || ''),
    connection_type: String(
      row.connection_type || 'BROKER',
    ) as ExternalConnectionRow['connection_type'],
    provider: String(row.provider || ''),
    mode: String(row.mode || 'READ_ONLY') as ExternalConnectionRow['mode'],
    status: String(row.status || 'PENDING') as ExternalConnectionRow['status'],
    meta_json: toNullableString(row.meta_json),
    updated_at_ms: toNumber(row.updated_at_ms),
  }));
}

export async function readPostgresApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
  const row = await queryRow<Record<string, unknown>>(
    `
      SELECT key_id, key_hash, label, scope, status
      FROM ${qualifyBusinessTable('api_keys')}
      WHERE key_hash = $1
      LIMIT 1
    `,
    [keyHash],
  );
  if (!row) return null;
  return {
    key_id: String(row.key_id || ''),
    key_hash: String(row.key_hash || ''),
    label: String(row.label || ''),
    scope: String(row.scope || ''),
    status: String(row.status || ''),
  };
}

async function listNovaTaskRuns(limit: number): Promise<NovaTaskRunRow[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT id, task_type, route_alias, model_name, status, error, created_at_ms
      FROM ${qualifyBusinessTable('nova_task_runs')}
      ORDER BY created_at_ms DESC
      LIMIT $1
    `,
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    task_type: String(row.task_type || ''),
    route_alias: String(row.route_alias || ''),
    model_name: String(row.model_name || ''),
    status: String(row.status || ''),
    error: toNullableString(row.error),
    created_at_ms: toNumber(row.created_at_ms),
  }));
}

async function listAlphaEvaluationsSince(sinceMs: number): Promise<AlphaEvaluationRow[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        id,
        alpha_candidate_id,
        evaluation_status,
        acceptance_score,
        metrics_json,
        rejection_reasons_json,
        created_at_ms
      FROM ${qualifyBusinessTable('alpha_evaluations')}
      WHERE created_at_ms >= $1
      ORDER BY created_at_ms DESC
    `,
    [sinceMs],
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    alpha_candidate_id: String(row.alpha_candidate_id || ''),
    evaluation_status: String(row.evaluation_status || ''),
    acceptance_score: toNullableNumber(row.acceptance_score),
    metrics_json: String(row.metrics_json || '{}'),
    rejection_reasons_json: String(row.rejection_reasons_json || '[]'),
    created_at_ms: toNumber(row.created_at_ms),
  }));
}

async function listBacktestRunsWithMetrics(limit = 160): Promise<BacktestRunMetricRow[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        runs.id AS backtest_run_id,
        runs.started_at_ms,
        runs.completed_at_ms,
        runs.status AS run_status,
        metrics.net_return,
        metrics.sharpe,
        metrics.max_drawdown,
        metrics.realism_grade,
        metrics.robustness_grade,
        metrics.sample_size,
        metrics.status AS metric_status
      FROM (
        SELECT id, started_at_ms, completed_at_ms, status
        FROM ${qualifyBusinessTable('backtest_runs')}
        ORDER BY started_at_ms DESC
        LIMIT $1
      ) runs
      LEFT JOIN LATERAL (
        SELECT net_return, sharpe, max_drawdown, realism_grade, robustness_grade, sample_size, status
        FROM ${qualifyBusinessTable('backtest_metrics')}
        WHERE backtest_run_id = runs.id
        ORDER BY updated_at_ms DESC
        LIMIT 1
      ) metrics ON TRUE
      ORDER BY runs.started_at_ms DESC
    `,
    [limit],
  );
  return rows.map((row) => ({
    backtest_run_id: String(row.backtest_run_id || ''),
    started_at_ms: toNumber(row.started_at_ms),
    completed_at_ms: toNullableNumber(row.completed_at_ms),
    run_status: String(row.run_status || ''),
    net_return: toNullableNumber(row.net_return),
    sharpe: toNullableNumber(row.sharpe),
    max_drawdown: toNullableNumber(row.max_drawdown),
    realism_grade: toNullableString(row.realism_grade),
    robustness_grade: toNullableString(row.robustness_grade),
    sample_size: toNullableNumber(row.sample_size),
    metric_status: toNullableString(row.metric_status),
  }));
}

async function listWorkflowRunsSince(sinceMs: number, limit: number): Promise<WorkflowRunRow[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        id,
        workflow_key,
        workflow_version,
        trigger_type,
        status,
        trace_id,
        input_json,
        output_json,
        attempt_count,
        started_at_ms,
        updated_at_ms,
        completed_at_ms
      FROM ${qualifyBusinessTable('workflow_runs')}
      WHERE updated_at_ms >= $1
      ORDER BY updated_at_ms DESC
      LIMIT $2
    `,
    [sinceMs, limit],
  );
  return rows.map((row) => ({
    id: String(row.id || ''),
    workflow_key: String(row.workflow_key || ''),
    workflow_version: String(row.workflow_version || ''),
    trigger_type: String(row.trigger_type || ''),
    status: String(row.status || ''),
    trace_id: toNullableString(row.trace_id),
    input_json: String(row.input_json || '{}'),
    output_json: toNullableString(row.output_json),
    attempt_count: toNumber(row.attempt_count),
    started_at_ms: toNumber(row.started_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
    completed_at_ms: toNullableNumber(row.completed_at_ms),
  }));
}

async function listDailyWorkflowCounts(sinceMs: number): Promise<DailyWorkflowCountRow[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT workflow_key, COUNT(*) AS run_count, MIN(updated_at_ms) AS first_ms, MAX(updated_at_ms) AS last_ms
      FROM ${qualifyBusinessTable('workflow_runs')}
      WHERE updated_at_ms >= $1
      GROUP BY workflow_key
      ORDER BY run_count DESC, workflow_key ASC
    `,
    [sinceMs],
  );
  return rows.map((row) => ({
    workflow_key: String(row.workflow_key || ''),
    run_count: toNumber(row.run_count),
    first_ms: toNullableNumber(row.first_ms),
    last_ms: toNullableNumber(row.last_ms),
  }));
}

async function queryTableCount(
  table: string,
  column: string,
  sinceMs: number,
): Promise<DailyTableCount> {
  const row = await queryRow<Record<string, unknown>>(
    `
      SELECT COUNT(*) AS count, MAX(${quotePgIdentifier(column)}) AS last_ms
      FROM ${qualifyBusinessTable(table)}
      WHERE ${quotePgIdentifier(column)} >= $1
    `,
    [sinceMs],
  );
  const lastMs = toNullableNumber(row?.last_ms);
  return {
    count: toNumber(row?.count),
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

function summarizeNovaRuns(rows: NovaTaskRunRow[]) {
  return {
    total: rows.length,
    by_status: countBy(rows, (row) => row.status),
    by_task: countBy(rows, (row) => row.task_type),
    by_route: countBy(rows, (row) => row.route_alias || 'unrouted'),
  };
}

function workflowSummaryForRow(row: WorkflowRunRow): JsonObject | null {
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
        ? (alphaRegistry.top_candidates as unknown[]).length
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

function summarizeTrainingRun(row: WorkflowRunRow): TrainingRunSummary {
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

function parseRecentDiscoveryRun(row: WorkflowRunRow): RecentDiscoveryRun {
  const output = parseJsonObject(row.output_json);
  const evaluationSummary =
    output.evaluation_summary && typeof output.evaluation_summary === 'object'
      ? (output.evaluation_summary as JsonObject)
      : null;
  const generationSummary =
    output.generation_summary && typeof output.generation_summary === 'object'
      ? (output.generation_summary as JsonObject)
      : null;
  const updatedAt = toIso(row.updated_at_ms);
  const acceptedCandidates = Array.isArray(output.accepted_candidates)
    ? output.accepted_candidates.map((item) => {
        const entry = item as JsonObject;
        return {
          alpha_id: String(entry.alpha_id || ''),
          family: String(entry.family || 'unknown'),
          acceptance_score: Number.isFinite(Number(entry.acceptance_score))
            ? round(Number(entry.acceptance_score), 4)
            : null,
          integration_path: entry.integration_path ? String(entry.integration_path) : null,
          discovered_at: updatedAt,
        };
      })
    : [];
  const rejectedCandidates = Array.isArray(output.rejected_candidates)
    ? output.rejected_candidates.map((item) => {
        const entry = item as JsonObject;
        return {
          alpha_id: String(entry.alpha_id || ''),
          family: String(entry.family || 'unknown'),
          rejection_reasons: Array.isArray(entry.rejection_reasons)
            ? entry.rejection_reasons.map((reason) => String(reason))
            : [],
          discovered_at: updatedAt,
        };
      })
    : [];
  return {
    id: row.id,
    updated_at: updatedAt,
    status: row.status,
    trigger_type: row.trigger_type,
    evaluated: Number(evaluationSummary?.evaluated || 0),
    accepted: Number(evaluationSummary?.accepted || 0),
    rejected: Number(evaluationSummary?.rejected || 0),
    watchlist: Number(evaluationSummary?.watchlist || 0),
    candidates_registered: Number(generationSummary?.candidates_registered || 0),
    evaluation_queue: Number(generationSummary?.evaluation_queue || 0),
    accepted_candidates: acceptedCandidates.filter((item) => item.alpha_id),
    rejected_candidates: rejectedCandidates.filter((item) => item.alpha_id),
  };
}

function parseRecentShadowRun(row: WorkflowRunRow): RecentShadowRun {
  const output = parseJsonObject(row.output_json);
  const shadow =
    output.shadow && typeof output.shadow === 'object' ? (output.shadow as JsonObject) : null;
  const promotion =
    output.promotion && typeof output.promotion === 'object'
      ? (output.promotion as JsonObject)
      : null;
  return {
    id: row.id,
    updated_at: toIso(row.updated_at_ms),
    status: row.status,
    trigger_type: row.trigger_type,
    candidates_processed: Number(shadow?.candidates_processed || 0),
    signals_evaluated: Number(shadow?.signals_evaluated || 0),
    promoted_to_canary: Array.isArray(promotion?.promoted_to_canary)
      ? (promotion.promoted_to_canary as unknown[]).length
      : 0,
    promoted_to_prod: Array.isArray(promotion?.promoted_to_prod)
      ? (promotion.promoted_to_prod as unknown[]).length
      : 0,
    retired: Array.isArray(promotion?.retired) ? (promotion.retired as unknown[]).length : 0,
    held: Array.isArray(promotion?.held) ? (promotion.held as unknown[]).length : 0,
  };
}

function dedupeAccepted(items: DiscoveryAcceptedCandidate[]) {
  const map = new Map<string, DiscoveryAcceptedCandidate>();
  for (const item of items) {
    if (!item.alpha_id || map.has(item.alpha_id)) continue;
    map.set(item.alpha_id, item);
  }
  return Array.from(map.values());
}

function dedupeRejected(items: DiscoveryRejectedCandidate[]) {
  const map = new Map<string, DiscoveryRejectedCandidate>();
  for (const item of items) {
    if (!item.alpha_id || map.has(item.alpha_id)) continue;
    map.set(item.alpha_id, item);
  }
  return Array.from(map.values());
}

function shadowStatsForRows(rows: AlphaShadowObservationRow[]) {
  const realized = rows.filter((row) => Number.isFinite(row.realized_pnl_pct));
  const pnlSeries = realized.map((row) => Number(row.realized_pnl_pct || 0));
  const expectancy = pnlSeries.length
    ? pnlSeries.reduce((sum, value) => sum + value, 0) / pnlSeries.length
    : null;
  const wins = pnlSeries.filter((value) => value > 0).length;
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of pnlSeries) {
    equity *= 1 + value / 100;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, (equity - peak) / peak);
  }
  const mean = pnlSeries.length
    ? pnlSeries.reduce((sum, value) => sum + value, 0) / pnlSeries.length
    : 0;
  const variance =
    pnlSeries.length > 1
      ? pnlSeries.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (pnlSeries.length - 1)
      : 0;
  const sigma = Math.sqrt(Math.max(variance, 0));
  const sharpe =
    pnlSeries.length > 1 && sigma > 0
      ? round((mean / sigma) * Math.sqrt(Math.min(pnlSeries.length, 252)), 4)
      : null;

  return {
    total_observations: rows.length,
    realized_sample_size: realized.length,
    expectancy: expectancy === null ? null : round(expectancy, 4),
    win_rate: realized.length ? round(wins / realized.length, 4) : null,
    max_drawdown: realized.length ? round(Math.abs(maxDrawdown), 4) : null,
    sharpe,
  };
}

async function buildAlphaRegistryBundle(): Promise<AlphaRegistryBundle> {
  const candidates = await listAlphaCandidates(200);
  const candidateIds = candidates.map((candidate) => candidate.id);
  const shadowCandidateIds = candidateIds.slice(0, PG_ALPHA_SHADOW_CANDIDATE_LIMIT);
  const [evaluations, lifecycleEvents, shadowRows] = await Promise.all([
    listLatestAlphaEvaluations(candidateIds),
    listAlphaLifecycleEvents(120),
    listAlphaShadowObservations(shadowCandidateIds, PG_ALPHA_SHADOW_OBSERVATION_LIMIT),
  ]);

  const evaluationMap = new Map(
    candidateIds.map((candidateId) => {
      const evaluation = evaluations.find((row) => row.alpha_candidate_id === candidateId) || null;
      const metrics = evaluation
        ? parseJson<AlphaEvaluationMetrics & JsonObject>(
            evaluation.metrics_json,
            {} as AlphaEvaluationMetrics & JsonObject,
          )
        : null;
      const rejectionReasons = evaluation
        ? parseJson<string[]>(evaluation.rejection_reasons_json, [])
        : [];
      return [
        candidateId,
        {
          evaluation,
          metrics,
          rejection_reasons: rejectionReasons,
        },
      ] as const;
    }),
  );

  const shadowMap = shadowRows.reduce<Map<string, AlphaShadowObservationRow[]>>((acc, row) => {
    const rows = acc.get(row.alpha_candidate_id) || [];
    rows.push(row);
    acc.set(row.alpha_candidate_id, rows);
    return acc;
  }, new Map());

  const registryRecords = candidates.map((candidate) => {
    const latest = evaluationMap.get(candidate.id);
    const metrics = latest?.metrics || null;
    const shadow = shadowStatsForRows(shadowMap.get(candidate.id) || []);
    return {
      id: candidate.id,
      thesis: candidate.thesis,
      family: candidate.family,
      status: candidate.status as AlphaLifecycleState,
      integration_path: candidate.integration_path as AlphaIntegrationPath,
      acceptance_score: candidate.acceptance_score,
      latest_evaluation_status:
        (latest?.evaluation?.evaluation_status as 'PASS' | 'WATCH' | 'REJECT' | null) || null,
      correlation_to_active: metrics?.correlation_to_active ?? null,
      stability_score: metrics?.stability_score ?? null,
      shadow: {
        total_observations: Number(shadow.total_observations || 0),
        realized_sample_size: Number(shadow.realized_sample_size || 0),
        expectancy: shadow.expectancy,
        win_rate: shadow.win_rate,
        max_drawdown: shadow.max_drawdown,
        sharpe: shadow.sharpe,
      },
    };
  });

  const candidateRows: AlphaSummaryRecord[] = registryRecords.map((row) => {
    const latest = evaluationMap.get(row.id);
    const metrics = latest?.metrics || null;
    return {
      ...row,
      shadow: {
        total_observations: Number(row.shadow.total_observations || 0),
        sample_size: Number(row.shadow.realized_sample_size || 0),
        expectancy: row.shadow.expectancy,
        max_drawdown: row.shadow.max_drawdown,
        sharpe: row.shadow.sharpe,
        approval_rate: 0,
      },
      latest_evaluation_created_at: latest?.evaluation
        ? toIso(latest.evaluation.created_at_ms)
        : null,
      latest_acceptance_score: latest?.evaluation?.acceptance_score ?? row.acceptance_score ?? null,
      latest_rejection_reasons: latest?.rejection_reasons || [],
      metrics: metrics
        ? {
            net_pnl: metrics.net_pnl ?? null,
            sharpe: metrics.sharpe ?? null,
            max_drawdown: metrics.max_drawdown ?? null,
            stability_score: metrics.stability_score ?? null,
            correlation_to_active: metrics.correlation_to_active ?? null,
          }
        : null,
    };
  });

  const topCandidates = [...registryRecords]
    .filter((row) => ['BACKTEST_PASS', 'SHADOW', 'CANARY'].includes(row.status))
    .sort((a, b) => Number(b.acceptance_score || 0) - Number(a.acceptance_score || 0))
    .slice(0, 10);

  const decayingCandidates = registryRecords
    .filter((row) => ['SHADOW', 'CANARY', 'PROD'].includes(row.status))
    .filter(
      (row) =>
        Number(row.shadow.expectancy || 0) < 0 || Number(row.shadow.max_drawdown || 0) > 0.18,
    )
    .slice(0, 10);

  const correlationMap = topCandidates.map((row) => ({
    alpha_id: row.id,
    family: row.family,
    correlation_to_active: row.correlation_to_active,
  }));

  const counts = candidates.reduce<Record<string, number>>((acc, candidate) => {
    acc[candidate.status] = (acc[candidate.status] || 0) + 1;
    return acc;
  }, {});

  return {
    counts,
    registry_records: topCandidates,
    candidate_rows: candidateRows,
    top_candidates: topCandidates,
    decaying_candidates: decayingCandidates,
    correlation_map: correlationMap,
    state_transitions: lifecycleEvents.slice(0, 20).map((row) => ({
      alpha_id: row.alpha_candidate_id,
      from_status: row.from_status as AlphaLifecycleState | null,
      to_status: row.to_status as AlphaLifecycleState,
      reason: row.reason,
      created_at: new Date(row.created_at_ms).toISOString(),
    })) as AdminAlphaSnapshot['state_transitions'],
    evaluationMap,
  };
}

async function buildPostgresOpsReport() {
  const now = Date.now();
  const workflowKeys = [
    'free_data_flywheel',
    'nova_training_flywheel',
    'nova_strategy_lab',
    'alpha_discovery_loop',
    'alpha_shadow_runner',
  ];
  const [alphaRegistry, newsRows, topSignals, workflowRows, fundamentals, optionChains, novaRuns] =
    await Promise.all([
      buildAlphaRegistryBundle(),
      listNewsItems(24, now - 1000 * 60 * 60 * 72),
      listSignals(6, { status: 'NEW' }),
      listWorkflowRuns(20),
      listFundamentalSnapshots(12, 'US'),
      listOptionChainSnapshots(12, 'US'),
      listNovaTaskRuns(12),
    ]);

  const recentNewsFactors = newsRows
    .map((row) => {
      const payload = parseJsonObject(row.payload_json);
      const geminiAnalysis =
        payload.gemini_analysis && typeof payload.gemini_analysis === 'object'
          ? (payload.gemini_analysis as JsonObject)
          : null;
      const batch =
        geminiAnalysis?.batch && typeof geminiAnalysis.batch === 'object'
          ? (geminiAnalysis.batch as JsonObject)
          : null;
      const headline =
        geminiAnalysis?.headline && typeof geminiAnalysis.headline === 'object'
          ? (geminiAnalysis.headline as JsonObject)
          : null;
      if (!batch && !headline) return null;
      return {
        id: row.id,
        market: row.market,
        symbol: row.symbol,
        headline: row.headline,
        published_at: toIso(row.published_at_ms),
        source: row.source,
        tone: row.sentiment_label,
        relevance: row.relevance_score,
        analysis_provider: batch?.provider || 'gemini',
        trading_bias: batch?.trading_bias || null,
        factor_tags: Array.isArray(batch?.factor_tags) ? batch.factor_tags : [],
        factor_summary: typeof batch?.summary === 'string' ? batch.summary : null,
        sentiment_score: headline?.sentiment_score ?? batch?.sentiment_score ?? null,
        event_risk_score: batch?.event_risk_score ?? null,
        macro_policy_score: batch?.macro_policy_score ?? null,
        earnings_impact_score: batch?.earnings_impact_score ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .slice(0, 10);

  const activeSignals = topSignals.map((row) => {
    const signal = decodeSignalContract({ payload_json: row.payload_json });
    return {
      signal_id: row.signal_id,
      market: row.market,
      symbol: row.symbol,
      strategy_id: row.strategy_id,
      direction: row.direction,
      score: row.score,
      confidence: row.confidence,
      created_at: toIso(row.created_at_ms),
      status: row.status,
      news_context: signal?.news_context || null,
      why_now: signal?.explain_bullets?.[0] || null,
    };
  });

  const workflows = workflowRows
    .filter((row) => workflowKeys.includes(row.workflow_key))
    .slice(0, 12)
    .map((row) => {
      const output = parseJsonObject(row.output_json);
      const news =
        output.news && typeof output.news === 'object' ? (output.news as JsonObject) : null;
      const fundamentalsPayload =
        output.fundamentals && typeof output.fundamentals === 'object'
          ? (output.fundamentals as JsonObject)
          : null;
      const options =
        output.options && typeof output.options === 'object'
          ? (output.options as JsonObject)
          : null;
      return {
        id: row.id,
        workflow_key: row.workflow_key,
        status: row.status,
        trigger_type: row.trigger_type,
        updated_at: toIso(row.updated_at_ms),
        completed_at: toIso(row.completed_at_ms),
        trace_id: row.trace_id,
        summary:
          row.workflow_key === 'free_data_flywheel'
            ? {
                refreshed_symbols: news?.refreshed_symbols ?? null,
                rows_upserted: news?.rows_upserted ?? null,
                fundamentals_rows_upserted: fundamentalsPayload?.rows_upserted ?? null,
                options_rows_upserted: options?.rows_upserted ?? null,
                fundamentals_errors: Array.isArray(fundamentalsPayload?.errors)
                  ? fundamentalsPayload.errors.slice(0, 3)
                  : [],
                options_errors: Array.isArray(options?.errors) ? options.errors.slice(0, 3) : [],
              }
            : row.workflow_key === 'nova_training_flywheel'
              ? {
                  dataset_count: output.dataset_count ?? null,
                  ready_for_training: output.ready_for_training ?? null,
                }
              : row.workflow_key === 'alpha_discovery_loop'
                ? {
                    accepted:
                      (output.evaluation_summary as JsonObject | undefined)?.accepted ?? null,
                    rejected:
                      (output.evaluation_summary as JsonObject | undefined)?.rejected ?? null,
                    top_candidates: Array.isArray(
                      (output.alpha_registry as JsonObject | undefined)?.top_candidates,
                    )
                      ? ((output.alpha_registry as JsonObject).top_candidates as unknown[]).length
                      : null,
                  }
                : row.workflow_key === 'alpha_shadow_runner'
                  ? {
                      candidates_processed:
                        (output.shadow as JsonObject | undefined)?.candidates_processed ?? null,
                      promoted_to_canary: Array.isArray(
                        (output.promotion as JsonObject | undefined)?.promoted_to_canary,
                      )
                        ? ((output.promotion as JsonObject).promoted_to_canary as unknown[]).length
                        : null,
                      retired: Array.isArray((output.promotion as JsonObject | undefined)?.retired)
                        ? ((output.promotion as JsonObject).retired as unknown[]).length
                        : null,
                    }
                  : {
                      selected_count: Array.isArray(output.selected_candidates)
                        ? output.selected_candidates.length
                        : null,
                      provider: output.provider ?? null,
                    },
      };
    });

  const referenceData = {
    fundamentals: fundamentals.map((row) => {
      const payload = parseJsonObject(row.payload_json);
      return {
        id: row.id,
        symbol: row.symbol,
        source: row.source,
        asof_date: row.asof_date,
        updated_at: toIso(row.updated_at_ms),
        keys: Object.keys(payload).slice(0, 8),
      };
    }),
    option_chains: optionChains.map((row) => {
      const payload = parseJsonObject(row.payload_json);
      const summary =
        payload.summary && typeof payload.summary === 'object'
          ? (payload.summary as JsonObject)
          : null;
      return {
        id: row.id,
        symbol: row.symbol,
        source: row.source,
        expiration_date: row.expiration_date,
        snapshot_at: toIso(row.snapshot_ts_ms),
        contracts_count: summary?.contracts_count ?? null,
        total_open_interest: summary?.total_open_interest ?? null,
        total_volume: summary?.total_volume ?? null,
        iv_skew: summary?.iv_skew ?? null,
      };
    }),
  };

  const recentNovaRuns = novaRuns.map((row) => ({
    id: row.id,
    task_type: row.task_type,
    status: row.status,
    route_alias: row.route_alias,
    model_name: row.model_name,
    created_at: toIso(row.created_at_ms),
    error: row.error,
  }));

  const plan = getNovaModelPlan();

  return {
    generated_at: new Date(now).toISOString(),
    visibility: 'private-loopback-only',
    runtime: {
      mode: getNovaRuntimeMode(),
      provider: plan.provider,
      endpoint: plan.endpoint,
      aliases: plan.models,
      routes: getNovaRoutingPolicies(),
    },
    workflows,
    alpha_inventory: alphaRegistry.counts,
    alpha_top_candidates: alphaRegistry.top_candidates.slice(0, 8),
    alpha_decaying_candidates: alphaRegistry.decaying_candidates.slice(0, 8),
    alpha_correlation_map: alphaRegistry.correlation_map.slice(0, 12),
    alpha_state_transitions: alphaRegistry.state_transitions.slice(0, 12),
    recent_news_factors: recentNewsFactors as AdminResearchOpsSnapshot['recent_news_factors'],
    reference_data: referenceData,
    active_signals: activeSignals as AdminResearchOpsSnapshot['active_signals'],
    recent_nova_runs: recentNovaRuns as AdminResearchOpsSnapshot['recent_nova_runs'],
  };
}

export async function buildPostgresAdminAlphaSnapshot(args?: {
  timeZone?: string;
  localDate?: string;
}): Promise<AdminAlphaSnapshot> {
  const timeZone = resolveReportTimeZone(args?.timeZone);
  const { localDate, sinceMs } = getStartOfDayUtcMs(timeZone, args?.localDate);
  const [summary, alphaWorkflows] = await Promise.all([
    buildAlphaRegistryBundle(),
    listWorkflowRuns(240),
  ]);
  const discoveryConfig = readAlphaDiscoveryConfig();

  const discoveryRuns = alphaWorkflows
    .filter((row) => row.updated_at_ms >= sinceMs && row.workflow_key === 'alpha_discovery_loop')
    .map(parseRecentDiscoveryRun);

  const shadowRuns = alphaWorkflows
    .filter((row) => row.updated_at_ms >= sinceMs && row.workflow_key === 'alpha_shadow_runner')
    .map(parseRecentShadowRun);

  const acceptedToday = dedupeAccepted(
    discoveryRuns
      .flatMap((run) => run.accepted_candidates)
      .sort((a, b) => {
        const aMs = Date.parse(String(a.discovered_at || ''));
        const bMs = Date.parse(String(b.discovered_at || ''));
        return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
      }),
  );
  const rejectedToday = dedupeRejected(
    discoveryRuns
      .flatMap((run) => run.rejected_candidates)
      .sort((a, b) => {
        const aMs = Date.parse(String(a.discovered_at || ''));
        const bMs = Date.parse(String(b.discovered_at || ''));
        return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
      }),
  );

  return {
    generated_at: new Date().toISOString(),
    data_source: {
      mode: 'postgres-mirror',
      label: 'Supabase mirror',
      live_connected: false,
      timezone: timeZone,
      local_date: localDate,
      upstream_base_url: null,
      error: null,
    },
    inventory: summary.counts,
    family_mix: countBy(summary.candidate_rows, (row) => row.family),
    integration_mix: countBy(summary.candidate_rows, (row) => row.integration_path),
    top_candidates: summary.top_candidates,
    decaying_candidates: summary.decaying_candidates,
    correlation_map: summary.correlation_map,
    state_transitions: summary.state_transitions,
    candidates: summary.candidate_rows.slice(0, 60),
    controls: {
      min_acceptance_score: discoveryConfig.minAcceptanceScore,
      shadow_admission_min_acceptance_score:
        discoveryConfig.shadowAdmissionThresholds.minAcceptanceScore,
      shadow_admission_max_drawdown: discoveryConfig.shadowAdmissionThresholds.maxDrawdown,
      shadow_promotion_min_sample_size: discoveryConfig.shadowPromotionThresholds.minSampleSize,
      shadow_promotion_min_sharpe: discoveryConfig.shadowPromotionThresholds.minSharpe,
      shadow_promotion_min_expectancy: discoveryConfig.shadowPromotionThresholds.minExpectancy,
      shadow_promotion_max_drawdown: discoveryConfig.shadowPromotionThresholds.maxDrawdown,
      shadow_promotion_min_approval_rate: discoveryConfig.shadowPromotionThresholds.minApprovalRate,
      retirement_min_expectancy: discoveryConfig.retirementThresholds.minExpectancy,
      retirement_max_drawdown: discoveryConfig.retirementThresholds.maxDrawdown,
      retirement_decay_streak_limit: discoveryConfig.retirementThresholds.decayStreakLimit,
    },
    today: {
      discovery_runs: discoveryRuns.length,
      shadow_runs: shadowRuns.length,
      accepted_count: discoveryRuns.reduce((sum, row) => sum + row.accepted, 0),
      rejected_count: discoveryRuns.reduce((sum, row) => sum + row.rejected, 0),
      watchlist_count: discoveryRuns.reduce((sum, row) => sum + row.watchlist, 0),
      candidates_registered: discoveryRuns.reduce((sum, row) => sum + row.candidates_registered, 0),
      candidates_processed: shadowRuns.reduce((sum, row) => sum + row.candidates_processed, 0),
      signals_evaluated: shadowRuns.reduce((sum, row) => sum + row.signals_evaluated, 0),
      promoted_to_canary: shadowRuns.reduce((sum, row) => sum + row.promoted_to_canary, 0),
      promoted_to_prod: shadowRuns.reduce((sum, row) => sum + row.promoted_to_prod, 0),
      retired_count: shadowRuns.reduce((sum, row) => sum + row.retired, 0),
      held_count: shadowRuns.reduce((sum, row) => sum + row.held, 0),
      latest_discovery: discoveryRuns[0] || null,
      latest_shadow: shadowRuns[0] || null,
      recent_acceptances: acceptedToday.slice(0, 10),
      recent_rejections: rejectedToday.slice(0, 10),
      recent_discovery_runs: discoveryRuns.slice(0, 8),
      recent_shadow_runs: shadowRuns.slice(0, 8),
    },
  };
}

export async function buildPostgresAdminResearchOpsSnapshot(args?: {
  timeZone?: string;
  localDate?: string;
}): Promise<AdminResearchOpsSnapshot> {
  const timeZone = resolveReportTimeZone(args?.timeZone);
  const { localDate, sinceMs } = getStartOfDayUtcMs(timeZone, args?.localDate);
  const now = Date.now();

  const [
    ops,
    recentNewsItems,
    workflowCountRows,
    alphaEvaluations,
    backtestRows,
    recentSignals,
    recentWorkflowsRaw,
    trainingWorkflowRows,
    novaRuns,
    newsCount,
    signalsCount,
    optionCount,
    fundamentalCount,
    backtestRunCount,
    backtestMetricCount,
    datasetVersionCount,
  ] = await Promise.all([
    buildPostgresOpsReport(),
    listNewsItems(60, now - 1000 * 60 * 60 * 72),
    listDailyWorkflowCounts(sinceMs),
    listAlphaEvaluationsSince(sinceMs),
    listBacktestRunsWithMetrics(160),
    listRecentSignalsSince(12, sinceMs),
    listWorkflowRunsSince(sinceMs, 180),
    listWorkflowRuns(12, ['nova_training_flywheel']),
    listNovaTaskRuns(60),
    queryTableCount('news_items', 'updated_at_ms', sinceMs),
    queryTableCount('signals', 'created_at_ms', sinceMs),
    queryTableCount('option_chain_snapshots', 'updated_at_ms', sinceMs),
    queryTableCount('fundamental_snapshots', 'updated_at_ms', sinceMs),
    queryTableCount('backtest_runs', 'started_at_ms', sinceMs),
    queryTableCount('backtest_metrics', 'updated_at_ms', sinceMs),
    queryTableCount('dataset_versions', 'created_at_ms', sinceMs),
  ]);

  const factorTagMix = countBy(
    ops.recent_news_factors.flatMap((row) =>
      Array.isArray(row.factor_tags) ? row.factor_tags : [],
    ),
    (row) => String(row),
  );
  const sourceMix = countBy(recentNewsItems, (row) => row.source);

  const workflowCounts = workflowCountRows.map((row) => ({
    workflow_key: row.workflow_key,
    run_count: Number(row.run_count || 0),
    first_ms: row.first_ms ?? null,
    last_ms: row.last_ms ?? null,
    first_at_utc: toIso(row.first_ms),
    last_at_utc: toIso(row.last_ms),
  }));

  const workflowSummaryTotal = workflowCounts.reduce((sum, row) => sum + row.run_count, 0);

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

  const topBacktests = backtestRows
    .filter((row) => row.started_at_ms >= sinceMs)
    .map((row) => ({
      backtest_run_id: row.backtest_run_id,
      net_return: row.net_return,
      sharpe: row.sharpe,
      max_dd: row.max_drawdown,
      realism_grade: row.realism_grade,
      robustness_grade: row.robustness_grade,
      sample_size: row.sample_size,
      status: row.metric_status || row.run_status,
      started_at: toIso(row.started_at_ms),
      completed_at: toIso(row.completed_at_ms),
    }))
    .sort(
      (a, b) =>
        Number(b.net_return || -Infinity) - Number(a.net_return || -Infinity) ||
        Number(b.sharpe || -Infinity) - Number(a.sharpe || -Infinity),
    )
    .slice(0, 8);

  const mappedRecentSignals = recentSignals.map((row) => {
    const decoded = decodeSignalContract({ payload_json: row.payload_json });
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

  const recentWorkflows = recentWorkflowsRaw
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

  const trainingRuns = trainingWorkflowRows.map(summarizeTrainingRun);
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
      mode: 'postgres-mirror',
      label: 'Supabase mirror',
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
    workflows: ops.workflows as AdminResearchOpsSnapshot['workflows'],
    recent_news_factors: ops.recent_news_factors,
    reference_data: ops.reference_data as AdminResearchOpsSnapshot['reference_data'],
    active_signals: ops.active_signals as AdminResearchOpsSnapshot['active_signals'],
    recent_nova_runs: ops.recent_nova_runs as AdminResearchOpsSnapshot['recent_nova_runs'],
    daily_ops: {
      timezone: timeZone,
      local_date: localDate,
      since_utc: new Date(sinceMs).toISOString(),
      workflow_counts: workflowCounts,
      table_counts: {
        news_items: newsCount,
        signals: signalsCount,
        option_chain_snapshots: optionCount,
        fundamental_snapshots: fundamentalCount,
        backtest_runs: backtestRunCount,
        backtest_metrics: backtestMetricCount,
        dataset_versions: datasetVersionCount,
      },
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

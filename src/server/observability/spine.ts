import { randomUUID } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import { qualifyBusinessTable, queryRowsSync } from '../db/postgresSyncBridge.js';

const FRONTEND_READ_SAMPLE_LIMIT = 40;
const frontendRouteLatencyStats = new Map<string, number[]>();
const frontendCacheStats = new Map<
  string,
  {
    hit: number;
    miss: number;
    inflight: number;
  }
>();

export function createTraceId(prefix = 'nq'): string {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function appendSample(target: number[], value: number) {
  target.push(Math.max(0, Math.round(value)));
  if (target.length > FRONTEND_READ_SAMPLE_LIMIT) {
    target.splice(0, target.length - FRONTEND_READ_SAMPLE_LIMIT);
  }
}

function percentile(sorted: number[], ratio: number) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export function recordFrontendRouteLatency(scope: string, durationMs: number) {
  const key = String(scope || '').trim();
  if (!key) return;
  const samples = frontendRouteLatencyStats.get(key) || [];
  appendSample(samples, durationMs);
  frontendRouteLatencyStats.set(key, samples);
}

export function recordFrontendCacheOutcome(scope: string, outcome: 'hit' | 'miss' | 'inflight') {
  const key = String(scope || '').trim();
  if (!key) return;
  const current = frontendCacheStats.get(key) || {
    hit: 0,
    miss: 0,
    inflight: 0,
  };
  current[outcome] += 1;
  frontendCacheStats.set(key, current);
}

export function resetFrontendReadObservabilityForTesting() {
  frontendRouteLatencyStats.clear();
  frontendCacheStats.clear();
}

function buildFrontendReadObservabilitySummary() {
  const route_latency = Object.fromEntries(
    [...frontendRouteLatencyStats.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([scope, samples]) => {
        const sorted = [...samples].sort((a, b) => a - b);
        return [
          scope,
          {
            request_count: samples.length,
            p50_ms: percentile(sorted, 0.5),
            p95_ms: percentile(sorted, 0.95),
            latest_ms: samples[samples.length - 1] ?? null,
          },
        ];
      }),
  );

  const cache = Object.fromEntries(
    [...frontendCacheStats.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([scope, counts]) => {
        const total = counts.hit + counts.miss + counts.inflight;
        return [
          scope,
          {
            ...counts,
            total,
            hit_ratio: total > 0 ? Number((counts.hit / total).toFixed(3)) : null,
          },
        ];
      }),
  );

  return {
    route_latency,
    cache,
    sample_limit: FRONTEND_READ_SAMPLE_LIMIT,
  };
}

export function recordAuditEvent(
  repo: MarketRepository,
  args: {
    traceId: string;
    scope: string;
    eventType: string;
    userId?: string | null;
    entityType: string;
    entityId?: string | null;
    payload: Record<string, unknown>;
  },
): void {
  repo.insertAuditEvent({
    trace_id: args.traceId,
    scope: args.scope,
    event_type: args.eventType,
    user_id: args.userId ?? null,
    entity_type: args.entityType,
    entity_id: args.entityId ?? null,
    payload_json: JSON.stringify(args.payload),
    created_at_ms: Date.now(),
  });
}

function readChatAuditSummary() {
  return queryRowsSync<Array<{ provider: string; status: string; count: number }>[number]>(
    `
      SELECT provider, status, COUNT(*) AS count
      FROM ${qualifyBusinessTable('chat_audit_logs')}
      GROUP BY provider, status
      ORDER BY count DESC
    `,
  );
}

export function buildObservabilitySummary(repo: MarketRepository) {
  const audits = repo.listAuditEvents({ limit: 60 });
  const workflowRuns = repo.listWorkflowRuns({ limit: 30 });
  const chatAudit = readChatAuditSummary();

  return {
    structured_logging: {
      trace_id_required: true,
      correlation_keys: [
        'trace_id',
        'user_id',
        'decision_snapshot_id',
        'thread_id',
        'workflow_run_id',
      ],
      note: 'Decision, workflow, and LLM flows now have an explicit trace spine.',
    },
    audit_events: {
      total_recent: audits.length,
      scopes: [...new Set(audits.map((row) => row.scope))],
      entity_types: [...new Set(audits.map((row) => row.entity_type))],
    },
    llm_traces: {
      provider_status_matrix: chatAudit,
      note: 'LLM traces remain lightweight but auditable through chat_audit_logs plus prompt/model registries.',
    },
    workflow_trace_correlation: {
      traced_runs: workflowRuns.filter((row) => Boolean(row.trace_id)).length,
      total_runs: workflowRuns.length,
    },
    frontend_reads: buildFrontendReadObservabilitySummary(),
    metrics_catalog: [
      'api_latency_ms',
      'provider_fallback_count',
      'decision_snapshot_generation_count',
      'cache_hit_ratio',
      'eval_quality_score',
      'workflow_retry_count',
      'runtime_state_p95_ms',
      'browse_read_p95_ms',
      'frontend_read_hit_ratio',
    ],
  };
}

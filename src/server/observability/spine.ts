import { randomUUID } from 'node:crypto';
import { getDb } from '../db/database.js';
import { ensureSchema } from '../db/schema.js';
import type { MarketRepository } from '../db/repository.js';

export function createTraceId(prefix = 'nq'): string {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 20)}`;
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
  }
): void {
  repo.insertAuditEvent({
    trace_id: args.traceId,
    scope: args.scope,
    event_type: args.eventType,
    user_id: args.userId ?? null,
    entity_type: args.entityType,
    entity_id: args.entityId ?? null,
    payload_json: JSON.stringify(args.payload),
    created_at_ms: Date.now()
  });
}

function readChatAuditSummary() {
  const db = getDb();
  ensureSchema(db);
  const rows = db
    .prepare(
      `
        SELECT provider, status, COUNT(*) AS count
        FROM chat_audit_logs
        GROUP BY provider, status
        ORDER BY count DESC
      `
    )
    .all() as Array<{ provider: string; status: string; count: number }>;
  return rows;
}

export function buildObservabilitySummary(repo: MarketRepository) {
  const audits = repo.listAuditEvents({ limit: 60 });
  const workflowRuns = repo.listWorkflowRuns({ limit: 30 });
  const chatAudit = readChatAuditSummary();

  return {
    structured_logging: {
      trace_id_required: true,
      correlation_keys: ['trace_id', 'user_id', 'decision_snapshot_id', 'thread_id', 'workflow_run_id'],
      note: 'Decision, workflow, and LLM flows now have an explicit trace spine.'
    },
    audit_events: {
      total_recent: audits.length,
      scopes: [...new Set(audits.map((row) => row.scope))],
      entity_types: [...new Set(audits.map((row) => row.entity_type))]
    },
    llm_traces: {
      provider_status_matrix: chatAudit,
      note: 'LLM traces remain lightweight but auditable through chat_audit_logs plus prompt/model registries.'
    },
    workflow_trace_correlation: {
      traced_runs: workflowRuns.filter((row) => Boolean(row.trace_id)).length,
      total_runs: workflowRuns.length
    },
    metrics_catalog: [
      'api_latency_ms',
      'provider_fallback_count',
      'decision_snapshot_generation_count',
      'cache_hit_ratio',
      'eval_quality_score',
      'workflow_retry_count'
    ]
  };
}

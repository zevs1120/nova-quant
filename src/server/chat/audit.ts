import { getDb } from '../db/database.js';
import { ensureSchema } from '../db/schema.js';
import type { ChatAuditRecord } from './types.js';
import { createTraceId } from '../observability/spine.js';

export function logChatAudit(record: ChatAuditRecord): void {
  try {
    const db = getDb();
    ensureSchema(db);

    db.prepare(
      `
        INSERT INTO chat_audit_logs(
          user_id, thread_id, mode, provider, message, context_json, status, error, response_preview, duration_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      record.userId,
      record.threadId ?? null,
      record.mode,
      record.provider,
      record.message,
      record.contextJson,
      record.status,
      record.error ?? null,
      record.responsePreview ?? null,
      record.durationMs,
      Date.now()
    );

    db.prepare(
      `
        INSERT INTO audit_events(
          trace_id, scope, event_type, user_id, entity_type, entity_id, payload_json, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      createTraceId('chat'),
      'nova_assistant',
      'chat_response_recorded',
      record.userId,
      'chat_thread',
      record.threadId ?? null,
      JSON.stringify({
        mode: record.mode,
        provider: record.provider,
        status: record.status,
        error: record.error ?? null,
        duration_ms: record.durationMs
      }),
      Date.now()
    );
  } catch {
    // best-effort audit logging
  }
}

import { getConfig } from '../config.js';
import { getDb } from '../db/database.js';
import { executeSync, qualifyBusinessTable } from '../db/postgresSyncBridge.js';
import { getRuntimeRepo } from '../db/runtimeRepository.js';
import type { ChatAuditRecord } from './types.js';
import { createTraceId } from '../observability/spine.js';

export function logChatAudit(record: ChatAuditRecord): void {
  try {
    const now = Date.now();
    const auditPayload = JSON.stringify({
      mode: record.mode,
      provider: record.provider,
      status: record.status,
      error: record.error ?? null,
      duration_ms: record.durationMs,
    });

    if (getConfig().database.driver === 'postgres') {
      executeSync(
        `
          INSERT INTO ${qualifyBusinessTable('chat_audit_logs')}(
            user_id, thread_id, mode, provider, message, context_json, status, error, response_preview, duration_ms, created_at
          ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
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
          now,
        ],
      );

      getRuntimeRepo().insertAuditEvent({
        trace_id: createTraceId('chat'),
        scope: 'nova_assistant',
        event_type: 'chat_response_recorded',
        user_id: record.userId,
        entity_type: 'chat_thread',
        entity_id: record.threadId ?? null,
        payload_json: auditPayload,
        created_at_ms: now,
      });
      return;
    }

    const db = getDb();

    db.prepare(
      `
        INSERT INTO chat_audit_logs(
          user_id, thread_id, mode, provider, message, context_json, status, error, response_preview, duration_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
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
      now,
    );

    getRuntimeRepo().insertAuditEvent({
      trace_id: createTraceId('chat'),
      scope: 'nova_assistant',
      event_type: 'chat_response_recorded',
      user_id: record.userId,
      entity_type: 'chat_thread',
      entity_id: record.threadId ?? null,
      payload_json: auditPayload,
      created_at_ms: now,
    });
  } catch {
    // best-effort audit logging
  }
}

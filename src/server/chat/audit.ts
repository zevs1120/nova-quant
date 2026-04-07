import { executeSync, qualifyBusinessTable } from '../db/postgresSyncBridge.js';
import { getRuntimeRepo } from '../db/runtimeRepository.js';
import type { ChatAuditRecord } from './types.js';
import { createTraceId } from '../observability/spine.js';
import { stringifyCompactChatContext, truncateChatText } from './persistence.js';

function shouldMirrorChatAuditEvent(record: ChatAuditRecord) {
  return record.status !== 'ok';
}

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
        truncateChatText(record.message, 280),
        stringifyCompactChatContext(record.context),
        record.status,
        record.error ? truncateChatText(record.error, 180) : null,
        record.responsePreview ? truncateChatText(record.responsePreview, 420) : null,
        record.durationMs,
        now,
      ],
    );

    if (shouldMirrorChatAuditEvent(record)) {
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
    }
  } catch {
    // best-effort audit logging
  }
}

import { getDb } from '../db/database.js';
import { ensureSchema } from '../db/schema.js';
import type { ChatAuditRecord } from './types.js';

export function logChatAudit(record: ChatAuditRecord): void {
  try {
    const db = getDb();
    ensureSchema(db);

    db.prepare(
      `
        INSERT INTO chat_audit_logs(
          user_id, mode, provider, message, context_json, status, error, response_preview, duration_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      record.userId,
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
  } catch {
    // best-effort audit logging
  }
}

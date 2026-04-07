import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeSync = vi.hoisted(() => vi.fn());
const insertAuditEvent = vi.hoisted(() => vi.fn());

vi.mock('../src/server/db/postgresSyncBridge.js', () => ({
  executeSync,
  qualifyBusinessTable: (name: string) => name,
}));

vi.mock('../src/server/db/runtimeRepository.js', () => ({
  getRuntimeRepo: () => ({
    insertAuditEvent,
  }),
}));

vi.mock('../src/server/observability/spine.js', () => ({
  createTraceId: () => 'trace-chat-test',
}));

describe('chat audit logging', () => {
  beforeEach(() => {
    executeSync.mockReset();
    insertAuditEvent.mockReset();
  });

  it('skips generic audit_events inserts for successful chat responses', async () => {
    const { logChatAudit } = await import('../src/server/chat/audit.js');

    logChatAudit({
      userId: 'audit-user',
      threadId: 'thread-1',
      mode: 'context-aware',
      provider: 'deterministic',
      message: 'What should I do today? '.repeat(30),
      context: {
        market: 'US',
        assetClass: 'US_STOCK',
        decisionSummary: {
          today_call: 'Stay selective and avoid forcing size. '.repeat(12),
          top_action_symbol: 'SPY',
        },
        engagementSummary: {
          locale: 'en-US',
          morning_check_status: 'DONE',
          perception_headline: 'This field should be dropped from compact audit context.',
        },
      },
      status: 'ok',
      responsePreview: 'Stay selective. '.repeat(50),
      durationMs: 42,
    });

    expect(executeSync).toHaveBeenCalledTimes(1);
    expect(insertAuditEvent).not.toHaveBeenCalled();
    const params = executeSync.mock.calls[0][1];
    expect(String(params[4]).length).toBeLessThanOrEqual(280);
    expect(String(params[8]).length).toBeLessThanOrEqual(420);
    expect(JSON.parse(String(params[5]))).toEqual({
      market: 'US',
      assetClass: 'US_STOCK',
      decisionSummary: {
        today_call: expect.any(String),
        top_action_symbol: 'SPY',
      },
      engagementSummary: {
        locale: 'en-US',
        morning_check_status: 'DONE',
      },
    });
  });

  it('still mirrors error audits into audit_events for debugging', async () => {
    const { logChatAudit } = await import('../src/server/chat/audit.js');

    logChatAudit({
      userId: 'audit-user',
      threadId: 'thread-1',
      mode: 'context-aware',
      provider: 'openai',
      message: 'What should I do today?',
      context: {
        market: 'US',
      },
      status: 'error',
      error: 'UPSTREAM_FAILED',
      responsePreview: '',
      durationMs: 42,
    });

    expect(executeSync).toHaveBeenCalledTimes(1);
    expect(insertAuditEvent).toHaveBeenCalledTimes(1);
    expect(insertAuditEvent.mock.calls[0][0].event_type).toBe('chat_response_recorded');
  });
});

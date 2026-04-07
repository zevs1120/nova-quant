import { describe, expect, it, vi } from 'vitest';
import { logNovaAssistantAnswer } from '../src/server/nova/service.js';

describe('nova assistant run write path', () => {
  it('skips nova_task_runs rows for blocked chat attempts with no generated answer', async () => {
    const repo = {
      upsertNovaTaskRun: vi.fn(),
      listPromptVersions: vi.fn(() => []),
    } as any;

    await logNovaAssistantAnswer({
      repo,
      userId: 'u-blocked',
      threadId: 'thread-1',
      context: {
        page: 'ai',
        market: 'US',
      },
      message: 'Can you manage my portfolio?',
      responseText: '',
      provider: 'none',
      status: 'FAILED',
      error: 'PORTFOLIO_AI_REQUIRES_PRO',
    });

    expect(repo.upsertNovaTaskRun).not.toHaveBeenCalled();
  });

  it('still persists successful assistant answers for training and review flows', async () => {
    const repo = {
      upsertNovaTaskRun: vi.fn(),
      listPromptVersions: vi.fn(() => []),
    } as any;

    await logNovaAssistantAnswer({
      repo,
      userId: 'u-success',
      threadId: 'thread-2',
      context: {
        page: 'ai',
        market: 'US',
        decisionSummary: {
          today_call: 'Stay patient and wait for a cleaner setup.',
          top_action_symbol: 'SPY',
        },
      },
      message: 'What should I do today?',
      responseText: 'Wait for a cleaner setup and keep size controlled.',
      provider: 'deterministic',
      status: 'SUCCEEDED',
    });

    expect(repo.upsertNovaTaskRun).toHaveBeenCalledTimes(1);
    const row = repo.upsertNovaTaskRun.mock.calls[0][0];
    expect(row.task_type).toBe('assistant_grounded_answer');
    expect(JSON.parse(String(row.output_json || '{}')).text).toContain('cleaner setup');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { generateGovernedNovaStrategies } from '../src/server/nova/strategyLab.js';
import { runNovaTrainingFlywheel } from '../src/server/nova/flywheel.js';
import { streamChat } from '../src/server/chat/service.js';
import { labelNovaRun, runLoggedNovaTextTask } from '../src/server/nova/service.js';

function getRepo() {
  const db = getDb();
  ensureSchema(db);
  return new MarketRepository(db);
}

async function collectChat(userId: string, message: string) {
  const events = [];
  for await (const event of streamChat({
    userId,
    message
  })) {
    events.push(event);
  }
  return events;
}

describe('nova strategy and flywheel services', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('produces governed strategy candidates in deterministic mode', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '');
    vi.stubEnv('NOVA_FORCE_LOCAL_GENERATION', '');

    const repo = getRepo();
    const result = await generateGovernedNovaStrategies({
      repo,
      userId: `svc-strategy-${Date.now()}`,
      prompt: 'Generate a conservative crypto strategy with trend following and clear risk controls',
      locale: 'en',
      market: 'CRYPTO',
      riskProfile: 'conservative',
      maxCandidates: 6
    });

    expect(result.workflow_id).toBeTruthy();
    expect(Array.isArray(result.selected_candidates)).toBe(true);
    expect(['nova-generated', 'deterministic-ranked']).toContain(result.source);
  });

  it('routes strategy chat prompts through the governed strategy path', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '');
    vi.stubEnv('NOVA_FORCE_LOCAL_GENERATION', '');

    const userId = `svc-chat-${Date.now()}`;
    const events = await collectChat(userId, 'Generate a conservative crypto swing trading strategy for me');
    const provider = events.find((row) => row.type === 'meta' && row.provider !== 'preparing');
    const chunk = events.find((row) => row.type === 'chunk');

    expect(provider && 'provider' in provider ? String(provider.provider) : '').toBeTruthy();
    expect(chunk && 'delta' in chunk ? String(chunk.delta) : '').toContain('VERDICT:');
  });

  it('creates a flywheel manifest from labeled Nova runs', async () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '');
    vi.stubEnv('NOVA_FORCE_LOCAL_GENERATION', '1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"answer":"Today risk is moderate and capital should stay selective."}'
              }
            }
          ]
        })
      }))
    );

    const repo = getRepo();
    const userId = `svc-flywheel-${Date.now()}`;
    await runLoggedNovaTextTask({
      repo,
      userId,
      task: 'assistant_answer',
      promptTaskKey: 'assistant-grounded-answer',
      systemPrompt: 'You are Nova.',
      userPrompt: 'Explain today risk posture in plain English.',
      context: {
        test: true
      }
    });

    const assistantRun = repo.listNovaTaskRuns({
      userId,
      taskType: 'assistant_grounded_answer',
      limit: 10
    })[0];

    expect(assistantRun?.id).toBeTruthy();

    labelNovaRun({
      repo,
      runId: assistantRun!.id,
      reviewerId: 'vitest-reviewer',
      label: 'high_quality',
      score: 0.91,
      includeInTraining: true
    });

    const result = await runNovaTrainingFlywheel({
      repo,
      userId,
      trainer: 'mlx-lora',
      onlyIncluded: true,
      limit: 20
    });

    expect(result.workflow_id).toBeTruthy();
    expect(result.training_plan.trainer).toBe('mlx-lora');
    expect(result.manifest_path).toContain('artifacts/training');
    expect(result.dataset_count).toBeGreaterThan(0);
  });
});

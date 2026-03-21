import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../src/server/api/app.js';
import { MARVIX_MODEL_ALIASES } from '../src/server/ai/llmOps.js';
import { resolveBusinessTask } from '../src/server/nova/router.js';

function readNdjsonText(response: { body?: unknown; text?: string }) {
  const body = String(response.body || response.text || '');
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('nova local stack', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('routes local tasks to the expected Nova aliases', () => {
    expect(resolveBusinessTask('action_card').alias).toBe(MARVIX_MODEL_ALIASES.core);
    expect(resolveBusinessTask('assistant_answer').alias).toBe(MARVIX_MODEL_ALIASES.core);
    expect(resolveBusinessTask('fast_classification').alias).toBe(MARVIX_MODEL_ALIASES.scout);
    expect(resolveBusinessTask('retrieval').alias).toBe(MARVIX_MODEL_ALIASES.retrieve);
  });

  it('records assistant runs and exports MLX-LM training records', async () => {
    const app = createApiApp();
    const userId = `nova-local-${Date.now()}`;

    const chatRes = await request(app)
      .post('/api/chat')
      .send({
        userId,
        message: 'Why does today look cautious?',
        context: {
          page: 'today',
          market: 'US',
          assetClass: 'US_STOCK'
        }
      })
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => done(null, text));
      });

    expect(chatRes.status).toBe(200);
    const events = readNdjsonText(chatRes);
    expect(events.some((row) => row.type === 'done')).toBe(true);

    const runsRes = await request(app).get('/api/nova/runs').query({
      userId,
      limit: 20
    });
    expect(runsRes.status).toBe(200);
    expect(runsRes.body.count).toBeGreaterThan(0);
    const assistantRun = runsRes.body.records.find((row: { task_type?: string }) => row.task_type === 'assistant_grounded_answer');
    expect(assistantRun?.id).toBeTruthy();

    const labelRes = await request(app).post('/api/nova/review-label').send({
      runId: assistantRun.id,
      reviewerId: 'test-reviewer',
      label: 'high_quality',
      score: 0.92,
      includeInTraining: true
    });
    expect(labelRes.status).toBe(200);
    expect(labelRes.body.run_id).toBe(assistantRun.id);

    const exportRes = await request(app).get('/api/nova/training/export').query({
      onlyIncluded: true,
      limit: 50
    });
    expect(exportRes.status).toBe(200);
    expect(exportRes.body.format).toBe('mlx-lm-chat-jsonl');
    expect(exportRes.body.count).toBeGreaterThan(0);
    expect(Array.isArray(exportRes.body.records[0].messages)).toBe(true);

    const runtimeRes = await request(app).get('/api/nova/runtime');
    expect(runtimeRes.status).toBe(200);
    expect(runtimeRes.body.endpoint).toContain('127.0.0.1:11434');
    expect(runtimeRes.body.local_only).toBe(true);
  });

  it('bypasses local Nova in Vercel runtime and falls back deterministically', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '');
    vi.stubEnv('NOVA_FORCE_LOCAL_GENERATION', '');

    const app = createApiApp();
    const userId = `nova-vercel-${Date.now()}`;

    const decisionRes = await request(app)
      .post('/api/decision/today')
      .send({
        userId,
        market: 'US',
        assetClass: 'US_STOCK'
      });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.summary.nova_local.skipped).toBe(true);

    const runtimeRes = await request(app).get('/api/nova/runtime');
    expect(runtimeRes.status).toBe(200);
    expect(runtimeRes.body.local_only).toBe(false);
    expect(runtimeRes.body.mode).toBe('deterministic-fallback');

    const chatRes = await request(app)
      .post('/api/chat')
      .send({
        userId,
        message: 'Why does today look cautious?',
        context: {
          page: 'today',
          market: 'US',
          assetClass: 'US_STOCK'
        }
      })
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => done(null, text));
      });

    expect(chatRes.status).toBe(200);
    const events = readNdjsonText(chatRes);
    expect(events.some((row) => row.type === 'meta' && row.provider === 'deterministic')).toBe(true);
  });

  it('generates governed strategies through the API even in fallback mode', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '');
    vi.stubEnv('NOVA_FORCE_LOCAL_GENERATION', '');

    const app = createApiApp();
    const res = await request(app).post('/api/nova/strategy/generate').send({
      userId: `nova-strategy-${Date.now()}`,
      prompt: 'Generate a conservative crypto swing strategy with trend bias and clear risk notes',
      market: 'CRYPTO',
      riskProfile: 'conservative',
      maxCandidates: 6
    });

    expect(res.status).toBe(200);
    expect(res.body.workflow_id).toBeTruthy();
    expect(Array.isArray(res.body.selected_candidates)).toBe(true);
    expect(typeof res.body.provider).toBe('string');
    expect(['nova-generated', 'deterministic-ranked']).toContain(res.body.source);
  });

  it('builds a nova training flywheel manifest through the API', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '');
    vi.stubEnv('NOVA_FORCE_LOCAL_GENERATION', '');

    const app = createApiApp();
    const userId = `nova-flywheel-${Date.now()}`;

    const labelSeedRes = await request(app)
      .post('/api/chat')
      .send({
        userId,
        message: 'Explain today risk posture in plain English'
      })
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => done(null, text));
      });
    expect(labelSeedRes.status).toBe(200);

    const runsRes = await request(app).get('/api/nova/runs').query({
      userId,
      limit: 20
    });
    const run = runsRes.body.records.find((row: { task_type?: string }) => row.task_type === 'assistant_grounded_answer');
    expect(run?.id).toBeTruthy();

    const labelRes = await request(app).post('/api/nova/review-label').send({
      runId: run.id,
      reviewerId: 'test-reviewer',
      label: 'train',
      score: 0.88,
      includeInTraining: true
    });
    expect(labelRes.status).toBe(200);

    const flywheelRes = await request(app).post('/api/nova/training/flywheel').send({
      userId,
      trainer: 'mlx-lora',
      onlyIncluded: true,
      limit: 20
    });
    expect(flywheelRes.status).toBe(200);
    expect(flywheelRes.body.workflow_id).toBeTruthy();
    expect(flywheelRes.body.training_plan?.trainer).toBe('mlx-lora');
    expect(flywheelRes.body.manifest_path).toContain('artifacts/training');
  });
});

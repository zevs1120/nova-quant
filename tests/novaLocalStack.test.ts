import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../src/server/api/app.js';
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
  it('routes local tasks to the expected Nova aliases', () => {
    expect(resolveBusinessTask('action_card').alias).toBe('Nova-Core');
    expect(resolveBusinessTask('assistant_answer').alias).toBe('Nova-Core');
    expect(resolveBusinessTask('fast_classification').alias).toBe('Nova-Scout');
    expect(resolveBusinessTask('retrieval').alias).toBe('Nova-Retrieve');
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
});

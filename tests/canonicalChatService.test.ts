import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../src/server/api/app.js';

function clearProviderEnv() {
  process.env.GROQ_API_KEY = '';
  process.env.GEMINI_API_KEY = '';
  process.env.OPENAI_API_KEY = '';
  process.env.OLLAMA_BASE_URL = '';
  process.env.OLLAMA_MODEL = '';
}

function readNdjsonText(response: { body?: unknown; text?: string }) {
  const body = String(response.body || response.text || '');
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('canonical chat service', () => {
  beforeEach(() => {
    clearProviderEnv();
  });

  it('persists a thread and restores messages through the canonical api', async () => {
    const app = createApiApp();
    const userId = `chat-user-${Date.now()}`;

    const chatRes = await request(app)
      .post('/api/chat')
      .send({
        userId,
        message: 'Why this signal?',
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
    const meta = events.find((item) => item.type === 'meta' && item.threadId);
    const done = events.find((item) => item.type === 'done');
    expect(meta?.threadId).toBeTruthy();
    expect(done).toBeTruthy();

    const threadListRes = await request(app).get('/api/chat/threads').query({ userId, limit: 5 });
    expect(threadListRes.status).toBe(200);
    expect(threadListRes.body.count).toBeGreaterThan(0);
    expect(threadListRes.body.data[0].id).toBe(meta?.threadId);

    const threadRes = await request(app).get(`/api/chat/threads/${meta?.threadId}`).query({ userId, limit: 20 });
    expect(threadRes.status).toBe(200);
    expect(Array.isArray(threadRes.body.messages)).toBe(true);
    expect(threadRes.body.messages.length).toBeGreaterThanOrEqual(2);
    expect(threadRes.body.messages.some((row: { role: string }) => row.role === 'assistant')).toBe(true);
  });
});

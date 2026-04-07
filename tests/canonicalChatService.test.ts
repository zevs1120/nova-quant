import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../src/server/api/app.js';
import { resetConfigCache } from '../src/server/config.js';
import { closeDb } from '../src/server/db/database.js';
import { resetRuntimeRepoSingleton } from '../src/server/db/runtimeRepository.js';
import { requestLocalHttp } from './helpers/httpTestClient.js';

function clearProviderEnv() {
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('OLLAMA_BASE_URL', '');
  vi.stubEnv('OLLAMA_MODEL', '');
  // Isolate from real NOVA_DATA_DATABASE_URL in .env to prevent PG mirror
  // activity that can trigger FK violations in chat_threads / chat_messages.
  vi.stubEnv('NOVA_DATA_DATABASE_URL', '');
  // Reset config AFTER stubs so getConfig()/getDb() use the clean env.
  resetConfigCache();
}

function readNdjsonText(response: { body?: unknown; text?: string }) {
  const body = String(response.text || response.body || '');
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

  afterEach(() => {
    vi.unstubAllEnvs();
    // Note: closeDb()'s internal require()-based reset doesn't work in ESM
    // vitest contexts, so we call resetRuntimeRepoSingleton() explicitly.
    resetRuntimeRepoSingleton();
    closeDb();
    resetConfigCache();
  });

  it('persists a thread and restores messages through the canonical api', async () => {
    const app = createApiApp();
    const userId = `guest-chat-user-${Date.now()}`;

    const chatRes = await requestLocalHttp(app, {
      method: 'POST',
      path: '/api/chat',
      body: {
        userId,
        message: 'Why this signal?',
        context: {
          page: 'today',
          market: 'US',
          assetClass: 'US_STOCK',
        },
      },
    });

    expect(chatRes.status).toBe(200);
    const events = readNdjsonText(chatRes);
    const meta = events.find((item) => item.type === 'meta' && item.threadId);
    const done = events.find((item) => item.type === 'done');
    expect(meta?.threadId).toBeTruthy();
    expect(done).toBeTruthy();

    const threadListRes = await requestLocalHttp(app, {
      path: '/api/chat/threads',
      query: { userId, limit: 5 },
    });
    expect(threadListRes.status).toBe(200);
    expect(threadListRes.body.count).toBeGreaterThan(0);
    expect(threadListRes.body.data[0].id).toBe(meta?.threadId);

    const hydratedListRes = await requestLocalHttp(app, {
      path: '/api/chat/threads',
      query: { userId, limit: 1, hydrate: 'latest-messages', messageLimit: 20 },
    });
    expect(hydratedListRes.status).toBe(200);
    expect(hydratedListRes.body.data[0].id).toBe(meta?.threadId);
    expect(hydratedListRes.body.restored?.thread?.id).toBe(meta?.threadId);
    expect(Array.isArray(hydratedListRes.body.restored?.messages)).toBe(true);
    expect(hydratedListRes.body.restored.messages.length).toBeGreaterThanOrEqual(2);

    const restoreRes = await requestLocalHttp(app, {
      path: '/api/chat/restore-latest',
      query: { userId, messageLimit: 3 },
    });
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.restored?.thread?.id).toBe(meta?.threadId);
    expect(Array.isArray(restoreRes.body.restored?.messages)).toBe(true);
    expect(restoreRes.body.restored.messages.length).toBeLessThanOrEqual(3);

    const threadRes = await requestLocalHttp(app, {
      path: `/api/chat/threads/${meta?.threadId}`,
      query: { userId, limit: 20 },
    });
    expect(threadRes.status).toBe(200);
    expect(Array.isArray(threadRes.body.messages)).toBe(true);
    expect(threadRes.body.messages.length).toBeGreaterThanOrEqual(2);
    expect(threadRes.body.messages.some((row: { role: string }) => row.role === 'assistant')).toBe(
      true,
    );
  });
});

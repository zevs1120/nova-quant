import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/supabaseAuth.js', () => ({
  getSupabaseAccessToken: vi.fn(async () => null),
}));

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

function setLocalWindow() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        hostname: 'localhost',
        protocol: 'http:',
      },
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
  if (originalFetch === undefined) {
    Reflect.deleteProperty(globalThis, 'fetch');
  } else {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: originalFetch,
    });
  }
});

describe('local API fallback', () => {
  it('keeps the cloud API in the candidate list during localhost development', async () => {
    setLocalWindow();
    const { runtimeApiBases } = await import('../src/utils/apiBase.js');

    expect(runtimeApiBases()).toEqual([
      '',
      'http://127.0.0.1:8787',
      'http://localhost:8787',
      'https://api.novaquant.cloud',
    ]);
  });

  it('falls through from local 404s to the cloud API for auth requests', async () => {
    setLocalWindow();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('Not found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain',
          },
        }),
      )
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8787'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED localhost:8787'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    const { fetchApi } = await import('../src/utils/api.js');
    const response = await fetchApi('/api/auth/login', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/auth/login',
      'http://127.0.0.1:8787/api/auth/login',
      'http://localhost:8787/api/auth/login',
      'https://api.novaquant.cloud/api/auth/login',
    ]);
  });

  it('retries when local proxy returns 405 for /api/*', async () => {
    setLocalWindow();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('Method Not Allowed', {
          status: 405,
          headers: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8787'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED localhost:8787'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    const { fetchApi } = await import('../src/utils/api.js');
    const response = await fetchApi('/api/auth/session', { method: 'GET' });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('retries when dev server returns HTML for an /api/* path (SPA fallback)', async () => {
    setLocalWindow();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8787'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED localhost:8787'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    const { fetchApi } = await import('../src/utils/api.js');
    const response = await fetchApi('/api/runtime/summary', { method: 'GET' });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('clears a cached absolute dev base when it later returns 404 and reaches the next candidate', async () => {
    setLocalWindow();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('nf', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ phase: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('gone', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('nf', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('nf', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('nf', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ phase: 2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    const { fetchApi } = await import('../src/utils/api.js');
    const first = await fetchApi('/api/decision/snapshot', { method: 'GET' });
    expect(first.status).toBe(200);
    const second = await fetchApi('/api/decision/snapshot', { method: 'GET' });
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.phase).toBe(2);
  });

  it('fetchApiJson surfaces server error field when present', async () => {
    setLocalWindow();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    const { fetchApiJson } = await import('../src/utils/api.js');
    await expect(fetchApiJson('/api/chat/send')).rejects.toThrow('RATE_LIMITED');
  });
});

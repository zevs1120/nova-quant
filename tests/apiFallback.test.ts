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
});

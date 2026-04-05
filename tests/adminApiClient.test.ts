import { afterEach, describe, expect, it, vi } from 'vitest';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

function setAdminWindow(hostname: string) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        hostname,
        protocol: hostname === 'localhost' ? 'http:' : 'https:',
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

describe('admin api client', () => {
  it('uses the shared runtime base list for production surfaces', async () => {
    setAdminWindow('admin.novaquant.cloud');
    const { getAdminApiBase } = await import('../admin/src/services/adminApi.js');

    expect(getAdminApiBase()).toBe('');
  });

  it('falls through from local dev responses to the cloud api host', async () => {
    setAdminWindow('localhost');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('Not found', {
          status: 404,
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

    const { getAdminSession } = await import('../admin/src/services/adminApi.js');
    const payload = await getAdminSession();

    expect(payload).toEqual({ ok: true });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/admin/session',
      'http://127.0.0.1:8787/api/admin/session',
      'http://localhost:8787/api/admin/session',
      'https://api.novaquant.cloud/api/admin/session',
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server/utils/time.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/server/utils/time.js')>();
  return {
    ...mod,
    sleep: () => Promise.resolve(),
  };
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalFetch === undefined) {
    Reflect.deleteProperty(globalThis, 'fetch');
  } else {
    globalThis.fetch = originalFetch;
  }
});

describe('fetchWithRetry', () => {
  it('returns immediately on ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const { fetchWithRetry } = await import('../src/server/utils/http.js');
    const res = await fetchWithRetry(
      'https://example.com/x',
      {},
      { attempts: 3, baseDelayMs: 10 },
      5000,
    );
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 4xx other than exhausted attempts path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const { fetchWithRetry } = await import('../src/server/utils/http.js');
    const res = await fetchWithRetry(
      'https://example.com/x',
      {},
      { attempts: 3, baseDelayMs: 10 },
      5000,
    );
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('err', { status: 500 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const { fetchWithRetry } = await import('../src/server/utils/http.js');
    const res = await fetchWithRetry(
      'https://example.com/x',
      {},
      { attempts: 3, baseDelayMs: 10 },
      5000,
    );
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on 429', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const { fetchWithRetry } = await import('../src/server/utils/http.js');
    const res = await fetchWithRetry(
      'https://example.com/x',
      {},
      { attempts: 3, baseDelayMs: 10 },
      5000,
    );
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws after repeated transport failures', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    globalThis.fetch = fetchMock as typeof fetch;

    const { fetchWithRetry } = await import('../src/server/utils/http.js');
    await expect(
      fetchWithRetry('https://example.com/x', {}, { attempts: 2, baseDelayMs: 1 }, 5000),
    ).rejects.toThrow('ECONNRESET');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

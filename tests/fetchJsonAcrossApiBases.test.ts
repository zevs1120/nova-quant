import { afterEach, describe, expect, it, vi } from 'vitest';

describe('fetchJsonAcrossApiBases', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
  });

  it('skips invalid payloads and returns the first valid JSON across bases', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('VITE_PUBLIC_API_BASE_URL', 'http://127.0.0.1:2');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ configured: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ configured: true, url: 'https://example.supabase.co', anonKey: 'k' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    globalThis.fetch = fetchMock as typeof fetch;

    const { fetchJsonAcrossApiBases } = await import('../src/shared/http/fetchAcrossApiBases.js');
    const payload = await fetchJsonAcrossApiBases(
      '/api/auth/provider-config',
      { cache: 'no-store' },
      {
        credentials: 'omit',
        useLocalhostBaseRetry: false,
        isValidPayload: (p: unknown) =>
          Boolean(
            p &&
            typeof p === 'object' &&
            'configured' in p &&
            (p as { configured?: boolean }).configured &&
            'url' in p &&
            'anonKey' in p,
          ),
      },
    );

    expect(payload).toMatchObject({
      configured: true,
      url: 'https://example.supabase.co',
      anonKey: 'k',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

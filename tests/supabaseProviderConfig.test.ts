import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGetAuthProviderConfig } from '../src/server/api/authHandlers.js';

describe('supabase provider config api', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://trsotsoanwzmigawxfii.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
    vi.stubEnv('SUPABASE_AUTH_REDIRECT_URL', 'http://127.0.0.1:5173/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns runtime supabase browser config when public auth env is present', async () => {
    let statusCode = 200;
    let payload: unknown = null;
    const response = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        payload = body;
      },
      setHeader() {},
    };

    handleGetAuthProviderConfig({}, response);

    expect(statusCode).toBe(200);
    expect(payload).toEqual({
      provider: 'supabase',
      configured: true,
      url: 'https://trsotsoanwzmigawxfii.supabase.co',
      anonKey: 'test-publishable-key',
      redirectUrl: 'http://127.0.0.1:5173/',
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('app vite config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_PUBLIC_API_BASE_URL', 'https://api.novaquant.cloud');
    vi.stubEnv('VITE_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubEnv('VITE_PUBLIC_SUPABASE_AUTH_REDIRECT_URL', 'https://app.novaquant.cloud/');
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubEnv('SUPABASE_AUTH_REDIRECT_URL', 'https://app.novaquant.cloud/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('injects public Supabase and API config into the standalone app build', async () => {
    const module = await import('../app/vite.config.js');
    const config = typeof module.default === 'function' ? module.default({}) : module.default;

    expect(config.define).toMatchObject({
      'globalThis.__NOVA_PUBLIC_SUPABASE_URL__': JSON.stringify('https://project.supabase.co'),
      'globalThis.__NOVA_PUBLIC_SUPABASE_PUBLISHABLE_KEY__': JSON.stringify('sb_publishable_test'),
      'globalThis.__NOVA_PUBLIC_SUPABASE_REDIRECT_URL__': JSON.stringify(
        'https://app.novaquant.cloud/',
      ),
      'globalThis.__NOVA_PUBLIC_API_BASE_URL__': JSON.stringify('https://api.novaquant.cloud'),
    });
  });
});

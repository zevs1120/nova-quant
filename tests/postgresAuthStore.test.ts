import { afterEach, describe, expect, it, vi } from 'vitest';

describe('postgres auth store config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('treats the business postgres url as a valid auth-store fallback', async () => {
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', '');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');

    const { hasPostgresAuthStore } = await import('../src/server/auth/postgresStore.js');
    expect(hasPostgresAuthStore()).toBe(true);
  });
});

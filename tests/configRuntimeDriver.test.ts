import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfig, resetConfigCache, resolveDbPath } from '../src/server/config.js';

describe('config runtime driver', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetConfigCache();
  });

  it('defaults to postgres runtime', () => {
    const config = getConfig();
    expect(config.database.driver).toBe('postgres');
    expect(config.database.url.startsWith('postgres')).toBe(true);
    expect(config.database.schema).toBe('novaquant_data');
  });

  it('resolves explicit postgres runtime configuration from env', () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');

    const config = getConfig();
    expect(config.database.driver).toBe('postgres');
    expect(config.database.url).toBe('postgres://runtime-host/db');
    expect(config.database.schema).toBe('novaquant_data');
    expect(() => resolveDbPath()).toThrow(
      'BUSINESS_RUNTIME_POSTGRES_ONLY: resolveDbPath() is unavailable because local database runtimes have been removed.',
    );
  });

  it('falls back to the shared in-memory postgres url in vitest when no business url is set', () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', '');
    const config = getConfig();
    expect(config.database.driver).toBe('postgres');
    expect(config.database.url).toBe('postgres://supabase-test-host/db');
  });
});

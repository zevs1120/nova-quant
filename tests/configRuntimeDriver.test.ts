import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfig, resetConfigCache, resolveDbPath } from '../src/server/config.js';

describe('config runtime driver', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetConfigCache();
  });

  it('defaults to postgres runtime outside tests', () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    const config = getConfig();
    expect(config.database.driver).toBe('postgres');
    if (config.database.driver === 'postgres') {
      expect(config.database.url).toBe('postgres://runtime-host/db');
    }
  });

  it('still resolves postgres runtime when NOVA_DATA_RUNTIME_DRIVER=postgres is set', () => {
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'postgres');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');

    const config = getConfig();
    expect(config.database.driver).toBe('postgres');
    if (config.database.driver === 'postgres') {
      expect(config.database.url).toBe('postgres://runtime-host/db');
      expect(config.database.schema).toBe('novaquant_data');
    }
    expect(() => resolveDbPath()).toThrow('BUSINESS_RUNTIME_POSTGRES_ONLY');
  });

  it('throws when postgres runtime has no business database url', () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', '');
    expect(() => getConfig()).toThrow(
      'NOVA_DATA_RUNTIME_DRIVER=postgres requires NOVA_DATA_DATABASE_URL',
    );
  });
});

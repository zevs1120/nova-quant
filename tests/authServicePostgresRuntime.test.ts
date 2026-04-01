import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDb = vi.fn(() => {
  throw new Error('LEGACY_LOCAL_DB_SHOULD_NOT_RUN');
});
const mockPgGetUserState = vi.fn(async () => ({
  assetClass: 'US_STOCK',
  market: 'US',
  uiMode: 'standard',
  riskProfileKey: 'balanced',
  watchlist: ['SPY'],
  holdings: [],
  executions: [],
  disciplineLog: {
    checkins: [],
    boundary_kept: [],
    weekly_reviews: [],
  },
}));
const mockPgGetUserByEmail = vi.fn(async () => null);
const mockPgInsertUserWithState = vi.fn(async () => undefined);

vi.mock('../src/server/db/database.js', () => ({
  getDb: mockGetDb,
}));

vi.mock('../src/server/auth/postgresStore.js', async () => {
  const actual = await vi.importActual<typeof import('../src/server/auth/postgresStore.js')>(
    '../src/server/auth/postgresStore.js',
  );
  return {
    ...actual,
    hasPostgresAuthStore: () => true,
    pgGetUserState: mockPgGetUserState,
    pgGetUserByEmail: mockPgGetUserByEmail,
    pgInsertUserWithState: mockPgInsertUserWithState,
  };
});

describe('auth service in postgres runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'postgres');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    // Test account is disabled by default (requires NOVA_ENABLE_TEST_ACCOUNT=1)
    vi.stubEnv('NOVA_ENABLE_SEEDED_DEMO_USER', '0');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reads auth state without touching any legacy local database path', async () => {
    const { getAuthUserState } = await import('../src/server/auth/service.js');

    const state = await getAuthUserState('usr_runtime_pg');

    expect(state.market).toBe('US');
    expect(state.watchlist).toEqual(['SPY']);
    expect(mockGetDb).not.toHaveBeenCalled();
    expect(mockPgGetUserState).toHaveBeenCalledWith('usr_runtime_pg');
  });
});

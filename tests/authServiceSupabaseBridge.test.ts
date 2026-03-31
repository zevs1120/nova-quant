import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scryptSync } from 'node:crypto';

function hashLegacyPassword(password: string, salt = 'bridge-test-salt') {
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

const mockGetDb = vi.fn(() => {
  throw new Error('SQLITE_SHOULD_NOT_RUN');
});
const mockPgGetUserState = vi.fn().mockResolvedValue({
  assetClass: 'US_STOCK',
  market: 'US',
  uiMode: 'standard',
  riskProfileKey: 'balanced',
  watchlist: [],
  holdings: [],
  executions: [],
  disciplineLog: {
    checkins: [],
    boundary_kept: [],
    weekly_reviews: [],
  },
});
const mockPgGetUserByEmail = vi.fn();
const mockPgGetSupabaseAuthUserByEmail = vi.fn();
const mockPgVerifySupabaseAuthPassword = vi.fn();
const mockPgInsertSupabaseAuthUser = vi.fn().mockResolvedValue('supabase-user-id');
const mockPgUpdateSupabaseAuthPassword = vi.fn().mockResolvedValue(undefined);
const mockPgTouchSupabaseAuthUser = vi.fn().mockResolvedValue(undefined);
const mockPgUpsertUser = vi.fn().mockResolvedValue(undefined);
const mockPgUpsertSession = vi.fn().mockResolvedValue(undefined);
const mockPgListUserRoles = vi.fn().mockResolvedValue([]);

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
    pgGetSupabaseAuthUserByEmail: mockPgGetSupabaseAuthUserByEmail,
    pgVerifySupabaseAuthPassword: mockPgVerifySupabaseAuthPassword,
    pgInsertSupabaseAuthUser: mockPgInsertSupabaseAuthUser,
    pgUpdateSupabaseAuthPassword: mockPgUpdateSupabaseAuthPassword,
    pgTouchSupabaseAuthUser: mockPgTouchSupabaseAuthUser,
    pgUpsertUser: mockPgUpsertUser,
    pgUpsertSession: mockPgUpsertSession,
    pgListUserRoles: mockPgListUserRoles,
  };
});

describe('auth service supabase bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('NOVA_AUTH_PG_SSL', 'disable');
    // Stub the data runtime driver to postgres so that canUseLocalSqliteAuthMirror()
    // returns false and the mocked getDb() is never called by auth mirror code.
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'postgres');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('NOVA_DISABLE_TEST_ACCOUNT', '1');
    vi.stubEnv('NOVA_ENABLE_SEEDED_DEMO_USER', '0');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NOVA_ADMIN_EMAILS', '');
    vi.stubEnv('NOVA_OWNER_EMAIL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('accepts a legacy password for migrated users and syncs it into auth.users', async () => {
    mockPgGetUserByEmail.mockResolvedValueOnce({
      user_id: 'usr_bridge',
      email: 'bridge@example.com',
      password_hash: hashLegacyPassword('LegacyPass123'),
      name: 'Bridge User',
      trade_mode: 'active',
      broker: 'Robinhood',
      locale: 'en',
      created_at_ms: 1_710_000_000_000,
      updated_at_ms: 1_710_000_000_000,
      last_login_at_ms: 1_710_000_000_000,
    });
    mockPgGetSupabaseAuthUserByEmail.mockResolvedValueOnce({
      auth_user_id: '81c5e901-6ac3-40a1-86de-0951e6fe4fea',
      email: 'bridge@example.com',
      encrypted_password: '$2a$10$randomized',
      email_confirmed_at_ms: 1_710_000_000_000,
      last_sign_in_at_ms: null,
      created_at_ms: 1_710_000_000_000,
      updated_at_ms: 1_710_000_000_000,
      raw_user_meta_data: null,
      raw_app_meta_data: null,
    });
    mockPgVerifySupabaseAuthPassword.mockResolvedValueOnce(null);

    const { loginAuthUser } = await import('../src/server/auth/service.js');
    const result = await loginAuthUser({
      email: 'bridge@example.com',
      password: 'LegacyPass123',
    });

    expect(result.ok).toBe(true);
    expect(mockPgUpdateSupabaseAuthPassword).toHaveBeenCalledWith(
      'bridge@example.com',
      'LegacyPass123',
      expect.any(Number),
    );
    expect(mockPgTouchSupabaseAuthUser).toHaveBeenCalledWith(
      'bridge@example.com',
      expect.any(Number),
    );
    expect(mockPgUpsertSession).toHaveBeenCalledTimes(1);
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('creates a missing auth.users record after a successful legacy-password login', async () => {
    mockPgGetUserByEmail.mockResolvedValueOnce({
      user_id: 'usr_bridge',
      email: 'create@example.com',
      password_hash: hashLegacyPassword('LegacyPass123'),
      name: 'Create User',
      trade_mode: 'starter',
      broker: 'Other',
      locale: 'en',
      created_at_ms: 1_710_000_000_000,
      updated_at_ms: 1_710_000_000_000,
      last_login_at_ms: 1_710_000_000_000,
    });
    mockPgGetSupabaseAuthUserByEmail.mockResolvedValueOnce(null);

    const { loginAuthUser } = await import('../src/server/auth/service.js');
    const result = await loginAuthUser({
      email: 'create@example.com',
      password: 'LegacyPass123',
    });

    expect(result.ok).toBe(true);
    expect(mockPgInsertSupabaseAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'create@example.com',
        password: 'LegacyPass123',
        legacyUserId: 'usr_bridge',
        name: 'Create User',
      }),
    );
    expect(mockPgUpsertSession).toHaveBeenCalledTimes(1);
  });
});

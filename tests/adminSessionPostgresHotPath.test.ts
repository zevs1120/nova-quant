import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDb = vi.fn(() => {
  throw new Error('LEGACY_LOCAL_DB_SHOULD_NOT_RUN');
});
const mockPgGetUserByEmail = vi.fn(async () => null);
const mockPgGetSessionBundle = vi.fn<
  (tokenHash: string, now: number) => Promise<Record<string, unknown> | null>
>(async () => null);
const mockPgGetAdminSessionBundle = vi.fn<
  (tokenHash: string, now: number) => Promise<Record<string, unknown> | null>
>(async () => null);
const mockPgTouchSession = vi.fn(async () => undefined);
const mockPgListUserRoles = vi.fn(async () => []);
const mockPgUpsertUserRole = vi.fn(async () => undefined);

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
    pgGetUserByEmail: mockPgGetUserByEmail,
    pgGetSessionBundle: mockPgGetSessionBundle,
    pgGetAdminSessionBundle: mockPgGetAdminSessionBundle,
    pgTouchSession: mockPgTouchSession,
    pgListUserRoles: mockPgListUserRoles,
    pgUpsertUserRole: mockPgUpsertUserRole,
  };
});

function buildBundle(now: number) {
  return {
    session: {
      session_id: 'sess_pg_hot_path',
      user_id: 'usr_pg_hot_path',
      session_token_hash: 'hashed-token',
      user_agent: 'vitest',
      ip_address: '127.0.0.1',
      expires_at_ms: now + 60_000,
      revoked_at_ms: null,
      created_at_ms: now - 10_000,
      updated_at_ms: now - 10_000,
      last_seen_at_ms: now - 60_000,
    },
    user: {
      user_id: 'usr_pg_hot_path',
      email: 'admin-postgres@example.com',
      password_hash: 'hashed-password',
      name: 'Admin Postgres',
      trade_mode: 'active' as const,
      broker: 'Other',
      locale: 'zh-CN',
      created_at_ms: now - 86_400_000,
      updated_at_ms: now - 10_000,
      last_login_at_ms: now - 10_000,
    },
    state: {
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
    },
  };
}

describe('admin auth postgres hot path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T12:00:00.000Z'));
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'postgres');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-test-host/db');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://runtime-test-host/db');
    vi.stubEnv('NOVA_AUTH_PG_SSL', 'disable');
    // Test account is disabled by default (requires NOVA_ENABLE_TEST_ACCOUNT=1)
    vi.stubEnv('NOVA_ENABLE_SEEDED_DEMO_USER', '0');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NOVA_ADMIN_EMAILS', 'admin-postgres@example.com');
    vi.stubEnv('NOVA_DISABLE_GUARANTEED_ADMIN_ACCOUNT', '1');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('skips postgres session touch inside the activity throttle window', async () => {
    const now = Date.now();
    mockPgGetSessionBundle.mockResolvedValueOnce({
      ...buildBundle(now),
      session: {
        ...buildBundle(now).session,
        last_seen_at_ms: now - 60_000,
      },
    });

    const { getAuthSession } = await import('../src/server/auth/service.js');
    const session = await getAuthSession('plain-auth-token');

    expect(session?.user.email).toBe('admin-postgres@example.com');
    expect(mockPgTouchSession).not.toHaveBeenCalled();
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('authorizes configured admins from the postgres admin bundle without extra role I/O', async () => {
    const now = Date.now();
    mockPgGetAdminSessionBundle.mockResolvedValueOnce({
      ...buildBundle(now),
      session: {
        ...buildBundle(now).session,
        last_seen_at_ms: now - 30_000,
      },
      roles: [],
    });

    const { getAdminSession } = await import('../src/server/auth/service.js');
    const session = await getAdminSession('admin-auth-token');

    expect(session).toMatchObject({
      user: {
        email: 'admin-postgres@example.com',
      },
      roles: ['ADMIN'],
    });
    expect(mockPgGetSessionBundle).not.toHaveBeenCalled();
    expect(mockPgListUserRoles).not.toHaveBeenCalled();
    expect(mockPgUpsertUserRole).not.toHaveBeenCalled();
    expect(mockPgTouchSession).not.toHaveBeenCalled();
  });

  it('returns null when postgres bundle user has no ADMIN role and is not env-configured admin', async () => {
    vi.stubEnv('NOVA_ADMIN_EMAILS', '');
    vi.stubEnv('NOVA_OWNER_EMAIL', '');

    const now = Date.now();
    const base = buildBundle(now);
    mockPgGetAdminSessionBundle.mockResolvedValueOnce({
      ...base,
      user: {
        ...base.user,
        email: 'plain-user@example.com',
      },
      roles: [],
    });

    const { getAdminSession } = await import('../src/server/auth/service.js');
    const session = await getAdminSession('non-admin-token');

    expect(session).toBe(null);
    expect(mockPgGetSessionBundle).not.toHaveBeenCalled();
  });
});

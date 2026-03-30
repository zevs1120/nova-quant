import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockPool = vi.fn(function MockPool() {
  return {
    query: mockQuery,
  };
});

vi.mock('pg', () => ({
  Pool: mockPool,
}));

describe('postgres admin session bundle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('NOVA_AUTH_PG_SSL', 'disable');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('parses role arrays even when pg returns a postgres array string', async () => {
    const now = Date.now();
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          session_id: 'sess_pg_bundle',
          user_id: 'usr_pg_bundle',
          session_token_hash: 'hashed-token',
          user_agent: 'vitest',
          ip_address: '127.0.0.1',
          expires_at_ms: now + 60_000,
          revoked_at_ms: null,
          session_created_at_ms: now - 10_000,
          session_updated_at_ms: now - 10_000,
          last_seen_at_ms: now - 10_000,
          email: 'admin@example.com',
          password_hash: 'hashed-password',
          name: 'Admin User',
          trade_mode: 'active',
          broker: 'Other',
          locale: 'zh-CN',
          user_created_at_ms: now - 86_400_000,
          user_updated_at_ms: now - 10_000,
          last_login_at_ms: now - 10_000,
          asset_class: 'US_STOCK',
          market: 'US',
          ui_mode: 'standard',
          risk_profile_key: 'balanced',
          watchlist_json: '[]',
          holdings_json: '[]',
          executions_json: '[]',
          discipline_log_json: '{"checkins":[],"boundary_kept":[],"weekly_reviews":[]}',
          roles: '{ADMIN,SUPPORT}',
        },
      ],
    });

    const { pgGetAdminSessionBundle } = await import('../src/server/auth/postgresStore.js');
    const bundle = await pgGetAdminSessionBundle('hashed-token', now);

    expect(bundle?.roles).toEqual(['ADMIN', 'SUPPORT']);
    expect(mockPool).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

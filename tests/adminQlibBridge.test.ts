import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { _resetAdminCachesForTesting } from '../src/server/admin/service.js';

/**
 * Tests that the admin system snapshot correctly surfaces Qlib Bridge status.
 *
 * Since the Qlib Bridge is a remote sidecar service (Python FastAPI on :8788),
 * these tests run with QLIB_BRIDGE_ENABLED=false (default) to verify the
 * disabled path, and mock fetch to verify the enabled path.
 */

// ---------------------------------------------------------------------------
// Mock helpers — we import buildAdminSystemSnapshot dynamically after env setup
// ---------------------------------------------------------------------------

type SystemSnapshot = {
  qlib_bridge: {
    enabled: boolean;
    healthy: boolean;
    state: 'disabled' | 'offline' | 'data_not_ready' | 'online';
    version: string | null;
    qlib_ready: boolean;
    uptime_seconds: number | null;
    provider_uri: string | null;
    region: string | null;
    max_universe_size: number | null;
    available_factor_sets: Array<{ id: string; factor_count: number; description: string }>;
    available_models: Array<{ name: string; file: string | null; size_kb: number }>;
  };
  diagnostics: Array<{ severity: string; title: string; detail: string }>;
  generated_at: string;
};

type OverviewSnapshot = {
  _partial?: true;
  headline_metrics: {
    qlib_bridge_enabled: boolean;
    qlib_bridge_healthy: boolean;
    qlib_bridge_ready: boolean;
    qlib_bridge_state: 'disabled' | 'offline' | 'data_not_ready' | 'online';
  };
  system_cards: {
    qlib_bridge_enabled: boolean;
    qlib_bridge_healthy: boolean;
    qlib_bridge_ready: boolean;
    qlib_bridge_state: 'disabled' | 'offline' | 'data_not_ready' | 'online';
    qlib_bridge_version: string | null;
  };
};

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    async json() {
      return body;
    },
  };
}

describe('admin qlib bridge integration', () => {
  beforeEach(() => {
    _resetAdminCachesForTesting();
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_DATA_PG_SCHEMA', 'novaquant_data');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns qlib_bridge disabled when QLIB_BRIDGE_ENABLED is false', async () => {
    vi.stubEnv('QLIB_BRIDGE_ENABLED', 'false');

    // Reset config cache so new env is picked up
    const { resetConfigCache } = await import('../src/server/config.js');
    resetConfigCache();

    const { buildAdminSystemSnapshot } = await import('../src/server/admin/service.js');
    const snapshot = (await buildAdminSystemSnapshot()) as SystemSnapshot;

    expect(snapshot.qlib_bridge).toBeDefined();
    expect(snapshot.qlib_bridge.enabled).toBe(false);
    expect(snapshot.qlib_bridge.healthy).toBe(false);
    expect(snapshot.qlib_bridge.state).toBe('disabled');
    expect(snapshot.qlib_bridge.version).toBeNull();
    expect(snapshot.qlib_bridge.qlib_ready).toBe(false);
    expect(snapshot.qlib_bridge.available_factor_sets).toEqual([]);
    expect(snapshot.qlib_bridge.available_models).toEqual([]);

    // No Qlib-related diagnostics when disabled
    const qlibDiags = snapshot.diagnostics.filter((d) => d.title.includes('Qlib'));
    expect(qlibDiags).toHaveLength(0);
  }, 15_000);

  it('returns qlib_bridge enabled but unhealthy when bridge is unreachable', async () => {
    vi.stubEnv('QLIB_BRIDGE_ENABLED', 'true');
    vi.stubEnv('QLIB_BRIDGE_URL', 'http://127.0.0.1:19999');

    const { resetConfigCache } = await import('../src/server/config.js');
    resetConfigCache();

    const { buildAdminSystemSnapshot } = await import('../src/server/admin/service.js');
    const snapshot = (await buildAdminSystemSnapshot()) as SystemSnapshot;

    expect(snapshot.qlib_bridge.enabled).toBe(true);
    expect(snapshot.qlib_bridge.healthy).toBe(false);
    expect(snapshot.qlib_bridge.state).toBe('offline');

    // Should produce a diagnostic about Qlib Bridge being unreachable
    const qlibDiags = snapshot.diagnostics.filter((d) => d.title.includes('Qlib'));
    expect(qlibDiags.length).toBeGreaterThanOrEqual(1);
    expect(qlibDiags[0].severity).toBe('WARN');
    expect(qlibDiags[0].title).toContain('不可达');
  }, 15_000);

  it('reports data_not_ready when bridge is running but qlib is not initialized', async () => {
    vi.stubEnv('QLIB_BRIDGE_ENABLED', 'true');
    vi.stubEnv('QLIB_BRIDGE_URL', 'http://127.0.0.1:8788');

    const { resetConfigCache } = await import('../src/server/config.js');
    resetConfigCache();

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/status')) {
        return jsonResponse({
          status: 'running',
          qlib_ready: false,
          version: 'qlib-bridge-test',
          uptime_seconds: 123,
        });
      }
      if (url.endsWith('/api/factors/sets')) return jsonResponse([]);
      if (url.endsWith('/api/models')) return jsonResponse([]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { buildAdminSystemSnapshot } = await import('../src/server/admin/service.js');
    const snapshot = (await buildAdminSystemSnapshot()) as SystemSnapshot;

    expect(snapshot.qlib_bridge.enabled).toBe(true);
    expect(snapshot.qlib_bridge.healthy).toBe(true);
    expect(snapshot.qlib_bridge.qlib_ready).toBe(false);
    expect(snapshot.qlib_bridge.state).toBe('data_not_ready');
    expect(snapshot.diagnostics.some((row) => row.title.includes('数据未就绪'))).toBe(true);
  }, 15_000);

  it('overview headline fast path includes qlib state fields and only calls /api/status', async () => {
    vi.stubEnv('QLIB_BRIDGE_ENABLED', 'true');
    vi.stubEnv('QLIB_BRIDGE_URL', 'http://127.0.0.1:8788');

    const { resetConfigCache } = await import('../src/server/config.js');
    resetConfigCache();

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/status')) {
        return jsonResponse({
          status: 'running',
          qlib_ready: false,
          version: 'qlib-bridge-headline',
        });
      }
      throw new Error(`Headline fast path should not hit ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { buildAdminOverviewHeadlineFast } = await import('../src/server/admin/service.js');
    const overview = (await buildAdminOverviewHeadlineFast()) as OverviewSnapshot;

    expect(overview._partial).toBe(true);
    expect(overview.headline_metrics.qlib_bridge_enabled).toBe(true);
    expect(overview.headline_metrics.qlib_bridge_healthy).toBe(true);
    expect(overview.headline_metrics.qlib_bridge_ready).toBe(false);
    expect(overview.headline_metrics.qlib_bridge_state).toBe('data_not_ready');
    expect(overview.system_cards.qlib_bridge_enabled).toBe(true);
    expect(overview.system_cards.qlib_bridge_healthy).toBe(true);
    expect(overview.system_cards.qlib_bridge_ready).toBe(false);
    expect(overview.system_cards.qlib_bridge_state).toBe('data_not_ready');
    expect(overview.system_cards.qlib_bridge_version).toBe('qlib-bridge-headline');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/api/status');
  }, 15_000);

  it('qlib_bridge gracefully degrades when fetch throws', async () => {
    vi.stubEnv('QLIB_BRIDGE_ENABLED', 'true');
    vi.stubEnv('QLIB_BRIDGE_URL', 'http://127.0.0.1:19999');

    const { resetConfigCache } = await import('../src/server/config.js');
    resetConfigCache();

    // The fetch to an unreachable port will fail with ECONNREFUSED,
    // which should be caught and return enabled=true, healthy=false
    const { buildAdminSystemSnapshot } = await import('../src/server/admin/service.js');
    const snapshot = (await buildAdminSystemSnapshot()) as SystemSnapshot;

    expect(snapshot.qlib_bridge.enabled).toBe(true);
    expect(snapshot.qlib_bridge.healthy).toBe(false);
    expect(snapshot.qlib_bridge.state).toBe('offline');
    expect(snapshot.qlib_bridge.version).toBeNull();
    expect(snapshot.qlib_bridge.available_factor_sets).toEqual([]);
    expect(snapshot.qlib_bridge.available_models).toEqual([]);

    // Should NOT throw — the admin panel should still render
    expect(snapshot.generated_at).toBeTruthy();
  }, 15_000);
});

// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialData } from '../../src/config/appConstants.js';

function buildFetchJson() {
  return vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/api/runtime-state')) {
      return {
        data: {
          signals: [{ id: 's1' }],
          decision: null,
          evidence: {
            top_signals: [{ signal_id: 's1', symbol: 'AAPL', conviction: 0.71 }],
            source_status: 'MODEL_DERIVED',
            data_status: 'MODEL_DERIVED',
            asof: '2024-01-01T00:00:00.000Z',
          },
          market_modules: [],
          performance: initialData.performance,
          config: {
            runtime: {
              api_checks: {
                signal_count: 1,
                market_state_count: 0,
                modules_count: 0,
                performance_records: 0,
              },
            },
            risk_rules: {},
          },
        },
        asof: '2024-01-01T00:00:00.000Z',
        source_status: 'DB_BACKED',
        data_status: 'ok',
      };
    }
    if (u.includes('/api/assets')) return { count: 0 };
    if (u.includes('/api/evidence')) return { records: [], source_status: 'INSUFFICIENT_DATA' };
    if (u.includes('/api/market-state')) return { count: 0 };
    if (u.includes('/api/performance')) return { records: [] };
    if (u.includes('/api/market/modules')) return { data: [], count: 0 };
    if (u.includes('/api/risk-profile')) return { data: {} };
    if (u.includes('/api/connect/broker')) return { snapshot: null };
    if (u.includes('/api/connect/exchange')) return { snapshot: null };
    if (u.includes('/api/signals')) return { data: [{ id: 'api' }], count: 1 };
    return {};
  });
}

describe('useAppData', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('hydrates from API and exposes hasLoaded', async () => {
    const fetchJson = buildFetchJson();
    const { useAppData } = await import('../../src/hooks/useAppData.js');
    const { result } = renderHook(() =>
      useAppData({
        fetchJson,
        assetClass: 'US_STOCK',
        market: 'US',
        effectiveUserId: 'u1',
        authSession: null,
        riskProfileKey: 'balanced',
        executions: [],
        refreshNonce: 0,
      }),
    );
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(Array.isArray(result.current.data.signals)).toBe(true);
  });

  it('waits for the enabled gate before fetching runtime-state', async () => {
    const fetchJson = buildFetchJson();
    const { useAppData } = await import('../../src/hooks/useAppData.js');
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAppData({
          fetchJson,
          assetClass: 'US_STOCK',
          market: 'US',
          effectiveUserId: 'u1',
          authSession: null,
          riskProfileKey: 'balanced',
          executions: [],
          refreshNonce: 0,
          enabled,
        }),
      {
        initialProps: { enabled: false },
      },
    );

    expect(fetchJson).not.toHaveBeenCalled();
    expect(result.current.hasLoaded).toBe(false);

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(fetchJson.mock.calls.some(([url]) => String(url).includes('/api/runtime-state'))).toBe(
      true,
    );
  });

  it('reads warm cache from localStorage when fresh', async () => {
    const fetchJson = buildFetchJson();
    const inner = fetchJson.getMockImplementation()!;
    fetchJson.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/runtime-state')) {
        return {
          data: {
            signals: [],
            decision: null,
            evidence: {
              top_signals: [],
              source_status: 'INSUFFICIENT_DATA',
              data_status: 'INSUFFICIENT_DATA',
              asof: '2024-01-01T00:00:00.000Z',
            },
            market_modules: [],
            performance: initialData.performance,
            config: {
              runtime: {
                api_checks: {
                  signal_count: 0,
                  market_state_count: 0,
                  modules_count: 0,
                  performance_records: 0,
                },
              },
              risk_rules: {},
            },
          },
          asof: '2024-01-01T00:00:00.000Z',
          source_status: 'DB_BACKED',
          data_status: 'ok',
        };
      }
      if (u.includes('/api/signals')) return { data: [], count: 0 };
      return inner(url);
    });
    const cacheKey = 'u1:US:US_STOCK';
    localStorage.setItem(
      `nova-app-data-cache:v2:${cacheKey}`,
      JSON.stringify({
        savedAt: Date.now(),
        data: { ...initialData, signals: [{ id: 'cached' }] },
        rawData: { as_of: '2024-02-02' },
      }),
    );
    const { useAppData } = await import('../../src/hooks/useAppData.js');
    const { result } = renderHook(() =>
      useAppData({
        fetchJson,
        assetClass: 'US_STOCK',
        market: 'US',
        effectiveUserId: 'u1',
        authSession: null,
        riskProfileKey: 'balanced',
        executions: [],
        refreshNonce: 0,
      }),
    );
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.data.signals?.[0]?.id).toBe('cached');
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('does not re-fetch runtime summary endpoints when runtime-state already carries them', async () => {
    const fetchJson = buildFetchJson();
    const { useAppData } = await import('../../src/hooks/useAppData.js');
    const { result } = renderHook(() =>
      useAppData({
        fetchJson,
        assetClass: 'US_STOCK',
        market: 'US',
        effectiveUserId: 'u1',
        authSession: null,
        riskProfileKey: 'balanced',
        executions: [],
        refreshNonce: 0,
      }),
    );

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    const requested = fetchJson.mock.calls.map(([url]) => String(url));
    expect(requested.some((url) => url.includes('/api/assets'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/market-state'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/performance'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/market/modules'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/risk-profile'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/evidence/signals/top'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/signals?'))).toBe(false);
  });

  it('skips deferred hydration when runtime-state already advertises a complete primary snapshot', async () => {
    const fetchJson = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/runtime-state')) {
        return {
          data: {
            signals: [{ id: 's1' }, { id: 's2' }],
            decision: null,
            evidence: {
              top_signals: [{ signal_id: 's1', symbol: 'AAPL', conviction: 0.88 }],
              source_status: 'MODEL_DERIVED',
              data_status: 'MODEL_DERIVED',
              asof: '2024-01-01T00:00:00.000Z',
            },
            market_modules: [],
            performance: initialData.performance,
            config: {
              runtime: {
                api_checks: {
                  signal_count: 2,
                  market_state_count: 0,
                  modules_count: 0,
                  performance_records: 0,
                },
                connectivity: {
                  broker: { provider: 'ALPACA', connected: true },
                  exchange: { provider: 'BINANCE', connected: true },
                },
                hydration: {
                  evidence_included: true,
                  signals_included: 2,
                  signal_count: 2,
                  signals_truncated: false,
                  connectivity_included: true,
                },
              },
              risk_rules: {},
            },
          },
          asof: '2024-01-01T00:00:00.000Z',
          source_status: 'DB_BACKED',
          data_status: 'ok',
        };
      }
      return {};
    });
    const authSession = { userId: 'u-auth' };
    const { useAppData } = await import('../../src/hooks/useAppData.js');
    const { result } = renderHook(() =>
      useAppData({
        fetchJson,
        assetClass: 'US_STOCK',
        market: 'US',
        effectiveUserId: 'u-auth',
        authSession,
        riskProfileKey: 'balanced',
        executions: [],
        refreshNonce: 0,
      }),
    );

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    const requested = fetchJson.mock.calls.map(([url]) => String(url));
    expect(requested.every((url) => url.includes('/api/runtime-state'))).toBe(true);
    expect(requested.some((url) => url.includes('/api/evidence/signals/top'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/connect/broker'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/connect/exchange'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/signals?'))).toBe(false);
  });

  it('coalesces in-flight runtime-state revalidation across visibility pings', async () => {
    let resolveRuntime!: (value: unknown) => void;
    const runtimePromise = new Promise((resolve) => {
      resolveRuntime = resolve;
    });
    const fetchJson = vi.fn(async (url: string) => {
      if (String(url).includes('/api/runtime-state')) {
        return runtimePromise;
      }
      return {};
    });

    const { useAppData } = await import('../../src/hooks/useAppData.js');
    const { result } = renderHook(() =>
      useAppData({
        fetchJson,
        assetClass: 'US_STOCK',
        market: 'US',
        effectiveUserId: 'u1',
        authSession: null,
        riskProfileKey: 'balanced',
        executions: [],
        refreshNonce: 0,
      }),
    );

    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(fetchJson).toHaveBeenCalledTimes(1);

    resolveRuntime({
      data: {
        ...initialData,
        signals: [],
        decision: null,
        evidence: null,
        market_modules: [],
        performance: initialData.performance,
        config: {
          runtime: {
            api_checks: {
              signal_count: 0,
              market_state_count: 0,
              modules_count: 0,
              performance_records: 0,
            },
          },
          risk_rules: {},
        },
      },
      asof: '2024-01-01T00:00:00.000Z',
      source_status: 'DB_BACKED',
      data_status: 'ok',
    });

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
  });
});

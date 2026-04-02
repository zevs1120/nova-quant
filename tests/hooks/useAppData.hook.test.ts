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
          evidence: null,
          market_modules: [],
          performance: initialData.performance,
          config: {
            runtime: { api_checks: { signal_count: 1 } },
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
            evidence: null,
            market_modules: [],
            performance: initialData.performance,
            config: {
              runtime: { api_checks: { signal_count: 0 } },
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
  });
});

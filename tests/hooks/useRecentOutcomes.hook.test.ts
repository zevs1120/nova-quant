// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetRecentOutcomeCacheForTesting,
  useRecentOutcomes,
} from '../../src/hooks/useRecentOutcomes.js';

describe('useRecentOutcomes', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetRecentOutcomeCacheForTesting();
  });

  afterEach(() => {
    __resetRecentOutcomeCacheForTesting();
  });

  it('fetches recent outcomes when cache is empty', async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      outcomes: [{ id: 'o1' }],
      stats: { total: 1 },
    });
    const { result } = renderHook(() =>
      useRecentOutcomes({
        effectiveUserId: 'proof-user',
        fetchJson,
        limit: 50,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchJson).toHaveBeenCalledWith('/api/outcomes/recent?userId=proof-user&limit=50');
    expect(result.current.outcomeData).toEqual({
      outcomes: [{ id: 'o1' }],
      stats: { total: 1 },
    });
  });

  it('reuses cached outcomes across remounts', async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      outcomes: [{ id: 'o2' }],
      stats: { total: 1 },
    });
    const first = renderHook(() =>
      useRecentOutcomes({
        effectiveUserId: 'proof-cache',
        fetchJson,
        limit: 50,
      }),
    );

    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const secondFetch = vi.fn();
    const second = renderHook(() =>
      useRecentOutcomes({
        effectiveUserId: 'proof-cache',
        fetchJson: secondFetch,
        limit: 50,
      }),
    );

    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.outcomeData.outcomes).toEqual([{ id: 'o2' }]);
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it('coalesces concurrent requests for the same user and limit', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchJson = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const first = renderHook(() =>
      useRecentOutcomes({
        effectiveUserId: 'proof-shared',
        fetchJson,
        limit: 50,
      }),
    );
    const second = renderHook(() =>
      useRecentOutcomes({
        effectiveUserId: 'proof-shared',
        fetchJson,
        limit: 50,
      }),
    );

    expect(fetchJson).toHaveBeenCalledTimes(1);
    resolveFetch({
      outcomes: [{ id: 'o3' }],
      stats: { total: 1 },
    });

    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(first.result.current.outcomeData.outcomes).toEqual([{ id: 'o3' }]);
    expect(second.result.current.outcomeData.outcomes).toEqual([{ id: 'o3' }]);
  });
});

// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetControlPlaneStatusClientCacheForTesting,
  useControlPlaneStatus,
} from '../../src/hooks/useControlPlaneStatus.js';

describe('useControlPlaneStatus', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetControlPlaneStatusClientCacheForTesting();
  });

  afterEach(() => {
    __resetControlPlaneStatusClientCacheForTesting();
  });

  it('uses hydrated control plane without fetching', () => {
    const fetchJson = vi.fn();
    const { result } = renderHook(() =>
      useControlPlaneStatus({
        data: { config: { runtime: { control_plane: { ok: true } } } },
        fetchJson,
        effectiveUserId: 'u1',
      }),
    );
    expect(result.current.controlPlane).toEqual({ ok: true });
    expect(fetchJson).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('fetches when control plane missing', async () => {
    const fetchJson = vi.fn().mockResolvedValue({ status: 'ok' });
    const { result } = renderHook(() =>
      useControlPlaneStatus({
        data: {},
        fetchJson,
        effectiveUserId: 'u1',
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchJson).toHaveBeenCalledWith('/api/control-plane/status?userId=u1');
    expect(result.current.controlPlane).toEqual({ status: 'ok' });
  });

  it('nulls on fetch failure', async () => {
    const fetchJson = vi.fn().mockRejectedValue(new Error('net'));
    const { result } = renderHook(() =>
      useControlPlaneStatus({
        data: {},
        fetchJson,
        effectiveUserId: 'u1',
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.controlPlane).toBe(null);
  });

  it('reuses the client cache across remounts', async () => {
    const fetchJson = vi.fn().mockResolvedValue({ status: 'ok' });
    const first = renderHook(() =>
      useControlPlaneStatus({
        data: {},
        fetchJson,
        effectiveUserId: 'u-cache',
      }),
    );
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.controlPlane).toEqual({ status: 'ok' });
    first.unmount();

    const secondFetch = vi.fn();
    const second = renderHook(() =>
      useControlPlaneStatus({
        data: {},
        fetchJson: secondFetch,
        effectiveUserId: 'u-cache',
      }),
    );
    expect(second.result.current.controlPlane).toEqual({ status: 'ok' });
    expect(second.result.current.loading).toBe(false);
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it('coalesces concurrent requests for the same scope', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchJson = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const first = renderHook(() =>
      useControlPlaneStatus({
        data: {},
        fetchJson,
        effectiveUserId: 'u-shared',
      }),
    );
    const second = renderHook(() =>
      useControlPlaneStatus({
        data: {},
        fetchJson,
        effectiveUserId: 'u-shared',
      }),
    );

    expect(fetchJson).toHaveBeenCalledTimes(1);
    resolveFetch({ status: 'shared' });

    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(first.result.current.controlPlane).toEqual({ status: 'shared' });
    expect(second.result.current.controlPlane).toEqual({ status: 'shared' });
  });
});

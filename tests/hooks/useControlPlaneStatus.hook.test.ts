// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useControlPlaneStatus } from '../../src/hooks/useControlPlaneStatus.js';

describe('useControlPlaneStatus', () => {
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
});

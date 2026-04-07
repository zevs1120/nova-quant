// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMembership } from '../../src/hooks/useMembership.js';

describe('useMembership', () => {
  it('syncs remote plan into local storage', async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      currentPlan: 'lite',
      usage: { day: '2024-01-01', askNovaUsed: 0 },
      limits: {},
      remainingAskNova: 5,
    });
    const { result } = renderHook(() =>
      useMembership({
        locale: 'en',
        authSession: { userId: 'u1' },
        fetchJson,
      }),
    );
    await waitFor(() => expect(result.current.currentPlan).toBe('lite'));
    expect(fetchJson).toHaveBeenCalledWith('/api/membership/state');
  });

  it('reuses hydrated runtime membership state without an extra fetch', async () => {
    const fetchJson = vi.fn();
    const { result } = renderHook(() =>
      useMembership({
        locale: 'en',
        authSession: { userId: 'u1' },
        fetchJson,
        initialState: {
          currentPlan: 'pro',
          usage: { day: '2024-01-01', askNovaUsed: 2 },
          limits: {},
          remainingAskNova: null,
        },
      }),
    );

    await waitFor(() => expect(result.current.currentPlan).toBe('pro'));
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('waits for runtime bootstrap before deciding to fetch membership state', async () => {
    const fetchJson = vi.fn();
    const { result, rerender } = renderHook(
      ({
        bootstrapPending,
        initialState,
      }: {
        bootstrapPending: boolean;
        initialState: Record<string, unknown> | null;
      }) =>
        useMembership({
          locale: 'en',
          authSession: { userId: 'u1' },
          fetchJson,
          initialState,
          bootstrapPending,
        }),
      {
        initialProps: {
          bootstrapPending: true,
          initialState: null,
        } as {
          bootstrapPending: boolean;
          initialState: Record<string, unknown> | null;
        },
      },
    );

    expect(fetchJson).not.toHaveBeenCalled();

    rerender({
      bootstrapPending: false,
      initialState: {
        currentPlan: 'lite',
        usage: { day: '2024-01-01', askNovaUsed: 1 },
        limits: {},
        remainingAskNova: 4,
      },
    });

    await waitFor(() => expect(result.current.currentPlan).toBe('lite'));
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('openPrompt accepts prebuilt prompt object', () => {
    const fetchJson = vi.fn();
    const { result } = renderHook(() =>
      useMembership({
        locale: 'en',
        authSession: null,
        fetchJson,
      }),
    );
    act(() =>
      result.current.openPrompt({
        title: 'Custom',
        body: 'x',
        source: 'test',
        targetPlan: 'pro',
        eyebrow: 'e',
      }),
    );
    expect(result.current.prompt?.title).toBe('Custom');
  });

  it('requestAiAccess blocks portfolio-aware on free plan', () => {
    const fetchJson = vi.fn();
    const { result } = renderHook(() =>
      useMembership({
        locale: 'en',
        authSession: { userId: 'u1' },
        fetchJson,
      }),
    );
    act(() => {
      result.current.setMembershipPlan('free');
    });
    let allowed: boolean | undefined;
    act(() => {
      allowed = result.current.requestAiAccess({
        message: 'summarize my holdings risk',
        context: {},
      });
    });
    expect(allowed).toBe(false);
    expect(result.current.prompt?.source).toBe('portfolio_ai');
  });

  it('closePrompt clears state', () => {
    const fetchJson = vi.fn();
    const { result } = renderHook(() =>
      useMembership({
        locale: 'en',
        authSession: null,
        fetchJson,
      }),
    );
    act(() => result.current.openPrompt('today_locked'));
    expect(result.current.prompt).not.toBe(null);
    act(() => result.current.closePrompt());
    expect(result.current.prompt).toBe(null);
  });
});

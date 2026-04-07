// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBilling } from '../../src/hooks/useBilling.js';

describe('useBilling', () => {
  it('clears billing when logged out', async () => {
    const fetchJson = vi.fn();
    const { result, rerender } = renderHook(
      ({ session }: { session?: { userId: string } }) =>
        useBilling({
          locale: 'en',
          authSession: session,
          fetchJson,
          onApplyPlan: vi.fn(),
        }),
      { initialProps: { session: { userId: 'u1' } } },
    );
    rerender({ session: undefined } as unknown as { session: { userId: string } });
    await waitFor(() => expect(result.current.billingState).toBe(null));
  });

  it('openCheckout requires auth for paid plan', async () => {
    const fetchJson = vi.fn();
    const { result } = renderHook(() =>
      useBilling({
        locale: 'en',
        authSession: null,
        fetchJson,
        onApplyPlan: vi.fn(),
      }),
    );
    await act(async () => {
      await result.current.openCheckout({ planKey: 'lite' });
    });
    expect(result.current.checkoutState?.mode).toBe('auth_required');
  });

  it('does not auto-fetch billing state until enabled', async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      currentPlan: 'lite',
      providerMode: 'stripe',
      subscription: null,
      latestCheckout: null,
    });
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useBilling({
          locale: 'en',
          authSession: { userId: 'u1' },
          fetchJson,
          onApplyPlan: vi.fn(),
          enabled,
        }),
      {
        initialProps: { enabled: false },
      },
    );

    expect(fetchJson).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(fetchJson).toHaveBeenCalledWith('/api/billing/state'));
  });

  it('openCheckout then submitCheckout assigns stripe checkout url', async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      state: { currentPlan: 'lite', providerMode: 'stripe' },
      session: { checkoutUrl: 'https://stripe.test/checkout' },
    });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'https://app.test', pathname: '/', assign },
    });

    const { result } = renderHook(() =>
      useBilling({
        locale: 'en',
        authSession: { userId: 'u1' },
        fetchJson,
        onApplyPlan: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.openCheckout({ planKey: 'lite' });
    });
    expect(result.current.checkoutState?.mode).toBe('redirect');
    await act(async () => {
      await result.current.submitCheckout();
    });
    expect(assign).toHaveBeenCalledWith('https://stripe.test/checkout');
  });

  it('submitCheckout no-ops for auth_required', async () => {
    const fetchJson = vi.fn();
    const { result } = renderHook(() =>
      useBilling({
        locale: 'en',
        authSession: null,
        fetchJson,
        onApplyPlan: vi.fn(),
      }),
    );
    await act(async () => {
      await result.current.openCheckout({ planKey: 'lite' });
    });
    const ok = await act(async () => result.current.submitCheckout());
    expect(ok).toBe(false);
  });
});

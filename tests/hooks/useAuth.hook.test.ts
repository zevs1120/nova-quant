// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../src/hooks/useAuth.js';

vi.mock('../../src/utils/supabaseAuth.js', () => ({
  loadSupabaseBrowserConfig: vi.fn(() => Promise.resolve()),
  hasSupabaseAuthBrowserConfig: vi.fn(() => false),
  ensureSupabaseBrowserClient: vi.fn(() => Promise.resolve(null)),
  signUpWithSupabaseEmailVerification: vi.fn(async () => ({
    data: { user: { email_confirmed_at: null }, session: null },
    error: null,
  })),
  resendSupabaseSignupVerification: vi.fn(async () => ({ error: null })),
  getSupabaseAuthRedirectUrl: vi.fn(() => 'http://localhost/redirect'),
}));

const fetchApi = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ),
);

vi.mock('../../src/utils/api.js', () => ({
  fetchApi,
  fetchApiJson: vi.fn(),
}));

function authWrapperProps() {
  return {
    fetchJson: vi.fn().mockResolvedValue({ authenticated: false }),
    setAssetClass: vi.fn(),
    setMarket: vi.fn(),
    setActiveTab: vi.fn(),
    setMyStack: vi.fn(),
    locale: 'en',
  };
}

describe('useAuth', () => {
  it('hydrates unauthenticated when API reports guest', async () => {
    const props = authWrapperProps();
    const { result } = renderHook(() => useAuth(props));
    await waitFor(() => expect(result.current.authHydrated).toBe(true));
    expect(result.current.authSession).toBe(null);
  });

  it('applyAuthenticatedProfile sets session and admin flag', async () => {
    const props = authWrapperProps();
    const { result } = renderHook(() => useAuth(props));
    await waitFor(() => expect(result.current.authHydrated).toBe(true));
    act(() => {
      result.current.applyAuthenticatedProfile(
        {
          userId: 'u1',
          email: 'a@b.com',
          name: 'Alice',
          tradeMode: 'active',
          broker: 'IB',
        },
        { watchlist: ['SPY'] },
        { roles: ['ADMIN'] },
      );
    });
    expect(result.current.authSession?.userId).toBe('u1');
    expect(result.current.authSession?.isAdmin).toBe(true);
  });

  it('handleLogout clears session and calls logout endpoints', async () => {
    const props = authWrapperProps();
    const { result } = renderHook(() => useAuth(props));
    await waitFor(() => expect(result.current.authHydrated).toBe(true));
    act(() => {
      result.current.applyAuthenticatedProfile(
        {
          userId: 'u2',
          email: 'x@y.com',
          name: 'Bob',
          tradeMode: 'starter',
          broker: 'R',
        },
        null,
        { roles: [] },
      );
    });
    act(() => {
      result.current.handleLogout();
    });
    await waitFor(() => expect(result.current.authSession).toBe(null));
    expect(fetchApi).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('handleResendSignupVerification validates email', async () => {
    const props = authWrapperProps();
    const { result } = renderHook(() => useAuth(props));
    await waitFor(() => expect(result.current.authHydrated).toBe(true));
    const bad = await act(async () =>
      result.current.handleResendSignupVerification({ email: 'bad' }),
    );
    expect(bad.ok).toBe(false);
  });
});

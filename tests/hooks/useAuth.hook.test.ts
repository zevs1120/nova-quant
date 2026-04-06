// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetUseAuthSessionCacheForTests, useAuth } from '../../src/hooks/useAuth.js';

const ensureSupabaseBrowserClientMock = vi.hoisted(() =>
  vi.fn<() => Promise<any>>(() => Promise.resolve(null)),
);

vi.mock('../../src/utils/supabaseAuth.js', () => ({
  loadSupabaseBrowserConfig: vi.fn(() => Promise.resolve()),
  hasSupabaseAuthBrowserConfig: vi.fn(() => false),
  ensureSupabaseBrowserClient: ensureSupabaseBrowserClientMock,
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
  beforeEach(() => {
    __resetUseAuthSessionCacheForTests();
    fetchApi.mockClear();
    fetchApi.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    ensureSupabaseBrowserClientMock.mockReset();
    ensureSupabaseBrowserClientMock.mockResolvedValue(null);
  });

  it('hydrates unauthenticated when API reports guest', async () => {
    const props = authWrapperProps();
    const { result } = renderHook(() => useAuth(props));
    await waitFor(() => expect(result.current.authHydrated).toBe(true));
    expect(result.current.authSession).toBe(null);
  });

  it('dedupes session hydration across concurrent hooks', async () => {
    const fetchJson = vi.fn().mockResolvedValue({ authenticated: false });
    const props = {
      ...authWrapperProps(),
      fetchJson,
    };

    const first = renderHook(() => useAuth(props));
    const second = renderHook(() => useAuth(props));

    await waitFor(() => expect(first.result.current.authHydrated).toBe(true));
    await waitFor(() => expect(second.result.current.authHydrated).toBe(true));

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson).toHaveBeenCalledWith('/api/auth/session');
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

  it('redirects hosted app logout back to the public site', async () => {
    const props = authWrapperProps();
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        hostname: 'app.novaquant.cloud',
        assign,
      },
    });

    const { result } = renderHook(() => useAuth(props));
    await waitFor(() => expect(result.current.authHydrated).toBe(true));

    act(() => {
      result.current.handleLogout();
    });

    expect(assign).toHaveBeenCalledWith('https://novaquant.cloud');
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

  it('forces the legacy login bridge for the guaranteed admin account', async () => {
    const props = authWrapperProps();
    props.fetchJson.mockResolvedValueOnce({ authenticated: false }).mockResolvedValueOnce({
      authenticated: true,
      user: {
        userId: 'u-admin',
        email: 'zevs1120@gmail.com',
        name: 'Zevs',
        tradeMode: 'deep',
        broker: 'Other',
      },
      state: { watchlist: ['SPY'] },
      roles: ['ADMIN'],
    });
    ensureSupabaseBrowserClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          error: new Error('Email not confirmed'),
        }),
      },
    });
    fetchApi.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authenticated: true,
          user: {
            userId: 'u-admin',
            email: 'zevs1120@gmail.com',
            name: 'Zevs',
            tradeMode: 'deep',
            broker: 'Other',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const { result } = renderHook(() => useAuth(props));
    await waitFor(() => expect(result.current.authHydrated).toBe(true));

    const loginResult = await act(async () =>
      result.current.handleLogin({
        email: 'zevs1120@gmail.com',
        password: 'Zevs1120',
      }),
    );

    expect(loginResult).toEqual({ ok: true });
    expect(fetchApi).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.authSession?.isAdmin).toBe(true);
  });
});

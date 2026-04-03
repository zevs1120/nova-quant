import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOnboardingRetrySessionKey,
  classifyAuthError,
  mapExecutionToTrade,
  normalizeEmail,
  settledValue,
  shouldAttemptPendingOnboardingBonusRetry,
} from '../src/utils/appHelpers.js';

const originalWindow = globalThis.window;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
});

describe('appHelpers', () => {
  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  User@EXAMPLE.com  ')).toBe('user@example.com');
    expect(normalizeEmail('')).toBe('');
  });

  it('classifyAuthError maps known auth failures for en and zh', () => {
    expect(classifyAuthError(new Error('(401) INVALID_CREDENTIALS'), 'en')).toContain('incorrect');
    expect(classifyAuthError(new Error('(401) INVALID_CREDENTIALS'), 'zh-CN')).toContain('密码');

    expect(classifyAuthError(new Error('AUTH_STORE_NOT_CONFIGURED'), 'en')).toContain('auth store');
    expect(classifyAuthError(new Error('AUTH_STORE_UNREACHABLE'), 'zh')).toContain('账户存储');

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { hostname: 'localhost' } },
    });
    expect(classifyAuthError(new Error('network down'), 'en')).toContain('npm run api:data');

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { hostname: 'app.novaquant.cloud' } },
    });
    expect(classifyAuthError(new Error('network down'), 'en')).toContain('temporarily unavailable');
  });

  it('settledValue reads fulfilled results only', () => {
    expect(settledValue({ status: 'fulfilled', value: 42 }, null)).toBe(42);
    expect(settledValue({ status: 'rejected', reason: 'x' }, 'fallback')).toBe('fallback');
    expect(settledValue(undefined, 'z')).toBe('z');
  });

  it('mapExecutionToTrade normalizes snake_case and camelCase fields', () => {
    const row = mapExecutionToTrade({
      created_at: '2024-01-02T00:00:00.000Z',
      market: 'US',
      symbol: 'SPY',
      side: 'LONG',
      entry_price: 100,
      tp_price: 105,
      pnlPct: 0.02,
      fees: 1.5,
      signalId: 'sig-1',
      mode: 'PAPER',
    });
    expect(row.symbol).toBe('SPY');
    expect(row.entry).toBe(100);
    expect(row.exit).toBe(105);
    expect(row.pnl_pct).toBe(0.02);
    expect(row.fees).toBe(1.5);
    expect(row.signal_id).toBe('sig-1');
    expect(row.source).toBe('PAPER');
  });

  it('mapExecutionToTrade falls back when optional fields are missing', () => {
    const row = mapExecutionToTrade({
      market: 'CRYPTO',
      symbol: 'BTC',
      direction: 'SHORT',
      entry: 50,
    });
    expect(row.side).toBe('SHORT');
    expect(row.exit).toBe(50);
    expect(row.pnl_pct).toBe(0);
    expect(row.source).toBe('PAPER');
  });

  it('buildOnboardingRetrySessionKey only returns a value for authenticated sessions', () => {
    expect(buildOnboardingRetrySessionKey(null)).toBeNull();
    expect(buildOnboardingRetrySessionKey({ userId: 'usr_1' })).toBeNull();
    expect(
      buildOnboardingRetrySessionKey({
        userId: 'usr_1',
        loggedInAt: '2026-04-02T17:11:00.000Z',
      }),
    ).toBe('usr_1:2026-04-02T17:11:00.000Z');
  });

  it('shouldAttemptPendingOnboardingBonusRetry is scoped to the current login session', () => {
    const sessionA = buildOnboardingRetrySessionKey({
      userId: 'usr_a',
      loggedInAt: '2026-04-02T17:11:00.000Z',
    });
    const sessionANextLogin = buildOnboardingRetrySessionKey({
      userId: 'usr_a',
      loggedInAt: '2026-04-02T18:22:00.000Z',
    });
    const sessionB = buildOnboardingRetrySessionKey({
      userId: 'usr_b',
      loggedInAt: '2026-04-02T17:11:00.000Z',
    });

    expect(
      shouldAttemptPendingOnboardingBonusRetry({
        retrySessionKey: sessionA,
        effectiveUserId: 'usr_a',
        pendingByUser: { usr_a: true },
        attemptedSessionKey: null,
        isDemoRuntime: false,
      }),
    ).toBe(true);
    expect(
      shouldAttemptPendingOnboardingBonusRetry({
        retrySessionKey: sessionA,
        effectiveUserId: 'usr_a',
        pendingByUser: { usr_a: true },
        attemptedSessionKey: sessionA,
        isDemoRuntime: false,
      }),
    ).toBe(false);
    expect(
      shouldAttemptPendingOnboardingBonusRetry({
        retrySessionKey: sessionANextLogin,
        effectiveUserId: 'usr_a',
        pendingByUser: { usr_a: true },
        attemptedSessionKey: sessionA,
        isDemoRuntime: false,
      }),
    ).toBe(true);
    expect(
      shouldAttemptPendingOnboardingBonusRetry({
        retrySessionKey: sessionB,
        effectiveUserId: 'usr_b',
        pendingByUser: { usr_b: true },
        attemptedSessionKey: sessionA,
        isDemoRuntime: false,
      }),
    ).toBe(true);
    expect(
      shouldAttemptPendingOnboardingBonusRetry({
        retrySessionKey: sessionA,
        effectiveUserId: 'usr_a',
        pendingByUser: { usr_a: true },
        attemptedSessionKey: null,
        isDemoRuntime: true,
      }),
    ).toBe(false);
  });
});

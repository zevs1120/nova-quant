import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOnboardingRetrySessionKey,
  buildRiskProfileSyncKey,
  classifyAuthError,
  detectDisplayMode,
  hasSyncedRiskProfile,
  markRiskProfileSynced,
  mapExecutionToTrade,
  normalizeEmail,
  runWhenIdle,
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

  it('buildOnboardingRetrySessionKey trims fields and rejects blanks', () => {
    expect(
      buildOnboardingRetrySessionKey({
        userId: '  u1  ',
        loggedInAt: '  ts  ',
      }),
    ).toBe('u1:ts');
    expect(buildOnboardingRetrySessionKey({ userId: '', loggedInAt: 't' })).toBeNull();
    expect(buildOnboardingRetrySessionKey({ userId: 'u', loggedInAt: '' })).toBeNull();
  });

  it('shouldAttemptPendingOnboardingBonusRetry rejects missing keys or user mismatch', () => {
    expect(
      shouldAttemptPendingOnboardingBonusRetry({
        retrySessionKey: '',
        effectiveUserId: 'u',
        pendingByUser: { u: true },
        attemptedSessionKey: null,
        isDemoRuntime: false,
      }),
    ).toBe(false);
    expect(
      shouldAttemptPendingOnboardingBonusRetry({
        retrySessionKey: 'a:b',
        effectiveUserId: '',
        pendingByUser: { x: true },
        attemptedSessionKey: null,
        isDemoRuntime: false,
      }),
    ).toBe(false);
    expect(
      shouldAttemptPendingOnboardingBonusRetry({
        retrySessionKey: 'a:b',
        effectiveUserId: 'u',
        pendingByUser: {},
        attemptedSessionKey: null,
        isDemoRuntime: false,
      }),
    ).toBe(false);
  });

  it('buildRiskProfileSyncKey trims inputs and rejects blanks', () => {
    expect(buildRiskProfileSyncKey({ userId: ' guest-1 ', riskProfileKey: ' aggressive ' })).toBe(
      'guest-1:aggressive',
    );
    expect(buildRiskProfileSyncKey({ userId: '', riskProfileKey: 'balanced' })).toBeNull();
    expect(buildRiskProfileSyncKey({ userId: 'u1', riskProfileKey: '' })).toBeNull();
  });

  it('marks and reads synced risk profiles from localStorage', () => {
    const storage: {
      value: string | null;
      getItem: ReturnType<typeof vi.fn>;
      setItem: ReturnType<typeof vi.fn>;
    } = {
      value: null,
      getItem: vi.fn((key: string) =>
        key === 'nova-quant-risk-profile-sync:v1' ? storage.value : null,
      ),
      setItem: vi.fn((key: string, value: string) => {
        if (key === 'nova-quant-risk-profile-sync:v1') storage.value = value;
      }),
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: storage,
      },
    });

    expect(hasSyncedRiskProfile('guest-1:balanced')).toBe(false);
    markRiskProfileSynced('guest-1:balanced');
    expect(storage.setItem).toHaveBeenCalledWith(
      'nova-quant-risk-profile-sync:v1',
      'guest-1:balanced',
    );
    expect(hasSyncedRiskProfile('guest-1:balanced')).toBe(true);
    expect(hasSyncedRiskProfile('guest-1:aggressive')).toBe(false);
  });
});

describe('detectDisplayMode', () => {
  it('returns browser when window undefined', () => {
    const w = globalThis.window;
    Reflect.deleteProperty(globalThis, 'window');
    expect(detectDisplayMode()).toBe('browser');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: w });
  });

  it('detects standalone from matchMedia', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        matchMedia: (q: string) => ({
          matches: q.includes('standalone'),
        }),
        navigator: {},
      },
    });
    expect(detectDisplayMode()).toBe('standalone');
  });

  it('detects fullscreen when standalone media not matched', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        matchMedia: (q: string) => ({
          matches: q.includes('fullscreen'),
        }),
        navigator: {},
      },
    });
    expect(detectDisplayMode()).toBe('fullscreen');
  });

  it('uses legacy navigator.standalone on iOS', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: true },
      },
    });
    expect(detectDisplayMode()).toBe('standalone');
  });

  it('defaults to browser', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        matchMedia: () => ({ matches: false }),
        navigator: {},
      },
    });
    expect(detectDisplayMode()).toBe('browser');
  });
});

describe('runWhenIdle', () => {
  it('no-ops cancel when window missing', () => {
    const w = globalThis.window;
    Reflect.deleteProperty(globalThis, 'window');
    expect(runWhenIdle(() => {})).toEqual(expect.any(Function));
    runWhenIdle(() => {})();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: w });
  });

  it('uses requestIdleCallback when available', () => {
    const cancel = vi.fn();
    const ric = vi.fn((cb: () => void) => {
      cb();
      return 7;
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        requestIdleCallback: ric,
        cancelIdleCallback: cancel,
      },
    });
    const task = vi.fn();
    const stop = runWhenIdle(task);
    expect(ric).toHaveBeenCalled();
    expect(task).toHaveBeenCalled();
    stop();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it('falls back to setTimeout when ric missing', () => {
    const clear = vi.fn();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        setTimeout: (fn: () => void) => {
          fn();
          return 99;
        },
        clearTimeout: clear,
      },
    });
    const task = vi.fn();
    const stop = runWhenIdle(task);
    expect(task).toHaveBeenCalled();
    stop();
    expect(clear).toHaveBeenCalledWith(99);
  });
});

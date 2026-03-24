import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getManualDashboard,
  redeemManualVipDay,
  claimManualReferral,
  submitManualPredictionEntry
} from '../src/server/manual/service.js';

/*
 * Manual service tests exercise the loyalty/gamification system.
 * Note: manual_user_state has a FOREIGN KEY on users(user_id), so
 * fabricated user IDs that don't exist in the users table will trigger
 * the FK guard and return a default/unavailable dashboard. We test:
 * 1) Guest-prefix auth guards (no DB hit needed)
 * 2) FK-guard behavior for non-existent users
 * 3) VIP / referral / prediction input validation guards
 */

describe('manual dashboard — guest / auth guard', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns AUTH_REQUIRED for guest-default', () => {
    const dashboard = getManualDashboard('guest-default');
    expect(dashboard.available).toBe(false);
    expect(dashboard.reason).toBe('AUTH_REQUIRED');
    expect(dashboard.mode).toBe('REAL');
  });

  it('returns AUTH_REQUIRED for guest-prefixed IDs', () => {
    const dashboard = getManualDashboard('guest-abc123');
    expect(dashboard.available).toBe(false);
    expect(dashboard.reason).toBe('AUTH_REQUIRED');
  });

  it('returns AUTH_REQUIRED for empty string', () => {
    expect(getManualDashboard('').available).toBe(false);
    expect(getManualDashboard('').reason).toBe('AUTH_REQUIRED');
  });

  it('returns AUTH_REQUIRED for null', () => {
    expect(getManualDashboard(null).available).toBe(false);
  });

  it('returns AUTH_REQUIRED for undefined', () => {
    expect(getManualDashboard(undefined).available).toBe(false);
  });
});

/* ---------- default dashboard shape ---------- */

describe('manual dashboard — default shape', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('guest dashboard has correct summary defaults', () => {
    const d = getManualDashboard('guest-test');
    expect(d.summary.balance).toBe(0);
    expect(d.summary.expiringSoon).toBe(0);
    expect(d.summary.vipDays).toBe(0);
    expect(d.summary.vipDaysRedeemed).toBe(0);
  });

  it('guest dashboard has correct referral defaults', () => {
    const d = getManualDashboard('guest-test');
    expect(d.referrals.inviteCode).toBeNull();
    expect(d.referrals.referredByCode).toBeNull();
    expect(d.referrals.total).toBe(0);
    expect(d.referrals.rewarded).toBe(0);
  });

  it('guest dashboard has VIP reward definition', () => {
    const d = getManualDashboard('guest-test');
    expect(d.rewards.length).toBeGreaterThan(0);
    expect(d.rewards[0].kind).toBe('vip_day');
    expect(d.rewards[0].costPoints).toBe(1000);
    expect(d.rewards[0].enabled).toBe(false);
  });

  it('guest dashboard has rules', () => {
    const d = getManualDashboard('guest-test');
    expect(d.rules.vipRedeemPoints).toBe(1000);
    expect(d.rules.referralRewardPoints).toBe(200);
    expect(d.rules.defaultPredictionStake).toBe(100);
  });

  it('guest dashboard has empty ledger and predictions', () => {
    const d = getManualDashboard('guest-test');
    expect(d.ledger).toEqual([]);
    expect(d.predictions).toEqual([]);
  });
});

/* ---------- FK-guard behavior ---------- */

describe('manual dashboard — FK guard for non-existent users', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns unavailable dashboard for user not in users table', () => {
    const d = getManualDashboard(`fake-user-${Date.now()}`);
    // FK constraint causes ensureManualUserState to return null
    expect(d.available).toBe(false);
    expect(d.reason).toBeNull(); // not AUTH_REQUIRED, just FK guard
  });
});

/* ---------- VIP redemption guard ---------- */

describe('manual — VIP redemption guards', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('rejects guest users', () => {
    const result = redeemManualVipDay({ userId: 'guest-default' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('AUTH_REQUIRED');
  });

  it('rejects guest-prefixed users', () => {
    const result = redeemManualVipDay({ userId: 'guest-xyz' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('AUTH_REQUIRED');
  });
});

/* ---------- referral claim guards ---------- */

describe('manual — referral claim guards', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('rejects guest users', () => {
    const result = claimManualReferral({ userId: 'guest-default', inviteCode: 'NVTEST1' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('AUTH_REQUIRED');
  });

  it('rejects empty invite code', () => {
    const result = claimManualReferral({ userId: `nonguest-${Date.now()}`, inviteCode: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVITE_CODE_REQUIRED');
  });
});

/* ---------- prediction entry guards ---------- */

describe('manual — prediction entry guards', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('rejects guest users', () => {
    const result = submitManualPredictionEntry({
      userId: 'guest-default',
      marketId: 'mkt-1',
      selectedOption: 'UP'
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('AUTH_REQUIRED');
  });

  it('rejects empty marketId', () => {
    const result = submitManualPredictionEntry({
      userId: `nonguest-${Date.now()}`,
      marketId: '',
      selectedOption: 'UP'
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('PREDICTION_INPUT_REQUIRED');
  });

  it('rejects empty selectedOption', () => {
    const result = submitManualPredictionEntry({
      userId: `nonguest-${Date.now()}`,
      marketId: 'mkt-1',
      selectedOption: ''
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('PREDICTION_INPUT_REQUIRED');
  });

  it('rejects non-existent prediction market', () => {
    const result = submitManualPredictionEntry({
      userId: `nonguest-${Date.now()}`,
      marketId: 'market-that-doesnt-exist',
      selectedOption: 'UP'
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('PREDICTION_NOT_FOUND');
  });
});

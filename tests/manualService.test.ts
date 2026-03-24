import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getManualDashboard,
  claimManualReferral,
  redeemManualVipDay,
  submitManualPredictionEntry,
} from '../src/server/manual/service.js';

describe('manual service', () => {
  beforeEach(() => {
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the default guest dashboard for empty or guest-prefixed user ids', () => {
    const guestResult = getManualDashboard('');
    expect(guestResult.available).toBe(false);
    expect(guestResult.reason).toBe('AUTH_REQUIRED');

    const prefixedGuest = getManualDashboard('guest-12345');
    expect(prefixedGuest.available).toBe(false);
    expect(prefixedGuest.reason).toBe('AUTH_REQUIRED');
  });

  it('returns a graceful default dashboard when user exists only in remote auth store', () => {
    const cloudOnlyUserId = `cloud-only-usr-${Date.now()}`;
    const result = getManualDashboard(cloudOnlyUserId);

    expect(result.available).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.summary.balance).toBe(0);
    expect(result.referrals.inviteCode).toBeNull();
    expect(result.rewards).toHaveLength(1);
  });

  it('rejects referral claims from cloud-only users without crashing', () => {
    const cloudOnlyUserId = `cloud-referral-${Date.now()}`;
    const result = claimManualReferral({ userId: cloudOnlyUserId, inviteCode: 'NV000001' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('AUTH_REQUIRED');
  });

  it('rejects vip redemption for guest users', () => {
    const result = redeemManualVipDay({ userId: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('AUTH_REQUIRED');
  });

  it('rejects prediction entry for guest users', () => {
    const result = submitManualPredictionEntry({
      userId: '',
      marketId: 'mkt_test',
      selectedOption: 'A',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('AUTH_REQUIRED');
  });
});

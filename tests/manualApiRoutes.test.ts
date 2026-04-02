import { describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/api/app.js';
import { requestLocalHttp } from './helpers/httpTestClient.js';

describe('manual HTTP routes — auth binding', () => {
  it('GET /api/manual/state without session still responds (guest scope)', async () => {
    const app = createApiApp();
    const res = await requestLocalHttp(app, { path: '/api/manual/state' });
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.reason).toBe('AUTH_REQUIRED');
  });

  it('rejects mutating manual endpoints when unauthenticated (ignores spoofed body userId)', async () => {
    const app = createApiApp();
    const paths = [
      '/api/manual/checkin',
      '/api/manual/engagement/signal',
      '/api/manual/bonuses/onboarding',
      '/api/manual/referrals/complete-stage2',
      '/api/manual/rewards/redeem',
      '/api/manual/predictions/entry',
      '/api/manual/referrals/claim',
    ] as const;

    for (const path of paths) {
      const res = await requestLocalHttp(app, {
        method: 'POST',
        path,
        body: { userId: 'usr_attacker_spoof', marketId: 'x', selectedOption: 'y' },
      });
      expect(res.status, path).toBe(401);
      expect(res.body?.error, path).toBe('AUTH_REQUIRED');
    }
  });
});

import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pgInsertUserWithState } from '../src/server/auth/postgresStore.js';
import { executeSync, qualifyBusinessTable } from '../src/server/db/postgresSyncBridge.js';
import {
  getManualDashboard,
  resolveAndSettleManualPredictionMarket,
  submitManualPredictionEntry,
} from '../src/server/manual/service.js';

function t(name: string) {
  return qualifyBusinessTable(name);
}

function createId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

describe('manual gamification integration (in-memory postgres)', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'postgres');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_MANUAL_PREDICTION_COLDSTART', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('settles a MAIN market: stake 1000 and pays win return on correct pick', async () => {
    const now = Date.now();
    const userId = `usr_mg_${randomBytes(4).toString('hex')}`;
    await pgInsertUserWithState({
      user: {
        user_id: userId,
        email: `${userId}@test.local`,
        password_hash: 'x',
        name: 'MG User',
        trade_mode: 'active',
        broker: 'Other',
        locale: 'en',
        created_at_ms: now,
        updated_at_ms: now,
        last_login_at_ms: now,
      },
      state: {
        assetClass: 'US_STOCK',
        market: 'US',
        uiMode: 'standard',
        riskProfileKey: 'balanced',
        watchlist: [],
        holdings: [],
        executions: [],
        disciplineLog: { checkins: [], boundary_kept: [], weekly_reviews: [] },
      },
      grantManualSignupBonus: false,
    });

    executeSync(
      `INSERT INTO ${t('manual_points_ledger')}(
        entry_id, user_id, event_type, points_delta, balance_after, metadata_json, created_at_ms
      ) VALUES($1, $2, 'TEST_SEED', 5000, 5000, '{}', $3)`,
      [createId('pts'), userId, now],
    );

    const marketId = createId('mkt');
    const closes = now + 3600000;
    executeSync(
      `INSERT INTO ${t('manual_prediction_markets')}(
        market_id, prompt, market, symbol, market_kind, options_json, status, correct_option,
        closes_at_ms, resolves_at_ms, settled_at_ms, metadata_json, created_at_ms, updated_at_ms
      ) VALUES($1, $2, NULL, NULL, 'MAIN', $3, 'OPEN', NULL, $4, NULL, NULL, '{}', $5, $5)`,
      [
        marketId,
        'QQQ green or red?',
        JSON.stringify([
          { key: 'UP', label: 'Green' },
          { key: 'DOWN', label: 'Red' },
        ]),
        closes,
        now,
      ],
    );

    const sub = submitManualPredictionEntry({
      userId,
      marketId,
      selectedOption: 'UP',
    });
    expect(sub.ok).toBe(true);
    const midStake = getManualDashboard(userId);
    expect(midStake.summary.balance).toBe(4000);

    const settled = resolveAndSettleManualPredictionMarket({
      marketId,
      correctOption: 'UP',
    });
    expect(settled.ok).toBe(true);
    expect(settled.settled).toBe(1);

    const finalDash = getManualDashboard(userId);
    expect(finalDash.summary.balance).toBe(5900);
  });
});

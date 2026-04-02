import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pgInsertUserWithState } from '../src/server/auth/postgresStore.js';
import {
  executeSync,
  qualifyBusinessTable,
  queryRowsSync,
} from '../src/server/db/postgresSyncBridge.js';
import {
  claimManualOnboardingBonus,
  claimManualReferral,
  completeManualReferralStage2,
  getManualDashboard,
  grantManualEngagementSignal,
  manualDailyCheckin,
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

  it('enforces MAIN daily cap sequentially (third OPEN MAIN in same UTC day fails)', async () => {
    vi.stubEnv('NOVA_MANUAL_PREDICTION_MAIN_MAX_PER_DAY', '2');
    const now = Date.now();
    const userId = `usr_mg_cap_${randomBytes(4).toString('hex')}`;
    await pgInsertUserWithState({
      user: {
        user_id: userId,
        email: `${userId}@test.local`,
        password_hash: 'x',
        name: 'MG Cap',
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
      ) VALUES($1, $2, 'TEST_SEED', 10000, 10000, '{}', $3)`,
      [createId('pts'), userId, now],
    );

    const closes = now + 3600000;
    const mk = (id: string) =>
      executeSync(
        `INSERT INTO ${t('manual_prediction_markets')}(
        market_id, prompt, market, symbol, market_kind, options_json, status, correct_option,
        closes_at_ms, resolves_at_ms, settled_at_ms, metadata_json, created_at_ms, updated_at_ms
      ) VALUES($1, $2, NULL, NULL, 'MAIN', $3, 'OPEN', NULL, $4, NULL, NULL, '{}', $5, $5)`,
        [
          id,
          'Cap test',
          JSON.stringify([
            { key: 'UP', label: 'Green' },
            { key: 'DOWN', label: 'Red' },
          ]),
          closes,
          now,
        ],
      );

    const m1 = createId('mkt');
    const m2 = createId('mkt');
    const m3 = createId('mkt');
    mk(m1);
    mk(m2);
    mk(m3);

    expect(submitManualPredictionEntry({ userId, marketId: m1, selectedOption: 'UP' }).ok).toBe(
      true,
    );
    expect(submitManualPredictionEntry({ userId, marketId: m2, selectedOption: 'UP' }).ok).toBe(
      true,
    );
    const third = submitManualPredictionEntry({ userId, marketId: m3, selectedOption: 'UP' });
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toBe('MAIN_PREDICTION_DAILY_CAP');
    expect(getManualDashboard(userId).summary.mainPredictionsToday).toBe(2);
  });

  it('grants engagement signal once per UTC day (fixed ENGAGEMENT_SIGNAL ledger type)', async () => {
    const now = Date.now();
    const userId = `usr_mg_eng_${randomBytes(4).toString('hex')}`;
    await pgInsertUserWithState({
      user: {
        user_id: userId,
        email: `${userId}@test.local`,
        password_hash: 'x',
        name: 'MG Eng',
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

    const first = grantManualEngagementSignal({ userId });
    expect(first.ok).toBe(true);
    const dup = grantManualEngagementSignal({ userId });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe('ENGAGEMENT_ALREADY_GRANTED');

    const rows = queryRowsSync<{ event_type: string }>(
      `SELECT event_type FROM ${t('manual_points_ledger')} WHERE user_id = $1 ORDER BY created_at_ms ASC`,
      [userId],
    );
    const types = rows.map((r) => r.event_type);
    expect(types.filter((x) => x === 'ENGAGEMENT_SIGNAL').length).toBe(1);
  });

  it('completes referral stage2 only once (UPDATE … RETURNING idempotency)', async () => {
    const now = Date.now();
    const inviterId = `usr_mg_inv_${randomBytes(4).toString('hex')}`;
    const refereeId = `usr_mg_ref_${randomBytes(4).toString('hex')}`;

    await pgInsertUserWithState({
      user: {
        user_id: inviterId,
        email: `${inviterId}@test.local`,
        password_hash: 'x',
        name: 'Inviter',
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
    await pgInsertUserWithState({
      user: {
        user_id: refereeId,
        email: `${refereeId}@test.local`,
        password_hash: 'x',
        name: 'Referee',
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

    const inviteCode = getManualDashboard(inviterId).referrals.inviteCode;
    expect(inviteCode).toBeTruthy();

    const claim = claimManualReferral({ userId: refereeId, inviteCode: inviteCode! });
    expect(claim.ok).toBe(true);

    const once = completeManualReferralStage2({ userId: refereeId });
    expect(once.ok).toBe(true);
    const twice = completeManualReferralStage2({ userId: refereeId });
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error).toBe('REFERRAL_ALREADY_COMPLETED');
  });

  it('daily checkin records streak and rejects duplicate same-day checkin', async () => {
    const now = Date.now();
    const userId = `usr_mg_chk_${randomBytes(4).toString('hex')}`;
    await pgInsertUserWithState({
      user: {
        user_id: userId,
        email: `${userId}@test.local`,
        password_hash: 'x',
        name: 'MG Checkin',
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

    const first = manualDailyCheckin({ userId });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.streak).toBe(1);
      expect(first.data.summary.checkinStreak).toBe(1);
    }

    const dup = manualDailyCheckin({ userId });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe('CHECKIN_ALREADY_DONE');

    const ledger = queryRowsSync<{ event_type: string }>(
      `SELECT event_type FROM ${t('manual_points_ledger')} WHERE user_id = $1 ORDER BY created_at_ms ASC`,
      [userId],
    );
    const types = ledger.map((r) => r.event_type);
    expect(types.filter((x) => x === 'CHECKIN_DAILY').length).toBe(1);
  });

  it('onboarding bonus is granted only once (transactional dedupe)', async () => {
    const now = Date.now();
    const userId = `usr_mg_onb_${randomBytes(4).toString('hex')}`;
    await pgInsertUserWithState({
      user: {
        user_id: userId,
        email: `${userId}@test.local`,
        password_hash: 'x',
        name: 'MG Onboarding',
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

    const first = claimManualOnboardingBonus({ userId });
    expect(first.ok).toBe(true);

    const second = claimManualOnboardingBonus({ userId });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('ONBOARDING_BONUS_ALREADY_CLAIMED');

    const ledger = queryRowsSync<{ event_type: string }>(
      `SELECT event_type FROM ${t('manual_points_ledger')} WHERE user_id = $1 AND event_type = 'ONBOARDING_BONUS'`,
      [userId],
    );
    expect(ledger.length).toBe(1);
  });

  it('dashboard exposes standardWinMultiplier in rules', async () => {
    const dash = getManualDashboard('guest-default');
    expect(dash.rules.standardWinMultiplier).toBe(2);
  });

  it('tryGrantManualSignupBonus is idempotent — sequential double call writes exactly one row', async () => {
    const { tryGrantManualSignupBonus } = await import('../src/server/manual/service.js');
    const now = Date.now();
    const userId = `usr_sg_idem_${randomBytes(4).toString('hex')}`;
    await pgInsertUserWithState({
      user: {
        user_id: userId,
        email: `${userId}@test.local`,
        password_hash: 'x',
        name: 'SG Idem',
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

    // Call twice sequentially — only one ledger row should exist.
    tryGrantManualSignupBonus(userId);
    tryGrantManualSignupBonus(userId);

    const rows = queryRowsSync<{ event_type: string }>(
      `SELECT event_type FROM ${t('manual_points_ledger')} WHERE user_id = $1 AND event_type = 'SIGNUP_BONUS'`,
      [userId],
    );
    expect(rows.length).toBe(1);
  });

  it('claimManualOnboardingBonus sequential double call — ledger count stays at 1', async () => {
    const now = Date.now();
    const userId = `usr_ob_idem2_${randomBytes(4).toString('hex')}`;
    await pgInsertUserWithState({
      user: {
        user_id: userId,
        email: `${userId}@test.local`,
        password_hash: 'x',
        name: 'OB Idem',
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

    claimManualOnboardingBonus({ userId });
    claimManualOnboardingBonus({ userId }); // second call must NOT add a second row

    const rows = queryRowsSync<{ event_type: string }>(
      `SELECT event_type FROM ${t('manual_points_ledger')} WHERE user_id = $1 AND event_type = 'ONBOARDING_BONUS'`,
      [userId],
    );
    expect(rows.length).toBe(1);
  });

  it('FREE_DAILY prediction: second submission same day returns FREE_DAILY_ALREADY_PLAYED', async () => {
    const now = Date.now();
    const userId = `usr_fd_idem_${randomBytes(4).toString('hex')}`;
    await pgInsertUserWithState({
      user: {
        user_id: userId,
        email: `${userId}@test.local`,
        password_hash: 'x',
        name: 'FD Idem',
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

    // Create two different FREE_DAILY markets.
    const m1 = createId('mkt');
    const m2 = createId('mkt');
    for (const mid of [m1, m2]) {
      executeSync(
        `INSERT INTO ${t('manual_prediction_markets')}
         (market_id, prompt, market_kind, options_json, status, closes_at_ms, created_at_ms, updated_at_ms)
         VALUES ($1, $2, 'FREE_DAILY', $3, 'OPEN', $4, $4, $4)`,
        [
          mid,
          'Up or down?',
          JSON.stringify([
            { key: 'UP', label: 'Up' },
            { key: 'DOWN', label: 'Down' },
          ]),
          now + 86400000,
        ],
      );
    }

    const first = submitManualPredictionEntry({
      userId,
      marketId: m1,
      selectedOption: 'UP',
      pointsStaked: 0,
    });
    expect(first.ok).toBe(true);

    // A different FREE_DAILY market on the same day must be blocked.
    const second = submitManualPredictionEntry({
      userId,
      marketId: m2,
      selectedOption: 'DOWN',
      pointsStaked: 0,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('FREE_DAILY_ALREADY_PLAYED');
  });
});

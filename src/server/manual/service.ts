import { randomBytes } from 'node:crypto';
import {
  beginTransactionSync,
  commitTransactionSync,
  executeSync,
  qualifyBusinessTable,
  queryRowSync,
  queryRowsSync,
  rollbackTransactionSync,
} from '../db/postgresSyncBridge.js';

const VIP_REDEEM_POINTS = 1000;
const REFERRAL_REWARD_POINTS = 200;
const DEFAULT_PREDICTION_STAKE = 100;

type ManualAvailabilityReason = 'AUTH_REQUIRED' | 'MANUAL_UNAVAILABLE';

export type ManualDashboard = {
  available: boolean;
  mode: 'REAL';
  reason: ManualAvailabilityReason | null;
  summary: {
    balance: number;
    expiringSoon: number;
    vipDays: number;
    vipDaysRedeemed: number;
  };
  referrals: {
    inviteCode: string | null;
    referredByCode: string | null;
    total: number;
    rewarded: number;
  };
  ledger: Array<{
    id: string;
    eventType: string;
    pointsDelta: number;
    balanceAfter: number;
    title: string;
    description: string;
    createdAt: string;
  }>;
  rewards: Array<{
    id: string;
    kind: 'vip_day';
    title: string;
    description: string;
    costPoints: number;
    enabled: boolean;
  }>;
  predictions: Array<{
    id: string;
    prompt: string;
    market: string | null;
    symbol: string | null;
    status: string;
    closesAt: string | null;
    resolvesAt: string | null;
    options: Array<{ key: string; label: string }>;
    entry: {
      selectedOption: string;
      status: string;
      pointsStaked: number;
      pointsAwarded: number;
    } | null;
  }>;
  rules: {
    vipRedeemPoints: number;
    referralRewardPoints: number;
    defaultPredictionStake: number;
  };
};

type LedgerMetadata = {
  title?: string;
  description?: string;
};

function nowMs() {
  return Date.now();
}

function createId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function manualTable(tableName: string) {
  return qualifyBusinessTable(tableName);
}

function authUserExists(userId: string) {
  const row = queryRowSync<{ user_id: string }>(
    'SELECT user_id FROM auth_users WHERE user_id = $1 LIMIT 1',
    [userId],
  );
  return Boolean(row?.user_id);
}

function runManualTransaction<T>(callback: () => T): T {
  beginTransactionSync();
  try {
    const result = callback();
    commitTransactionSync();
    return result;
  } catch (error) {
    try {
      rollbackTransactionSync();
    } catch {
      // ignore best-effort rollback failures
    }
    throw error;
  }
}

function isGuestUser(userId: string | null | undefined) {
  const normalized = String(userId || '').trim();
  return !normalized || normalized.startsWith('guest-');
}

function defaultDashboard(reason: ManualAvailabilityReason | null): ManualDashboard {
  return {
    available: false,
    mode: 'REAL',
    reason,
    summary: {
      balance: 0,
      expiringSoon: 0,
      vipDays: 0,
      vipDaysRedeemed: 0,
    },
    referrals: {
      inviteCode: null,
      referredByCode: null,
      total: 0,
      rewarded: 0,
    },
    ledger: [],
    rewards: [
      {
        id: 'vip-1d',
        kind: 'vip_day',
        title: 'Redeem 1 VIP day',
        description: '1000 points unlocks one more VIP day.',
        costPoints: VIP_REDEEM_POINTS,
        enabled: false,
      },
    ],
    predictions: [],
    rules: {
      vipRedeemPoints: VIP_REDEEM_POINTS,
      referralRewardPoints: REFERRAL_REWARD_POINTS,
      defaultPredictionStake: DEFAULT_PREDICTION_STAKE,
    },
  };
}

function buildInviteCode(userId: string) {
  const compact = userId.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `NV${compact.slice(-6).padStart(6, '0')}`;
}

function ensureManualUserState(userId: string) {
  const existing = queryRowSync<{
    user_id: string;
    invite_code: string;
    referred_by_code: string | null;
    vip_days_balance: number;
    vip_days_redeemed_total: number;
  }>(
    `SELECT user_id, invite_code, referred_by_code, vip_days_balance, vip_days_redeemed_total
     FROM ${manualTable('manual_user_state')}
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  if (existing) return existing;
  if (!authUserExists(userId)) return null;

  let inviteCode = buildInviteCode(userId);
  const ts = nowMs();
  while (
    queryRowSync<{ user_id: string }>(
      `SELECT user_id FROM ${manualTable('manual_user_state')} WHERE invite_code = $1 LIMIT 1`,
      [inviteCode],
    )
  ) {
    inviteCode = `${buildInviteCode(userId)}${randomBytes(2).toString('hex').toUpperCase()}`;
  }

  try {
    executeSync(
      `INSERT INTO ${manualTable('manual_user_state')}(
        user_id, invite_code, referred_by_code, vip_days_balance, vip_days_redeemed_total, updated_at_ms
      ) VALUES($1, $2, NULL, 0, 0, $3)`,
      [userId, inviteCode, ts],
    );
  } catch (error) {
    const message = String((error as Error)?.message || error || '');
    if (
      message.includes('FOREIGN KEY constraint failed') ||
      message.includes('duplicate key value') ||
      message.includes('violates unique constraint')
    ) {
      return null;
    }
    throw error;
  }

  return {
    user_id: userId,
    invite_code: inviteCode,
    referred_by_code: null,
    vip_days_balance: 0,
    vip_days_redeemed_total: 0,
  };
}

function currentPointsBalance(userId: string) {
  const row = queryRowSync<{ balance_after: number }>(
    `SELECT balance_after
     FROM ${manualTable('manual_points_ledger')}
     WHERE user_id = $1
     ORDER BY created_at_ms DESC
     LIMIT 1`,
    [userId],
  );
  return Number(row?.balance_after || 0);
}

function appendPointsLedger(args: {
  userId: string;
  eventType: string;
  pointsDelta: number;
  metadata?: LedgerMetadata;
  knownBalance?: number;
}) {
  if (!ensureManualUserState(args.userId)) return 0;
  const balanceBefore =
    args.knownBalance !== undefined ? args.knownBalance : currentPointsBalance(args.userId);
  const balanceAfter = balanceBefore + Math.trunc(args.pointsDelta);
  const payload = {
    entry_id: createId('pts'),
    user_id: args.userId,
    event_type: args.eventType,
    points_delta: Math.trunc(args.pointsDelta),
    balance_after: balanceAfter,
    metadata_json: JSON.stringify(args.metadata || {}),
    created_at_ms: nowMs(),
  };
  executeSync(
    `INSERT INTO ${manualTable('manual_points_ledger')}(
      entry_id, user_id, event_type, points_delta, balance_after, metadata_json, created_at_ms
    ) VALUES($1, $2, $3, $4, $5, $6, $7)`,
    [
      payload.entry_id,
      payload.user_id,
      payload.event_type,
      payload.points_delta,
      payload.balance_after,
      payload.metadata_json,
      payload.created_at_ms,
    ],
  );
  return balanceAfter;
}

function listPointsLedger(userId: string, limit = 8): ManualDashboard['ledger'] {
  const rows = queryRowsSync<{
    entry_id: string;
    event_type: string;
    points_delta: number;
    balance_after: number;
    metadata_json: string | null;
    created_at_ms: number;
  }>(
    `SELECT entry_id, event_type, points_delta, balance_after, metadata_json, created_at_ms
     FROM ${manualTable('manual_points_ledger')}
     WHERE user_id = $1
     ORDER BY created_at_ms DESC
     LIMIT $2`,
    [userId, limit],
  );

  return rows.map((row) => {
    const metadata = parseJson<LedgerMetadata>(row.metadata_json, {});
    return {
      id: row.entry_id,
      eventType: row.event_type,
      pointsDelta: Number(row.points_delta || 0),
      balanceAfter: Number(row.balance_after || 0),
      title: metadata.title || row.event_type,
      description: metadata.description || '',
      createdAt: new Date(row.created_at_ms).toISOString(),
    };
  });
}

function listPredictionMarkets(userId: string): ManualDashboard['predictions'] {
  const rows = queryRowsSync<{
    market_id: string;
    prompt: string;
    market: string | null;
    symbol: string | null;
    status: string;
    closes_at_ms: number;
    resolves_at_ms: number | null;
    options_json: string;
    selected_option: string | null;
    entry_status: string | null;
    points_staked: number | null;
    points_awarded: number | null;
  }>(
    `SELECT
       m.market_id,
       m.prompt,
       m.market,
       m.symbol,
       m.status,
       m.closes_at_ms,
       m.resolves_at_ms,
       m.options_json,
       e.selected_option,
       e.status AS entry_status,
       e.points_staked,
       e.points_awarded
     FROM ${manualTable('manual_prediction_markets')} m
     LEFT JOIN ${manualTable('manual_prediction_entries')} e
       ON e.market_id = m.market_id AND e.user_id = $1
     WHERE m.status IN ('OPEN', 'LOCKED', 'RESOLVED')
     ORDER BY m.closes_at_ms ASC, m.created_at_ms DESC
     LIMIT 12`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.market_id,
    prompt: row.prompt,
    market: row.market || null,
    symbol: row.symbol || null,
    status: row.status,
    closesAt: Number.isFinite(row.closes_at_ms) ? new Date(row.closes_at_ms).toISOString() : null,
    resolvesAt: Number.isFinite(row.resolves_at_ms || NaN)
      ? new Date(Number(row.resolves_at_ms)).toISOString()
      : null,
    options: parseJson<Array<{ key: string; label: string }>>(row.options_json, []),
    entry: row.selected_option
      ? {
          selectedOption: row.selected_option,
          status: row.entry_status || 'OPEN',
          pointsStaked: Number(row.points_staked || 0),
          pointsAwarded: Number(row.points_awarded || 0),
        }
      : null,
  }));
}

export function getManualDashboard(userId: string | null | undefined): ManualDashboard {
  if (isGuestUser(userId)) return defaultDashboard('AUTH_REQUIRED');
  const normalizedUserId = String(userId).trim();
  const userState = ensureManualUserState(normalizedUserId);
  if (!userState) return defaultDashboard(null);
  const balance = currentPointsBalance(normalizedUserId);
  const referralCounts = queryRowSync<{ total: number | null; rewarded: number | null }>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'REWARDED' THEN 1 ELSE 0 END) AS rewarded
     FROM ${manualTable('manual_referrals')}
     WHERE inviter_user_id = $1`,
    [normalizedUserId],
  );

  return {
    available: true,
    mode: 'REAL',
    reason: null,
    summary: {
      balance,
      expiringSoon: 0,
      vipDays: Number(userState.vip_days_balance || 0),
      vipDaysRedeemed: Number(userState.vip_days_redeemed_total || 0),
    },
    referrals: {
      inviteCode: userState.invite_code,
      referredByCode: userState.referred_by_code || null,
      total: Number(referralCounts?.total || 0),
      rewarded: Number(referralCounts?.rewarded || 0),
    },
    ledger: listPointsLedger(normalizedUserId, 8),
    rewards: [
      {
        id: 'vip-1d',
        kind: 'vip_day',
        title: 'Redeem 1 VIP day',
        description: '1000 points unlocks one more VIP day.',
        costPoints: VIP_REDEEM_POINTS,
        enabled: balance >= VIP_REDEEM_POINTS,
      },
    ],
    predictions: listPredictionMarkets(normalizedUserId),
    rules: {
      vipRedeemPoints: VIP_REDEEM_POINTS,
      referralRewardPoints: REFERRAL_REWARD_POINTS,
      defaultPredictionStake: DEFAULT_PREDICTION_STAKE,
    },
  };
}

export function redeemManualVipDay(args: { userId: string; days?: number }) {
  if (isGuestUser(args.userId)) {
    return { ok: false as const, error: 'AUTH_REQUIRED' };
  }
  const userId = String(args.userId).trim();
  const days = Math.max(1, Math.min(30, Math.trunc(Number(args.days || 1))));
  const cost = days * VIP_REDEEM_POINTS;
  try {
    runManualTransaction(() => {
      const balance = (() => {
        const row = queryRowSync<{ balance_after: number }>(
          `SELECT balance_after
           FROM ${manualTable('manual_points_ledger')}
           WHERE user_id = $1
           ORDER BY created_at_ms DESC
           LIMIT 1
           FOR UPDATE`,
          [userId],
        );
        return Number(row?.balance_after || 0);
      })();
      if (balance < cost) {
        throw Object.assign(new Error('INSUFFICIENT_POINTS'), {
          __manualEarlyReturn: true,
        });
      }
      const ts = nowMs();
      executeSync(
        `UPDATE ${manualTable('manual_user_state')}
         SET vip_days_balance = vip_days_balance + $1, vip_days_redeemed_total = vip_days_redeemed_total + $2, updated_at_ms = $3
         WHERE user_id = $4`,
        [days, days, ts, userId],
      );
      appendPointsLedger({
        userId,
        eventType: 'VIP_REDEEM',
        pointsDelta: -cost,
        knownBalance: balance,
        metadata: {
          title: `Redeemed ${days} VIP day${days > 1 ? 's' : ''}`,
          description: `${cost} points converted into premium access.`,
        },
      });
    });
    return { ok: true as const, data: getManualDashboard(userId) };
  } catch (error) {
    if ((error as { __manualEarlyReturn?: boolean }).__manualEarlyReturn) {
      return { ok: false as const, error: 'INSUFFICIENT_POINTS' };
    }
    throw error;
  }
}

export function claimManualReferral(args: { userId: string; inviteCode: string }) {
  if (isGuestUser(args.userId)) {
    return { ok: false as const, error: 'AUTH_REQUIRED' };
  }
  const userId = String(args.userId).trim();
  const inviteCode = String(args.inviteCode || '')
    .trim()
    .toUpperCase();
  if (!inviteCode) return { ok: false as const, error: 'INVITE_CODE_REQUIRED' };

  const currentUserState = ensureManualUserState(userId);
  if (!currentUserState) return { ok: false as const, error: 'AUTH_REQUIRED' };
  if (currentUserState.invite_code === inviteCode)
    return { ok: false as const, error: 'SELF_REFERRAL_NOT_ALLOWED' };
  if (currentUserState.referred_by_code)
    return { ok: false as const, error: 'REFERRAL_ALREADY_CLAIMED' };

  const inviter = queryRowSync<{ user_id: string }>(
    `SELECT user_id
     FROM ${manualTable('manual_user_state')}
     WHERE invite_code = $1
     LIMIT 1`,
    [inviteCode],
  );
  if (!inviter) return { ok: false as const, error: 'INVITE_CODE_INVALID' };

  const ts = nowMs();
  runManualTransaction(() => {
    executeSync(
      `UPDATE ${manualTable('manual_user_state')}
       SET referred_by_code = $1, updated_at_ms = $2
       WHERE user_id = $3`,
      [inviteCode, ts, userId],
    );
    executeSync(
      `INSERT INTO ${manualTable('manual_referrals')}(
        referral_id, inviter_user_id, invite_code, referred_user_id, status, reward_points, created_at_ms, updated_at_ms
      ) VALUES($1, $2, $3, $4, 'REWARDED', $5, $6, $7)`,
      [createId('ref'), inviter.user_id, inviteCode, userId, REFERRAL_REWARD_POINTS, ts, ts],
    );
    appendPointsLedger({
      userId: inviter.user_id,
      eventType: 'REFERRAL_REWARD',
      pointsDelta: REFERRAL_REWARD_POINTS,
      metadata: {
        title: 'Referral reward',
        description: `${inviteCode} converted into a confirmed referral.`,
      },
    });
    appendPointsLedger({
      userId,
      eventType: 'REFERRAL_WELCOME',
      pointsDelta: REFERRAL_REWARD_POINTS,
      metadata: {
        title: 'Referral welcome reward',
        description: `Joined through ${inviteCode}.`,
      },
    });
  });

  return { ok: true as const, data: getManualDashboard(userId) };
}

export function submitManualPredictionEntry(args: {
  userId: string;
  marketId: string;
  selectedOption: string;
  pointsStaked?: number;
}) {
  if (isGuestUser(args.userId)) {
    return { ok: false as const, error: 'AUTH_REQUIRED' };
  }
  const userId = String(args.userId).trim();
  const marketId = String(args.marketId || '').trim();
  const selectedOption = String(args.selectedOption || '').trim();
  const pointsStaked = Math.max(
    0,
    Math.trunc(Number(args.pointsStaked ?? DEFAULT_PREDICTION_STAKE)),
  );
  if (!marketId || !selectedOption) {
    return { ok: false as const, error: 'PREDICTION_INPUT_REQUIRED' };
  }

  const market = queryRowSync<{
    market_id: string;
    prompt: string;
    options_json: string;
    status: string;
    closes_at_ms: number;
  }>(
    `SELECT market_id, prompt, options_json, status, closes_at_ms
     FROM ${manualTable('manual_prediction_markets')}
     WHERE market_id = $1
     LIMIT 1`,
    [marketId],
  );
  if (!market) return { ok: false as const, error: 'PREDICTION_NOT_FOUND' };
  if (market.status !== 'OPEN' || market.closes_at_ms <= nowMs()) {
    return { ok: false as const, error: 'PREDICTION_CLOSED' };
  }
  const options = parseJson<Array<{ key: string; label: string }>>(market.options_json, []);
  if (!options.some((item) => item?.key === selectedOption)) {
    return { ok: false as const, error: 'PREDICTION_OPTION_INVALID' };
  }
  const existing = queryRowSync<{ entry_id: string }>(
    `SELECT entry_id
     FROM ${manualTable('manual_prediction_entries')}
     WHERE market_id = $1 AND user_id = $2
     LIMIT 1`,
    [marketId, userId],
  );
  if (existing) return { ok: false as const, error: 'PREDICTION_ALREADY_SUBMITTED' };
  const balance = currentPointsBalance(userId);
  if (pointsStaked > balance) return { ok: false as const, error: 'INSUFFICIENT_POINTS' };

  runManualTransaction(() => {
    const ts = nowMs();
    executeSync(
      `INSERT INTO ${manualTable('manual_prediction_entries')}(
        entry_id, market_id, user_id, selected_option, status, points_staked, points_awarded, created_at_ms, updated_at_ms
      ) VALUES($1, $2, $3, $4, 'OPEN', $5, 0, $6, $7)`,
      [createId('pred'), marketId, userId, selectedOption, pointsStaked, ts, ts],
    );
    if (pointsStaked > 0) {
      appendPointsLedger({
        userId,
        eventType: 'PREDICTION_STAKE',
        pointsDelta: -pointsStaked,
        metadata: {
          title: 'Prediction stake',
          description: market.prompt,
        },
      });
    }
  });

  return { ok: true as const, data: getManualDashboard(userId) };
}

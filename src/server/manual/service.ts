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

function readIntEnv(key: string, fallback: number) {
  const raw = String(process.env[key] || '').trim();
  if (!raw) return fallback;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) ? n : fallback;
}

function readBoolEnv(key: string) {
  const v = String(process.env[key] || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

const VIP_REDEEM_POINTS = readIntEnv('NOVA_MANUAL_VIP_REDEEM_POINTS', 1000);
const VIP_REDEEM_MAX_DAYS_PER_MONTH = readIntEnv('NOVA_MANUAL_VIP_MAX_DAYS_PER_MONTH', 7);
const SIGNUP_BONUS_POINTS = readIntEnv('NOVA_MANUAL_SIGNUP_BONUS_POINTS', 300);
const ONBOARDING_BONUS_POINTS = readIntEnv('NOVA_MANUAL_ONBOARDING_BONUS_POINTS', 700);
const REFERRAL_STAGE1_POINTS = readIntEnv('NOVA_MANUAL_REFERRAL_STAGE1_POINTS', 300);
const REFERRAL_STAGE2_POINTS = readIntEnv('NOVA_MANUAL_REFERRAL_STAGE2_POINTS', 700);
const REFERRAL_MAX_COMPLETED_PER_MONTH = readIntEnv(
  'NOVA_MANUAL_REFERRAL_MAX_COMPLETED_PER_MONTH',
  10,
);
const DAILY_CHECKIN_POINTS = readIntEnv('NOVA_MANUAL_CHECKIN_DAILY_POINTS', 20);
const CHECKIN_STREAK_7_BONUS = readIntEnv('NOVA_MANUAL_CHECKIN_STREAK_7_BONUS', 100);
const CHECKIN_STREAK_30_BONUS = readIntEnv('NOVA_MANUAL_CHECKIN_STREAK_30_BONUS', 500);
const DEFAULT_PREDICTION_STAKE_STANDARD = readIntEnv('NOVA_MANUAL_PREDICTION_STAKE_STANDARD', 100);
const MAIN_PREDICTION_STAKE = readIntEnv('NOVA_MANUAL_PREDICTION_MAIN_STAKE', 1000);
const MAIN_PREDICTION_MAX_PER_DAY = readIntEnv('NOVA_MANUAL_PREDICTION_MAIN_MAX_PER_DAY', 2);
const FREE_DAILY_REWARD_POINTS = readIntEnv('NOVA_MANUAL_PREDICTION_FREE_REWARD', 30);
const WIN_RETURN_POINTS = readIntEnv('NOVA_MANUAL_PREDICTION_WIN_RETURN', 1900);
const WIN_RETURN_COLD_POINTS = readIntEnv('NOVA_MANUAL_PREDICTION_WIN_RETURN_COLD', 2000);
const ENGAGEMENT_SIGNAL_POINTS = readIntEnv('NOVA_MANUAL_ENGAGEMENT_SIGNAL_POINTS', 20);

export type ManualMarketKind = 'STANDARD' | 'FREE_DAILY' | 'MAIN';

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
    checkinStreak: number;
    lastCheckinDay: string | null;
    mainPredictionsToday: number;
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
    marketKind: ManualMarketKind;
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
    vipMaxDaysPerMonth: number;
    referralStage1Points: number;
    referralStage2Points: number;
    referralRewardPointsTotal: number;
    defaultPredictionStake: number;
    mainPredictionStake: number;
    mainPredictionMaxPerDay: number;
    freeDailyRewardPoints: number;
    winReturnPoints: number;
    checkinDailyPoints: number;
    checkinStreak7Bonus: number;
    checkinStreak30Bonus: number;
    standardWinMultiplier: number;
    engagementSignalPoints: number;
    signupBonusPoints: number;
    onboardingBonusPoints: number;
    pointsExpiryDays: number;
  };
};

type LedgerMetadata = {
  title?: string;
  description?: string;
  /** UTC 日 key，用于审计（如 `ENGAGEMENT_SIGNAL` 对应哪一天） */
  day?: string;
};

type MarketMeta = {
  winReturnPoints?: number;
  freeRewardPoints?: number;
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

function utcDayKeyFromMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function utcMonthStartEndKeys(ms: number) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = Date.UTC(y, m, 1, 0, 0, 0, 0);
  const end = Date.UTC(y, m + 1, 1, 0, 0, 0, 0);
  return { startMs: start, endMs: end };
}

function previousUtcDayKey(dayKey: string) {
  const [yy, mm, dd] = dayKey.split('-').map((x) => Number(x));
  const t = Date.UTC(yy, mm - 1, dd, 12, 0, 0, 0) - 86400000;
  return utcDayKeyFromMs(t);
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

function normalizeMarketKind(raw: string | null | undefined): ManualMarketKind {
  const u = String(raw || 'STANDARD').toUpperCase();
  if (u === 'FREE_DAILY' || u === 'FREE') return 'FREE_DAILY';
  if (u === 'MAIN') return 'MAIN';
  return 'STANDARD';
}

function parseMarketMeta(metadataJson: string | null | undefined): MarketMeta {
  return parseJson<MarketMeta>(metadataJson, {});
}

function effectiveWinReturnPoints(marketMeta: MarketMeta): number {
  if (Number.isFinite(marketMeta.winReturnPoints)) {
    return Math.trunc(Number(marketMeta.winReturnPoints));
  }
  const coldUntil = Number(process.env.NOVA_MANUAL_PREDICTION_COLDSTART_UNTIL_MS || NaN);
  if (readBoolEnv('NOVA_MANUAL_PREDICTION_COLDSTART')) {
    return WIN_RETURN_COLD_POINTS;
  }
  if (Number.isFinite(coldUntil) && nowMs() < coldUntil) {
    return WIN_RETURN_COLD_POINTS;
  }
  return WIN_RETURN_POINTS;
}

function effectiveFreeReward(marketMeta: MarketMeta): number {
  if (Number.isFinite(marketMeta.freeRewardPoints)) {
    return Math.trunc(Number(marketMeta.freeRewardPoints));
  }
  return FREE_DAILY_REWARD_POINTS;
}

function defaultDashboard(reason: ManualAvailabilityReason | null): ManualDashboard {
  const rules = buildRulesSnapshot();
  return {
    available: false,
    mode: 'REAL',
    reason,
    summary: {
      balance: 0,
      expiringSoon: 0,
      vipDays: 0,
      vipDaysRedeemed: 0,
      checkinStreak: 0,
      lastCheckinDay: null,
      mainPredictionsToday: 0,
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
        description: `${VIP_REDEEM_POINTS} points unlocks one more VIP day.`,
        costPoints: VIP_REDEEM_POINTS,
        enabled: false,
      },
    ],
    predictions: [],
    rules,
  };
}

function buildRulesSnapshot(): ManualDashboard['rules'] {
  return {
    vipRedeemPoints: VIP_REDEEM_POINTS,
    vipMaxDaysPerMonth: VIP_REDEEM_MAX_DAYS_PER_MONTH,
    referralStage1Points: REFERRAL_STAGE1_POINTS,
    referralStage2Points: REFERRAL_STAGE2_POINTS,
    referralRewardPointsTotal: REFERRAL_STAGE1_POINTS + REFERRAL_STAGE2_POINTS,
    defaultPredictionStake: DEFAULT_PREDICTION_STAKE_STANDARD,
    mainPredictionStake: MAIN_PREDICTION_STAKE,
    mainPredictionMaxPerDay: MAIN_PREDICTION_MAX_PER_DAY,
    freeDailyRewardPoints: FREE_DAILY_REWARD_POINTS,
    winReturnPoints: effectiveWinReturnPoints({}),
    standardWinMultiplier: 2,
    checkinDailyPoints: DAILY_CHECKIN_POINTS,
    checkinStreak7Bonus: CHECKIN_STREAK_7_BONUS,
    checkinStreak30Bonus: CHECKIN_STREAK_30_BONUS,
    engagementSignalPoints: ENGAGEMENT_SIGNAL_POINTS,
    signupBonusPoints: SIGNUP_BONUS_POINTS,
    onboardingBonusPoints: ONBOARDING_BONUS_POINTS,
    pointsExpiryDays: readIntEnv('NOVA_MANUAL_POINTS_EXPIRY_DAYS', 90),
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
    last_checkin_day: string | null;
    checkin_streak: number;
  }>(
    `SELECT user_id, invite_code, referred_by_code, vip_days_balance, vip_days_redeemed_total,
            last_checkin_day, checkin_streak
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
        user_id, invite_code, referred_by_code, vip_days_balance, vip_days_redeemed_total,
        last_checkin_day, checkin_streak, updated_at_ms
      ) VALUES($1, $2, NULL, 0, 0, NULL, 0, $3)`,
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
    last_checkin_day: null,
    checkin_streak: 0,
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

function hasLedgerEvent(userId: string, eventType: string) {
  const row = queryRowSync<{ entry_id: string }>(
    `SELECT entry_id FROM ${manualTable('manual_points_ledger')}
     WHERE user_id = $1 AND event_type = $2
     LIMIT 1`,
    [userId, eventType],
  );
  return Boolean(row?.entry_id);
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

/** MAIN 场当日参与次数（与 `manual_main_prediction_daily` 一致，避免与限次逻辑漂移）。 */
function mainPredictionMainCountToday(userId: string) {
  const dayKey = utcDayKeyFromMs(nowMs());
  const row = queryRowSync<{ used_count: number | null }>(
    `SELECT used_count FROM ${manualTable('manual_main_prediction_daily')}
     WHERE user_id = $1 AND day_key = $2
     LIMIT 1`,
    [userId, dayKey],
  );
  return Math.max(0, Number(row?.used_count || 0));
}

/**
 * 在**当前事务内**占用一次 MAIN 当日名额；失败表示已达上限。
 * 使用 `SELECT … FOR UPDATE` + `INSERT`/`UPDATE`；与 `submitManualPredictionEntry` 的 `runManualTransaction` 组合，在生产 PostgreSQL 上提供行级互斥。
 * 说明：`postgresSyncBridge` 对 **ALTER … CONSTRAINT** 的 in-memory 归一化会丢弃语句，但**不会**削弱本函数的 `FOR UPDATE`；Vitest 下的 MAIN 日限次用例即覆盖此路径。
 */
function reserveMainPredictionDailySlotOrThrow(userId: string) {
  const dayKey = utcDayKeyFromMs(nowMs());
  const ts = nowMs();
  const tbl = manualTable('manual_main_prediction_daily');
  let row = queryRowSync<{ used_count: number | null }>(
    `SELECT used_count FROM ${tbl} WHERE user_id = $1 AND day_key = $2 FOR UPDATE`,
    [userId, dayKey],
  );
  if (!row) {
    try {
      executeSync(
        `INSERT INTO ${tbl} (user_id, day_key, used_count, updated_at_ms) VALUES ($1, $2, 1, $3)`,
        [userId, dayKey, ts],
      );
      return;
    } catch {
      row = queryRowSync<{ used_count: number | null }>(
        `SELECT used_count FROM ${tbl} WHERE user_id = $1 AND day_key = $2 FOR UPDATE`,
        [userId, dayKey],
      );
    }
  }
  if (!row) {
    throw new Error('MANUAL_MAIN_PREDICTION_DAILY_ROW_MISSING');
  }
  const used = Math.max(0, Number(row.used_count || 0));
  if (used >= MAIN_PREDICTION_MAX_PER_DAY) {
    throw Object.assign(new Error('MAIN_PREDICTION_DAILY_CAP'), {
      __manualEarlyReturn: true,
      code: 'MAIN_PREDICTION_DAILY_CAP',
    });
  }
  executeSync(
    `UPDATE ${tbl} SET used_count = used_count + 1, updated_at_ms = $3 WHERE user_id = $1 AND day_key = $2`,
    [userId, dayKey, ts],
  );
}

/**
 * 在**当前事务内**占用 FREE_DAILY 当日名额（每用户每天仅一次）。
 * 与 `reserveMainPredictionDailySlotOrThrow` 完全对称：先 SELECT FOR UPDATE，
 * 不存在则 INSERT；PK 冲突（并发重复写）等同于"已参与"。
 */
function reserveFreeDailySlotOrThrow(userId: string) {
  const dayKey = utcDayKeyFromMs(nowMs());
  const tbl = manualTable('manual_free_daily_entries');
  const existing = queryRowSync<{ user_id: string }>(
    `SELECT user_id FROM ${tbl} WHERE user_id = $1 AND day_key = $2 FOR UPDATE`,
    [userId, dayKey],
  );
  if (existing?.user_id) {
    throw Object.assign(new Error('FREE_DAILY_ALREADY_PLAYED'), {
      __manualEarlyReturn: true,
      code: 'FREE_DAILY_ALREADY_PLAYED',
    });
  }
  try {
    executeSync(`INSERT INTO ${tbl} (user_id, day_key) VALUES ($1, $2)`, [userId, dayKey]);
  } catch (error) {
    const msg = String((error as Error)?.message || error || '');
    // PK duplicate = another concurrent request already wrote the slot.
    if (
      msg.includes('UNIQUE constraint') ||
      msg.includes('unique constraint') ||
      msg.includes('duplicate key value') ||
      msg.includes('23505')
    ) {
      throw Object.assign(new Error('FREE_DAILY_ALREADY_PLAYED'), {
        __manualEarlyReturn: true,
        code: 'FREE_DAILY_ALREADY_PLAYED',
      });
    }
    throw error;
  }
}

function vipDaysRedeemedThisUtcMonth(userId: string) {
  const { startMs, endMs } = utcMonthStartEndKeys(nowMs());
  const row = queryRowSync<{ pts: string | null }>(
    `SELECT SUM(-points_delta)::text AS pts
     FROM ${manualTable('manual_points_ledger')}
     WHERE user_id = $1 AND event_type = 'VIP_REDEEM'
       AND created_at_ms >= $2 AND created_at_ms < $3`,
    [userId, startMs, endMs],
  );
  const redeemedPoints = Number(row?.pts || 0);
  if (!Number.isFinite(redeemedPoints) || redeemedPoints <= 0) return 0;
  return Math.ceil(redeemedPoints / VIP_REDEEM_POINTS);
}

function countInviterReferralCompletionsThisUtcMonth(inviterUserId: string) {
  const { startMs, endMs } = utcMonthStartEndKeys(nowMs());
  const row = queryRowSync<{ c: string | null }>(
    `SELECT COUNT(*)::text AS c
     FROM ${manualTable('manual_referrals')}
     WHERE inviter_user_id = $1
       AND status IN ('COMPLETED', 'REWARDED')
       AND updated_at_ms >= $2 AND updated_at_ms < $3`,
    [inviterUserId, startMs, endMs],
  );
  return Number(row?.c || 0);
}

function listPredictionMarkets(userId: string): ManualDashboard['predictions'] {
  const rows = queryRowsSync<{
    market_id: string;
    prompt: string;
    market: string | null;
    symbol: string | null;
    market_kind: string | null;
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
       m.market_kind,
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
    marketKind: normalizeMarketKind(row.market_kind),
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
       SUM(CASE WHEN status IN ('COMPLETED', 'REWARDED') THEN 1 ELSE 0 END) AS rewarded
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
      checkinStreak: Number(userState.checkin_streak || 0),
      lastCheckinDay: userState.last_checkin_day || null,
      mainPredictionsToday: mainPredictionMainCountToday(normalizedUserId),
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
        description: `${VIP_REDEEM_POINTS} points unlocks one more VIP day.`,
        costPoints: VIP_REDEEM_POINTS,
        enabled: balance >= VIP_REDEEM_POINTS,
      },
    ],
    predictions: listPredictionMarkets(normalizedUserId),
    rules: buildRulesSnapshot(),
  };
}

/**
 * Best-effort signup points; safe to call from auth registration paths.
 *
 * Atomicity guarantee: runs inside `runManualTransaction` so the CHECK +
 * INSERT pair is serialized.  The conditional unique index on
 * `manual_points_ledger(user_id, event_type)` for 'SIGNUP_BONUS' is the
 * final DB-level barrier: if two concurrent transactions both pass the
 * hasLedgerEvent SELECT, only one INSERT will succeed; the loser receives
 * a UNIQUE constraint violation which is swallowed and treated as
 * "already granted".
 */
export function tryGrantManualSignupBonus(userId: string) {
  if (isGuestUser(userId)) return;
  if (readBoolEnv('NOVA_MANUAL_DISABLE_SIGNUP_BONUS')) return;
  const uid = String(userId).trim();
  try {
    if (!authUserExists(uid)) return;
    runManualTransaction(() => {
      if (hasLedgerEvent(uid, 'SIGNUP_BONUS')) return; // fast path inside tx
      appendPointsLedger({
        userId: uid,
        eventType: 'SIGNUP_BONUS',
        pointsDelta: SIGNUP_BONUS_POINTS,
        metadata: {
          title: 'Welcome bonus',
          description: 'Points for creating your account.',
        },
      });
    });
  } catch (error) {
    const msg = String((error as Error)?.message || error || '');
    // A UNIQUE violation (PG 23505 / SQLite constraint) means another request
    // already wrote the bonus — treat as success and swallow the error.
    if (
      msg.includes('UNIQUE constraint') ||
      msg.includes('unique constraint') ||
      msg.includes('duplicate key value') ||
      msg.includes('23505')
    ) {
      return;
    }
    // All other errors (auth/business DB split, schema not migrated, etc.) are
    // also swallowed — this is intentionally best-effort.
  }
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
      const already = vipDaysRedeemedThisUtcMonth(userId);
      if (already + days > VIP_REDEEM_MAX_DAYS_PER_MONTH) {
        throw Object.assign(new Error('VIP_MONTHLY_CAP'), {
          __manualEarlyReturn: true,
          code: 'VIP_MONTHLY_CAP',
        });
      }
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
      const code = (error as { code?: string }).code;
      if (code === 'VIP_MONTHLY_CAP') {
        return { ok: false as const, error: 'VIP_MONTHLY_CAP' as const };
      }
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
  try {
    runManualTransaction(() => {
      const locked = queryRowSync<{ referred_by_code: string | null }>(
        `SELECT referred_by_code FROM ${manualTable('manual_user_state')}
         WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      if (locked?.referred_by_code) {
        throw Object.assign(new Error('REFERRAL_ALREADY_CLAIMED'), {
          __manualEarlyReturn: true,
          code: 'REFERRAL_ALREADY_CLAIMED',
        });
      }
      executeSync(
        `UPDATE ${manualTable('manual_user_state')}
         SET referred_by_code = $1, updated_at_ms = $2
         WHERE user_id = $3`,
        [inviteCode, ts, userId],
      );
      executeSync(
        `INSERT INTO ${manualTable('manual_referrals')}(
          referral_id, inviter_user_id, invite_code, referred_user_id, status, reward_points, created_at_ms, updated_at_ms
        ) VALUES($1, $2, $3, $4, 'PARTIAL', $5, $6, $7)`,
        [createId('ref'), inviter.user_id, inviteCode, userId, REFERRAL_STAGE1_POINTS * 2, ts, ts],
      );
      appendPointsLedger({
        userId: inviter.user_id,
        eventType: 'REFERRAL_STAGE1',
        pointsDelta: REFERRAL_STAGE1_POINTS,
        metadata: {
          title: 'Referral reward (stage 1)',
          description: `${inviteCode} signed up — first milestone.`,
        },
      });
      appendPointsLedger({
        userId,
        eventType: 'REFERRAL_WELCOME_STAGE1',
        pointsDelta: REFERRAL_STAGE1_POINTS,
        metadata: {
          title: 'Referral welcome (stage 1)',
          description: `Joined through ${inviteCode}.`,
        },
      });
    });
  } catch (error) {
    if ((error as { __manualEarlyReturn?: boolean }).__manualEarlyReturn) {
      return { ok: false as const, error: 'REFERRAL_ALREADY_CLAIMED' as const };
    }
    throw error;
  }

  return { ok: true as const, data: getManualDashboard(userId) };
}

/**
 * Call when referred user completes onboarding / key milestone (stage 2).
 * Grants +REFERRAL_STAGE2_POINTS to inviter and referee if monthly cap allows.
 */
export function completeManualReferralStage2(args: { userId: string }) {
  if (isGuestUser(args.userId)) {
    return { ok: false as const, error: 'AUTH_REQUIRED' };
  }
  const refereeId = String(args.userId).trim();
  const referral = queryRowSync<{
    referral_id: string;
    inviter_user_id: string;
    invite_code: string;
    status: string;
  }>(
    `SELECT referral_id, inviter_user_id, invite_code, status
     FROM ${manualTable('manual_referrals')}
     WHERE referred_user_id = $1
     LIMIT 1`,
    [refereeId],
  );
  if (!referral) return { ok: false as const, error: 'REFERRAL_NOT_FOUND' };
  if (referral.status === 'COMPLETED' || referral.status === 'REWARDED') {
    return { ok: false as const, error: 'REFERRAL_ALREADY_COMPLETED' };
  }
  if (referral.status !== 'PARTIAL') {
    return { ok: false as const, error: 'REFERRAL_NOT_ELIGIBLE' };
  }

  const inviterId = referral.inviter_user_id;
  const ts = nowMs();
  try {
    runManualTransaction(() => {
      const inviterLock = queryRowSync<{ user_id: string }>(
        `SELECT user_id FROM ${manualTable('manual_user_state')}
         WHERE user_id = $1
         LIMIT 1
         FOR UPDATE`,
        [inviterId],
      );
      if (!inviterLock?.user_id) {
        throw Object.assign(new Error('REFERRAL_NOT_ELIGIBLE'), {
          __manualEarlyReturn: true,
          code: 'REFERRAL_NOT_ELIGIBLE',
        });
      }
      const completedThisMonth = countInviterReferralCompletionsThisUtcMonth(inviterId);
      if (completedThisMonth >= REFERRAL_MAX_COMPLETED_PER_MONTH) {
        throw Object.assign(new Error('REFERRAL_MONTHLY_CAP'), {
          __manualEarlyReturn: true,
          code: 'REFERRAL_MONTHLY_CAP',
        });
      }
      const updated = queryRowSync<{ referral_id: string }>(
        `UPDATE ${manualTable('manual_referrals')}
         SET status = 'COMPLETED', reward_points = $1, updated_at_ms = $2
         WHERE referral_id = $3 AND status = 'PARTIAL'
         RETURNING referral_id`,
        [REFERRAL_STAGE1_POINTS * 2 + REFERRAL_STAGE2_POINTS * 2, ts, referral.referral_id],
      );
      if (!updated?.referral_id) {
        throw Object.assign(new Error('REFERRAL_ALREADY_COMPLETED'), {
          __manualEarlyReturn: true,
          code: 'REFERRAL_ALREADY_COMPLETED',
        });
      }
      appendPointsLedger({
        userId: inviterId,
        eventType: 'REFERRAL_STAGE2',
        pointsDelta: REFERRAL_STAGE2_POINTS,
        metadata: {
          title: 'Referral reward (stage 2)',
          description: `${referral.invite_code} completed onboarding.`,
        },
      });
      appendPointsLedger({
        userId: refereeId,
        eventType: 'REFERRAL_WELCOME_STAGE2',
        pointsDelta: REFERRAL_STAGE2_POINTS,
        metadata: {
          title: 'Referral welcome (stage 2)',
          description: 'You completed onboarding as a referred user.',
        },
      });
    });
  } catch (error) {
    if ((error as { __manualEarlyReturn?: boolean }).__manualEarlyReturn) {
      const code = (error as { code?: string }).code;
      if (code === 'REFERRAL_MONTHLY_CAP') {
        return { ok: false as const, error: 'REFERRAL_MONTHLY_CAP' as const };
      }
      if (code === 'REFERRAL_NOT_ELIGIBLE') {
        return { ok: false as const, error: 'REFERRAL_NOT_ELIGIBLE' as const };
      }
      return { ok: false as const, error: 'REFERRAL_ALREADY_COMPLETED' as const };
    }
    throw error;
  }

  return { ok: true as const, data: getManualDashboard(refereeId) };
}

export function claimManualOnboardingBonus(args: { userId: string }) {
  if (isGuestUser(args.userId)) {
    return { ok: false as const, error: 'AUTH_REQUIRED' };
  }
  const userId = String(args.userId).trim();
  if (!ensureManualUserState(userId)) return { ok: false as const, error: 'AUTH_REQUIRED' };
  try {
    runManualTransaction(() => {
      // hasLedgerEvent is a fast check inside the transaction; the
      // conditional unique index on 'ONBOARDING_BONUS' is the final atomic
      // guard — a concurrent INSERT will raise UNIQUE and be caught below.
      if (hasLedgerEvent(userId, 'ONBOARDING_BONUS')) {
        throw Object.assign(new Error('ONBOARDING_BONUS_ALREADY_CLAIMED'), {
          __manualEarlyReturn: true,
          code: 'ONBOARDING_BONUS_ALREADY_CLAIMED',
        });
      }
      appendPointsLedger({
        userId,
        eventType: 'ONBOARDING_BONUS',
        pointsDelta: ONBOARDING_BONUS_POINTS,
        metadata: {
          title: 'Onboarding complete',
          description: 'Points for finishing setup.',
        },
      });
    });
  } catch (error) {
    if ((error as { __manualEarlyReturn?: boolean }).__manualEarlyReturn) {
      return { ok: false as const, error: 'ONBOARDING_BONUS_ALREADY_CLAIMED' as const };
    }
    const msg = String((error as Error)?.message || error || '');
    // UNIQUE constraint from the singleton index = concurrent request already
    // wrote the bonus; treat as idempotent ALREADY_CLAIMED.
    if (
      msg.includes('UNIQUE constraint') ||
      msg.includes('unique constraint') ||
      msg.includes('duplicate key value') ||
      msg.includes('23505')
    ) {
      return { ok: false as const, error: 'ONBOARDING_BONUS_ALREADY_CLAIMED' as const };
    }
    throw error;
  }
  const stage2 = completeManualReferralStage2({ userId });
  return {
    ok: true as const,
    data: getManualDashboard(userId),
    referralStage2: stage2.ok
      ? ({ status: 'granted' as const } as const)
      : ({ status: 'skipped' as const, reason: stage2.error } as const),
  };
}

export function manualDailyCheckin(args: { userId: string }) {
  if (isGuestUser(args.userId)) {
    return { ok: false as const, error: 'AUTH_REQUIRED' };
  }
  const userId = String(args.userId).trim();
  const st = ensureManualUserState(userId);
  if (!st) return { ok: false as const, error: 'AUTH_REQUIRED' };

  const today = utcDayKeyFromMs(nowMs());

  let nextStreak = 1;
  if (st.last_checkin_day === previousUtcDayKey(today)) {
    nextStreak = Number(st.checkin_streak || 0) + 1;
  } else {
    nextStreak = 1;
  }

  const ts = nowMs();
  try {
    runManualTransaction(() => {
      const existing = queryRowSync<{ day_key: string }>(
        `SELECT day_key FROM ${manualTable('manual_checkins')} WHERE user_id = $1 AND day_key = $2 LIMIT 1`,
        [userId, today],
      );
      if (existing) {
        throw Object.assign(new Error('CHECKIN_ALREADY_DONE'), {
          __manualEarlyReturn: true,
          code: 'CHECKIN_ALREADY_DONE',
        });
      }
      executeSync(
        `INSERT INTO ${manualTable('manual_checkins')}(user_id, day_key, created_at_ms) VALUES($1, $2, $3)`,
        [userId, today, ts],
      );
      executeSync(
        `UPDATE ${manualTable('manual_user_state')}
         SET last_checkin_day = $1, checkin_streak = $2, updated_at_ms = $3
         WHERE user_id = $4`,
        [today, nextStreak, ts, userId],
      );
      let bal = appendPointsLedger({
        userId,
        eventType: 'CHECKIN_DAILY',
        pointsDelta: DAILY_CHECKIN_POINTS,
        metadata: { title: 'Daily check-in', description: `Streak ${nextStreak}` },
      });
      if (nextStreak > 0 && nextStreak % 7 === 0) {
        bal = appendPointsLedger({
          userId,
          eventType: 'CHECKIN_STREAK_7',
          pointsDelta: CHECKIN_STREAK_7_BONUS,
          knownBalance: bal,
          metadata: { title: '7-day streak bonus', description: 'Thanks for coming back.' },
        });
      }
      if (nextStreak > 0 && nextStreak % 30 === 0) {
        appendPointsLedger({
          userId,
          eventType: 'CHECKIN_STREAK_30',
          pointsDelta: CHECKIN_STREAK_30_BONUS,
          knownBalance: bal,
          metadata: { title: '30-day streak bonus', description: 'Outstanding consistency.' },
        });
      }
    });
  } catch (error) {
    if ((error as { __manualEarlyReturn?: boolean }).__manualEarlyReturn) {
      return { ok: false as const, error: 'CHECKIN_ALREADY_DONE' as const };
    }
    throw error;
  }

  return { ok: true as const, data: getManualDashboard(userId), streak: nextStreak };
}

/** Idempotent per UTC day — e.g. after viewing the daily signal. */
export function grantManualEngagementSignal(args: { userId: string }) {
  if (isGuestUser(args.userId)) {
    return { ok: false as const, error: 'AUTH_REQUIRED' };
  }
  const userId = String(args.userId).trim();
  if (!ensureManualUserState(userId)) return { ok: false as const, error: 'AUTH_REQUIRED' };
  const dayKey = utcDayKeyFromMs(nowMs());
  const ts = nowMs();
  const tbl = manualTable('manual_engagement_daily');
  try {
    runManualTransaction(() => {
      const dup = queryRowSync<{ user_id: string }>(
        `SELECT user_id FROM ${tbl} WHERE user_id = $1 AND day_key = $2 FOR UPDATE`,
        [userId, dayKey],
      );
      if (dup?.user_id) {
        throw Object.assign(new Error('ENGAGEMENT_ALREADY_GRANTED'), {
          __manualEarlyReturn: true,
          code: 'ENGAGEMENT_ALREADY_GRANTED',
        });
      }
      try {
        executeSync(`INSERT INTO ${tbl} (user_id, day_key, created_at_ms) VALUES ($1, $2, $3)`, [
          userId,
          dayKey,
          ts,
        ]);
      } catch {
        throw Object.assign(new Error('ENGAGEMENT_ALREADY_GRANTED'), {
          __manualEarlyReturn: true,
          code: 'ENGAGEMENT_ALREADY_GRANTED',
        });
      }
      appendPointsLedger({
        userId,
        eventType: 'ENGAGEMENT_SIGNAL',
        pointsDelta: ENGAGEMENT_SIGNAL_POINTS,
        metadata: { title: 'Daily signal', description: 'Engagement reward.', day: dayKey },
      });
    });
  } catch (error) {
    if ((error as { __manualEarlyReturn?: boolean }).__manualEarlyReturn) {
      return { ok: false as const, error: 'ENGAGEMENT_ALREADY_GRANTED' as const };
    }
    throw error;
  }
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
  if (!marketId || !selectedOption) {
    return { ok: false as const, error: 'PREDICTION_INPUT_REQUIRED' };
  }

  const market = queryRowSync<{
    market_id: string;
    prompt: string;
    options_json: string;
    metadata_json: string;
    market_kind: string | null;
    status: string;
    closes_at_ms: number;
  }>(
    `SELECT market_id, prompt, options_json, metadata_json, market_kind, status, closes_at_ms
     FROM ${manualTable('manual_prediction_markets')}
     WHERE market_id = $1
     LIMIT 1`,
    [marketId],
  );
  if (!market) return { ok: false as const, error: 'PREDICTION_NOT_FOUND' };
  if (market.status !== 'OPEN' || market.closes_at_ms <= nowMs()) {
    return { ok: false as const, error: 'PREDICTION_CLOSED' };
  }
  const kind = normalizeMarketKind(market.market_kind);
  const meta = parseMarketMeta(market.metadata_json);

  let pointsStaked = Math.max(0, Math.trunc(Number(args.pointsStaked ?? 0)));
  if (kind === 'FREE_DAILY') {
    pointsStaked = 0;
  } else if (kind === 'MAIN') {
    pointsStaked = MAIN_PREDICTION_STAKE;
  } else {
    if (!pointsStaked) pointsStaked = DEFAULT_PREDICTION_STAKE_STANDARD;
  }

  const options = parseJson<Array<{ key: string; label: string }>>(market.options_json, []);
  if (!options.some((item) => item?.key === selectedOption)) {
    return { ok: false as const, error: 'PREDICTION_OPTION_INVALID' };
  }
  try {
    runManualTransaction(() => {
      const existingInTx = queryRowSync<{ entry_id: string }>(
        `SELECT entry_id
         FROM ${manualTable('manual_prediction_entries')}
         WHERE market_id = $1 AND user_id = $2
         LIMIT 1`,
        [marketId, userId],
      );
      if (existingInTx) {
        throw Object.assign(new Error('PREDICTION_ALREADY_SUBMITTED'), {
          __manualEarlyReturn: true,
          code: 'PREDICTION_ALREADY_SUBMITTED',
        });
      }

      if (kind === 'FREE_DAILY') {
        // Atomic one-per-day guard: uses the manual_free_daily_entries slot
        // table with SELECT FOR UPDATE + INSERT, identical to the MAIN daily
        // slot pattern.  Replaces the previous non-atomic COUNT(*) check.
        reserveFreeDailySlotOrThrow(userId);
      }

      if (kind === 'MAIN') {
        reserveMainPredictionDailySlotOrThrow(userId);
      }

      const balanceInTx = (() => {
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
      if (pointsStaked > balanceInTx) {
        throw Object.assign(new Error('INSUFFICIENT_POINTS'), {
          __manualEarlyReturn: true,
          code: 'INSUFFICIENT_POINTS',
        });
      }

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
  } catch (error) {
    if ((error as { __manualEarlyReturn?: boolean }).__manualEarlyReturn) {
      const code = (error as { code?: string }).code;
      if (code === 'MAIN_PREDICTION_DAILY_CAP') {
        return { ok: false as const, error: 'MAIN_PREDICTION_DAILY_CAP' as const };
      }
      if (code === 'PREDICTION_ALREADY_SUBMITTED') {
        return { ok: false as const, error: 'PREDICTION_ALREADY_SUBMITTED' as const };
      }
      if (code === 'FREE_DAILY_ALREADY_PLAYED') {
        return { ok: false as const, error: 'FREE_DAILY_ALREADY_PLAYED' as const };
      }
      return { ok: false as const, error: 'INSUFFICIENT_POINTS' as const };
    }
    throw error;
  }

  return { ok: true as const, data: getManualDashboard(userId) };
}

export function resolveAndSettleManualPredictionMarket(args: {
  marketId: string;
  correctOption: string;
}) {
  const marketId = String(args.marketId || '').trim();
  const correctOption = String(args.correctOption || '').trim();
  if (!marketId || !correctOption) {
    return { ok: false as const, error: 'SETTLE_INPUT_REQUIRED' };
  }

  const market = queryRowSync<{
    market_id: string;
    prompt: string;
    options_json: string;
    metadata_json: string;
    market_kind: string | null;
    status: string;
  }>(
    `SELECT market_id, prompt, options_json, metadata_json, market_kind, status
     FROM ${manualTable('manual_prediction_markets')}
     WHERE market_id = $1
     LIMIT 1`,
    [marketId],
  );
  if (!market) return { ok: false as const, error: 'PREDICTION_NOT_FOUND' };
  if (market.status === 'RESOLVED') {
    return { ok: false as const, error: 'PREDICTION_ALREADY_RESOLVED' };
  }
  if (market.status !== 'OPEN' && market.status !== 'LOCKED') {
    return { ok: false as const, error: 'PREDICTION_NOT_SETTLEABLE' };
  }
  const options = parseJson<Array<{ key: string; label: string }>>(market.options_json, []);
  if (!options.some((item) => item?.key === correctOption)) {
    return { ok: false as const, error: 'PREDICTION_OPTION_INVALID' };
  }

  const kind = normalizeMarketKind(market.market_kind);
  const meta = parseMarketMeta(market.metadata_json);
  const winReturn = effectiveWinReturnPoints(meta);
  const freeReward = effectiveFreeReward(meta);

  let settled = 0;
  runManualTransaction(() => {
    const ts = nowMs();
    executeSync(
      `UPDATE ${manualTable('manual_prediction_markets')}
       SET status = 'RESOLVED', correct_option = $1, resolves_at_ms = $2, settled_at_ms = $2, updated_at_ms = $2
       WHERE market_id = $3`,
      [correctOption, ts, marketId],
    );

    const entries = queryRowsSync<{
      entry_id: string;
      user_id: string;
      selected_option: string;
      status: string;
      points_staked: number;
    }>(
      `SELECT entry_id, user_id, selected_option, status, points_staked
       FROM ${manualTable('manual_prediction_entries')}
       WHERE market_id = $1 AND status = 'OPEN'`,
      [marketId],
    );

    for (const en of entries) {
      const won = en.selected_option === correctOption;
      if (kind === 'FREE_DAILY') {
        if (won) {
          executeSync(
            `UPDATE ${manualTable('manual_prediction_entries')}
             SET status = 'WON', points_awarded = $1, updated_at_ms = $2
             WHERE entry_id = $3`,
            [freeReward, ts, en.entry_id],
          );
          appendPointsLedger({
            userId: en.user_id,
            eventType: 'PREDICTION_FREE_WIN',
            pointsDelta: freeReward,
            metadata: { title: 'Free pick — correct', description: market.prompt },
          });
        } else {
          executeSync(
            `UPDATE ${manualTable('manual_prediction_entries')}
             SET status = 'LOST', points_awarded = 0, updated_at_ms = $1
             WHERE entry_id = $2`,
            [ts, en.entry_id],
          );
        }
      } else if (kind === 'MAIN') {
        if (won) {
          executeSync(
            `UPDATE ${manualTable('manual_prediction_entries')}
             SET status = 'WON', points_awarded = $1, updated_at_ms = $2
             WHERE entry_id = $3`,
            [winReturn, ts, en.entry_id],
          );
          appendPointsLedger({
            userId: en.user_id,
            eventType: 'PREDICTION_MAIN_WIN',
            pointsDelta: winReturn,
            metadata: { title: 'Main prediction — win', description: market.prompt },
          });
        } else {
          executeSync(
            `UPDATE ${manualTable('manual_prediction_entries')}
             SET status = 'LOST', points_awarded = 0, updated_at_ms = $1
             WHERE entry_id = $2`,
            [ts, en.entry_id],
          );
        }
      } else {
        const stake = Number(en.points_staked || 0);
        if (won && stake > 0) {
          const payout = stake * 2;
          executeSync(
            `UPDATE ${manualTable('manual_prediction_entries')}
             SET status = 'WON', points_awarded = $1, updated_at_ms = $2
             WHERE entry_id = $3`,
            [payout, ts, en.entry_id],
          );
          appendPointsLedger({
            userId: en.user_id,
            eventType: 'PREDICTION_STANDARD_WIN',
            pointsDelta: payout,
            metadata: { title: 'Prediction win', description: market.prompt },
          });
        } else if (won) {
          executeSync(
            `UPDATE ${manualTable('manual_prediction_entries')}
             SET status = 'WON', points_awarded = 0, updated_at_ms = $1
             WHERE entry_id = $2`,
            [ts, en.entry_id],
          );
        } else {
          executeSync(
            `UPDATE ${manualTable('manual_prediction_entries')}
             SET status = 'LOST', points_awarded = 0, updated_at_ms = $1
             WHERE entry_id = $2`,
            [ts, en.entry_id],
          );
        }
      }
      settled += 1;
    }
  });

  return { ok: true as const, settled };
}

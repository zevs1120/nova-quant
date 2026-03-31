import {
  getMembershipLimits,
  getRemainingAskNova,
  getTodayCardLimit,
  isBrokerHandoffEnabled,
  isPortfolioAiEnabled,
  isPortfolioAwareRequest,
  normalizeMembershipPlan,
} from '../../utils/membership.js';
import { getConfig } from '../config.js';
import { getDb } from '../db/database.js';
import { quotePgIdentifier } from '../db/postgresMigration.js';
import { ensureSchema } from '../db/schema.js';
import {
  beginTransactionSync,
  commitTransactionSync,
  executeSync,
  qualifyBusinessTable,
  queryRowSync,
  rollbackTransactionSync,
} from '../db/postgresSyncBridge.js';
import { getBillingState, type BillingPlan } from '../billing/service.js';

type MembershipUsageRow = {
  user_id: string;
  usage_day: string;
  ask_nova_used: number;
  created_at_ms: number;
  updated_at_ms: number;
};

type MembershipLimits = ReturnType<typeof getMembershipLimits>;

export type MembershipState = {
  available: boolean;
  authenticated: boolean;
  currentPlan: BillingPlan;
  limits: MembershipLimits;
  usage: {
    day: string;
    askNovaUsed: number;
  };
  remainingAskNova: number | null;
};

export type MembershipAccessErrorCode =
  | 'ASK_NOVA_LIMIT_REACHED'
  | 'PORTFOLIO_AI_REQUIRES_PRO'
  | 'BROKER_HANDOFF_REQUIRES_LITE';

type MembershipAccessFailure = {
  ok: false;
  error: MembershipAccessErrorCode;
  reason: 'ai_limit' | 'portfolio_ai' | 'broker_handoff';
  targetPlan: 'lite' | 'pro';
  state: MembershipState;
};

type MembershipAccessSuccess = {
  ok: true;
  state: MembershipState;
};

type MembershipUsageMutationResult = {
  allowed: boolean;
  askNovaUsed: number;
};

const guestUsageBucket = new Map<string, number>();

let pgMembershipSchemaReady = false;

function nowMs() {
  return Date.now();
}

function membershipUsageDayUtc(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isGuestUser(userId: string | null | undefined) {
  const normalized = String(userId || '').trim().toLowerCase();
  return !normalized || normalized === 'guest-default' || normalized.startsWith('guest-');
}

function isPostgresBusinessRuntime() {
  return getConfig().database.driver === 'postgres';
}

function membershipTable(tableName: string) {
  return qualifyBusinessTable(tableName);
}

function getMembershipDb() {
  const db = getDb();
  ensureSchema(db);
  return db;
}

function buildPgMembershipSchemaSql() {
  const usageTable = membershipTable('membership_usage_daily');
  return [
    `CREATE TABLE IF NOT EXISTS ${usageTable} (
      user_id TEXT NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
      usage_day TEXT NOT NULL,
      ask_nova_used BIGINT NOT NULL DEFAULT 0,
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL,
      PRIMARY KEY (user_id, usage_day)
    );`,
    `CREATE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_membership_usage_daily_recent')} ON ${usageTable} (user_id, updated_at_ms DESC);`,
  ];
}

function ensureMembershipSchema() {
  if (!isPostgresBusinessRuntime()) {
    getMembershipDb();
    return;
  }
  if (pgMembershipSchemaReady) return;
  buildPgMembershipSchemaSql().forEach((sql) => executeSync(sql));
  pgMembershipSchemaReady = true;
}

function runMembershipTransaction<T>(callback: () => T): T {
  if (!isPostgresBusinessRuntime()) {
    const db = getMembershipDb();
    return db.transaction(callback)();
  }
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

function guestUsageKey(userId: string, usageDay: string) {
  return `${String(userId || 'guest-default').trim() || 'guest-default'}:${usageDay}`;
}

function readGuestUsage(userId: string, usageDay: string) {
  return guestUsageBucket.get(guestUsageKey(userId, usageDay)) || 0;
}

function readPersistedUsage(userId: string, usageDay: string) {
  ensureMembershipSchema();
  if (!isPostgresBusinessRuntime()) {
    const row = getMembershipDb()
      .prepare(
        `SELECT user_id, usage_day, ask_nova_used, created_at_ms, updated_at_ms
         FROM membership_usage_daily
         WHERE user_id = ? AND usage_day = ?
         LIMIT 1`,
      )
      .get(userId, usageDay) as MembershipUsageRow | undefined;
    return Number(row?.ask_nova_used || 0);
  }

  const row = queryRowSync<MembershipUsageRow>(
    `SELECT user_id, usage_day, ask_nova_used, created_at_ms, updated_at_ms
     FROM ${membershipTable('membership_usage_daily')}
     WHERE user_id = $1 AND usage_day = $2
     LIMIT 1`,
    [userId, usageDay],
  );
  return Number(row?.ask_nova_used || 0);
}

function writePersistedUsage(userId: string, usageDay: string) {
  const ts = nowMs();
  ensureMembershipSchema();

  if (!isPostgresBusinessRuntime()) {
    getMembershipDb()
      .prepare(
        `INSERT INTO membership_usage_daily(
           user_id, usage_day, ask_nova_used, created_at_ms, updated_at_ms
         )
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(user_id, usage_day) DO UPDATE SET
           ask_nova_used = membership_usage_daily.ask_nova_used + 1,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run(userId, usageDay, ts, ts);
    return;
  }

  executeSync(
    `INSERT INTO ${membershipTable('membership_usage_daily')}(
       user_id, usage_day, ask_nova_used, created_at_ms, updated_at_ms
     )
     VALUES ($1, $2, 1, $3, $3)
     ON CONFLICT (user_id, usage_day) DO UPDATE SET
       ask_nova_used = ${membershipTable('membership_usage_daily')}.ask_nova_used + 1,
       updated_at_ms = EXCLUDED.updated_at_ms`,
    [userId, usageDay, ts],
  );
}

function incrementAskNovaUsage(args: {
  userId: string;
  usageDay: string;
  limit: number;
}): MembershipUsageMutationResult {
  if (isGuestUser(args.userId)) {
    const current = readGuestUsage(args.userId, args.usageDay);
    if (current >= args.limit) {
      return {
        allowed: false,
        askNovaUsed: current,
      };
    }
    const next = current + 1;
    guestUsageBucket.set(guestUsageKey(args.userId, args.usageDay), next);
    return {
      allowed: true,
      askNovaUsed: next,
    };
  }

  return runMembershipTransaction(() => {
    const current = readPersistedUsage(args.userId, args.usageDay);
    if (current >= args.limit) {
      return {
        allowed: false,
        askNovaUsed: current,
      };
    }
    writePersistedUsage(args.userId, args.usageDay);
    return {
      allowed: true,
      askNovaUsed: current + 1,
    };
  });
}

function usageCountForUser(userId: string, usageDay: string) {
  if (isGuestUser(userId)) {
    return readGuestUsage(userId, usageDay);
  }
  return readPersistedUsage(userId, usageDay);
}

function membershipStateFor(userId: string, usageDay: string, askNovaUsed: number): MembershipState {
  const billingState = isGuestUser(userId) ? null : getBillingState(userId);
  const currentPlan = normalizeMembershipPlan(billingState?.currentPlan || 'free') as BillingPlan;
  const limits = getMembershipLimits(currentPlan);
  return {
    available: true,
    authenticated: !isGuestUser(userId),
    currentPlan,
    limits,
    usage: {
      day: usageDay,
      askNovaUsed: Math.max(0, Number(askNovaUsed || 0)),
    },
    remainingAskNova: getRemainingAskNova(currentPlan, {
      day: usageDay,
      askNovaUsed,
    }),
  };
}

function usageUpgradePlan(plan: BillingPlan) {
  return plan === 'lite' ? 'pro' : 'lite';
}

export function getMembershipState(args: { userId?: string; usageDay?: string }): MembershipState {
  const userId = String(args.userId || 'guest-default').trim() || 'guest-default';
  const usageDay = String(args.usageDay || '').trim() || membershipUsageDayUtc();
  return membershipStateFor(userId, usageDay, usageCountForUser(userId, usageDay));
}

export function consumeAskNovaAccess(args: {
  userId?: string;
  message?: string;
  context?: Record<string, unknown>;
  usageDay?: string;
}): MembershipAccessSuccess | MembershipAccessFailure {
  const userId = String(args.userId || 'guest-default').trim() || 'guest-default';
  const usageDay = String(args.usageDay || '').trim() || membershipUsageDayUtc();
  const currentState = getMembershipState({
    userId,
    usageDay,
  });

  if (
    !isPortfolioAiEnabled(currentState.currentPlan) &&
    isPortfolioAwareRequest(args.message, args.context || {})
  ) {
    return {
      ok: false,
      error: 'PORTFOLIO_AI_REQUIRES_PRO',
      reason: 'portfolio_ai',
      targetPlan: 'pro',
      state: currentState,
    };
  }

  if (currentState.limits.askNovaDaily === null) {
    return {
      ok: true,
      state: currentState,
    };
  }

  const usageResult = incrementAskNovaUsage({
    userId,
    usageDay,
    limit: currentState.limits.askNovaDaily,
  });

  if (!usageResult.allowed) {
    return {
      ok: false,
      error: 'ASK_NOVA_LIMIT_REACHED',
      reason: 'ai_limit',
      targetPlan: usageUpgradePlan(currentState.currentPlan),
      state: membershipStateFor(userId, usageDay, usageResult.askNovaUsed),
    };
  }

  return {
    ok: true,
    state: membershipStateFor(userId, usageDay, usageResult.askNovaUsed),
  };
}

export function requireBrokerHandoffAccess(args: {
  userId?: string;
}): MembershipAccessSuccess | MembershipAccessFailure {
  const state = getMembershipState({
    userId: args.userId,
  });
  if (isBrokerHandoffEnabled(state.currentPlan)) {
    return {
      ok: true,
      state,
    };
  }
  return {
    ok: false,
    error: 'BROKER_HANDOFF_REQUIRES_LITE',
    reason: 'broker_handoff',
    targetPlan: 'lite',
    state,
  };
}

export function applyMembershipAccessToDecision(args: {
  decision: Record<string, unknown> | null | undefined;
  currentPlan?: string | null;
}) {
  if (!args.decision || typeof args.decision !== 'object') return args.decision || null;
  const currentPlan = normalizeMembershipPlan(args.currentPlan || 'free') as BillingPlan;
  const todayCardLimit = getTodayCardLimit(currentPlan);
  const cards = Array.isArray(args.decision.ranked_action_cards) ? args.decision.ranked_action_cards : [];

  if (todayCardLimit === null) {
    return args.decision;
  }

  return {
    ...args.decision,
    ranked_action_cards: cards.slice(0, todayCardLimit),
    membership_gate: {
      ...(args.decision.membership_gate && typeof args.decision.membership_gate === 'object'
        ? (args.decision.membership_gate as Record<string, unknown>)
        : {}),
      current_plan: currentPlan,
      today_card_limit: todayCardLimit,
      total_action_cards: cards.length,
      hidden_action_cards: Math.max(0, cards.length - todayCardLimit),
    },
  };
}

export function applyMembershipAccessToRuntimeState(args: {
  runtime: Record<string, unknown> | null | undefined;
  currentPlan?: string | null;
}) {
  if (!args.runtime || typeof args.runtime !== 'object') return args.runtime || null;
  const data =
    args.runtime.data && typeof args.runtime.data === 'object'
      ? (args.runtime.data as Record<string, unknown>)
      : null;
  if (!data) return args.runtime;

  return {
    ...args.runtime,
    data: {
      ...data,
      decision: applyMembershipAccessToDecision({
        decision:
          data.decision && typeof data.decision === 'object'
            ? (data.decision as Record<string, unknown>)
            : null,
        currentPlan: args.currentPlan,
      }),
    },
  };
}

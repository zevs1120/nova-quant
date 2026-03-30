import { randomBytes } from 'node:crypto';
import { getMembershipPriceCents, normalizeMembershipPlan } from '../../utils/membership.js';
import { getConfig } from '../config.js';
import { getDb } from '../db/database.js';
import { quotePgIdentifier } from '../db/postgresMigration.js';
import { ensureSchema } from '../db/schema.js';
import {
  beginTransactionSync,
  commitTransactionSync,
  executeSync,
  getPostgresBusinessSchema,
  qualifyBusinessTable,
  queryRowSync,
  rollbackTransactionSync,
} from '../db/postgresSyncBridge.js';

const CHECKOUT_TTL_MS = 30 * 60 * 1000;
const BILLING_PROVIDER = 'internal_checkout';
const BILLING_CURRENCY = 'USD';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export type BillingPlan = 'free' | 'lite' | 'pro';
export type BillingCycle = 'monthly' | 'annual';
export type BillingSubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PENDING';
export type BillingCheckoutStatus = 'OPEN' | 'COMPLETED' | 'EXPIRED' | 'ABANDONED';
export type BillingErrorCode =
  | 'AUTH_REQUIRED'
  | 'PLAN_NOT_SUPPORTED'
  | 'CHECKOUT_NOT_FOUND'
  | 'CHECKOUT_NOT_OPEN'
  | 'CHECKOUT_EXPIRED'
  | 'CHECKOUT_ALREADY_COMPLETED';

type BillingCustomerRow = {
  user_id: string;
  email: string;
  provider: string;
  provider_customer_id: string | null;
  default_currency: string;
  default_billing_cycle: string;
  created_at_ms: number;
  updated_at_ms: number;
};

type BillingCheckoutRow = {
  session_id: string;
  user_id: string;
  plan_key: string;
  billing_cycle: string;
  status: string;
  provider: string;
  provider_session_id: string | null;
  amount_cents: number;
  currency: string;
  checkout_email: string | null;
  payment_method_last4: string | null;
  success_subscription_id: string | null;
  metadata_json: string | null;
  created_at_ms: number;
  expires_at_ms: number;
  completed_at_ms: number | null;
  updated_at_ms: number;
};

type BillingSubscriptionRow = {
  subscription_id: string;
  user_id: string;
  plan_key: string;
  status: string;
  provider: string;
  provider_subscription_id: string | null;
  billing_cycle: string;
  amount_cents: number;
  currency: string;
  started_at_ms: number;
  current_period_start_ms: number;
  current_period_end_ms: number | null;
  cancel_at_period_end: number | boolean;
  cancelled_at_ms: number | null;
  checkout_session_id: string | null;
  metadata_json: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

type AuthUserRow = {
  user_id: string;
  email: string;
  name: string;
};

export type BillingState = {
  available: boolean;
  authenticated: boolean;
  currentPlan: BillingPlan;
  customer: {
    email: string;
    provider: string;
    defaultCurrency: string;
    defaultBillingCycle: BillingCycle;
  } | null;
  subscription: {
    id: string;
    planKey: BillingPlan;
    status: BillingSubscriptionStatus;
    provider: string;
    billingCycle: BillingCycle;
    amountCents: number;
    currency: string;
    startedAt: string;
    currentPeriodStartAt: string;
    currentPeriodEndAt: string | null;
    cancelAtPeriodEnd: boolean;
    cancelledAt: string | null;
    checkoutSessionId: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  latestCheckout: {
    id: string;
    planKey: BillingPlan;
    status: BillingCheckoutStatus;
    billingCycle: BillingCycle;
    amountCents: number;
    currency: string;
    checkoutEmail: string | null;
    paymentMethodLast4: string | null;
    createdAt: string;
    expiresAt: string;
    completedAt: string | null;
    updatedAt: string;
  } | null;
};

type BillingResult<T> = { ok: true } & T;
type BillingFailure = { ok: false; error: BillingErrorCode };

export type BillingCheckoutSession = BillingState['latestCheckout'];
export type BillingSubscription = BillingState['subscription'];

let pgBillingSchemaReady = false;

function nowMs() {
  return Date.now();
}

function createId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function normalizeBillingCycle(value: unknown): BillingCycle {
  return String(value || '')
    .trim()
    .toLowerCase() === 'annual'
    ? 'annual'
    : 'monthly';
}

function normalizeBillingPlan(value: unknown): BillingPlan {
  return normalizeMembershipPlan(value) as BillingPlan;
}

function isGuestUser(userId: string | null | undefined) {
  const normalized = String(userId || '').trim();
  return !normalized || normalized.startsWith('guest-');
}

function isPostgresBusinessRuntime() {
  return getConfig().database.driver === 'postgres';
}

function toIso(value: number | null | undefined) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? new Date(next).toISOString() : null;
}

function asBoolean(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function sanitizeEmail(value: unknown, fallback = '') {
  const normalized = String(value || fallback || '')
    .trim()
    .toLowerCase();
  return (
    normalized ||
    String(fallback || '')
      .trim()
      .toLowerCase() ||
    ''
  );
}

function sanitizeLast4(value: unknown) {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits ? digits.slice(-4) : null;
}

function cycleDurationMs(cycle: BillingCycle) {
  return cycle === 'annual' ? YEAR_MS : MONTH_MS;
}

function billingTable(tableName: string) {
  return qualifyBusinessTable(tableName);
}

function getBillingDb() {
  const db = getDb();
  ensureSchema(db);
  return db;
}

function buildPgBillingSchemaSql() {
  const schemaName = quotePgIdentifier(getPostgresBusinessSchema());
  const customerTable = billingTable('billing_customers');
  const checkoutTable = billingTable('billing_checkout_sessions');
  const subscriptionTable = billingTable('billing_subscriptions');
  return [
    `CREATE SCHEMA IF NOT EXISTS ${schemaName};`,
    `CREATE TABLE IF NOT EXISTS ${customerTable} (
      user_id TEXT PRIMARY KEY REFERENCES auth_users(user_id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '${BILLING_PROVIDER}',
      provider_customer_id TEXT,
      default_currency TEXT NOT NULL DEFAULT '${BILLING_CURRENCY}',
      default_billing_cycle TEXT NOT NULL CHECK (default_billing_cycle IN ('monthly', 'annual')),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_customers_email')} ON ${customerTable} (email);`,
    `CREATE TABLE IF NOT EXISTS ${checkoutTable} (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
      plan_key TEXT NOT NULL CHECK (plan_key IN ('lite', 'pro')),
      billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'COMPLETED', 'EXPIRED', 'ABANDONED')),
      provider TEXT NOT NULL DEFAULT '${BILLING_PROVIDER}',
      provider_session_id TEXT,
      amount_cents BIGINT NOT NULL,
      currency TEXT NOT NULL DEFAULT '${BILLING_CURRENCY}',
      checkout_email TEXT,
      payment_method_last4 TEXT,
      success_subscription_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at_ms BIGINT NOT NULL,
      expires_at_ms BIGINT NOT NULL,
      completed_at_ms BIGINT,
      updated_at_ms BIGINT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_checkout_sessions_user')} ON ${checkoutTable} (user_id, created_at_ms DESC);`,
    `CREATE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_checkout_sessions_status')} ON ${checkoutTable} (status, expires_at_ms DESC);`,
    `CREATE TABLE IF NOT EXISTS ${subscriptionTable} (
      subscription_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
      plan_key TEXT NOT NULL CHECK (plan_key IN ('free', 'lite', 'pro')),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING')),
      provider TEXT NOT NULL DEFAULT '${BILLING_PROVIDER}',
      provider_subscription_id TEXT,
      billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
      amount_cents BIGINT NOT NULL,
      currency TEXT NOT NULL DEFAULT '${BILLING_CURRENCY}',
      started_at_ms BIGINT NOT NULL,
      current_period_start_ms BIGINT NOT NULL,
      current_period_end_ms BIGINT,
      cancel_at_period_end BIGINT NOT NULL DEFAULT 0,
      cancelled_at_ms BIGINT,
      checkout_session_id TEXT REFERENCES ${checkoutTable}(session_id) ON DELETE SET NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_subscriptions_user')} ON ${subscriptionTable} (user_id, updated_at_ms DESC);`,
    `CREATE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_subscriptions_status')} ON ${subscriptionTable} (user_id, status, updated_at_ms DESC);`,
  ];
}

function ensureBillingSchema() {
  if (!isPostgresBusinessRuntime()) {
    getBillingDb();
    return;
  }
  if (pgBillingSchemaReady) return;
  buildPgBillingSchemaSql().forEach((sql) => executeSync(sql));
  pgBillingSchemaReady = true;
}

function runBillingTransaction<T>(callback: () => T): T {
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
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

function getAuthUser(userId: string) {
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    return (
      (db
        .prepare('SELECT user_id, email, name FROM auth_users WHERE user_id = ? LIMIT 1')
        .get(userId) as AuthUserRow | undefined) || null
    );
  }
  return queryRowSync<AuthUserRow>(
    'SELECT user_id, email, name FROM auth_users WHERE user_id = $1 LIMIT 1',
    [userId],
  );
}

function readBillingCustomer(userId: string) {
  ensureBillingSchema();
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    return (
      (db
        .prepare(
          `SELECT user_id, email, provider, provider_customer_id, default_currency, default_billing_cycle, created_at_ms, updated_at_ms
           FROM billing_customers
           WHERE user_id = ?
           LIMIT 1`,
        )
        .get(userId) as BillingCustomerRow | undefined) || null
    );
  }
  return queryRowSync<BillingCustomerRow>(
    `SELECT user_id, email, provider, provider_customer_id, default_currency, default_billing_cycle, created_at_ms, updated_at_ms
     FROM ${billingTable('billing_customers')}
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
}

function readLatestSubscription(userId: string) {
  ensureBillingSchema();
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    return (
      (db
        .prepare(
          `SELECT subscription_id, user_id, plan_key, status, provider, provider_subscription_id, billing_cycle,
                  amount_cents, currency, started_at_ms, current_period_start_ms, current_period_end_ms,
                  cancel_at_period_end, cancelled_at_ms, checkout_session_id, metadata_json, created_at_ms, updated_at_ms
           FROM billing_subscriptions
           WHERE user_id = ?
           ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, updated_at_ms DESC
           LIMIT 1`,
        )
        .get(userId) as BillingSubscriptionRow | undefined) || null
    );
  }
  return queryRowSync<BillingSubscriptionRow>(
    `SELECT subscription_id, user_id, plan_key, status, provider, provider_subscription_id, billing_cycle,
            amount_cents, currency, started_at_ms, current_period_start_ms, current_period_end_ms,
            cancel_at_period_end, cancelled_at_ms, checkout_session_id, metadata_json, created_at_ms, updated_at_ms
     FROM ${billingTable('billing_subscriptions')}
     WHERE user_id = $1
     ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, updated_at_ms DESC
     LIMIT 1`,
    [userId],
  );
}

function readCheckoutSession(userId: string, sessionId: string, forUpdate = false) {
  ensureBillingSchema();
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    return (
      (db
        .prepare(
          `SELECT session_id, user_id, plan_key, billing_cycle, status, provider, provider_session_id,
                  amount_cents, currency, checkout_email, payment_method_last4, success_subscription_id,
                  metadata_json, created_at_ms, expires_at_ms, completed_at_ms, updated_at_ms
           FROM billing_checkout_sessions
           WHERE session_id = ? AND user_id = ?
           LIMIT 1`,
        )
        .get(sessionId, userId) as BillingCheckoutRow | undefined) || null
    );
  }
  return queryRowSync<BillingCheckoutRow>(
    `SELECT session_id, user_id, plan_key, billing_cycle, status, provider, provider_session_id,
            amount_cents, currency, checkout_email, payment_method_last4, success_subscription_id,
            metadata_json, created_at_ms, expires_at_ms, completed_at_ms, updated_at_ms
     FROM ${billingTable('billing_checkout_sessions')}
     WHERE session_id = $1 AND user_id = $2
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [sessionId, userId],
  );
}

function readLatestCheckout(userId: string) {
  ensureBillingSchema();
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    return (
      (db
        .prepare(
          `SELECT session_id, user_id, plan_key, billing_cycle, status, provider, provider_session_id,
                  amount_cents, currency, checkout_email, payment_method_last4, success_subscription_id,
                  metadata_json, created_at_ms, expires_at_ms, completed_at_ms, updated_at_ms
           FROM billing_checkout_sessions
           WHERE user_id = ?
           ORDER BY created_at_ms DESC
           LIMIT 1`,
        )
        .get(userId) as BillingCheckoutRow | undefined) || null
    );
  }
  return queryRowSync<BillingCheckoutRow>(
    `SELECT session_id, user_id, plan_key, billing_cycle, status, provider, provider_session_id,
            amount_cents, currency, checkout_email, payment_method_last4, success_subscription_id,
            metadata_json, created_at_ms, expires_at_ms, completed_at_ms, updated_at_ms
     FROM ${billingTable('billing_checkout_sessions')}
     WHERE user_id = $1
     ORDER BY created_at_ms DESC
     LIMIT 1`,
    [userId],
  );
}

function markCheckoutExpired(userId: string, sessionId: string, ts: number) {
  ensureBillingSchema();
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    db.prepare(
      `UPDATE billing_checkout_sessions
       SET status = 'EXPIRED', updated_at_ms = ?
       WHERE session_id = ? AND user_id = ? AND status = 'OPEN'`,
    ).run(ts, sessionId, userId);
    return;
  }
  executeSync(
    `UPDATE ${billingTable('billing_checkout_sessions')}
     SET status = 'EXPIRED', updated_at_ms = $1
     WHERE session_id = $2 AND user_id = $3 AND status = 'OPEN'`,
    [ts, sessionId, userId],
  );
}

function upsertBillingCustomer(args: {
  userId: string;
  email: string;
  billingCycle: BillingCycle;
  now: number;
}) {
  ensureBillingSchema();
  const metadataJson = JSON.stringify({});
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    db.prepare(
      `INSERT INTO billing_customers(
        user_id, email, provider, provider_customer_id, default_currency, default_billing_cycle, metadata_json, created_at_ms, updated_at_ms
      ) VALUES(
        @user_id, @email, @provider, NULL, @default_currency, @default_billing_cycle, @metadata_json, @created_at_ms, @updated_at_ms
      )
      ON CONFLICT(user_id) DO UPDATE SET
        email = excluded.email,
        default_currency = excluded.default_currency,
        default_billing_cycle = excluded.default_billing_cycle,
        updated_at_ms = excluded.updated_at_ms`,
    ).run({
      user_id: args.userId,
      email: args.email,
      provider: BILLING_PROVIDER,
      default_currency: BILLING_CURRENCY,
      default_billing_cycle: args.billingCycle,
      metadata_json: metadataJson,
      created_at_ms: args.now,
      updated_at_ms: args.now,
    });
    return;
  }
  executeSync(
    `INSERT INTO ${billingTable('billing_customers')}(
      user_id, email, provider, provider_customer_id, default_currency, default_billing_cycle, metadata_json, created_at_ms, updated_at_ms
    ) VALUES($1, $2, $3, NULL, $4, $5, $6, $7, $8)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      default_currency = EXCLUDED.default_currency,
      default_billing_cycle = EXCLUDED.default_billing_cycle,
      updated_at_ms = EXCLUDED.updated_at_ms`,
    [
      args.userId,
      args.email,
      BILLING_PROVIDER,
      BILLING_CURRENCY,
      args.billingCycle,
      metadataJson,
      args.now,
      args.now,
    ],
  );
}

function insertCheckoutSession(args: {
  sessionId: string;
  userId: string;
  planKey: Exclude<BillingPlan, 'free'>;
  billingCycle: BillingCycle;
  amountCents: number;
  now: number;
  expiresAt: number;
  metadataJson: string;
}) {
  ensureBillingSchema();
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    db.prepare(
      `INSERT INTO billing_checkout_sessions(
        session_id, user_id, plan_key, billing_cycle, status, provider, provider_session_id,
        amount_cents, currency, checkout_email, payment_method_last4, success_subscription_id,
        metadata_json, created_at_ms, expires_at_ms, completed_at_ms, updated_at_ms
      ) VALUES(
        @session_id, @user_id, @plan_key, @billing_cycle, 'OPEN', @provider, NULL,
        @amount_cents, @currency, NULL, NULL, NULL,
        @metadata_json, @created_at_ms, @expires_at_ms, NULL, @updated_at_ms
      )`,
    ).run({
      session_id: args.sessionId,
      user_id: args.userId,
      plan_key: args.planKey,
      billing_cycle: args.billingCycle,
      provider: BILLING_PROVIDER,
      amount_cents: args.amountCents,
      currency: BILLING_CURRENCY,
      metadata_json: args.metadataJson,
      created_at_ms: args.now,
      expires_at_ms: args.expiresAt,
      updated_at_ms: args.now,
    });
    return;
  }
  executeSync(
    `INSERT INTO ${billingTable('billing_checkout_sessions')}(
      session_id, user_id, plan_key, billing_cycle, status, provider, provider_session_id,
      amount_cents, currency, checkout_email, payment_method_last4, success_subscription_id,
      metadata_json, created_at_ms, expires_at_ms, completed_at_ms, updated_at_ms
    ) VALUES($1, $2, $3, $4, 'OPEN', $5, NULL, $6, $7, NULL, NULL, NULL, $8, $9, $10, NULL, $11)`,
    [
      args.sessionId,
      args.userId,
      args.planKey,
      args.billingCycle,
      BILLING_PROVIDER,
      args.amountCents,
      BILLING_CURRENCY,
      args.metadataJson,
      args.now,
      args.expiresAt,
      args.now,
    ],
  );
}

function cancelActiveSubscriptions(userId: string, ts: number) {
  ensureBillingSchema();
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    db.prepare(
      `UPDATE billing_subscriptions
       SET status = 'CANCELLED',
           cancelled_at_ms = COALESCE(cancelled_at_ms, ?),
           current_period_end_ms = COALESCE(current_period_end_ms, ?),
           updated_at_ms = ?
       WHERE user_id = ? AND status = 'ACTIVE'`,
    ).run(ts, ts, ts, userId);
    return;
  }
  executeSync(
    `UPDATE ${billingTable('billing_subscriptions')}
     SET status = 'CANCELLED',
         cancelled_at_ms = COALESCE(cancelled_at_ms, $1),
         current_period_end_ms = COALESCE(current_period_end_ms, $2),
         updated_at_ms = $3
     WHERE user_id = $4 AND status = 'ACTIVE'`,
    [ts, ts, ts, userId],
  );
}

function insertSubscription(args: {
  subscriptionId: string;
  userId: string;
  planKey: BillingPlan;
  billingCycle: BillingCycle;
  amountCents: number;
  startedAt: number;
  currentPeriodEndAt: number;
  checkoutSessionId: string;
  metadataJson: string;
}) {
  ensureBillingSchema();
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    db.prepare(
      `INSERT INTO billing_subscriptions(
        subscription_id, user_id, plan_key, status, provider, provider_subscription_id,
        billing_cycle, amount_cents, currency, started_at_ms, current_period_start_ms,
        current_period_end_ms, cancel_at_period_end, cancelled_at_ms, checkout_session_id,
        metadata_json, created_at_ms, updated_at_ms
      ) VALUES(
        @subscription_id, @user_id, @plan_key, 'ACTIVE', @provider, NULL,
        @billing_cycle, @amount_cents, @currency, @started_at_ms, @current_period_start_ms,
        @current_period_end_ms, 0, NULL, @checkout_session_id,
        @metadata_json, @created_at_ms, @updated_at_ms
      )`,
    ).run({
      subscription_id: args.subscriptionId,
      user_id: args.userId,
      plan_key: args.planKey,
      provider: BILLING_PROVIDER,
      billing_cycle: args.billingCycle,
      amount_cents: args.amountCents,
      currency: BILLING_CURRENCY,
      started_at_ms: args.startedAt,
      current_period_start_ms: args.startedAt,
      current_period_end_ms: args.currentPeriodEndAt,
      checkout_session_id: args.checkoutSessionId,
      metadata_json: args.metadataJson,
      created_at_ms: args.startedAt,
      updated_at_ms: args.startedAt,
    });
    return;
  }
  executeSync(
    `INSERT INTO ${billingTable('billing_subscriptions')}(
      subscription_id, user_id, plan_key, status, provider, provider_subscription_id,
      billing_cycle, amount_cents, currency, started_at_ms, current_period_start_ms,
      current_period_end_ms, cancel_at_period_end, cancelled_at_ms, checkout_session_id,
      metadata_json, created_at_ms, updated_at_ms
    ) VALUES($1, $2, $3, 'ACTIVE', $4, NULL, $5, $6, $7, $8, $9, $10, 0, NULL, $11, $12, $13, $14)`,
    [
      args.subscriptionId,
      args.userId,
      args.planKey,
      BILLING_PROVIDER,
      args.billingCycle,
      args.amountCents,
      BILLING_CURRENCY,
      args.startedAt,
      args.startedAt,
      args.currentPeriodEndAt,
      args.checkoutSessionId,
      args.metadataJson,
      args.startedAt,
      args.startedAt,
    ],
  );
}

function completeCheckoutSessionRow(args: {
  userId: string;
  sessionId: string;
  email: string;
  paymentMethodLast4: string | null;
  subscriptionId: string;
  completedAt: number;
}) {
  ensureBillingSchema();
  if (!isPostgresBusinessRuntime()) {
    const db = getBillingDb();
    db.prepare(
      `UPDATE billing_checkout_sessions
       SET status = 'COMPLETED',
           checkout_email = ?,
           payment_method_last4 = ?,
           success_subscription_id = ?,
           completed_at_ms = ?,
           updated_at_ms = ?
       WHERE session_id = ? AND user_id = ?`,
    ).run(
      args.email,
      args.paymentMethodLast4,
      args.subscriptionId,
      args.completedAt,
      args.completedAt,
      args.sessionId,
      args.userId,
    );
    return;
  }
  executeSync(
    `UPDATE ${billingTable('billing_checkout_sessions')}
     SET status = 'COMPLETED',
         checkout_email = $1,
         payment_method_last4 = $2,
         success_subscription_id = $3,
         completed_at_ms = $4,
         updated_at_ms = $5
     WHERE session_id = $6 AND user_id = $7`,
    [
      args.email,
      args.paymentMethodLast4,
      args.subscriptionId,
      args.completedAt,
      args.completedAt,
      args.sessionId,
      args.userId,
    ],
  );
}

function mapCustomer(row: BillingCustomerRow | null) {
  if (!row) return null;
  return {
    email: String(row.email || ''),
    provider: String(row.provider || BILLING_PROVIDER),
    defaultCurrency: String(row.default_currency || BILLING_CURRENCY),
    defaultBillingCycle: normalizeBillingCycle(row.default_billing_cycle),
  };
}

function mapCheckout(row: BillingCheckoutRow | null): BillingCheckoutSession {
  if (!row) return null;
  return {
    id: row.session_id,
    planKey: normalizeBillingPlan(row.plan_key),
    status: String(row.status || 'OPEN') as BillingCheckoutStatus,
    billingCycle: normalizeBillingCycle(row.billing_cycle),
    amountCents: Number(row.amount_cents || 0),
    currency: String(row.currency || BILLING_CURRENCY),
    checkoutEmail: row.checkout_email ? String(row.checkout_email) : null,
    paymentMethodLast4: row.payment_method_last4 ? String(row.payment_method_last4) : null,
    createdAt: toIso(row.created_at_ms) || new Date(0).toISOString(),
    expiresAt: toIso(row.expires_at_ms) || new Date(0).toISOString(),
    completedAt: toIso(row.completed_at_ms),
    updatedAt: toIso(row.updated_at_ms) || new Date(0).toISOString(),
  };
}

function mapSubscription(row: BillingSubscriptionRow | null): BillingSubscription {
  if (!row) return null;
  return {
    id: row.subscription_id,
    planKey: normalizeBillingPlan(row.plan_key),
    status: String(row.status || 'PENDING') as BillingSubscriptionStatus,
    provider: String(row.provider || BILLING_PROVIDER),
    billingCycle: normalizeBillingCycle(row.billing_cycle),
    amountCents: Number(row.amount_cents || 0),
    currency: String(row.currency || BILLING_CURRENCY),
    startedAt: toIso(row.started_at_ms) || new Date(0).toISOString(),
    currentPeriodStartAt: toIso(row.current_period_start_ms) || new Date(0).toISOString(),
    currentPeriodEndAt: toIso(row.current_period_end_ms),
    cancelAtPeriodEnd: asBoolean(row.cancel_at_period_end),
    cancelledAt: toIso(row.cancelled_at_ms),
    checkoutSessionId: row.checkout_session_id ? String(row.checkout_session_id) : null,
    createdAt: toIso(row.created_at_ms) || new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at_ms) || new Date(0).toISOString(),
  };
}

function defaultBillingState(authenticated: boolean): BillingState {
  return {
    available: authenticated,
    authenticated,
    currentPlan: 'free',
    customer: null,
    subscription: null,
    latestCheckout: null,
  };
}

function expireCheckoutIfNeeded(userId: string, row: BillingCheckoutRow | null) {
  if (!row) return row;
  if (String(row.status || '').toUpperCase() !== 'OPEN') return row;
  if (Number(row.expires_at_ms || 0) > nowMs()) return row;
  const expiredAt = nowMs();
  markCheckoutExpired(userId, row.session_id, expiredAt);
  return {
    ...row,
    status: 'EXPIRED',
    updated_at_ms: expiredAt,
  };
}

export function getBillingState(userId: string): BillingState {
  if (isGuestUser(userId)) return defaultBillingState(false);
  ensureBillingSchema();
  const authUser = getAuthUser(userId);
  if (!authUser) return defaultBillingState(false);

  const customer = readBillingCustomer(userId);
  const latestSubscription = readLatestSubscription(userId);
  const latestCheckout = expireCheckoutIfNeeded(userId, readLatestCheckout(userId));
  const normalizedSubscription = mapSubscription(latestSubscription);

  return {
    available: true,
    authenticated: true,
    currentPlan:
      normalizedSubscription?.status === 'ACTIVE'
        ? normalizeBillingPlan(normalizedSubscription.planKey)
        : 'free',
    customer: mapCustomer(customer),
    subscription: normalizedSubscription,
    latestCheckout: mapCheckout(latestCheckout),
  };
}

export function createBillingCheckoutSession(args: {
  userId: string;
  planKey: string;
  billingCycle?: string;
  source?: string | null;
  locale?: string | null;
}): BillingResult<{ session: BillingCheckoutSession; state: BillingState }> | BillingFailure {
  if (isGuestUser(args.userId)) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }

  ensureBillingSchema();
  const authUser = getAuthUser(args.userId);
  if (!authUser) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }

  const planKey = normalizeBillingPlan(args.planKey);
  if (planKey === 'free') {
    return { ok: false, error: 'PLAN_NOT_SUPPORTED' };
  }
  const billingCycle = normalizeBillingCycle(args.billingCycle);
  const amountCents = getMembershipPriceCents(planKey, billingCycle);
  if (amountCents <= 0) {
    return { ok: false, error: 'PLAN_NOT_SUPPORTED' };
  }

  const ts = nowMs();
  const sessionId = createId('chk');
  const expiresAt = ts + CHECKOUT_TTL_MS;
  const metadataJson = JSON.stringify({
    source: args.source || null,
    locale: args.locale || null,
  });

  upsertBillingCustomer({
    userId: args.userId,
    email: sanitizeEmail(authUser.email),
    billingCycle,
    now: ts,
  });
  insertCheckoutSession({
    sessionId,
    userId: args.userId,
    planKey,
    billingCycle,
    amountCents,
    now: ts,
    expiresAt,
    metadataJson,
  });

  return {
    ok: true,
    session: mapCheckout(readCheckoutSession(args.userId, sessionId)),
    state: getBillingState(args.userId),
  };
}

export function getBillingCheckoutSession(args: {
  userId: string;
  sessionId: string;
}): BillingResult<{ session: BillingCheckoutSession; state: BillingState }> | BillingFailure {
  if (isGuestUser(args.userId)) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }
  ensureBillingSchema();

  const session = expireCheckoutIfNeeded(
    args.userId,
    readCheckoutSession(args.userId, args.sessionId),
  );
  if (!session) {
    return { ok: false, error: 'CHECKOUT_NOT_FOUND' };
  }

  return {
    ok: true,
    session: mapCheckout(session),
    state: getBillingState(args.userId),
  };
}

export function completeBillingCheckoutSession(args: {
  userId: string;
  sessionId: string;
  billingEmail?: string | null;
  paymentMethodLast4?: string | null;
}):
  | BillingResult<{
      session: BillingCheckoutSession;
      subscription: BillingSubscription;
      state: BillingState;
    }>
  | BillingFailure {
  if (isGuestUser(args.userId)) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }
  ensureBillingSchema();

  const authUser = getAuthUser(args.userId);
  if (!authUser) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }

  const transactionResult = runBillingTransaction<
    | BillingFailure
    | BillingResult<{
        session: BillingCheckoutSession;
        subscription: BillingSubscription;
      }>
  >(() => {
    const lockedSession = readCheckoutSession(args.userId, args.sessionId, true);
    if (!lockedSession) {
      return { ok: false, error: 'CHECKOUT_NOT_FOUND' };
    }

    const status = String(lockedSession.status || '').toUpperCase();
    if (status === 'COMPLETED') {
      return { ok: false, error: 'CHECKOUT_ALREADY_COMPLETED' };
    }
    if (status !== 'OPEN') {
      return { ok: false, error: status === 'EXPIRED' ? 'CHECKOUT_EXPIRED' : 'CHECKOUT_NOT_OPEN' };
    }

    const ts = nowMs();
    if (Number(lockedSession.expires_at_ms || 0) <= ts) {
      markCheckoutExpired(args.userId, args.sessionId, ts);
      return { ok: false, error: 'CHECKOUT_EXPIRED' };
    }

    const billingCycle = normalizeBillingCycle(lockedSession.billing_cycle);
    const planKey = normalizeBillingPlan(lockedSession.plan_key);
    const amountCents = Number(lockedSession.amount_cents || 0);
    const checkoutEmail = sanitizeEmail(args.billingEmail, authUser.email);
    const paymentMethodLast4 = sanitizeLast4(args.paymentMethodLast4);
    const subscriptionId = createId('sub');
    const currentPeriodEndAt = ts + cycleDurationMs(billingCycle);

    cancelActiveSubscriptions(args.userId, ts);
    upsertBillingCustomer({
      userId: args.userId,
      email: checkoutEmail || sanitizeEmail(authUser.email),
      billingCycle,
      now: ts,
    });
    insertSubscription({
      subscriptionId,
      userId: args.userId,
      planKey,
      billingCycle,
      amountCents,
      startedAt: ts,
      currentPeriodEndAt,
      checkoutSessionId: args.sessionId,
      metadataJson: JSON.stringify({ source: 'checkout_session' }),
    });
    completeCheckoutSessionRow({
      userId: args.userId,
      sessionId: args.sessionId,
      email: checkoutEmail || sanitizeEmail(authUser.email),
      paymentMethodLast4,
      subscriptionId,
      completedAt: ts,
    });

    return {
      ok: true,
      session: mapCheckout(readCheckoutSession(args.userId, args.sessionId)),
      subscription: mapSubscription(readLatestSubscription(args.userId)),
    };
  });

  if (!transactionResult.ok) {
    return transactionResult;
  }

  return {
    ok: true,
    session: transactionResult.session,
    subscription: transactionResult.subscription,
    state: getBillingState(args.userId),
  };
}

export function cancelBillingSubscription(args: {
  userId: string;
}): BillingResult<{ state: BillingState }> | BillingFailure {
  if (isGuestUser(args.userId)) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }
  ensureBillingSchema();

  const authUser = getAuthUser(args.userId);
  if (!authUser) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }

  runBillingTransaction(() => {
    cancelActiveSubscriptions(args.userId, nowMs());
  });

  return {
    ok: true,
    state: getBillingState(args.userId),
  };
}

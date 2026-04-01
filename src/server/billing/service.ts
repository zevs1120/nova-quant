import { randomBytes } from 'node:crypto';
import { getMembershipPriceCents, normalizeMembershipPlan } from '../../utils/membership.js';
import {
  createStripeCheckoutSession,
  createStripePortalSession,
  readBillingProviderConfig,
  resolveStripePriceId,
  verifyStripeWebhookEvent,
  type BillingProviderMode,
} from './provider.js';
import { quotePgIdentifier } from '../db/postgresSql.js';
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
const BILLING_PROVIDER = 'stripe';
const BILLING_CURRENCY = 'USD';
const BILLING_CYCLE_CHECK_SQL = "('weekly', 'monthly', 'annual')";

export type BillingPlan = 'free' | 'lite' | 'pro';
export type BillingCycle = 'weekly' | 'monthly' | 'annual';
export type BillingSubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PENDING';
export type BillingCheckoutStatus = 'OPEN' | 'COMPLETED' | 'EXPIRED' | 'ABANDONED';
export type BillingErrorCode =
  | 'AUTH_REQUIRED'
  | 'PLAN_NOT_SUPPORTED'
  | 'BILLING_PROVIDER_NOT_CONFIGURED'
  | 'BILLING_PORTAL_UNAVAILABLE'
  | 'BILLING_WEBHOOK_INVALID'
  | 'CHECKOUT_COMPLETION_DISABLED'
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
  providerMode: BillingProviderMode;
  checkoutConfigured: boolean;
  portalConfigured: boolean;
  currentPlan: BillingPlan;
  customer: {
    email: string;
    provider: string;
    providerCustomerId: string | null;
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
    provider: string;
    providerSessionId: string | null;
    billingCycle: BillingCycle;
    amountCents: number;
    currency: string;
    checkoutUrl: string | null;
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
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'annual') return 'annual';
  if (normalized === 'monthly') return 'monthly';
  return 'weekly';
}

function normalizeBillingPlan(value: unknown): BillingPlan {
  return normalizeMembershipPlan(value) as BillingPlan;
}

function isGuestUser(userId: string | null | undefined) {
  const normalized = String(userId || '').trim();
  return !normalized || normalized.startsWith('guest-');
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

function getBillingProviderMode() {
  return readBillingProviderConfig().mode;
}

function parseMetadataJson<T extends Record<string, unknown>>(value: unknown): T {
  if (!value) return {} as T;
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function billingTable(tableName: string) {
  return qualifyBusinessTable(tableName);
}

function buildPgBillingSchemaSql() {
  const schemaName = quotePgIdentifier(getPostgresBusinessSchema());
  const customerTable = billingTable('billing_customers');
  const checkoutTable = billingTable('billing_checkout_sessions');
  const subscriptionTable = billingTable('billing_subscriptions');
  const webhookTable = billingTable('billing_webhook_events');
  return [
    `CREATE SCHEMA IF NOT EXISTS ${schemaName};`,
    `CREATE TABLE IF NOT EXISTS ${customerTable} (
      user_id TEXT PRIMARY KEY REFERENCES auth_users(user_id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '${BILLING_PROVIDER}',
      provider_customer_id TEXT,
      default_currency TEXT NOT NULL DEFAULT '${BILLING_CURRENCY}',
      default_billing_cycle TEXT NOT NULL CHECK (default_billing_cycle IN ${BILLING_CYCLE_CHECK_SQL}),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_customers_email')} ON ${customerTable} (email);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_customers_user_id')} ON ${customerTable} (user_id);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_customers_provider_customer')} ON ${customerTable} (provider_customer_id);`,
    `CREATE TABLE IF NOT EXISTS ${checkoutTable} (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
      plan_key TEXT NOT NULL CHECK (plan_key IN ('lite', 'pro')),
      billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ${BILLING_CYCLE_CHECK_SQL}),
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
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_checkout_sessions_session_id')} ON ${checkoutTable} (session_id);`,
    `CREATE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_checkout_sessions_status')} ON ${checkoutTable} (status, expires_at_ms DESC);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_checkout_sessions_provider_session')} ON ${checkoutTable} (provider_session_id);`,
    `CREATE TABLE IF NOT EXISTS ${subscriptionTable} (
      subscription_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
      plan_key TEXT NOT NULL CHECK (plan_key IN ('free', 'lite', 'pro')),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING')),
      provider TEXT NOT NULL DEFAULT '${BILLING_PROVIDER}',
      provider_subscription_id TEXT,
      billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ${BILLING_CYCLE_CHECK_SQL}),
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
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_subscriptions_subscription_id')} ON ${subscriptionTable} (subscription_id);`,
    `CREATE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_subscriptions_status')} ON ${subscriptionTable} (user_id, status, updated_at_ms DESC);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_subscriptions_provider_subscription')} ON ${subscriptionTable} (provider_subscription_id);`,
    `CREATE TABLE IF NOT EXISTS ${webhookTable} (
      event_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      event_type TEXT NOT NULL,
      received_at_ms BIGINT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}'
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_webhook_events_event_id')} ON ${webhookTable} (event_id);`,
    `CREATE INDEX IF NOT EXISTS ${quotePgIdentifier('idx_billing_webhook_events_recent')} ON ${webhookTable} (received_at_ms DESC);`,
    `ALTER TABLE ${customerTable} DROP CONSTRAINT IF EXISTS billing_customers_default_billing_cycle_check;`,
    `ALTER TABLE ${customerTable} ADD CONSTRAINT billing_customers_default_billing_cycle_check CHECK (default_billing_cycle IN ${BILLING_CYCLE_CHECK_SQL});`,
    `ALTER TABLE ${checkoutTable} DROP CONSTRAINT IF EXISTS billing_checkout_sessions_billing_cycle_check;`,
    `ALTER TABLE ${checkoutTable} ADD CONSTRAINT billing_checkout_sessions_billing_cycle_check CHECK (billing_cycle IN ${BILLING_CYCLE_CHECK_SQL});`,
    `ALTER TABLE ${subscriptionTable} DROP CONSTRAINT IF EXISTS billing_subscriptions_billing_cycle_check;`,
    `ALTER TABLE ${subscriptionTable} ADD CONSTRAINT billing_subscriptions_billing_cycle_check CHECK (billing_cycle IN ${BILLING_CYCLE_CHECK_SQL});`,
  ];
}

function ensureBillingSchema() {
  if (pgBillingSchemaReady) return;
  buildPgBillingSchemaSql().forEach((sql) => executeSync(sql));
  pgBillingSchemaReady = true;
}

function runBillingTransaction<T>(callback: () => T): T {
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
  return queryRowSync<AuthUserRow>(
    'SELECT user_id, email, name FROM auth_users WHERE user_id = $1 LIMIT 1',
    [userId],
  );
}

function readBillingCustomer(userId: string) {
  ensureBillingSchema();
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

function readSubscriptionByProviderSubscriptionId(providerSubscriptionId: string) {
  if (!providerSubscriptionId) return null;
  ensureBillingSchema();
  return queryRowSync<BillingSubscriptionRow>(
    `SELECT subscription_id, user_id, plan_key, status, provider, provider_subscription_id, billing_cycle,
            amount_cents, currency, started_at_ms, current_period_start_ms, current_period_end_ms,
            cancel_at_period_end, cancelled_at_ms, checkout_session_id, metadata_json, created_at_ms, updated_at_ms
     FROM ${billingTable('billing_subscriptions')}
     WHERE provider_subscription_id = $1
     LIMIT 1`,
    [providerSubscriptionId],
  );
}

function readCheckoutSession(userId: string, sessionId: string, forUpdate = false) {
  ensureBillingSchema();
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

function readCheckoutSessionByProviderSessionId(providerSessionId: string) {
  if (!providerSessionId) return null;
  ensureBillingSchema();
  return queryRowSync<BillingCheckoutRow>(
    `SELECT session_id, user_id, plan_key, billing_cycle, status, provider, provider_session_id,
            amount_cents, currency, checkout_email, payment_method_last4, success_subscription_id,
            metadata_json, created_at_ms, expires_at_ms, completed_at_ms, updated_at_ms
     FROM ${billingTable('billing_checkout_sessions')}
     WHERE provider_session_id = $1
     LIMIT 1`,
    [providerSessionId],
  );
}

function markCheckoutExpired(userId: string, sessionId: string, ts: number) {
  ensureBillingSchema();
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
  provider?: string;
  providerCustomerId?: string | null;
}) {
  ensureBillingSchema();
  const metadataJson = JSON.stringify({});
  const provider = String(args.provider || BILLING_PROVIDER);
  const providerCustomerId = args.providerCustomerId || null;
  executeSync(
    `INSERT INTO ${billingTable('billing_customers')}(
      user_id, email, provider, provider_customer_id, default_currency, default_billing_cycle, metadata_json, created_at_ms, updated_at_ms
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      provider = EXCLUDED.provider,
      provider_customer_id = COALESCE(
        EXCLUDED.provider_customer_id,
        ${billingTable('billing_customers')}.provider_customer_id
      ),
      default_currency = EXCLUDED.default_currency,
      default_billing_cycle = EXCLUDED.default_billing_cycle,
      updated_at_ms = EXCLUDED.updated_at_ms`,
    [
      args.userId,
      args.email,
      provider,
      providerCustomerId,
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
  provider?: string;
  providerSessionId?: string | null;
  checkoutEmail?: string | null;
}) {
  ensureBillingSchema();
  const provider = String(args.provider || BILLING_PROVIDER);
  executeSync(
    `INSERT INTO ${billingTable('billing_checkout_sessions')}(
      session_id, user_id, plan_key, billing_cycle, status, provider, provider_session_id,
      amount_cents, currency, checkout_email, payment_method_last4, success_subscription_id,
      metadata_json, created_at_ms, expires_at_ms, completed_at_ms, updated_at_ms
    ) VALUES($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, NULL, NULL, $10, $11, $12, NULL, $13)`,
    [
      args.sessionId,
      args.userId,
      args.planKey,
      args.billingCycle,
      provider,
      args.providerSessionId || null,
      args.amountCents,
      BILLING_CURRENCY,
      args.checkoutEmail || null,
      args.metadataJson,
      args.now,
      args.expiresAt,
      args.now,
    ],
  );
}

function cancelActiveSubscriptions(userId: string, ts: number) {
  ensureBillingSchema();
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
  status?: BillingSubscriptionStatus;
  provider?: string;
  providerSubscriptionId?: string | null;
  billingCycle: BillingCycle;
  amountCents: number;
  startedAt: number;
  currentPeriodEndAt: number;
  checkoutSessionId: string | null;
  metadataJson: string;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: number | null;
}) {
  ensureBillingSchema();
  const provider = String(args.provider || BILLING_PROVIDER);
  const status = String(args.status || 'ACTIVE') as BillingSubscriptionStatus;
  executeSync(
    `INSERT INTO ${billingTable('billing_subscriptions')}(
      subscription_id, user_id, plan_key, status, provider, provider_subscription_id,
      billing_cycle, amount_cents, currency, started_at_ms, current_period_start_ms,
      current_period_end_ms, cancel_at_period_end, cancelled_at_ms, checkout_session_id,
      metadata_json, created_at_ms, updated_at_ms
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      args.subscriptionId,
      args.userId,
      args.planKey,
      status,
      provider,
      args.providerSubscriptionId || null,
      args.billingCycle,
      args.amountCents,
      BILLING_CURRENCY,
      args.startedAt,
      args.startedAt,
      args.currentPeriodEndAt,
      args.cancelAtPeriodEnd ? 1 : 0,
      args.cancelledAt || null,
      args.checkoutSessionId || null,
      args.metadataJson,
      args.startedAt,
      args.startedAt,
    ],
  );
}

function updateCheckoutSessionFromProvider(args: {
  sessionId: string;
  userId: string;
  provider?: string;
  providerSessionId?: string | null;
  checkoutEmail?: string | null;
  checkoutUrl?: string | null;
  status?: BillingCheckoutStatus;
  subscriptionId?: string | null;
  paymentMethodLast4?: string | null;
  completedAt?: number | null;
  updatedAt: number;
}) {
  const existing = readCheckoutSession(args.userId, args.sessionId);
  if (!existing) return;
  const metadata = parseMetadataJson<Record<string, unknown>>(existing.metadata_json);
  if (args.checkoutUrl) {
    metadata.checkout_url = args.checkoutUrl;
  }
  const metadataJson = JSON.stringify(metadata);
  const provider = String(args.provider || existing.provider || BILLING_PROVIDER);
  const status = String(args.status || existing.status || 'OPEN') as BillingCheckoutStatus;
  executeSync(
    `UPDATE ${billingTable('billing_checkout_sessions')}
     SET provider = $1,
         provider_session_id = COALESCE($2, provider_session_id),
         status = $3,
         checkout_email = COALESCE($4, checkout_email),
         payment_method_last4 = COALESCE($5, payment_method_last4),
         success_subscription_id = COALESCE($6, success_subscription_id),
         metadata_json = $7,
         completed_at_ms = COALESCE($8, completed_at_ms),
         updated_at_ms = $9
     WHERE session_id = $10 AND user_id = $11`,
    [
      provider,
      args.providerSessionId || null,
      status,
      args.checkoutEmail || null,
      args.paymentMethodLast4 || null,
      args.subscriptionId || null,
      metadataJson,
      args.completedAt || null,
      args.updatedAt,
      args.sessionId,
      args.userId,
    ],
  );
}

function upsertSubscriptionFromProvider(args: {
  provider: string;
  providerSubscriptionId: string;
  userId: string;
  planKey: BillingPlan;
  status: BillingSubscriptionStatus;
  billingCycle: BillingCycle;
  amountCents: number;
  startedAt: number;
  currentPeriodStartAt: number;
  currentPeriodEndAt: number | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: number | null;
  checkoutSessionId: string | null;
  metadataJson: string;
}) {
  ensureBillingSchema();
  const existing = readSubscriptionByProviderSubscriptionId(args.providerSubscriptionId);
  if (!existing) {
    insertSubscription({
      subscriptionId: createId('sub'),
      userId: args.userId,
      planKey: args.planKey,
      status: args.status,
      provider: args.provider,
      providerSubscriptionId: args.providerSubscriptionId,
      billingCycle: args.billingCycle,
      amountCents: args.amountCents,
      startedAt: args.startedAt,
      currentPeriodEndAt: args.currentPeriodEndAt || args.startedAt,
      checkoutSessionId: args.checkoutSessionId,
      metadataJson: args.metadataJson,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      cancelledAt: args.cancelledAt,
    });
    return;
  }
  executeSync(
    `UPDATE ${billingTable('billing_subscriptions')}
     SET user_id = $1,
         plan_key = $2,
         status = $3,
         provider = $4,
         billing_cycle = $5,
         amount_cents = $6,
         currency = $7,
         started_at_ms = $8,
         current_period_start_ms = $9,
         current_period_end_ms = $10,
         cancel_at_period_end = $11,
         cancelled_at_ms = $12,
         checkout_session_id = $13,
         metadata_json = $14,
         updated_at_ms = $15
     WHERE provider_subscription_id = $16`,
    [
      args.userId,
      args.planKey,
      args.status,
      args.provider,
      args.billingCycle,
      args.amountCents,
      BILLING_CURRENCY,
      args.startedAt,
      args.currentPeriodStartAt,
      args.currentPeriodEndAt,
      args.cancelAtPeriodEnd ? 1 : 0,
      args.cancelledAt,
      args.checkoutSessionId,
      args.metadataJson,
      nowMs(),
      args.providerSubscriptionId,
    ],
  );
}

function hasProcessedWebhookEvent(eventId: string) {
  if (!eventId) return false;
  ensureBillingSchema();
  return Boolean(
    queryRowSync<{ event_id: string }>(
      `SELECT event_id FROM ${billingTable('billing_webhook_events')} WHERE event_id = $1 LIMIT 1`,
      [eventId],
    )?.event_id,
  );
}

function recordWebhookEvent(
  eventId: string,
  eventType: string,
  provider: string,
  payloadJson: string,
) {
  ensureBillingSchema();
  const ts = nowMs();
  executeSync(
    `INSERT INTO ${billingTable('billing_webhook_events')}(event_id, provider, event_type, received_at_ms, payload_json)
     VALUES($1, $2, $3, $4, $5)
     ON CONFLICT(event_id) DO NOTHING`,
    [eventId, provider, eventType, ts, payloadJson],
  );
}

function mapCustomer(row: BillingCustomerRow | null) {
  if (!row) return null;
  return {
    email: String(row.email || ''),
    provider: String(row.provider || BILLING_PROVIDER),
    providerCustomerId: row.provider_customer_id ? String(row.provider_customer_id) : null,
    defaultCurrency: String(row.default_currency || BILLING_CURRENCY),
    defaultBillingCycle: normalizeBillingCycle(row.default_billing_cycle),
  };
}

function mapCheckout(row: BillingCheckoutRow | null): BillingCheckoutSession {
  if (!row) return null;
  const metadata = parseMetadataJson<Record<string, unknown>>(row.metadata_json);
  return {
    id: row.session_id,
    planKey: normalizeBillingPlan(row.plan_key),
    status: String(row.status || 'OPEN') as BillingCheckoutStatus,
    provider: String(row.provider || BILLING_PROVIDER),
    providerSessionId: row.provider_session_id ? String(row.provider_session_id) : null,
    billingCycle: normalizeBillingCycle(row.billing_cycle),
    amountCents: Number(row.amount_cents || 0),
    currency: String(row.currency || BILLING_CURRENCY),
    checkoutUrl: metadata.checkout_url ? String(metadata.checkout_url) : null,
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
  const providerMode = getBillingProviderMode();
  return {
    available: authenticated,
    authenticated,
    providerMode,
    checkoutConfigured: providerMode === 'stripe',
    portalConfigured: providerMode === 'stripe',
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
  const providerMode = getBillingProviderMode();

  const customer = readBillingCustomer(userId);
  const latestSubscription = readLatestSubscription(userId);
  const latestCheckout = expireCheckoutIfNeeded(userId, readLatestCheckout(userId));
  const normalizedSubscription = mapSubscription(latestSubscription);

  return {
    available: true,
    authenticated: true,
    providerMode,
    checkoutConfigured: providerMode === 'stripe',
    portalConfigured: providerMode === 'stripe' && Boolean(customer?.provider_customer_id),
    currentPlan:
      normalizedSubscription?.status === 'ACTIVE'
        ? normalizeBillingPlan(normalizedSubscription.planKey)
        : 'free',
    customer: mapCustomer(customer),
    subscription: normalizedSubscription,
    latestCheckout: mapCheckout(latestCheckout),
  };
}

export async function createBillingCheckoutSession(args: {
  userId: string;
  planKey: string;
  billingCycle?: string;
  source?: string | null;
  locale?: string | null;
}): Promise<
  BillingResult<{ session: BillingCheckoutSession; state: BillingState }> | BillingFailure
> {
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

  const providerConfig = readBillingProviderConfig();
  const existingCustomer = readBillingCustomer(args.userId);
  const ts = nowMs();
  const sessionId = createId('chk');
  const expiresAt = ts + CHECKOUT_TTL_MS;
  const checkoutEmail = sanitizeEmail(authUser.email);

  if (providerConfig.mode !== 'stripe') {
    return { ok: false, error: 'BILLING_PROVIDER_NOT_CONFIGURED' };
  }
  const priceId = resolveStripePriceId(providerConfig, planKey, billingCycle);
  if (!priceId) {
    return { ok: false, error: 'BILLING_PROVIDER_NOT_CONFIGURED' };
  }
  const stripeSession = await createStripeCheckoutSession(providerConfig, {
    localSessionId: sessionId,
    userId: args.userId,
    planKey,
    billingCycle,
    priceId,
    customerId: existingCustomer?.provider_customer_id || null,
    customerEmail: checkoutEmail,
    source: args.source,
    locale: args.locale,
  });
  const metadataJson = JSON.stringify({
    source: args.source || null,
    locale: args.locale || null,
    checkout_url: stripeSession.url || null,
    price_id: priceId,
  });
  upsertBillingCustomer({
    userId: args.userId,
    email: checkoutEmail,
    billingCycle,
    now: ts,
    provider: 'stripe',
    providerCustomerId: stripeSession.customer || existingCustomer?.provider_customer_id || null,
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
    provider: 'stripe',
    providerSessionId: stripeSession.id,
    checkoutEmail,
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
  void args.sessionId;
  void args.billingEmail;
  void args.paymentMethodLast4;
  return { ok: false, error: 'CHECKOUT_COMPLETION_DISABLED' };
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
  const latestSubscription = readLatestSubscription(args.userId);
  if (latestSubscription && String(latestSubscription.provider || '').toLowerCase() === 'stripe') {
    return { ok: false, error: 'BILLING_PORTAL_UNAVAILABLE' };
  }

  runBillingTransaction(() => {
    cancelActiveSubscriptions(args.userId, nowMs());
  });

  return {
    ok: true,
    state: getBillingState(args.userId),
  };
}

function stripeTimestampToMs(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next * 1000 : null;
}

function normalizeStripeInterval(value: unknown): BillingCycle {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'year') return 'annual';
  if (normalized === 'month') return 'monthly';
  // Stripe uses 'week' (not 'weekly') as the interval value for weekly plans.
  if (normalized === 'week') return 'weekly';
  // Unknown intervals (e.g. 'day', empty string) fall back to 'monthly' — safer
  // than 'weekly' because it avoids misclassifying higher-value subscriptions.
  return 'monthly';
}

function normalizeStripeSubscriptionStatus(value: unknown): BillingSubscriptionStatus {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'active' || normalized === 'trialing') return 'ACTIVE';
  if (normalized === 'canceled') return 'CANCELLED';
  if (normalized === 'incomplete_expired') return 'EXPIRED';
  return 'PENDING';
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function handleStripeCheckoutLifecycleEvent(
  object: Record<string, unknown>,
  status: BillingCheckoutStatus,
) {
  const metadata = asRecord(object.metadata);
  const sessionId = String(
    metadata.local_checkout_session_id || object.client_reference_id || '',
  ).trim();
  const userId = String(metadata.user_id || '').trim();
  if (!sessionId || !userId) return;
  const providerSessionId = String(object.id || '').trim();
  const customerDetails = asRecord(object.customer_details);
  const authUser = getAuthUser(userId);
  const checkoutEmail = sanitizeEmail(
    customerDetails.email,
    String(object.customer_email || authUser?.email || ''),
  );
  updateCheckoutSessionFromProvider({
    sessionId,
    userId,
    provider: 'stripe',
    providerSessionId: providerSessionId || null,
    checkoutEmail: checkoutEmail || null,
    status,
    updatedAt: nowMs(),
  });
  if (checkoutEmail || object.customer) {
    upsertBillingCustomer({
      userId,
      email: checkoutEmail,
      billingCycle: normalizeBillingCycle(metadata.billing_cycle),
      now: nowMs(),
      provider: 'stripe',
      providerCustomerId: object.customer ? String(object.customer) : null,
    });
  }
}

function handleStripeSubscriptionEvent(object: Record<string, unknown>) {
  const metadata = asRecord(object.metadata);
  const providerSubscriptionId = String(object.id || '').trim();
  if (!providerSubscriptionId) return;

  const existing = readSubscriptionByProviderSubscriptionId(providerSubscriptionId);
  const checkoutSessionId = String(
    metadata.local_checkout_session_id || existing?.checkout_session_id || '',
  ).trim();
  const userId = String(metadata.user_id || existing?.user_id || '').trim();
  if (!userId) return;
  const billingCustomer = readBillingCustomer(userId);
  const authUser = getAuthUser(userId);

  const items = asRecord(object.items);
  const data = Array.isArray(items.data) ? items.data : [];
  const firstItem = asRecord(data[0]);
  const price = asRecord(firstItem.price);
  const plan = asRecord(object.plan);
  const recurring = asRecord(price.recurring);
  const amountCents = Number(price.unit_amount ?? plan.amount ?? existing?.amount_cents ?? 0);
  const billingCycle = normalizeBillingCycle(
    metadata.billing_cycle || normalizeStripeInterval(recurring.interval),
  );
  const planKey = normalizeBillingPlan(
    // Priority 1: explicit plan_key in Stripe subscription metadata (set at checkout time)
    // Priority 2: existing local subscription record's plan_key (handles upgrades/renewals)
    // Priority 3: never infer from amountCents alone — prices vary by cycle and region,
    //             so a monthly Pro price can be lower than a weekly Lite price.
    //             Fall back to 'lite' as the safer default rather than misgranting Pro access.
    metadata.plan_key || existing?.plan_key || 'lite',
  );
  const status = normalizeStripeSubscriptionStatus(object.status);
  const startedAt = stripeTimestampToMs(object.start_date || object.created) || nowMs();
  const currentPeriodStartAt =
    stripeTimestampToMs(object.current_period_start || object.start_date || object.created) ||
    startedAt;
  const currentPeriodEndAt = stripeTimestampToMs(object.current_period_end);
  const cancelAtPeriodEnd = asBoolean(object.cancel_at_period_end);
  const cancelledAt = stripeTimestampToMs(object.canceled_at);
  if (object.customer) {
    upsertBillingCustomer({
      userId,
      email: sanitizeEmail(billingCustomer?.email, authUser?.email || ''),
      billingCycle,
      now: nowMs(),
      provider: 'stripe',
      providerCustomerId: String(object.customer),
    });
  }

  if (status === 'ACTIVE') {
    cancelActiveSubscriptions(userId, nowMs());
  }
  upsertSubscriptionFromProvider({
    provider: 'stripe',
    providerSubscriptionId,
    userId,
    planKey,
    status,
    billingCycle,
    amountCents,
    startedAt,
    currentPeriodStartAt,
    currentPeriodEndAt,
    cancelAtPeriodEnd,
    cancelledAt,
    checkoutSessionId: checkoutSessionId || null,
    metadataJson: JSON.stringify(metadata),
  });
  const savedSubscription = readSubscriptionByProviderSubscriptionId(providerSubscriptionId);
  if (checkoutSessionId) {
    updateCheckoutSessionFromProvider({
      sessionId: checkoutSessionId,
      userId,
      provider: 'stripe',
      status: status === 'ACTIVE' ? 'COMPLETED' : 'OPEN',
      subscriptionId: savedSubscription?.subscription_id || null,
      completedAt: status === 'ACTIVE' ? nowMs() : null,
      updatedAt: nowMs(),
    });
  }
}

export async function createBillingPortalSession(args: {
  userId: string;
  returnUrl?: string | null;
}): Promise<BillingResult<{ url: string; state: BillingState }> | BillingFailure> {
  if (isGuestUser(args.userId)) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }
  ensureBillingSchema();
  const authUser = getAuthUser(args.userId);
  if (!authUser) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }
  const providerConfig = readBillingProviderConfig();
  const customer = readBillingCustomer(args.userId);
  if (
    providerConfig.mode !== 'stripe' ||
    !customer?.provider_customer_id ||
    String(customer.provider || '').toLowerCase() !== 'stripe'
  ) {
    return { ok: false, error: 'BILLING_PORTAL_UNAVAILABLE' };
  }
  const portalSession = await createStripePortalSession(providerConfig, {
    customerId: customer.provider_customer_id,
    returnUrl: args.returnUrl || null,
  });
  if (!portalSession.url) {
    return { ok: false, error: 'BILLING_PORTAL_UNAVAILABLE' };
  }
  return {
    ok: true,
    url: portalSession.url,
    state: getBillingState(args.userId),
  };
}

export function processBillingWebhook(args: {
  signature: string;
  rawBody: string;
}): BillingResult<{ received: true }> | BillingFailure {
  const providerConfig = readBillingProviderConfig();
  if (providerConfig.mode !== 'stripe' || !providerConfig.stripeWebhookSecret) {
    return { ok: false, error: 'BILLING_PROVIDER_NOT_CONFIGURED' };
  }
  let event: ReturnType<typeof verifyStripeWebhookEvent>;
  try {
    event = verifyStripeWebhookEvent(
      args.rawBody,
      args.signature,
      providerConfig.stripeWebhookSecret,
    );
  } catch {
    return { ok: false, error: 'BILLING_WEBHOOK_INVALID' };
  }
  if (!event?.id || !event?.type) {
    return { ok: false, error: 'BILLING_WEBHOOK_INVALID' };
  }
  if (hasProcessedWebhookEvent(event.id)) {
    return { ok: true, received: true };
  }

  const payloadJson = JSON.stringify(event);
  runBillingTransaction(() => {
    recordWebhookEvent(event.id, event.type, 'stripe', payloadJson);
    const object = asRecord(event.data?.object);
    if (event.type === 'checkout.session.completed') {
      handleStripeCheckoutLifecycleEvent(object, 'COMPLETED');
      return;
    }
    if (event.type === 'checkout.session.expired') {
      handleStripeCheckoutLifecycleEvent(object, 'EXPIRED');
      return;
    }
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      handleStripeSubscriptionEvent(object);
    }
  });

  return { ok: true, received: true };
}

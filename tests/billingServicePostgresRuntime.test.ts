import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDb = vi.fn(() => {
  throw new Error('SQLITE_SHOULD_NOT_RUN');
});
const mockQueryRowSync = vi.fn();
const mockExecuteSync = vi.fn();
const mockBeginTransactionSync = vi.fn();
const mockCommitTransactionSync = vi.fn();
const mockRollbackTransactionSync = vi.fn();

vi.mock('../src/server/db/database.js', () => ({
  getDb: mockGetDb,
}));

vi.mock('../src/server/db/schema.js', () => ({
  ensureSchema: vi.fn(),
}));

vi.mock('../src/server/db/postgresSyncBridge.js', () => ({
  beginTransactionSync: mockBeginTransactionSync,
  commitTransactionSync: mockCommitTransactionSync,
  executeSync: mockExecuteSync,
  getPostgresBusinessSchema: () => 'novaquant_data',
  qualifyBusinessTable: (tableName: string) => `"novaquant_data"."${tableName}"`,
  queryRowSync: mockQueryRowSync,
  rollbackTransactionSync: mockRollbackTransactionSync,
}));

describe('billing service in postgres runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'postgres');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('creates a persisted checkout session without sqlite fallback', async () => {
    mockQueryRowSync.mockImplementation((sql: string) => {
      if (sql.includes('FROM auth_users')) {
        return {
          user_id: 'usr_billing_pg',
          email: 'billing@novaquant.cloud',
          name: 'Billing User',
        };
      }
      if (
        sql.includes('FROM "novaquant_data"."billing_checkout_sessions"') &&
        sql.includes('session_id = $1')
      ) {
        return {
          session_id: 'chk_123',
          user_id: 'usr_billing_pg',
          plan_key: 'lite',
          billing_cycle: 'monthly',
          status: 'OPEN',
          provider: 'internal_checkout',
          provider_session_id: null,
          amount_cents: 1900,
          currency: 'USD',
          checkout_email: 'billing@novaquant.cloud',
          payment_method_last4: null,
          success_subscription_id: null,
          metadata_json: '{}',
          created_at_ms: 1_700_000_000_000,
          expires_at_ms: 1_700_000_180_000,
          completed_at_ms: null,
          updated_at_ms: 1_700_000_000_000,
        };
      }
      if (sql.includes('FROM "novaquant_data"."billing_customers"')) {
        return {
          user_id: 'usr_billing_pg',
          email: 'billing@novaquant.cloud',
          provider: 'internal_checkout',
          provider_customer_id: null,
          default_currency: 'USD',
          default_billing_cycle: 'monthly',
          created_at_ms: 1_700_000_000_000,
          updated_at_ms: 1_700_000_000_000,
        };
      }
      if (sql.includes('FROM "novaquant_data"."billing_subscriptions"')) {
        return null;
      }
      if (
        sql.includes('FROM "novaquant_data"."billing_checkout_sessions"') &&
        sql.includes('ORDER BY created_at_ms DESC')
      ) {
        return {
          session_id: 'chk_123',
          user_id: 'usr_billing_pg',
          plan_key: 'lite',
          billing_cycle: 'monthly',
          status: 'OPEN',
          provider: 'internal_checkout',
          provider_session_id: null,
          amount_cents: 1900,
          currency: 'USD',
          checkout_email: 'billing@novaquant.cloud',
          payment_method_last4: null,
          success_subscription_id: null,
          metadata_json: '{}',
          created_at_ms: 1_700_000_000_000,
          expires_at_ms: 1_700_000_180_000,
          completed_at_ms: null,
          updated_at_ms: 1_700_000_000_000,
        };
      }
      return null;
    });

    const { createBillingCheckoutSession } = await import('../src/server/billing/service.js');
    const result = await createBillingCheckoutSession({
      userId: 'usr_billing_pg',
      planKey: 'lite',
      billingCycle: 'monthly',
      source: 'membership_center',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session?.planKey).toBe('lite');
      expect(result.state.currentPlan).toBe('free');
    }
    expect(mockExecuteSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "novaquant_data"."billing_checkout_sessions"'),
      expect.any(Array),
    );
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('completes checkout into an active subscription without sqlite fallback', async () => {
    let customerUpserted = false;
    let subscriptionCreated = false;
    let checkoutCompleted = false;

    mockExecuteSync.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO "novaquant_data"."billing_customers"')) {
        customerUpserted = true;
      }
      if (sql.includes('INSERT INTO "novaquant_data"."billing_subscriptions"')) {
        subscriptionCreated = true;
      }
      if (sql.includes('UPDATE "novaquant_data"."billing_checkout_sessions"')) {
        checkoutCompleted = true;
      }
    });

    mockQueryRowSync.mockImplementation((sql: string) => {
      if (sql.includes('FROM auth_users')) {
        return {
          user_id: 'usr_billing_pg',
          email: 'billing@novaquant.cloud',
          name: 'Billing User',
        };
      }
      if (sql.includes('FROM "novaquant_data"."billing_customers"')) {
        return customerUpserted
          ? {
              user_id: 'usr_billing_pg',
              email: 'billing@novaquant.cloud',
              provider: 'internal_checkout',
              provider_customer_id: null,
              default_currency: 'USD',
              default_billing_cycle: 'monthly',
              created_at_ms: 1_700_000_000_000,
              updated_at_ms: 1_700_000_000_000,
            }
          : null;
      }
      if (
        sql.includes('FROM "novaquant_data"."billing_checkout_sessions"') &&
        sql.includes('session_id = $1')
      ) {
        return {
          session_id: 'chk_live',
          user_id: 'usr_billing_pg',
          plan_key: 'pro',
          billing_cycle: 'monthly',
          status: checkoutCompleted ? 'COMPLETED' : 'OPEN',
          provider: 'internal_checkout',
          provider_session_id: null,
          amount_cents: 4900,
          currency: 'USD',
          checkout_email: 'billing@novaquant.cloud',
          payment_method_last4: checkoutCompleted ? '4242' : null,
          success_subscription_id: checkoutCompleted ? 'sub_live' : null,
          metadata_json: '{}',
          created_at_ms: 1_700_000_000_000,
          expires_at_ms: Date.now() + 60_000,
          completed_at_ms: checkoutCompleted ? Date.now() : null,
          updated_at_ms: Date.now(),
        };
      }
      if (sql.includes('FROM "novaquant_data"."billing_subscriptions"')) {
        return subscriptionCreated
          ? {
              subscription_id: 'sub_live',
              user_id: 'usr_billing_pg',
              plan_key: 'pro',
              status: 'ACTIVE',
              provider: 'internal_checkout',
              provider_subscription_id: null,
              billing_cycle: 'monthly',
              amount_cents: 4900,
              currency: 'USD',
              started_at_ms: Date.now(),
              current_period_start_ms: Date.now(),
              current_period_end_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
              cancel_at_period_end: 0,
              cancelled_at_ms: null,
              checkout_session_id: 'chk_live',
              metadata_json: '{}',
              created_at_ms: Date.now(),
              updated_at_ms: Date.now(),
            }
          : null;
      }
      if (
        sql.includes('FROM "novaquant_data"."billing_checkout_sessions"') &&
        sql.includes('ORDER BY created_at_ms DESC')
      ) {
        return checkoutCompleted
          ? {
              session_id: 'chk_live',
              user_id: 'usr_billing_pg',
              plan_key: 'pro',
              billing_cycle: 'monthly',
              status: 'COMPLETED',
              provider: 'internal_checkout',
              provider_session_id: null,
              amount_cents: 4900,
              currency: 'USD',
              checkout_email: 'billing@novaquant.cloud',
              payment_method_last4: '4242',
              success_subscription_id: 'sub_live',
              metadata_json: '{}',
              created_at_ms: 1_700_000_000_000,
              expires_at_ms: Date.now() + 60_000,
              completed_at_ms: Date.now(),
              updated_at_ms: Date.now(),
            }
          : null;
      }
      return null;
    });

    const { completeBillingCheckoutSession } = await import('../src/server/billing/service.js');
    const result = completeBillingCheckoutSession({
      userId: 'usr_billing_pg',
      sessionId: 'chk_live',
      billingEmail: 'billing@novaquant.cloud',
      paymentMethodLast4: '4242',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subscription?.status).toBe('ACTIVE');
      expect(result.state.currentPlan).toBe('pro');
    }
    expect(mockBeginTransactionSync).toHaveBeenCalledTimes(1);
    expect(mockCommitTransactionSync).toHaveBeenCalledTimes(1);
    expect(mockRollbackTransactionSync).not.toHaveBeenCalled();
    expect(mockExecuteSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "novaquant_data"."billing_subscriptions"'),
      expect.any(Array),
    );
    expect(mockGetDb).not.toHaveBeenCalled();
  });
});

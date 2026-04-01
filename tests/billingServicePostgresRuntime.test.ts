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
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_123');
    vi.stubEnv('STRIPE_PRICE_LITE_WEEKLY', 'price_lite_weekly');
    vi.stubEnv('STRIPE_PRICE_PRO_WEEKLY', 'price_pro_weekly');
    vi.stubEnv('NOVA_APP_URL', 'https://app.novaquant.cloud');
    vi.stubEnv('STRIPE_PORTAL_RETURN_URL', 'https://app.novaquant.cloud');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('creates a Stripe checkout session without sqlite fallback', async () => {
    let customerUpserted = false;
    let checkoutInserted = false;

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.test/session/cs_test_123',
          customer: 'cus_test_123',
          subscription: null,
          payment_status: 'unpaid',
          status: 'open',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    mockExecuteSync.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO "novaquant_data"."billing_customers"')) {
        customerUpserted = true;
      }
      if (sql.includes('INSERT INTO "novaquant_data"."billing_checkout_sessions"')) {
        checkoutInserted = true;
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
              provider: 'stripe',
              provider_customer_id: 'cus_test_123',
              default_currency: 'USD',
              default_billing_cycle: 'weekly',
              created_at_ms: 1_700_000_000_000,
              updated_at_ms: 1_700_000_000_000,
            }
          : null;
      }
      if (sql.includes('FROM "novaquant_data"."billing_subscriptions"')) {
        return null;
      }
      if (sql.includes('FROM "novaquant_data"."billing_checkout_sessions"')) {
        return checkoutInserted
          ? {
              session_id: 'chk_123',
              user_id: 'usr_billing_pg',
              plan_key: 'lite',
              billing_cycle: 'weekly',
              status: 'OPEN',
              provider: 'stripe',
              provider_session_id: 'cs_test_123',
              amount_cents: 1900,
              currency: 'USD',
              checkout_email: 'billing@novaquant.cloud',
              payment_method_last4: null,
              success_subscription_id: null,
              metadata_json:
                '{"checkout_url":"https://checkout.stripe.test/session/cs_test_123","price_id":"price_lite_weekly"}',
              created_at_ms: 1_700_000_000_000,
              expires_at_ms: 1_700_000_180_000,
              completed_at_ms: null,
              updated_at_ms: 1_700_000_000_000,
            }
          : null;
      }
      return null;
    });

    const { createBillingCheckoutSession } = await import('../src/server/billing/service.js');
    const result = await createBillingCheckoutSession({
      userId: 'usr_billing_pg',
      planKey: 'lite',
      billingCycle: 'weekly',
      source: 'membership_center',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session?.provider).toBe('stripe');
      expect(result.session?.providerSessionId).toBe('cs_test_123');
      expect(result.session?.checkoutUrl).toBe('https://checkout.stripe.test/session/cs_test_123');
      expect(result.state.providerMode).toBe('stripe');
      expect(result.state.portalConfigured).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockExecuteSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "novaquant_data"."billing_checkout_sessions"'),
      expect.any(Array),
    );
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('disables manual checkout completion in postgres runtime', async () => {
    const { completeBillingCheckoutSession } = await import('../src/server/billing/service.js');

    expect(
      completeBillingCheckoutSession({
        userId: 'usr_billing_pg',
        sessionId: 'chk_live',
        billingEmail: 'billing@novaquant.cloud',
        paymentMethodLast4: '4242',
      }),
    ).toEqual({
      ok: false,
      error: 'CHECKOUT_COMPLETION_DISABLED',
    });
    expect(mockGetDb).not.toHaveBeenCalled();
    expect(mockBeginTransactionSync).not.toHaveBeenCalled();
    expect(mockCommitTransactionSync).not.toHaveBeenCalled();
    expect(mockRollbackTransactionSync).not.toHaveBeenCalled();
  });
});

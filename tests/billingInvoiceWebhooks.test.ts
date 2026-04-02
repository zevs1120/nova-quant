import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function signStripePayload(
  payload: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

const WEBHOOK_SECRET = 'whsec_invoice_test';
const USER_ID = 'usr_invoice_test';
const PROVIDER_SUB_ID = 'sub_invoice_test_456';
const PROVIDER_CUSTOMER_ID = 'cus_invoice_test_456';

describe('invoice.paid — refreshes period and re-asserts ACTIVE', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_invoice');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
    vi.stubEnv('STRIPE_PRICE_LITE_WEEKLY', 'price_lite_weekly');
    vi.stubEnv('STRIPE_PRICE_PRO_WEEKLY', 'price_pro_weekly');
    vi.stubEnv('NOVA_APP_URL', 'https://app.novaquant.cloud');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('updates current_period_end and re-asserts ACTIVE on renewal payment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'cs_invoice_test',
              url: 'https://checkout.stripe.test/cs_invoice',
              customer: PROVIDER_CUSTOMER_ID,
              subscription: null,
              payment_status: 'unpaid',
              status: 'open',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const { pgInsertUserWithState } = await import('../src/server/auth/postgresStore.js');
    const now = Date.now();
    await pgInsertUserWithState({
      user: {
        user_id: USER_ID,
        email: 'invoice@novaquant.cloud',
        password_hash: 'hash',
        name: 'Invoice User',
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
    });

    const { createBillingCheckoutSession, getBillingState, processBillingWebhook } =
      await import('../src/server/billing/service.js');

    // 1. Create checkout
    const checkout = await createBillingCheckoutSession({
      userId: USER_ID,
      planKey: 'lite',
      billingCycle: 'weekly',
    });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;

    // 2. Activate subscription via subscription webhook (first billing period)
    const firstPeriodEnd = 1_710_604_800; // week 1 end
    const subCreatedPayload = JSON.stringify({
      id: 'evt_sub_created_invoice_test',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: PROVIDER_SUB_ID,
          customer: PROVIDER_CUSTOMER_ID,
          status: 'active',
          start_date: 1_710_000_000,
          current_period_start: 1_710_000_000,
          current_period_end: firstPeriodEnd,
          cancel_at_period_end: false,
          metadata: {
            local_checkout_session_id: checkout.session?.id,
            user_id: USER_ID,
            plan_key: 'lite',
            billing_cycle: 'weekly',
          },
          items: { data: [{ price: { unit_amount: 1900, recurring: { interval: 'week' } } }] },
        },
      },
    });
    expect(
      processBillingWebhook({
        signature: signStripePayload(subCreatedPayload, WEBHOOK_SECRET),
        rawBody: subCreatedPayload,
      }),
    ).toEqual({ ok: true, received: true });

    const stateBefore = getBillingState(USER_ID);
    expect(stateBefore.subscription?.status).toBe('ACTIVE');
    expect(stateBefore.subscription?.currentPeriodEndAt).toBe(
      new Date(firstPeriodEnd * 1000).toISOString(),
    );

    // 3. Renewal: invoice.paid with next billing period
    const nextPeriodStart = firstPeriodEnd;
    const nextPeriodEnd = firstPeriodEnd + 7 * 24 * 3600; // week 2
    const invoicePaidPayload = JSON.stringify({
      id: 'evt_invoice_paid_test',
      type: 'invoice.paid',
      data: {
        object: {
          subscription: PROVIDER_SUB_ID,
          customer: PROVIDER_CUSTOMER_ID,
          period_start: nextPeriodStart,
          period_end: nextPeriodEnd,
          amount_paid: 1900,
          status: 'paid',
        },
      },
    });
    expect(
      processBillingWebhook({
        signature: signStripePayload(invoicePaidPayload, WEBHOOK_SECRET),
        rawBody: invoicePaidPayload,
      }),
    ).toEqual({ ok: true, received: true });

    const stateAfter = getBillingState(USER_ID);
    expect(stateAfter.currentPlan).toBe('lite');
    expect(stateAfter.subscription?.status).toBe('ACTIVE');
    // current_period_end_ms must have advanced to week 2
    expect(stateAfter.subscription?.currentPeriodEndAt).toBe(
      new Date(nextPeriodEnd * 1000).toISOString(),
    );
  });

  it('invoice.paid does NOT resurrect a CANCELLED subscription', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'cs_inv_cancel_test',
              url: 'https://checkout.stripe.test/cs_inv_cancel',
              customer: 'cus_inv_cancel',
              subscription: null,
              payment_status: 'unpaid',
              status: 'open',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const CANCEL_USER = 'usr_cancelled_sub_test';
    const CANCEL_SUB = 'sub_cancelled_test';
    const { pgInsertUserWithState } = await import('../src/server/auth/postgresStore.js');
    const now = Date.now();
    await pgInsertUserWithState({
      user: {
        user_id: CANCEL_USER,
        email: 'cancelled@novaquant.cloud',
        password_hash: 'hash',
        name: 'Cancelled User',
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
    });

    const { createBillingCheckoutSession, getBillingState, processBillingWebhook } =
      await import('../src/server/billing/service.js');

    const checkout = await createBillingCheckoutSession({ userId: CANCEL_USER, planKey: 'lite' });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;

    // Activate
    const activatePayload = JSON.stringify({
      id: 'evt_activate_cancel_test',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: CANCEL_SUB,
          customer: 'cus_inv_cancel',
          status: 'active',
          start_date: 1_710_000_000,
          current_period_start: 1_710_000_000,
          current_period_end: 1_710_604_800,
          cancel_at_period_end: false,
          metadata: {
            local_checkout_session_id: checkout.session?.id,
            user_id: CANCEL_USER,
            plan_key: 'lite',
            billing_cycle: 'weekly',
          },
          items: { data: [{ price: { unit_amount: 1900, recurring: { interval: 'week' } } }] },
        },
      },
    });
    processBillingWebhook({
      signature: signStripePayload(activatePayload, WEBHOOK_SECRET),
      rawBody: activatePayload,
    });

    // Cancel
    const cancelPayload = JSON.stringify({
      id: 'evt_cancel_test',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: CANCEL_SUB,
          customer: 'cus_inv_cancel',
          status: 'canceled',
          start_date: 1_710_000_000,
          current_period_start: 1_710_000_000,
          current_period_end: 1_710_604_800,
          cancel_at_period_end: false,
          metadata: {
            user_id: CANCEL_USER,
            plan_key: 'lite',
            billing_cycle: 'weekly',
          },
          items: { data: [{ price: { unit_amount: 1900, recurring: { interval: 'week' } } }] },
        },
      },
    });
    processBillingWebhook({
      signature: signStripePayload(cancelPayload, WEBHOOK_SECRET),
      rawBody: cancelPayload,
    });

    expect(getBillingState(CANCEL_USER).subscription?.status).toBe('CANCELLED');

    // invoice.paid must NOT flip CANCELLED → ACTIVE
    const latePaidPayload = JSON.stringify({
      id: 'evt_late_paid_test',
      type: 'invoice.paid',
      data: {
        object: {
          subscription: CANCEL_SUB,
          customer: 'cus_inv_cancel',
          period_start: 1_710_604_800,
          period_end: 1_711_209_600,
          amount_paid: 1900,
        },
      },
    });
    expect(
      processBillingWebhook({
        signature: signStripePayload(latePaidPayload, WEBHOOK_SECRET),
        rawBody: latePaidPayload,
      }),
    ).toEqual({ ok: true, received: true });

    // Status must remain CANCELLED
    expect(getBillingState(CANCEL_USER).subscription?.status).toBe('CANCELLED');
    expect(getBillingState(CANCEL_USER).currentPlan).toBe('free');
  });
});

describe('invoice.payment_failed — downgrades subscription to PENDING', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_invoice_fail');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
    vi.stubEnv('STRIPE_PRICE_LITE_WEEKLY', 'price_lite_weekly');
    vi.stubEnv('STRIPE_PRICE_PRO_WEEKLY', 'price_pro_weekly');
    vi.stubEnv('NOVA_APP_URL', 'https://app.novaquant.cloud');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sets subscription to PENDING when renewal payment fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'cs_fail_test',
              url: 'https://checkout.stripe.test/cs_fail',
              customer: 'cus_fail_test',
              subscription: null,
              payment_status: 'unpaid',
              status: 'open',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const FAIL_USER = 'usr_payment_failed_test';
    const FAIL_SUB = 'sub_payment_failed_456';
    const { pgInsertUserWithState } = await import('../src/server/auth/postgresStore.js');
    const now = Date.now();
    await pgInsertUserWithState({
      user: {
        user_id: FAIL_USER,
        email: 'failed@novaquant.cloud',
        password_hash: 'hash',
        name: 'Failed User',
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
    });

    const { createBillingCheckoutSession, getBillingState, processBillingWebhook } =
      await import('../src/server/billing/service.js');

    const checkout = await createBillingCheckoutSession({ userId: FAIL_USER, planKey: 'lite' });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;

    // Activate subscription first
    const activatePayload = JSON.stringify({
      id: 'evt_activate_fail_test',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: FAIL_SUB,
          customer: 'cus_fail_test',
          status: 'active',
          start_date: 1_710_000_000,
          current_period_start: 1_710_000_000,
          current_period_end: 1_710_604_800,
          cancel_at_period_end: false,
          metadata: {
            local_checkout_session_id: checkout.session?.id,
            user_id: FAIL_USER,
            plan_key: 'lite',
            billing_cycle: 'weekly',
          },
          items: { data: [{ price: { unit_amount: 1900, recurring: { interval: 'week' } } }] },
        },
      },
    });
    processBillingWebhook({
      signature: signStripePayload(activatePayload, WEBHOOK_SECRET),
      rawBody: activatePayload,
    });

    expect(getBillingState(FAIL_USER).subscription?.status).toBe('ACTIVE');

    // Renewal payment fails
    const invoiceFailedPayload = JSON.stringify({
      id: 'evt_invoice_failed_test',
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: FAIL_SUB,
          customer: 'cus_fail_test',
          attempt_count: 1,
          amount_due: 1900,
          status: 'open',
        },
      },
    });
    expect(
      processBillingWebhook({
        signature: signStripePayload(invoiceFailedPayload, WEBHOOK_SECRET),
        rawBody: invoiceFailedPayload,
      }),
    ).toEqual({ ok: true, received: true });

    // Subscription should now be PENDING (payment failed)
    expect(getBillingState(FAIL_USER).subscription?.status).toBe('PENDING');
    // Plan is no longer active
    expect(getBillingState(FAIL_USER).currentPlan).toBe('free');
  });
});

describe('checkout.session.async_payment_succeeded/failed', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_async');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
    vi.stubEnv('STRIPE_PRICE_LITE_WEEKLY', 'price_lite_weekly');
    vi.stubEnv('STRIPE_PRICE_PRO_WEEKLY', 'price_pro_weekly');
    vi.stubEnv('NOVA_APP_URL', 'https://app.novaquant.cloud');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('async_payment_succeeded marks checkout COMPLETED (delayed payment methods)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'cs_async_test',
              url: 'https://checkout.stripe.test/cs_async',
              customer: 'cus_async_test',
              subscription: null,
              payment_status: 'unpaid',
              status: 'open',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const ASYNC_USER = 'usr_async_payment_test';
    const { pgInsertUserWithState } = await import('../src/server/auth/postgresStore.js');
    const now = Date.now();
    await pgInsertUserWithState({
      user: {
        user_id: ASYNC_USER,
        email: 'async@novaquant.cloud',
        password_hash: 'hash',
        name: 'Async User',
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
    });

    const { createBillingCheckoutSession, getBillingState, processBillingWebhook } =
      await import('../src/server/billing/service.js');

    const checkout = await createBillingCheckoutSession({
      userId: ASYNC_USER,
      planKey: 'lite',
      billingCycle: 'weekly',
    });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;

    // checkout.session.completed fires immediately (payment_status = 'processing')
    // but we do NOT mark as COMPLETED here for async methods — instead we wait
    // for async_payment_succeeded.

    // async_payment_succeeded arrives later → should mark COMPLETED
    const asyncSucceededPayload = JSON.stringify({
      id: 'evt_async_succeeded_test',
      type: 'checkout.session.async_payment_succeeded',
      data: {
        object: {
          id: 'cs_async_test',
          client_reference_id: checkout.session?.id,
          customer: 'cus_async_test',
          customer_email: 'async@novaquant.cloud',
          customer_details: { email: 'async@novaquant.cloud' },
          metadata: {
            local_checkout_session_id: checkout.session?.id,
            user_id: ASYNC_USER,
            plan_key: 'lite',
            billing_cycle: 'weekly',
          },
        },
      },
    });
    expect(
      processBillingWebhook({
        signature: signStripePayload(asyncSucceededPayload, WEBHOOK_SECRET),
        rawBody: asyncSucceededPayload,
      }),
    ).toEqual({ ok: true, received: true });

    const state = getBillingState(ASYNC_USER);
    expect(state.latestCheckout?.status).toBe('COMPLETED');
  });

  it('async_payment_failed marks checkout ABANDONED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'cs_async_fail_test',
              url: 'https://checkout.stripe.test/cs_async_fail',
              customer: 'cus_async_fail',
              subscription: null,
              payment_status: 'unpaid',
              status: 'open',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const ASYNC_FAIL_USER = 'usr_async_fail_test';
    const { pgInsertUserWithState } = await import('../src/server/auth/postgresStore.js');
    const now = Date.now();
    await pgInsertUserWithState({
      user: {
        user_id: ASYNC_FAIL_USER,
        email: 'asyncfail@novaquant.cloud',
        password_hash: 'hash',
        name: 'Async Fail User',
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
    });

    const { createBillingCheckoutSession, getBillingState, processBillingWebhook } =
      await import('../src/server/billing/service.js');

    const checkout = await createBillingCheckoutSession({
      userId: ASYNC_FAIL_USER,
      planKey: 'lite',
      billingCycle: 'weekly',
    });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;

    const asyncFailedPayload = JSON.stringify({
      id: 'evt_async_failed_test',
      type: 'checkout.session.async_payment_failed',
      data: {
        object: {
          id: 'cs_async_fail_test',
          client_reference_id: checkout.session?.id,
          customer: 'cus_async_fail',
          customer_email: 'asyncfail@novaquant.cloud',
          customer_details: { email: 'asyncfail@novaquant.cloud' },
          metadata: {
            local_checkout_session_id: checkout.session?.id,
            user_id: ASYNC_FAIL_USER,
            plan_key: 'lite',
            billing_cycle: 'weekly',
          },
        },
      },
    });
    expect(
      processBillingWebhook({
        signature: signStripePayload(asyncFailedPayload, WEBHOOK_SECRET),
        rawBody: asyncFailedPayload,
      }),
    ).toEqual({ ok: true, received: true });

    const state = getBillingState(ASYNC_FAIL_USER);
    expect(state.latestCheckout?.status).toBe('ABANDONED');
    expect(state.currentPlan).toBe('free');
  });
});

describe('Idempotency-Key is sent on Stripe Checkout Session creation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_idem');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
    vi.stubEnv('STRIPE_PRICE_LITE_WEEKLY', 'price_lite_weekly');
    vi.stubEnv('STRIPE_PRICE_PRO_WEEKLY', 'price_pro_weekly');
    vi.stubEnv('NOVA_APP_URL', 'https://app.novaquant.cloud');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('includes Idempotency-Key header equal to the local session ID', async () => {
    let capturedHeaders: Headers | Record<string, string> | undefined;
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedHeaders = init?.headers as Headers | Record<string, string>;
      return new Response(
        JSON.stringify({
          id: 'cs_idem_test',
          url: 'https://checkout.stripe.test/cs_idem',
          customer: 'cus_idem_test',
          subscription: null,
          payment_status: 'unpaid',
          status: 'open',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const IDEM_USER = 'usr_idem_key_test';
    const { pgInsertUserWithState } = await import('../src/server/auth/postgresStore.js');
    const now = Date.now();
    await pgInsertUserWithState({
      user: {
        user_id: IDEM_USER,
        email: 'idem@novaquant.cloud',
        password_hash: 'hash',
        name: 'Idem User',
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
    });

    const { createBillingCheckoutSession } = await import('../src/server/billing/service.js');
    const checkout = await createBillingCheckoutSession({
      userId: IDEM_USER,
      planKey: 'lite',
      billingCycle: 'weekly',
    });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;

    // The Idempotency-Key header must be present and equal the local session ID
    const idempotencyKey =
      capturedHeaders instanceof Headers
        ? capturedHeaders.get('Idempotency-Key')
        : (capturedHeaders as Record<string, string>)?.['Idempotency-Key'];

    expect(idempotencyKey).toBeTruthy();
    expect(idempotencyKey).toBe(checkout.session?.id);
  });
});

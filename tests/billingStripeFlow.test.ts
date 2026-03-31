import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function signStripePayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('stripe billing flow', () => {
  let dbPath = '';

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbPath = path.join(os.tmpdir(), `nova-quant-billing-${Date.now()}-${Math.random()}.db`);
    vi.stubEnv('DB_PATH', dbPath);
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'sqlite');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_123');
    vi.stubEnv('STRIPE_PRICE_LITE_WEEKLY', 'price_lite_weekly');
    vi.stubEnv('STRIPE_PRICE_PRO_WEEKLY', 'price_pro_weekly');
    vi.stubEnv('NOVA_APP_URL', 'https://app.novaquant.cloud');
    vi.stubEnv('STRIPE_PORTAL_RETURN_URL', 'https://app.novaquant.cloud');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    try {
      const { closeDb } = await import('../src/server/db/database.js');
      closeDb();
    } catch {
      // ignore cleanup misses
    }
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
  });

  it('creates a Stripe checkout session and activates Lite after webhook sync', async () => {
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

    const { getDb } = await import('../src/server/db/database.js');
    const db = getDb();
    db.prepare(
      `INSERT INTO auth_users(
        user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'usr_stripe_test',
      'stripe@novaquant.cloud',
      'hash',
      'Stripe User',
      'active',
      'Robinhood',
      'en',
      Date.now(),
      Date.now(),
      Date.now(),
    );

    const {
      createBillingCheckoutSession,
      getBillingState,
      processBillingWebhook,
    } = await import('../src/server/billing/service.js');

    const checkout = await createBillingCheckoutSession({
      userId: 'usr_stripe_test',
      planKey: 'lite',
      billingCycle: 'weekly',
      source: 'membership_center',
      locale: 'en-US',
    });

    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;
    expect(checkout.session?.provider).toBe('stripe');
    expect(checkout.session?.providerSessionId).toBe('cs_test_123');
    expect(checkout.session?.checkoutUrl).toBe('https://checkout.stripe.test/session/cs_test_123');
    expect(checkout.state.providerMode).toBe('stripe');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const completedPayload = JSON.stringify({
      id: 'evt_checkout_completed',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          client_reference_id: checkout.session?.id,
          customer: 'cus_test_123',
          customer_email: 'stripe@novaquant.cloud',
          customer_details: { email: 'stripe@novaquant.cloud' },
          metadata: {
            local_checkout_session_id: checkout.session?.id,
            user_id: 'usr_stripe_test',
            plan_key: 'lite',
            billing_cycle: 'weekly',
          },
        },
      },
    });

    expect(
      processBillingWebhook({
        signature: signStripePayload(completedPayload, 'whsec_test_123'),
        rawBody: completedPayload,
      }),
    ).toEqual({ ok: true, received: true });

    const subscriptionPayload = JSON.stringify({
      id: 'evt_subscription_updated',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active',
          start_date: 1_710_000_000,
          current_period_start: 1_710_000_000,
          current_period_end: 1_710_604_800,
          cancel_at_period_end: false,
          metadata: {
            local_checkout_session_id: checkout.session?.id,
            user_id: 'usr_stripe_test',
            plan_key: 'lite',
            billing_cycle: 'weekly',
          },
          items: {
            data: [
              {
                price: {
                  unit_amount: 1900,
                  recurring: {
                    interval: 'week',
                  },
                },
              },
            ],
          },
        },
      },
    });

    expect(
      processBillingWebhook({
        signature: signStripePayload(subscriptionPayload, 'whsec_test_123'),
        rawBody: subscriptionPayload,
      }),
    ).toEqual({ ok: true, received: true });

    const state = getBillingState('usr_stripe_test');
    expect(state.currentPlan).toBe('lite');
    expect(state.portalConfigured).toBe(true);
    expect(state.subscription?.provider).toBe('stripe');
    expect(state.subscription?.billingCycle).toBe('weekly');
    expect(state.subscription?.status).toBe('ACTIVE');
    expect(state.latestCheckout?.status).toBe('COMPLETED');
  });
});

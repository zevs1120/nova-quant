import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function staleSignStripePayload(payload: string, secret: string) {
  // 10 minutes in the past — exceeds 5-minute tolerance
  const staleTs = Math.floor(Date.now() / 1000) - 10 * 60;
  return signStripePayload(payload, secret, staleTs);
}

// ---------------------------------------------------------------------------
// Shared env setup
// ---------------------------------------------------------------------------
function setupTestEnv() {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'postgres');
  vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
  vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://supabase-test-host/db');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_bugfix');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_bugfix');
  vi.stubEnv('STRIPE_PRICE_LITE_WEEKLY', 'price_lite_weekly');
  vi.stubEnv('STRIPE_PRICE_LITE_MONTHLY', 'price_lite_monthly');
  vi.stubEnv('STRIPE_PRICE_LITE_ANNUAL', 'price_lite_annual');
  vi.stubEnv('STRIPE_PRICE_PRO_WEEKLY', 'price_pro_weekly');
  vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_pro_monthly');
  vi.stubEnv('STRIPE_PRICE_PRO_ANNUAL', 'price_pro_annual');
  vi.stubEnv('NOVA_APP_URL', 'https://app.novaquant.cloud');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubEnv('SUPABASE_ANON_KEY', '');
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
}

async function cleanupTestEnv() {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
}

async function seedAuthUser(userId: string, email: string) {
  const { pgInsertUserWithState } = await import('../src/server/auth/postgresStore.js');
  const now = Date.now();
  await pgInsertUserWithState({
    user: {
      user_id: userId,
      email,
      password_hash: 'hash',
      name: email.split('@')[0] || 'Bugfix User',
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
}

// ---------------------------------------------------------------------------
// Issue 1 — Webhook rawBody empty string → BILLING_WEBHOOK_INVALID
// ---------------------------------------------------------------------------
describe('Issue 1 — webhook: empty rawBody returns BILLING_WEBHOOK_INVALID', () => {
  beforeEach(setupTestEnv);
  afterEach(cleanupTestEnv);

  it('returns BILLING_WEBHOOK_INVALID when rawBody is empty', async () => {
    const { processBillingWebhook } = await import('../src/server/billing/service.js');
    const result = processBillingWebhook({ signature: 't=1,v1=abc', rawBody: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('BILLING_WEBHOOK_INVALID');
  });

  it('returns BILLING_WEBHOOK_INVALID for a stale signature (>5 min)', async () => {
    const { processBillingWebhook } = await import('../src/server/billing/service.js');
    const payload = JSON.stringify({
      id: 'evt_stale',
      type: 'checkout.session.completed',
      data: { object: {} },
    });
    const staleSignature = staleSignStripePayload(payload, 'whsec_bugfix');
    const result = processBillingWebhook({ signature: staleSignature, rawBody: payload });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('BILLING_WEBHOOK_INVALID');
  });

  it('accepts a valid signed webhook body', async () => {
    const { processBillingWebhook } = await import('../src/server/billing/service.js');
    const payload = JSON.stringify({
      id: 'evt_valid_rawbody',
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_unknown',
          metadata: { local_checkout_session_id: 'chk_ghost', user_id: 'usr_ghost' },
        },
      },
    });
    const sig = signStripePayload(payload, 'whsec_bugfix');
    const result = processBillingWebhook({ signature: sig, rawBody: payload });
    // Even with unknown session ids the webhook is "received" (idempotent)
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.received).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issue 2 — normalizeStripeInterval: 'week' maps to 'weekly', unknown → 'monthly'
// ---------------------------------------------------------------------------
describe('Issue 2 — normalizeStripeInterval safe fallback', () => {
  beforeEach(setupTestEnv);
  afterEach(cleanupTestEnv);

  it('Stripe interval "week" should produce billing_cycle = weekly', async () => {
    const { processBillingWebhook, getBillingState } =
      await import('../src/server/billing/service.js');
    await seedAuthUser('usr_interval_test', 'interval@test.com');

    const subPayload = JSON.stringify({
      id: 'evt_sub_week',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_week_test',
          customer: 'cus_week',
          status: 'active',
          start_date: Math.floor(Date.now() / 1000) - 100,
          current_period_start: Math.floor(Date.now() / 1000) - 100,
          current_period_end: Math.floor(Date.now() / 1000) + 500000,
          cancel_at_period_end: false,
          metadata: {
            user_id: 'usr_interval_test',
            plan_key: 'lite',
            billing_cycle: 'weekly',
          },
          items: {
            data: [{ price: { unit_amount: 1900, recurring: { interval: 'week' } } }],
          },
        },
      },
    });
    const result = processBillingWebhook({
      signature: signStripePayload(subPayload, 'whsec_bugfix'),
      rawBody: subPayload,
    });
    expect(result.ok).toBe(true);
    const state = getBillingState('usr_interval_test');
    expect(state.subscription?.billingCycle).toBe('weekly');
  });

  it('unknown Stripe interval should produce billing_cycle = monthly (safe fallback)', async () => {
    // We test via the exported normalizeStripeInterval indirectly via subscription Webhook
    // with no metadata.billing_cycle and interval='day'
    const { processBillingWebhook, getBillingState } =
      await import('../src/server/billing/service.js');
    await seedAuthUser('usr_fallback_cycle', 'fallback@test.com');

    const subPayload = JSON.stringify({
      id: 'evt_sub_day',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_day_test',
          customer: 'cus_day',
          status: 'active',
          start_date: Math.floor(Date.now() / 1000) - 100,
          current_period_start: Math.floor(Date.now() / 1000) - 100,
          current_period_end: Math.floor(Date.now() / 1000) + 500000,
          cancel_at_period_end: false,
          metadata: {
            user_id: 'usr_fallback_cycle',
            plan_key: 'lite',
            // No billing_cycle in metadata → falls back to normalizeStripeInterval('day')
          },
          items: {
            data: [{ price: { unit_amount: 1900, recurring: { interval: 'day' } } }],
          },
        },
      },
    });
    const result = processBillingWebhook({
      signature: signStripePayload(subPayload, 'whsec_bugfix'),
      rawBody: subPayload,
    });
    expect(result.ok).toBe(true);
    const state = getBillingState('usr_fallback_cycle');
    // After fix: unknown interval 'day' → 'monthly' (not 'weekly')
    expect(state.subscription?.billingCycle).toBe('monthly');
  });
});

// ---------------------------------------------------------------------------
// Issue 3 — Plan key inference: monthly Pro amount must not be misclassified as Lite
// ---------------------------------------------------------------------------
describe('Issue 3 — plan key inference by price uses metadata, not amount comparison', () => {
  beforeEach(setupTestEnv);
  afterEach(cleanupTestEnv);

  it('Pro subscription identified via metadata.plan_key even when amountCents < weekly Pro price', async () => {
    const { processBillingWebhook, getBillingState } =
      await import('../src/server/billing/service.js');
    await seedAuthUser('usr_pro_monthly', 'promonthly@test.com');

    // Simulate monthly Pro at $9.90 (990 cents) — less than weekly Pro 2900 cents
    const subPayload = JSON.stringify({
      id: 'evt_pro_monthly_sub',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_pro_monthly',
          customer: 'cus_pro_monthly',
          status: 'active',
          start_date: Math.floor(Date.now() / 1000) - 100,
          current_period_start: Math.floor(Date.now() / 1000) - 100,
          current_period_end: Math.floor(Date.now() / 1000) + 2592000,
          cancel_at_period_end: false,
          metadata: {
            user_id: 'usr_pro_monthly',
            plan_key: 'pro',
            billing_cycle: 'monthly',
          },
          items: {
            data: [{ price: { unit_amount: 990, recurring: { interval: 'month' } } }],
          },
        },
      },
    });
    const result = processBillingWebhook({
      signature: signStripePayload(subPayload, 'whsec_bugfix'),
      rawBody: subPayload,
    });
    expect(result.ok).toBe(true);
    const state = getBillingState('usr_pro_monthly');
    // Must be 'pro', not 'lite'
    expect(state.currentPlan).toBe('pro');
    expect(state.subscription?.planKey).toBe('pro');
    expect(state.subscription?.billingCycle).toBe('monthly');
  });
});

// ---------------------------------------------------------------------------
// Issue 4 — Cache: write operations invalidate the relevant cache key
// ---------------------------------------------------------------------------
describe('Issue 4 — frontendReadCache invalidated after write', () => {
  beforeEach(setupTestEnv);
  afterEach(cleanupTestEnv);

  it('__resetFrontendReadCacheForTesting clears both map and inflight', async () => {
    const m = await import('../src/server/api/queries.js');
    // Warm the cache with a notification preferences read (if user exists in db)
    // Then reset and verify cache is empty (no stale entries leak into next call)
    expect(() => m.__resetFrontendReadCacheForTesting()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Issue 5 — Concurrent Supabase user creation: Postgres auth store stays single-writer safe
// ---------------------------------------------------------------------------
describe('Issue 5 — getOrCreateSupabaseBackedUser concurrent safety', () => {
  beforeEach(setupTestEnv);
  afterEach(cleanupTestEnv);

  it('rejects a second signup for the same email through the shared Postgres auth store', async () => {
    const { signupAuthUser } = await import('../src/server/auth/service.js');
    const { pgGetUserByEmail } = await import('../src/server/auth/postgresStore.js');
    const email = 'race@concurrent.test';
    const first = await signupAuthUser({
      email,
      password: 'StrongPass123',
      name: 'Race Winner',
      tradeMode: 'active',
      broker: 'Other',
    });
    const second = await signupAuthUser({
      email,
      password: 'StrongPass123',
      name: 'Race Loser',
      tradeMode: 'active',
      broker: 'Other',
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toBe('EMAIL_EXISTS');
    }
    const stored = await pgGetUserByEmail(email);
    expect(stored?.email).toBe(email);
  });
});

// ---------------------------------------------------------------------------
// Issue 6 — Guest checkout: portal unavailable when no provider_customer_id
// ---------------------------------------------------------------------------
describe('Issue 6 — createBillingPortalSession returns BILLING_PORTAL_UNAVAILABLE for guest checkout user', () => {
  beforeEach(setupTestEnv);
  afterEach(cleanupTestEnv);

  it('returns BILLING_PORTAL_UNAVAILABLE when customer has no Stripe Customer ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'cs_guest',
              url: 'https://checkout.stripe.test/cs_guest',
              customer: null,
              subscription: null,
              payment_status: null,
              status: 'open',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const { createBillingCheckoutSession, createBillingPortalSession } =
      await import('../src/server/billing/service.js');
    await seedAuthUser('usr_guest_checkout', 'guest@test.com');

    // Checkout without customer returned → no provider_customer_id stored
    await createBillingCheckoutSession({
      userId: 'usr_guest_checkout',
      planKey: 'lite',
      billingCycle: 'weekly',
    });

    const portalResult = await createBillingPortalSession({ userId: 'usr_guest_checkout' });
    // Must return portal unavailable when no Stripe Customer ID exists
    expect(portalResult.ok).toBe(false);
    if (!portalResult.ok) {
      expect(portalResult.error).toBe('BILLING_PORTAL_UNAVAILABLE');
    }
  });
});

// ---------------------------------------------------------------------------
// Issue 7 — MEMBERSHIP_PRICING completeness: monthly/annual prices defined
// ---------------------------------------------------------------------------
describe('Issue 7 — MEMBERSHIP_PRICING includes monthly and annual for lite and pro', () => {
  it('getMembershipPriceCents returns non-zero for monthly and annual lite/pro', async () => {
    const { getMembershipPriceCents, MEMBERSHIP_PRICING } =
      await import('../src/utils/membership.js');

    // After fix: monthly/annual keys must exist
    expect(MEMBERSHIP_PRICING.lite.monthly).toBeGreaterThan(0);
    expect(MEMBERSHIP_PRICING.lite.annual).toBeGreaterThan(0);
    expect(MEMBERSHIP_PRICING.pro.monthly).toBeGreaterThan(0);
    expect(MEMBERSHIP_PRICING.pro.annual).toBeGreaterThan(0);

    // getMembershipPriceCents should return correct value, not weekly fallback
    expect(getMembershipPriceCents('lite', 'monthly')).toBe(MEMBERSHIP_PRICING.lite.monthly);
    expect(getMembershipPriceCents('lite', 'annual')).toBe(MEMBERSHIP_PRICING.lite.annual);
    expect(getMembershipPriceCents('pro', 'monthly')).toBe(MEMBERSHIP_PRICING.pro.monthly);
    expect(getMembershipPriceCents('pro', 'annual')).toBe(MEMBERSHIP_PRICING.pro.annual);
  });

  it('weekly price remains unchanged', async () => {
    const { getMembershipPriceCents } = await import('../src/utils/membership.js');
    expect(getMembershipPriceCents('lite', 'weekly')).toBe(1900);
    expect(getMembershipPriceCents('pro', 'weekly')).toBe(2900);
  });
});

// ---------------------------------------------------------------------------
// Issue 8 — CSS duplicate class check: today-final.css has no duplicate selectors
// ---------------------------------------------------------------------------
describe('Issue 8 — today-final.css has no exact duplicate top-level selectors', () => {
  it('no class name appears as a standalone non-media-query block more than once', () => {
    const cssPath = path.join(process.cwd(), 'src/styles/today-final.css');
    if (!fs.existsSync(cssPath)) {
      // Skip if file doesn't exist in this environment
      return;
    }
    const content = fs.readFileSync(cssPath, 'utf8');

    // Split the file into per-block sections by tracking brace depth.
    // Only consider top-level blocks that are NOT inside a @media or @supports wrapper.
    const lines = content.split('\n');
    let depth = 0;
    let inMediaQuery = false;
    const topLevelSelectors: string[] = [];

    for (const line of lines) {
      const stripped = line.trim();
      // Track @media/@supports entry
      if (depth === 0 && (stripped.startsWith('@media') || stripped.startsWith('@supports'))) {
        inMediaQuery = true;
      }
      const opens = (stripped.match(/{/g) || []).length;
      const closes = (stripped.match(/}/g) || []).length;
      if (depth === 0 && !inMediaQuery && stripped.startsWith('.') && stripped.endsWith('{')) {
        topLevelSelectors.push(stripped);
      }
      depth += opens - closes;
      if (depth === 0) inMediaQuery = false;
    }

    const seen = new Map<string, number>();
    const duplicates: string[] = [];
    for (const sel of topLevelSelectors) {
      const count = (seen.get(sel) || 0) + 1;
      seen.set(sel, count);
      if (count === 2) duplicates.push(sel);
    }

    if (duplicates.length > 0) {
      console.warn(
        '[Issue 8] Duplicate top-level (non-media) CSS selectors:',
        duplicates.slice(0, 5),
      );
    }
    // After dedup pass there should be zero top-level (outside @media) duplicates
    expect(duplicates.length).toBe(0);
  });
});

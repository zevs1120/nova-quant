import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyMembershipAccessToDecision,
  consumeAskNovaAccess,
  getMembershipState,
  requireBrokerHandoffAccess,
} from '../src/server/membership/service.js';
import { getBillingState } from '../src/server/billing/service.js';
import { pgGetUserByEmail, pgInsertUserWithState } from '../src/server/auth/postgresStore.js';
import { executeSync, qualifyBusinessTable } from '../src/server/db/postgresSyncBridge.js';

function clearBillingEnv() {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
  vi.stubEnv('STRIPE_PRICE_LITE_WEEKLY', '');
  vi.stubEnv('STRIPE_PRICE_PRO_WEEKLY', '');
}

async function seedAuthUser(email: string) {
  const existing = await pgGetUserByEmail(email);
  if (existing?.user_id) return existing.user_id;
  const now = Date.now();
  const userId = `usr_${Math.random().toString(36).slice(2, 10)}`;
  await pgInsertUserWithState({
    user: {
      user_id: userId,
      email,
      password_hash: 'test-hash',
      name: 'Membership User',
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
      disciplineLog: {
        checkins: [],
        boundary_kept: [],
        weekly_reviews: [],
      },
    },
  });
  return userId;
}

function seedActiveSubscription(userId: string, planKey: 'lite' | 'pro') {
  const billingTable = (name: string) => qualifyBusinessTable(name);
  getMembershipState({ userId });
  const now = Date.now();
  executeSync(
    `INSERT INTO ${billingTable('billing_customers')}(
      user_id, email, provider, provider_customer_id, default_currency, default_billing_cycle, metadata_json, created_at_ms, updated_at_ms
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (user_id) DO UPDATE SET
      provider = EXCLUDED.provider,
      provider_customer_id = EXCLUDED.provider_customer_id,
      default_billing_cycle = EXCLUDED.default_billing_cycle,
      updated_at_ms = EXCLUDED.updated_at_ms`,
    [
      userId,
      'member@example.com',
      'stripe',
      'cus_membership_test',
      'USD',
      'weekly',
      '{}',
      now,
      now,
    ],
  );
  executeSync(
    `INSERT INTO ${billingTable('billing_subscriptions')}(
      subscription_id, user_id, plan_key, status, provider, provider_subscription_id,
      billing_cycle, amount_cents, currency, started_at_ms, current_period_start_ms,
      current_period_end_ms, cancel_at_period_end, cancelled_at_ms, checkout_session_id,
      metadata_json, created_at_ms, updated_at_ms
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      `sub_${planKey}_${Math.random().toString(36).slice(2, 10)}`,
      userId,
      planKey,
      'ACTIVE',
      'stripe',
      `stripe_${planKey}_subscription`,
      'weekly',
      planKey === 'pro' ? 2900 : 1900,
      'USD',
      now,
      now,
      now + 7 * 24 * 60 * 60 * 1000,
      0,
      null,
      null,
      '{}',
      now,
      now,
    ],
  );
}

function seedAdminRole(userId: string) {
  const now = Date.now();
  executeSync(
    `INSERT INTO auth_user_roles(user_id, role, granted_at_ms, granted_by_user_id)
     VALUES($1, 'ADMIN', $2, NULL)
     ON CONFLICT (user_id, role) DO UPDATE SET granted_at_ms = EXCLUDED.granted_at_ms`,
    [userId, now],
  );
}

describe('membership entitlements', () => {
  const freeEmail = 'membership-free@example.com';
  const liteEmail = 'membership-lite@example.com';

  beforeEach(() => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    clearBillingEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('tracks Ask Nova daily usage on the server and blocks the fourth free request', async () => {
    const userId = await seedAuthUser(freeEmail);

    for (let index = 0; index < 3; index += 1) {
      const result = consumeAskNovaAccess({
        userId,
        message: `Free question ${index + 1}`,
        context: { page: 'ai' },
      });
      expect(result.ok).toBe(true);
    }

    const blocked = consumeAskNovaAccess({
      userId,
      message: 'Free question 4',
      context: { page: 'ai' },
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toBe('ASK_NOVA_LIMIT_REACHED');
    expect(blocked.targetPlan).toBe('lite');

    const membershipState = getMembershipState({ userId });
    expect(membershipState.currentPlan).toBe('free');
    expect(membershipState.usage.askNovaUsed).toBe(3);
    expect(membershipState.remainingAskNova).toBe(0);
  });

  it('keeps broker handoff on Lite and reserves portfolio-aware chat for Pro', async () => {
    const userId = await seedAuthUser(liteEmail);

    const freeBroker = requireBrokerHandoffAccess({ userId });
    expect(freeBroker.ok).toBe(false);
    if (freeBroker.ok) return;
    expect(freeBroker.error).toBe('BROKER_HANDOFF_REQUIRES_LITE');

    seedActiveSubscription(userId, 'lite');

    const liteMembershipState = getMembershipState({ userId });
    expect(liteMembershipState.currentPlan).toBe('lite');
    expect(liteMembershipState.remainingAskNova).toBe(20);

    const liteBroker = requireBrokerHandoffAccess({ userId });
    expect(liteBroker.ok).toBe(true);

    const blockedPortfolioChat = consumeAskNovaAccess({
      userId,
      message: 'Review my holdings and portfolio risk for me',
      context: { page: 'holdings' },
    });
    expect(blockedPortfolioChat.ok).toBe(false);
    if (blockedPortfolioChat.ok) return;
    expect(blockedPortfolioChat.error).toBe('PORTFOLIO_AI_REQUIRES_PRO');

    const afterBlockedMembershipState = getMembershipState({ userId });
    expect(afterBlockedMembershipState.currentPlan).toBe('lite');
    expect(afterBlockedMembershipState.usage.askNovaUsed).toBe(0);
    expect(afterBlockedMembershipState.remainingAskNova).toBe(20);
  });

  it('clips free Today cards while keeping hidden-card metadata', () => {
    const decision = {
      ranked_action_cards: Array.from({ length: 5 }, (_, index) => ({
        action_id: `card-${index + 1}`,
        signal_payload: { symbol: `SYM${index + 1}` },
      })),
    };

    const limited = applyMembershipAccessToDecision({
      decision,
      currentPlan: 'free',
    });

    expect(limited?.ranked_action_cards).toHaveLength(3);
    expect(limited?.membership_gate).toMatchObject({
      current_plan: 'free',
      today_card_limit: 3,
      total_action_cards: 5,
      hidden_action_cards: 2,
    });
  });

  it('treats admin accounts as Pro even without a paid subscription', async () => {
    const userId = await seedAuthUser('membership-admin@example.com');
    seedAdminRole(userId);

    const billingState = getBillingState(userId);
    expect(billingState.currentPlan).toBe('pro');

    const membershipState = getMembershipState({ userId });
    expect(membershipState.currentPlan).toBe('pro');
    expect(membershipState.remainingAskNova).toBe(null);

    const brokerAccess = requireBrokerHandoffAccess({ userId });
    expect(brokerAccess.ok).toBe(true);

    const portfolioAccess = consumeAskNovaAccess({
      userId,
      message: 'Review my holdings and portfolio risk for me',
      context: { page: 'holdings' },
    });
    expect(portfolioAccess.ok).toBe(true);
  });
});

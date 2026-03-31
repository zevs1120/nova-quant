import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeBillingCheckoutSession,
  createBillingCheckoutSession,
} from '../src/server/billing/service.js';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import {
  applyMembershipAccessToDecision,
  consumeAskNovaAccess,
  getMembershipState,
  requireBrokerHandoffAccess,
} from '../src/server/membership/service.js';

function clearBillingEnv() {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
  vi.stubEnv('STRIPE_PRICE_LITE_WEEKLY', '');
  vi.stubEnv('STRIPE_PRICE_PRO_WEEKLY', '');
}

function seedAuthUser(email: string) {
  const db = getDb();
  ensureSchema(db);
  const now = Date.now();
  const existing = db.prepare('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1').get(email) as
    | { user_id?: string }
    | undefined;
  if (existing?.user_id) return existing.user_id;
  const userId = `usr_${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(
    `INSERT INTO auth_users(
      user_id, email, password_hash, name, trade_mode, broker, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, email, 'test-hash', 'Membership User', 'active', 'Other', now, now);
  return userId;
}

function resetAuthUser(email: string) {
  const db = getDb();
  ensureSchema(db);
  const row = db.prepare('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1').get(email) as
    | { user_id?: string }
    | undefined;
  if (!row?.user_id) return;
  db.prepare('DELETE FROM membership_usage_daily WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM billing_subscriptions WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM billing_checkout_sessions WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM billing_customers WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM external_connections WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_user_roles WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_user_state_sync WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_users WHERE user_id = ?').run(row.user_id);
}

async function upgradeToLite(userId: string) {
  const checkout = await createBillingCheckoutSession({
    userId,
    planKey: 'lite',
    billingCycle: 'weekly',
    source: 'membership-test',
    locale: 'en-US',
  });
  expect(checkout.ok).toBe(true);
  if (!checkout.ok || !checkout.session?.id) return;
  const completed = completeBillingCheckoutSession({
    userId,
    sessionId: checkout.session.id,
    billingEmail: 'member@example.com',
    paymentMethodLast4: '4242',
  });
  expect(completed.ok).toBe(true);
}

describe('membership entitlements', () => {
  const freeEmail = 'membership-free@example.com';
  const liteEmail = 'membership-lite@example.com';

  beforeEach(() => {
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'sqlite');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', '');
    clearBillingEnv();
  });

  afterEach(() => {
    resetAuthUser(freeEmail);
    resetAuthUser(liteEmail);
    vi.unstubAllEnvs();
  });

  it('tracks Ask Nova daily usage on the server and blocks the fourth free request', () => {
    const userId = seedAuthUser(freeEmail);

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
    const userId = seedAuthUser(liteEmail);

    const freeBroker = requireBrokerHandoffAccess({ userId });
    expect(freeBroker.ok).toBe(false);
    if (freeBroker.ok) return;
    expect(freeBroker.error).toBe('BROKER_HANDOFF_REQUIRES_LITE');

    await upgradeToLite(userId);

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
});

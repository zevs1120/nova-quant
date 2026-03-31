import { useCallback, useEffect, useState } from 'react';
import { getMembershipPriceCents, normalizeMembershipPlan } from '../utils/membership';

function normalizeCycle(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'annual') return 'annual';
  if (normalized === 'monthly') return 'monthly';
  return 'weekly';
}

function buildPreviewState({ planKey, billingCycle, email }) {
  const now = new Date();
  const durationDays = billingCycle === 'annual' ? 365 : billingCycle === 'monthly' ? 30 : 7;
  const currentPeriodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  return {
    available: true,
    authenticated: false,
    providerMode: 'internal_checkout',
    checkoutConfigured: false,
    portalConfigured: false,
    currentPlan: planKey,
    customer: email
      ? {
          email,
          provider: 'internal_checkout',
          providerCustomerId: null,
          defaultCurrency: 'USD',
          defaultBillingCycle: billingCycle,
        }
      : null,
    subscription: {
      id: `preview-sub-${now.getTime()}`,
      planKey,
      status: 'ACTIVE',
      provider: 'internal_checkout',
      billingCycle,
      amountCents: getMembershipPriceCents(planKey, billingCycle),
      currency: 'USD',
      startedAt: now.toISOString(),
      currentPeriodStartAt: now.toISOString(),
      currentPeriodEndAt: currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      checkoutSessionId: `preview-checkout-${now.getTime()}`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    latestCheckout: {
      id: `preview-checkout-${now.getTime()}`,
      planKey,
      status: 'COMPLETED',
      provider: 'internal_checkout',
      providerSessionId: null,
      billingCycle,
      amountCents: getMembershipPriceCents(planKey, billingCycle),
      currency: 'USD',
      checkoutUrl: null,
      checkoutEmail: email || null,
      paymentMethodLast4: '4242',
      createdAt: now.toISOString(),
      expiresAt: currentPeriodEnd.toISOString(),
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  };
}

function currentReturnUrl() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

export function useBilling({ locale, authSession, userProfile, fetchJson, onApplyPlan }) {
  const [billingState, setBillingState] = useState(null);
  const [checkoutState, setCheckoutState] = useState(null);

  const applyRemoteState = useCallback(
    (nextState) => {
      if (!nextState || typeof nextState !== 'object') return;
      setBillingState(nextState);
      if (nextState.currentPlan) {
        onApplyPlan?.(nextState.currentPlan);
      }
    },
    [onApplyPlan],
  );

  const syncBillingState = useCallback(async () => {
    if (!authSession?.userId) {
      setBillingState(null);
      return false;
    }
    try {
      const payload = await fetchJson('/api/billing/state');
      applyRemoteState(payload);
      return true;
    } catch {
      return false;
    }
  }, [applyRemoteState, authSession?.userId, fetchJson]);

  useEffect(() => {
    if (!authSession?.userId) {
      setBillingState(null);
      return;
    }
    void syncBillingState();
  }, [authSession?.userId, syncBillingState]);

  const closeCheckout = useCallback(() => {
    setCheckoutState(null);
  }, []);

  const openPortal = useCallback(async () => {
    if (!authSession?.userId) return false;
    try {
      const payload = await fetchJson('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnUrl: currentReturnUrl(),
        }),
      });
      if (payload?.state) {
        applyRemoteState(payload.state);
      }
      if (payload?.url && typeof window !== 'undefined') {
        window.location.assign(payload.url);
        return true;
      }
      throw new Error('Unable to open billing portal.');
    } catch (error) {
      setCheckoutState((current) =>
        current
          ? {
              ...current,
              submitting: false,
              error: String(error?.message || 'Unable to open billing portal.'),
            }
          : current,
      );
      return false;
    }
  }, [applyRemoteState, authSession?.userId, fetchJson]);

  const openCheckout = useCallback(
    async ({ planKey, source = 'membership' }) => {
      const normalizedPlan = normalizeMembershipPlan(planKey);
      const billingCycle = 'weekly';
      const activeSubscription = billingState?.subscription || null;
      const stripeManaged =
        billingState?.providerMode === 'stripe' && activeSubscription?.provider === 'stripe';

      if (normalizedPlan === 'free') {
        if (stripeManaged) {
          setCheckoutState({
            open: true,
            mode: 'portal',
            preview: false,
            planKey: normalizedPlan,
            billingCycle,
            source,
            session: billingState?.latestCheckout || null,
            loading: false,
            submitting: false,
            error: '',
            note: locale?.startsWith('zh')
              ? 'Stripe 订阅的降级和取消统一在 Billing Portal 里处理。'
              : 'Stripe-managed subscriptions are changed or cancelled in the billing portal.',
          });
          return;
        }
        setCheckoutState({
          open: true,
          mode: 'downgrade',
          preview: !authSession?.userId,
          planKey: normalizedPlan,
          billingCycle,
          source,
          session: null,
          loading: false,
          submitting: false,
          error: '',
          note: authSession?.userId
            ? locale?.startsWith('zh')
              ? '确认后会取消当前订阅，并立即回到 Free。'
              : 'Confirming will cancel the current subscription and move the account back to Free.'
            : locale?.startsWith('zh')
              ? '当前会以本地预览方式回到 Free。'
              : 'This change will be applied locally in preview mode.',
        });
        return;
      }

      if (!authSession?.userId) {
        setCheckoutState({
          open: true,
          mode: 'checkout',
          preview: true,
          planKey: normalizedPlan,
          billingCycle,
          source,
          loading: false,
          submitting: false,
          error: '',
          note: locale?.startsWith('zh')
            ? '当前未登录，完成后会只在本地预览升级效果。'
            : 'You are not signed in. Completing checkout will preview the upgrade locally only.',
          session: {
            id: `preview-checkout-${Date.now()}`,
            planKey: normalizedPlan,
            status: 'OPEN',
            provider: 'internal_checkout',
            providerSessionId: null,
            billingCycle,
            amountCents: getMembershipPriceCents(normalizedPlan, billingCycle),
            currency: 'USD',
            checkoutUrl: null,
            checkoutEmail: userProfile?.email || null,
          },
        });
        return;
      }

      setCheckoutState({
        open: true,
        mode: 'checkout',
        preview: false,
        planKey: normalizedPlan,
        billingCycle,
        source,
        session: null,
        loading: true,
        submitting: false,
        error: '',
        note: '',
      });

      try {
        const payload = await fetchJson('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planKey: normalizedPlan,
            billingCycle,
            source,
            locale,
          }),
        });
        applyRemoteState(payload.state);
        setCheckoutState({
          open: true,
          mode: payload?.session?.checkoutUrl ? 'redirect' : 'checkout',
          preview: false,
          planKey: normalizedPlan,
          billingCycle,
          source,
          session: payload.session || null,
          loading: false,
          submitting: false,
          error: '',
          note: '',
        });
      } catch (error) {
        setCheckoutState({
          open: true,
          mode: 'checkout',
          preview: false,
          planKey: normalizedPlan,
          billingCycle,
          source,
          loading: false,
          submitting: false,
          error: String(error?.message || 'Unable to start checkout.'),
          note: locale?.startsWith('zh')
            ? '当前环境没有可用的正式结账配置。'
            : 'Formal checkout is not configured in this environment right now.',
          session: null,
        });
      }
    },
    [applyRemoteState, authSession?.userId, billingState, fetchJson, locale, userProfile?.email],
  );

  const submitCheckout = useCallback(
    async ({ billingEmail, paymentMethodLast4 } = {}) => {
      if (!checkoutState?.open) return false;

      setCheckoutState((current) =>
        current
          ? {
              ...current,
              submitting: true,
              error: '',
            }
          : current,
      );

      if (checkoutState.mode === 'portal') {
        return openPortal();
      }

      if (checkoutState.mode === 'downgrade') {
        if (!authSession?.userId || checkoutState.preview) {
          setBillingState(null);
          onApplyPlan?.('free');
          setCheckoutState(null);
          return true;
        }

        try {
          const payload = await fetchJson('/api/billing/subscription/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          applyRemoteState(payload.state);
          onApplyPlan?.('free');
          setCheckoutState(null);
          return true;
        } catch (error) {
          setCheckoutState((current) =>
            current
              ? {
                  ...current,
                  submitting: false,
                  error: String(error?.message || 'Unable to cancel subscription.'),
                }
              : current,
          );
          return false;
        }
      }

      if (checkoutState.session?.checkoutUrl && typeof window !== 'undefined') {
        window.location.assign(checkoutState.session.checkoutUrl);
        setCheckoutState(null);
        return true;
      }

      if (checkoutState.preview || !authSession?.userId) {
        const previewState = buildPreviewState({
          planKey: checkoutState.planKey,
          billingCycle: checkoutState.billingCycle,
          email: billingEmail || userProfile?.email || '',
        });
        setBillingState(previewState);
        onApplyPlan?.(checkoutState.planKey);
        setCheckoutState(null);
        return true;
      }

      try {
        const payload = await fetchJson(
          `/api/billing/checkout/${encodeURIComponent(checkoutState.session?.id || '')}/complete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              billingEmail,
              paymentMethodLast4,
            }),
          },
        );
        applyRemoteState(payload.state);
        onApplyPlan?.(payload.state?.currentPlan || checkoutState.planKey);
        setCheckoutState(null);
        return true;
      } catch (error) {
        setCheckoutState((current) =>
          current
            ? {
                ...current,
                submitting: false,
                error: String(error?.message || 'Unable to complete checkout.'),
              }
            : current,
        );
        return false;
      }
    },
    [
      applyRemoteState,
      authSession?.userId,
      checkoutState,
      fetchJson,
      openPortal,
      onApplyPlan,
      userProfile?.email,
    ],
  );

  return {
    billingState,
    checkoutState,
    openCheckout,
    openPortal,
    closeCheckout,
    submitCheckout,
    syncBillingState,
  };
}

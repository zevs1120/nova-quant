import { useCallback, useEffect, useState } from 'react';
import { getMembershipPriceCents, normalizeMembershipPlan } from '../utils/membership';

function normalizeCycle(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === 'annual'
    ? 'annual'
    : 'monthly';
}

function buildPreviewState({ planKey, billingCycle, email }) {
  const now = new Date();
  const currentPeriodEnd = new Date(
    now.getTime() + (billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000,
  );
  return {
    available: true,
    authenticated: false,
    currentPlan: planKey,
    customer: email
      ? {
          email,
          provider: 'internal_checkout',
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
      billingCycle,
      amountCents: getMembershipPriceCents(planKey, billingCycle),
      currency: 'USD',
      checkoutEmail: email || null,
      paymentMethodLast4: '4242',
      createdAt: now.toISOString(),
      expiresAt: currentPeriodEnd.toISOString(),
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  };
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

  const openCheckout = useCallback(
    async ({ planKey, source = 'membership' }) => {
      const normalizedPlan = normalizeMembershipPlan(planKey);
      const billingCycle = 'monthly';

      if (normalizedPlan === 'free') {
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
            billingCycle,
            amountCents: getMembershipPriceCents(normalizedPlan, billingCycle),
            currency: 'USD',
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
          mode: 'checkout',
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
      } catch {
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
            ? '本地 API 当前不可用，已切换到本地预览 checkout。'
            : 'The billing API is unavailable right now, so checkout has switched to local preview mode.',
          session: {
            id: `preview-checkout-${Date.now()}`,
            planKey: normalizedPlan,
            status: 'OPEN',
            billingCycle,
            amountCents: getMembershipPriceCents(normalizedPlan, billingCycle),
            currency: 'USD',
            checkoutEmail: userProfile?.email || null,
          },
        });
      }
    },
    [applyRemoteState, authSession?.userId, fetchJson, locale, userProfile?.email],
  );

  const submitCheckout = useCallback(
    async ({ billingEmail, paymentMethodLast4 }) => {
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
      onApplyPlan,
      userProfile?.email,
    ],
  );

  return {
    billingState,
    checkoutState,
    openCheckout,
    closeCheckout,
    submitCheckout,
    syncBillingState,
  };
}

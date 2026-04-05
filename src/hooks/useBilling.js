import { useCallback, useEffect, useState } from 'react';
import { normalizeMembershipPlan } from '../utils/membership';
import { resolveBillingReturnUrl } from '../shared/routes/publicUrls.js';

export function useBilling({ locale, authSession, fetchJson, onApplyPlan }) {
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
          returnUrl: resolveBillingReturnUrl(),
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
        if (!authSession?.userId) {
          setCheckoutState({
            open: true,
            mode: 'auth_required',
            planKey: normalizedPlan,
            billingCycle,
            source,
            session: null,
            loading: false,
            submitting: false,
            error: locale?.startsWith('zh')
              ? '请先登录，再管理你的订阅。'
              : 'Please sign in before managing your subscription.',
            note: locale?.startsWith('zh')
              ? '会员升级、取消和账单管理都需要先登录。'
              : 'Membership upgrades, cancellations, and billing management require sign-in first.',
          });
          return;
        }
        if (stripeManaged) {
          setCheckoutState({
            open: true,
            mode: 'portal',
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
          planKey: normalizedPlan,
          billingCycle,
          source,
          session: null,
          loading: false,
          submitting: false,
          error: '',
          note: locale?.startsWith('zh')
            ? '仅遗留订阅允许在应用内直接取消；Stripe 订阅请改走 Billing Portal。'
            : 'Only legacy subscriptions can be cancelled in-app. Stripe subscriptions are managed in the billing portal.',
        });
        return;
      }

      if (!authSession?.userId) {
        setCheckoutState({
          open: true,
          mode: 'auth_required',
          planKey: normalizedPlan,
          billingCycle,
          source,
          session: null,
          loading: false,
          submitting: false,
          error: locale?.startsWith('zh')
            ? '请先登录，再进入支付。'
            : 'Please sign in before starting checkout.',
          note: locale?.startsWith('zh')
            ? '付费会员只能在已登录账号上购买，支付完成后也会绑定到当前账号。'
            : 'Paid membership can only be purchased on a signed-in account, and payment will be attached to that account.',
        });
        return;
      }

      setCheckoutState({
        open: true,
        mode: 'checkout',
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
        if (!payload?.session?.checkoutUrl) {
          throw new Error(
            locale?.startsWith('zh')
              ? '支付服务没有返回可跳转的 Stripe Checkout 地址。'
              : 'Billing did not return a hosted Stripe checkout URL.',
          );
        }
        setCheckoutState({
          open: true,
          mode: 'redirect',
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
    [applyRemoteState, authSession?.userId, billingState, fetchJson, locale],
  );

  const submitCheckout = useCallback(
    async ({ billingEmail, paymentMethodLast4 } = {}) => {
      if (!checkoutState?.open) return false;
      void billingEmail;
      void paymentMethodLast4;

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

      if (checkoutState.mode === 'auth_required') {
        setCheckoutState((current) =>
          current
            ? {
                ...current,
                submitting: false,
              }
            : current,
        );
        return false;
      }

      if (checkoutState.mode === 'downgrade') {
        if (!authSession?.userId) {
          setCheckoutState((current) =>
            current
              ? {
                  ...current,
                  submitting: false,
                  error: locale?.startsWith('zh')
                    ? '请先登录，再管理你的订阅。'
                    : 'Please sign in before managing your subscription.',
                }
              : current,
          );
          return false;
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

      setCheckoutState((current) =>
        current
          ? {
              ...current,
              submitting: false,
              error: locale?.startsWith('zh')
                ? '当前没有拿到可跳转的 Stripe Checkout 地址。'
                : 'No hosted Stripe checkout URL is available for this session.',
            }
          : current,
      );
      return false;
    },
    [
      applyRemoteState,
      authSession?.userId,
      checkoutState,
      fetchJson,
      locale,
      openPortal,
      onApplyPlan,
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

import { useMemo } from 'react';
import {
  buildMembershipPlans,
  formatMembershipPrice,
  membershipBillingCycleLabel,
  membershipPlanName,
} from '../utils/membership';

export default function BillingCheckoutSheet({
  open,
  locale,
  checkoutState,
  prefillEmail,
  onClose,
  onConfirm,
}) {
  const isZh = String(locale || '')
    .toLowerCase()
    .startsWith('zh');

  const plan = checkoutState?.planKey || 'lite';
  const billingCycle = checkoutState?.billingCycle || 'weekly';
  const priceLabel = formatMembershipPrice(plan, billingCycle, locale);
  const cadenceLabel = membershipBillingCycleLabel(billingCycle, locale);
  const planMeta = useMemo(
    () =>
      buildMembershipPlans(locale).find((item) => item.key === plan) ||
      buildMembershipPlans(locale)[0],
    [locale, plan],
  );
  const isDowngrade = checkoutState?.mode === 'downgrade';
  const isPortal = checkoutState?.mode === 'portal';
  const isRedirect = Boolean(checkoutState?.session?.checkoutUrl);
  const checkoutError = checkoutState?.error || '';

  if (!open || !checkoutState) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onConfirm?.({
      billingEmail: prefillEmail || checkoutState?.session?.checkoutEmail || '',
      paymentMethodLast4: null,
    });
  };

  const bodyCopy = isPortal
    ? isZh
      ? '当前订阅由外部 Billing Portal 管理。你可以在那里取消、降级或更新支付方式。'
      : 'This subscription is managed in the external billing portal, where you can cancel, downgrade, or update payment details.'
    : isDowngrade
      ? isZh
        ? '这会结束当前付费计划，并立即回到免费层。'
        : 'This ends the current paid plan and moves the account back to Free right away.'
      : isRedirect
        ? isZh
          ? '确认后会跳转到安全结账页完成支付。'
          : 'Confirm to continue to the secure hosted checkout page.'
        : checkoutState.preview
          ? isZh
            ? '当前不会真实扣款，只会在本地预览升级效果。'
            : 'No real charge is made in preview mode. This only updates the local upgrade preview.'
          : isZh
            ? '当前环境会使用内部 checkout 流程，仅用于本地或测试环境。'
            : 'This environment is using the internal checkout flow for local or test use only.';

  const primaryLabel = isPortal
    ? isZh
      ? '打开 Billing Portal'
      : 'Open billing portal'
    : isDowngrade
      ? isZh
        ? '确认切回 Free'
        : 'Confirm switch'
      : isRedirect
        ? isZh
          ? `前往 ${membershipPlanName(plan, locale)} 结账`
          : `Continue to ${membershipPlanName(plan, locale)} checkout`
        : checkoutState.preview
          ? isZh
            ? `预览升级到 ${membershipPlanName(plan, locale)}`
            : `Preview ${membershipPlanName(plan, locale)}`
          : isZh
            ? `完成 ${membershipPlanName(plan, locale)} 升级`
            : `Complete ${membershipPlanName(plan, locale)}`;

  return (
    <div
      className="membership-sheet-backdrop billing-checkout-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="glass-card membership-sheet billing-checkout-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={isZh ? '结账页' : 'Checkout'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="membership-sheet-head">
          <div>
            <p className="membership-sheet-eyebrow">
              {isPortal ? 'Billing Portal' : isZh ? 'Checkout' : 'Checkout'}
            </p>
            <h2 className="membership-sheet-title">
              {isPortal
                ? isZh
                  ? '管理当前订阅'
                  : 'Manage your subscription'
                : isDowngrade
                  ? isZh
                    ? '切回 Free'
                    : 'Switch back to Free'
                  : isZh
                    ? `升级到 ${membershipPlanName(plan, locale)}`
                    : `Upgrade to ${membershipPlanName(plan, locale)}`}
            </h2>
            <p className="membership-sheet-copy">{bodyCopy}</p>
          </div>
          <button
            type="button"
            className="membership-sheet-close"
            aria-label={isZh ? '关闭' : 'Close'}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="billing-checkout-summary">
          <div className="billing-checkout-plan">
            <div>
              <p className="membership-plan-name">
                {isDowngrade ? 'Free' : planMeta?.name || 'Lite'}
              </p>
              <p className="membership-plan-price">
                <strong>{isDowngrade ? (isZh ? '免费' : 'Free') : priceLabel}</strong>
                {!isDowngrade ? <span>{cadenceLabel}</span> : null}
              </p>
            </div>
            {checkoutState.preview ? (
              <span className="membership-plan-badge membership-plan-badge-accent">
                {isZh ? '预览模式' : 'Preview mode'}
              </span>
            ) : isPortal ? (
              <span className="membership-plan-badge membership-plan-badge-accent">
                {isZh ? '外部管理' : 'Provider-managed'}
              </span>
            ) : isRedirect ? (
              <span className="membership-plan-badge membership-plan-badge-accent">
                {isZh ? '安全结账' : 'Hosted checkout'}
              </span>
            ) : (
              <span className="membership-plan-badge">{isZh ? '内部环境' : 'Internal env'}</span>
            )}
          </div>
          {!isDowngrade ? <p className="membership-plan-blurb">{planMeta?.blurb}</p> : null}
          {!isDowngrade ? (
            <div className="membership-plan-features">
              {planMeta?.features?.map((feature) => (
                <span key={feature} className="membership-plan-feature">
                  {feature}
                </span>
              ))}
            </div>
          ) : null}
          {checkoutState.note ? (
            <p className="billing-checkout-note">{checkoutState.note}</p>
          ) : null}
          {!isPortal && !isDowngrade && (prefillEmail || checkoutState?.session?.checkoutEmail) ? (
            <p className="billing-checkout-disclaimer billing-checkout-disclaimer-plain">
              {isZh ? '账单邮箱' : 'Billing email'}:{' '}
              {prefillEmail || checkoutState?.session?.checkoutEmail}
            </p>
          ) : null}
        </div>

        {checkoutState.loading && !checkoutState.session ? (
          <div className="billing-checkout-loading">
            <div className="billing-checkout-loading-bar" />
            <p>{isZh ? '正在准备结账...' : 'Preparing your checkout…'}</p>
          </div>
        ) : (
          <form className="billing-checkout-form" onSubmit={handleSubmit}>
            {checkoutError ? <p className="billing-checkout-error">{checkoutError}</p> : null}

            <div className="billing-checkout-actions">
              <button
                type="submit"
                className="membership-plan-cta"
                disabled={Boolean(checkoutState.submitting || checkoutState.loading)}
              >
                {checkoutState.submitting ? (isZh ? '处理中...' : 'Working...') : primaryLabel}
              </button>
              <button
                type="button"
                className="membership-sheet-secondary"
                onClick={onClose}
                disabled={Boolean(checkoutState.submitting)}
              >
                {isZh ? '稍后再说' : 'Maybe later'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

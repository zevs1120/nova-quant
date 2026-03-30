import { useEffect, useMemo, useState } from 'react';
import {
  buildMembershipPlans,
  formatMembershipPrice,
  membershipBillingCycleLabel,
  membershipPlanName,
} from '../utils/membership';

function defaultForm(email = '') {
  return {
    billingEmail: email,
    cardholderName: '',
    cardNumber: '',
    expiry: '',
    cvc: '',
  };
}

function formatCardInput(value) {
  const digits = String(value || '')
    .replace(/\D+/g, '')
    .slice(0, 19);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiryInput(value) {
  const digits = String(value || '')
    .replace(/\D+/g, '')
    .slice(0, 4);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export default function BillingCheckoutSheet({
  open,
  locale,
  checkoutState,
  prefillEmail,
  onClose,
  onConfirm,
}) {
  const [form, setForm] = useState(() => defaultForm(prefillEmail));
  const [localError, setLocalError] = useState('');
  const isZh = String(locale || '')
    .toLowerCase()
    .startsWith('zh');

  useEffect(() => {
    if (!open) return;
    setForm(defaultForm(checkoutState?.session?.checkoutEmail || prefillEmail || ''));
    setLocalError('');
  }, [checkoutState?.session?.id, checkoutState?.mode, open, prefillEmail]);

  const plan = checkoutState?.planKey || 'lite';
  const billingCycle = checkoutState?.billingCycle || 'monthly';
  const priceLabel = formatMembershipPrice(plan, billingCycle, locale);
  const cadenceLabel = membershipBillingCycleLabel(billingCycle, locale);
  const planMeta = useMemo(
    () =>
      buildMembershipPlans(locale).find((item) => item.key === plan) ||
      buildMembershipPlans(locale)[0],
    [locale, plan],
  );
  const isDowngrade = checkoutState?.mode === 'downgrade';
  const checkoutError = checkoutState?.error || localError;

  if (!open || !checkoutState) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');

    if (isDowngrade) {
      await onConfirm?.({ billingEmail: '', paymentMethodLast4: null });
      return;
    }

    const billingEmail = String(form.billingEmail || '').trim();
    const cardNumberDigits = String(form.cardNumber || '').replace(/\D+/g, '');
    const expiryDigits = String(form.expiry || '').replace(/\D+/g, '');
    const cvcDigits = String(form.cvc || '').replace(/\D+/g, '');

    if (!billingEmail || !billingEmail.includes('@')) {
      setLocalError(isZh ? '请输入有效的账单邮箱。' : 'Enter a valid billing email.');
      return;
    }
    if (!String(form.cardholderName || '').trim()) {
      setLocalError(isZh ? '请输入持卡人姓名。' : 'Enter the cardholder name.');
      return;
    }
    if (cardNumberDigits.length < 12) {
      setLocalError(isZh ? '请输入有效的卡号。' : 'Enter a valid card number.');
      return;
    }
    if (expiryDigits.length !== 4) {
      setLocalError(isZh ? '请输入有效的到期时间。' : 'Enter a valid expiry date.');
      return;
    }
    if (cvcDigits.length < 3) {
      setLocalError(isZh ? '请输入有效的安全码。' : 'Enter a valid security code.');
      return;
    }

    await onConfirm?.({
      billingEmail,
      paymentMethodLast4: cardNumberDigits.slice(-4),
    });
  };

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
        aria-label={
          isDowngrade ? (isZh ? '切回 Free' : 'Switch to Free') : isZh ? '支付页' : 'Checkout'
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="membership-sheet-head">
          <div>
            <p className="membership-sheet-eyebrow">
              {isDowngrade ? (isZh ? 'Membership' : 'Membership') : isZh ? 'Checkout' : 'Checkout'}
            </p>
            <h2 className="membership-sheet-title">
              {isDowngrade
                ? isZh
                  ? '切回 Free'
                  : 'Switch back to Free'
                : isZh
                  ? `完成 ${membershipPlanName(plan, locale)} 升级`
                  : `Complete ${membershipPlanName(plan, locale)}`}
            </h2>
            <p className="membership-sheet-copy">
              {isDowngrade
                ? isZh
                  ? '这会结束当前付费计划，并立即回到免费层。'
                  : 'This ends the current paid plan and moves the account back to Free right away.'
                : isZh
                  ? '保留你的券商，完成一次更顺滑的 AI-native 决策升级。'
                  : 'Keep your broker and unlock the deeper AI-native decision layer.'}
            </p>
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
            ) : (
              <span className="membership-plan-badge">{isZh ? '实时写入' : 'Persisted'}</span>
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
        </div>

        {checkoutState.loading && !checkoutState.session ? (
          <div className="billing-checkout-loading">
            <div className="billing-checkout-loading-bar" />
            <p>{isZh ? '正在创建 checkout session...' : 'Creating your checkout session…'}</p>
          </div>
        ) : (
          <form className="billing-checkout-form" onSubmit={handleSubmit}>
            {!isDowngrade ? (
              <>
                <label className="billing-field">
                  <span>{isZh ? '账单邮箱' : 'Billing email'}</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={form.billingEmail}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        billingEmail: event.target.value,
                      }))
                    }
                    placeholder={isZh ? 'you@example.com' : 'you@example.com'}
                  />
                </label>

                <label className="billing-field">
                  <span>{isZh ? '持卡人姓名' : 'Cardholder name'}</span>
                  <input
                    type="text"
                    autoComplete="cc-name"
                    value={form.cardholderName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cardholderName: event.target.value,
                      }))
                    }
                    placeholder={isZh ? 'Bowen Chen' : 'Bowen Chen'}
                  />
                </label>

                <label className="billing-field">
                  <span>{isZh ? '银行卡号' : 'Card number'}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    value={form.cardNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cardNumber: formatCardInput(event.target.value),
                      }))
                    }
                    placeholder="4242 4242 4242 4242"
                  />
                </label>

                <div className="billing-field-grid">
                  <label className="billing-field">
                    <span>{isZh ? '到期时间' : 'Expiry'}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      value={form.expiry}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          expiry: formatExpiryInput(event.target.value),
                        }))
                      }
                      placeholder="MM/YY"
                    />
                  </label>
                  <label className="billing-field">
                    <span>{isZh ? '安全码' : 'CVC'}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      value={form.cvc}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          cvc: String(event.target.value || '')
                            .replace(/\D+/g, '')
                            .slice(0, 4),
                        }))
                      }
                      placeholder="123"
                    />
                  </label>
                </div>

                <p className="billing-checkout-disclaimer">
                  {checkoutState.preview
                    ? isZh
                      ? '当前不会真实扣款，只会完成本地预览升级。'
                      : 'No real charge is made in preview mode. This only updates the local upgrade preview.'
                    : isZh
                      ? '当前先写入内部 checkout 与订阅状态；卡片信息不会持久化，只保存末四位。'
                      : 'This currently writes an internal checkout and subscription record; card details are not persisted beyond the final four digits.'}
                </p>
              </>
            ) : (
              <p className="billing-checkout-disclaimer billing-checkout-disclaimer-plain">
                {checkoutState.preview
                  ? isZh
                    ? '这次切换会只在本地预览中生效。'
                    : 'This switch will only apply in local preview mode.'
                  : isZh
                    ? '确认后会立即取消当前订阅。'
                    : 'Confirming will cancel the current subscription immediately.'}
              </p>
            )}

            {checkoutError ? <p className="billing-checkout-error">{checkoutError}</p> : null}

            <div className="billing-checkout-actions">
              <button
                type="submit"
                className="membership-plan-cta"
                disabled={Boolean(checkoutState.submitting || checkoutState.loading)}
              >
                {checkoutState.submitting
                  ? isZh
                    ? '处理中...'
                    : 'Working...'
                  : isDowngrade
                    ? isZh
                      ? '确认切回 Free'
                      : 'Confirm switch'
                    : isZh
                      ? `确认升级到 ${membershipPlanName(plan, locale)}`
                      : `Confirm ${membershipPlanName(plan, locale)}`}
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

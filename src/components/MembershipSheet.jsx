import '../styles/membership.css';
import { buildMembershipPlans, normalizeMembershipPlan } from '../utils/membership';

export default function MembershipSheet({
  open,
  prompt,
  locale,
  currentPlan,
  remainingAskNova,
  onClose,
  onSelectPlan,
  onOpenMembershipCenter,
}) {
  if (!open || !prompt) return null;

  const zh = String(locale || '')
    .toLowerCase()
    .startsWith('zh');
  const plans = buildMembershipPlans(locale);
  const normalizedCurrentPlan = normalizeMembershipPlan(currentPlan);

  return (
    <div className="membership-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="glass-card membership-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={prompt.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="membership-sheet-head">
          <div>
            <p className="membership-sheet-eyebrow">{prompt.eyebrow}</p>
            <h2 className="membership-sheet-title">{prompt.title}</h2>
            <p className="membership-sheet-copy">{prompt.body}</p>
          </div>
          <button
            type="button"
            className="membership-sheet-close"
            aria-label={zh ? '关闭' : 'Close'}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="membership-sheet-inline-stats">
          <div className="membership-inline-stat">
            <span>{zh ? '当前计划' : 'Current plan'}</span>
            <strong>
              {plans.find((item) => item.key === normalizedCurrentPlan)?.name || 'Free'}
            </strong>
          </div>
          <div className="membership-inline-stat">
            <span>{zh ? 'Ask Nova 余额' : 'Ask Nova left'}</span>
            <strong>
              {remainingAskNova === null ? (zh ? '高额度' : 'High') : remainingAskNova}
            </strong>
          </div>
        </div>

        <div className="membership-plan-grid">
          {plans.map((plan) => {
            const isCurrent = plan.key === normalizedCurrentPlan;
            const isRecommended = plan.key === prompt.targetPlan;
            return (
              <article
                key={plan.key}
                className={`membership-plan-card ${isCurrent ? 'is-current' : ''} ${
                  isRecommended ? 'is-recommended' : ''
                }`}
              >
                <div className="membership-plan-head">
                  <div>
                    <p className="membership-plan-name">{plan.name}</p>
                    <p className="membership-plan-price">
                      <strong>{plan.price}</strong>
                      {plan.cadence ? <span>{plan.cadence}</span> : null}
                    </p>
                  </div>
                  {isCurrent ? (
                    <span className="membership-plan-badge">{zh ? '当前' : 'Current'}</span>
                  ) : isRecommended ? (
                    <span className="membership-plan-badge membership-plan-badge-accent">
                      {zh ? '推荐' : 'Recommended'}
                    </span>
                  ) : null}
                </div>
                <p className="membership-plan-blurb">{plan.blurb}</p>
                <div className="membership-plan-features">
                  {plan.features.map((feature) => (
                    <span key={feature} className="membership-plan-feature">
                      {feature}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className={`membership-plan-cta ${isCurrent ? 'is-disabled' : ''}`}
                  disabled={isCurrent}
                  onClick={() => onSelectPlan?.(plan.key)}
                >
                  {isCurrent
                    ? zh
                      ? '当前计划'
                      : 'Current plan'
                    : plan.key === 'pro'
                      ? zh
                        ? '升级到 Pro'
                        : 'Go Pro'
                      : plan.key === 'lite'
                        ? zh
                          ? '升级到 Lite'
                          : 'Start Lite'
                        : zh
                          ? '继续免费版'
                          : 'Stay Free'}
                </button>
              </article>
            );
          })}
        </div>

        <div className="membership-sheet-footer">
          <button
            type="button"
            className="membership-sheet-secondary"
            onClick={onOpenMembershipCenter}
          >
            {zh ? '查看完整计划页' : 'See full plan center'}
          </button>
        </div>
      </section>
    </div>
  );
}

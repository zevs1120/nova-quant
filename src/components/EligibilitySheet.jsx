function outcomeForChecks(checks) {
  const hasHardFail = checks.some((item) => item.state === 'fail');
  if (hasHardFail) return { label: '❌ Skip today', tone: 'badge-expired' };
  const hasWarn = checks.some((item) => item.state === 'warn');
  if (hasWarn) return { label: '⚠ Trade OK but reduce size', tone: 'badge-medium' };
  return { label: '✅ Trade OK', tone: 'badge-triggered' };
}

export default function EligibilitySheet({ open, signal, checks, onClose, t }) {
  if (!open || !signal) return null;
  const outcome = outcomeForChecks(checks || []);

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <section
        className="sheet-card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="card-header">
          <h3 className="card-title">{t('signals.eligibilityTitle')}</h3>
          <button type="button" className="ghost-btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <p className="muted">
          {signal.symbol} · {signal.market}
        </p>
        <div className="detail-list">
          {(checks || []).map((check) => (
            <div className="detail-row" key={check.key}>
              <span className="detail-label">{check.label}</span>
              <span
                className={`detail-value ${check.state === 'fail' ? 'negative' : check.state === 'warn' ? '' : 'positive'}`}
              >
                {check.reason || check.value}
              </span>
            </div>
          ))}
        </div>
        <div className={`badge ${outcome.tone}`}>
          <strong>{outcome.label}</strong>
        </div>
      </section>
    </div>
  );
}

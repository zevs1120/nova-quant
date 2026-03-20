import { useEffect } from 'react';

export default function TradeTicketSheet({
  open,
  signal,
  intent,
  locale = 'en',
  onClose,
  onAskAi,
  onPaperExecute
}) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    document.body.classList.add('app-modal-open');
    return () => {
      document.body.classList.remove('app-modal-open');
    };
  }, [open]);

  if (!open || !signal || !intent) return null;

  const isZh = String(locale || '').startsWith('zh');
  const handoffLabel = intent.handoffPrefillsTicket
    ? isZh
      ? `跳转 ${intent.broker} 下单页`
      : `Open ${intent.broker} ticket`
    : isZh
      ? `打开 ${intent.broker}`
      : `Open ${intent.broker}`;
  const handoffHint = intent.handoffPrefillsTicket
    ? isZh
      ? '会尽量带上方向、价格和风控参数。'
      : 'Will carry side, price, and risk fields when the broker template supports it.'
    : isZh
      ? '会打开券商页面，同时保留可复制票据。'
      : 'Opens the broker surface and keeps the ticket ready to copy.';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(intent.copyText || '');
    } catch {
      // Best-effort clipboard helper only.
    }
  };

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <section className="sheet-card trade-ticket-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="card-header">
          <div>
            <h3 className="card-title">{isZh ? '交易票据' : 'Trade ticket'}</h3>
            <p className="muted">
              {intent.symbol} · {intent.market} · {intent.orderType}
            </p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            {isZh ? '关闭' : 'Close'}
          </button>
        </div>

        <div className="trade-ticket-banner">
          <div>
            <p className="trade-ticket-kicker">{isZh ? '当前动作' : 'Current action'}</p>
            <h4 className="trade-ticket-symbol">
              {intent.symbol} · {intent.side}
            </h4>
          </div>
          <span className={`today-summary-status today-summary-status-${intent.canOpenBroker ? 'trade' : 'wait'}`}>
            {intent.canOpenBroker
              ? handoffLabel
              : isZh
                ? '复制票据'
                : 'Copy ticket'}
          </span>
        </div>

        <div className="detail-list">
          <div className="detail-row">
            <span className="detail-label">{isZh ? '入场区间' : 'Entry range'}</span>
            <span className="detail-value">{intent.entryLabel}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{isZh ? '止损' : 'Stop loss'}</span>
            <span className="detail-value">{Number.isFinite(intent.stopLoss) ? intent.stopLoss.toFixed(2) : '--'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{isZh ? '目标' : 'Targets'}</span>
            <span className="detail-value">
              {intent.targets.length
                ? intent.targets.map((row) => row.price.toFixed(2)).join(' / ')
                : '--'}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{isZh ? '建议仓位' : 'Size guide'}</span>
            <span className="detail-value">{Number.isFinite(intent.sizePct) ? `${intent.sizePct}%` : '--'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{isZh ? '把握' : 'Confidence'}</span>
            <span className="detail-value">{intent.confidencePct ? `${intent.confidencePct}%` : '--'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{isZh ? '策略来源' : 'Strategy source'}</span>
            <span className="detail-value">{intent.strategySource || '--'}</span>
          </div>
        </div>

        {intent.canOpenBroker || intent.whyNow || intent.riskNote ? (
          <div className="trade-ticket-notes">
            {intent.canOpenBroker ? (
              <div className="trade-ticket-note-block">
                <p className="trade-ticket-note-label">{isZh ? '券商跳转' : 'Broker handoff'}</p>
                <p className="trade-ticket-note-copy">{handoffHint}</p>
              </div>
            ) : null}
            {intent.whyNow ? (
              <div className="trade-ticket-note-block">
                <p className="trade-ticket-note-label">{isZh ? '为什么是现在' : 'Why now'}</p>
                <p className="trade-ticket-note-copy">{intent.whyNow}</p>
              </div>
            ) : null}
            {intent.riskNote ? (
              <div className="trade-ticket-note-block">
                <p className="trade-ticket-note-label">{isZh ? '风险提醒' : 'Risk note'}</p>
                <p className="trade-ticket-note-copy">{intent.riskNote}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {intent.checklist.length ? (
          <div className="trade-ticket-checklist">
            <p className="trade-ticket-note-label">{isZh ? '执行清单' : 'Execution checklist'}</p>
            <ul className="bullet-list">
              {intent.checklist.slice(0, 5).map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="action-row trade-ticket-actions">
          {intent.canOpenBroker ? (
            <a
              className="primary-btn"
              href={intent.brokerHandoffUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => onPaperExecute?.(signal)}
            >
              {handoffLabel}
            </a>
          ) : (
            <button type="button" className="primary-btn" onClick={handleCopy}>
              {isZh ? '复制交易票据' : 'Copy trade ticket'}
            </button>
          )}
          <button type="button" className="secondary-btn" onClick={() => onAskAi?.(signal, intent)}>
            {isZh ? '问 Nova 这笔怎么做' : 'Ask Nova about this setup'}
          </button>
        </div>

        <div className="action-row trade-ticket-actions">
          <button type="button" className="ghost-btn" onClick={() => onPaperExecute?.(signal)}>
            {isZh ? '记录为纸面执行' : 'Save as paper execution'}
          </button>
          <button type="button" className="ghost-btn" onClick={onClose}>
            {isZh ? '稍后再做' : 'Later'}
          </button>
        </div>
      </section>
    </div>
  );
}

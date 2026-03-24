import { confidenceBand, directionIcon, formatDateTime, formatNumber } from '../utils/format';

function normalizeConfidenceLevel(signal) {
  if (Number.isFinite(signal.confidence_level)) return Number(signal.confidence_level);
  if (Number(signal.confidence) <= 1) return Number(signal.confidence) * 5;
  return Number(signal.confidence || 3);
}

function buildOrderText(signal) {
  const tp = signal.take_profit_levels?.[0]?.price ?? signal.take_profit;
  return [
    `symbol: ${signal.symbol}`,
    `asset_class: ${signal.asset_class || (signal.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK')}`,
    `market: ${signal.market}`,
    `side: ${signal.direction}`,
    `entry: ${signal.entry_zone?.low ?? signal.entry_min} - ${signal.entry_zone?.high ?? signal.entry_max}`,
    `stop: ${signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss}`,
    `tp1: ${tp}`,
    `size: ${signal.position_advice?.position_pct ?? signal.position_size_pct}%`,
    `horizon_days: ${signal.holding_horizon_days ?? '--'}`,
    `status: ${signal.status}`,
    `signal_id: ${signal.signal_id}`,
  ].join('\n');
}

function toRiskTag(signal, t) {
  const riskScore = Number(signal.risk_score ?? 50);
  if (riskScore >= 68)
    return `${t('signals.riskHigh', undefined, 'Risk: High')} (${riskScore.toFixed(0)})`;
  if (riskScore >= 42)
    return `${t('signals.riskMedium', undefined, 'Risk: Medium')} (${riskScore.toFixed(0)})`;
  return `${t('signals.riskLow', undefined, 'Risk: Low')} (${riskScore.toFixed(0)})`;
}

function toRegimeTag(signal, t) {
  const compatibility = Number(signal.regime_compatibility ?? 50);
  if (compatibility >= 72)
    return `${t('signals.regimeGood', undefined, 'Regime fit: Good')} (${compatibility.toFixed(0)})`;
  if (compatibility >= 45)
    return `${t('signals.regimeWatch', undefined, 'Regime fit: Watch')} (${compatibility.toFixed(0)})`;
  return `${t('signals.regimePoor', undefined, 'Regime fit: Poor')} (${compatibility.toFixed(0)})`;
}

function freshnessLabel(signal, t, locale) {
  const createdAt = new Date(signal.created_at ?? signal.generated_at);
  const expiresAt = new Date(signal.expires_at || createdAt.getTime() + 24 * 3600 * 1000);
  const diffMs = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(diffMs))
    return formatDateTime(signal.created_at ?? signal.generated_at, locale);
  if (diffMs <= 0) return t('signals.freshExpired', undefined, 'Expired');
  const hours = Math.round(diffMs / 3600000);
  if (hours <= 1) return t('signals.freshSoon', undefined, 'Expires soon');
  return t('signals.freshInHours', { value: hours }, `Expires in ${hours}h`);
}

function confidencePct(level) {
  return Math.max(5, Math.min(100, (Number(level) / 5) * 100));
}

function coachMode(signal, t) {
  const size = Number(signal.position_advice?.position_pct ?? signal.position_size_pct ?? 0);
  if (
    String(signal.status).toUpperCase() !== 'TRIGGERED' &&
    String(signal.status).toUpperCase() !== 'NEW'
  ) {
    return t('signals.watchOnly', undefined, 'Watch first');
  }
  if (size >= 14) return t('signals.normalRiskHint', undefined, 'Normal size');
  if (size > 0) return t('signals.lightRiskHint', undefined, 'Light size');
  return t('signals.waitHint', undefined, 'Wait');
}

export default function SignalCard({
  signal,
  onSelect,
  isWatched,
  onToggleWatch,
  onQuickAsk,
  onEligibilityCheck,
  onExecute,
  onMarkDone,
  t,
  locale,
}) {
  const confidenceLevel = normalizeConfidenceLevel(signal);
  const confidenceKey = confidenceBand(confidenceLevel);
  const entryLow = signal.entry_zone?.low ?? signal.entry_min;
  const entryHigh = signal.entry_zone?.high ?? signal.entry_max;
  const stop = signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss;
  const tp1 = signal.take_profit_levels?.[0]?.price ?? signal.take_profit;
  const tp2 = signal.take_profit_levels?.[1]?.price ?? signal.take_profit;
  const size = signal.position_advice?.position_pct ?? signal.position_size_pct;
  const bullets = (signal.explain_bullets || signal.rationale || []).slice(0, 3);
  const horizon = signal.holding_horizon_days ?? (signal.timeframe?.includes('H') ? 1.8 : 2.8);
  const hasRegimeMismatch = signal.risk_warnings?.includes('regime_mismatch');
  const hasCorrCluster = signal.risk_warnings?.includes('correlation_cluster');

  return (
    <article
      className="signal-card"
      onClick={() => onSelect(signal)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(signal)}
    >
      <div className="signal-row">
        <div>
          <h3 className="signal-symbol">{signal.symbol}</h3>
          <p className="signal-meta">
            {t(`direction.${signal.direction}`, undefined, signal.direction)} ·{' '}
            {freshnessLabel(signal, t, locale)}
          </p>
        </div>
        <div className="signal-right-head">
          {signal.grade ? <span className="badge badge-neutral">Grade {signal.grade}</span> : null}
          <span className={`badge badge-${String(signal.status).toLowerCase()}`}>
            {t(`status.${signal.status}`, undefined, signal.status)}
          </span>
          <button
            type="button"
            className={`watch-btn ${isWatched ? 'watched' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleWatch(signal.symbol);
            }}
            aria-label={t('signals.watchlistToggle')}
          >
            {isWatched ? '★' : '☆'}
          </button>
        </div>
      </div>

      <div className="confidence-ribbon">
        <div className="confidence-track">
          <div
            className="confidence-fill"
            style={{ width: `${confidencePct(confidenceLevel)}%` }}
          />
        </div>
        <p className="signal-meta">
          {t('signals.confShort')}: {t(`confidenceBand.${confidenceKey}`)} (
          {confidenceLevel.toFixed(1)}/5)
        </p>
      </div>

      <div className="signal-simple-plan">
        <div className="plan-cell">
          <span className="detail-label">{t('signals.positionSize')}</span>
          <span className="detail-value">{coachMode(signal, t)}</span>
        </div>
        <div className="plan-cell">
          <span className="detail-label">{t('signals.timeframe', undefined, 'Timing')}</span>
          <span className="detail-value">{formatNumber(horizon, 1, locale)}d</span>
        </div>
        <div className="plan-cell plan-cell-wide">
          <span className="detail-label">{t('signals.riskLine', undefined, 'Risk line')}</span>
          <span className="detail-value">
            {Number.isFinite(stop) ? formatNumber(stop, 2, locale) : '--'} ·{' '}
            {t('signals.stopEarlyHint', undefined, 'get out if it breaks')}
          </span>
        </div>
      </div>

      <div className="signal-grid">
        <div className="chip">
          <span>{directionIcon(signal.direction)}</span>
          <span>{toRiskTag(signal, t)}</span>
        </div>
        <div className="chip">
          <span>{toRegimeTag(signal, t)}</span>
        </div>
        {hasRegimeMismatch ? (
          <div className="badge badge-medium">
            {t('signals.warnMismatchShort', undefined, 'Regime mismatch')}
          </div>
        ) : null}
        {hasCorrCluster ? (
          <div className="badge badge-medium">
            {t('signals.warnCorrelationShort', undefined, 'Correlation cluster')}
          </div>
        ) : null}
      </div>

      {bullets.length ? (
        <ul className="bullet-list signal-bullet-list">
          {bullets.slice(0, 2).map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ul>
      ) : null}

      <div className="signal-quick-row signal-gate-row">
        <button
          type="button"
          className="quick-ask-btn gate-btn"
          onClick={(event) => {
            event.stopPropagation();
            onEligibilityCheck?.(signal);
          }}
        >
          {t('signals.canITrade')}
        </button>
      </div>

      <div className="signal-quick-row">
        <button
          type="button"
          className="quick-ask-btn"
          onClick={(event) => {
            event.stopPropagation();
            onQuickAsk?.('explain', signal);
          }}
        >
          {t('chat.quick.explain')}
        </button>
        <button
          type="button"
          className="quick-ask-btn"
          onClick={(event) => {
            event.stopPropagation();
            onQuickAsk?.('execute', signal);
          }}
        >
          {t('chat.quick.execute')}
        </button>
        <button
          type="button"
          className="quick-ask-btn"
          onClick={async (event) => {
            event.stopPropagation();
            try {
              await navigator.clipboard.writeText(buildOrderText(signal));
            } catch {
              // no-op
            }
          }}
        >
          {t('signals.copyParams')}
        </button>
        <button
          type="button"
          className="quick-ask-btn"
          onClick={(event) => {
            event.stopPropagation();
            onExecute?.(signal);
          }}
        >
          {t('signals.paperExecute')}
        </button>
      </div>

      <div className="signal-quick-row signal-secondary-row">
        <button
          type="button"
          className="quick-ask-btn"
          onClick={(event) => {
            event.stopPropagation();
            onMarkDone?.(signal);
          }}
        >
          {t('signals.markDone')}
        </button>
      </div>
    </article>
  );
}

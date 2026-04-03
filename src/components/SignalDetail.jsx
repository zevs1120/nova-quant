import '../styles/today-final.css';
import { useMemo, useState } from 'react';
import { formatNumber } from '../utils/format';
import { resolveSignalEntryBounds } from '../utils/signalEntryBounds.js';
import {
  formatSignalDetailTimestamp,
  humanizeSignalToken,
  humanSignalAssetLabel,
  humanSignalDirectionLabel,
  humanSignalPositionSizeText,
  humanSignalStatusLabel,
  humanSignalValidityText,
} from '../utils/signalHumanLabels.js';

function infoRow(label, value) {
  return (
    <div className="detail-row" key={label}>
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

export default function SignalDetail({
  signal,
  locale = 'en',
  onBack,
  onOpenTradeTicket,
  primaryActionLabel,
  onAskAi,
  onPaperExecute,
  loadingDetails = false,
  loadError = '',
  t,
  backLabel = 'Back',
}) {
  const [copied, setCopied] = useState(false);
  const isZh = String(locale || '').startsWith('zh');

  const { entryMin, entryMax, stopLossPrice, takeProfitLevels } = resolveSignalEntryBounds(signal);
  const primaryActionCount = onOpenTradeTicket ? 3 : 2;
  const secondaryActionCount = [onAskAi, onPaperExecute].filter(Boolean).length;
  const detailRows = useMemo(
    () => [
      [isZh ? '进场区间' : 'Entry zone', `${formatNumber(entryMin)} - ${formatNumber(entryMax)}`],
      [isZh ? '止损位' : 'Stop loss', formatNumber(stopLossPrice)],
      [isZh ? '止盈位' : 'Take profit', formatNumber(signal.take_profit)],
      [
        isZh ? '把握度' : 'Confidence',
        Number.isFinite(Number(signal.confidence ?? signal.conviction))
          ? `${Math.round(Number(signal.confidence ?? signal.conviction) * 100)}%`
          : '--',
      ],
      [
        isZh ? '创建时间' : 'Created',
        formatSignalDetailTimestamp(signal.generated_at || signal.created_at, locale),
      ],
      [
        isZh ? '策略来源' : 'Strategy',
        humanizeSignalToken(signal.strategy_source || 'AI quant strategy'),
      ],
      [isZh ? '建议仓位' : 'Suggested size', humanSignalPositionSizeText(signal, isZh)],
      [isZh ? '有效期' : 'Valid for', humanSignalValidityText(signal, isZh)],
      [isZh ? '模型版本' : 'Model version', humanizeSignalToken(signal.model_version)],
      [isZh ? '参考编号' : 'Reference ID', signal.signal_id || '--'],
    ],
    [entryMax, entryMin, isZh, locale, signal, stopLossPrice],
  );

  const orderText = useMemo(
    () =>
      [
        `symbol: ${signal.symbol}`,
        `asset_class: ${signal.asset_class || (signal.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK')}`,
        `market: ${signal.market}`,
        `strategy_id: ${signal.strategy_id ?? '--'}`,
        `timeframe: ${signal.timeframe ?? '--'}`,
        `regime_id: ${signal.regime_id ?? '--'}`,
        `side: ${signal.direction}`,
        `entry: ${formatNumber(entryMin)} - ${formatNumber(entryMax)}`,
        `invalidation: ${formatNumber(signal.invalidation_level ?? stopLossPrice)}`,
        `SL: ${formatNumber(stopLossPrice)}`,
        `TP_levels: ${takeProfitLevels.map((level) => formatNumber(level)).join(' | ')}`,
        `trailing_rule: ${JSON.stringify(signal.trailing_rule ?? {})}`,
        `size: ${signal.position_pct ?? signal.position_size_pct ?? '--'}%`,
        `expected_R: ${signal.expected_R ?? '--'}`,
        `hit_rate_est: ${signal.hit_rate_est ?? '--'}`,
        `cost_estimate_bps: ${signal.cost_estimate?.total_bps ?? '--'}`,
        `validity: ${signal.validity}`,
        `signal_id: ${signal.signal_id}`,
        `model_version: ${signal.model_version}`,
      ].join('\n'),
    [signal, entryMin, entryMax, takeProfitLevels, stopLossPrice],
  );

  const shareUrl = `${window.location.origin}${window.location.pathname}?signal_id=${signal.signal_id}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(orderText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('signals.shareTitle', { symbol: signal.symbol }),
          text: orderText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fall through to clipboard when share is cancelled/unsupported.
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="detail-screen today-detail-screen today-detail-stage">
      <div className="detail-nav-bar today-detail-nav-bar">
        <button
          type="button"
          className="ios-nav-back detail-nav-back today-detail-nav-back"
          onClick={onBack}
          aria-label={`Back to ${backLabel}`}
          data-gesture-ignore="true"
        >
          <span className="ios-back-chevron" aria-hidden="true">
            ‹
          </span>
          <span className="ios-back-label">{backLabel}</span>
        </button>
        <p className="detail-nav-title today-detail-nav-title">{signal.symbol}</p>
        <span className="detail-nav-spacer today-detail-nav-spacer" aria-hidden="true" />
      </div>

      <div className="today-detail-body">
        <article
          className="glass-card today-detail-panel today-detail-summary-panel"
          data-gesture-ignore="true"
        >
          <div className="signal-row today-detail-summary-head">
            <div>
              <h2 className="headline today-detail-headline">{signal.symbol}</h2>
              <p className="muted today-detail-muted">
                {humanSignalAssetLabel(signal, isZh)} ·{' '}
                {humanSignalDirectionLabel(signal.direction, isZh)}
              </p>
            </div>
            <div className={`badge badge-${signal.status.toLowerCase()} today-detail-status-badge`}>
              {humanSignalStatusLabel(signal.status, isZh)}
            </div>
          </div>

          {loadingDetails ? (
            <p className="muted status-line today-detail-status-line">
              {isZh ? '正在补全完整计划…' : 'Loading the full execution plan…'}
            </p>
          ) : null}
          {loadError ? (
            <p className="muted status-line today-detail-status-line">{loadError}</p>
          ) : null}

          <div className="detail-list today-detail-list">
            {detailRows.map(([label, value]) => infoRow(label, value))}
          </div>
        </article>

        {signal.payload?.kind === 'OPTIONS_INTRADAY' ? (
          <article className="glass-card today-detail-panel">
            <h3 className="card-title today-detail-card-title">{t('signals.optionContract')}</h3>
            <div className="detail-list today-detail-list">
              {[
                ['Underlying', signal.payload.data?.underlying?.symbol || '--'],
                ['Contract', signal.payload.data?.option_contract?.contract_symbol || '--'],
                ['DTE', signal.payload.data?.option_contract?.dte ?? '--'],
                ['Delta', signal.payload.data?.greeks_iv?.delta ?? '--'],
              ].map(([label, value]) => infoRow(label, value))}
            </div>
          </article>
        ) : null}

        {signal.payload?.kind === 'STOCK_SWING' ? (
          <article className="glass-card today-detail-panel">
            <h3 className="card-title today-detail-card-title">{t('signals.stockHorizon')}</h3>
            <div className="detail-list today-detail-list">
              {infoRow('Horizon', signal.payload.data?.horizon || '--')}
            </div>
          </article>
        ) : null}

        {signal.payload?.kind === 'CRYPTO' ? (
          <article className="glass-card today-detail-panel">
            <h3 className="card-title today-detail-card-title">
              {t('signals.cryptoFundingBasis')}
            </h3>
            <div className="detail-list today-detail-list">
              {[
                ['Funding', signal.payload.data?.perp_metrics?.funding_rate_current ?? '--'],
                ['Basis(bps)', signal.payload.data?.perp_metrics?.basis_bps ?? '--'],
                ['Basis %ile', signal.payload.data?.perp_metrics?.basis_percentile ?? '--'],
              ].map(([label, value]) => infoRow(label, value))}
            </div>
          </article>
        ) : null}

        <article className="glass-card today-detail-panel" data-gesture-ignore="true">
          <h3 className="card-title today-detail-card-title">{t('signals.rationale')}</h3>
          <ul className="bullet-list today-detail-bullet-list">
            {(signal.rationale || signal.explain_bullets || []).map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </article>

        {signal.execution_checklist?.length ? (
          <article className="glass-card today-detail-panel" data-gesture-ignore="true">
            <h3 className="card-title today-detail-card-title">
              {t('signals.executionChecklist')}
            </h3>
            <ul className="bullet-list today-detail-bullet-list">
              {signal.execution_checklist.map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
            </ul>
          </article>
        ) : null}

        <div
          className={`action-row today-detail-action-row today-detail-action-row-${primaryActionCount}`}
          data-gesture-ignore="true"
        >
          {onOpenTradeTicket ? (
            <button type="button" className="primary-btn" onClick={onOpenTradeTicket}>
              {primaryActionLabel || (isZh ? '去券商下单' : 'Open ticket')}
            </button>
          ) : null}
          <button type="button" className="primary-btn" onClick={handleCopy}>
            {copied ? (isZh ? '已复制' : 'Copied') : isZh ? '复制这套参数' : 'Copy setup'}
          </button>
          <button type="button" className="secondary-btn" onClick={handleShare}>
            {isZh ? '分享链接' : 'Share link'}
          </button>
        </div>

        {onAskAi || onPaperExecute ? (
          <div
            className={`action-row today-detail-action-row today-detail-action-row-${Math.max(secondaryActionCount, 1)}`}
            data-gesture-ignore="true"
          >
            {onAskAi ? (
              <button type="button" className="secondary-btn" onClick={onAskAi}>
                {isZh ? '问 Nova 这笔怎么做' : 'Ask Nova about this setup'}
              </button>
            ) : null}
            {onPaperExecute ? (
              <button type="button" className="ghost-btn" onClick={onPaperExecute}>
                {isZh ? '记录为纸面执行' : 'Save as paper execution'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

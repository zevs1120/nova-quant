import { useMemo, useState } from 'react';
import { formatNumber } from '../utils/format';

function infoRow(label, value) {
  return (
    <div className="detail-row" key={label}>
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

export default function SignalDetail({ signal, onBack, t, backLabel = 'Back' }) {
  const [copied, setCopied] = useState(false);

  const entryMin = signal.entry_zone?.low ?? signal.entry_zone?.min ?? signal.entry_min;
  const entryMax = signal.entry_zone?.high ?? signal.entry_zone?.max ?? signal.entry_max;
  const stopLossPrice = signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss;
  const takeProfitLevels =
    signal.take_profit_levels && signal.take_profit_levels.length
      ? signal.take_profit_levels.map((level) => (typeof level === 'number' ? level : level.price))
      : [signal.take_profit].filter((value) => value !== null && value !== undefined);

  const orderText = useMemo(
    () => [
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
      `size: ${(signal.position_pct ?? signal.position_size_pct) ?? '--'}%`,
      `expected_R: ${signal.expected_R ?? '--'}`,
      `hit_rate_est: ${signal.hit_rate_est ?? '--'}`,
      `cost_estimate_bps: ${signal.cost_estimate?.total_bps ?? '--'}`,
      `validity: ${signal.validity}`,
      `signal_id: ${signal.signal_id}`,
      `model_version: ${signal.model_version}`
    ].join('\n'),
    [signal, entryMin, entryMax, takeProfitLevels, stopLossPrice]
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
          url: shareUrl
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
    <section className="detail-screen">
      <div className="detail-nav-bar">
        <button type="button" className="ios-nav-back detail-nav-back" onClick={onBack} aria-label={`Back to ${backLabel}`}>
          <span className="ios-back-chevron" aria-hidden="true">
            ‹
          </span>
          <span className="ios-back-label">{backLabel}</span>
        </button>
        <p className="detail-nav-title">{signal.symbol}</p>
        <span className="detail-nav-spacer" aria-hidden="true" />
      </div>

      <article className="glass-card">
        <div className="signal-row">
          <div>
            <h2 className="headline">{signal.symbol}</h2>
            <p className="muted">
              {signal.asset_class === 'OPTIONS'
                ? t('common.options')
                : signal.asset_class === 'US_STOCK'
                  ? t('common.stocks')
                  : signal.market === 'US'
                    ? t('common.usStocks')
                    : t('common.crypto')}{' '}
              · {t(`direction.${signal.direction}`, undefined, signal.direction)}
            </p>
          </div>
          <div className={`badge badge-${signal.status.toLowerCase()}`}>{t(`status.${signal.status}`, undefined, signal.status)}</div>
        </div>

        <div className="detail-list">
          {[
            [t('signals.entryZone'), `${formatNumber(entryMin)} - ${formatNumber(entryMax)}`],
            [t('signals.stopLoss'), formatNumber(stopLossPrice)],
            [t('signals.takeProfit'), formatNumber(signal.take_profit)],
            ['Confidence', Number.isFinite(Number(signal.confidence ?? signal.conviction)) ? `${Math.round(Number(signal.confidence ?? signal.conviction) * 100)}%` : '--'],
            ['Generated', signal.generated_at || signal.created_at || '--'],
            ['Strategy Source', signal.strategy_source || 'AI quant strategy'],
            [t('signals.positionSize'), t('signals.positionSizeValue', { value: signal.position_size_pct })],
            [t('signals.validity'), t(`validity.${signal.validity}`, undefined, signal.validity)],
            [t('signals.modelVersion'), signal.model_version],
            [t('signals.signalId'), signal.signal_id]
          ].map(([label, value]) => infoRow(label, value))}
        </div>
      </article>

      {signal.payload?.kind === 'OPTIONS_INTRADAY' ? (
        <article className="glass-card">
          <h3 className="card-title">{t('signals.optionContract')}</h3>
          <div className="detail-list">
            {[
              ['Underlying', signal.payload.data?.underlying?.symbol || '--'],
              ['Contract', signal.payload.data?.option_contract?.contract_symbol || '--'],
              ['DTE', signal.payload.data?.option_contract?.dte ?? '--'],
              ['Delta', signal.payload.data?.greeks_iv?.delta ?? '--']
            ].map(([label, value]) => infoRow(label, value))}
          </div>
        </article>
      ) : null}

      {signal.payload?.kind === 'STOCK_SWING' ? (
        <article className="glass-card">
          <h3 className="card-title">{t('signals.stockHorizon')}</h3>
          <div className="detail-list">{infoRow('Horizon', signal.payload.data?.horizon || '--')}</div>
        </article>
      ) : null}

      {signal.payload?.kind === 'CRYPTO' ? (
        <article className="glass-card">
          <h3 className="card-title">{t('signals.cryptoFundingBasis')}</h3>
          <div className="detail-list">
            {[
              ['Funding', signal.payload.data?.perp_metrics?.funding_rate_current ?? '--'],
              ['Basis(bps)', signal.payload.data?.perp_metrics?.basis_bps ?? '--'],
              ['Basis %ile', signal.payload.data?.perp_metrics?.basis_percentile ?? '--']
            ].map(([label, value]) => infoRow(label, value))}
          </div>
        </article>
      ) : null}

      <article className="glass-card">
        <h3 className="card-title">{t('signals.rationale')}</h3>
        <ul className="bullet-list">
          {(signal.rationale || signal.explain_bullets || []).map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ul>
      </article>

      {signal.execution_checklist?.length ? (
        <article className="glass-card">
          <h3 className="card-title">{t('signals.executionChecklist')}</h3>
          <ul className="bullet-list">
            {signal.execution_checklist.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </article>
      ) : null}

      <div className="action-row">
        <button type="button" className="primary-btn" onClick={handleCopy}>
          {copied ? t('common.copied') : t('signals.copyParams')}
        </button>
        <button type="button" className="secondary-btn" onClick={handleShare}>
          {t('signals.shareLink')}
        </button>
      </div>
    </section>
  );
}

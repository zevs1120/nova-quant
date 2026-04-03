import { useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber } from '../utils/format';

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolveDetailGestureIntent(dx, dy, vx = 0, vy = 0) {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const absVx = Math.abs(vx);
  if ((dy <= -68 || (vy < -0.44 && absDy > 16)) && absDy > absDx * 0.98) return 'later';
  if ((absDx >= 60 || (absVx > 0.4 && absDx > 15)) && absDx > Math.max(absDy * 0.98, 16)) {
    return dx > 0 ? 'accept' : 'skip';
  }
  return null;
}

function isNestedInteractiveTarget(target, currentTarget) {
  return (
    target instanceof HTMLElement &&
    target !== currentTarget &&
    Boolean(target.closest('[data-gesture-ignore="true"], button, a, input, textarea, select'))
  );
}

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
  onSwipeAction,
  heroKicker = '',
  heroChipLabel = '',
  heroChipTone = 'hold',
  heroPalette = 'blue',
  heroThemeStyle = null,
  heroVisual = 'orb',
  heroValidityPill = null,
  heroSubtitle = '',
  heroNote = '',
}) {
  const [copied, setCopied] = useState(false);
  const [gesturePreview, setGesturePreview] = useState({
    dx: 0,
    dy: 0,
    rotate: 0,
    intent: null,
    active: false,
    committed: false,
  });
  const isZh = String(locale || '').startsWith('zh');
  const gestureRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    rotationDirection: 1,
  });
  const gestureTimerRef = useRef(null);

  const entryMin = signal.entry_zone?.low ?? signal.entry_zone?.min ?? signal.entry_min;
  const entryMax = signal.entry_zone?.high ?? signal.entry_zone?.max ?? signal.entry_max;
  const stopLossPrice = signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss;
  const takeProfitLevels =
    signal.take_profit_levels && signal.take_profit_levels.length
      ? signal.take_profit_levels.map((level) => (typeof level === 'number' ? level : level.price))
      : [signal.take_profit].filter((value) => value !== null && value !== undefined);

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

  useEffect(
    () => () => {
      if (gestureTimerRef.current) {
        window.clearTimeout(gestureTimerRef.current);
      }
    },
    [],
  );

  const clearGesture = () => {
    gestureRef.current.pointerId = null;
    gestureRef.current.startX = 0;
    gestureRef.current.startY = 0;
    gestureRef.current.lastX = 0;
    gestureRef.current.lastY = 0;
    gestureRef.current.lastTime = 0;
    gestureRef.current.dx = 0;
    gestureRef.current.dy = 0;
    gestureRef.current.vx = 0;
    gestureRef.current.vy = 0;
    gestureRef.current.rotationDirection = 1;
    setGesturePreview({
      dx: 0,
      dy: 0,
      rotate: 0,
      intent: null,
      active: false,
      committed: false,
    });
  };

  const commitGesture = (intent) => {
    if (!onSwipeAction || !intent) {
      clearGesture();
      return;
    }
    const exit =
      intent === 'accept'
        ? { dx: 560, dy: 24, rotate: 16 }
        : intent === 'later'
          ? { dx: 0, dy: -520, rotate: clampNumber(gestureRef.current.dx * 0.04, -10, 10) }
          : { dx: -560, dy: 24, rotate: -16 };
    setGesturePreview({
      dx: exit.dx,
      dy: exit.dy,
      rotate: exit.rotate,
      intent,
      active: false,
      committed: true,
    });
    if (gestureTimerRef.current) {
      window.clearTimeout(gestureTimerRef.current);
    }
    gestureTimerRef.current = window.setTimeout(() => {
      onSwipeAction(intent);
      clearGesture();
    }, 150);
  };

  const finishGesture = () => {
    const intent = resolveDetailGestureIntent(
      gestureRef.current.dx,
      gestureRef.current.dy,
      gestureRef.current.vx,
      gestureRef.current.vy,
    );
    if (intent) {
      commitGesture(intent);
      return;
    }
    clearGesture();
  };

  return (
    <section className="detail-screen today-detail-screen">
      <div className="detail-nav-bar">
        <button
          type="button"
          className="ios-nav-back detail-nav-back"
          onClick={onBack}
          aria-label={`Back to ${backLabel}`}
        >
          <span className="ios-back-chevron" aria-hidden="true">
            ‹
          </span>
          <span className="ios-back-label">{backLabel}</span>
        </button>
        <p className="detail-nav-title">{signal.symbol}</p>
        <span className="detail-nav-spacer" aria-hidden="true" />
      </div>

      <article
        className={`glass-card today-action-card today-analytics-card today-detail-hero-card today-action-card-palette-${heroPalette}`}
        data-gesture-active={gesturePreview.active ? 'true' : 'false'}
        data-gesture-intent={gesturePreview.intent || 'idle'}
        data-gesture-committed={gesturePreview.committed ? 'true' : 'false'}
        style={{
          '--gesture-x': `${gesturePreview.dx || 0}px`,
          '--gesture-y': `${gesturePreview.dy || 0}px`,
          '--gesture-rotate': `${gesturePreview.rotate || 0}deg`,
          ...(heroThemeStyle || {}),
        }}
        onPointerDown={(event) => {
          if (
            !onSwipeAction ||
            (event.pointerType === 'mouse' && event.button !== 0) ||
            isNestedInteractiveTarget(event.target, event.currentTarget)
          ) {
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          gestureRef.current.pointerId = event.pointerId;
          gestureRef.current.startX = event.clientX;
          gestureRef.current.startY = event.clientY;
          gestureRef.current.lastX = event.clientX;
          gestureRef.current.lastY = event.clientY;
          gestureRef.current.lastTime = Date.now();
          gestureRef.current.rotationDirection =
            event.clientY > bounds.top + bounds.height * 0.5 ? -1 : 1;
          setGesturePreview({
            dx: 0,
            dy: 0,
            rotate: 0,
            intent: null,
            active: true,
            committed: false,
          });
        }}
        onPointerMove={(event) => {
          if (!onSwipeAction || gestureRef.current.pointerId !== event.pointerId) return;
          event.preventDefault();
          const nowMs = Date.now();
          const dt = Math.max(16, nowMs - gestureRef.current.lastTime);
          const rawDx = clampNumber(event.clientX - gestureRef.current.startX, -260, 260);
          const rawDy = clampNumber(event.clientY - gestureRef.current.startY, -260, 118);
          const instantVx = (event.clientX - gestureRef.current.lastX) / dt;
          const instantVy = (event.clientY - gestureRef.current.lastY) / dt;
          gestureRef.current.vx = gestureRef.current.vx * 0.58 + instantVx * 0.42;
          gestureRef.current.vy = gestureRef.current.vy * 0.58 + instantVy * 0.42;
          gestureRef.current.lastX = event.clientX;
          gestureRef.current.lastY = event.clientY;
          gestureRef.current.lastTime = nowMs;
          gestureRef.current.dx = rawDx;
          gestureRef.current.dy = rawDy;
          setGesturePreview({
            dx: clampNumber(rawDx * 1.08, -308, 308),
            dy: clampNumber(rawDy * 1.04, -286, 132),
            rotate: clampNumber(
              rawDx * 0.07 * gestureRef.current.rotationDirection + rawDy * 0.022,
              -18,
              18,
            ),
            intent: resolveDetailGestureIntent(
              rawDx,
              rawDy,
              gestureRef.current.vx,
              gestureRef.current.vy,
            ),
            active: true,
            committed: false,
          });
        }}
        onPointerUp={(event) => {
          if (!onSwipeAction || gestureRef.current.pointerId !== event.pointerId) return;
          event.preventDefault();
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          finishGesture();
        }}
        onPointerCancel={(event) => {
          if (!onSwipeAction || gestureRef.current.pointerId !== event.pointerId) return;
          event.preventDefault();
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          clearGesture();
        }}
        onKeyDown={(event) => {
          if (!onSwipeAction) return;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            commitGesture('skip');
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            commitGesture('accept');
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            commitGesture('later');
          }
        }}
        role={onSwipeAction ? 'button' : undefined}
        tabIndex={onSwipeAction ? 0 : undefined}
      >
        <div className="today-swipe-markers" aria-hidden="true">
          <span className="today-swipe-marker today-swipe-marker-skip">
            <span className="today-swipe-marker-icon">×</span>
            <span className="today-swipe-marker-label">{isZh ? '跳过' : 'Pass'}</span>
          </span>
          <span className="today-swipe-marker today-swipe-marker-later">
            <span className="today-swipe-marker-icon">↑</span>
            <span className="today-swipe-marker-label">{isZh ? '稍后' : 'Later'}</span>
          </span>
          <span className="today-swipe-marker today-swipe-marker-accept">
            <span className="today-swipe-marker-icon">↗</span>
            <span className="today-swipe-marker-label">{isZh ? '执行' : 'Act'}</span>
          </span>
        </div>

        <div className="today-analytics-card-head">
          <div className="today-analytics-card-copy">
            <p className="today-analytics-card-kicker">{heroKicker}</p>
            <h2 className="today-analytics-card-title">{signal.symbol}</h2>
          </div>
          <div className="today-analytics-card-pills">
            {heroChipLabel ? (
              <span
                className={`today-analytics-card-chip today-analytics-card-chip-${heroChipTone}`}
              >
                {heroChipLabel}
              </span>
            ) : null}
            {heroValidityPill}
          </div>
        </div>

        <div
          className={`today-analytics-card-art today-analytics-card-art-${heroVisual}`}
          aria-hidden="true"
        >
          <span className="today-analytics-art-ring" />
          <span className="today-analytics-art-orb" />
          <span className="today-analytics-art-trace" />
        </div>

        <div className="today-analytics-card-footer">
          {heroSubtitle ? <p className="today-analytics-card-subtitle">{heroSubtitle}</p> : null}
          {heroNote ? <p className="today-analytics-card-note">{heroNote}</p> : null}
        </div>
      </article>

      <article className="glass-card" data-gesture-ignore="true">
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
          <div className={`badge badge-${signal.status.toLowerCase()}`}>
            {t(`status.${signal.status}`, undefined, signal.status)}
          </div>
        </div>

        {loadingDetails ? (
          <p className="muted status-line">
            {isZh ? '正在补全完整计划…' : 'Loading the full execution plan…'}
          </p>
        ) : null}
        {loadError ? <p className="muted status-line">{loadError}</p> : null}

        <div className="detail-list">
          {[
            [t('signals.entryZone'), `${formatNumber(entryMin)} - ${formatNumber(entryMax)}`],
            [t('signals.stopLoss'), formatNumber(stopLossPrice)],
            [t('signals.takeProfit'), formatNumber(signal.take_profit)],
            [
              'Confidence',
              Number.isFinite(Number(signal.confidence ?? signal.conviction))
                ? `${Math.round(Number(signal.confidence ?? signal.conviction) * 100)}%`
                : '--',
            ],
            ['Generated', signal.generated_at || signal.created_at || '--'],
            ['Strategy Source', signal.strategy_source || 'AI quant strategy'],
            [
              t('signals.positionSize'),
              t('signals.positionSizeValue', { value: signal.position_size_pct }),
            ],
            [t('signals.validity'), t(`validity.${signal.validity}`, undefined, signal.validity)],
            [t('signals.modelVersion'), signal.model_version],
            [t('signals.signalId'), signal.signal_id],
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
              ['Delta', signal.payload.data?.greeks_iv?.delta ?? '--'],
            ].map(([label, value]) => infoRow(label, value))}
          </div>
        </article>
      ) : null}

      {signal.payload?.kind === 'STOCK_SWING' ? (
        <article className="glass-card">
          <h3 className="card-title">{t('signals.stockHorizon')}</h3>
          <div className="detail-list">
            {infoRow('Horizon', signal.payload.data?.horizon || '--')}
          </div>
        </article>
      ) : null}

      {signal.payload?.kind === 'CRYPTO' ? (
        <article className="glass-card">
          <h3 className="card-title">{t('signals.cryptoFundingBasis')}</h3>
          <div className="detail-list">
            {[
              ['Funding', signal.payload.data?.perp_metrics?.funding_rate_current ?? '--'],
              ['Basis(bps)', signal.payload.data?.perp_metrics?.basis_bps ?? '--'],
              ['Basis %ile', signal.payload.data?.perp_metrics?.basis_percentile ?? '--'],
            ].map(([label, value]) => infoRow(label, value))}
          </div>
        </article>
      ) : null}

      <article className="glass-card" data-gesture-ignore="true">
        <h3 className="card-title">{t('signals.rationale')}</h3>
        <ul className="bullet-list">
          {(signal.rationale || signal.explain_bullets || []).map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ul>
      </article>

      {signal.execution_checklist?.length ? (
        <article className="glass-card" data-gesture-ignore="true">
          <h3 className="card-title">{t('signals.executionChecklist')}</h3>
          <ul className="bullet-list">
            {signal.execution_checklist.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </article>
      ) : null}

      <div className="action-row" data-gesture-ignore="true">
        {onOpenTradeTicket ? (
          <button type="button" className="primary-btn" onClick={onOpenTradeTicket}>
            {primaryActionLabel || (isZh ? '打开交易票据' : 'Open trade ticket')}
          </button>
        ) : null}
        <button type="button" className="primary-btn" onClick={handleCopy}>
          {copied ? t('common.copied') : t('signals.copyParams')}
        </button>
        <button type="button" className="secondary-btn" onClick={handleShare}>
          {t('signals.shareLink')}
        </button>
      </div>

      {onAskAi || onPaperExecute ? (
        <div className="action-row" data-gesture-ignore="true">
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
    </section>
  );
}

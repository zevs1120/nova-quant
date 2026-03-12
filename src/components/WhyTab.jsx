import { formatNumber, formatPercent } from '../utils/format';

function stanceLabel(today, safety) {
  if (today?.is_trading_day === false) return 'Today is a review day.';
  const mode = String(safety?.mode || '').toLowerCase();
  if (mode.includes('do not trade')) return 'System is in stand-down mode.';
  if (mode.includes('trade light')) return 'System is in light-risk mode.';
  if (mode.includes('aggressive')) return 'System allows active risk today.';
  return 'System is in normal-risk mode.';
}

function bestOpportunity(signals = []) {
  const active = signals.filter((row) => ['NEW', 'TRIGGERED'].includes(String(row.status)));
  return active.sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0] || null;
}

function topFiltered(research = {}) {
  return (research?.diagnostics?.top_failure_reasons || [])[0] || null;
}

export default function WhyTab({
  today,
  safety,
  signals,
  insights,
  holdingsReview,
  research,
  uiMode = 'standard',
  locale,
  onExplain
}) {
  const topSignal = bestOpportunity(signals);
  const topFail = topFiltered(research);
  const holdingsRisk = holdingsReview?.risk || {};
  const pressure = research?.diagnostics?.risk_pressure_summary || {};
  const paperGap = research?.paper_ops?.paper_vs_backtest_gap || {};

  return (
    <section className="stack-gap">
      <article className="glass-card posture-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Why / Explain Layer</h3>
            <p className="muted">Short answers first. Details only when you need them.</p>
          </div>
          <span className="badge badge-neutral">{uiMode}</span>
        </div>
        <p className="daily-brief-conclusion">{stanceLabel(today, safety)}</p>
        <p className="muted status-line">
          Safety {formatNumber(safety?.safety_score, 1, locale)} · style {today?.style_hint || '--'} · risk {safety?.primary_risks?.[0] || '--'}
        </p>
      </article>

      <article className="glass-card">
        <h3 className="card-title">Why is today light / cautious?</h3>
        <p className="muted status-line">{safety?.conclusion || 'Risk layer sets position limits from regime + breadth + volatility.'}</p>
        <details className="exec-steps" open={uiMode === 'beginner'}>
          <summary>Show quick evidence</summary>
          <div className="exec-lines">
            <p>Mode: {safety?.mode || '--'}</p>
            <p>Safety score: {formatNumber(safety?.safety_score, 1, locale)}</p>
            <p>Primary risk: {safety?.primary_risks?.[0] || '--'}</p>
            <p>Suggested gross/net: {today?.suggested_gross_exposure_pct ?? '--'}% / {today?.suggested_net_exposure_pct ?? '--'}%</p>
          </div>
        </details>
      </article>

      <article className="glass-card">
        <h3 className="card-title">Why is this opportunity top-ranked?</h3>
        {topSignal ? (
          <>
            <p className="muted status-line">
              {topSignal.symbol} · {topSignal.grade || '--'} grade · score {formatNumber(topSignal.score, 1, locale)}
            </p>
            <p className="muted status-line">{topSignal.explain_bullets?.[0] || topSignal.rationale?.[0] || '--'}</p>
            <details className="exec-steps">
              <summary>Why this one over others?</summary>
              <div className="exec-lines">
                <p>Direction: {topSignal.direction}</p>
                <p>Confidence: {formatPercent(topSignal.confidence, 1)}</p>
                <p>Risk score: {formatNumber(topSignal.risk_score, 1, locale)}</p>
                <p>Regime fit: {formatNumber(topSignal.regime_compatibility, 1, locale)}%</p>
              </div>
            </details>
          </>
        ) : (
          <p className="muted status-line">No active high-quality opportunity right now. Skipping is valid.</p>
        )}
      </article>

      <article className="glass-card">
        <h3 className="card-title">Why are some names filtered out?</h3>
        <p className="muted status-line">
          {topFail ? `${topFail.reason} is the dominant block this window (${topFail.count} hits).` : 'No dominant block reason in this short window.'}
        </p>
        <details className="exec-steps">
          <summary>Filter logic in plain language</summary>
          <div className="exec-lines">
            <p>System blocks names when risk, regime, or portfolio caps are not satisfied.</p>
            <p>Filtering protects capital quality, not trade frequency.</p>
          </div>
        </details>
      </article>

      <article className="glass-card">
        <h3 className="card-title">Why is my holdings risk high?</h3>
        <p className="muted status-line">
          Risk score: {holdingsRisk?.score ?? '--'} ({holdingsRisk?.level || '--'}) · {holdingsRisk?.recommendation || '--'}
        </p>
        <details className="exec-steps" open={uiMode === 'beginner'}>
          <summary>Main portfolio risk reasons</summary>
          <div className="exec-lines">
            {(holdingsRisk?.primary_risks || ['No portfolio risk detail yet.']).slice(0, 4).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </details>
      </article>

      <article className="glass-card">
        <h3 className="card-title">Why is system more conservative now?</h3>
        <p className="muted status-line">
          Regime: {insights?.regime?.tag || '--'} · Risk-on/off: {insights?.risk_on_off?.state || '--'}
        </p>
        <details className="exec-steps">
          <summary>Conservative tilt evidence</summary>
          <div className="exec-lines">
            <p>Regime stability score: {formatNumber(research?.diagnostics?.regime_stability?.score, 3, locale)}</p>
            <p>Trade-light days in window: {pressure?.trade_light_days ?? '--'}</p>
            <p>Paper vs backtest return gap: {formatPercent(paperGap?.return_gap, 2, true)}</p>
          </div>
        </details>
      </article>

      <article className="glass-card">
        <h3 className="card-title">Ask AI About Any Why</h3>
        <div className="action-row">
          <button type="button" className="secondary-btn" onClick={() => onExplain?.('为什么今天建议轻仓或保守？')}>
            Why today?
          </button>
          <button type="button" className="secondary-btn" onClick={() => onExplain?.(`为什么 ${topSignal?.symbol || '这个机会'} 是当前优先机会？`)}>
            Why this opportunity?
          </button>
          <button type="button" className="secondary-btn" onClick={() => onExplain?.('为什么我的持仓风险高？最先该减哪部分？')}>
            Why my holdings risk?
          </button>
        </div>
      </article>
    </section>
  );
}

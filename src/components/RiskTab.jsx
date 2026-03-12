function modeTone(mode) {
  const key = String(mode || '').toLowerCase();
  if (key.includes('do not trade')) return 'badge-expired';
  if (key.includes('trade light')) return 'badge-medium';
  if (key.includes('aggressive')) return 'badge-triggered';
  return 'badge-neutral';
}

function progressValue(current, max) {
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(max)) || Number(max) <= 0) return 0;
  return Math.min(100, Math.max(0, (Math.abs(Number(current)) / Number(max)) * 100));
}

export default function RiskTab({ config, safety, research, uiMode = 'standard', t, onExplain }) {
  const riskRules = config.risk_rules ?? {};
  const riskStatus = config.risk_status ?? {};
  const diagnostics = riskStatus.diagnostics ?? {};
  const systemDiag = research?.diagnostics || {};

  const todayPnl = Number(diagnostics.daily_pnl_pct ?? 0);
  const todayLoss = Math.max(0, -todayPnl);
  const todayLossMax = Number(riskRules.daily_loss_pct ?? 0);
  const drawdown = Number(diagnostics.max_dd_pct ?? 0);
  const drawdownMax = Number(riskRules.max_dd_pct ?? 0);

  const todayLossProgress = progressValue(todayLoss, todayLossMax);
  const ddProgress = progressValue(drawdown, drawdownMax);
  const cards = safety?.cards || {};
  const shouldTradeText =
    String(safety?.mode || '').toLowerCase().includes('do not trade')
      ? 'Today is a stand-down day for new risk.'
      : String(safety?.mode || '').toLowerCase().includes('trade light')
        ? 'Today is a light-risk day. Keep size small and selective.'
        : 'Today allows normal risk, but position limits still apply.';

  return (
    <section className="stack-gap">
      <article className="glass-card">
        <div className="card-header">
          <h3 className="card-title">Safety Center</h3>
          <span className={`badge ${modeTone(safety?.mode)}`}>{safety?.mode || '--'}</span>
        </div>

        <p className="daily-brief-conclusion">{shouldTradeText}</p>

        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">Safety Score</p>
            <h2>{safety?.safety_score?.toFixed?.(1) ?? '--'}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Suggested Gross</p>
            <h2>{safety?.suggested_gross_exposure_pct ?? '--'}%</h2>
          </div>
          <div className="status-box">
            <p className="muted">Suggested Net</p>
            <h2>{safety?.suggested_net_exposure_pct ?? '--'}%</h2>
          </div>
        </div>

        <p className="muted status-line">{safety?.conclusion || 'Risk summary unavailable.'}</p>
        <p className="muted status-line">
          Why exposure is capped today: {systemDiag?.risk_pressure_summary?.why_exposure_capped_today || safety?.primary_risks?.[0] || '--'}
        </p>
      </article>

      <article className="glass-card">
        <h3 className="card-title">Action Boundary Today</h3>
        <ul className="bullet-list">
          <li>Suggested gross/net: {safety?.suggested_gross_exposure_pct ?? '--'}% / {safety?.suggested_net_exposure_pct ?? '--'}%.</li>
          <li>If you are unsure, reduce size first before adding new names.</li>
          <li>No setup is better than a forced setup in high-risk periods.</li>
        </ul>
      </article>

      <article className="glass-card">
        <h3 className="card-title">Risk Pressure Diagnostics</h3>
        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">Avg Safety (window)</p>
            <h2>{systemDiag?.risk_pressure_summary?.avg_safety_score?.toFixed?.(1) ?? '--'}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Trade-light days</p>
            <h2>{systemDiag?.risk_pressure_summary?.trade_light_days ?? '--'}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Paused days</p>
            <h2>{systemDiag?.risk_pressure_summary?.paused_days ?? '--'}</h2>
          </div>
        </div>
        <p className="muted status-line">
          Exposure capped days (window): {systemDiag?.risk_pressure_summary?.exposure_capped_days ?? '--'}
        </p>
      </article>

      {uiMode !== 'beginner' ? (
        <article className="glass-card">
          <h3 className="card-title">Regime Stability</h3>
          <div className="detail-list">
            <div className="detail-row">
              <span className="detail-label">Stability score</span>
              <span className="detail-value">{systemDiag?.regime_stability?.score ?? '--'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Regime transitions</span>
              <span className="detail-value">{systemDiag?.regime_stability?.regime_transitions ?? '--'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Window days</span>
              <span className="detail-value">{systemDiag?.regime_stability?.window_days ?? '--'}</span>
            </div>
          </div>
        </article>
      ) : null}

      <article className="glass-card">
        <h3 className="card-title">Three-Layer Risk View</h3>
        <div className="risk-status-grid">
          <div className="status-box">
            <p className="muted">{cards.market?.title || 'Market Level'}</p>
            <h2>{cards.market?.score?.toFixed?.(1) ?? '--'}</h2>
            <ul className="bullet-list">
              {(cards.market?.lines || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="status-box">
            <p className="muted">{cards.portfolio?.title || 'Portfolio Level'}</p>
            <h2>{cards.portfolio?.score?.toFixed?.(1) ?? '--'}</h2>
            <ul className="bullet-list">
              {(cards.portfolio?.lines || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="status-box">
            <p className="muted">{cards.instrument?.title || 'Instrument Level'}</p>
            <h2>{cards.instrument?.score?.toFixed?.(1) ?? '--'}</h2>
            <ul className="bullet-list">
              {(cards.instrument?.lines || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </article>

      {uiMode !== 'beginner' ? (
        <article className="glass-card">
          <h3 className="card-title">Hard Risk Rules</h3>
          <div className="risk-list">
            <div className="detail-row">
              <span className="detail-label">Per-trade risk</span>
              <span className="detail-value">{riskRules.per_trade_risk_pct ?? '--'}%</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Daily loss limit</span>
              <span className="detail-value">{riskRules.daily_loss_pct ?? '--'}%</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Max drawdown</span>
              <span className="detail-value">{riskRules.max_dd_pct ?? '--'}%</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Exposure cap</span>
              <span className="detail-value">{riskRules.exposure_cap_pct ?? '--'}%</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Volatility switch</span>
              <span className="detail-value">{riskRules.vol_switch ? t('common.on') : t('common.off')}</span>
            </div>
          </div>

          <div className="risk-progress-wrap">
            <div className="risk-progress-item">
              <div className="detail-row">
                <span className="detail-label">Today loss progress</span>
                <span className="detail-value">
                  {todayLoss.toFixed(2)} / {todayLossMax || '--'}%
                </span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${todayLossProgress}%` }} />
              </div>
            </div>

            <div className="risk-progress-item">
              <div className="detail-row">
                <span className="detail-label">Drawdown progress</span>
                <span className="detail-value">
                  {drawdown.toFixed(2)} / {drawdownMax || '--'}%
                </span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${ddProgress}%` }} />
              </div>
            </div>
          </div>
        </article>
      ) : null}

      <article className="glass-card">
        <h3 className="card-title">Risk Rulebook (v1)</h3>
        <ul className="bullet-list">
          {(safety?.rules || []).map((rule) => (
            <li key={rule.id}>
              <strong>{rule.title}:</strong> {rule.rule}
            </li>
          ))}
        </ul>
        <div className="action-row">
          <button type="button" className="secondary-btn" onClick={onExplain}>
            {t('risk.explain')}
          </button>
        </div>
      </article>
    </section>
  );
}

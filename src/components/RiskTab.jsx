function modeTone(mode) {
  const key = String(mode || '').toLowerCase();
  if (key.includes('do not trade') || key.includes('不要交易') || key.includes('暂停')) return 'badge-expired';
  if (key.includes('trade light') || key.includes('轻仓') || key.includes('小仓')) return 'badge-medium';
  if (key.includes('aggressive') || key.includes('积极') || key.includes('进攻')) return 'badge-triggered';
  return 'badge-neutral';
}

function progressValue(current, max) {
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(max)) || Number(max) <= 0) return 0;
  return Math.min(100, Math.max(0, (Math.abs(Number(current)) / Number(max)) * 100));
}

function buildCopy(locale) {
  const zh = locale?.startsWith('zh');
  return {
    safetyCenter: zh ? '安全中心' : 'Safety Center',
    safetyScore: zh ? '安全分' : 'Safety Score',
    suggestedGross: zh ? '建议总暴露' : 'Suggested Gross',
    suggestedNet: zh ? '建议净暴露' : 'Suggested Net',
    unavailable: zh ? '风险摘要暂不可用。' : 'Risk summary unavailable.',
    whyCapped: zh ? '今天为什么限制暴露：' : 'Why exposure is capped today:',
    actionBoundary: zh ? '今日行动边界' : 'Action Boundary Today',
    actionBoundaryLines: zh
      ? [
          '建议总/净暴露：{gross}% / {net}%。',
          '如果你拿不准，先减仓，再决定要不要加新名字。',
          '高风险阶段里，没有 setup 也好过硬做一个。'
        ]
      : [
          'Suggested gross/net: {gross}% / {net}%.',
          'If you are unsure, reduce size first before adding new names.',
          'No setup is better than a forced setup in high-risk periods.'
        ],
    riskDiagnostics: zh ? '风险压力诊断' : 'Risk Pressure Diagnostics',
    avgSafety: zh ? '平均安全分（窗口）' : 'Avg Safety (window)',
    tradeLightDays: zh ? '轻仓日' : 'Trade-light days',
    pausedDays: zh ? '暂停日' : 'Paused days',
    cappedDays: zh ? '限制暴露天数（窗口）' : 'Exposure capped days (window)',
    regimeStability: zh ? '状态稳定性' : 'Regime Stability',
    stabilityScore: zh ? '稳定性评分' : 'Stability score',
    regimeTransitions: zh ? '状态切换次数' : 'Regime transitions',
    windowDays: zh ? '窗口天数' : 'Window days',
    threeLayer: zh ? '三层风险视图' : 'Three-Layer Risk View',
    marketLevel: zh ? '市场层' : 'Market Level',
    portfolioLevel: zh ? '组合层' : 'Portfolio Level',
    instrumentLevel: zh ? '标的层' : 'Instrument Level',
    hardRules: zh ? '硬性风控规则' : 'Hard Risk Rules',
    perTrade: zh ? '单笔风险' : 'Per-trade risk',
    dailyLoss: zh ? '日内亏损上限' : 'Daily loss limit',
    maxDd: zh ? '最大回撤' : 'Max drawdown',
    exposureCap: zh ? '暴露上限' : 'Exposure cap',
    volSwitch: zh ? '波动开关' : 'Volatility switch',
    todayLossProgress: zh ? '今日亏损进度' : 'Today loss progress',
    drawdownProgress: zh ? '回撤进度' : 'Drawdown progress',
    rulebook: zh ? '风险规则手册（v1）' : 'Risk Rulebook (v1)',
    normalRisk: zh ? '今天允许常规风险，但仓位上限仍然生效。' : 'Today allows normal risk, but position limits still apply.',
    lightRisk: zh ? '今天是轻仓日。仓位要小，动作要挑。' : 'Today is a light-risk day. Keep size small and selective.',
    standDown: zh ? '今天新风险要暂停。' : 'Today is a stand-down day for new risk.'
  };
}

export default function RiskTab({ config, safety, research, uiMode = 'standard', t, onExplain, locale }) {
  const copy = buildCopy(locale);
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
    String(safety?.mode || '').toLowerCase().includes('do not trade') ||
    String(safety?.mode || '').includes('不要交易') ||
    String(safety?.mode || '').includes('暂停')
      ? copy.standDown
      : String(safety?.mode || '').toLowerCase().includes('trade light') ||
          String(safety?.mode || '').includes('轻仓') ||
          String(safety?.mode || '').includes('小仓')
        ? copy.lightRisk
        : copy.normalRisk;

  return (
    <section className="stack-gap">
      <article className="glass-card">
        <div className="card-header">
          <h3 className="card-title">{copy.safetyCenter}</h3>
          <span className={`badge ${modeTone(safety?.mode)}`}>{safety?.mode || '--'}</span>
        </div>

        <p className="daily-brief-conclusion">{shouldTradeText}</p>

        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">{copy.safetyScore}</p>
            <h2>{safety?.safety_score?.toFixed?.(1) ?? '--'}</h2>
          </div>
          <div className="status-box">
            <p className="muted">{copy.suggestedGross}</p>
            <h2>{safety?.suggested_gross_exposure_pct ?? '--'}%</h2>
          </div>
          <div className="status-box">
            <p className="muted">{copy.suggestedNet}</p>
            <h2>{safety?.suggested_net_exposure_pct ?? '--'}%</h2>
          </div>
        </div>

        <p className="muted status-line">{safety?.conclusion || copy.unavailable}</p>
        <p className="muted status-line">
          {copy.whyCapped} {systemDiag?.risk_pressure_summary?.why_exposure_capped_today || safety?.primary_risks?.[0] || '--'}
        </p>
      </article>

      <article className="glass-card">
        <h3 className="card-title">{copy.actionBoundary}</h3>
        <ul className="bullet-list">
          <li>{copy.actionBoundaryLines[0].replace('{gross}', String(safety?.suggested_gross_exposure_pct ?? '--')).replace('{net}', String(safety?.suggested_net_exposure_pct ?? '--'))}</li>
          <li>{copy.actionBoundaryLines[1]}</li>
          <li>{copy.actionBoundaryLines[2]}</li>
        </ul>
      </article>

      <article className="glass-card">
        <h3 className="card-title">{copy.riskDiagnostics}</h3>
        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">{copy.avgSafety}</p>
            <h2>{systemDiag?.risk_pressure_summary?.avg_safety_score?.toFixed?.(1) ?? '--'}</h2>
          </div>
          <div className="status-box">
            <p className="muted">{copy.tradeLightDays}</p>
            <h2>{systemDiag?.risk_pressure_summary?.trade_light_days ?? '--'}</h2>
          </div>
          <div className="status-box">
            <p className="muted">{copy.pausedDays}</p>
            <h2>{systemDiag?.risk_pressure_summary?.paused_days ?? '--'}</h2>
          </div>
        </div>
        <p className="muted status-line">
          {copy.cappedDays}: {systemDiag?.risk_pressure_summary?.exposure_capped_days ?? '--'}
        </p>
      </article>

      {uiMode !== 'beginner' ? (
        <article className="glass-card">
          <h3 className="card-title">{copy.regimeStability}</h3>
          <div className="detail-list">
            <div className="detail-row">
              <span className="detail-label">{copy.stabilityScore}</span>
              <span className="detail-value">{systemDiag?.regime_stability?.score ?? '--'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">{copy.regimeTransitions}</span>
              <span className="detail-value">{systemDiag?.regime_stability?.regime_transitions ?? '--'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">{copy.windowDays}</span>
              <span className="detail-value">{systemDiag?.regime_stability?.window_days ?? '--'}</span>
            </div>
          </div>
        </article>
      ) : null}

      <article className="glass-card">
        <h3 className="card-title">{copy.threeLayer}</h3>
        <div className="risk-status-grid">
          <div className="status-box">
            <p className="muted">{cards.market?.title || copy.marketLevel}</p>
            <h2>{cards.market?.score?.toFixed?.(1) ?? '--'}</h2>
            <ul className="bullet-list">
              {(cards.market?.lines || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="status-box">
            <p className="muted">{cards.portfolio?.title || copy.portfolioLevel}</p>
            <h2>{cards.portfolio?.score?.toFixed?.(1) ?? '--'}</h2>
            <ul className="bullet-list">
              {(cards.portfolio?.lines || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="status-box">
            <p className="muted">{cards.instrument?.title || copy.instrumentLevel}</p>
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
          <h3 className="card-title">{copy.hardRules}</h3>
          <div className="risk-list">
            <div className="detail-row">
              <span className="detail-label">{copy.perTrade}</span>
              <span className="detail-value">{riskRules.per_trade_risk_pct ?? '--'}%</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">{copy.dailyLoss}</span>
              <span className="detail-value">{riskRules.daily_loss_pct ?? '--'}%</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">{copy.maxDd}</span>
              <span className="detail-value">{riskRules.max_dd_pct ?? '--'}%</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">{copy.exposureCap}</span>
              <span className="detail-value">{riskRules.exposure_cap_pct ?? '--'}%</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">{copy.volSwitch}</span>
              <span className="detail-value">{riskRules.vol_switch ? t('common.on') : t('common.off')}</span>
            </div>
          </div>

          <div className="risk-progress-wrap">
            <div className="risk-progress-item">
              <div className="detail-row">
                <span className="detail-label">{copy.todayLossProgress}</span>
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
                <span className="detail-label">{copy.drawdownProgress}</span>
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
        <h3 className="card-title">{copy.rulebook}</h3>
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

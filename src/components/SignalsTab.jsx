import { useEffect, useMemo, useState } from 'react';
import SegmentedControl from './SegmentedControl';
import SignalCard from './SignalCard';
import SignalDetail from './SignalDetail';
import Skeleton from './Skeleton';
import EligibilitySheet from './EligibilitySheet';
import { formatNumber } from '../utils/format';
import {
  fetchSignalDetail,
  hasSignalDetailPayload,
  mergeSignalDetail,
} from '../utils/signalDetails';

const ACTIVE_STATUSES = new Set(['NEW', 'TRIGGERED']);

function getAssetClass(item) {
  return item.asset_class || (item.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
}

function confidenceValue(signal) {
  if (Number.isFinite(signal.confidence_level)) return Number(signal.confidence_level);
  if (Number(signal.confidence) <= 1) return Number(signal.confidence) * 5;
  return Number(signal.confidence || 3);
}

function summarizeExecutionState(executions, assetClass) {
  const scoped = executions.filter((item) => getAssetClass(item) === assetClass);
  const activeTrades = scoped.filter(
    (item) => String(item.action || '').toUpperCase() === 'EXECUTE',
  ).length;
  const followRate = scoped.length ? Math.min(100, (activeTrades / scoped.length) * 100) : 0;
  return {
    activeTrades,
    followRate,
    totalExecutions: scoped.length,
  };
}

function statusTone(label) {
  const key = String(label || '').toLowerCase();
  if (key.includes('pause') || key.includes('do not trade')) return 'badge-expired';
  if (key.includes('light')) return 'badge-medium';
  if (key.includes('aggressive')) return 'badge-triggered';
  return 'badge-neutral';
}

function decisionLabel(todayPlan, safety) {
  if (todayPlan?.is_trading_day === false) {
    return {
      title: 'Review Day',
      status: 'Review / Observe',
      verdict: 'Today is for review, not for forcing new trades.',
      action: 'Check holdings risk and prepare your watchlist for next session.',
      riskBoundary: 'Do not open fresh directional risk on market-closed days.',
    };
  }

  const mode = String(safety?.mode || '').toLowerCase();
  if (mode.includes('do not trade')) {
    return {
      title: 'Stand-Down Day',
      status: 'Today Not Suitable For Active Trading',
      verdict: 'Do not force new trades today. Capital protection is the priority.',
      action: 'Pause fresh exposure and only monitor your highest-quality setups.',
      riskBoundary: 'If setup quality is not clearly high, skip.',
    };
  }

  if (mode.includes('trade light')) {
    return {
      title: 'Light-Risk Day',
      status: 'Light Position / Observe',
      verdict: 'Trade lightly today. Size down and focus only on top setups.',
      action: 'Focus on 1-3 opportunities and avoid weak or crowded names.',
      riskBoundary: 'No aggressive adding. Keep gross exposure under plan.',
    };
  }

  if (mode.includes('aggressive')) {
    return {
      title: 'Supportive Window',
      status: 'Suitable For Active Trading',
      verdict: 'Conditions are supportive, but execution discipline still matters.',
      action: 'Execute your best ideas first. Do not chase late entries.',
      riskBoundary: 'Respect stop, size, and concentration caps.',
    };
  }

  return {
    title: 'Normal-Risk Day',
    status: 'Suitable For Selective Trading',
    verdict: 'You can trade selectively today. Quality beats quantity.',
    action: 'Start from your top A/B ideas and stay inside exposure limits.',
    riskBoundary: 'If confidence is unclear, reduce size instead of adding names.',
  };
}

function symbolGrade(signal) {
  if (!signal?.grade) return 'Opportunity';
  return `${signal.grade}-grade`;
}

export default function SignalsTab({
  market,
  setMarket,
  assetClass,
  setAssetClass,
  signals,
  loading,
  analytics,
  executions,
  watchlist,
  setWatchlist,
  onQuickAsk,
  onPaperExecute,
  onMarkDone,
  riskRules,
  riskStatus,
  todayPlan,
  safety,
  alphaLibrary,
  effectiveUserId,
  uiMode = 'standard',
  t,
  locale,
  onActionFeedback,
}) {
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('score');
  const [activeSignal, setActiveSignal] = useState(null);
  const [eligibilitySignal, setEligibilitySignal] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    if (assetClass === 'CRYPTO' && market !== 'CRYPTO') {
      setMarket('CRYPTO');
    } else if (assetClass !== 'CRYPTO' && market !== 'US') {
      setMarket('US');
    }
  }, [assetClass, market, setMarket]);

  const scopedSignals = useMemo(
    () => signals.filter((item) => getAssetClass(item) === assetClass),
    [signals, assetClass],
  );

  const activeOpportunities = useMemo(() => {
    const base = scopedSignals.filter((item) => ACTIVE_STATUSES.has(String(item.status)));
    const gradeScoped =
      gradeFilter === 'ALL' ? base : base.filter((item) => item.grade === gradeFilter);

    const sorted = [...gradeScoped].sort((a, b) => {
      if (sortBy === 'confidence') return confidenceValue(b) - confidenceValue(a);
      if (sortBy === 'newest')
        return new Date(b.created_at || b.generated_at) - new Date(a.created_at || a.generated_at);
      return Number(b.score || 0) - Number(a.score || 0);
    });

    if (!watchlist.length) return sorted;

    return sorted.sort((a, b) => {
      const aw = watchlist.includes(a.symbol) ? 1 : 0;
      const bw = watchlist.includes(b.symbol) ? 1 : 0;
      if (aw !== bw) return bw - aw;
      return Number(b.score || 0) - Number(a.score || 0);
    });
  }, [scopedSignals, gradeFilter, sortBy, watchlist]);

  const filteredOut = useMemo(
    () =>
      scopedSignals
        .filter((item) => ['INVALIDATED', 'EXPIRED'].includes(String(item.status)))
        .slice(0, 10),
    [scopedSignals],
  );

  const focusOpportunities = useMemo(() => activeOpportunities.slice(0, 3), [activeOpportunities]);

  const portfolioSummary = useMemo(
    () => summarizeExecutionState(executions, assetClass),
    [executions, assetClass],
  );

  const riskWarnings = useMemo(() => {
    const warnings = [...(safety?.primary_risks || [])];
    if (riskStatus?.trading_on === false) {
      warnings.unshift(todayPlan?.empty_states?.high_risk_pause || 'Risk pause is active.');
    }
    if (todayPlan?.is_trading_day === false) {
      warnings.unshift(todayPlan?.empty_states?.non_trading_day || 'Non-trading day.');
    }
    if (!warnings.length) {
      warnings.push('No hard risk flag. Keep execution discipline and respect position caps.');
    }
    return warnings.slice(0, 4);
  }, [safety, riskStatus, todayPlan]);

  const topRisk = riskWarnings[0] || '--';
  const summary = decisionLabel(todayPlan, safety);

  const toggleWatch = (symbol) => {
    const normalized = String(symbol || '')
      .trim()
      .toUpperCase();
    if (!normalized) return;
    const isWatched = watchlist.includes(normalized);
    setWatchlist((current) =>
      current.includes(normalized)
        ? current.filter((item) => item !== normalized)
        : [...current, normalized],
    );
    onActionFeedback?.({
      message: locale?.startsWith('zh')
        ? isWatched
          ? `${normalized} 已从观察列表移除。`
          : `${normalized} 已加入观察列表。`
        : isWatched
          ? `${normalized} removed from watchlist.`
          : `${normalized} added to watchlist.`,
      tone: 'success',
      haptic: isWatched ? 'soft' : 'confirm',
    });
  };

  const eligibilityChecks = useMemo(() => {
    if (!eligibilitySignal) return [];

    const pos = Number(
      eligibilitySignal.position_advice?.position_pct ?? eligibilitySignal.position_size_pct ?? 0,
    );
    const exposureCap = Number(riskRules?.exposure_cap_pct ?? 100);
    const riskScore = Number(eligibilitySignal.risk_score ?? 50);
    const isExpired = ['EXPIRED', 'INVALIDATED'].includes(String(eligibilitySignal.status || ''));

    return [
      {
        key: 'risk',
        label: t('signals.checkRisk'),
        reason:
          pos <= exposureCap
            ? `Target ${pos.toFixed(2)}% is within exposure cap.`
            : `Target ${pos.toFixed(2)}% exceeds cap ${exposureCap.toFixed(1)}%.`,
        state: pos <= exposureCap ? 'pass' : 'fail',
      },
      {
        key: 'riskScore',
        label: t('signals.checkTemp'),
        reason:
          riskScore <= 65
            ? `Risk score ${riskScore.toFixed(1)} is acceptable.`
            : `Risk score ${riskScore.toFixed(1)} is elevated, use reduced size.`,
        state: riskScore <= 65 ? 'pass' : 'warn',
      },
      {
        key: 'validity',
        label: t('signals.checkValidity'),
        reason: isExpired ? 'Signal is expired/filtered.' : 'Signal is currently valid.',
        state: isExpired ? 'fail' : 'pass',
      },
    ];
  }, [eligibilitySignal, riskRules, t]);

  const alphaFamilies = useMemo(() => {
    const map = {};
    for (const alpha of alphaLibrary || []) {
      map[alpha.family] = (map[alpha.family] || 0) + 1;
    }
    return Object.entries(map);
  }, [alphaLibrary]);

  useEffect(() => {
    if (!activeSignal?.signal_id || hasSignalDetailPayload(activeSignal)) {
      setDetailLoading(false);
      setDetailError('');
      return undefined;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');

    fetchSignalDetail(activeSignal.signal_id, { userId: effectiveUserId })
      .then((detail) => {
        if (cancelled || !detail) return;
        setActiveSignal((current) => {
          if (!current || current.signal_id !== activeSignal.signal_id) return current;
          return mergeSignalDetail(current, detail);
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDetailError(
          locale?.startsWith('zh')
            ? '完整计划加载失败，先展示摘要。'
            : 'Full plan unavailable. Showing the summary first.',
        );
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSignal, effectiveUserId, locale]);

  if (activeSignal) {
    return (
      <SignalDetail
        signal={activeSignal}
        onBack={() => setActiveSignal(null)}
        loadingDetails={detailLoading}
        loadError={detailError}
        t={t}
        backLabel="Signals"
      />
    );
  }

  return (
    <section>
      <div className="stack-gap">
        <SegmentedControl
          label="Market Focus"
          options={[
            { label: t('common.options'), value: 'OPTIONS' },
            { label: t('common.stocks'), value: 'US_STOCK' },
            { label: t('common.crypto'), value: 'CRYPTO' },
          ]}
          value={assetClass}
          onChange={setAssetClass}
        />

        <article className="glass-card posture-card daily-brief-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Daily Brief</h3>
              <p className="muted">Conclusion first. Action first. Evidence only when needed.</p>
            </div>
            <span className={`badge ${statusTone(todayPlan?.tradeability || safety?.mode)}`}>
              {summary.status || todayPlan?.tradeability || safety?.mode || '--'}
            </span>
          </div>

          <p className="daily-brief-title">Today: {summary.title}</p>
          <p className="daily-brief-conclusion">{summary.verdict}</p>
          <p className="muted status-line">{summary.action}</p>
          <p className="muted status-line">Risk boundary: {summary.riskBoundary}</p>

          <div className="status-grid-3">
            <div className="status-box">
              <p className="muted">Suggested Total Exposure</p>
              <h2>{todayPlan?.suggested_gross_exposure_pct ?? '--'}%</h2>
            </div>
            <div className="status-box">
              <p className="muted">Main Style</p>
              <h2>{todayPlan?.style_hint || '--'}</h2>
            </div>
            <div className="status-box">
              <p className="muted">Top Risk</p>
              <h2>{topRisk}</h2>
            </div>
          </div>

          <p className="muted status-line">{todayPlan?.trading_day_message || '--'}</p>
          {focusOpportunities.length === 0 ? (
            <p className="muted status-line">
              <strong>No high-quality setup now.</strong> It is valid to skip and preserve capital.
            </p>
          ) : null}
          <p className="muted status-line">
            Data boundary: sample market + derived features + simulated outputs.
          </p>
        </article>

        <article className="glass-card">
          <div className="card-header">
            <h3 className="card-title">Top 1-3 Opportunities</h3>
            <span className="badge badge-neutral">Focus only</span>
          </div>
          <p className="muted">These are the few names worth your attention first.</p>

          {loading ? (
            <>
              <Skeleton lines={4} />
              <Skeleton lines={4} />
            </>
          ) : focusOpportunities.length ? (
            <div className="opportunity-list">
              {focusOpportunities.map((signal) => (
                <article key={signal.signal_id} className="opportunity-card">
                  <div className="opportunity-top">
                    <div>
                      <p className="opportunity-symbol">{signal.symbol}</p>
                      <p className="opportunity-meta">
                        {signal.direction} · {symbolGrade(signal)} · score{' '}
                        {formatNumber(signal.score, 1, locale)}
                      </p>
                    </div>
                    <span className="badge badge-triggered">{signal.grade || '--'}</span>
                  </div>

                  <p className="muted status-line">
                    Weight{' '}
                    {formatNumber(
                      signal.position_advice?.position_pct ?? signal.position_size_pct,
                      2,
                      locale,
                    )}
                    % · confidence {formatNumber(confidenceValue(signal), 1, locale)}/5
                  </p>
                  <p className="muted status-line">
                    {signal.explain_bullets?.[0] || signal.rationale?.[0] || '--'}
                  </p>

                  <div className="action-row">
                    <button
                      type="button"
                      className="quick-ask-btn"
                      onClick={() => setActiveSignal(signal)}
                    >
                      Open Plan
                    </button>
                    <button
                      type="button"
                      className="quick-ask-btn"
                      onClick={() => onQuickAsk?.('explain', signal)}
                    >
                      Why This?
                    </button>
                    {uiMode !== 'beginner' ? (
                      <>
                        <button
                          type="button"
                          className="quick-ask-btn"
                          onClick={() => {
                            onPaperExecute?.(signal);
                          }}
                        >
                          Paper Execute
                        </button>
                        <button
                          type="button"
                          className={`quick-ask-btn ${watchlist.includes(signal.symbol) ? 'active' : ''}`}
                          onClick={() => toggleWatch(signal.symbol)}
                        >
                          {watchlist.includes(signal.symbol) ? 'Watched' : 'Watch'}
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <article className="glass-card empty-card">
              <p>
                {todayPlan?.empty_states?.no_signal || 'No actionable signal for current focus.'}
              </p>
              <p className="muted">Today is not worth forcing. Keep cash and wait for clarity.</p>
            </article>
          )}
        </article>

        {uiMode === 'advanced' ? (
          <article className="glass-card">
            <h3 className="card-title">Filtered Out (Do Not Force)</h3>
            <p className="muted">
              These names were scored but blocked by risk/regime/portfolio rules.
            </p>
            {filteredOut.length ? (
              <div className="shadow-log-list">
                {filteredOut.slice(0, 5).map((signal) => (
                  <div key={signal.signal_id} className="shadow-log-row">
                    <div>
                      <p className="shadow-title">
                        {signal.symbol} · {signal.grade || 'Filtered'}
                      </p>
                      <p className="muted">
                        {signal.explain_bullets?.[0] ||
                          signal.entry_zone?.notes ||
                          'Filtered by risk rules.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="quick-ask-btn"
                      onClick={() => onQuickAsk?.('risk', signal)}
                    >
                      Why filtered?
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No filtered signals in this view.</p>
            )}
          </article>
        ) : null}

        <article className="glass-card">
          <h3 className="card-title">Why Today?</h3>
          <p className="muted">One-tap explanation of today&apos;s stance.</p>

          <details className="exec-steps" open={uiMode === 'beginner'}>
            <summary>Why is the system in this mode?</summary>
            <div className="exec-lines">
              <p>
                Safety score: {formatNumber(safety?.safety_score, 1, locale)} (
                {safety?.mode || '--'})
              </p>
              <p>Regime: {todayPlan?.style_hint || '--'}</p>
              <p>Main risk: {topRisk}</p>
            </div>
          </details>

          <details className="exec-steps">
            <summary>Why this exposure cap?</summary>
            <div className="exec-lines">
              <p>
                Suggested gross/net: {todayPlan?.suggested_gross_exposure_pct ?? '--'}% /{' '}
                {todayPlan?.suggested_net_exposure_pct ?? '--'}%
              </p>
              <p>{safety?.conclusion || 'Exposure is set by regime + risk pressure.'}</p>
            </div>
          </details>

          {uiMode !== 'beginner' ? (
            <details className="exec-steps">
              <summary>Evidence lines</summary>
              <div className="exec-lines">
                {(todayPlan?.why_today || []).map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {riskWarnings.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </details>
          ) : null}

          {uiMode !== 'beginner' ? (
            <div className="status-grid-3">
              <div className="status-box">
                <p className="muted">Active Trades</p>
                <h2>{portfolioSummary.activeTrades}</h2>
              </div>
              <div className="status-box">
                <p className="muted">Follow Rate</p>
                <h2>{portfolioSummary.followRate.toFixed(0)}%</h2>
              </div>
              <div className="status-box">
                <p className="muted">Signals Tracked</p>
                <h2>{activeOpportunities.length}</h2>
              </div>
            </div>
          ) : null}
        </article>

        {uiMode === 'advanced' ? (
          <>
            <SegmentedControl
              label="Opportunity Grade"
              options={[
                { label: 'All', value: 'ALL' },
                { label: 'A', value: 'A' },
                { label: 'B', value: 'B' },
                { label: 'C', value: 'C' },
              ]}
              value={gradeFilter}
              onChange={setGradeFilter}
              compact
            />

            <div className="filter-row">
              <span className="muted">Sort</span>
              <div className="filter-buttons">
                <button
                  type="button"
                  className={`pill-btn ${sortBy === 'score' ? 'active' : ''}`}
                  onClick={() => setSortBy('score')}
                >
                  Score
                </button>
                <button
                  type="button"
                  className={`pill-btn ${sortBy === 'confidence' ? 'active' : ''}`}
                  onClick={() => setSortBy('confidence')}
                >
                  {t('common.confidence')}
                </button>
                <button
                  type="button"
                  className={`pill-btn ${sortBy === 'newest' ? 'active' : ''}`}
                  onClick={() => setSortBy('newest')}
                >
                  {t('common.newest')}
                </button>
              </div>
            </div>

            <article className="glass-card">
              <h3 className="card-title">Advanced Opportunity Stack</h3>
              <p className="muted">Full ranked list after model scoring and risk filters.</p>
              {activeOpportunities.length ? (
                <div className="stack-gap compact-stack">
                  {activeOpportunities.map((signal) => (
                    <SignalCard
                      key={signal.signal_id}
                      signal={signal}
                      onSelect={setActiveSignal}
                      isWatched={watchlist.includes(signal.symbol)}
                      onToggleWatch={toggleWatch}
                      onQuickAsk={onQuickAsk}
                      onEligibilityCheck={setEligibilitySignal}
                      t={t}
                      locale={locale}
                    />
                  ))}
                </div>
              ) : (
                <article className="glass-card empty-card">
                  <p>
                    {todayPlan?.empty_states?.no_signal ||
                      'No actionable signal for current filter.'}
                  </p>
                </article>
              )}
            </article>

            <article className="glass-card">
              <h3 className="card-title">Alpha Families</h3>
              <div className="strategy-kpi-row">
                {alphaFamilies.map(([family, count]) => (
                  <div className="mini-stat" key={family}>
                    {family}: {count}
                  </div>
                ))}
              </div>
              <p className="muted status-line">
                Data tags: market=sample, features=derived, signals=simulated. No live broker
                execution data in this page.
              </p>
            </article>

            <article className="glass-card">
              <h3 className="card-title">Signal Funnel Snapshot</h3>
              <div className="strategy-kpi-row">
                <div className="mini-stat">
                  Universe: {analytics?.signal_funnel?.overall?.universe_size ?? '--'}
                </div>
                <div className="mini-stat">
                  Generated: {analytics?.signal_funnel?.overall?.raw_signals_generated ?? '--'}
                </div>
                <div className="mini-stat">
                  Filtered(Regime): {analytics?.signal_funnel?.overall?.filtered_by_regime ?? '--'}
                </div>
                <div className="mini-stat">
                  Filtered(Risk): {analytics?.signal_funnel?.overall?.filtered_by_risk ?? '--'}
                </div>
                <div className="mini-stat">
                  Executable: {analytics?.signal_funnel?.overall?.executable_opportunities ?? '--'}
                </div>
                <div className="mini-stat">
                  Filled: {analytics?.signal_funnel?.overall?.filled_trades ?? '--'}
                </div>
              </div>
            </article>
          </>
        ) : null}
      </div>

      <EligibilitySheet
        open={Boolean(eligibilitySignal)}
        signal={eligibilitySignal}
        checks={eligibilityChecks}
        onClose={() => setEligibilitySignal(null)}
        t={t}
      />
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import AboutModal from './components/AboutModal';
import AiPage from './components/AiPage';
import HoldingsTab from './components/HoldingsTab';
import MarketTab from './components/MarketTab';
import MoreTab from './components/MoreTab';
import OnboardingFlow from './components/OnboardingFlow';
import ProofTab from './components/ProofTab';
import ResearchTab from './components/ResearchTab';
import RiskTab from './components/RiskTab';
import SegmentedControl from './components/SegmentedControl';
import Skeleton from './components/Skeleton';
import SignalsTab from './components/SignalsTab';
import SystemStatusBar from './components/SystemStatusBar';
import TodayTab from './components/TodayTab';
import WeeklyReviewTab from './components/WeeklyReviewTab';
import { runQuantPipeline } from './engines/pipeline';
import { useLocalStorage } from './hooks/useLocalStorage';
import { createTranslator, getDefaultLang, getLocale } from './i18n';
import { buildHoldingsReview } from './research/holdingsAnalyzer';
import {
  buildInvestorDemoEnvironment,
  INVESTOR_DEMO_HOLDINGS,
  INVESTOR_DEMO_PERFORMANCE
} from './demo/investorDemo';

const TAB_META = {
  today: { icon: '◉', label: 'Today' },
  ai: { icon: '✦', label: 'AI' },
  holdings: { icon: '▣', label: 'Holdings' },
  more: { icon: '⋯', label: 'More' }
};

const MORE_TITLES = {
  'group:review': 'Review',
  'group:system': 'System',
  'group:market': 'Market Notes',
  'group:settings': 'Settings',
  signals: 'Signals Hub',
  weekly: 'Weekly Review',
  discipline: 'Discipline Progress',
  performance: 'Performance',
  safety: 'Safety',
  insights: 'Insights',
  data: 'Data Status',
  settings: 'Settings',
  advanced: 'Advanced'
};

const initialData = {
  signals: [],
  evidence: {
    top_signals: [],
    source_status: 'INSUFFICIENT_DATA',
    data_status: 'INSUFFICIENT_DATA',
    asof: null,
    supporting_run_id: null
  },
  performance: { records: [], last_updated: null, proof: { datasets: {} }, paper_timeline: [] },
  trades: [],
  velocity: {},
  config: {},
  market_modules: [],
  analytics: {},
  research: null,
  today: null,
  safety: null,
  insights: null,
  ai: null,
  layers: {}
};

const EXPLICIT_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1';

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status})`);
  }
  return response.json();
}

function mapExecutionToTrade(execution) {
  const baseTime = execution.created_at || new Date().toISOString();
  const pnl = Number(execution.pnl_pct ?? execution.pnlPct ?? 0);
  return {
    time_in: baseTime,
    time_out: baseTime,
    market: execution.market,
    symbol: execution.symbol,
    side: execution.side || execution.direction || 'LONG',
    entry: Number(execution.entry ?? execution.entry_price ?? 0),
    exit: Number(execution.exit ?? execution.tp_price ?? execution.entry ?? execution.entry_price ?? 0),
    pnl_pct: pnl,
    fees: Number(execution.fees ?? 0),
    signal_id: execution.signal_id || execution.signalId,
    source: execution.mode || 'PAPER'
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function localDateKey(input = new Date()) {
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function keyToDate(key) {
  const [y, m, d] = String(key || '')
    .split('-')
    .map((value) => Number(value));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function shiftDateKey(key, deltaDays) {
  const base = keyToDate(key);
  if (!base) return '';
  base.setDate(base.getDate() + deltaDays);
  return localDateKey(base);
}

function weekStartKey(input = new Date()) {
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return '';
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  return localDateKey(d);
}

function addUniqueKey(rows = [], key) {
  if (!key) return rows;
  if (rows.includes(key)) return rows;
  return [...rows, key].sort();
}

function calcStreak(rows = [], anchorKey, stepDays = 1) {
  if (!anchorKey) return 0;
  const set = new Set(rows || []);
  let cursor = anchorKey;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -stepDays);
  }
  return streak;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('today');
  const [moreSection, setMoreSection] = useState('menu');
  const [assetClass, setAssetClass] = useLocalStorage('nova-quant-asset-class', 'US_STOCK', {
    legacyKeys: ['quant-demo-asset-class']
  });
  const [market, setMarket] = useState('US');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(initialData);
  const [rawData, setRawData] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const [aboutOpen, setAboutOpen] = useState(false);
  const [watchlist, setWatchlist] = useLocalStorage('nova-quant-watchlist', [], {
    legacyKeys: ['quant-demo-watchlist']
  });
  const [executions, setExecutions] = useLocalStorage('nova-quant-executions', [], {
    legacyKeys: ['quant-demo-executions']
  });
  const [holdings, setHoldings] = useLocalStorage('nova-quant-holdings', [], {
    legacyKeys: ['quant-demo-holdings']
  });
  const [riskProfileKey, setRiskProfileKey] = useLocalStorage('nova-quant-risk-profile', 'balanced', {
    legacyKeys: ['quant-demo-risk-profile']
  });
  const [uiMode, setUiMode] = useLocalStorage('nova-quant-ui-mode', 'standard', {
    legacyKeys: ['quant-demo-ui-mode']
  });
  const [onboardingDone, setOnboardingDone] = useLocalStorage('nova-quant-onboarding-done', false, {
    legacyKeys: ['quant-demo-onboarding-done']
  });
  const [showOnboarding, setShowOnboarding] = useState(!onboardingDone);
  const [lang, setLang] = useLocalStorage('nova-quant-lang', getDefaultLang(), {
    legacyKeys: ['quant-demo-lang']
  });
  const [investorDemoEnabled, setInvestorDemoEnabled] = useLocalStorage('nova-quant-investor-demo-enabled', false);
  const [investorDemoHoldingsBackup, setInvestorDemoHoldingsBackup] = useLocalStorage(
    'nova-quant-investor-demo-holdings-backup',
    null
  );
  const [investorDemoUiBackup, setInvestorDemoUiBackup] = useLocalStorage(
    'nova-quant-investor-demo-ui-backup',
    null
  );
  const [chatUserId] = useLocalStorage(
    'nova-quant-chat-user-id',
    `guest-${Math.random().toString(36).slice(2, 10)}`,
    { legacyKeys: ['quant-demo-chat-user-id'] }
  );
  const [disciplineLog, setDisciplineLog] = useLocalStorage(
    'nova-quant-discipline-log',
    {
      checkins: [],
      boundary_kept: [],
      weekly_reviews: []
    },
    { legacyKeys: ['quant-demo-discipline-log'] }
  );
  const [aiSeedRequest, setAiSeedRequest] = useState(null);

  const t = useMemo(() => createTranslator(lang), [lang]);
  const locale = useMemo(() => getLocale(lang), [lang]);

  const investorDemoEnvironment = useMemo(
    () => (investorDemoEnabled ? buildInvestorDemoEnvironment(assetClass) : null),
    [investorDemoEnabled, assetClass]
  );

  const uiData = useMemo(() => {
    if (!investorDemoEnabled) return data;
    return {
      ...data,
      signals: investorDemoEnvironment?.signals || [],
      evidence: {
        ...(data.evidence || {}),
        ...(investorDemoEnvironment?.evidence || {}),
        top_signals: investorDemoEnvironment?.evidence?.top_signals || [],
        source_status: investorDemoEnvironment?.evidence?.source_status || 'DEMO_ONLY',
        data_status: investorDemoEnvironment?.evidence?.data_status || 'DEMO_ONLY'
      },
      performance: {
        ...data.performance,
        investor_demo: INVESTOR_DEMO_PERFORMANCE
      },
      today: investorDemoEnvironment?.today || data.today,
      safety: investorDemoEnvironment?.safety || data.safety,
      insights: investorDemoEnvironment?.insights || data.insights,
      config: {
        ...data.config,
        ...(investorDemoEnvironment?.config || {}),
        runtime: {
          ...(data.config?.runtime || {}),
          ...(investorDemoEnvironment?.config?.runtime || {})
        }
      }
    };
  }, [investorDemoEnabled, investorDemoEnvironment, data]);

  const holdingsReview = useMemo(
    () => buildHoldingsReview({ holdings, state: uiData }),
    [holdings, uiData]
  );

  const aiState = useMemo(
    () => ({
      ...uiData,
      user_context: {
        user_id: chatUserId,
        ui_mode: uiMode,
        holdings,
        holdings_review: holdingsReview
      }
    }),
    [uiData, chatUserId, uiMode, holdings, holdingsReview]
  );

  const enableInvestorDemo = () => {
    if (!investorDemoEnabled) {
      setInvestorDemoHoldingsBackup(Array.isArray(holdings) ? holdings : []);
      setInvestorDemoUiBackup({
        assetClass,
        market
      });
    }
    setHoldings(INVESTOR_DEMO_HOLDINGS);
    setAssetClass('US_STOCK');
    setMarket('US');
    setInvestorDemoEnabled(true);
    setMoreSection('menu');
    setActiveTab('today');
  };

  const clearInvestorDemo = () => {
    const restore = Array.isArray(investorDemoHoldingsBackup) ? investorDemoHoldingsBackup : [];
    setInvestorDemoEnabled(false);
    setHoldings(restore);
    if (investorDemoUiBackup?.assetClass) setAssetClass(investorDemoUiBackup.assetClass);
    if (investorDemoUiBackup?.market) setMarket(investorDemoUiBackup.market);
    setInvestorDemoHoldingsBackup(null);
    setInvestorDemoUiBackup(null);
  };

  useEffect(() => {
    if (assetClass === 'CRYPTO' && market !== 'CRYPTO') {
      setMarket('CRYPTO');
    } else if (assetClass !== 'CRYPTO' && market !== 'US') {
      setMarket('US');
    }
  }, [assetClass, market]);

  useEffect(() => {
    let mounted = true;

    async function load({ silent = false } = {}) {
      if (!silent) setLoading(true);
      try {
        if (EXPLICIT_DEMO_MODE) {
          await new Promise((resolve) => setTimeout(resolve, 280));
          if (!mounted) return;
          setRawData({ as_of: new Date().toISOString() });
          setHasLoaded(true);
          return;
        }

        const query = new URLSearchParams({
          userId: chatUserId,
          market,
          assetClass
        });

        const [
          runtime,
          assets,
          signals,
          evidenceTopSignals,
          marketState,
          performance,
          modules,
          riskProfile,
          brokerConnection,
          exchangeConnection
        ] = await Promise.all([
          fetchJson(`/api/runtime-state?${query.toString()}`),
          fetchJson(`/api/assets?market=${market}`),
          fetchJson(`/api/signals?${query.toString()}&limit=60`),
          fetchJson(`/api/evidence/signals/top?${query.toString()}&limit=3`).catch(() => null),
          fetchJson(`/api/market-state?${query.toString()}`),
          fetchJson(`/api/performance?${query.toString()}`),
          fetchJson(`/api/market/modules?${query.toString()}`),
          fetchJson(`/api/risk-profile?userId=${chatUserId}`),
          fetchJson(`/api/connect/broker?userId=${chatUserId}&provider=ALPACA`),
          fetchJson(`/api/connect/exchange?userId=${chatUserId}&provider=BINANCE`)
        ]);

        if (!mounted) return;
        const runtimeData = runtime?.data || initialData;
        const evidenceData = {
          top_signals: Array.isArray(evidenceTopSignals?.records) ? evidenceTopSignals.records : [],
          source_status: evidenceTopSignals?.source_status || 'INSUFFICIENT_DATA',
          data_status: evidenceTopSignals?.data_status || 'INSUFFICIENT_DATA',
          asof: evidenceTopSignals?.asof || null,
          supporting_run_id: evidenceTopSignals?.supporting_run_id || null,
          dataset_version_id: evidenceTopSignals?.dataset_version_id || null,
          strategy_version_id: evidenceTopSignals?.strategy_version_id || null
        };
        const nextData = {
          ...runtimeData,
          signals: Array.isArray(signals?.data) ? signals.data : runtimeData.signals || [],
          evidence: evidenceData,
          market_modules: Array.isArray(modules?.data) ? modules.data : runtimeData.market_modules || [],
          performance: performance || runtimeData.performance || initialData.performance,
          config: {
            ...(runtimeData.config || {}),
            last_updated:
              runtime?.data_transparency?.as_of || runtime?.asof || runtimeData.config?.last_updated || new Date().toISOString(),
            source_label: runtimeData.config?.source_label || runtime?.source_status || 'INSUFFICIENT_DATA',
            data_status: runtimeData.config?.data_status || runtime?.data_status || 'INSUFFICIENT_DATA',
            runtime: {
              ...(runtimeData.config?.runtime || {}),
              source_status: runtime?.source_status || 'INSUFFICIENT_DATA',
              freshness_summary: runtime?.data_transparency?.freshness_summary || null,
              coverage_summary: runtime?.data_transparency?.coverage_summary || null,
              api_checks: {
                assets_count: assets?.count ?? null,
                signal_count: signals?.count ?? null,
                market_state_count: marketState?.count ?? null,
                modules_count: modules?.count ?? null,
                performance_records: performance?.records?.length ?? null
              },
              connectivity: {
                broker: brokerConnection?.snapshot || null,
                exchange: exchangeConnection?.snapshot || null
              }
            },
            risk_rules: {
              ...(runtimeData.config?.risk_rules || {}),
              per_trade_risk_pct: riskProfile?.data?.max_loss_per_trade ?? runtimeData.config?.risk_rules?.per_trade_risk_pct ?? null,
              daily_loss_pct: riskProfile?.data?.max_daily_loss ?? runtimeData.config?.risk_rules?.daily_loss_pct ?? null,
              max_dd_pct: riskProfile?.data?.max_drawdown ?? runtimeData.config?.risk_rules?.max_dd_pct ?? null,
              exposure_cap_pct: riskProfile?.data?.exposure_cap ?? runtimeData.config?.risk_rules?.exposure_cap_pct ?? null
            }
          }
        };
        setData(nextData);
        setRawData({
          as_of: runtime?.asof || new Date().toISOString(),
          source_status: runtime?.source_status || 'INSUFFICIENT_DATA'
        });
        setHasLoaded(true);
      } catch {
        if (!mounted) return;
        setData(initialData);
        setRawData(null);
        setHasLoaded(false);
      } finally {
        if (mounted && !silent) setLoading(false);
      }
    }

    load();
    const refresh = setInterval(() => load({ silent: true }), 120000);

    return () => {
      mounted = false;
      clearInterval(refresh);
    };
  }, [assetClass, market, chatUserId, refreshNonce]);

  useEffect(() => {
    if (!EXPLICIT_DEMO_MODE || !rawData) return;
    const executionTrades = executions.map(mapExecutionToTrade);
    const modeled = runQuantPipeline({
      ...rawData,
      config: {
        risk_profile: riskProfileKey
      },
      trades: executionTrades
    });
    setData(modeled);
  }, [rawData, executions, riskProfileKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (EXPLICIT_DEMO_MODE) return;
    void fetchJson('/api/risk-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: chatUserId,
        profileKey: riskProfileKey
      })
    })
      .then(() => setRefreshNonce((current) => current + 1))
      .catch(() => {});
  }, [riskProfileKey, chatUserId]);

  const lastUpdated = useMemo(() => {
    return uiData.config.last_updated || uiData.performance.last_updated || uiData.velocity.last_updated || null;
  }, [uiData]);

  const modelVersion = useMemo(() => {
    const pipelineVersion = uiData.config?.calc_meta?.pipeline_version;
    if (pipelineVersion) return `NQ ${pipelineVersion}`;
    return 'NQ v1.0.0';
  }, [uiData.config]);

  const todayKey = localDateKey(now);
  const currentWeekKey = weekStartKey(now);

  const discipline = useMemo(() => {
    const checkins = disciplineLog?.checkins || [];
    const boundary = disciplineLog?.boundary_kept || [];
    const weekly = disciplineLog?.weekly_reviews || [];

    return {
      checkedToday: checkins.includes(todayKey),
      boundaryToday: boundary.includes(todayKey),
      reviewedThisWeek: weekly.includes(currentWeekKey),
      checkinStreak: calcStreak(checkins, todayKey, 1),
      boundaryStreak: calcStreak(boundary, todayKey, 1),
      weeklyStreak: calcStreak(weekly, currentWeekKey, 7)
    };
  }, [disciplineLog, todayKey, currentWeekKey]);

  const markDailyCheckin = () => {
    setDisciplineLog((current) => ({
      ...current,
      checkins: addUniqueKey(current?.checkins || [], todayKey)
    }));
  };

  const markBoundaryKept = () => {
    setDisciplineLog((current) => ({
      ...current,
      boundary_kept: addUniqueKey(current?.boundary_kept || [], todayKey)
    }));
  };

  const markWeeklyReviewed = () => {
    setDisciplineLog((current) => ({
      ...current,
      weekly_reviews: addUniqueKey(current?.weekly_reviews || [], currentWeekKey)
    }));
  };

  const askAi = (message) => {
    const text = String(message || '').trim();
    if (!text) return;
    setAiSeedRequest({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message: text
    });
    setActiveTab('ai');
  };

  const navigateFromAi = (target) => {
    if (!target) return;
    if (target.startsWith('more:')) {
      const section = target.split(':')[1] || 'menu';
      setMoreSection(section);
      setActiveTab('more');
      return;
    }
    setActiveTab(target);
    if (target !== 'more') setMoreSection('menu');
  };

  const recordExecution = async ({ signal, mode, action }) => {
    const payload = {
      signal_id: signal.signal_id,
      signalId: signal.signal_id,
      market: signal.market,
      symbol: signal.symbol,
      side: signal.direction,
      direction: signal.direction,
      mode,
      action,
      created_at: new Date().toISOString(),
      entry: (signal.entry_zone?.low + signal.entry_zone?.high) / 2 || signal.entry_min,
      entry_price: (signal.entry_zone?.low + signal.entry_zone?.high) / 2 || signal.entry_min,
      tp_price: signal.take_profit_levels?.[0]?.price ?? signal.take_profit,
      pnl_pct: action === 'DONE' ? Number(signal.quick_pnl_pct ?? 0.6) : 0
    };
    if (EXPLICIT_DEMO_MODE) {
      setExecutions((current) => [payload, ...current].slice(0, 200));
      return;
    }
    try {
      await fetchJson('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: chatUserId,
          signalId: signal.signal_id,
          mode,
          action,
          note: 'Recorded from Today quick action'
        })
      });
      setRefreshNonce((current) => current + 1);
    } catch {
      // Keep UI resilient; failed writes are surfaced by stale state.
    }
  };

  const resetMore = () => {
    setMoreSection('menu');
  };

  const openMoreSection = (section) => {
    setMoreSection(section);
    setActiveTab('more');
  };

  const renderDataStatus = () => {
    const runtime = data?.config?.runtime || {};
    const freshnessRows = runtime?.freshness_summary?.rows || [];
    const coverage = runtime?.coverage_summary || {};
    const topIssues = [];
    if (runtime?.source_status !== 'DB_BACKED') {
      topIssues.push('当前运行时并非完整 DB_BACKED，部分对象会降级为 unavailable。');
    }
    if ((runtime?.freshness_summary?.stale_count || 0) > 0) {
      topIssues.push(`发现 ${runtime?.freshness_summary?.stale_count} 个资产存在 stale/insufficient 状态。`);
    }
    if ((coverage?.assets_with_bars || 0) === 0) {
      topIssues.push('尚未检测到可用 bars，请先执行 backfill + derive:runtime。');
    }

    return (
      <section className="stack-gap">
        <article className="glass-card">
          <h3 className="card-title">Data Status</h3>
          <p className="muted status-line">Overall: {runtime?.source_status || data?.data_status || '--'}</p>
          <div className="status-grid-3">
            <div className="status-box">
              <p className="muted">Assets Checked</p>
              <h2>{coverage?.assets_checked ?? '--'}</h2>
            </div>
            <div className="status-box">
              <p className="muted">Bars Coverage</p>
              <h2>{coverage?.assets_with_bars ?? '--'}</h2>
            </div>
            <div className="status-box">
              <p className="muted">Signals Generated</p>
              <h2>{coverage?.generated_signals ?? '--'}</h2>
            </div>
          </div>
          <ul className="bullet-list">
            {(topIssues.length ? topIssues : ['当前未发现阻断级数据问题。']).slice(0, 5).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="glass-card">
          <h3 className="card-title">Source Freshness</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Market</th>
                  <th>Status</th>
                  <th>Age(H)</th>
                  <th>Stale</th>
                </tr>
              </thead>
              <tbody>
                {freshnessRows.map((row) => (
                  <tr key={`${row.market}-${row.symbol}`}>
                    <td>{row.symbol}</td>
                    <td>{row.market}</td>
                    <td>{row.status}</td>
                    <td>{row.age_hours ?? '--'}</td>
                    <td>{row.status === 'DB_BACKED' ? 'No' : 'Yes'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    );
  };

  const renderSettings = () => {
    return (
      <section className="stack-gap">
        <article className="glass-card">
          <h3 className="card-title">Preferences</h3>
          <p className="muted status-line">模式会改变信息密度，不会改变底层策略产出。</p>

          <div style={{ marginTop: 10 }}>
            <SegmentedControl
              label={t('app.userMode', undefined, 'Mode')}
              options={[
                { label: t('mode.beginner', undefined, 'Beginner'), value: 'beginner' },
                { label: t('mode.standard', undefined, 'Standard'), value: 'standard' },
                { label: t('mode.advanced', undefined, 'Advanced'), value: 'advanced' }
              ]}
              value={uiMode}
              onChange={setUiMode}
              compact
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <SegmentedControl
              label={t('app.riskMode', undefined, 'Risk Mode')}
              options={[
                { label: t('onboarding.profile.conservative'), value: 'conservative' },
                { label: t('onboarding.profile.balanced'), value: 'balanced' },
                { label: t('onboarding.profile.aggressive'), value: 'aggressive' }
              ]}
              value={riskProfileKey}
              onChange={setRiskProfileKey}
              compact
            />
          </div>

          <div style={{ marginTop: 10 }} className="lang-toggle" role="group" aria-label="Language switch">
            <button
              type="button"
              className={`lang-option ${lang === 'en' ? 'active' : ''}`}
              onClick={() => setLang('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={`lang-option ${lang === 'zh' ? 'active' : ''}`}
              onClick={() => setLang('zh')}
            >
              中文
            </button>
          </div>

          <div className="action-row" style={{ marginTop: 10 }}>
            <button type="button" className="secondary-btn" onClick={() => setShowOnboarding(true)}>
              Re-run Onboarding
            </button>
            <button type="button" className="secondary-btn" onClick={() => setAboutOpen(true)}>
              About & Compliance
            </button>
          </div>
        </article>

        <article className="glass-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Demo Mode / 体验 Demo</h3>
              <p className="muted status-line">
                Enter a full demo environment with demo signals, demo holdings, and demo performance. No login and no real account connection.
              </p>
            </div>
            <span className={`badge ${investorDemoEnabled ? 'badge-medium' : 'badge-neutral'}`}>
              {investorDemoEnabled ? 'DEMO_ONLY' : 'OFF'}
            </span>
          </div>

          <ul className="bullet-list">
            <li>One tap enters the full demo environment and lands back on Today.</li>
            <li>Home, AI, Holdings, and Performance all stay clickable and consistent.</li>
            <li>Demo metrics 3.7% / 4.1% / 67.4% / 1.62 are clearly marked as demo only.</li>
          </ul>

          <div className="action-row" style={{ marginTop: 10 }}>
            <button type="button" className="primary-btn" onClick={enableInvestorDemo}>
              Demo Mode / 体验 Demo
            </button>
            <button type="button" className="secondary-btn" onClick={clearInvestorDemo} disabled={!investorDemoEnabled}>
              Exit Demo
            </button>
          </div>
        </article>
      </section>
    );
  };

  const renderMoreSection = (section) => {
    if (section === 'signals') {
      return !hasLoaded && loading ? (
        <Skeleton lines={6} />
      ) : (
        <SignalsTab
          market={market}
          setMarket={setMarket}
          assetClass={assetClass}
          setAssetClass={setAssetClass}
          signals={uiData.signals || []}
          loading={loading}
          analytics={uiData.analytics || {}}
          executions={uiData.trades || []}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          onQuickAsk={(_intent, signal) => askAi(`请解释 ${signal?.symbol || '该信号'} 的执行逻辑和风险边界。`)}
          onPaperExecute={(signal) => recordExecution({ signal, mode: 'PAPER', action: 'EXECUTE' })}
          onMarkDone={(signal) => recordExecution({ signal, mode: 'PAPER', action: 'DONE' })}
          riskRules={uiData.config?.risk_rules || {}}
          riskStatus={uiData.config?.risk_status || {}}
          todayPlan={uiData.today || {}}
          safety={uiData.safety || {}}
          alphaLibrary={uiData.research?.alpha_registry || []}
          uiMode={uiMode}
          t={t}
          locale={locale}
        />
      );
    }

    if (section === 'weekly') {
      return (
        <WeeklyReviewTab
          research={uiData.research}
          today={uiData.today}
          safety={uiData.safety}
          insights={uiData.insights}
          signals={uiData.signals}
          uiMode={uiMode}
          locale={locale}
          discipline={discipline}
          onMarkReviewed={markWeeklyReviewed}
          onExplain={(message) => askAi(message)}
        />
      );
    }

    if (section === 'discipline') {
      return (
        <section className="stack-gap">
          <article className="glass-card posture-card">
            <h3 className="card-title">Discipline Progress</h3>
            <p className="daily-brief-conclusion">你在训练的是判断节奏，不是交易频率。</p>

            <div className="status-grid-3">
              <div className="status-box">
                <p className="muted">Daily Check-in</p>
                <h2>{discipline.checkinStreak} 天</h2>
              </div>
              <div className="status-box">
                <p className="muted">Weekly Review</p>
                <h2>{discipline.weeklyStreak} 周</h2>
              </div>
              <div className="status-box">
                <p className="muted">Risk Boundary</p>
                <h2>{discipline.boundaryStreak} 天</h2>
              </div>
            </div>

            <ul className="bullet-list">
              <li>{discipline.checkedToday ? '今天已完成判断校准。' : '今天还未完成判断校准。'}</li>
              <li>{discipline.boundaryToday ? '今天已确认风险边界。' : '今天还未确认风险边界。'}</li>
              <li>{discipline.reviewedThisWeek ? '本周复盘已完成。' : '本周还未完成复盘。'}</li>
            </ul>

            <div className="action-row">
              <button type="button" className="primary-btn" onClick={markDailyCheckin}>
                完成今日 Check-in
              </button>
              <button type="button" className="secondary-btn" onClick={markBoundaryKept}>
                记录风险边界执行
              </button>
              <button type="button" className="secondary-btn" onClick={markWeeklyReviewed}>
                标记本周复盘完成
              </button>
            </div>
          </article>
        </section>
      );
    }

    if (section === 'performance') {
      return (
        <ProofTab
          market={market}
          setMarket={setMarket}
          performance={uiData.performance}
          trades={uiData.trades}
          research={uiData.research}
          loading={loading}
          uiMode={uiMode}
          t={t}
          lang={lang}
          locale={locale}
          investorDemoSummary={investorDemoEnabled ? INVESTOR_DEMO_PERFORMANCE : null}
        />
      );
    }

    if (section === 'safety') {
      return !hasLoaded && loading ? (
        <Skeleton lines={6} />
      ) : (
        <RiskTab
          config={uiData.config}
          safety={uiData.safety}
          research={uiData.research}
          uiMode={uiMode}
          t={t}
          lang={lang}
          onExplain={() => askAi('哪些风险在压制系统仓位？')}
        />
      );
    }

    if (section === 'insights') {
      return !hasLoaded && loading ? (
        <Skeleton lines={6} />
      ) : (
        <MarketTab
          market={market}
          setMarket={setMarket}
          assetClass={assetClass}
          setAssetClass={setAssetClass}
          velocity={uiData.velocity}
          modules={uiData.market_modules || []}
          insights={uiData.insights}
          uiMode={uiMode}
          t={t}
          lang={lang}
          onExplainRisk={() => askAi('为什么今天信号会是这个结构？')}
        />
      );
    }

    if (section === 'advanced') {
      return !hasLoaded && loading ? <Skeleton lines={6} /> : <ResearchTab research={uiData.research} loading={loading} locale={locale} />;
    }

    if (section === 'data') {
      return renderDataStatus();
    }

    if (section === 'settings') {
      return renderSettings();
    }

    return null;
  };

  const renderScreen = () => {
    if (activeTab === 'today') {
      return (
        <TodayTab
          now={now}
          assetClass={assetClass}
          today={uiData.today}
          safety={uiData.safety}
          insights={uiData.insights}
          signals={uiData.signals}
          topSignalEvidence={uiData?.evidence?.top_signals || []}
          performance={uiData.performance}
          runtime={uiData?.config?.runtime || {}}
          trades={uiData?.trades || []}
          watchlist={watchlist}
          holdingsReview={holdingsReview}
          uiMode={uiMode}
          locale={locale}
          discipline={discipline}
          investorDemoEnabled={investorDemoEnabled}
          onCompleteCheckIn={markDailyCheckin}
          onConfirmBoundary={markBoundaryKept}
          onOpenHoldings={() => setActiveTab('holdings')}
          onAskAi={askAi}
          onOpenWeekly={() => openMoreSection('weekly')}
          onOpenSignals={() => openMoreSection('signals')}
          onToggleWatchlist={(symbol) =>
            setWatchlist((current) =>
              current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]
            )
          }
          onPaperExecute={(signal) => recordExecution({ signal, mode: 'PAPER', action: 'EXECUTE' })}
        />
      );
    }

    if (activeTab === 'ai') {
      return <AiPage t={t} locale={locale} quantState={aiState} seedRequest={aiSeedRequest} onNavigate={navigateFromAi} />;
    }

    if (activeTab === 'holdings') {
      return (
        <HoldingsTab
          holdings={holdings}
          setHoldings={setHoldings}
          holdingsReview={holdingsReview}
          uiMode={uiMode}
          t={t}
          locale={locale}
          investorDemoEnabled={investorDemoEnabled}
          onLoadInvestorDemo={enableInvestorDemo}
          onClearInvestorDemo={clearInvestorDemo}
          onExplain={(message) => askAi(message)}
        />
      );
    }

    return (
      <MoreTab
        section={moreSection}
        onSectionChange={setMoreSection}
        uiMode={uiMode}
        discipline={discipline}
        renderSection={renderMoreSection}
        investorDemoEnabled={investorDemoEnabled}
        onToggleDemo={() => {
          if (investorDemoEnabled) {
            clearInvestorDemo();
          } else {
            enableInvestorDemo();
          }
        }}
        onOpenAbout={() => setAboutOpen(true)}
      />
    );
  };

  const heading =
    activeTab === 'more' && moreSection !== 'menu'
      ? MORE_TITLES[moreSection] || TAB_META.more.label
      : TAB_META[activeTab]?.label || 'Today';

  return (
    <div className="app-bg">
      <div className="device-shell">
        <header className="top-bar">
          <div>
            <p className="brand">{t('app.brand')}</p>
            <h1 className="headline">{heading}</h1>
          </div>

          <div className="top-actions">
            <button type="button" className="ghost-btn" onClick={() => setActiveTab('ai')}>
              Ask AI
            </button>
            <button type="button" className="ghost-btn" onClick={() => setAboutOpen(true)}>
              About
            </button>
          </div>
        </header>

        {activeTab !== 'more' ? (
          <SystemStatusBar
            connected={hasLoaded && uiData?.config?.runtime?.source_status === 'DB_BACKED'}
            riskMode={riskProfileKey}
            uiMode={uiMode}
            currency="USD"
            t={t}
            locale={locale}
          />
        ) : null}

        {activeTab !== 'more' ? (
          <div className="mode-strip">
            <SegmentedControl
              label={t('app.userMode', undefined, 'Mode')}
              options={[
                { label: t('mode.beginner', undefined, 'Beginner'), value: 'beginner' },
                { label: t('mode.standard', undefined, 'Standard'), value: 'standard' },
                { label: t('mode.advanced', undefined, 'Advanced'), value: 'advanced' }
              ]}
              value={uiMode}
              onChange={setUiMode}
              compact
            />
          </div>
        ) : null}

        <main className="main-content">
          <div className="screen-transition" key={`${activeTab}-${moreSection}-${uiMode}`}>
            {renderScreen()}
          </div>
        </main>

        <nav
          className="bottom-nav"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))'
          }}
        >
          {Object.entries(TAB_META).map(([key, value]) => (
            <button
              key={key}
              type="button"
              className={`tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(key);
                if (key !== 'more') {
                  resetMore();
                } else {
                  setMoreSection('menu');
                }
              }}
            >
              <span>{value.icon}</span>
              <span>{value.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} config={data.config} t={t} locale={locale} />

      <OnboardingFlow
        open={showOnboarding}
        t={t}
        onComplete={(payload) => {
          setMarket(payload.market);
          setAssetClass(payload.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
          setWatchlist(payload.watchlist);
          setRiskProfileKey(payload.riskProfile);
          setOnboardingDone(true);
          setShowOnboarding(false);
        }}
      />
    </div>
  );
}

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AboutModal from './components/AboutModal';
const AiPage = lazy(() => import('./components/AiPage'));
import novaLogo from './assets/NOVA1.png';
import novaLogoCompact from './assets/Nova2.png';
const BrowseTab = lazy(() => import('./components/BrowseTab'));
const DataStatusTab = lazy(() => import('./components/DataStatusTab'));
const DisciplineTab = lazy(() => import('./components/DisciplineTab'));
const HoldingsTab = lazy(() => import('./components/HoldingsTab'));
const LearningLoopTab = lazy(() => import('./components/LearningLoopTab'));
const MarketTab = lazy(() => import('./components/MarketTab'));
const MenuTab = lazy(() => import('./components/MenuTab'));
const OnboardingFlow = lazy(() => import('./components/OnboardingFlow'));
const ProofTab = lazy(() => import('./components/ProofTab'));
const ResearchTab = lazy(() => import('./components/ResearchTab'));
const RiskTab = lazy(() => import('./components/RiskTab'));
const SettingsTab = lazy(() => import('./components/SettingsTab'));
import Skeleton from './components/Skeleton';
const SignalsTab = lazy(() => import('./components/SignalsTab'));
import TodayTab from './components/TodayTab';
const WeeklyReviewTab = lazy(() => import('./components/WeeklyReviewTab'));
import { runQuantPipeline } from './engines/pipeline';
import { useLocalStorage } from './hooks/useLocalStorage';
import { createTranslator, getDefaultLang, getLocale } from './i18n';
import { buildHoldingsReview } from './research/holdingsAnalyzer';
import { fetchApi, fetchApiJson } from './utils/api';
import {
  classifyAuthError,
  detectDisplayMode,
  isLocalAuthRuntime,
  mapExecutionToTrade,
  normalizeEmail,
  runWhenIdle,
  settledValue,
} from './utils/appHelpers';
import { primeBrowseHomeBundle, primeBrowseUniverseBundle } from './utils/browseWarmup';
import { addUniqueKey, calcStreak, localDateKey, weekStartKey } from './utils/date';
import {
  deriveConnectedHoldings,
  mergeHoldingsSources,
  summarizeHoldingsSource,
} from './utils/holdingsSource';
import {
  buildInvestorDemoEnvironment,
  INVESTOR_DEMO_HOLDINGS,
  INVESTOR_DEMO_PERFORMANCE,
} from './demo/investorDemo';
import {
  DEMO_ENTRY_ENABLED,
  FORCE_DEMO_BUILD,
  isDemoRuntime as getIsDemoRuntime,
} from './demo/runtime';

const MENU_PARENTS = {
  weekly: 'group:review',
  discipline: 'group:review',
  signals: 'group:system',
  performance: 'group:system',
  safety: 'group:system',
  data: 'group:system',
  learning: 'group:system',
  insights: 'group:market',
  settings: 'group:settings',
  advanced: 'group:settings',
};

function buildTabMeta(locale) {
  const zh = locale?.startsWith('zh');
  return {
    today: { icon: 'today', label: zh ? '今日' : 'Today' },
    ai: { icon: 'nova', label: 'Nova' },
    browse: { icon: 'browse', label: zh ? '发现' : 'Browse' },
    my: { icon: 'my', label: zh ? '我的' : 'My' },
  };
}

function TopBarMenuGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="top-bar-action-icon" focusable="false" aria-hidden="true">
      <path
        d="M4 5.75h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M6.25 10h9.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M4 14.25h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TabBarIcon({ name }) {
  if (name === 'today') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="native-tabbar-icon-svg"
        focusable="false"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'nova') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="native-tabbar-icon-svg"
        focusable="false"
        aria-hidden="true"
      >
        <path
          d="M12 4.8 13.7 10.3 19.2 12 13.7 13.7 12 19.2 10.3 13.7 4.8 12 10.3 10.3Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (name === 'browse') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="native-tabbar-icon-svg"
        focusable="false"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path
          d="M14.5 14.5 18.5 18.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="native-tabbar-icon-svg"
      focusable="false"
      aria-hidden="true"
    >
      <circle cx="12" cy="9" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M6.6 18.2c1.4-2.6 3.2-3.9 5.4-3.9s4 1.3 5.4 3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function buildMenuTitles(locale) {
  const zh = locale?.startsWith('zh');
  return {
    menu: zh ? '菜单' : 'Menu',
    support: zh ? '支持' : 'Support',
    'help-center': zh ? '帮助中心' : 'Help Center',
    'support-chats': zh ? '支持会话' : 'Support Chats',
    disclosures: zh ? '披露与说明' : 'Disclosures',
    points: zh ? '积分中心' : 'Points Hub',
    'prediction-games': zh ? '预测游戏' : 'Prediction Games',
    rewards: zh ? '奖励 / 邀请好友' : 'Rewards / Invite Friends',
    'security-privacy': zh ? '安全与隐私' : 'Security & Privacy',
    'create-passkey': zh ? '创建通行密钥' : 'Create passkey',
    'change-password': zh ? '修改密码' : 'Change password',
    'device-security': zh ? '设备安全' : 'Device security',
    devices: zh ? '设备管理' : 'Devices',
    'profile-visibility': zh ? '资料可见性' : 'Profile visibility',
    blocking: zh ? '屏蔽名单' : 'Blocking',
    'manage-data': zh ? '管理你的数据' : 'Manage your data',
    'privacy-choices': zh ? '隐私选择' : 'Privacy choices',
    'download-personal-data': zh ? '下载个人数据' : 'Download personal data',
    'request-data-deletion': zh ? '请求删除数据' : 'Request data deletion',
    'privacy-policy': zh ? '隐私政策' : 'Privacy Policy',
    'points-history': zh ? '积分明细' : 'Points History',
    'group:review': zh ? '复盘' : 'Review',
    'group:system': zh ? '系统' : 'System',
    'group:market': zh ? '市场笔记' : 'Market Notes',
    'group:settings': zh ? '设置' : 'Settings',
    signals: zh ? '信号总览' : 'Signals',
    weekly: zh ? '周复盘' : 'Weekly Review',
    discipline: zh ? '纪律进度' : 'Discipline Progress',
    performance: zh ? '表现证明' : 'Performance',
    safety: zh ? '安全边界' : 'Safety',
    insights: zh ? '市场洞察' : 'Insights',
    data: zh ? '数据状态' : 'Data Status',
    learning: zh ? '学习飞轮' : 'Learning Loop',
    settings: zh ? '设置' : 'Settings',
    advanced: zh ? '高级' : 'Advanced',
  };
}

const initialData = {
  signals: [],
  evidence: {
    top_signals: [],
    source_status: 'INSUFFICIENT_DATA',
    data_status: 'INSUFFICIENT_DATA',
    asof: null,
    supporting_run_id: null,
  },
  performance: { records: [], last_updated: null, proof: { datasets: {} }, paper_timeline: [] },
  trades: [],
  velocity: {},
  config: {},
  market_modules: [],
  analytics: {},
  research: null,
  decision: null,
  today: null,
  safety: null,
  insights: null,
  ai: null,
  layers: {},
  control_plane: null,
};

const DEFAULT_AUTH_WATCHLIST = Object.freeze(['SPY', 'QQQ', 'AAPL']);
const DEMO_MANUAL_STATE = Object.freeze({
  available: true,
  mode: 'DEMO',
  reason: null,
  summary: {
    balance: 1240,
    expiringSoon: 180,
    vipDays: 1,
    vipDaysRedeemed: 1,
  },
  referrals: {
    inviteCode: 'DEMO-NOVA',
    referredByCode: null,
    total: 3,
    rewarded: 2,
  },
  ledger: [
    {
      id: 'demo-ledger-1',
      eventType: 'MORNING_CHECK',
      pointsDelta: 120,
      balanceAfter: 1240,
      title: '+120',
      description: 'Morning Check plus one AI question.',
      createdAt: new Date().toISOString(),
    },
  ],
  rewards: [
    {
      id: 'vip-1d',
      kind: 'vip_day',
      title: 'Redeem 1 VIP day',
      description: '1000 points unlocks one more VIP day.',
      costPoints: 1000,
      enabled: true,
    },
  ],
  predictions: [],
  rules: {
    vipRedeemPoints: 1000,
    referralRewardPoints: 200,
    defaultPredictionStake: 100,
  },
});

async function fetchJson(url, options) {
  const response = await fetchApi(url, {
    credentials: 'include',
    ...(options || {}),
  });
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status})`);
  }
  return response.json();
}

export default function App() {
  const [displayMode, setDisplayMode] = useState(() => detectDisplayMode());
  const [activeTab, setActiveTab] = useState('today');
  const [myStack, setMyStack] = useState(['portfolio']);
  const [browseTopBarState, setBrowseTopBarState] = useState({
    canGoBack: false,
    title: 'Browse',
    backLabel: 'Browse',
  });
  const [browseBackToken, setBrowseBackToken] = useState(0);
  const [assetClass, setAssetClass] = useLocalStorage('nova-quant-asset-class', 'US_STOCK', {
    legacyKeys: ['quant-demo-asset-class'],
  });
  const [market, setMarket] = useState('US');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(initialData);
  const [decisionSnapshot, setDecisionSnapshot] = useState(null);
  const [rawData, setRawData] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const [aboutOpen, setAboutOpen] = useState(false);
  const [watchlist, setWatchlist] = useLocalStorage('nova-quant-watchlist', [], {
    legacyKeys: ['quant-demo-watchlist'],
  });
  const [executions, setExecutions] = useLocalStorage('nova-quant-executions', [], {
    legacyKeys: ['quant-demo-executions'],
  });
  const [holdings, setHoldings] = useLocalStorage('nova-quant-holdings', [], {
    legacyKeys: ['quant-demo-holdings'],
  });
  const [riskProfileKey, setRiskProfileKey] = useLocalStorage(
    'nova-quant-risk-profile',
    'balanced',
    {
      legacyKeys: ['quant-demo-risk-profile'],
    },
  );
  const [uiMode, setUiMode] = useLocalStorage('nova-quant-ui-mode', 'standard', {
    legacyKeys: ['quant-demo-ui-mode'],
  });
  const [userProfile, setUserProfile] = useLocalStorage('nova-quant-user-profile', {
    email: '',
    name: '',
    tradeMode: 'starter',
    broker: 'Robinhood',
  });
  const [authSession, setAuthSession] = useLocalStorage('nova-quant-auth-session', null);
  const [onboardingDone, setOnboardingDone] = useLocalStorage('nova-quant-onboarding-done', false, {
    legacyKeys: ['quant-demo-onboarding-done'],
  });
  const [showOnboarding, setShowOnboarding] = useState(!authSession);
  const [lang, setLang] = useLocalStorage('nova-quant-lang', getDefaultLang(), {
    legacyKeys: ['quant-demo-lang'],
  });
  const [investorDemoEnabled, setInvestorDemoEnabled] = useLocalStorage(
    'nova-quant-investor-demo-enabled',
    false,
  );
  const [investorDemoHoldingsBackup, setInvestorDemoHoldingsBackup] = useLocalStorage(
    'nova-quant-investor-demo-holdings-backup',
    null,
  );
  const [investorDemoUiBackup, setInvestorDemoUiBackup] = useLocalStorage(
    'nova-quant-investor-demo-ui-backup',
    null,
  );
  const [chatUserId] = useLocalStorage(
    'nova-quant-chat-user-id',
    `guest-${Math.random().toString(36).slice(2, 10)}`,
    { legacyKeys: ['quant-demo-chat-user-id'] },
  );
  const [disciplineLog, setDisciplineLog] = useLocalStorage(
    'nova-quant-discipline-log',
    {
      checkins: [],
      boundary_kept: [],
      weekly_reviews: [],
    },
    { legacyKeys: ['quant-demo-discipline-log'] },
  );
  const [aiSeedRequest, setAiSeedRequest] = useState(null);
  const [engagementState, setEngagementState] = useState(null);
  const [manualState, setManualState] = useState(DEMO_MANUAL_STATE);
  const mySection = myStack[myStack.length - 1] || 'portfolio';

  const t = useMemo(() => createTranslator(lang), [lang]);
  const locale = useMemo(() => getLocale(lang), [lang]);
  const tabMeta = useMemo(() => buildTabMeta(locale), [locale]);
  const menuTitles = useMemo(() => buildMenuTitles(locale), [locale]);

  const investorDemoEnvironment = useMemo(
    () => (investorDemoEnabled ? buildInvestorDemoEnvironment(assetClass) : null),
    [investorDemoEnabled, assetClass],
  );
  const isDemoRuntime = getIsDemoRuntime(investorDemoEnabled);
  const lastProfileSyncRef = useRef('');

  useEffect(() => {
    setShowOnboarding(!authSession);
  }, [authSession]);

  const effectiveUserId = authSession?.userId || chatUserId;

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
        data_status: investorDemoEnvironment?.evidence?.data_status || 'DEMO_ONLY',
      },
      performance: {
        ...data.performance,
        investor_demo: INVESTOR_DEMO_PERFORMANCE,
      },
      decision: investorDemoEnvironment?.decision || data.decision,
      today: investorDemoEnvironment?.today || data.today,
      safety: investorDemoEnvironment?.safety || data.safety,
      insights: investorDemoEnvironment?.insights || data.insights,
      config: {
        ...data.config,
        ...(investorDemoEnvironment?.config || {}),
        runtime: {
          ...(data.config?.runtime || {}),
          ...(investorDemoEnvironment?.config?.runtime || {}),
        },
      },
    };
  }, [investorDemoEnabled, investorDemoEnvironment, data]);

  const connectedHoldings = useMemo(
    () =>
      deriveConnectedHoldings({
        brokerSnapshot: uiData?.config?.runtime?.connectivity?.broker || null,
        exchangeSnapshot: uiData?.config?.runtime?.connectivity?.exchange || null,
      }),
    [
      uiData?.config?.runtime?.connectivity?.broker,
      uiData?.config?.runtime?.connectivity?.exchange,
    ],
  );

  const holdingsSource = useMemo(() => {
    return summarizeHoldingsSource({
      investorDemoEnabled,
      manualHoldings: holdings,
      connectedHoldings,
      brokerSnapshot: uiData?.config?.runtime?.connectivity?.broker || null,
      exchangeSnapshot: uiData?.config?.runtime?.connectivity?.exchange || null,
    });
  }, [
    connectedHoldings,
    holdings,
    investorDemoEnabled,
    uiData?.config?.runtime?.connectivity?.broker,
    uiData?.config?.runtime?.connectivity?.exchange,
  ]);

  const effectiveHoldings = useMemo(() => {
    if (investorDemoEnabled) return holdings;
    return mergeHoldingsSources({
      manualHoldings: holdings,
      connectedHoldings,
    });
  }, [connectedHoldings, holdings, investorDemoEnabled]);

  const holdingsReview = useMemo(
    () => buildHoldingsReview({ holdings: effectiveHoldings, state: uiData }),
    [effectiveHoldings, uiData],
  );

  const aiState = useMemo(
    () => ({
      ...uiData,
      decision: decisionSnapshot || uiData.decision || null,
      user_context: {
        user_id: effectiveUserId,
        ui_mode: uiMode,
        holdings: effectiveHoldings,
        holdings_review: holdingsReview,
      },
    }),
    [uiData, decisionSnapshot, effectiveUserId, uiMode, effectiveHoldings, holdingsReview],
  );

  const enableInvestorDemo = () => {
    if (!investorDemoEnabled) {
      setInvestorDemoHoldingsBackup(Array.isArray(holdings) ? holdings : []);
      setInvestorDemoUiBackup({
        assetClass,
        market,
        watchlist: Array.isArray(watchlist) ? watchlist : [],
        executions: Array.isArray(executions) ? executions : [],
      });
    }
    setHoldings(INVESTOR_DEMO_HOLDINGS);
    setAssetClass('US_STOCK');
    setMarket('US');
    setInvestorDemoEnabled(true);
    setOnboardingDone(true);
    setShowOnboarding(false);
    setMyStack(['portfolio']);
    setActiveTab('today');
  };

  const applyAuthenticatedProfile = useCallback(
    (account, syncedState = null, options = {}) => {
      const { resetNavigation = false } = options;
      const tradeModeMap = {
        starter: 'beginner',
        active: 'standard',
        deep: 'advanced',
      };
      setUserProfile({
        email: account.email,
        name: account.name,
        tradeMode: account.tradeMode,
        broker: account.broker,
      });
      setAuthSession({
        userId: account.userId,
        email: normalizeEmail(account.email),
        name: account.name,
        tradeMode: account.tradeMode,
        broker: account.broker,
        loggedInAt: new Date().toISOString(),
      });
      setUiMode(syncedState?.uiMode || tradeModeMap[account.tradeMode] || 'standard');
      setRiskProfileKey(
        syncedState?.riskProfileKey ||
          (account.tradeMode === 'deep'
            ? 'aggressive'
            : account.tradeMode === 'starter'
              ? 'conservative'
              : 'balanced'),
      );
      setWatchlist(
        Array.isArray(syncedState?.watchlist) ? syncedState.watchlist : DEFAULT_AUTH_WATCHLIST,
      );
      setHoldings(Array.isArray(syncedState?.holdings) ? syncedState.holdings : []);
      setExecutions(Array.isArray(syncedState?.executions) ? syncedState.executions : []);
      if (syncedState?.disciplineLog) setDisciplineLog(syncedState.disciplineLog);
      setAssetClass(syncedState?.assetClass || 'US_STOCK');
      setMarket(syncedState?.market || 'US');
      setOnboardingDone(true);
      setShowOnboarding(false);
      if (resetNavigation) {
        setActiveTab('today');
        setMyStack(['portfolio']);
      }
    },
    [
      setActiveTab,
      setAssetClass,
      setAuthSession,
      setDisciplineLog,
      setExecutions,
      setHoldings,
      setMarket,
      setMyStack,
      setOnboardingDone,
      setRiskProfileKey,
      setShowOnboarding,
      setUiMode,
      setUserProfile,
      setWatchlist,
    ],
  );

  useEffect(() => {
    if (authSession !== null) return undefined;
    let cancelled = false;
    void fetchJson('/api/auth/session')
      .then((payload) => {
        if (cancelled) return;
        if (payload?.authenticated && payload?.user) {
          applyAuthenticatedProfile(payload.user, payload.state || null, {
            resetNavigation: false,
          });
          return;
        }
        setAuthSession(null);
        if (onboardingDone) setShowOnboarding(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [applyAuthenticatedProfile, authSession, onboardingDone, setAuthSession]);

  useEffect(() => {
    if (isDemoRuntime) {
      setManualState(DEMO_MANUAL_STATE);
      return undefined;
    }
    let cancelled = false;
    void fetchJson(`/api/manual/state?userId=${encodeURIComponent(effectiveUserId)}`)
      .then((payload) => {
        if (!cancelled) setManualState(payload || null);
      })
      .catch(() => {
        if (!cancelled) {
          setManualState({
            ...DEMO_MANUAL_STATE,
            available: false,
            mode: 'REAL',
            reason: 'MANUAL_UNAVAILABLE',
            summary: {
              balance: 0,
              expiringSoon: 0,
              vipDays: 0,
              vipDaysRedeemed: 0,
            },
            referrals: {
              inviteCode: null,
              referredByCode: null,
              total: 0,
              rewarded: 0,
            },
            ledger: [],
            rewards: [
              {
                id: 'vip-1d',
                kind: 'vip_day',
                title: 'Redeem 1 VIP day',
                description: '1000 points unlocks one more VIP day.',
                costPoints: 1000,
                enabled: false,
              },
            ],
            predictions: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveUserId, isDemoRuntime]);

  useEffect(() => {
    if (!authSession?.userId || investorDemoEnabled) return undefined;

    const payload = {
      assetClass,
      market,
      uiMode,
      riskProfileKey,
      watchlist,
      holdings,
      executions,
      disciplineLog,
    };
    const serialized = JSON.stringify(payload);
    if (lastProfileSyncRef.current === serialized) return undefined;

    const timer = window.setTimeout(() => {
      lastProfileSyncRef.current = serialized;
      void fetchJson('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      }).catch(() => {
        lastProfileSyncRef.current = '';
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    assetClass,
    authSession?.userId,
    disciplineLog,
    executions,
    holdings,
    investorDemoEnabled,
    market,
    riskProfileKey,
    uiMode,
    watchlist,
  ]);

  const clearInvestorDemo = () => {
    const restore = Array.isArray(investorDemoHoldingsBackup) ? investorDemoHoldingsBackup : [];
    setInvestorDemoEnabled(false);
    setHoldings(restore);
    if (investorDemoUiBackup?.assetClass) setAssetClass(investorDemoUiBackup.assetClass);
    if (investorDemoUiBackup?.market) setMarket(investorDemoUiBackup.market);
    if (Array.isArray(investorDemoUiBackup?.watchlist))
      setWatchlist(investorDemoUiBackup.watchlist);
    if (Array.isArray(investorDemoUiBackup?.executions))
      setExecutions(investorDemoUiBackup.executions);
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
    if (investorDemoEnabled && showOnboarding) {
      setShowOnboarding(false);
    }
  }, [investorDemoEnabled, showOnboarding]);

  useEffect(() => {
    let mounted = true;

    async function load({ silent = false } = {}) {
      if (!silent) setLoading(true);
      try {
        if (FORCE_DEMO_BUILD) {
          await new Promise((resolve) => setTimeout(resolve, 280));
          if (!mounted) return;
          setRawData({ as_of: new Date().toISOString() });
          setHasLoaded(true);
          return;
        }

        const query = new URLSearchParams({
          userId: effectiveUserId,
          market,
          assetClass,
        });

        const [
          runtimeResult,
          assetsResult,
          signalsResult,
          evidenceTopSignalsResult,
          marketStateResult,
          performanceResult,
          modulesResult,
          riskProfileResult,
          controlPlaneResult,
          brokerConnectionResult,
          exchangeConnectionResult,
        ] = await Promise.allSettled([
          fetchJson(`/api/runtime-state?${query.toString()}`),
          fetchJson(`/api/assets?market=${market}`),
          fetchJson(`/api/signals?${query.toString()}&limit=60`),
          fetchJson(`/api/evidence/signals/top?${query.toString()}&limit=3`).catch(() => null),
          fetchJson(`/api/market-state?${query.toString()}`),
          fetchJson(`/api/performance?${query.toString()}`),
          fetchJson(`/api/market/modules?${query.toString()}`),
          fetchJson(`/api/risk-profile?userId=${effectiveUserId}`),
          fetchJson(`/api/control-plane/status?userId=${effectiveUserId}`).catch(() => null),
          authSession
            ? fetchJson(`/api/connect/broker?userId=${effectiveUserId}&provider=ALPACA`)
            : Promise.resolve(null),
          authSession
            ? fetchJson(`/api/connect/exchange?userId=${effectiveUserId}&provider=BINANCE`)
            : Promise.resolve(null),
        ]);

        if (!mounted) return;
        const runtime = settledValue(runtimeResult, null);
        const assets = settledValue(assetsResult, null);
        const signals = settledValue(signalsResult, null);
        const evidenceTopSignals = settledValue(evidenceTopSignalsResult, null);
        const marketState = settledValue(marketStateResult, null);
        const performance = settledValue(performanceResult, null);
        const modules = settledValue(modulesResult, null);
        const riskProfile = settledValue(riskProfileResult, null);
        const controlPlane = settledValue(controlPlaneResult, null);
        const brokerConnection = settledValue(brokerConnectionResult, null);
        const exchangeConnection = settledValue(exchangeConnectionResult, null);
        const runtimeData = runtime?.data || initialData;
        const evidenceData = {
          top_signals: Array.isArray(evidenceTopSignals?.records) ? evidenceTopSignals.records : [],
          source_status: evidenceTopSignals?.source_status || 'INSUFFICIENT_DATA',
          data_status: evidenceTopSignals?.data_status || 'INSUFFICIENT_DATA',
          asof: evidenceTopSignals?.asof || null,
          supporting_run_id: evidenceTopSignals?.supporting_run_id || null,
          dataset_version_id: evidenceTopSignals?.dataset_version_id || null,
          strategy_version_id: evidenceTopSignals?.strategy_version_id || null,
        };
        const apiSignals = Array.isArray(signals?.data) ? signals.data : null;
        const nextData = {
          ...runtimeData,
          decision: runtimeData.decision || null,
          signals: apiSignals?.length ? apiSignals : runtimeData.signals || [],
          evidence: evidenceData,
          market_modules: Array.isArray(modules?.data)
            ? modules.data
            : runtimeData.market_modules || [],
          performance: performance || runtimeData.performance || initialData.performance,
          control_plane: controlPlane || runtimeData.control_plane || null,
          config: {
            ...(runtimeData.config || {}),
            last_updated:
              runtime?.data_transparency?.as_of ||
              runtime?.asof ||
              runtimeData.config?.last_updated ||
              new Date().toISOString(),
            source_label:
              runtimeData.config?.source_label || runtime?.source_status || 'INSUFFICIENT_DATA',
            data_status:
              runtimeData.config?.data_status || runtime?.data_status || 'INSUFFICIENT_DATA',
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
                performance_records: performance?.records?.length ?? null,
              },
              connectivity: {
                broker: brokerConnection?.snapshot || null,
                exchange: exchangeConnection?.snapshot || null,
              },
              control_plane: controlPlane || null,
            },
            risk_rules: {
              ...(runtimeData.config?.risk_rules || {}),
              per_trade_risk_pct:
                riskProfile?.data?.max_loss_per_trade ??
                runtimeData.config?.risk_rules?.per_trade_risk_pct ??
                null,
              daily_loss_pct:
                riskProfile?.data?.max_daily_loss ??
                runtimeData.config?.risk_rules?.daily_loss_pct ??
                null,
              max_dd_pct:
                riskProfile?.data?.max_drawdown ??
                runtimeData.config?.risk_rules?.max_dd_pct ??
                null,
              exposure_cap_pct:
                riskProfile?.data?.exposure_cap ??
                runtimeData.config?.risk_rules?.exposure_cap_pct ??
                null,
            },
          },
        };
        setData(nextData);
        setRawData({
          as_of: runtime?.asof || new Date().toISOString(),
          source_status: runtime?.source_status || 'INSUFFICIENT_DATA',
        });
        setHasLoaded(true);
      } catch {
        if (!mounted) return;
        setData(initialData);
        setRawData(null);
        setHasLoaded(true);
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
  }, [assetClass, market, effectiveUserId, refreshNonce]);

  useEffect(() => {
    const syncDisplayMode = () => setDisplayMode(detectDisplayMode());

    syncDisplayMode();
    window.addEventListener('resize', syncDisplayMode, { passive: true });
    window.addEventListener('orientationchange', syncDisplayMode, { passive: true });
    window.visualViewport?.addEventListener('resize', syncDisplayMode, { passive: true });

    const standaloneQuery = window.matchMedia?.('(display-mode: standalone)');
    const fullscreenQuery = window.matchMedia?.('(display-mode: fullscreen)');
    standaloneQuery?.addEventListener?.('change', syncDisplayMode);
    fullscreenQuery?.addEventListener?.('change', syncDisplayMode);

    return () => {
      window.removeEventListener('resize', syncDisplayMode);
      window.removeEventListener('orientationchange', syncDisplayMode);
      window.visualViewport?.removeEventListener('resize', syncDisplayMode);
      standaloneQuery?.removeEventListener?.('change', syncDisplayMode);
      fullscreenQuery?.removeEventListener?.('change', syncDisplayMode);
    };
  }, []);

  useEffect(() => {
    const modalOpen = aboutOpen || showOnboarding;
    document.body.classList.toggle('app-modal-open', modalOpen);
    return () => document.body.classList.remove('app-modal-open');
  }, [aboutOpen, showOnboarding]);

  useEffect(() => {
    const standalone = displayMode === 'standalone' || displayMode === 'fullscreen';
    document.body.classList.toggle('is-standalone', standalone);
    return () => document.body.classList.remove('is-standalone');
  }, [displayMode]);

  useEffect(() => {
    if (!FORCE_DEMO_BUILD || !rawData) return;
    const executionTrades = executions.map(mapExecutionToTrade);
    const modeled = runQuantPipeline({
      ...rawData,
      config: {
        risk_profile: riskProfileKey,
      },
      trades: executionTrades,
    });
    setData(modeled);
  }, [rawData, executions, riskProfileKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isDemoRuntime) return;
    void fetchJson('/api/risk-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: effectiveUserId,
        profileKey: riskProfileKey,
      }),
    })
      .then(() => setRefreshNonce((current) => current + 1))
      .catch(() => {});
  }, [riskProfileKey, effectiveUserId, isDemoRuntime]);

  const refreshHoldingsSources = useCallback(() => {
    setRefreshNonce((current) => current + 1);
  }, []);

  const todayKey = localDateKey(now);
  const currentWeekKey = weekStartKey(now);

  const loadEngagementState = useCallback(async () => {
    if (isDemoRuntime || !hasLoaded) return null;
    try {
      const payload = await fetchJson('/api/engagement/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          market,
          assetClass,
          localDate: todayKey,
          localHour: now.getHours(),
          locale: lang,
          holdings: effectiveHoldings,
        }),
      });
      setEngagementState(payload || null);
      return payload || null;
    } catch {
      setEngagementState(null);
      return null;
    }
  }, [
    assetClass,
    effectiveUserId,
    hasLoaded,
    effectiveHoldings,
    isDemoRuntime,
    lang,
    market,
    now,
    todayKey,
  ]);

  useEffect(() => {
    if (isDemoRuntime) return;
    let cancelled = false;

    void fetchJson('/api/decision/today', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: effectiveUserId,
        market,
        assetClass,
        locale: lang,
        holdings: effectiveHoldings,
      }),
    })
      .then((payload) => {
        if (!cancelled) setDecisionSnapshot(payload || null);
      })
      .catch(() => {
        if (!cancelled) {
          setDecisionSnapshot((current) => current || uiData.decision || null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isDemoRuntime,
    effectiveUserId,
    market,
    assetClass,
    effectiveHoldings,
    lang,
    uiData.decision,
  ]);

  useEffect(() => {
    if (!decisionSnapshot || isDemoRuntime || !hasLoaded) return;
    void loadEngagementState();
  }, [decisionSnapshot?.audit_snapshot_id, isDemoRuntime, hasLoaded, loadEngagementState]);

  const lastUpdated = useMemo(() => {
    return (
      uiData.config.last_updated ||
      uiData.performance.last_updated ||
      uiData.velocity.last_updated ||
      null
    );
  }, [uiData]);

  const modelVersion = useMemo(() => {
    const pipelineVersion = uiData.config?.calc_meta?.pipeline_version;
    if (pipelineVersion) return `NQ ${pipelineVersion}`;
    return 'NQ v1.0.0';
  }, [uiData.config]);

  const localDiscipline = useMemo(() => {
    const checkins = disciplineLog?.checkins || [];
    const boundary = disciplineLog?.boundary_kept || [];
    const weekly = disciplineLog?.weekly_reviews || [];

    return {
      checkedToday: checkins.includes(todayKey),
      boundaryToday: boundary.includes(todayKey),
      reviewedThisWeek: weekly.includes(currentWeekKey),
      checkinStreak: calcStreak(checkins, todayKey, 1),
      boundaryStreak: calcStreak(boundary, todayKey, 1),
      weeklyStreak: calcStreak(weekly, currentWeekKey, 7),
    };
  }, [disciplineLog, todayKey, currentWeekKey]);

  const discipline = useMemo(() => {
    const habit = engagementState?.habit_state;
    if (!habit) return localDiscipline;
    return {
      checkedToday: Boolean(habit.checkedToday),
      boundaryToday: Boolean(habit.boundaryToday),
      reviewedThisWeek: Boolean(habit.reviewedThisWeek),
      checkinStreak: Number(habit.checkinStreak || 0),
      boundaryStreak: Number(habit.boundaryStreak || 0),
      weeklyStreak: Number(habit.weeklyStreak || 0),
      wrapUpToday: Boolean(habit.wrapUpToday),
      wrapUpStreak: Number(habit.wrapUpStreak || 0),
      disciplineScore: Number(habit.discipline_score || 0),
      behaviorQuality: habit.behavior_quality || null,
      summary: habit.summary || null,
      noActionValueLine: habit.no_action_value_line || null,
    };
  }, [engagementState, localDiscipline]);

  const syncLocalDisciplineLog = useCallback(
    (updater) => {
      setDisciplineLog((current) =>
        updater(current || { checkins: [], boundary_kept: [], weekly_reviews: [] }),
      );
    },
    [setDisciplineLog],
  );

  const markDailyCheckin = useCallback(async () => {
    syncLocalDisciplineLog((current) => ({
      ...current,
      checkins: addUniqueKey(current?.checkins || [], todayKey),
    }));
    if (isDemoRuntime) return;
    try {
      const payload = await fetchJson('/api/engagement/morning-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          market,
          assetClass,
          localDate: todayKey,
          localHour: now.getHours(),
          locale: lang,
          holdings: effectiveHoldings,
        }),
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [
    assetClass,
    effectiveUserId,
    effectiveHoldings,
    isDemoRuntime,
    lang,
    loadEngagementState,
    market,
    now,
    syncLocalDisciplineLog,
    todayKey,
  ]);

  const markBoundaryKept = useCallback(async () => {
    syncLocalDisciplineLog((current) => ({
      ...current,
      boundary_kept: addUniqueKey(current?.boundary_kept || [], todayKey),
    }));
    if (isDemoRuntime) return;
    try {
      const payload = await fetchJson('/api/engagement/boundary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          market,
          assetClass,
          localDate: todayKey,
          localHour: now.getHours(),
          locale: lang,
          holdings: effectiveHoldings,
        }),
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [
    assetClass,
    effectiveUserId,
    effectiveHoldings,
    isDemoRuntime,
    lang,
    loadEngagementState,
    market,
    now,
    syncLocalDisciplineLog,
    todayKey,
  ]);

  const markWrapUpComplete = useCallback(async () => {
    if (isDemoRuntime) return;
    try {
      const payload = await fetchJson('/api/engagement/wrap-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          market,
          assetClass,
          localDate: todayKey,
          localHour: now.getHours(),
          locale: lang,
          holdings: effectiveHoldings,
        }),
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [
    assetClass,
    effectiveUserId,
    effectiveHoldings,
    isDemoRuntime,
    lang,
    loadEngagementState,
    market,
    now,
    todayKey,
  ]);

  const markWeeklyReviewed = useCallback(async () => {
    syncLocalDisciplineLog((current) => ({
      ...current,
      weekly_reviews: addUniqueKey(current?.weekly_reviews || [], currentWeekKey),
    }));
    if (isDemoRuntime) return;
    try {
      const payload = await fetchJson('/api/engagement/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          market,
          assetClass,
          localDate: todayKey,
          localHour: now.getHours(),
          locale: lang,
          holdings: effectiveHoldings,
        }),
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [
    assetClass,
    effectiveUserId,
    currentWeekKey,
    effectiveHoldings,
    isDemoRuntime,
    lang,
    loadEngagementState,
    market,
    now,
    syncLocalDisciplineLog,
    todayKey,
  ]);

  const baseContext = useMemo(
    () => ({
      locale: lang,
      market,
      assetClass,
      riskProfileKey,
      uiMode,
      decisionSummary: {
        today_call:
          decisionSnapshot?.summary?.today_call?.headline ||
          decisionSnapshot?.summary?.today_call ||
          null,
        risk_posture:
          decisionSnapshot?.summary?.risk_posture || decisionSnapshot?.risk_state?.posture || null,
        top_action_id: decisionSnapshot?.top_action_id || null,
        top_action_symbol:
          decisionSnapshot?.summary?.top_action_symbol ||
          decisionSnapshot?.ranked_action_cards?.[0]?.symbol ||
          null,
        top_action_label:
          decisionSnapshot?.summary?.top_action_label ||
          decisionSnapshot?.ranked_action_cards?.[0]?.action_label ||
          null,
        source_status:
          decisionSnapshot?.source_status ||
          uiData?.config?.runtime?.source_status ||
          'INSUFFICIENT_DATA',
        data_status:
          decisionSnapshot?.data_status ||
          uiData?.config?.runtime?.data_status ||
          'INSUFFICIENT_DATA',
      },
      holdingsSummary: {
        holdings_count: holdingsReview?.totals?.holdings_count ?? 0,
        total_weight_pct: holdingsReview?.totals?.total_weight_pct ?? 0,
        aligned_weight_pct: holdingsReview?.system_alignment?.aligned_weight_pct ?? 0,
        unsupported_weight_pct: holdingsReview?.system_alignment?.unsupported_weight_pct ?? 0,
        top1_pct: holdingsReview?.concentration?.top1_pct ?? 0,
        risk_level: holdingsReview?.risk?.level || null,
        recommendation: holdingsReview?.risk?.recommendation || holdingsReview?.key_advice || null,
      },
      engagementSummary: {
        locale: lang,
        morning_check_status: engagementState?.daily_check_state?.status || null,
        morning_check_label: engagementState?.daily_check_state?.headline || null,
        morning_check_arrival:
          engagementState?.daily_check_state?.arrival_line ||
          engagementState?.ui_regime_state?.arrival_line ||
          null,
        morning_check_ritual:
          engagementState?.daily_check_state?.ritual_line ||
          engagementState?.ui_regime_state?.ritual_line ||
          null,
        perception_status: engagementState?.perception_layer?.status || null,
        perception_headline: engagementState?.perception_layer?.headline || null,
        perception_focus: engagementState?.perception_layer?.focus_line || null,
        perception_confirmation: engagementState?.perception_layer?.confirmation_line || null,
        wrap_up_ready: Boolean(engagementState?.daily_wrap_up?.ready),
        wrap_up_completed: Boolean(engagementState?.daily_wrap_up?.completed),
        wrap_up_line:
          engagementState?.daily_wrap_up?.opening_line ||
          engagementState?.ui_regime_state?.wrap_line ||
          null,
        discipline_score: Number(engagementState?.habit_state?.discipline_score || 0) || null,
        behavior_quality: engagementState?.habit_state?.behavior_quality || null,
        recommendation_change: engagementState?.recommendation_change?.summary || null,
        ui_tone: engagementState?.ui_regime_state?.tone || null,
      },
    }),
    [
      lang,
      market,
      assetClass,
      riskProfileKey,
      uiMode,
      decisionSnapshot,
      uiData?.config?.runtime?.source_status,
      uiData?.config?.runtime?.data_status,
      holdingsReview,
      engagementState,
    ],
  );

  const askAi = (message, context = {}) => {
    const text = String(message || '').trim();
    if (!text) return;
    setAiSeedRequest({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message: text,
      context: {
        page: activeTab === 'my' ? mySection || 'my' : activeTab,
        ...baseContext,
        ...(context || {}),
      },
    });
    setActiveTab('ai');
  };

  const navigateFromAi = (target) => {
    if (!target) return;
    if (target === 'holdings') {
      setActiveTab('my');
      setMyStack(['portfolio']);
      return;
    }
    if (target === 'more') {
      openMySection('menu');
      return;
    }
    if (target.startsWith('more:') || target.startsWith('menu:') || target.startsWith('my:')) {
      const section = target.split(':')[1] || 'menu';
      openMySection(section);
      return;
    }
    setActiveTab(target);
    if (target !== 'my') setMyStack(['portfolio']);
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
      pnl_pct: action === 'DONE' ? Number(signal.quick_pnl_pct ?? 0.6) : 0,
    };
    if (isDemoRuntime) {
      setExecutions((current) => [payload, ...current].slice(0, 200));
      return;
    }
    try {
      await fetchJson('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          signalId: signal.signal_id,
          mode,
          action,
          note: 'Recorded from Today quick action',
        }),
      });
      setRefreshNonce((current) => current + 1);
    } catch {
      // Keep UI resilient; failed writes are surfaced by stale state.
    }
  };

  const refreshManualState = useCallback(async () => {
    if (isDemoRuntime) {
      setManualState(DEMO_MANUAL_STATE);
      return DEMO_MANUAL_STATE;
    }
    const payload = await fetchJson(
      `/api/manual/state?userId=${encodeURIComponent(effectiveUserId)}`,
    );
    setManualState(payload || null);
    return payload || null;
  }, [effectiveUserId, isDemoRuntime]);

  const redeemVipDay = useCallback(
    async (days = 1) => {
      if (isDemoRuntime) {
        setManualState((current) => {
          const base = current || DEMO_MANUAL_STATE;
          return {
            ...base,
            summary: {
              ...base.summary,
              balance: Math.max(0, Number(base.summary.balance || 0) - days * 1000),
              vipDays: Number(base.summary.vipDays || 0) + days,
              vipDaysRedeemed: Number(base.summary.vipDaysRedeemed || 0) + days,
            },
          };
        });
        return;
      }
      try {
        const payload = await fetchJson('/api/manual/rewards/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: effectiveUserId,
            days,
          }),
        });
        if (payload?.data) setManualState(payload.data);
        else await refreshManualState();
      } catch {
        await refreshManualState().catch(() => {});
      }
    },
    [effectiveUserId, isDemoRuntime, refreshManualState],
  );

  const buildMyStack = useCallback((section) => {
    if (!section || section === 'portfolio') return ['portfolio'];
    if (section === 'menu') return ['portfolio', 'menu'];
    if (section.startsWith('group:')) return ['portfolio', 'menu', section];
    const parent = MENU_PARENTS[section];
    return parent ? ['portfolio', 'menu', parent, section] : ['portfolio', 'menu', section];
  }, []);

  const resetMy = useCallback(() => {
    setMyStack(['portfolio']);
  }, []);

  const openMySection = useCallback(
    (section) => {
      setMyStack(buildMyStack(section));
      setActiveTab('my');
    },
    [buildMyStack],
  );

  const pushMySection = useCallback((section) => {
    if (!section || section === 'portfolio') {
      setMyStack(['portfolio']);
      return;
    }
    setMyStack((current) => {
      const currentTop = current[current.length - 1];
      if (currentTop === section) return current;
      return [...current, section];
    });
  }, []);

  const popMySection = useCallback(() => {
    setMyStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  const renderMenuSection = (section) => {
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
          onQuickAsk={(_intent, signal) =>
            askAi(`请解释 ${signal?.symbol || '该信号'} 的执行逻辑和风险边界。`)
          }
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
        <DisciplineTab
          discipline={discipline}
          engagementState={engagementState}
          locale={locale}
          markDailyCheckin={markDailyCheckin}
          markBoundaryKept={markBoundaryKept}
          markWrapUpComplete={markWrapUpComplete}
          markWeeklyReviewed={markWeeklyReviewed}
          askAi={askAi}
        />
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
      return !hasLoaded && loading ? (
        <Skeleton lines={6} />
      ) : (
        <ResearchTab research={uiData.research} loading={loading} locale={locale} />
      );
    }

    if (section === 'data') {
      return <DataStatusTab data={data} />;
    }

    if (section === 'learning') {
      return <LearningLoopTab data={data} locale={locale} />;
    }

    if (section === 'settings') {
      return (
        <SettingsTab
          engagementState={engagementState}
          uiMode={uiMode}
          setUiMode={setUiMode}
          riskProfileKey={riskProfileKey}
          setRiskProfileKey={setRiskProfileKey}
          lang={lang}
          setLang={setLang}
          t={t}
          isDemoRuntime={isDemoRuntime}
          effectiveUserId={effectiveUserId}
          setShowOnboarding={setShowOnboarding}
          setAboutOpen={setAboutOpen}
          loadEngagementState={loadEngagementState}
          setEngagementState={setEngagementState}
          fetchJson={fetchJson}
        />
      );
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
          decision={decisionSnapshot || uiData.decision || null}
          performance={uiData.performance}
          runtime={uiData?.config?.runtime || {}}
          trades={uiData?.trades || []}
          watchlist={watchlist}
          holdingsReview={holdingsReview}
          uiMode={uiMode}
          locale={locale}
          discipline={discipline}
          engagement={engagementState}
          investorDemoEnabled={investorDemoEnabled}
          brokerProfile={userProfile}
          brokerConnection={uiData?.config?.runtime?.connectivity?.broker || null}
          onCompleteCheckIn={markDailyCheckin}
          onConfirmBoundary={markBoundaryKept}
          onOpenHoldings={() => {
            setActiveTab('my');
            setMyStack(['portfolio']);
          }}
          onAskAi={askAi}
          onOpenWeekly={() => openMySection('weekly')}
          onOpenSignals={() => openMySection('signals')}
          onToggleWatchlist={(symbol) =>
            setWatchlist((current) =>
              current.includes(symbol)
                ? current.filter((item) => item !== symbol)
                : [...current, symbol],
            )
          }
          onPaperExecute={(signal) => recordExecution({ signal, mode: 'PAPER', action: 'EXECUTE' })}
        />
      );
    }

    if (activeTab === 'ai') {
      return (
        <AiPage
          quantState={aiState}
          seedRequest={aiSeedRequest}
          onNavigate={navigateFromAi}
          userId={effectiveUserId}
          locale={locale}
          baseContext={baseContext}
        />
      );
    }

    if (activeTab === 'browse') {
      return (
        <Suspense
          fallback={
            <div className="browse-rh-empty" style={{ padding: '3rem 0', textAlign: 'center' }}>
              Loading…
            </div>
          }
        >
          <BrowseTab
            locale={locale}
            signals={uiData?.signals || []}
            watchlist={watchlist}
            setWatchlist={setWatchlist}
            topBarBackToken={browseBackToken}
            onTopBarStateChange={(nextState) =>
              setBrowseTopBarState((current) => {
                const normalized = {
                  canGoBack: Boolean(nextState?.canGoBack),
                  title: String(nextState?.title || tabMeta.browse.label),
                  backLabel: String(nextState?.backLabel || tabMeta.browse.label),
                };
                if (
                  current.canGoBack === normalized.canGoBack &&
                  current.title === normalized.title &&
                  current.backLabel === normalized.backLabel
                ) {
                  return current;
                }
                return normalized;
              })
            }
          />
        </Suspense>
      );
    }

    if (activeTab === 'my' && mySection === 'portfolio') {
      return (
        <HoldingsTab
          holdings={effectiveHoldings}
          setHoldings={setHoldings}
          holdingsReview={holdingsReview}
          watchlist={watchlist}
          marketInstruments={uiData?.layers?.data_layer?.instruments || []}
          uiMode={uiMode}
          t={t}
          locale={locale}
          investorDemoEnabled={investorDemoEnabled}
          holdingsSource={holdingsSource}
          manualHoldingsCount={holdingsSource?.manual_count || 0}
          canRefreshConnectedHoldings={Boolean(authSession?.userId) && !investorDemoEnabled}
          onRefreshHoldings={refreshHoldingsSources}
          onExplain={(message) => askAi(message)}
        />
      );
    }

    if (
      activeTab === 'my' &&
      [
        'menu',
        'support',
        'help-center',
        'support-chats',
        'disclosures',
        'points',
        'prediction-games',
        'rewards',
        'security-privacy',
        'create-passkey',
        'change-password',
        'device-security',
        'devices',
        'profile-visibility',
        'blocking',
        'manage-data',
        'privacy-choices',
        'download-personal-data',
        'request-data-deletion',
        'privacy-policy',
        'points-history',
        'group:review',
        'group:system',
        'group:market',
        'group:settings',
      ].includes(mySection)
    ) {
      return (
        <MenuTab
          section={mySection}
          locale={locale}
          username={
            userProfile?.name ||
            authSession?.name ||
            (chatUserId.startsWith('guest-') ? `@${chatUserId.slice(6)}` : chatUserId)
          }
          manualState={manualState}
          onSectionChange={pushMySection}
          showDemoEntry={DEMO_ENTRY_ENABLED}
          demoEnabled={investorDemoEnabled}
          onToggleDemo={() => {
            if (investorDemoEnabled) {
              clearInvestorDemo();
              return;
            }
            enableInvestorDemo();
          }}
          onRedeemVip={redeemVipDay}
          onOpenAbout={() => setAboutOpen(true)}
          onLogout={() => {
            void fetchJson('/api/auth/logout', { method: 'POST' }).catch(() => {});
            clearInvestorDemo();
            setHoldings([]);
            setWatchlist([]);
            setExecutions([]);
            setDisciplineLog({
              checkins: [],
              boundary_kept: [],
              weekly_reviews: [],
            });
            setAuthSession(null);
            setUserProfile({
              email: '',
              name: '',
              tradeMode: 'starter',
              broker: 'Robinhood',
            });
            setShowOnboarding(true);
            setActiveTab('today');
            setMyStack(['portfolio']);
          }}
          appMeta={uiData?.config || {}}
        />
      );
    }

    return renderMenuSection(mySection);
  };

  const canGoBackInMyTopBar = activeTab === 'my' && myStack.length > 1;
  const canGoBackInBrowseTopBar = activeTab === 'browse' && browseTopBarState.canGoBack;
  const canGoBackInTopBar = canGoBackInMyTopBar || canGoBackInBrowseTopBar;
  const showHoldingsMenuAction = activeTab === 'my' && mySection === 'portfolio';
  const showCenterTopBarTitle = activeTab === 'browse' || activeTab === 'ai' || activeTab === 'my';
  const previousMySection = canGoBackInMyTopBar ? myStack[myStack.length - 2] : null;
  const topBarBackLabel = canGoBackInBrowseTopBar
    ? browseTopBarState.backLabel
    : previousMySection && previousMySection !== 'portfolio'
      ? menuTitles[previousMySection] || tabMeta.my.label
      : tabMeta.my.label;
  const topBarCenterTitle =
    activeTab === 'browse'
      ? browseTopBarState.title || tabMeta.browse.label
      : activeTab === 'ai'
        ? 'Ask Nova'
        : activeTab === 'my'
          ? mySection === 'portfolio'
            ? 'Holdings'
            : mySection === 'menu'
              ? 'Menu'
              : menuTitles[mySection] || tabMeta.my.label
          : '';
  const topBarMode = canGoBackInTopBar ? 'detail' : 'root';
  const appTone = engagementState?.ui_regime_state?.tone || 'quiet';
  const motionProfile = engagementState?.ui_regime_state?.motion_profile || 'calm';
  const dailyCheckState = String(
    engagementState?.daily_check_state?.status || 'PENDING',
  ).toLowerCase();
  const [topBarCondensed, setTopBarCondensed] = useState(false);
  const mainContentRef = useRef(null);

  useEffect(() => {
    const node = mainContentRef.current;
    if (!node) return undefined;

    const handleScroll = () => {
      setTopBarCondensed(node.scrollTop > 28);
    };

    handleScroll();
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => node.removeEventListener('scroll', handleScroll);
  }, [activeTab, mySection]);

  useEffect(() => {
    if (activeTab !== 'browse') return;
    setBrowseTopBarState({
      canGoBack: false,
      title: tabMeta.browse.label,
      backLabel: tabMeta.browse.label,
    });
  }, [activeTab, tabMeta.browse.label]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const warmBrowse = () => {
      primeBrowseHomeBundle();
      primeBrowseUniverseBundle();
    };
    warmBrowse();
    const cancelIdle = runWhenIdle(warmBrowse);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      warmBrowse();
    }, 15000);
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      warmBrowse();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelIdle();
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div className={`app-bg app-bg-${displayMode} app-tone-${appTone}`}>
      <div
        className={`device-shell device-shell-${displayMode} ui-tone-${appTone} ui-motion-${motionProfile} daily-check-${dailyCheckState}`}
        data-active-tab={activeTab}
      >
        <header
          className={`top-bar top-bar-${topBarMode} ${topBarCondensed ? 'is-condensed' : ''}`}
        >
          <div className="top-bar-leading">
            {canGoBackInMyTopBar ? (
              <button
                type="button"
                className="ios-nav-back top-bar-back"
                onClick={popMySection}
                aria-label={`Back to ${topBarBackLabel}`}
              >
                <span className="ios-back-chevron" aria-hidden="true">
                  ‹
                </span>
                <span className="ios-back-label">{topBarBackLabel}</span>
              </button>
            ) : canGoBackInBrowseTopBar ? (
              <button
                type="button"
                className="ios-nav-back top-bar-back"
                onClick={() => setBrowseBackToken((current) => current + 1)}
                aria-label={`Back to ${topBarBackLabel}`}
              >
                <span className="ios-back-chevron" aria-hidden="true">
                  ‹
                </span>
                <span className="ios-back-label">{topBarBackLabel}</span>
              </button>
            ) : null}
          </div>
          {showCenterTopBarTitle ? (
            <div className="top-bar-center-title" aria-label={topBarCenterTitle}>
              {topBarCenterTitle}
            </div>
          ) : (
            <div className="top-bar-logo-wrap" aria-label="Nova Quant">
              <img
                src={novaLogo}
                alt="Nova Quant"
                className={`top-bar-logo top-bar-logo-expanded ${topBarCondensed ? 'is-hidden' : ''}`}
              />
              <img
                src={novaLogoCompact}
                alt="Nova Quant"
                className={`top-bar-logo top-bar-logo-compact ${topBarCondensed ? 'is-visible' : ''}`}
              />
            </div>
          )}
          {showHoldingsMenuAction ? (
            <button
              type="button"
              className="top-bar-action-button"
              aria-label={locale === 'zh' ? '打开菜单' : 'Open menu'}
              onClick={() => openMySection('menu')}
            >
              <TopBarMenuGlyph />
            </button>
          ) : canGoBackInTopBar ? (
            <div className="top-bar-spacer" aria-hidden="true" />
          ) : null}
        </header>

        <main ref={mainContentRef} className={`main-content main-content-${activeTab}`}>
          <Suspense fallback={<Skeleton lines={6} />}>
            <div className="screen-transition" key={`${activeTab}-${mySection}-${uiMode}`}>
              {renderScreen()}
            </div>
          </Suspense>
        </main>
      </div>

      <nav className="native-tabbar" aria-label="Primary navigation">
        {Object.entries(tabMeta).map(([key, value]) => (
          <button
            key={key}
            type="button"
            className={`native-tabbar-button ${activeTab === key ? 'is-active' : ''}`}
            aria-current={activeTab === key ? 'page' : undefined}
            onClick={() => {
              setActiveTab(key);
              if (key !== 'my') {
                resetMy();
              } else {
                setMyStack(['portfolio']);
              }
            }}
          >
            <span className="native-tabbar-icon-wrap">
              <TabBarIcon name={value.icon} />
            </span>
            <span className="native-tabbar-label">{value.label}</span>
          </button>
        ))}
      </nav>

      <AboutModal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        config={data.config}
        t={t}
        locale={locale}
      />

      <Suspense fallback={null}>
        <OnboardingFlow
          open={showOnboarding}
          locale={locale}
          profile={userProfile}
          initialMode={onboardingDone ? 'login' : 'intro'}
          onLogin={async ({ email, password }) => {
            try {
              const payload = await fetchJson('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
              });
              applyAuthenticatedProfile(payload.user, payload.state || null, {
                resetNavigation: true,
              });
              return { ok: true };
            } catch (error) {
              return {
                ok: false,
                error: classifyAuthError(error, locale),
              };
            }
          }}
          onRequestReset={async ({ email }) => {
            try {
              const payload = await fetchJson('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
              });
              return {
                ok: true,
                codeHint: payload.codeHint || null,
                expiresInMinutes: payload.expiresInMinutes || 15,
              };
            } catch (error) {
              const message = String(error?.message || '');
              return {
                ok: false,
                error:
                  message.includes('(404)') ||
                  message.includes('(500)') ||
                  message.includes('(503)') ||
                  message.includes('AUTH_STORE_NOT_CONFIGURED') ||
                  message.includes('AUTH_STORE_UNREACHABLE')
                    ? locale?.startsWith('zh')
                      ? isLocalAuthRuntime()
                        ? '重置服务未连接。请先启动本地 API：npm run api:data'
                        : '重置服务暂时不可用。请稍后再试。'
                      : isLocalAuthRuntime()
                        ? 'The reset service is offline. Start the local API first: npm run api:data'
                        : 'The reset service is temporarily unavailable.'
                    : locale?.startsWith('zh')
                      ? '暂时没法发送重置码，请稍后再试。'
                      : 'We could not send a reset code just now.',
              };
            }
          }}
          onResetPassword={async ({ email, code, newPassword }) => {
            try {
              await fetchJson('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code, newPassword }),
              });
              return { ok: true };
            } catch (error) {
              const message = String(error?.message || '');
              return {
                ok: false,
                error:
                  message.includes('(400)') ||
                  message.includes('INVALID_RESET_CODE') ||
                  message.includes('WEAK_PASSWORD')
                    ? locale?.startsWith('zh')
                      ? '重置码无效，或密码不符合要求。'
                      : 'The reset code is invalid, or the password is too weak.'
                    : message.includes('(503)') ||
                        message.includes('AUTH_STORE_NOT_CONFIGURED') ||
                        message.includes('AUTH_STORE_UNREACHABLE')
                      ? locale?.startsWith('zh')
                        ? '重置服务当前未连上远端账户存储。请检查线上认证配置后再试。'
                        : 'The reset service cannot reach its remote auth store right now.'
                      : locale?.startsWith('zh')
                        ? isLocalAuthRuntime()
                          ? '重置服务未连接。请先启动本地 API：npm run api:data'
                          : '重置服务暂时不可用。请稍后再试。'
                        : isLocalAuthRuntime()
                          ? 'The reset service is offline. Start the local API first: npm run api:data'
                          : 'The reset service is temporarily unavailable.',
              };
            }
          }}
          onComplete={async (payload) => {
            try {
              const response = await fetchJson('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: payload.email,
                  password: payload.password,
                  name: payload.name,
                  tradeMode: payload.tradeMode,
                  broker: payload.broker,
                  locale,
                }),
              });
              applyAuthenticatedProfile(response.user, response.state || null, {
                resetNavigation: true,
              });
              return { ok: true };
            } catch (error) {
              const message = String(error?.message || '');
              return {
                ok: false,
                error:
                  message.includes('(400)') ||
                  message.includes('EMAIL_EXISTS') ||
                  message.includes('INVALID_EMAIL') ||
                  message.includes('WEAK_PASSWORD')
                    ? locale?.startsWith('zh')
                      ? '这个邮箱已经存在，或注册信息无效。'
                      : 'That email already exists, or the signup details are invalid.'
                    : message.includes('(503)') ||
                        message.includes('AUTH_STORE_NOT_CONFIGURED') ||
                        message.includes('AUTH_STORE_UNREACHABLE')
                      ? locale?.startsWith('zh')
                        ? '注册服务当前未连上远端账户存储。请检查线上认证配置后再试。'
                        : 'The signup service cannot reach its remote auth store right now.'
                      : locale?.startsWith('zh')
                        ? isLocalAuthRuntime()
                          ? '注册服务未连接。请先启动本地 API：npm run api:data'
                          : '注册服务暂时不可用。请稍后再试。'
                        : isLocalAuthRuntime()
                          ? 'The signup service is offline. Start the local API first: npm run api:data'
                          : 'The signup service is temporarily unavailable.',
              };
            }
          }}
        />
      </Suspense>
    </div>
  );
}

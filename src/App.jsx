import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AboutModal from './components/AboutModal';
import AiPage from './components/AiPage';
import novaLogo from './assets/NOVA1.png';
import novaLogoCompact from './assets/Nova2.png';
import BrowseTab from './components/BrowseTab';
import HoldingsTab from './components/HoldingsTab';
import MarketTab from './components/MarketTab';
import MenuTab from './components/MenuTab';
import OnboardingFlow from './components/OnboardingFlow';
import ProofTab from './components/ProofTab';
import ResearchTab from './components/ResearchTab';
import RiskTab from './components/RiskTab';
import SegmentedControl from './components/SegmentedControl';
import Skeleton from './components/Skeleton';
import SignalsTab from './components/SignalsTab';
import TodayTab from './components/TodayTab';
import WeeklyReviewTab from './components/WeeklyReviewTab';
import { runQuantPipeline } from './engines/pipeline';
import { useLocalStorage } from './hooks/useLocalStorage';
import { createTranslator, getDefaultLang, getLocale } from './i18n';
import { buildHoldingsReview } from './research/holdingsAnalyzer';
import { fetchApiJson } from './utils/api';
import {
  buildInvestorDemoEnvironment,
  INVESTOR_DEMO_HOLDINGS,
  INVESTOR_DEMO_PERFORMANCE
} from './demo/investorDemo';
import { DEMO_ENTRY_ENABLED, FORCE_DEMO_BUILD, isDemoRuntime as getIsDemoRuntime } from './demo/runtime';

const MENU_PARENTS = {
  weekly: 'group:review',
  discipline: 'group:review',
  signals: 'group:system',
  performance: 'group:system',
  safety: 'group:system',
  data: 'group:system',
  insights: 'group:market',
  settings: 'group:settings',
  advanced: 'group:settings'
};

function buildTabMeta(locale) {
  const zh = locale?.startsWith('zh');
  return {
    today: { icon: 'today', label: zh ? '今日' : 'Today' },
    ai: { icon: 'nova', label: 'Nova' },
    browse: { icon: 'browse', label: zh ? '发现' : 'Browse' },
    my: { icon: 'my', label: zh ? '我的' : 'My' }
  };
}

function TopBarMenuGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="top-bar-action-icon" focusable="false" aria-hidden="true">
      <path d="M4 5.75h12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M6.25 10h9.75" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M4 14.25h12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function TabBarIcon({ name }) {
  if (name === 'today') {
    return (
      <svg viewBox="0 0 24 24" className="native-tabbar-icon-svg" focusable="false" aria-hidden="true">
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'nova') {
    return (
      <svg viewBox="0 0 24 24" className="native-tabbar-icon-svg" focusable="false" aria-hidden="true">
        <path d="M12 4.8 13.7 10.3 19.2 12 13.7 13.7 12 19.2 10.3 13.7 4.8 12 10.3 10.3Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'browse') {
    return (
      <svg viewBox="0 0 24 24" className="native-tabbar-icon-svg" focusable="false" aria-hidden="true">
        <circle cx="11" cy="11" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path d="M14.5 14.5 18.5 18.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="native-tabbar-icon-svg" focusable="false" aria-hidden="true">
      <circle cx="12" cy="9" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M6.6 18.2c1.4-2.6 3.2-3.9 5.4-3.9s4 1.3 5.4 3.9" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function buildMenuTitles(locale) {
  const zh = locale?.startsWith('zh');
  return {
    menu: zh ? '菜单' : 'Menu',
    points: zh ? '积分中心' : 'Points Hub',
    'prediction-games': zh ? '预测游戏' : 'Prediction Games',
    rewards: zh ? '奖励 / 邀请好友' : 'Rewards / Invite Friends',
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
    settings: zh ? '设置' : 'Settings',
    advanced: zh ? '高级' : 'Advanced'
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isLocalAuthRuntime() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function classifyAuthError(error, locale) {
  const zh = locale?.startsWith('zh');
  const message = String(error?.message || '');
  if (message.includes('(401)')) {
    return zh ? '账号或密码错误。' : 'The email or password is incorrect.';
  }
  if (message.includes('(503)')) {
    return zh
      ? '登录服务当前未连上远端账户存储。请检查线上认证配置后再试。'
      : 'The login service cannot reach its remote auth store right now.';
  }
  return zh
    ? isLocalAuthRuntime()
      ? '登录服务未连接。请先启动本地 API：npm run api:data'
      : '登录服务暂时不可用。请稍后再试。'
    : isLocalAuthRuntime()
      ? 'The login service is offline. Start the local API first: npm run api:data'
      : 'The login service is temporarily unavailable.';
}

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
  decision: null,
  today: null,
  safety: null,
  insights: null,
  ai: null,
  layers: {},
  control_plane: null
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
    vipDaysRedeemed: 1
  },
  referrals: {
    inviteCode: 'DEMO-NOVA',
    referredByCode: null,
    total: 3,
    rewarded: 2
  },
  ledger: [
    {
      id: 'demo-ledger-1',
      eventType: 'MORNING_CHECK',
      pointsDelta: 120,
      balanceAfter: 1240,
      title: '+120',
      description: 'Morning Check plus one AI question.',
      createdAt: new Date().toISOString()
    }
  ],
  rewards: [
    {
      id: 'vip-1d',
      kind: 'vip_day',
      title: 'Redeem 1 VIP day',
      description: '1000 points unlocks one more VIP day.',
      costPoints: 1000,
      enabled: true
    }
  ],
  predictions: [],
  rules: {
    vipRedeemPoints: 1000,
    referralRewardPoints: 200,
    defaultPredictionStake: 100
  }
});

function detectDisplayMode() {
  if (typeof window === 'undefined') return 'browser';
  if (window.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
  if (window.matchMedia?.('(display-mode: fullscreen)').matches) return 'fullscreen';
  if (window.navigator?.standalone) return 'standalone';
  return 'browser';
}

async function fetchJson(url, options) {
  const method = String(options?.method || 'GET').toUpperCase();
  if (method === 'GET') {
    return fetchApiJson(url, options);
  }
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...(options || {})
  });
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

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveConnectedHoldings({ brokerSnapshot, exchangeSnapshot }) {
  const brokerPositions = Array.isArray(brokerSnapshot?.positions) ? brokerSnapshot.positions : [];
  const exchangeBalances = Array.isArray(exchangeSnapshot?.balances) ? exchangeSnapshot.balances : [];
  const rows = [];

  const brokerTotal = brokerPositions.reduce((sum, row) => sum + Math.max(0, Number(row?.market_value || 0)), 0);
  for (const row of brokerPositions) {
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    const marketValue = Number(row?.market_value || 0);
    const quantity = Number(row?.qty || 0);
    if (!symbol || !(quantity > 0)) continue;
    rows.push({
      id: `broker-${symbol}`,
      symbol,
      asset_class: 'US_STOCK',
      market: 'US',
      quantity,
      cost_basis: toNumber(row?.avg_entry_price),
      current_price: toNumber(row?.current_price),
      weight_pct: brokerTotal > 0 && marketValue > 0 ? (marketValue / brokerTotal) * 100 : null,
      note: 'Broker'
    });
  }

  const pricedExchangeBalances = exchangeBalances
    .map((row) => ({
      asset: String(row?.asset || '').trim().toUpperCase(),
      total: Number(row?.total || Number(row?.free || 0) + Number(row?.locked || 0)),
      mark_price: toNumber(row?.mark_price),
      market_value: Number(row?.market_value || 0)
    }))
    .filter((row) => row.asset && row.asset !== 'USDT' && row.total > 0);
  const exchangeTotal = pricedExchangeBalances.reduce((sum, row) => sum + Math.max(0, row.market_value || 0), 0);

  for (const row of pricedExchangeBalances) {
    rows.push({
      id: `exchange-${row.asset}`,
      symbol: `${row.asset}-USDT`,
      asset_class: 'CRYPTO',
      market: 'CRYPTO',
      quantity: row.total,
      current_price: row.mark_price,
      weight_pct: exchangeTotal > 0 && row.market_value > 0 ? (row.market_value / exchangeTotal) * 100 : null,
      note: 'Exchange'
    });
  }

  return rows;
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
  const [displayMode, setDisplayMode] = useState(() => detectDisplayMode());
  const [activeTab, setActiveTab] = useState('today');
  const [myStack, setMyStack] = useState(['portfolio']);
  const [assetClass, setAssetClass] = useLocalStorage('nova-quant-asset-class', 'US_STOCK', {
    legacyKeys: ['quant-demo-asset-class']
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
  const [userProfile, setUserProfile] = useLocalStorage('nova-quant-user-profile', {
    email: '',
    name: '',
    tradeMode: 'starter',
    broker: 'Robinhood'
  });
  const [authSession, setAuthSession] = useLocalStorage('nova-quant-auth-session', null);
  const [onboardingDone, setOnboardingDone] = useLocalStorage('nova-quant-onboarding-done', false, {
    legacyKeys: ['quant-demo-onboarding-done']
  });
  const [showOnboarding, setShowOnboarding] = useState(!authSession);
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
  const [engagementState, setEngagementState] = useState(null);
  const [manualState, setManualState] = useState(DEMO_MANUAL_STATE);
  const mySection = myStack[myStack.length - 1] || 'portfolio';

  const t = useMemo(() => createTranslator(lang), [lang]);
  const locale = useMemo(() => getLocale(lang), [lang]);
  const tabMeta = useMemo(() => buildTabMeta(locale), [locale]);
  const menuTitles = useMemo(() => buildMenuTitles(locale), [locale]);

  const investorDemoEnvironment = useMemo(
    () => (investorDemoEnabled ? buildInvestorDemoEnvironment(assetClass) : null),
    [investorDemoEnabled, assetClass]
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
        data_status: investorDemoEnvironment?.evidence?.data_status || 'DEMO_ONLY'
      },
      performance: {
        ...data.performance,
        investor_demo: INVESTOR_DEMO_PERFORMANCE
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
          ...(investorDemoEnvironment?.config?.runtime || {})
        }
      }
    };
  }, [investorDemoEnabled, investorDemoEnvironment, data]);

  const connectedHoldings = useMemo(
    () =>
      deriveConnectedHoldings({
        brokerSnapshot: uiData?.config?.runtime?.connectivity?.broker || null,
        exchangeSnapshot: uiData?.config?.runtime?.connectivity?.exchange || null
      }),
    [uiData?.config?.runtime?.connectivity?.broker, uiData?.config?.runtime?.connectivity?.exchange]
  );

  const holdingsSource = useMemo(() => {
    if (investorDemoEnabled) {
      return {
        kind: 'DEMO',
        connected: true,
        available: true,
        message: 'Demo holdings enabled.'
      };
    }
    const broker = uiData?.config?.runtime?.connectivity?.broker || null;
    const exchange = uiData?.config?.runtime?.connectivity?.exchange || null;
    const connected = Boolean(broker?.can_read_positions || exchange?.can_read_positions);
    if (connected) {
      return {
        kind:
          connectedHoldings.some((row) => row.market === 'US') && connectedHoldings.some((row) => row.market === 'CRYPTO')
            ? 'MERGED'
            : broker?.can_read_positions
              ? 'BROKER'
              : 'EXCHANGE',
        connected: true,
        available: true,
        message:
          connectedHoldings.length > 0
            ? 'Live read-only holdings loaded from connected accounts.'
            : 'Connected accounts are live, but no open holdings were reported.'
      };
    }
    return {
      kind: 'UNAVAILABLE',
      connected: false,
      available: false,
      message: broker?.message || exchange?.message || 'Connect a broker or exchange to load real holdings.'
    };
  }, [connectedHoldings, investorDemoEnabled, uiData?.config?.runtime?.connectivity?.broker, uiData?.config?.runtime?.connectivity?.exchange]);

  const effectiveHoldings = useMemo(() => {
    if (investorDemoEnabled) return holdings;
    return connectedHoldings;
  }, [connectedHoldings, holdings, investorDemoEnabled]);

  const holdingsReview = useMemo(
    () => buildHoldingsReview({ holdings: effectiveHoldings, state: uiData }),
    [effectiveHoldings, uiData]
  );

  const aiState = useMemo(
    () => ({
      ...uiData,
      decision: decisionSnapshot || uiData.decision || null,
      user_context: {
        user_id: effectiveUserId,
        ui_mode: uiMode,
        holdings: effectiveHoldings,
        holdings_review: holdingsReview
      }
    }),
    [uiData, decisionSnapshot, effectiveUserId, uiMode, effectiveHoldings, holdingsReview]
  );

  const enableInvestorDemo = () => {
    if (!investorDemoEnabled) {
      setInvestorDemoHoldingsBackup(Array.isArray(holdings) ? holdings : []);
      setInvestorDemoUiBackup({
        assetClass,
        market,
        watchlist: Array.isArray(watchlist) ? watchlist : [],
        executions: Array.isArray(executions) ? executions : []
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
        deep: 'advanced'
      };
      setUserProfile({
        email: account.email,
        name: account.name,
        tradeMode: account.tradeMode,
        broker: account.broker
      });
      setAuthSession({
        userId: account.userId,
        email: normalizeEmail(account.email),
        name: account.name,
        tradeMode: account.tradeMode,
        broker: account.broker,
        loggedInAt: new Date().toISOString()
      });
      setUiMode(syncedState?.uiMode || tradeModeMap[account.tradeMode] || 'standard');
      setRiskProfileKey(
        syncedState?.riskProfileKey ||
          (account.tradeMode === 'deep' ? 'aggressive' : account.tradeMode === 'starter' ? 'conservative' : 'balanced')
      );
      setWatchlist(Array.isArray(syncedState?.watchlist) ? syncedState.watchlist : DEFAULT_AUTH_WATCHLIST);
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
      setWatchlist
    ]
  );

  useEffect(() => {
    if (authSession !== null) return undefined;
    let cancelled = false;
    void fetchJson('/api/auth/session')
      .then((payload) => {
        if (cancelled) return;
        if (payload?.authenticated && payload?.user) {
          applyAuthenticatedProfile(payload.user, payload.state || null, { resetNavigation: false });
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
              vipDaysRedeemed: 0
            },
            referrals: {
              inviteCode: null,
              referredByCode: null,
              total: 0,
              rewarded: 0
            },
            ledger: [],
            rewards: [
              {
                id: 'vip-1d',
                kind: 'vip_day',
                title: 'Redeem 1 VIP day',
                description: '1000 points unlocks one more VIP day.',
                costPoints: 1000,
                enabled: false
              }
            ],
            predictions: []
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
      holdings: effectiveHoldings,
      executions,
      disciplineLog
    };
    const serialized = JSON.stringify(payload);
    if (lastProfileSyncRef.current === serialized) return undefined;

    const timer = window.setTimeout(() => {
      lastProfileSyncRef.current = serialized;
      void fetchJson('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized
      }).catch(() => {
        lastProfileSyncRef.current = '';
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    assetClass,
    authSession?.userId,
    disciplineLog,
    effectiveHoldings,
    executions,
    investorDemoEnabled,
    market,
    riskProfileKey,
    uiMode,
    watchlist
  ]);

  const clearInvestorDemo = () => {
    const restore = Array.isArray(investorDemoHoldingsBackup) ? investorDemoHoldingsBackup : [];
    setInvestorDemoEnabled(false);
    setHoldings(restore);
    if (investorDemoUiBackup?.assetClass) setAssetClass(investorDemoUiBackup.assetClass);
    if (investorDemoUiBackup?.market) setMarket(investorDemoUiBackup.market);
    if (Array.isArray(investorDemoUiBackup?.watchlist)) setWatchlist(investorDemoUiBackup.watchlist);
    if (Array.isArray(investorDemoUiBackup?.executions)) setExecutions(investorDemoUiBackup.executions);
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
          controlPlane,
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
          fetchJson(`/api/risk-profile?userId=${effectiveUserId}`),
          fetchJson(`/api/control-plane/status?userId=${effectiveUserId}`).catch(() => null),
          fetchJson(`/api/connect/broker?userId=${effectiveUserId}&provider=ALPACA`),
          fetchJson(`/api/connect/exchange?userId=${effectiveUserId}&provider=BINANCE`)
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
          decision: runtimeData.decision || null,
          signals: Array.isArray(signals?.data) ? signals.data : runtimeData.signals || [],
          evidence: evidenceData,
          market_modules: Array.isArray(modules?.data) ? modules.data : runtimeData.market_modules || [],
          performance: performance || runtimeData.performance || initialData.performance,
          control_plane: controlPlane || runtimeData.control_plane || null,
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
              },
              control_plane: controlPlane || null
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
        setDecisionSnapshot(runtimeData.decision || null);
        setRawData({
          as_of: runtime?.asof || new Date().toISOString(),
          source_status: runtime?.source_status || 'INSUFFICIENT_DATA'
        });
        setHasLoaded(true);
      } catch {
        if (!mounted) return;
        setData(initialData);
        setDecisionSnapshot(null);
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
    if (isDemoRuntime) return;
    void fetchJson('/api/risk-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: effectiveUserId,
        profileKey: riskProfileKey
      })
    })
      .then(() => setRefreshNonce((current) => current + 1))
      .catch(() => {});
  }, [riskProfileKey, effectiveUserId, isDemoRuntime]);

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
          holdings: effectiveHoldings
        })
      });
      setEngagementState(payload || null);
      return payload || null;
    } catch {
      setEngagementState(null);
      return null;
    }
  }, [assetClass, effectiveUserId, hasLoaded, effectiveHoldings, isDemoRuntime, lang, market, now, todayKey]);

  useEffect(() => {
    if (isDemoRuntime || !hasLoaded) return;
    let cancelled = false;

    void fetchJson('/api/decision/today', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: effectiveUserId,
        market,
        assetClass,
        locale: lang,
        holdings: effectiveHoldings
      })
    })
      .then((payload) => {
        if (!cancelled) setDecisionSnapshot(payload || null);
      })
      .catch(() => {
        if (!cancelled) setDecisionSnapshot(uiData.decision || null);
      });

    return () => {
      cancelled = true;
    };
  }, [isDemoRuntime, hasLoaded, effectiveUserId, market, assetClass, effectiveHoldings, lang, uiData.decision]);

  useEffect(() => {
    if (!decisionSnapshot || isDemoRuntime || !hasLoaded) return;
    void loadEngagementState();
  }, [decisionSnapshot?.audit_snapshot_id, isDemoRuntime, hasLoaded, loadEngagementState]);

  const lastUpdated = useMemo(() => {
    return uiData.config.last_updated || uiData.performance.last_updated || uiData.velocity.last_updated || null;
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
      weeklyStreak: calcStreak(weekly, currentWeekKey, 7)
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
      noActionValueLine: habit.no_action_value_line || null
    };
  }, [engagementState, localDiscipline]);

  const syncLocalDisciplineLog = useCallback(
    (updater) => {
      setDisciplineLog((current) => updater(current || { checkins: [], boundary_kept: [], weekly_reviews: [] }));
    },
    [setDisciplineLog]
  );

  const markDailyCheckin = useCallback(async () => {
    syncLocalDisciplineLog((current) => ({
      ...current,
      checkins: addUniqueKey(current?.checkins || [], todayKey)
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
          holdings: effectiveHoldings
        })
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [assetClass, effectiveUserId, effectiveHoldings, isDemoRuntime, lang, loadEngagementState, market, now, syncLocalDisciplineLog, todayKey]);

  const markBoundaryKept = useCallback(async () => {
    syncLocalDisciplineLog((current) => ({
      ...current,
      boundary_kept: addUniqueKey(current?.boundary_kept || [], todayKey)
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
          holdings: effectiveHoldings
        })
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [assetClass, effectiveUserId, effectiveHoldings, isDemoRuntime, lang, loadEngagementState, market, now, syncLocalDisciplineLog, todayKey]);

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
          holdings: effectiveHoldings
        })
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [assetClass, effectiveUserId, effectiveHoldings, isDemoRuntime, lang, loadEngagementState, market, now, todayKey]);

  const markWeeklyReviewed = useCallback(async () => {
    syncLocalDisciplineLog((current) => ({
      ...current,
      weekly_reviews: addUniqueKey(current?.weekly_reviews || [], currentWeekKey)
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
          holdings: effectiveHoldings
        })
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [assetClass, effectiveUserId, currentWeekKey, effectiveHoldings, isDemoRuntime, lang, loadEngagementState, market, now, syncLocalDisciplineLog, todayKey]);

  const askAi = (message, context = {}) => {
    const text = String(message || '').trim();
    if (!text) return;
    setAiSeedRequest({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message: text,
      context: {
        page: activeTab === 'my' ? mySection || 'my' : activeTab,
        locale: lang,
        market,
        assetClass,
        riskProfileKey,
        uiMode,
        decisionSummary: {
          today_call: decisionSnapshot?.summary?.today_call?.headline || decisionSnapshot?.summary?.today_call || null,
          risk_posture: decisionSnapshot?.summary?.risk_posture || decisionSnapshot?.risk_state?.posture || null,
          top_action_id: decisionSnapshot?.top_action_id || null,
          top_action_symbol: decisionSnapshot?.summary?.top_action_symbol || decisionSnapshot?.ranked_action_cards?.[0]?.symbol || null,
          top_action_label: decisionSnapshot?.summary?.top_action_label || decisionSnapshot?.ranked_action_cards?.[0]?.action_label || null,
          source_status: decisionSnapshot?.source_status || uiData?.config?.runtime?.source_status || 'INSUFFICIENT_DATA',
          data_status: decisionSnapshot?.data_status || uiData?.config?.runtime?.data_status || 'INSUFFICIENT_DATA'
        },
        holdingsSummary: {
          holdings_count: holdingsReview?.totals?.holdings_count ?? 0,
          total_weight_pct: holdingsReview?.totals?.total_weight_pct ?? 0,
          aligned_weight_pct: holdingsReview?.system_alignment?.aligned_weight_pct ?? 0,
          unsupported_weight_pct: holdingsReview?.system_alignment?.unsupported_weight_pct ?? 0,
          top1_pct: holdingsReview?.concentration?.top1_pct ?? 0,
          risk_level: holdingsReview?.risk?.level || null,
          recommendation: holdingsReview?.risk?.recommendation || holdingsReview?.key_advice || null
        },
        engagementSummary: {
          locale: lang,
          morning_check_status: engagementState?.daily_check_state?.status || null,
          morning_check_label: engagementState?.daily_check_state?.headline || null,
          morning_check_arrival: engagementState?.daily_check_state?.arrival_line || engagementState?.ui_regime_state?.arrival_line || null,
          morning_check_ritual: engagementState?.daily_check_state?.ritual_line || engagementState?.ui_regime_state?.ritual_line || null,
          perception_status: engagementState?.perception_layer?.status || null,
          perception_headline: engagementState?.perception_layer?.headline || null,
          perception_focus: engagementState?.perception_layer?.focus_line || null,
          perception_confirmation: engagementState?.perception_layer?.confirmation_line || null,
          wrap_up_ready: Boolean(engagementState?.daily_wrap_up?.ready),
          wrap_up_completed: Boolean(engagementState?.daily_wrap_up?.completed),
          wrap_up_line: engagementState?.daily_wrap_up?.opening_line || engagementState?.ui_regime_state?.wrap_line || null,
          discipline_score: Number(engagementState?.habit_state?.discipline_score || 0) || null,
          behavior_quality: engagementState?.habit_state?.behavior_quality || null,
          recommendation_change: engagementState?.recommendation_change?.summary || null,
          ui_tone: engagementState?.ui_regime_state?.tone || null
        },
        ...(context || {})
      }
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
      pnl_pct: action === 'DONE' ? Number(signal.quick_pnl_pct ?? 0.6) : 0
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
          note: 'Recorded from Today quick action'
        })
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
    const payload = await fetchJson(`/api/manual/state?userId=${encodeURIComponent(effectiveUserId)}`);
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
              vipDaysRedeemed: Number(base.summary.vipDaysRedeemed || 0) + days
            }
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
            days
          })
        });
        if (payload?.data) setManualState(payload.data);
        else await refreshManualState();
      } catch {
        await refreshManualState().catch(() => {});
      }
    },
    [effectiveUserId, isDemoRuntime, refreshManualState]
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
    [buildMyStack]
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

  const renderDataStatus = () => {
    const runtime = data?.config?.runtime || {};
    const controlPlane = runtime?.control_plane || data?.control_plane || null;
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
    if (controlPlane?.search?.status === 'UNAVAILABLE') {
      topIssues.push('搜索资产库未就绪，Browse 搜索会表现为空。');
    }
    if (Array.isArray(controlPlane?.runtime) && controlPlane.runtime.every((row) => Number(row?.active_signal_count || 0) === 0)) {
      topIssues.push('两个市场当前都没有 active signals，所以 Today 会退回等待态。');
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

        {controlPlane ? (
          <article className="glass-card">
            <h3 className="card-title">Control Plane</h3>
            <p className="muted status-line">As of: {controlPlane.as_of || '--'}</p>
            <div className="status-grid-3">
              <div className="status-box">
                <p className="muted">Search</p>
                <h2>{controlPlane.search?.status || '--'}</h2>
                <p className="muted status-line">
                  {controlPlane.search?.live_asset_count ?? '--'} live / {controlPlane.search?.reference_asset_count ?? '--'} reference
                </p>
              </div>
              <div className="status-box">
                <p className="muted">Strategy Factory</p>
                <h2>{controlPlane.strategy_factory?.latest_status || '--'}</h2>
                <p className="muted status-line">{controlPlane.strategy_factory?.latest_run_at || 'No run yet'}</p>
              </div>
              <div className="status-box">
                <p className="muted">Delivery</p>
                <h2>{controlPlane.delivery?.active_notification_count ?? '--'}</h2>
                <p className="muted status-line">{controlPlane.delivery?.latest_notification_at || 'No delivery yet'}</p>
              </div>
            </div>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Runtime</th>
                    <th>Signals</th>
                    <th>Decision</th>
                    <th>Top</th>
                  </tr>
                </thead>
                <tbody>
                  {(controlPlane.runtime || []).map((row) => (
                    <tr key={row.market}>
                      <td>{row.market}</td>
                      <td>{row.source_status}</td>
                      <td>{row.active_signal_count}/{row.signal_count}</td>
                      <td>{row.decision_code}</td>
                      <td>{row.top_action_symbol || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}

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
    const notificationPrefs = engagementState?.notification_preferences;

    const togglePreference = async (field, nextValue) => {
      if (isDemoRuntime) return;
      try {
        const payload = await fetchJson('/api/notification-preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: effectiveUserId,
            [field]: nextValue
          })
        });
        setEngagementState((current) =>
          current
            ? {
                ...current,
                notification_preferences: payload
              }
            : current
        );
        void loadEngagementState();
      } catch {
        void loadEngagementState();
      }
    };

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
              <h3 className="card-title">Recall Style</h3>
              <p className="muted status-line">
                Nova only nudges when today&apos;s judgment, protection, or wrap-up is worth confirming.
              </p>
            </div>
            <span className="badge badge-neutral">{notificationPrefs?.frequency || 'NORMAL'}</span>
          </div>

          <div className="status-grid-2" style={{ marginTop: 10 }}>
            {[
              ['morning_enabled', 'Morning check'],
              ['state_shift_enabled', 'Judgment shifts'],
              ['protective_enabled', 'Protective reminders'],
              ['wrap_up_enabled', 'Evening wrap-up']
            ].map(([field, label]) => {
              const enabled = Boolean(notificationPrefs?.[field]);
              return (
                <button
                  key={field}
                  type="button"
                  className={`status-box preference-toggle ${enabled ? 'is-on' : 'is-off'}`}
                  onClick={() => togglePreference(field, enabled ? 0 : 1)}
                >
                  <p className="muted">{label}</p>
                  <h2>{enabled ? 'On' : 'Off'}</h2>
                </button>
              );
            })}
          </div>

          <div className="action-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className={`secondary-btn ${notificationPrefs?.frequency === 'LOW' ? 'is-selected' : ''}`}
              onClick={() => togglePreference('frequency', 'LOW')}
            >
              Quiet cadence
            </button>
            <button
              type="button"
              className={`secondary-btn ${notificationPrefs?.frequency !== 'LOW' ? 'is-selected' : ''}`}
              onClick={() => togglePreference('frequency', 'NORMAL')}
            >
              Normal cadence
            </button>
          </div>
        </article>
      </section>
    );
  };

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
            <p className="daily-brief-conclusion">
              {engagementState?.habit_state?.summary ||
                (locale.startsWith('zh')
                  ? '你在训练的是判断节奏，不是交易频率。'
                  : 'You are training decision rhythm, not trading frequency.')}
            </p>

            <div className="status-grid-3">
              <div className="status-box">
                <p className="muted">Daily Check-in</p>
                <h2>{discipline.checkinStreak}{locale.startsWith('zh') ? ' 天' : ' days'}</h2>
              </div>
              <div className="status-box">
                <p className="muted">Weekly Review</p>
                <h2>{discipline.weeklyStreak}{locale.startsWith('zh') ? ' 周' : ' weeks'}</h2>
              </div>
              <div className="status-box">
                <p className="muted">Risk Boundary</p>
                <h2>{discipline.boundaryStreak}{locale.startsWith('zh') ? ' 天' : ' days'}</h2>
              </div>
            </div>

            <ul className="bullet-list">
              <li>
                {engagementState?.daily_check_state?.headline ||
                  (discipline.checkedToday
                    ? locale.startsWith('zh')
                      ? '今天已完成判断校准。'
                      : 'Today’s view has already been confirmed.'
                    : locale.startsWith('zh')
                      ? '今天还未完成判断校准。'
                      : 'Today’s view is still waiting for confirmation.')}
              </li>
              <li>{discipline.boundaryToday ? (locale.startsWith('zh') ? '今天已确认风险边界。' : 'Today’s risk boundary has been confirmed.') : (locale.startsWith('zh') ? '今天还未确认风险边界。' : 'Today’s risk boundary is still unconfirmed.')}</li>
              <li>{discipline.reviewedThisWeek ? (locale.startsWith('zh') ? '本周复盘已完成。' : 'This week’s review is complete.') : (locale.startsWith('zh') ? '本周还未完成复盘。' : 'This week’s review is still open.')}</li>
              {discipline.noActionValueLine ? <li>{discipline.noActionValueLine}</li> : null}
            </ul>

            <div className="action-row">
              <button type="button" className="primary-btn" onClick={markDailyCheckin}>
                {locale.startsWith('zh') ? '完成今日 Check-in' : 'Complete today’s check-in'}
              </button>
              <button type="button" className="secondary-btn" onClick={markBoundaryKept}>
                {locale.startsWith('zh') ? '记录风险边界执行' : 'Record boundary discipline'}
              </button>
              <button type="button" className="secondary-btn" onClick={markWeeklyReviewed}>
                {locale.startsWith('zh') ? '标记本周复盘完成' : 'Mark weekly review done'}
              </button>
            </div>
          </article>

          {engagementState?.widget_summary ? (
            <article className="glass-card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Widget Preview</h3>
                  <p className="muted status-line">
                    {locale.startsWith('zh')
                      ? '桌面和锁屏摘要会围绕判断，而不是围绕行情刺激。'
                      : 'Home and lock-screen summaries stay centered on judgment, not market stimulation.'}
                  </p>
                </div>
              </div>
              <div className="status-grid-3">
                {Object.values(engagementState.widget_summary).map((widget) => (
                  <div key={widget.kind} className="status-box widget-preview-box">
                    <p className="muted">{widget.kind.replace(/_/g, ' ')}</p>
                    <h2>{widget.title}</h2>
                    <p className="muted status-line">{widget.subtitle}</p>
                    {widget.spark ? <p className="status-line widget-spark-line">{widget.spark}</p> : null}
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {engagementState?.notification_center?.notifications?.length ? (
            <article className="glass-card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Notification Preview</h3>
                  <p className="muted status-line">
                    {locale.startsWith('zh')
                      ? '这些消息的目的都是提醒你回来确认，而不是催你交易。'
                      : 'These messages invite a calm return to confirm, not a push to trade.'}
                  </p>
                </div>
                <span className="badge badge-neutral">{engagementState.notification_center.active_count || 0}</span>
              </div>
              <div className="quick-access-list" style={{ marginTop: 8 }}>
                {engagementState.notification_center.notifications.slice(0, 4).map((item) => (
                  <div key={item.id} className="quick-access-row notification-preview-row">
                    <span className="quick-access-title">{item.title}</span>
                    <span className="quick-access-desc">{item.body}</span>
                    <span className="muted status-line notification-tone-line">{item.tone}</span>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {engagementState?.daily_wrap_up ? (
            <article className="glass-card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">{engagementState.daily_wrap_up.title}</h3>
                  <p className="muted status-line">{engagementState.daily_wrap_up.headline}</p>
                </div>
                <span className={`badge ${engagementState.daily_wrap_up.completed ? 'badge-triggered' : 'badge-neutral'}`}>
                  {engagementState.daily_wrap_up.short_label}
                </span>
              </div>
              {engagementState.daily_wrap_up.opening_line ? (
                <p className="status-line ritual-kicker">{engagementState.daily_wrap_up.opening_line}</p>
              ) : null}
              <p className="daily-brief-conclusion">{engagementState.daily_wrap_up.summary}</p>
              <ul className="bullet-list">
                {(engagementState.daily_wrap_up.lessons || []).map((line) => (
                  <li key={line}>{line}</li>
                ))}
                <li>{engagementState.daily_wrap_up.tomorrow_watch}</li>
              </ul>
              <div className="action-row">
                <button type="button" className="primary-btn" onClick={markWrapUpComplete}>
                  {locale.startsWith('zh') ? '完成今日复盘' : 'Complete today’s wrap-up'}
                </button>
                <button type="button" className="secondary-btn" onClick={() => askAi('What mattered most in today’s wrap-up?')}>
                  Ask Nova
                </button>
              </div>
            </article>
          ) : null}
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
              current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]
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
          baseContext={{
            locale: lang,
            market,
            assetClass,
            riskProfileKey,
            uiMode,
            decisionSummary: {
              today_call: decisionSnapshot?.summary?.today_call?.headline || decisionSnapshot?.summary?.today_call || null,
              risk_posture: decisionSnapshot?.summary?.risk_posture || decisionSnapshot?.risk_state?.posture || null,
              top_action_id: decisionSnapshot?.top_action_id || null,
              top_action_symbol: decisionSnapshot?.summary?.top_action_symbol || decisionSnapshot?.ranked_action_cards?.[0]?.symbol || null,
              top_action_label: decisionSnapshot?.summary?.top_action_label || decisionSnapshot?.ranked_action_cards?.[0]?.action_label || null,
              source_status: decisionSnapshot?.source_status || uiData?.config?.runtime?.source_status || 'INSUFFICIENT_DATA',
              data_status: decisionSnapshot?.data_status || uiData?.config?.runtime?.data_status || 'INSUFFICIENT_DATA'
            },
            holdingsSummary: {
              holdings_count: holdingsReview?.totals?.holdings_count ?? 0,
              total_weight_pct: holdingsReview?.totals?.total_weight_pct ?? 0,
              aligned_weight_pct: holdingsReview?.system_alignment?.aligned_weight_pct ?? 0,
              unsupported_weight_pct: holdingsReview?.system_alignment?.unsupported_weight_pct ?? 0,
              top1_pct: holdingsReview?.concentration?.top1_pct ?? 0,
              risk_level: holdingsReview?.risk?.level || null,
              recommendation: holdingsReview?.risk?.recommendation || holdingsReview?.key_advice || null
            },
            engagementSummary: {
              locale: lang,
              morning_check_status: engagementState?.daily_check_state?.status || null,
              morning_check_label: engagementState?.daily_check_state?.headline || null,
              morning_check_arrival: engagementState?.daily_check_state?.arrival_line || engagementState?.ui_regime_state?.arrival_line || null,
              morning_check_ritual: engagementState?.daily_check_state?.ritual_line || engagementState?.ui_regime_state?.ritual_line || null,
              perception_status: engagementState?.perception_layer?.status || null,
              perception_headline: engagementState?.perception_layer?.headline || null,
              perception_focus: engagementState?.perception_layer?.focus_line || null,
              perception_confirmation: engagementState?.perception_layer?.confirmation_line || null,
              wrap_up_ready: Boolean(engagementState?.daily_wrap_up?.ready),
              wrap_up_completed: Boolean(engagementState?.daily_wrap_up?.completed),
              wrap_up_line: engagementState?.daily_wrap_up?.opening_line || engagementState?.ui_regime_state?.wrap_line || null,
              discipline_score: Number(engagementState?.habit_state?.discipline_score || 0) || null,
              behavior_quality: engagementState?.habit_state?.behavior_quality || null,
              recommendation_change: engagementState?.recommendation_change?.summary || null,
              ui_tone: engagementState?.ui_regime_state?.tone || null
            }
          }}
        />
      );
    }

    if (activeTab === 'browse') {
      return (
        <BrowseTab
          locale={locale}
          marketInstruments={uiData?.layers?.data_layer?.instruments || []}
          signals={uiData?.signals || []}
          insights={uiData?.insights || {}}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          onOpenMy={() => {
            setActiveTab('my');
            setMyStack(['portfolio']);
          }}
        />
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
          onExplain={(message) => askAi(message)}
        />
      );
    }

    if (activeTab === 'my' && ['menu', 'points', 'prediction-games', 'rewards', 'points-history', 'group:review', 'group:system', 'group:market', 'group:settings'].includes(mySection)) {
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
              weekly_reviews: []
            });
            setAuthSession(null);
            setUserProfile({
              email: '',
              name: '',
              tradeMode: 'starter',
              broker: 'Robinhood'
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

  const canGoBackInTopBar = activeTab === 'my' && myStack.length > 1;
  const showHoldingsMenuAction = activeTab === 'my' && mySection === 'portfolio';
  const previousMySection = canGoBackInTopBar ? myStack[myStack.length - 2] : null;
  const topBarBackLabel =
    previousMySection && previousMySection !== 'portfolio'
      ? menuTitles[previousMySection] || tabMeta.my.label
      : tabMeta.my.label;
  const topBarMode = canGoBackInTopBar ? 'detail' : 'root';
  const appTone = engagementState?.ui_regime_state?.tone || 'quiet';
  const motionProfile = engagementState?.ui_regime_state?.motion_profile || 'calm';
  const dailyCheckState = String(engagementState?.daily_check_state?.status || 'PENDING').toLowerCase();
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

  return (
    <div className={`app-bg app-bg-${displayMode} app-tone-${appTone}`}>
      <div
        className={`device-shell device-shell-${displayMode} ui-tone-${appTone} ui-motion-${motionProfile} daily-check-${dailyCheckState}`}
        data-active-tab={activeTab}
      >
        <header className={`top-bar top-bar-${topBarMode} ${topBarCondensed ? 'is-condensed' : ''}`}>
          <div className="top-bar-leading">
            {canGoBackInTopBar ? (
              <button type="button" className="ios-nav-back top-bar-back" onClick={popMySection} aria-label={`Back to ${topBarBackLabel}`}>
                <span className="ios-back-chevron" aria-hidden="true">
                  ‹
                </span>
                <span className="ios-back-label">{topBarBackLabel}</span>
              </button>
            ) : null}
          </div>
          <div className="top-bar-logo-wrap" aria-label="Nova Quant">
            <img src={novaLogo} alt="Nova Quant" className={`top-bar-logo top-bar-logo-expanded ${topBarCondensed ? 'is-hidden' : ''}`} />
            <img src={novaLogoCompact} alt="Nova Quant" className={`top-bar-logo top-bar-logo-compact ${topBarCondensed ? 'is-visible' : ''}`} />
          </div>
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
          <div className="screen-transition" key={`${activeTab}-${mySection}-${uiMode}`}>
            {renderScreen()}
          </div>
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

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} config={data.config} t={t} locale={locale} />

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
              body: JSON.stringify({ email, password })
            });
            applyAuthenticatedProfile(payload.user, payload.state || null, { resetNavigation: true });
            return { ok: true };
          } catch (error) {
            return {
              ok: false,
              error: classifyAuthError(error, locale)
            };
          }
        }}
        onRequestReset={async ({ email }) => {
          try {
            const payload = await fetchJson('/api/auth/forgot-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email })
            });
            return {
              ok: true,
              codeHint: payload.codeHint || null,
              expiresInMinutes: payload.expiresInMinutes || 15
            };
          } catch (error) {
            return {
              ok: false,
              error:
                String(error?.message || '').includes('(404)') ||
                String(error?.message || '').includes('(500)') ||
                String(error?.message || '').includes('(503)')
                  ? locale?.startsWith('zh')
                    ? isLocalAuthRuntime()
                      ? '重置服务未连接。请先启动本地 API：npm run api:data'
                      : '重置服务暂时不可用。请稍后再试。'
                    : isLocalAuthRuntime()
                      ? 'The reset service is offline. Start the local API first: npm run api:data'
                      : 'The reset service is temporarily unavailable.'
                  : locale?.startsWith('zh')
                    ? '暂时没法发送重置码，请稍后再试。'
                    : 'We could not send a reset code just now.'
            };
          }
        }}
        onResetPassword={async ({ email, code, newPassword }) => {
          try {
            await fetchJson('/api/auth/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, code, newPassword })
            });
            return { ok: true };
          } catch (error) {
            return {
              ok: false,
              error:
                String(error?.message || '').includes('(400)')
                  ? locale?.startsWith('zh')
                    ? '重置码无效，或密码不符合要求。'
                    : 'The reset code is invalid, or the password is too weak.'
                  : locale?.startsWith('zh')
                    ? isLocalAuthRuntime()
                      ? '重置服务未连接。请先启动本地 API：npm run api:data'
                      : '重置服务暂时不可用。请稍后再试。'
                    : isLocalAuthRuntime()
                      ? 'The reset service is offline. Start the local API first: npm run api:data'
                      : 'The reset service is temporarily unavailable.'
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
                locale
              })
            });
            applyAuthenticatedProfile(response.user, response.state || null, { resetNavigation: true });
            return { ok: true };
          } catch (error) {
            const message = String(error?.message || '');
            return {
              ok: false,
              error: message.includes('(400)')
                ? locale?.startsWith('zh')
                  ? '这个邮箱已经存在，或注册信息无效。'
                  : 'That email already exists, or the signup details are invalid.'
                : locale?.startsWith('zh')
                  ? isLocalAuthRuntime()
                    ? '注册服务未连接。请先启动本地 API：npm run api:data'
                    : '注册服务暂时不可用。请稍后再试。'
                  : isLocalAuthRuntime()
                    ? 'The signup service is offline. Start the local API first: npm run api:data'
                    : 'The signup service is temporarily unavailable.'
            };
          }
        }}
      />
    </div>
  );
}

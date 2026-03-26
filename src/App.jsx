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
const TodayTab = lazy(() => import('./components/TodayTab'));
const WeeklyReviewTab = lazy(() => import('./components/WeeklyReviewTab'));
import TabBarIcon from './components/icons/TabBarIcon';
import TopBarMenuGlyph from './components/icons/TopBarMenuGlyph';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useAuth } from './hooks/useAuth';
import { useAppData } from './hooks/useAppData';
import { useEngagement } from './hooks/useEngagement';
import { useInvestorDemo } from './hooks/useInvestorDemo';
import { useNavigation } from './hooks/useNavigation';
import { createTranslator, getDefaultLang, getLocale } from './i18n';
import { buildHoldingsReview } from './research/holdingsAnalyzer';
import { fetchApi } from './utils/api';
import { detectDisplayMode, runWhenIdle } from './utils/appHelpers';
import { primeBrowseHomeBundle, primeBrowseUniverseBundle } from './utils/browseWarmup';
import { DEMO_ENTRY_ENABLED, isDemoRuntime as getIsDemoRuntime } from './demo/runtime';
import { INVESTOR_DEMO_PERFORMANCE } from './demo/investorDemo';
import { buildTabMeta, buildMenuTitles, MY_SECTION_LIST } from './config/appConstants';

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
  const [assetClass, setAssetClass] = useLocalStorage('nova-quant-asset-class', 'US_STOCK', {
    legacyKeys: ['quant-demo-asset-class'],
  });
  const [market, setMarket] = useState('US');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [decisionSnapshot, setDecisionSnapshot] = useState(null);
  const [lang, setLang] = useLocalStorage('nova-quant-lang', getDefaultLang(), {
    legacyKeys: ['quant-demo-lang'],
  });
  const [browseTopBarState, setBrowseTopBarState] = useState({
    canGoBack: false,
    title: 'Browse',
    backLabel: 'Browse',
  });
  const [browseBackToken, setBrowseBackToken] = useState(0);

  const t = useMemo(() => createTranslator(lang), [lang]);
  const locale = useMemo(() => getLocale(lang), [lang]);
  const tabMeta = useMemo(() => buildTabMeta(locale), [locale]);
  const menuTitles = useMemo(() => buildMenuTitles(locale), [locale]);

  // --- Navigation hook ---
  const {
    activeTab,
    setActiveTab,
    myStack,
    setMyStack,
    mySection,
    aiSeedRequest,
    resetMy,
    openMySection,
    pushMySection,
    popMySection,
    askAi: askAiRaw,
    navigateFromAi,
  } = useNavigation();

  // --- Auth hook ---
  const {
    userProfile,
    authSession,
    setAuthSession,
    onboardingDone,
    setOnboardingDone,
    uiMode,
    setUiMode,
    riskProfileKey,
    setRiskProfileKey,
    watchlist,
    setWatchlist,
    executions,
    setExecutions,
    holdings,
    setHoldings,
    disciplineLog,
    setDisciplineLog,
    chatUserId,
    effectiveUserId,
    handleLogin,
    handleSignup,
    handleRequestReset,
    handleResetPassword,
    handleLogout,
  } = useAuth({
    fetchJson,
    setAssetClass,
    setMarket,
    setActiveTab,
    setMyStack,
    locale,
  });

  // --- Data loading hook (runs first, no demo dependency) ---
  const { loading, data, hasLoaded } = useAppData({
    fetchJson,
    assetClass,
    market,
    effectiveUserId,
    authSession,
    riskProfileKey,
    executions,
    refreshNonce,
  });

  // --- Investor Demo hook (uses real data) ---
  const {
    investorDemoEnabled,
    showOnboarding,
    setShowOnboarding,
    uiData: finalUiData,
    holdingsSource: finalHoldingsSource,
    effectiveHoldings: finalEffectiveHoldings,
    enableInvestorDemo,
    clearInvestorDemo,
  } = useInvestorDemo({
    assetClass,
    setAssetClass,
    market,
    setMarket,
    holdings,
    setHoldings,
    watchlist,
    setWatchlist,
    executions,
    setExecutions,
    setOnboardingDone,
    setActiveTab,
    setMyStack,
    authSession,
    data,
  });

  const isDemoRuntime = getIsDemoRuntime(investorDemoEnabled);

  // --- Profile sync to server ---
  // Lives here (not in useAuth) because it needs the canonical investorDemoEnabled
  // from useInvestorDemo — the single source of truth for demo state.
  const lastProfileSyncRef = useRef('');
  useEffect(() => {
    if (!authSession?.userId) return undefined;
    // Never sync demo data to the real user profile
    if (investorDemoEnabled) return undefined;

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
    authSession?.userId,
    investorDemoEnabled,
    assetClass,
    market,
    disciplineLog,
    executions,
    holdings,
    riskProfileKey,
    uiMode,
    watchlist,
    fetchJson,
  ]);

  // --- Engagement hook ---
  const {
    engagementState,
    setEngagementState,
    manualState,
    discipline,
    loadEngagementState,
    markDailyCheckin,
    markBoundaryKept,
    markWrapUpComplete,
    markWeeklyReviewed,
    recordExecution,
    redeemVipDay,
  } = useEngagement({
    fetchJson,
    effectiveUserId,
    market,
    assetClass,
    lang,
    effectiveHoldings: finalEffectiveHoldings,
    isDemoRuntime,
    hasLoaded,
    decisionSnapshot,
    setRefreshNonce,
    now: new Date(),
    disciplineLog,
    setDisciplineLog,
    executions,
    setExecutions,
  });

  // --- Holdings review ---
  const holdingsReview = useMemo(
    () => buildHoldingsReview({ holdings: finalEffectiveHoldings, state: finalUiData }),
    [finalEffectiveHoldings, finalUiData],
  );

  // --- AI state ---
  const aiState = useMemo(
    () => ({
      ...finalUiData,
      decision: decisionSnapshot || finalUiData.decision || null,
      user_context: {
        user_id: effectiveUserId,
        ui_mode: uiMode,
        holdings: finalEffectiveHoldings,
        holdings_review: holdingsReview,
      },
    }),
    [
      finalUiData,
      decisionSnapshot,
      effectiveUserId,
      uiMode,
      finalEffectiveHoldings,
      holdingsReview,
    ],
  );

  // --- Base context for AI ---
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
          finalUiData?.config?.runtime?.source_status ||
          'INSUFFICIENT_DATA',
        data_status:
          decisionSnapshot?.data_status ||
          finalUiData?.config?.runtime?.data_status ||
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
      finalUiData?.config?.runtime?.source_status,
      finalUiData?.config?.runtime?.data_status,
      holdingsReview,
      engagementState,
    ],
  );

  // Wrapped askAi with baseContext
  const askAi = useCallback(
    (message, context = {}) => askAiRaw(message, context, baseContext),
    [askAiRaw, baseContext],
  );

  // --- Refresh holdings sources ---
  const refreshHoldingsSources = useCallback(() => {
    setRefreshNonce((current) => current + 1);
  }, []);

  // --- Side effects ---

  // Sync showOnboarding with auth
  useEffect(() => {
    setShowOnboarding(!authSession);
  }, [authSession, setShowOnboarding]);

  // Sync market ↔ assetClass
  useEffect(() => {
    if (assetClass === 'CRYPTO' && market !== 'CRYPTO') {
      setMarket('CRYPTO');
    } else if (assetClass !== 'CRYPTO' && market !== 'US') {
      setMarket('US');
    }
  }, [assetClass, market]);

  // Suppress onboarding during demo
  useEffect(() => {
    if (investorDemoEnabled && showOnboarding) {
      setShowOnboarding(false);
    }
  }, [investorDemoEnabled, showOnboarding, setShowOnboarding]);

  // Risk profile sync
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

  // Decision snapshot
  useEffect(() => {
    if (isDemoRuntime) return undefined;
    let cancelled = false;

    void fetchJson('/api/decision/today', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: effectiveUserId,
        market,
        assetClass,
        locale: lang,
        holdings: finalEffectiveHoldings,
      }),
    })
      .then((payload) => {
        if (!cancelled) setDecisionSnapshot(payload || null);
      })
      .catch(() => {
        if (!cancelled) {
          setDecisionSnapshot((current) => current || finalUiData.decision || null);
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
    finalEffectiveHoldings,
    lang,
    finalUiData.decision,
  ]);

  // Display mode detection
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

  // Body class toggles
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

  // Browse warmup — only activates when Browse tab is shown
  useEffect(() => {
    if (typeof window === 'undefined' || activeTab !== 'browse') return undefined;
    const warmBrowse = () => {
      primeBrowseHomeBundle();
      primeBrowseUniverseBundle();
    };
    warmBrowse();
    const cancelIdle = runWhenIdle(warmBrowse);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      warmBrowse();
    }, 120000);
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
  }, [activeTab]);

  // Browse top bar reset
  useEffect(() => {
    if (activeTab !== 'browse') return;
    setBrowseTopBarState({
      canGoBack: false,
      title: tabMeta.browse.label,
      backLabel: tabMeta.browse.label,
    });
  }, [activeTab, tabMeta.browse.label]);

  // --- Rendering helpers ---

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
          signals={finalUiData.signals || []}
          loading={loading}
          analytics={finalUiData.analytics || {}}
          executions={finalUiData.trades || []}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          onQuickAsk={(_intent, signal) =>
            askAi(`请解释 ${signal?.symbol || '该信号'} 的执行逻辑和风险边界。`)
          }
          onPaperExecute={(signal) => recordExecution({ signal, mode: 'PAPER', action: 'EXECUTE' })}
          onMarkDone={(signal) => recordExecution({ signal, mode: 'PAPER', action: 'DONE' })}
          riskRules={finalUiData.config?.risk_rules || {}}
          riskStatus={finalUiData.config?.risk_status || {}}
          todayPlan={finalUiData.today || {}}
          safety={finalUiData.safety || {}}
          alphaLibrary={finalUiData.research?.alpha_registry || []}
          uiMode={uiMode}
          t={t}
          locale={locale}
        />
      );
    }

    if (section === 'weekly') {
      return (
        <WeeklyReviewTab
          research={finalUiData.research}
          today={finalUiData.today}
          safety={finalUiData.safety}
          insights={finalUiData.insights}
          signals={finalUiData.signals}
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
          performance={finalUiData.performance}
          trades={finalUiData.trades}
          research={finalUiData.research}
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
          config={finalUiData.config}
          safety={finalUiData.safety}
          research={finalUiData.research}
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
          velocity={finalUiData.velocity}
          modules={finalUiData.market_modules || []}
          insights={finalUiData.insights}
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
        <ResearchTab research={finalUiData.research} loading={loading} locale={locale} />
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
          assetClass={assetClass}
          today={finalUiData.today}
          safety={finalUiData.safety}
          insights={finalUiData.insights}
          signals={finalUiData.signals}
          topSignalEvidence={finalUiData?.evidence?.top_signals || []}
          decision={decisionSnapshot || finalUiData.decision || null}
          performance={finalUiData.performance}
          runtime={finalUiData?.config?.runtime || {}}
          trades={finalUiData?.trades || []}
          watchlist={watchlist}
          holdingsReview={holdingsReview}
          uiMode={uiMode}
          locale={locale}
          discipline={discipline}
          engagement={engagementState}
          investorDemoEnabled={investorDemoEnabled}
          brokerProfile={userProfile}
          brokerConnection={finalUiData?.config?.runtime?.connectivity?.broker || null}
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
            signals={finalUiData?.signals || []}
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
          holdings={finalEffectiveHoldings}
          setHoldings={setHoldings}
          holdingsReview={holdingsReview}
          watchlist={watchlist}
          marketInstruments={finalUiData?.layers?.data_layer?.instruments || []}
          uiMode={uiMode}
          t={t}
          locale={locale}
          investorDemoEnabled={investorDemoEnabled}
          holdingsSource={finalHoldingsSource}
          manualHoldingsCount={finalHoldingsSource?.manual_count || 0}
          canRefreshConnectedHoldings={Boolean(authSession?.userId) && !investorDemoEnabled}
          onRefreshHoldings={refreshHoldingsSources}
          onExplain={(message) => askAi(message)}
        />
      );
    }

    if (activeTab === 'my' && MY_SECTION_LIST.includes(mySection)) {
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
            clearInvestorDemo();
            handleLogout();
            setShowOnboarding(true);
          }}
          appMeta={finalUiData?.config || {}}
        />
      );
    }

    return renderMenuSection(mySection);
  };

  // --- Top bar state ---
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
          onLogin={handleLogin}
          onRequestReset={handleRequestReset}
          onResetPassword={handleResetPassword}
          onComplete={handleSignup}
        />
      </Suspense>
    </div>
  );
}

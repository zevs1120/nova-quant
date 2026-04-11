import React, { Suspense } from 'react';

export function renderMenuSection(args) {
  const {
    section,
    hasLoaded,
    loading,
    Skeleton,
    SignalsTab,
    WeeklyReviewTab,
    DisciplineTab,
    ProofTab,
    RiskTab,
    MarketTab,
    ResearchTab,
    DataStatusTab,
    LearningLoopTab,
    SettingsTab,
    market,
    setMarket,
    assetClass,
    setAssetClass,
    finalUiData,
    watchlist,
    setWatchlist,
    askAi,
    recordExecution,
    effectiveUserId,
    uiMode,
    t,
    locale,
    lang,
    discipline,
    engagementState,
    markDailyCheckin,
    markBoundaryKept,
    markWrapUpComplete,
    markWeeklyReviewed,
    investorDemoEnabled,
    investorDemoPerformance,
    data,
    fetchJson,
    setUiMode,
    riskProfileKey,
    setRiskProfileKey,
    setLang,
    isDemoRuntime,
    setShowOnboarding,
    setAboutOpen,
    loadEngagementState,
    setEngagementState,
    onActionFeedback,
  } = args;

  const signalActionMessage = (signal, kind) => {
    const symbol =
      String(signal?.symbol || '')
        .trim()
        .toUpperCase() || '--';
    const zh = String(locale || '').startsWith('zh');
    if (kind === 'paper_execute') {
      return zh ? `${symbol} 已记录为纸面执行。` : `${symbol} saved as a paper execution.`;
    }
    if (kind === 'done') {
      return zh ? `${symbol} 已标记为完成。` : `${symbol} marked done.`;
    }
    return zh ? '已保存。' : 'Saved.';
  };

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
        onPaperExecute={(signal) => {
          recordExecution({ signal, mode: 'PAPER', action: 'EXECUTE' });
          onActionFeedback?.({
            message: signalActionMessage(signal, 'paper_execute'),
            tone: 'success',
          });
        }}
        onMarkDone={(signal) => {
          recordExecution({ signal, mode: 'PAPER', action: 'DONE' });
          onActionFeedback?.({
            message: signalActionMessage(signal, 'done'),
            tone: 'success',
            haptic: 'soft',
          });
        }}
        riskRules={finalUiData.config?.risk_rules || {}}
        riskStatus={finalUiData.config?.risk_status || {}}
        todayPlan={finalUiData.today || {}}
        safety={finalUiData.safety || {}}
        alphaLibrary={finalUiData.research?.alpha_registry || []}
        effectiveUserId={effectiveUserId}
        uiMode={uiMode}
        t={t}
        locale={locale}
        onActionFeedback={onActionFeedback}
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
        investorDemoSummary={investorDemoEnabled ? investorDemoPerformance : null}
        effectiveUserId={effectiveUserId}
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
        locale={locale}
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
    return <DataStatusTab data={data} fetchJson={fetchJson} effectiveUserId={effectiveUserId} />;
  }

  if (section === 'learning') {
    return (
      <LearningLoopTab
        data={data}
        locale={locale}
        fetchJson={fetchJson}
        effectiveUserId={effectiveUserId}
      />
    );
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
        onActionFeedback={onActionFeedback}
      />
    );
  }

  return null;
}

export function renderActiveScreen(args) {
  const {
    activeTab,
    mySection,
    mySectionList,
    authSession,
    showOnboarding,
    showFirstRunSetup,
    firstRunSetupState,
    TodayTab,
    AiPage,
    BrowseTab,
    WatchlistTab,
    MenuTab,
    browseFallback,
    locale,
    assetClass,
    finalUiData,
    decisionSnapshot,
    watchlist,
    watchlistMeta,
    holdingsReview,
    uiMode,
    discipline,
    engagementState,
    investorDemoEnabled,
    userProfile,
    markDailyCheckin,
    markBoundaryKept,
    setActiveTab,
    setMyStack,
    askAi,
    openMySection,
    updateWatchlistSymbol,
    recordExecution,
    effectiveUserId,
    membership,
    handleCompleteTodayGuide,
    aiState,
    aiSeedRequest,
    navigateFromAi,
    baseContext,
    requestAiAccessFromComposer,
    browseSignals,
    setWatchlist,
    browseBackToken,
    onBrowseTopBarStateChange,
    chatUserId,
    canUseInvestorDemo,
    clearInvestorDemo,
    handleLogout,
    setShowOnboarding,
    enableInvestorDemo,
    manualState,
    pushMySection,
    redeemVipDay,
    claimManualReferral,
    submitManualPrediction,
    setAboutOpen,
    billing,
    openCheckoutFromMembershipCenter,
    marketInstruments,
    renderMenuSectionArgs,
    onActionFeedback,
  } = args;

  if (activeTab === 'today') {
    const showTodayGuide =
      Boolean(authSession?.userId) &&
      !showOnboarding &&
      !showFirstRunSetup &&
      !firstRunSetupState?.tutorialCompletedAt;
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
          setMyStack(['watchlist']);
        }}
        onAskAi={askAi}
        onOpenWeekly={() => openMySection('weekly')}
        onOpenSignals={() => openMySection('signals')}
        onToggleWatchlist={(symbol, options) =>
          updateWatchlistSymbol(symbol, {
            source: 'today',
            ...(options || {}),
          })
        }
        onPaperExecute={(signal) => recordExecution({ signal, mode: 'PAPER', action: 'EXECUTE' })}
        effectiveUserId={effectiveUserId}
        membershipPlan={membership.currentPlan}
        onOpenMembershipPrompt={membership.openPrompt}
        showUsageGuide={showTodayGuide}
        onCompleteUsageGuide={handleCompleteTodayGuide}
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
        watchlist={watchlist}
        onToggleWatchlist={(symbol, options) =>
          updateWatchlistSymbol(symbol, {
            source: 'custom',
            ...(options || {}),
          })
        }
        membershipPlan={membership.currentPlan}
        remainingAskNova={membership.remainingAskNova}
        onRequestAiAccess={requestAiAccessFromComposer}
      />
    );
  }

  if (activeTab === 'browse') {
    return (
      <Suspense fallback={browseFallback}>
        <BrowseTab
          locale={locale}
          signals={browseSignals}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          onToggleWatchlist={(symbol, options) =>
            updateWatchlistSymbol(symbol, {
              source: 'custom',
              ...(options || {}),
            })
          }
          topBarBackToken={browseBackToken}
          onTopBarStateChange={onBrowseTopBarStateChange}
        />
      </Suspense>
    );
  }

  if (activeTab === 'my' && mySection === 'watchlist') {
    return (
      <WatchlistTab
        watchlist={watchlist}
        watchlistMeta={watchlistMeta}
        signals={finalUiData?.signals || []}
        marketInstruments={marketInstruments}
        locale={locale}
        onAskAi={(message, context = {}) => askAi(message, context)}
        onToggleWatchlist={updateWatchlistSymbol}
        onOpenMenu={() => openMySection('menu')}
      />
    );
  }

  if (activeTab === 'my' && mySectionList.includes(mySection)) {
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
        showDemoEntry={canUseInvestorDemo}
        demoEnabled={investorDemoEnabled}
        onToggleDemo={() => {
          if (!canUseInvestorDemo) return;
          if (investorDemoEnabled) {
            clearInvestorDemo();
            return;
          }
          enableInvestorDemo();
        }}
        onRedeemVip={redeemVipDay}
        onClaimReferral={claimManualReferral}
        onSubmitPrediction={submitManualPrediction}
        onOpenAbout={() => setAboutOpen(true)}
        onLogout={() => {
          clearInvestorDemo();
          handleLogout();
          setShowOnboarding(true);
        }}
        appMeta={finalUiData?.config || {}}
        membershipPlan={membership.currentPlan}
        remainingAskNova={membership.remainingAskNova}
        membershipLimits={membership.limits}
        billingState={billing.billingState}
        onSelectMembershipPlan={openCheckoutFromMembershipCenter}
        onOpenBillingPortal={billing.openPortal}
        onActionFeedback={onActionFeedback}
      />
    );
  }

  return renderMenuSection(renderMenuSectionArgs);
}

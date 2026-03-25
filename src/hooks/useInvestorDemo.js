import { useCallback, useMemo, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import {
  buildInvestorDemoEnvironment,
  INVESTOR_DEMO_HOLDINGS,
  INVESTOR_DEMO_PERFORMANCE,
} from '../demo/investorDemo';
import {
  deriveConnectedHoldings,
  mergeHoldingsSources,
  summarizeHoldingsSource,
} from '../utils/holdingsSource';

/**
 * Handles investor demo mode toggle, demo data overlays, holdings source
 * composition, and connected holdings derivation.
 */
export function useInvestorDemo({
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
}) {
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
  const [showOnboarding, setShowOnboarding] = useState(!authSession);

  const investorDemoEnvironment = useMemo(
    () => (investorDemoEnabled ? buildInvestorDemoEnvironment(assetClass) : null),
    [investorDemoEnabled, assetClass],
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

  const enableInvestorDemo = useCallback(() => {
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
  }, [
    assetClass,
    executions,
    holdings,
    investorDemoEnabled,
    market,
    setActiveTab,
    setAssetClass,
    setHoldings,
    setInvestorDemoEnabled,
    setInvestorDemoHoldingsBackup,
    setInvestorDemoUiBackup,
    setMarket,
    setMyStack,
    setOnboardingDone,
    watchlist,
  ]);

  const clearInvestorDemo = useCallback(() => {
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
  }, [
    investorDemoHoldingsBackup,
    investorDemoUiBackup,
    setAssetClass,
    setExecutions,
    setHoldings,
    setInvestorDemoEnabled,
    setInvestorDemoHoldingsBackup,
    setInvestorDemoUiBackup,
    setMarket,
    setWatchlist,
  ]);

  return {
    investorDemoEnabled,
    showOnboarding,
    setShowOnboarding,
    uiData,
    connectedHoldings,
    holdingsSource,
    effectiveHoldings,
    enableInvestorDemo,
    clearInvestorDemo,
  };
}

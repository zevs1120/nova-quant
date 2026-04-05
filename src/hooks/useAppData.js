import { useEffect, useMemo, useState } from 'react';
import { initialData } from '../config/appConstants';
import { mapExecutionToTrade, runWhenIdle } from '../utils/appHelpers';
import { runQuantPipeline } from '../engines/pipeline';
import { FORCE_DEMO_BUILD } from '../demo/runtime';

const APP_DATA_CACHE_TTL_MS = 90_000;
const APP_DATA_CACHE_PREFIX = 'nova-app-data-cache:v2';
const APP_DATA_REFRESH_MS = 300_000;
const appDataMemoryCache = new Map();

function buildAppDataCacheKey({ userId, market, assetClass }) {
  return `${userId || 'guest-default'}:${market || 'US'}:${assetClass || 'US_STOCK'}`;
}

function readAppDataSnapshot(cacheKey) {
  const now = Date.now();
  const memory = appDataMemoryCache.get(cacheKey);
  if (memory && memory.savedAt + APP_DATA_CACHE_TTL_MS >= now) {
    return memory;
  }

  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${APP_DATA_CACHE_PREFIX}:${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.savedAt + APP_DATA_CACHE_TTL_MS < now) return null;
    appDataMemoryCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeAppDataSnapshot(cacheKey, snapshot) {
  const payload = {
    savedAt: Date.now(),
    ...snapshot,
  };
  appDataMemoryCache.set(cacheKey, payload);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${APP_DATA_CACHE_PREFIX}:${cacheKey}`, JSON.stringify(payload));
  } catch {}
}

function updateCachedAppData(cacheKey, rawData, updater) {
  return (current) => {
    const nextData = updater(current);
    writeAppDataSnapshot(cacheKey, {
      data: nextData,
      rawData,
    });
    return nextData;
  };
}

function readRuntimeApiCheck(runtime, runtimeData, key) {
  const explicitValue = runtimeData?.config?.runtime?.api_checks?.[key];
  if (explicitValue !== undefined && explicitValue !== null) return explicitValue;

  const freshnessSummary = runtime?.data_transparency?.freshness_summary || {};
  const coverageSummary = runtime?.data_transparency?.coverage_summary || {};

  if (key === 'signal_count') {
    return freshnessSummary.signal_count ?? coverageSummary.generated_signals ?? null;
  }
  if (key === 'market_state_count') {
    return freshnessSummary.market_state_count ?? coverageSummary.market_state_count ?? null;
  }
  if (key === 'modules_count') {
    return Array.isArray(runtimeData?.market_modules) ? runtimeData.market_modules.length : null;
  }
  if (key === 'performance_records') {
    if (Array.isArray(runtimeData?.performance?.records)) {
      return runtimeData.performance.records.length;
    }
    return (
      freshnessSummary.performance_snapshot_count ??
      coverageSummary.performance_snapshot_count ??
      null
    );
  }
  return null;
}

function readRuntimeHydrationPlan(runtimeData) {
  const hydration = runtimeData?.config?.runtime?.hydration;
  return hydration && typeof hydration === 'object' ? hydration : {};
}

function buildDeferredRuntimePlan({ runtime, runtimeData, authSession }) {
  const runtimeSignals = Array.isArray(runtimeData?.signals) ? runtimeData.signals : [];
  const runtimeSignalCount =
    readRuntimeApiCheck(runtime, runtimeData, 'signal_count') ?? runtimeSignals.length;
  const hydration = readRuntimeHydrationPlan(runtimeData);
  const connectivity = runtimeData?.config?.runtime?.connectivity || {};
  const brokerReady = connectivity?.broker !== undefined && connectivity?.broker !== null;
  const exchangeReady = connectivity?.exchange !== undefined && connectivity?.exchange !== null;

  return {
    hydrateEvidence:
      hydration.evidence_included === false || !Array.isArray(runtimeData?.evidence?.top_signals),
    hydrateConnectivity:
      Boolean(authSession) &&
      !Boolean(hydration.connectivity_included) &&
      (!brokerReady || !exchangeReady),
    refreshSignals:
      hydration.signals_truncated === true ||
      Number(runtimeSignalCount || 0) > runtimeSignals.length,
  };
}

function normalizeEvidencePayload(payload) {
  if (!payload) return null;
  return {
    top_signals: Array.isArray(payload?.records) ? payload.records : [],
    source_status: payload?.source_status || 'INSUFFICIENT_DATA',
    data_status: payload?.data_status || 'INSUFFICIENT_DATA',
    asof: payload?.asof || null,
    supporting_run_id: payload?.supporting_run_id || null,
    dataset_version_id: payload?.dataset_version_id || null,
    strategy_version_id: payload?.strategy_version_id || null,
  };
}

function mergeRuntimeSnapshot(current, runtime, runtimeData) {
  const runtimeSignals = Array.isArray(runtimeData.signals) ? runtimeData.signals : [];
  const runtimeSignalCount =
    readRuntimeApiCheck(runtime, runtimeData, 'signal_count') ?? runtimeSignals.length;
  const runtimeMarketStateCount = readRuntimeApiCheck(runtime, runtimeData, 'market_state_count');
  const runtimeModulesCount = readRuntimeApiCheck(runtime, runtimeData, 'modules_count');
  const runtimePerformanceRecords = readRuntimeApiCheck(
    runtime,
    runtimeData,
    'performance_records',
  );
  const currentSignals = Array.isArray(current?.signals) ? current.signals : [];

  return {
    ...runtimeData,
    decision: runtimeData.decision || null,
    signals: runtimeSignals.length ? runtimeSignals : currentSignals,
    evidence: runtimeData.evidence || current?.evidence || null,
    market_modules: runtimeData.market_modules || current?.market_modules || [],
    performance: runtimeData.performance || current?.performance || initialData.performance,
    control_plane: runtimeData.control_plane || current?.control_plane || null,
    config: {
      ...(runtimeData.config || {}),
      last_updated:
        runtime?.data_transparency?.as_of ||
        runtime?.asof ||
        runtimeData.config?.last_updated ||
        current?.config?.last_updated ||
        new Date().toISOString(),
      source_label:
        runtimeData.config?.source_label ||
        runtime?.source_status ||
        current?.config?.source_label ||
        'INSUFFICIENT_DATA',
      data_status:
        runtimeData.config?.data_status ||
        runtime?.data_status ||
        current?.config?.data_status ||
        'INSUFFICIENT_DATA',
      runtime: {
        ...(current?.config?.runtime || {}),
        ...(runtimeData.config?.runtime || {}),
        source_status: runtime?.source_status || 'INSUFFICIENT_DATA',
        freshness_summary:
          runtime?.data_transparency?.freshness_summary ||
          runtimeData.config?.runtime?.freshness_summary ||
          current?.config?.runtime?.freshness_summary ||
          null,
        coverage_summary:
          runtime?.data_transparency?.coverage_summary ||
          runtimeData.config?.runtime?.coverage_summary ||
          current?.config?.runtime?.coverage_summary ||
          null,
        api_checks: {
          ...(current?.config?.runtime?.api_checks || {}),
          ...(runtimeData.config?.runtime?.api_checks || {}),
          signal_count:
            runtimeSignalCount ?? current?.config?.runtime?.api_checks?.signal_count ?? null,
          market_state_count:
            runtimeMarketStateCount ??
            current?.config?.runtime?.api_checks?.market_state_count ??
            null,
          modules_count:
            runtimeModulesCount ?? current?.config?.runtime?.api_checks?.modules_count ?? null,
          performance_records:
            runtimePerformanceRecords ??
            current?.config?.runtime?.api_checks?.performance_records ??
            null,
        },
      },
    },
  };
}

/**
 * Handles primary data loading from the API, periodic refresh, and the
 * FORCE_DEMO_BUILD local-pipeline fallback.
 */
export function useAppData({
  fetchJson,
  assetClass,
  market,
  effectiveUserId,
  authSession,
  riskProfileKey,
  executions,
  refreshNonce,
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(initialData);
  const [rawData, setRawData] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    let activeLoadId = 0;
    let cancelDeferredRuntimeFill = () => {};
    const cacheKey = buildAppDataCacheKey({
      userId: effectiveUserId,
      market,
      assetClass,
    });
    const cachedSnapshot = readAppDataSnapshot(cacheKey);

    if (cachedSnapshot?.data) {
      setData(cachedSnapshot.data);
      setRawData(cachedSnapshot.rawData || null);
      setHasLoaded(true);
      setLoading(false);
    }

    async function load({ silent = false } = {}) {
      const loadId = activeLoadId + 1;
      activeLoadId = loadId;
      cancelDeferredRuntimeFill();
      if (!silent && !cachedSnapshot?.data) setLoading(true);
      try {
        if (FORCE_DEMO_BUILD) {
          await new Promise((resolve) => setTimeout(resolve, 280));
          if (!mounted || loadId !== activeLoadId) return;
          setRawData({ as_of: new Date().toISOString() });
          setHasLoaded(true);
          return;
        }

        const query = new URLSearchParams({
          userId: effectiveUserId,
          market,
          assetClass,
        });

        const runtime = await fetchJson(`/api/runtime-state?${query.toString()}`).catch(() => null);

        if (!mounted || loadId !== activeLoadId) return;

        const nextRawData = runtime
          ? {
              as_of: runtime?.asof || new Date().toISOString(),
              source_status: runtime?.source_status || 'INSUFFICIENT_DATA',
            }
          : cachedSnapshot?.rawData || null;

        if (runtime?.data) {
          const runtimeData = runtime.data || initialData;
          setData(
            updateCachedAppData(cacheKey, nextRawData, (current) =>
              mergeRuntimeSnapshot(current, runtime, runtimeData),
            ),
          );
          setRawData(nextRawData);
        } else if (!cachedSnapshot?.data) {
          setData(initialData);
          setRawData(null);
        }

        setHasLoaded(true);

        if (runtime?.data) {
          const runtimeData = runtime.data || initialData;
          const deferredPlan = buildDeferredRuntimePlan({
            runtime,
            runtimeData,
            authSession,
          });

          if (
            deferredPlan.hydrateEvidence ||
            deferredPlan.hydrateConnectivity ||
            deferredPlan.refreshSignals
          ) {
            cancelDeferredRuntimeFill = runWhenIdle(() => {
              void Promise.all([
                deferredPlan.hydrateEvidence
                  ? fetchJson(`/api/evidence/signals/top?${query.toString()}&limit=3`).catch(
                      () => null,
                    )
                  : Promise.resolve(null),
                deferredPlan.hydrateConnectivity
                  ? fetchJson(
                      `/api/connect/broker?userId=${effectiveUserId}&provider=ALPACA`,
                    ).catch(() => null)
                  : Promise.resolve(null),
                deferredPlan.hydrateConnectivity
                  ? fetchJson(
                      `/api/connect/exchange?userId=${effectiveUserId}&provider=BINANCE`,
                    ).catch(() => null)
                  : Promise.resolve(null),
                deferredPlan.refreshSignals
                  ? fetchJson(`/api/signals?${query.toString()}&limit=60`).catch(() => null)
                  : Promise.resolve(null),
              ]).then(([evidenceTopSignals, brokerConnection, exchangeConnection, signals]) => {
                if (!mounted || loadId !== activeLoadId) return;
                const evidenceData = normalizeEvidencePayload(evidenceTopSignals);
                setData(
                  updateCachedAppData(cacheKey, nextRawData, (current) => {
                    const currentSignals = Array.isArray(current?.signals) ? current.signals : [];
                    const apiSignals = Array.isArray(signals?.data) ? signals.data : null;
                    const nextSignals = apiSignals?.length ? apiSignals : currentSignals;
                    const nextSignalCount =
                      signals?.count ?? current?.config?.runtime?.api_checks?.signal_count ?? null;

                    return {
                      ...current,
                      evidence: evidenceData || current?.evidence || null,
                      signals: deferredPlan.refreshSignals ? nextSignals : currentSignals,
                      config: {
                        ...(current?.config || {}),
                        runtime: {
                          ...(current?.config?.runtime || {}),
                          api_checks: {
                            ...(current?.config?.runtime?.api_checks || {}),
                            signal_count: nextSignalCount,
                          },
                          connectivity: {
                            ...(current?.config?.runtime?.connectivity || {}),
                            broker:
                              brokerConnection?.snapshot ||
                              current?.config?.runtime?.connectivity?.broker ||
                              null,
                            exchange:
                              exchangeConnection?.snapshot ||
                              current?.config?.runtime?.connectivity?.exchange ||
                              null,
                          },
                          hydration: {
                            ...(current?.config?.runtime?.hydration || {}),
                            evidence_included:
                              evidenceData !== null ||
                              current?.config?.runtime?.hydration?.evidence_included ||
                              false,
                            signals_included: deferredPlan.refreshSignals
                              ? nextSignals.length
                              : current?.config?.runtime?.hydration?.signals_included || 0,
                            signal_count:
                              nextSignalCount ??
                              current?.config?.runtime?.hydration?.signal_count ??
                              0,
                            signals_truncated: false,
                            connectivity_included:
                              !deferredPlan.hydrateConnectivity ||
                              Boolean(brokerConnection?.snapshot || exchangeConnection?.snapshot),
                          },
                        },
                      },
                    };
                  }),
                );
              });
            });
          }
        }
      } catch {
        if (!mounted || loadId !== activeLoadId) return;
        if (!cachedSnapshot?.data) {
          setData(initialData);
          setRawData(null);
        }
        setHasLoaded(true);
      } finally {
        if (mounted && loadId === activeLoadId && !silent) setLoading(false);
      }
    }

    if (cachedSnapshot?.data) {
      void load({ silent: true });
    } else {
      void load();
    }
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void load({ silent: true });
    };
    const refresh = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void load({ silent: true });
    }, APP_DATA_REFRESH_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      mounted = false;
      activeLoadId += 1;
      cancelDeferredRuntimeFill();
      clearInterval(refresh);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [assetClass, market, effectiveUserId, refreshNonce, authSession, fetchJson]);

  // FORCE_DEMO_BUILD local pipeline
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

  const lastUpdated = useMemo(() => {
    return (
      data.config?.last_updated ||
      data.performance?.last_updated ||
      data.velocity?.last_updated ||
      null
    );
  }, [data]);

  const modelVersion = useMemo(() => {
    const pipelineVersion = data.config?.calc_meta?.pipeline_version;
    if (pipelineVersion) return `NQ ${pipelineVersion}`;
    return 'NQ v1.0.0';
  }, [data.config]);

  return {
    loading,
    data,
    rawData,
    hasLoaded,
    lastUpdated,
    modelVersion,
  };
}

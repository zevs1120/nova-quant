import { useEffect, useMemo, useState } from 'react';
import { initialData } from '../config/appConstants';
import { mapExecutionToTrade, settledValue } from '../utils/appHelpers';
import { runQuantPipeline } from '../engines/pipeline';
import { FORCE_DEMO_BUILD } from '../demo/runtime';

const APP_DATA_CACHE_TTL_MS = 90_000;
const APP_DATA_CACHE_PREFIX = 'nova-app-data-cache:v2';
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
          const runtimeSignals = Array.isArray(runtimeData.signals) ? runtimeData.signals : [];
          const runtimeSignalCount =
            runtimeData?.config?.runtime?.api_checks?.signal_count ?? runtimeSignals.length ?? null;

          setData((current) => {
            const currentSignals = Array.isArray(current?.signals) ? current.signals : [];
            const nextData = {
              ...runtimeData,
              decision: runtimeData.decision || null,
              signals: runtimeSignals.length ? runtimeSignals : currentSignals,
              evidence: runtimeData.evidence || current?.evidence || null,
              market_modules: runtimeData.market_modules || current?.market_modules || [],
              performance:
                runtimeData.performance || current?.performance || initialData.performance,
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
                      runtimeSignalCount ??
                      current?.config?.runtime?.api_checks?.signal_count ??
                      null,
                  },
                },
              },
            };
            writeAppDataSnapshot(cacheKey, {
              data: nextData,
              rawData: nextRawData,
            });
            return nextData;
          });
          setRawData(nextRawData);
        } else if (!cachedSnapshot?.data) {
          setData(initialData);
          setRawData(null);
        }

        setHasLoaded(true);

        const controlPlaneRequest = Promise.resolve(null);

        void Promise.allSettled([
          fetchJson(`/api/assets?market=${market}`),
          fetchJson(`/api/evidence/signals/top?${query.toString()}&limit=3`).catch(() => null),
          fetchJson(`/api/market-state?${query.toString()}`),
          fetchJson(`/api/performance?${query.toString()}`),
          fetchJson(`/api/market/modules?${query.toString()}`),
          fetchJson(`/api/risk-profile?userId=${effectiveUserId}`),
          controlPlaneRequest,
          authSession
            ? fetchJson(`/api/connect/broker?userId=${effectiveUserId}&provider=ALPACA`)
            : Promise.resolve(null),
          authSession
            ? fetchJson(`/api/connect/exchange?userId=${effectiveUserId}&provider=BINANCE`)
            : Promise.resolve(null),
        ]).then(
          ([
            assetsResult,
            evidenceTopSignalsResult,
            marketStateResult,
            performanceResult,
            modulesResult,
            riskProfileResult,
            controlPlaneResult,
            brokerConnectionResult,
            exchangeConnectionResult,
          ]) => {
            if (!mounted || loadId !== activeLoadId) return;

            const assets = settledValue(assetsResult, null);
            const evidenceTopSignals = settledValue(evidenceTopSignalsResult, null);
            const marketState = settledValue(marketStateResult, null);
            const performance = settledValue(performanceResult, null);
            const modules = settledValue(modulesResult, null);
            const riskProfile = settledValue(riskProfileResult, null);
            const controlPlane = settledValue(controlPlaneResult, null);
            const brokerConnection = settledValue(brokerConnectionResult, null);
            const exchangeConnection = settledValue(exchangeConnectionResult, null);
            const evidenceData = {
              top_signals: Array.isArray(evidenceTopSignals?.records)
                ? evidenceTopSignals.records
                : [],
              source_status: evidenceTopSignals?.source_status || 'INSUFFICIENT_DATA',
              data_status: evidenceTopSignals?.data_status || 'INSUFFICIENT_DATA',
              asof: evidenceTopSignals?.asof || null,
              supporting_run_id: evidenceTopSignals?.supporting_run_id || null,
              dataset_version_id: evidenceTopSignals?.dataset_version_id || null,
              strategy_version_id: evidenceTopSignals?.strategy_version_id || null,
            };

            setData((current) => {
              const nextData = {
                ...current,
                evidence: evidenceTopSignals ? evidenceData : current?.evidence || evidenceData,
                market_modules: Array.isArray(modules?.data)
                  ? modules.data
                  : current?.market_modules || [],
                performance: performance || current?.performance || initialData.performance,
                control_plane: controlPlane || current?.control_plane || null,
                config: {
                  ...(current?.config || {}),
                  runtime: {
                    ...(current?.config?.runtime || {}),
                    api_checks: {
                      ...(current?.config?.runtime?.api_checks || {}),
                      assets_count:
                        assets?.count ?? current?.config?.runtime?.api_checks?.assets_count ?? null,
                      signal_count: current?.config?.runtime?.api_checks?.signal_count ?? null,
                      market_state_count:
                        marketState?.count ??
                        current?.config?.runtime?.api_checks?.market_state_count ??
                        null,
                      modules_count:
                        modules?.count ??
                        current?.config?.runtime?.api_checks?.modules_count ??
                        null,
                      performance_records:
                        performance?.records?.length ??
                        current?.config?.runtime?.api_checks?.performance_records ??
                        null,
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
                    control_plane: controlPlane || current?.config?.runtime?.control_plane || null,
                  },
                  risk_rules: {
                    ...(current?.config?.risk_rules || {}),
                    per_trade_risk_pct:
                      riskProfile?.data?.max_loss_per_trade ??
                      current?.config?.risk_rules?.per_trade_risk_pct ??
                      null,
                    daily_loss_pct:
                      riskProfile?.data?.max_daily_loss ??
                      current?.config?.risk_rules?.daily_loss_pct ??
                      null,
                    max_dd_pct:
                      riskProfile?.data?.max_drawdown ??
                      current?.config?.risk_rules?.max_dd_pct ??
                      null,
                    exposure_cap_pct:
                      riskProfile?.data?.exposure_cap ??
                      current?.config?.risk_rules?.exposure_cap_pct ??
                      null,
                  },
                },
              };
              writeAppDataSnapshot(cacheKey, {
                data: nextData,
                rawData: nextRawData,
              });
              return nextData;
            });
          },
        );

        void fetchJson(`/api/signals?${query.toString()}&limit=60`)
          .catch(() => null)
          .then((signals) => {
            if (!mounted || loadId !== activeLoadId || !signals) return;
            const apiSignals = Array.isArray(signals?.data) ? signals.data : null;
            setData((current) => {
              const currentSignals = Array.isArray(current?.signals) ? current.signals : [];
              const nextSignals = apiSignals?.length ? apiSignals : currentSignals;
              const nextSignalCount =
                signals?.count ?? current?.config?.runtime?.api_checks?.signal_count ?? null;
              const nextData = {
                ...current,
                signals: nextSignals,
                config: {
                  ...(current?.config || {}),
                  runtime: {
                    ...(current?.config?.runtime || {}),
                    api_checks: {
                      ...(current?.config?.runtime?.api_checks || {}),
                      signal_count: nextSignalCount,
                    },
                  },
                },
              };
              writeAppDataSnapshot(cacheKey, {
                data: nextData,
                rawData: nextRawData,
              });
              return nextData;
            });
          });
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
    const refresh = setInterval(() => load({ silent: true }), 120000);

    return () => {
      mounted = false;
      activeLoadId += 1;
      clearInterval(refresh);
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

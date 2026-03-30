import { useCallback, useEffect, useMemo, useState } from 'react';
import { initialData } from '../config/appConstants';
import { mapExecutionToTrade, settledValue } from '../utils/appHelpers';
import { runQuantPipeline } from '../engines/pipeline';
import { FORCE_DEMO_BUILD } from '../demo/runtime';

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

        const controlPlaneRequest = silent
          ? Promise.resolve(null)
          : fetchJson(`/api/control-plane/status?userId=${effectiveUserId}`).catch(() => null);

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
          controlPlaneRequest,
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

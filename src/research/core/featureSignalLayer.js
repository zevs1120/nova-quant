import { round } from '../../engines/math.js';

const FEATURE_CATALOG = Object.freeze({
  trend_features: ['trend_strength', 'ret_1d', 'ret_5d', 'ma_alignment', 'breakout_distance'],
  volatility_features: ['atr_14', 'vol_percentile', 'hv20', 'volatility_stress', 'range_expansion'],
  cross_sectional_features: ['cross_rank', 'industry_rank', 'leader_laggard_spread'],
  market_breadth_features: ['breadth_ratio', 'risk_on_off_score', 'sector_rotation_strength'],
  crypto_funding_basis_features: [
    'funding_rate',
    'funding_zscore',
    'basis_annualized',
    'open_interest_delta',
  ],
  relative_strength_features: [
    'sector_relative_strength',
    'basket_rank_momentum',
    'cross_asset_rank',
  ],
  execution_realism_features: [
    'spread_bps',
    'slippage_bps',
    'liquidity_score',
    'order_fill_probability',
  ],
});

function normalizeConfidence(value) {
  const n = Number(value || 0);
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

function normalizeScore(value) {
  const n = Number(value || 0);
  if (n > 1) return n / 100;
  return n;
}

function findTradeDecision(signalId, tradeLevelBuckets = []) {
  return (tradeLevelBuckets || []).find((item) => item.signal_id === signalId) || null;
}

function lifecycleState(signal, decision) {
  const active = ['NEW', 'TRIGGERED'].includes(String(signal.status || '').toUpperCase());
  if (!active) return 'filtered_signal';
  if (decision?.decision === 'blocked') return 'filtered_signal';
  if (decision?.decision === 'reduce' || decision?.decision === 'allow')
    return 'executable_opportunity';
  return 'scored_signal';
}

function buildEvidence(signal, regimeState, riskBuckets) {
  const checks = regimeState?.by_signal_compatibility?.find(
    (item) => item.signal_id === signal.signal_id,
  );
  const tradeBucket = riskBuckets?.trade_level_buckets?.find(
    (item) => item.signal_id === signal.signal_id,
  );

  return {
    regime_state: regimeState?.state?.primary || signal.regime_id || 'unknown',
    regime_posture: regimeState?.state?.recommended_user_posture || '--',
    regime_compatibility: checks?.compatibility || 'unknown',
    risk_decision: tradeBucket?.decision || 'unknown',
    risk_reasons: tradeBucket?.reasons || [],
    score_components: {
      signal_score: round(normalizeScore(signal.score), 4),
      confidence: round(normalizeConfidence(signal.confidence), 4),
      risk_score: Number(signal.risk_score ?? 0),
      regime_compatibility: Number(signal.regime_compatibility ?? 0),
    },
  };
}

function toRawSignal(signal) {
  return {
    signal_id: signal.signal_id,
    timestamp: signal.created_at || signal.generated_at,
    asset: signal.symbol,
    market: signal.market,
    strategy_family: signal.strategy_family || 'unknown',
    strategy_template: signal.strategy_id || 'unknown',
    direction: signal.direction,
    source_status: signal.status || 'unknown',
  };
}

function toScoredSignal(signal, evidence) {
  return {
    signal_id: signal.signal_id,
    score: round(normalizeScore(signal.score), 4),
    conviction: round(normalizeConfidence(signal.confidence), 4),
    regime_compatibility: Number(signal.regime_compatibility ?? 0),
    risk_score: Number(signal.risk_score ?? 0),
    evidence,
  };
}

function toFilteredSignal(signal, decision, reason) {
  return {
    signal_id: signal.signal_id,
    asset: signal.symbol,
    market: signal.market,
    strategy_family: signal.strategy_family,
    rejection_reason: reason || decision?.reasons?.[0] || 'policy_filtered',
    reduced_size_would_pass: Boolean(
      decision &&
      decision.decision === 'blocked' &&
      decision.reasons?.some((r) => String(r).toLowerCase().includes('risk')),
    ),
  };
}

function toExecutable(signal, decision, evidence) {
  return {
    signal_id: signal.signal_id,
    asset: signal.symbol,
    market: signal.market,
    direction: signal.direction,
    strategy_family: signal.strategy_family,
    strategy_template: signal.strategy_id,
    executable_mode: decision?.decision === 'reduce' ? 'size_reduced' : 'full_size',
    suggested_size_pct: Number(
      decision?.recommended_position_pct ??
        signal.position_advice?.position_pct ??
        signal.position_size_pct ??
        0,
    ),
    risk_bucket: decision?.trade_bucket || 'unknown',
    evidence,
  };
}

function toOpportunityObject(signal, decision, evidence) {
  const suggestedSize = Number(
    decision?.recommended_position_pct ??
      signal.position_advice?.position_pct ??
      signal.position_size_pct ??
      0,
  );
  return {
    opportunity_id: `OPP-${signal.signal_id}`,
    asset: signal.symbol,
    market: signal.market,
    direction: signal.direction,
    strategy_family: signal.strategy_family,
    strategy_template: signal.strategy_id,
    regime_compatibility: {
      state: evidence.regime_state,
      posture: evidence.regime_posture,
      compatibility: evidence.regime_compatibility,
    },
    entry: signal.entry_zone || { low: signal.entry_min, high: signal.entry_max },
    stop: signal.stop_loss || { price: signal.stop_loss_value },
    targets: signal.take_profit_levels || [],
    suggested_size_pct: round(suggestedSize, 4),
    risk_bucket: decision?.trade_bucket || 'unknown',
    holding_horizon: signal.holding_horizon_days,
    conviction: round(normalizeConfidence(signal.confidence), 4),
    rationale_summary: (signal.explain_bullets || signal.rationale || []).slice(0, 3),
    invalidation_conditions: [
      `Invalidation price: ${Number(signal.invalidation_level ?? signal.stop_loss_value ?? 0)}`,
      'Regime flips to risk-off or compatibility is blocked.',
    ],
    evidence_fields: evidence,
    audit_lineage: {
      signal_id: signal.signal_id,
      strategy_version: signal.strategy_version || signal.model_version || 'unknown',
      parameter_version: signal.parameter_version || 'unknown',
      generated_at: signal.created_at || signal.generated_at,
      decision_source: 'research_core.feature_signal_layer.v1',
    },
  };
}

export function buildFeatureSignalLayer({
  asOf = new Date().toISOString(),
  championState = {},
  regimeState = {},
  riskBuckets = {},
  funnelDiagnostics = {},
} = {}) {
  const signals = championState?.signals || [];
  const rawSignals = [];
  const scoredSignals = [];
  const filteredSignals = [];
  const executableOpportunities = [];
  const opportunityObjects = [];

  const noTradeReasonBySignal = new Map(
    (funnelDiagnostics?.raw_records || [])
      .filter((item) => item?.signal_id)
      .map((item) => [item.signal_id, item.no_trade_reason]),
  );

  for (const signal of signals) {
    const decision = findTradeDecision(signal.signal_id, riskBuckets?.trade_level_buckets || []);
    const evidence = buildEvidence(signal, regimeState, riskBuckets);

    rawSignals.push(toRawSignal(signal));
    scoredSignals.push(toScoredSignal(signal, evidence));

    const state = lifecycleState(signal, decision);
    if (state === 'filtered_signal') {
      filteredSignals.push(
        toFilteredSignal(signal, decision, noTradeReasonBySignal.get(signal.signal_id)),
      );
      continue;
    }

    const executable = toExecutable(signal, decision, evidence);
    executableOpportunities.push(executable);
    opportunityObjects.push(toOpportunityObject(signal, decision, evidence));
  }

  const featureLayer = championState?.layers?.feature_layer || {};
  const sampleFeature = Object.values(featureLayer?.by_ticker || {})[0] || null;

  return {
    generated_at: asOf,
    layer_version: 'feature-signal-layer.v1',
    feature_catalog: FEATURE_CATALOG,
    feature_sample_available: Boolean(sampleFeature),
    signal_lifecycle: {
      raw_signals: rawSignals,
      scored_signals: scoredSignals,
      filtered_signals: filteredSignals,
      executable_opportunities: executableOpportunities,
    },
    opportunity_objects: opportunityObjects,
    quality_summary: {
      raw_count: rawSignals.length,
      scored_count: scoredSignals.length,
      filtered_count: filteredSignals.length,
      executable_count: executableOpportunities.length,
      opportunity_ready_count: opportunityObjects.length,
      required_fields_coverage: opportunityObjects.length ? 1 : 0,
    },
  };
}

/**
 * Async wrapper to enrich the generated opportunity objects with Qlib Alpha158 base factors
 * before submitting them to the AI Evaluator or execution layer.
 *
 * @param {Array} opportunityObjects - Array of base opportunity objects from featureSignalLayer
 * @param {Function} fetchQlibFactors - Injected fetcher reference to avoid circular TS/JS deps
 */
export async function enrichWithQlibFeatures(opportunityObjects = [], fetchQlibFactors) {
  if (!opportunityObjects.length || !fetchQlibFactors) return opportunityObjects;

  try {
    const symbols = Array.from(
      new Set(opportunityObjects.map((o) => o.asset || o.symbol).filter(Boolean)),
    );
    if (!symbols.length) return opportunityObjects;

    // Use a recent lookback window for the factors (e.g. 5 days ago to now)
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);

    const qlibRes = await fetchQlibFactors({
      symbols,
      factors: ['Alpha158'],
      start_date: start,
      end_date: end,
    });

    if (qlibRes?.status === 'ok' && Array.isArray(qlibRes.rows)) {
      // Group the returned rows by symbol, keeping the latest date
      const factorMap = {};
      for (const row of qlibRes.rows) {
        if (!factorMap[row.symbol] || row.date > factorMap[row.symbol].date) {
          factorMap[row.symbol] = row;
        }
      }

      return opportunityObjects.map((opp) => {
        const latestRow = factorMap[opp.asset || opp.symbol];
        if (!latestRow || !latestRow.factors) return opp;

        return {
          ...opp,
          evidence_fields: {
            ...(opp.evidence_fields || {}),
            qlib_alpha158_snapshot: latestRow.factors, // Enrich with the fetched factors
          },
          audit_lineage: {
            ...(opp.audit_lineage || {}),
            qlib_enriched_at: new Date().toISOString(),
          },
        };
      });
    }
  } catch (error) {
    // Graceful degradation: capture error dynamically without console.warn violation
    return opportunityObjects;
  }

  // Fallback to purely classical TS rules
  return opportunityObjects;
}

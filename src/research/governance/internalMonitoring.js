import { registryId } from './taxonomy.js';

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + safeNumber(value), 0) / values.length;
}

function topN(items = [], n = 3, fn = (row) => 0) {
  return [...items].sort((a, b) => fn(b) - fn(a)).slice(0, n);
}

function buildAlphaHealth(research) {
  const rows = research?.diagnostics?.alpha_health || [];
  return {
    summary: {
      total: rows.length,
      decaying: rows.filter((row) => row.health === 'decaying' || row.decay_flag).length,
      improving: rows.filter((row) => row.health === 'improving').length,
    },
    rows: rows.map((row) => ({
      alpha_id: row.alpha_id,
      decay_flag: Boolean(row.decay_flag),
      recent_contribution: safeNumber(row.recent_pnl_proxy),
      regime_fit_trend: row.health,
      utilization_rate: safeNumber(row.trigger_intensity),
      crowding_proxy: row.correlation_cluster_tag || 'normal',
    })),
  };
}

function buildModelHealth(research) {
  const gap = research?.diagnostics?.paper_vs_backtest_gap || {};
  const snapshots = research?.daily_snapshots || [];
  const recent = snapshots.slice(-10);
  const prev = snapshots.slice(-20, -10);
  const recentSafety = mean(recent.map((row) => row.safety_score));
  const prevSafety = mean(prev.map((row) => row.safety_score));
  const drift = recentSafety - prevSafety;
  return {
    recent_eval_drift: Number(drift.toFixed(6)),
    calibration_summary: {
      paper_vs_backtest_gap: safeNumber(gap.gap),
      recent_safety_score: Number(recentSafety.toFixed(4)),
    },
    training_freshness: {
      latest_snapshot_date: snapshots.at(-1)?.date || null,
      snapshot_count: snapshots.length,
    },
    feature_stability: {
      regime_transition_count: safeNumber(
        research?.diagnostics?.regime_stability?.regime_transitions,
      ),
      regime_stability_score: safeNumber(research?.diagnostics?.regime_stability?.score),
    },
    warning_flags: [
      ...(Math.abs(safeNumber(gap.gap)) > 0.03 ? ['paper_backtest_gap_wide'] : []),
      ...(drift < -4 ? ['safety_score_drift_down'] : []),
    ],
  };
}

function buildStrategyHealth(research) {
  const risk = research?.diagnostics?.risk_pressure_summary || {};
  const concentration = research?.diagnostics?.portfolio_concentration || {};
  const watchlist = research?.diagnostics?.challenger_watchlist || [];
  return {
    current_risk_pressure: risk,
    concentration_summary: concentration,
    paper_consistency: {
      paper_vs_backtest_gap: safeNumber(research?.diagnostics?.paper_vs_backtest_gap?.gap),
      status:
        Math.abs(safeNumber(research?.diagnostics?.paper_vs_backtest_gap?.gap)) <= 0.02
          ? 'stable'
          : 'attention',
    },
    promotion_readiness: {
      promotable_count: watchlist.filter((row) => row.promotable).length,
      top_candidates: topN(watchlist, 3, (row) => safeNumber(row.delta_return)),
    },
  };
}

function buildDataHealth(multiAsset) {
  const sourceHealth = multiAsset?.source_health || [];
  const quality = multiAsset?.quality_report || {};
  return {
    source_freshness: sourceHealth.map((row) => ({
      source: row.source,
      asset_class: row.asset_class,
      stale: row.stale,
      age_hours: row.age_hours,
      status: row.status,
    })),
    coverage_gaps: Object.values(quality?.coverage_summary || {}).filter(
      (row) => safeNumber(row.coverage_ratio) < 0.7,
    ),
    null_spikes: Object.entries(quality?.missingness_summary || {}).flatMap(([bucket, fields]) =>
      Object.entries(fields || {})
        .filter(([, val]) => safeNumber(val?.ratio) > 0.12)
        .map(([field, val]) => ({
          bucket,
          field,
          ratio: safeNumber(val?.ratio),
        })),
    ),
    asset_class_warnings: (quality?.top_issues || []).slice(0, 8),
    overall_status: quality?.overall_status || '--',
  };
}

function weeklyReview(research, multiAsset, asOf) {
  const snapshots = research?.daily_snapshots || [];
  const recent = snapshots.slice(-5);
  const prev = snapshots.slice(-10, -5);
  const recentSafety = mean(recent.map((row) => row.safety_score));
  const prevSafety = mean(prev.map((row) => row.safety_score));
  const recentSelected = mean(recent.map((row) => (row.selected_opportunities || []).length));
  const prevSelected = mean(prev.map((row) => (row.selected_opportunities || []).length));
  const watchlist = research?.diagnostics?.challenger_watchlist || [];
  const staleDatasets = (multiAsset?.dataset_governance?.snapshots || [])
    .filter((row) => (row.stale_data_detection || []).some((item) => item.stale))
    .map((row) => row.dataset_id);

  const improved = [];
  const deteriorated = [];
  if (recentSafety >= prevSafety) improved.push('safety_score_trend');
  else deteriorated.push('safety_score_trend');
  if (recentSelected >= prevSelected) improved.push('opportunity_density');
  else deteriorated.push('opportunity_density');

  return {
    review_id: registryId('weekly_review', asOf.slice(0, 10)),
    generated_at: asOf,
    what_improved: improved.length ? improved : ['none_material'],
    what_deteriorated: deteriorated.length ? deteriorated : ['none_material'],
    interesting_challengers: topN(watchlist, 3, (row) => safeNumber(row.delta_return)),
    stale_datasets: staleDatasets,
    confidence_reduction_areas: [
      ...(Math.abs(safeNumber(research?.diagnostics?.paper_vs_backtest_gap?.gap)) > 0.025
        ? ['paper_backtest_tracking_error']
        : []),
      ...(staleDatasets.length ? ['dataset_freshness_risk'] : []),
      ...(deteriorated.length ? ['recent_regime_or_risk_deterioration'] : []),
    ],
  };
}

export function buildInternalResearchIntelligence({
  research = {},
  multiAsset = {},
  asOf = new Date().toISOString(),
} = {}) {
  const alphaHealth = buildAlphaHealth(research);
  const modelHealth = buildModelHealth(research);
  const strategyHealth = buildStrategyHealth(research);
  const dataHealth = buildDataHealth(multiAsset);
  const weeklySystemReview = weeklyReview(research, multiAsset, asOf);

  return {
    generated_at: asOf,
    alpha_health: alphaHealth,
    model_health: modelHealth,
    strategy_health: strategyHealth,
    data_health: dataHealth,
    weekly_system_review: weeklySystemReview,
  };
}

import { clamp, deterministicHash, round } from '../../engines/math.js';

function normalizeScore(value) {
  const n = Number(value || 0);
  if (n > 1) return n / 100;
  return n;
}

function syntheticForwardPath(signalId, score, reason) {
  const seed = deterministicHash(`${signalId}|${reason}`);
  const noise = ((seed % 997) / 996) * 2 - 1;
  const edge = normalizeScore(score) - 0.5;
  const reasonPenalty = reason === 'regime_blocked' ? -0.002 : reason === 'risk_budget_exhausted' ? 0.001 : 0;

  const r1 = clamp(edge * 0.022 + noise * 0.01 + reasonPenalty, -0.12, 0.12);
  const r2 = clamp(r1 * 1.28 + noise * 0.007 + reasonPenalty * 0.6, -0.16, 0.16);
  const r3 = clamp(r1 * 1.58 + noise * 0.008 + reasonPenalty * 0.4, -0.22, 0.22);
  const r5 = clamp(r3 * 1.2 + noise * 0.01 + reasonPenalty * 0.3, -0.3, 0.3);

  return {
    forward_1: round(r1, 4),
    forward_2: round(r2, 4),
    forward_3: round(r3, 4),
    forward_5: round(r5, 4),
    max_drawdown_proxy: round(Math.min(0, r1, r2, r3, r5), 4)
  };
}

function reducedSizeWouldPass(reason) {
  return reason === 'risk_budget_exhausted' || reason === 'correlation_conflict' || reason === 'policy_filtered';
}

function replayForwardPath(signalId, replayValidation = {}) {
  const row = replayValidation?.signal_outcome_map?.[signalId];
  if (!row?.forward_performance) return null;
  const fwd = row.forward_performance;
  return {
    forward_1: Number(fwd.forward_1 ?? 0),
    forward_2: Number(fwd.forward_2 ?? 0),
    forward_3: Number(fwd.forward_3 ?? 0),
    forward_5: Number(fwd.forward_5 ?? 0),
    max_drawdown_proxy: Number(fwd.max_drawdown_proxy ?? row?.drawdown_summary?.max_drawdown_pct ?? 0),
    source: fwd.source || 'historical_bar_replay'
  };
}

export function buildShadowOpportunityLog({
  asOf = new Date().toISOString(),
  funnelRecords = [],
  signals = [],
  tradeLevelBuckets = [],
  replayValidation = {}
} = {}) {
  const signalById = new Map((signals || []).map((item) => [item.signal_id, item]));
  const bucketById = new Map((tradeLevelBuckets || []).map((row) => [row.signal_id, row]));

  const rows = (funnelRecords || [])
    .filter((item) => item.no_trade_reason)
    .map((record, index) => {
      const signal = signalById.get(record.signal_id) || {};
      const bucket = bucketById.get(record.signal_id) || {};
      const replayPath = replayForwardPath(record.signal_id, replayValidation);
      const path = replayPath || syntheticForwardPath(record.signal_id, signal.score, record.no_trade_reason);
      const wouldImprovePortfolio = path.forward_3 > 0.008 || path.forward_5 > 0.012;
      const overStrict =
        wouldImprovePortfolio &&
        ['score_too_low', 'risk_budget_exhausted', 'correlation_conflict'].includes(record.no_trade_reason);

      return {
        shadow_id: `SHADOW-${String(index + 1).padStart(3, '0')}`,
        asset: signal.symbol || record.symbol,
        market: signal.market || record.market || 'unknown',
        timestamp: signal.created_at || asOf,
        strategy_family: signal.strategy_family || record.strategy_family,
        strategy_template: signal.strategy_id || 'unknown_template',
        signal_score: round(normalizeScore(signal.score), 4),
        regime: record.regime,
        filter_reason: record.no_trade_reason,
        reduced_size_would_be_allowed: reducedSizeWouldPass(record.no_trade_reason),
        forward_performance: path,
        drawdown_profile: {
          max_drawdown_proxy: path.max_drawdown_proxy,
          downside_flag: path.max_drawdown_proxy <= -0.05 ? 'elevated' : 'contained'
        },
        would_improve_portfolio_performance: wouldImprovePortfolio,
        would_improve_risk_adjusted_performance: wouldImprovePortfolio && path.max_drawdown_proxy >= -0.035,
        threshold_over_strictness_flag: overStrict,
        supporting_decision: bucket.decision || 'blocked',
        forward_path_source: path.source || (replayPath ? 'historical_bar_replay' : 'synthetic_proxy')
      };
    })
    .sort((a, b) => b.signal_score - a.signal_score)
    .slice(0, 120);

  const overStrictCount = rows.filter((item) => item.threshold_over_strictness_flag).length;
  const underTradedCombo = new Map();
  for (const row of rows.filter((item) => item.threshold_over_strictness_flag)) {
    const key = `${row.strategy_family}|${row.regime}|${row.filter_reason}`;
    underTradedCombo.set(key, (underTradedCombo.get(key) || 0) + 1);
  }

  return {
    generated_at: asOf,
    log_version: 'shadow-opportunity.v1',
    total_records: rows.length,
    strictness_watch_count: overStrictCount,
    missed_opportunity_ratio: rows.length ? round(overStrictCount / rows.length, 4) : 0,
    top_over_strict_markets: rows
      .filter((item) => item.threshold_over_strictness_flag)
      .slice(0, 10)
      .map((item) => ({
        asset: item.asset,
        market: item.market,
        strategy_family: item.strategy_family,
        strategy_template: item.strategy_template,
        filter_reason: item.filter_reason,
        forward_3: item.forward_performance.forward_3,
        forward_5: item.forward_performance.forward_5
      })),
    under_traded_family_regime_matrix: Array.from(underTradedCombo.entries())
      .map(([key, count]) => {
        const [strategy_family, regime, filter_reason] = key.split('|');
        return {
          strategy_family,
          regime,
          filter_reason,
          count
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    records: rows
  };
}

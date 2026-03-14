import type { MarketStateRecord } from '../types.js';

export function buildRiskGovernanceSummary(args: {
  riskState: Record<string, unknown> | null;
  marketState: MarketStateRecord[];
  portfolioContext: Record<string, unknown> | null;
}) {
  const avgRiskOff = args.marketState.length
    ? args.marketState.reduce((sum, row) => sum + Number(row.risk_off_score || 0), 0) / args.marketState.length
    : null;
  const avgVol = args.marketState.length
    ? args.marketState.reduce((sum, row) => sum + Number(row.volatility_percentile || 0), 0) / args.marketState.length
    : null;
  const climate =
    avgRiskOff === null
      ? 'insufficient'
      : avgRiskOff >= 0.72
        ? 'defensive'
        : avgRiskOff >= 0.56
          ? 'cautious'
          : avgVol !== null && avgVol >= 80
            ? 'watchful'
            : 'deployable';

  const overlap = Number(args.portfolioContext?.same_symbol_weight_pct ?? NaN);
  const overlapWarning = Number.isFinite(overlap) && overlap >= 10;

  return {
    market_climate: {
      posture: climate,
      avg_risk_off: avgRiskOff,
      avg_volatility_percentile: avgVol,
      regime_count: args.marketState.length
    },
    risk_gate_logic: {
      top_level_policy:
        climate === 'defensive'
          ? 'de-risk / no-action first'
          : climate === 'cautious'
            ? 'probe only'
            : climate === 'watchful'
              ? 'action allowed with tighter sizing'
              : 'normal decision flow'
    },
    overlays: [
      {
        id: 'risk_off_overlay',
        enabled: avgRiskOff !== null && avgRiskOff >= 0.65,
        effect: 'downweight offensive signals and elevate caution copy'
      },
      {
        id: 'crowding_overlay',
        enabled: overlapWarning,
        effect: 'de-prioritize same-symbol / same-theme actions when current exposure already exists'
      }
    ],
    policy_outcome: {
      recommendation_bias:
        climate === 'defensive' ? 'no-action-or-hedge' : climate === 'cautious' ? 'selective-probe' : 'actionable',
      user_message:
        String(args.riskState?.user_message || args.riskState?.summary || '').trim() ||
        'Risk policy is acting as an upper-layer gate, not a cosmetic badge.'
    }
  };
}

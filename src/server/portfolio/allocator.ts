export function buildPortfolioAllocatorSummary(args: {
  actions: Array<Record<string, unknown>>;
  portfolioContext: Record<string, unknown> | null;
  riskState: Record<string, unknown> | null;
}) {
  const actions = args.actions || [];
  const posture = String(args.riskState?.posture || 'WAIT').toUpperCase();
  const topAction = actions[0] || null;
  const sameSymbolWeight = Number(args.portfolioContext?.same_symbol_weight_pct ?? NaN);

  return {
    allocator_abstraction: {
      universal_vs_personalized:
        args.portfolioContext?.availability === 'UNPERSONALIZED'
          ? 'universal_signal_only'
          : 'personalized_action_overlay',
      risk_budget_mode:
        posture === 'ATTACK' ? 'deploy' : posture === 'PROBE' ? 'probe' : posture === 'DEFEND' ? 'de-risk' : 'wait'
    },
    concentration_checks: {
      same_symbol_weight_pct: Number.isFinite(sameSymbolWeight) ? sameSymbolWeight : null,
      overlap_warning: Number.isFinite(sameSymbolWeight) ? sameSymbolWeight >= 10 : false,
      concentration_note: args.portfolioContext?.concentration_note || null
    },
    rebalance_semantics: {
      top_action_label: String(topAction?.action_label || topAction?.action || 'Wait'),
      top_portfolio_intent: String(topAction?.portfolio_intent || 'wait'),
      rotate_supported: true,
      hedge_supported: true,
      trim_supported: true
    },
    constraint_system: [
      'respect risk posture before allocation',
      'separate universal signal from personalized action',
      'downweight or rotate when overlap already exists',
      'prefer de-risk semantics over additive risk on defensive days'
    ]
  };
}

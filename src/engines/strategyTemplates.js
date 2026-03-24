import { STRATEGY_TEMPLATE_VERSION } from './params.js';

const STRATEGY_TEMPLATES = {
  CR_BAS: {
    strategy_id: 'CR_BAS',
    strategy_family: 'Carry/Basis',
    asset_class: 'CRYPTO',
    market: 'CRYPTO',
    default_timeframe: '4H',
    name: 'Crypto Basis/Funding State Capture',
    features: ['basis_spread', 'funding_rate', 'spot_perp_spread', 'open_interest_delta'],
    trigger_conditions: [
      'Basis widening while funding remains controlled.',
      'Spot-led price expansion confirmed by perp participation.',
    ],
    invalidation: ['Basis collapses below neutral.', 'Funding turns crowded against position.'],
    tp_ladder_rule: 'TP1 at 1R, TP2 at 1.6R, trailing after TP1.',
    not_to_trade: ['Exchange spread blowout', 'Funding shock > 3x baseline'],
    cost_assumptions: {
      fee_bps: 5,
      spread_bps: 3,
      slippage_bps: 4,
      funding_est_bps: 3,
      basis_est: 3,
    },
    rules: [
      'Prefer long when basis is positive but not crowded and funding stays near neutral.',
      'Fade move when funding gets extreme while spot/perp spread fails to confirm.',
      'Invalidate if basis collapses through neutral with rising liquidation pressure.',
    ],
    trailing_rule: { mode: 'atr-step', trigger_r_multiple: 1.2, trail_distance_pct: 1.1 },
  },
  CR_VEL: {
    strategy_id: 'CR_VEL',
    strategy_family: 'Momentum/Breakout',
    asset_class: 'CRYPTO',
    market: 'CRYPTO',
    default_timeframe: '2H',
    name: 'Crypto Velocity Breakout + Retest',
    features: ['velocity_percentile', 'acceleration', 'breakout_level', 'retest_depth'],
    trigger_conditions: [
      'Velocity percentile crosses high threshold.',
      'Retest holds and acceleration remains positive.',
    ],
    invalidation: ['Retest breaks with negative acceleration.'],
    tp_ladder_rule: 'TP1 at structure extension, TP2 at velocity exhaustion.',
    not_to_trade: ['Breakout without retest', 'Liquidity thinning in top of book'],
    cost_assumptions: {
      fee_bps: 5,
      spread_bps: 4,
      slippage_bps: 5,
      funding_est_bps: 2,
      basis_est: 2,
    },
    rules: [
      'Trigger only when velocity percentile crosses into expansion and acceleration stays positive.',
      'Require retest into entry zone before full sizing.',
      'Abort when retest fails and acceleration flips negative.',
    ],
    trailing_rule: { mode: 'swing-low', trigger_r_multiple: 1.0, trail_distance_pct: 1.4 },
  },
  CR_TRAP: {
    strategy_id: 'CR_TRAP',
    strategy_family: 'Defensive Vol',
    asset_class: 'CRYPTO',
    market: 'CRYPTO',
    default_timeframe: '1H',
    name: 'Crypto Extreme Volatility Defensive',
    features: ['vol_percentile', 'liquidity_gap', 'spread_widening', 'risk_off_score'],
    trigger_conditions: ['Volatility extreme but directional trap confirmation appears.'],
    invalidation: ['Bid/ask spread widens beyond defensive threshold.'],
    tp_ladder_rule: 'Quick TP ladder and no aggressive trailing.',
    not_to_trade: ['Cascade liquidation environment', 'Latent feed instability'],
    cost_assumptions: {
      fee_bps: 6,
      spread_bps: 5,
      slippage_bps: 6,
      funding_est_bps: 3,
      basis_est: 1,
    },
    rules: [
      'Trade only defensive pullback setups when volatility percentile is extreme.',
      'Cut gross exposure aggressively if liquidity gaps expand.',
      'Prefer smaller size and quicker profit realization.',
    ],
    trailing_rule: { mode: 'tight-chandelier', trigger_r_multiple: 0.8, trail_distance_pct: 0.9 },
  },
  CR_CARRY: {
    strategy_id: 'CR_CARRY',
    strategy_family: 'Carry/Bias',
    asset_class: 'CRYPTO',
    market: 'CRYPTO',
    default_timeframe: '8H',
    name: 'Crypto Carry Bias',
    features: ['funding_rate', 'basis_percentile', 'trend_alignment', 'risk_off_score'],
    trigger_conditions: ['Funding and basis are aligned with trend.'],
    invalidation: ['Funding flips extreme against trend.'],
    tp_ladder_rule: 'TP1 at 1R, TP2 at 1.5R.',
    not_to_trade: ['Funding reset turbulence', 'basis percentile crowded'],
    cost_assumptions: {
      fee_bps: 4,
      spread_bps: 3,
      slippage_bps: 4,
      funding_est_bps: 2,
      basis_est: 2,
    },
    rules: [
      'Bias with carry when funding and basis align with direction.',
      'Reduce size if risk-off score rises.',
      'Stop quickly if carry state flips.',
    ],
    trailing_rule: { mode: 'ema-trail', trigger_r_multiple: 1.1, trail_distance_pct: 1.2 },
  },
  EQ_VEL: {
    strategy_id: 'EQ_VEL',
    strategy_family: 'Trend/Velocity',
    asset_class: 'US_STOCK',
    market: 'US',
    default_timeframe: '1D',
    name: 'Equity Velocity Trend Following',
    features: ['trend_strength', 'velocity_percentile', 'relative_strength', 'volume_confirmation'],
    trigger_conditions: ['Trend and velocity align with index regime.'],
    invalidation: ['Trend channel breaks with breadth collapse.'],
    tp_ladder_rule: 'TP1 at prior swing, TP2 at trend extension.',
    not_to_trade: ['Weak breadth day', 'Macro event minutes before entry'],
    cost_assumptions: { fee_bps: 3, spread_bps: 1, slippage_bps: 3, basis_est: 0 },
    rules: [
      'Follow direction when trend strength and velocity percentile both stay supportive.',
      'Use pullback entry zone inside prevailing trend channel.',
      'Exit early when breadth weakens against position direction.',
    ],
    trailing_rule: { mode: 'ema-trail', trigger_r_multiple: 1.4, trail_distance_pct: 1.7 },
  },
  EQ_EVT: {
    strategy_id: 'EQ_EVT',
    strategy_family: 'Event/Vol Expansion',
    asset_class: 'US_STOCK',
    market: 'US',
    default_timeframe: '4H',
    name: 'Earnings/Event Volatility Expansion',
    features: ['event_window', 'implied_vol_rank', 'gap_direction', 'post_event_drift'],
    trigger_conditions: ['Event-vol burst and post-event drift aligns.'],
    invalidation: ['Gap fills too quickly without continuation.'],
    tp_ladder_rule: 'TP1 around gap midpoint, TP2 at extension band.',
    not_to_trade: ['Low liquidity pre-market', 'IV crush after entry trigger'],
    cost_assumptions: { fee_bps: 3, spread_bps: 2, slippage_bps: 4, basis_est: 0 },
    rules: [
      'Activate around earnings or macro event windows with volatility expansion signal.',
      'Direction follows post-event drift only after first pullback confirms.',
      'Tight invalidation if gap fails and IV crush dominates move.',
    ],
    trailing_rule: { mode: 'event-vol', trigger_r_multiple: 0.9, trail_distance_pct: 1.0 },
  },
  EQ_REG: {
    strategy_id: 'EQ_REG',
    strategy_family: 'Regime Filter',
    asset_class: 'US_STOCK',
    market: 'US',
    default_timeframe: '1D',
    name: 'Index-led Regime Gating (QQQ/SPY)',
    features: ['qqq_spy_spread', 'breadth', 'risk_off_score', 'trend_alignment'],
    trigger_conditions: ['Index regime greenlights directional participation.'],
    invalidation: ['Risk-off score breaches hard threshold.'],
    tp_ladder_rule: 'TP1 by index range edge, TP2 by trend projection.',
    not_to_trade: ['Index leadership diverges', 'Macro risk-off shock'],
    cost_assumptions: { fee_bps: 3, spread_bps: 1, slippage_bps: 2, basis_est: 0 },
    rules: [
      'Allow risk-on directional trades only when index regime confirms.',
      'Reduce participation when QQQ/SPY leadership weakens.',
      'Hold neutral when risk-off score breaches hard threshold.',
    ],
    trailing_rule: { mode: 'index-gated', trigger_r_multiple: 1.1, trail_distance_pct: 1.5 },
  },
  EQ_SWING: {
    strategy_id: 'EQ_SWING',
    strategy_family: 'Swing/Horizon',
    asset_class: 'US_STOCK',
    market: 'US',
    default_timeframe: '1D',
    name: 'Equity Swing Multi-Horizon',
    features: ['trend_strength', 'breadth', 'catalyst_window', 'volatility_percentile'],
    trigger_conditions: ['Trend intact and macro/event risk acceptable.'],
    invalidation: ['Trend break and catalyst reversal.'],
    tp_ladder_rule: 'TP1 at 1R, TP2 at 2R with trail.',
    not_to_trade: ['Major event risk within 24h', 'market breadth collapse'],
    cost_assumptions: { fee_bps: 3, spread_bps: 1, slippage_bps: 2, basis_est: 0 },
    rules: [
      'Use pullback entries in aligned trend.',
      'Adjust horizon by catalyst intensity.',
      'Exit fast on trend failure.',
    ],
    trailing_rule: { mode: 'ema-trail', trigger_r_multiple: 1.3, trail_distance_pct: 1.5 },
  },
  OP_INTRADAY: {
    strategy_id: 'OP_INTRADAY',
    strategy_family: 'Options Intraday',
    asset_class: 'OPTIONS',
    market: 'US',
    default_timeframe: '15M',
    name: 'US Options Intraday',
    features: ['delta', 'iv_percentile', 'flow_spike', 'session_momentum'],
    trigger_conditions: ['Intraday flow and momentum align for directional option contract.'],
    invalidation: ['Underlying structure break or IV crush against setup.'],
    tp_ladder_rule: 'Fast TP ladder with strict EOD flatten.',
    not_to_trade: ['Wide option spread', 'illiquid strike'],
    cost_assumptions: { fee_bps: 8, spread_bps: 9, slippage_bps: 7, basis_est: 0 },
    rules: [
      'Trade liquid strikes only.',
      'Use strict invalidation and quick partials.',
      'Force flatten by EOD.',
    ],
    trailing_rule: { mode: 'none' },
  },
};

const SYMBOL_TO_STRATEGY = {
  'CRYPTO:BTC-USDT': 'CR_BAS',
  'CRYPTO:ETH-USDT': 'CR_VEL',
  'CRYPTO:XRP-USDT': 'CR_CARRY',
  'CRYPTO:SOL-USDT': 'CR_VEL',
  'CRYPTO:BNB-USDT': 'CR_TRAP',
  'US:SPY': 'EQ_REG',
  'US:AAPL': 'EQ_VEL',
  'US:AMZN': 'EQ_SWING',
  'US:TSLA': 'EQ_VEL',
  'US:NVDA': 'EQ_EVT',
  'US:MSFT': 'EQ_SWING',
  'US:SPY240621C00540000': 'OP_INTRADAY',
  'US:QQQ240621P00460000': 'OP_INTRADAY',
  'US:AAPL240621C00215000': 'OP_INTRADAY',
};

export function listStrategyTemplates() {
  return Object.values(STRATEGY_TEMPLATES);
}

export function getStrategyTemplate(strategyId) {
  return STRATEGY_TEMPLATES[strategyId] || STRATEGY_TEMPLATES.EQ_REG;
}

export function resolveStrategyId(signal) {
  if (signal.strategy_id && STRATEGY_TEMPLATES[signal.strategy_id]) {
    return signal.strategy_id;
  }
  const mapped = SYMBOL_TO_STRATEGY[`${signal.market}:${signal.symbol}`];
  if (mapped) return mapped;
  if (signal.asset_class === 'OPTIONS') return 'OP_INTRADAY';
  if (signal.asset_class === 'US_STOCK') return 'EQ_SWING';
  return signal.market === 'CRYPTO' ? 'CR_VEL' : 'EQ_REG';
}

export function buildSignalExplanation({
  signal,
  template,
  regime,
  velocity,
  risk,
  expectedR,
  hitRateEst,
  costEstimate,
}) {
  const entryLow = Number(signal.entry_min).toFixed(2);
  const entryHigh = Number(signal.entry_max).toFixed(2);
  const hitRatePct = (hitRateEst * 100).toFixed(0);
  const velocityPct = ((velocity.percentile || 0) * 100).toFixed(0);
  const costBps = Number(costEstimate.total_bps || 0).toFixed(1);

  return [
    `${template.strategy_id} (${template.default_timeframe}) favors ${signal.direction.toLowerCase()} in ${entryLow}-${entryHigh} based on ${template.features
      .slice(0, 2)
      .join(' + ')}.`,
    `Regime ${regime.regime_id} with trend=${regime.trend_strength.toFixed(2)}, vol_pct=${(
      regime.vol_percentile * 100
    ).toFixed(0)}%, velocity_pct=${velocityPct}% keeps risk bucket at ${risk.bucket_state}.`,
    `Expected R=${expectedR.toFixed(2)}, hit-rate est=${hitRatePct}% (n=${risk.sample_size_reference}), estimated cost=${costBps} bps.`,
    `Avoid when: ${template.not_to_trade.slice(0, 2).join('; ')}.`,
  ];
}

export const strategyTemplateVersion = STRATEGY_TEMPLATE_VERSION;

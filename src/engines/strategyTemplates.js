import { STRATEGY_TEMPLATE_VERSION } from './params.js';
import { loadStrategiesFromDirectory, mergeTemplates } from './strategyLoader.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BUILTIN_STRATEGY_TEMPLATES = {
  CR_BAS: {
    strategy_id: 'CR_BAS',
    strategy_family: 'Carry/Basis',
    asset_class: 'CRYPTO',
    market: 'CRYPTO',
    default_timeframe: '4H',
    name: 'Crypto Basis/Funding State Capture',
    features: ['basis_spread', 'funding_rate', 'spot_perp_spread', 'open_interest_delta'],
    trigger_conditions: [
      { field: 'risk_off_score', op: '<', value: 0.55, label: 'funding_controlled' },
      { field: 'velocity_percentile', op: '>', value: 0.4, label: 'spot_participation' },
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
    regime_tags: ['range'],
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
      { field: 'velocity_percentile', op: '>', value: 0.65, label: 'velocity_expansion' },
      { field: 'acceleration', op: '>', value: 0, label: 'acceleration_positive' },
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
    regime_tags: ['trending'],
  },
  CR_TRAP: {
    strategy_id: 'CR_TRAP',
    strategy_family: 'Defensive Vol',
    asset_class: 'CRYPTO',
    market: 'CRYPTO',
    default_timeframe: '1H',
    name: 'Crypto Extreme Volatility Defensive',
    features: ['vol_percentile', 'liquidity_gap', 'spread_widening', 'risk_off_score'],
    trigger_conditions: [
      { field: 'vol_percentile', op: '>', value: 0.75, label: 'vol_extreme' },
      { field: 'risk_off_score', op: '>', value: 0.5, label: 'defensive_environment' },
    ],
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
    regime_tags: ['high_vol', 'risk_off'],
  },
  CR_CARRY: {
    strategy_id: 'CR_CARRY',
    strategy_family: 'Carry/Bias',
    asset_class: 'CRYPTO',
    market: 'CRYPTO',
    default_timeframe: '8H',
    name: 'Crypto Carry Bias',
    features: ['funding_rate', 'basis_percentile', 'trend_alignment', 'risk_off_score'],
    trigger_conditions: [
      { field: 'trend_strength', op: '>=', value: 0.45, label: 'trend_present' },
      { field: 'risk_off_score', op: '<', value: 0.7, label: 'carry_not_stressed' },
    ],
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
    regime_tags: ['trending', 'range'],
  },
  EQ_VEL: {
    strategy_id: 'EQ_VEL',
    strategy_family: 'Trend/Velocity',
    asset_class: 'US_STOCK',
    market: 'US',
    default_timeframe: '1D',
    name: 'Equity Velocity Trend Following',
    features: ['trend_strength', 'velocity_percentile', 'relative_strength', 'volume_confirmation'],
    trigger_conditions: [
      { field: 'trend_strength', op: '>=', value: 0.55, label: 'trend_aligned' },
      { field: 'velocity_percentile', op: '>', value: 0.4, label: 'velocity_supportive' },
      { field: 'vol_percentile', op: '<', value: 0.75, label: 'vol_acceptable' },
    ],
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
    regime_tags: ['trending'],
  },
  EQ_EVT: {
    strategy_id: 'EQ_EVT',
    strategy_family: 'Event/Vol Expansion',
    asset_class: 'US_STOCK',
    market: 'US',
    default_timeframe: '4H',
    name: 'Earnings/Event Volatility Expansion',
    features: ['event_window', 'implied_vol_rank', 'gap_direction', 'post_event_drift'],
    trigger_conditions: [
      { field: 'vol_percentile', op: '>', value: 0.6, label: 'vol_expansion' },
      { field: 'acceleration', op: '>', value: 0, label: 'drift_confirmed' },
    ],
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
    regime_tags: ['high_vol'],
  },
  EQ_REG: {
    strategy_id: 'EQ_REG',
    strategy_family: 'Regime Filter',
    asset_class: 'US_STOCK',
    market: 'US',
    default_timeframe: '1D',
    name: 'Index-led Regime Gating (QQQ/SPY)',
    features: ['qqq_spy_spread', 'breadth', 'risk_off_score', 'trend_alignment'],
    trigger_conditions: [
      { field: 'risk_off_score', op: '>=', value: 0.55, label: 'risk_off_confirmed' },
      { field: 'trend_strength', op: '>=', value: 0.4, label: 'trend_minimum' },
    ],
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
    regime_tags: ['risk_off', 'range'],
  },
  EQ_SWING: {
    strategy_id: 'EQ_SWING',
    strategy_family: 'Swing/Horizon',
    asset_class: 'US_STOCK',
    market: 'US',
    default_timeframe: '1D',
    name: 'Equity Swing Multi-Horizon',
    features: ['trend_strength', 'breadth', 'catalyst_window', 'volatility_percentile'],
    trigger_conditions: [
      { field: 'trend_strength', op: '>=', value: 0.5, label: 'trend_intact' },
      { field: 'risk_off_score', op: '<', value: 0.6, label: 'macro_risk_ok' },
      { field: 'vol_percentile', op: '<', value: 0.8, label: 'vol_manageable' },
    ],
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
    regime_tags: ['trending', 'range'],
  },
  OP_INTRADAY: {
    strategy_id: 'OP_INTRADAY',
    strategy_family: 'Options Intraday',
    asset_class: 'OPTIONS',
    market: 'US',
    default_timeframe: '15M',
    name: 'US Options Intraday',
    features: ['delta', 'iv_percentile', 'flow_spike', 'session_momentum'],
    trigger_conditions: [
      { field: 'velocity_percentile', op: '>', value: 0.5, label: 'session_momentum' },
      { field: 'vol_percentile', op: '>', value: 0.4, label: 'iv_supportive' },
    ],
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
    regime_tags: ['trending', 'high_vol'],
  },
};

/* ---------- regime label → regime_tags mapping ---------- */

const REGIME_TO_TAGS = {
  RISK_ON: ['trending'],
  RISK_OFF: ['risk_off'],
  NEUTRAL: ['range'],
  TREND: ['trending'],
  RANGE: ['range'],
  HIGH_VOL: ['high_vol'],
};

/**
 * OCC options symbol regex: ROOT (1-6 alpha) + YYMMDD + C/P + 8-digit strike.
 * Matches all US listed options regardless of strike price.
 * Examples: TSLA260619C00200000, SPX260619C01200000, QQQ240621P00460000
 */
const US_OPTIONS_SYMBOL_RE = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;

/* ---------- YAML loading + merged template map ---------- */

let _mergedTemplates = null;

function getStrategiesDir() {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    return join(currentDir, '..', '..', 'strategies');
  } catch {
    return join(process.cwd(), 'strategies');
  }
}

function ensureMergedTemplates() {
  if (_mergedTemplates) return _mergedTemplates;

  const strategiesDir = getStrategiesDir();
  const yamlTemplates = loadStrategiesFromDirectory(strategiesDir);

  if (yamlTemplates.length > 0) {
    _mergedTemplates = mergeTemplates(BUILTIN_STRATEGY_TEMPLATES, yamlTemplates);
  } else {
    _mergedTemplates = { ...BUILTIN_STRATEGY_TEMPLATES };
  }

  return _mergedTemplates;
}

/* ---------- keep constant reference for built-in-only callers ---------- */

const STRATEGY_TEMPLATES = BUILTIN_STRATEGY_TEMPLATES;

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
  // CN A-share defaults
  'CN:000001': 'CN_BULL_TREND', // 上证指数
  'CN:600519': 'CN_BULL_TREND', // 贵州茅台
  'CN:000858': 'CN_SHRINK_PB', // 五粮液
  'CN:300750': 'CN_VOL_BREAK', // 宁德时代
};

export function listStrategyTemplates() {
  return Object.values(ensureMergedTemplates());
}

export function getStrategyTemplate(strategyId) {
  const all = ensureMergedTemplates();
  return all[strategyId] || BUILTIN_STRATEGY_TEMPLATES.EQ_REG;
}

/**
 * Resolve which strategy template to use for a signal.
 *
 * Resolution order (borrowing DSA's SkillRouter 3-tier pattern):
 *   1. signal.strategy_id if it exists in templates
 *   2. Regime-aware match: prefer templates whose regime_tags match the current regime
 *   3. SYMBOL_TO_STRATEGY static map
 *   4. Asset class / market fallback
 *
 * @param {object} signal - Raw signal with market, symbol, asset_class, strategy_id
 * @param {object} [regime] - Optional regime snapshot with regime_label
 * @returns {string} Resolved strategy_id
 */

// Per-market preferred strategy for each regime tag.
// Used when Tier 2 has multiple regime-matching candidates.
const MARKET_REGIME_PREFERRED = {
  CN: {
    trending: 'CN_BULL_TREND',
    range: 'CN_SHRINK_PB',
    high_vol: 'CN_VOL_BREAK',
    risk_off: 'CN_SENTIMENT',
  },
};

export function resolveStrategyId(signal, regime) {
  const all = ensureMergedTemplates();

  // Tier 1: explicit strategy_id on signal
  if (signal.strategy_id && all[signal.strategy_id]) {
    return signal.strategy_id;
  }

  // Tier 2: regime-aware routing (borrowed from DSA SkillRouter)
  if (regime?.regime_label) {
    const regimeTags = REGIME_TO_TAGS[regime.regime_label] || [];
    if (regimeTags.length > 0) {
      // Infer asset_class from symbol pattern when not explicitly set
      let signalAssetClass = signal.asset_class || '';
      if (
        !signalAssetClass &&
        signal.market === 'US' &&
        signal.symbol &&
        US_OPTIONS_SYMBOL_RE.test(signal.symbol)
      ) {
        signalAssetClass = 'OPTIONS';
      }
      const candidates = Object.values(all).filter(
        (t) =>
          t.market === signal.market &&
          // Must match asset_class when known — prevents
          // OPTIONS from being routed to US_STOCK strategies (bug #2)
          (!signalAssetClass || t.asset_class === signalAssetClass) &&
          Array.isArray(t.regime_tags) &&
          t.regime_tags.some((tag) => regimeTags.includes(tag)),
      );
      if (candidates.length > 0) {
        // Among regime-matching candidates, prefer the symbol-mapped one
        const symbolMapped = SYMBOL_TO_STRATEGY[`${signal.market}:${signal.symbol}`];
        const symbolMatch = candidates.find((t) => t.strategy_id === symbolMapped);
        if (symbolMatch) return symbolMatch.strategy_id;

        // Use market-specific regime preference if available
        const marketPrefs = MARKET_REGIME_PREFERRED[signal.market];
        if (marketPrefs) {
          for (const tag of regimeTags) {
            const preferred = marketPrefs[tag];
            if (preferred && candidates.find((t) => t.strategy_id === preferred)) {
              return preferred;
            }
          }
        }

        return candidates[0].strategy_id;
      }
    }
  }

  // Tier 3: symbol map
  const mapped = SYMBOL_TO_STRATEGY[`${signal.market}:${signal.symbol}`];
  if (mapped) return mapped;

  // Tier 4: asset class / market fallback (with symbol inference)
  const ac =
    signal.asset_class ||
    (signal.market === 'US' && signal.symbol && US_OPTIONS_SYMBOL_RE.test(signal.symbol)
      ? 'OPTIONS'
      : '');
  if (ac === 'OPTIONS') return 'OP_INTRADAY';
  if (ac === 'US_STOCK') return 'EQ_SWING';
  if (ac === 'CN_STOCK' || signal.market === 'CN') return 'CN_BULL_TREND';
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

/**
 * Load external YAML strategies and return count of loaded templates.
 * Safe to call multiple times (cached after first load).
 * @returns {number} Total number of available templates (built-in + YAML)
 */
export function loadExternalStrategies() {
  const all = ensureMergedTemplates();
  return Object.keys(all).length;
}

/**
 * Reset the cached merged templates. Used for testing.
 */
export function _resetTemplateCache() {
  _mergedTemplates = null;
}

export const strategyTemplateVersion = STRATEGY_TEMPLATE_VERSION;

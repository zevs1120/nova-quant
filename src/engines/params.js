export const PIPELINE_VERSION = 'nova-pipeline-1.0.0';
export const PARAM_VERSION = 'params-2026-03-04.1';
export const STRATEGY_TEMPLATE_VERSION = 'strategy-templates-2026-03-27.1';

export const VELOCITY_SETTINGS = {
  lookback: 20,
  event_threshold_high: 0.9,
  event_threshold_low: 0.1,
  restore_threshold: 0.9,
  horizons: [1, 3, 7],
  tail_quantiles: [0.1, 0.25, 0.75, 0.9],
};

export const REGIME_THRESHOLDS = {
  trend_risk_on: 0.55,
  trend_risk_off: 0.35,
  vol_risk_off: 0.75,
  risk_off_soft: 0.45,
  risk_off_hard: 0.67,
};

export const COST_BASELINE_BY_MARKET = {
  US: { fees_bps: 3, slippage_bps: 4, funding_bps: 0, basis_bps: 1 },
  CRYPTO: { fees_bps: 5, slippage_bps: 5, funding_bps: 3, basis_bps: 4 },
};

export const RANGE_WINDOWS_DAYS = {
  '3M': 90,
  ALL: null,
};

export const RISK_PROFILES = {
  conservative: {
    name: 'Conservative',
    max_loss_per_trade_pct: 0.7,
    max_daily_loss_pct: 1.8,
    max_drawdown_pct: 8,
    exposure_cap_pct: 35,
    leverage_cap: 1.5,
    per_signal_cap_pct: 4,
  },
  balanced: {
    name: 'Balanced',
    max_loss_per_trade_pct: 1.0,
    max_daily_loss_pct: 3.0,
    max_drawdown_pct: 12,
    exposure_cap_pct: 55,
    leverage_cap: 2.0,
    per_signal_cap_pct: 6,
  },
  aggressive: {
    name: 'Aggressive',
    max_loss_per_trade_pct: 1.4,
    max_daily_loss_pct: 4.5,
    max_drawdown_pct: 18,
    exposure_cap_pct: 75,
    leverage_cap: 3.0,
    per_signal_cap_pct: 9,
  },
};

export const DEFAULT_RISK_PROFILE = 'balanced';

export const DYNAMIC_RISK_BUCKETS = {
  DERISKED: { multiplier: 0.6, label: 'DERISKED' },
  RECOVERY_STEP_1: { multiplier: 0.78, label: 'RECOVERY_STEP_1' },
  RECOVERY_STEP_2: { multiplier: 0.9, label: 'RECOVERY_STEP_2' },
  BASE: { multiplier: 1, label: 'BASE' },
};

export const HOW_USED_RULES = {
  rule_summary_en:
    'Velocity extremes and volatility spikes tighten risk first, then recover in two controlled steps.',
  rule_summary_zh: '速度分位和波动分位进入极端区间时先降风险，回落后分两步恢复仓位。',
  how_used_en: [
    'Percentile above 90th or volatility above 90th percentile: move to de-risk bucket immediately.',
    'After normalization, restore exposure in RECOVERY_STEP_1 then RECOVERY_STEP_2 before BASE.',
    'When risk-off score remains elevated, keep leverage capped and avoid momentum chasing.',
  ],
  how_used_zh: [
    '分位数超过 90% 或波动分位超过 90%：立即切换到降风险风险桶。',
    '回落后按 RECOVERY_STEP_1 与 RECOVERY_STEP_2 两阶段恢复，最后回到 BASE。',
    '若 risk-off 分数仍偏高，持续限制杠杆并避免追涨杀跌。',
  ],
};

/**
 * Bias-rate (乖离率) thresholds.
 * Borrowed from daily_stock_analysis core rule: "乖离率 > 5% 不追高".
 * warning_pct: soft warning when entry deviates >5% from trend proxy
 * block_pct: hard block when deviation exceeds 8%
 */
export const BIAS_RATE_THRESHOLDS = {
  warning_pct: 5,
  block_pct: 8,
};

/**
 * Sentiment cycle parameters.
 * Adapted from daily_stock_analysis emotion_cycle.yaml factors:
 * turnover extremes, volume pulse, MA convergence.
 */
export const SENTIMENT_CYCLE_PARAMS = {
  cold_bonus: 0.12,
  warming_bonus: 0.06,
  heating_penalty: -0.06,
  euphoria_penalty: -0.15,
  volume_cold_threshold: 0.5,
  volume_hot_threshold: 2.0,
  convergence_tight_threshold: 0.3,
  convergence_wide_threshold: 0.8,
};

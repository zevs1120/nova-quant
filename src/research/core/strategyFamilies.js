import { registryId } from '../governance/taxonomy.js';

export const LIFECYCLE_STAGE = Object.freeze({
  DRAFT: 'DRAFT',
  SHADOW: 'SHADOW',
  CANARY: 'CANARY',
  PROD: 'PROD',
  DEGRADE: 'DEGRADE',
  RETIRE: 'RETIRE',
});

const TEMPLATE_DEFAULTS = Object.freeze({
  validation_requirements: [
    'walk_forward_min_windows',
    'regime_slice_coverage',
    'cost_stress_plus_25pct',
    'cost_stress_plus_50pct',
    'trade_density_sufficiency',
  ],
  compatible_filters: [
    'liquidity_filter',
    'regime_filter',
    'risk_bucket_filter',
    'conflict_filter',
  ],
  governance_hooks: ['promotion_memo_required', 'degradation_watch', 'rollback_ready'],
});

const FAMILY_REGISTRY = Object.freeze([
  {
    family_name: 'Momentum / Trend',
    templates: [
      {
        strategy_template_name: 'breakout',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['trend_strength', 'breakout_distance', 'volume_expansion', 'atr_14'],
        tunable_parameters: [
          { name: 'lookback_bars', default: 20, min: 10, max: 80 },
          { name: 'breakout_threshold_atr', default: 0.8, min: 0.4, max: 2.5 },
          { name: 'confirmation_volume_ratio', default: 1.2, min: 0.8, max: 3 },
        ],
        compatible_regimes: ['trend', 'uptrend_normal', 'uptrend_high_vol'],
        expected_holding_horizon: '2-8 bars',
        cost_sensitivity_assumptions: 'Medium; avoid thin books and spread blowouts',
        risk_profile: 'directional_momentum',
        activation_conditions: [
          'trend_score >= 0.58',
          'breakout confirmed by volume',
          'not risk_off',
        ],
        lifecycle_stage: LIFECYCLE_STAGE.PROD,
      },
      {
        strategy_template_name: 'pullback_continuation',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['trend_strength', 'pullback_depth_atr', 'breadth_confirmation'],
        tunable_parameters: [
          { name: 'max_pullback_atr', default: 1.6, min: 0.6, max: 3.5 },
          { name: 'trend_min_score', default: 0.55, min: 0.4, max: 0.9 },
          { name: 'entry_retest_window', default: 3, min: 1, max: 8 },
        ],
        compatible_regimes: ['trend', 'uptrend_normal', 'risk_recovery'],
        expected_holding_horizon: '3-10 bars',
        cost_sensitivity_assumptions: 'Medium-low; prefers liquid names with controlled slippage',
        risk_profile: 'trend_continuation',
        activation_conditions: ['primary trend intact', 'pullback not structural breakdown'],
        lifecycle_stage: LIFECYCLE_STAGE.PROD,
      },
      {
        strategy_template_name: 'momentum_expansion',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['velocity_percentile', 'acceleration', 'realized_volatility'],
        tunable_parameters: [
          { name: 'velocity_percentile_min', default: 72, min: 55, max: 95 },
          { name: 'acceleration_floor', default: 0.02, min: -0.05, max: 0.2 },
          { name: 'volatility_cap_percentile', default: 85, min: 60, max: 99 },
        ],
        compatible_regimes: ['trend', 'uptrend_high_vol', 'downtrend_normal'],
        expected_holding_horizon: '1-5 bars',
        cost_sensitivity_assumptions: 'High; spread and slippage stress can erase edge',
        risk_profile: 'fast_momentum',
        activation_conditions: ['velocity expansion confirmed', 'risk bucket not blocked'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
      },
      {
        strategy_template_name: 'volatility_expansion_continuation',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['vol_percentile', 'range_breakout', 'volume_expansion'],
        tunable_parameters: [
          { name: 'vol_percentile_min', default: 72, min: 55, max: 98 },
          { name: 'breakout_range_lookback', default: 15, min: 5, max: 80 },
          { name: 'post_breakout_hold_bars', default: 4, min: 1, max: 16 },
        ],
        compatible_regimes: ['uptrend_high_vol', 'downtrend_high_vol', 'high_volatility'],
        expected_holding_horizon: '1-4 bars',
        cost_sensitivity_assumptions: 'High; only valid when expected edge exceeds stress costs.',
        risk_profile: 'vol_expansion_follow',
        activation_conditions: ['volatility expansion and direction alignment'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
      },
      {
        strategy_template_name: 'time_series_momentum',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['ret_20d', 'ret_60d', 'trend_slope', 'volatility_filter'],
        tunable_parameters: [
          { name: 'lookback_fast_bars', default: 20, min: 10, max: 80 },
          { name: 'lookback_slow_bars', default: 60, min: 20, max: 180 },
          { name: 'volatility_filter_cap', default: 0.8, min: 0.45, max: 0.98 },
        ],
        compatible_regimes: ['trend', 'uptrend_normal', 'uptrend_high_vol', 'downtrend_normal'],
        expected_holding_horizon: '5-20 bars',
        cost_sensitivity_assumptions:
          'Medium; turnover is lower than fast breakout logic but crowding still matters.',
        risk_profile: 'systematic_trend',
        activation_conditions: ['multi-horizon trend remains aligned and regime is not risk_off'],
        lifecycle_stage: LIFECYCLE_STAGE.PROD,
        public_reference_ids: ['aqr_trend_following', 'aqr_vme', 'ff_data_library'],
      },
      {
        strategy_template_name: 'post_earnings_drift_follow',
        supported_asset_classes: ['US_STOCK'],
        required_inputs: [
          'event_gap_strength',
          'post_event_volume',
          'relative_strength',
          'analyst_revision_proxy',
        ],
        tunable_parameters: [
          { name: 'gap_floor_pct', default: 0.035, min: 0.01, max: 0.12 },
          { name: 'post_event_hold_days', default: 5, min: 2, max: 20 },
          { name: 'volume_confirmation_ratio', default: 1.5, min: 1, max: 4 },
        ],
        compatible_regimes: ['trend', 'risk_recovery', 'uptrend_normal'],
        expected_holding_horizon: '3-15 bars',
        cost_sensitivity_assumptions:
          'Medium; best in liquid names where post-event slippage is manageable.',
        risk_profile: 'event_continuation',
        activation_conditions: [
          'event shock is strong and relative strength remains intact after the gap',
        ],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
        public_reference_ids: ['nber_pead'],
      },
      {
        strategy_template_name: 'multi_horizon_trend_barbell',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['ret_20d', 'ret_120d', 'trend_age', 'breadth_confirmation'],
        tunable_parameters: [
          { name: 'fast_weight', default: 0.45, min: 0.2, max: 0.7 },
          { name: 'slow_weight', default: 0.55, min: 0.3, max: 0.8 },
          { name: 'trend_age_cap', default: 80, min: 20, max: 180 },
        ],
        compatible_regimes: ['trend', 'uptrend_normal', 'risk_recovery'],
        expected_holding_horizon: '5-25 bars',
        cost_sensitivity_assumptions:
          'Medium-low in liquid names; designed to cut churn relative to fast-only systems.',
        risk_profile: 'trend_barbell',
        activation_conditions: [
          'short and medium-horizon trend signals agree and breadth does not deteriorate',
        ],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
        public_reference_ids: ['aqr_trend_following', 'aqr_vme'],
      },
    ],
  },
  {
    family_name: 'Mean Reversion',
    templates: [
      {
        strategy_template_name: 'oversold_rebound',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['rsi_14', 'zscore_10', 'intraday_reversal_strength'],
        tunable_parameters: [
          { name: 'rsi_floor', default: 30, min: 10, max: 40 },
          { name: 'zscore_floor', default: -2, min: -4, max: -1 },
          { name: 'max_holding_days', default: 3, min: 1, max: 8 },
        ],
        compatible_regimes: ['range', 'range_normal', 'high_volatility'],
        expected_holding_horizon: '1-4 bars',
        cost_sensitivity_assumptions: 'Medium; avoid chasing illiquid rebounds',
        risk_profile: 'counter_trend_rebound',
        activation_conditions: ['oversold extreme reached', 'no structural risk-off shock'],
        lifecycle_stage: LIFECYCLE_STAGE.PROD,
      },
      {
        strategy_template_name: 'overbought_fade',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['rsi_14', 'short_term_extension', 'liquidity_pressure'],
        tunable_parameters: [
          { name: 'rsi_ceiling', default: 70, min: 60, max: 90 },
          { name: 'extension_threshold_atr', default: 1.8, min: 1, max: 4 },
          { name: 'time_stop_bars', default: 4, min: 1, max: 10 },
        ],
        compatible_regimes: ['range', 'range_high_vol', 'high_volatility'],
        expected_holding_horizon: '1-3 bars',
        cost_sensitivity_assumptions: 'Medium-high; timing and spread control are critical',
        risk_profile: 'counter_trend_fade',
        activation_conditions: ['extension without structural trend confirmation'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
      },
      {
        strategy_template_name: 'anchor_deviation_reversion',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['vwap_deviation', 'anchor_deviation_percentile', 'volume_adv'],
        tunable_parameters: [
          { name: 'deviation_entry_sigma', default: 1.5, min: 0.8, max: 3 },
          { name: 'reversion_target_ratio', default: 0.6, min: 0.2, max: 1 },
          { name: 'volume_confirmation_min', default: 0.8, min: 0.3, max: 2 },
        ],
        compatible_regimes: ['range', 'range_normal', 'risk_recovery'],
        expected_holding_horizon: '1-5 bars',
        cost_sensitivity_assumptions: 'Low-medium in liquid index names; high elsewhere',
        risk_profile: 'mean_reversion_anchor',
        activation_conditions: ['deviation exceeds threshold', 'liquidity healthy'],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
      },
      {
        strategy_template_name: 'volatility_overshoot_reversion',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['vol_spike_score', 'mean_reversion_z', 'liquidity_score'],
        tunable_parameters: [
          { name: 'vol_spike_threshold', default: 0.78, min: 0.5, max: 0.99 },
          { name: 'reversion_z_trigger', default: 1.8, min: 0.8, max: 4 },
          { name: 'max_hold_bars', default: 3, min: 1, max: 8 },
        ],
        compatible_regimes: ['range_high_vol', 'high_volatility'],
        expected_holding_horizon: '1-3 bars',
        cost_sensitivity_assumptions: 'Medium-high; requires strict entry discipline.',
        risk_profile: 'vol_overshoot_reversion',
        activation_conditions: ['overshoot confirmed and liquidity remains available'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
      },
      {
        strategy_template_name: 'percentile_zscore_reversion',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['percentile_rank', 'zscore_lookback', 'reversion_speed'],
        tunable_parameters: [
          { name: 'percentile_extreme_cutoff', default: 0.9, min: 0.75, max: 0.99 },
          { name: 'zscore_cutoff', default: 2.1, min: 1, max: 4 },
          { name: 'reversion_timeout_bars', default: 5, min: 1, max: 14 },
        ],
        compatible_regimes: ['range', 'range_normal', 'range_high_vol'],
        expected_holding_horizon: '1-5 bars',
        cost_sensitivity_assumptions: 'Medium; best in liquid products.',
        risk_profile: 'percentile_reversion',
        activation_conditions: ['percentile and z-score jointly extreme'],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
      },
      {
        strategy_template_name: 'short_term_reversal',
        supported_asset_classes: ['US_STOCK'],
        required_inputs: ['ret_1d', 'ret_5d', 'liquidity_score', 'intraday_extension'],
        tunable_parameters: [
          { name: 'one_day_reversal_floor', default: 0.03, min: 0.01, max: 0.12 },
          { name: 'max_hold_days', default: 3, min: 1, max: 8 },
          { name: 'liquidity_floor', default: 0.55, min: 0.2, max: 0.95 },
        ],
        compatible_regimes: ['range', 'range_normal', 'range_high_vol'],
        expected_holding_horizon: '1-3 bars',
        cost_sensitivity_assumptions: 'High; reversal alpha disappears quickly once spreads widen.',
        risk_profile: 'short_horizon_reversal',
        activation_conditions: [
          'short-horizon move is stretched but not backed by structural trend confirmation',
        ],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
        public_reference_ids: ['ff_data_library', 'nber_pairs_trading'],
      },
      {
        strategy_template_name: 'pairs_spread_reversion',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: [
          'spread_zscore',
          'cointegration_proxy',
          'beta_balance',
          'liquidity_score',
        ],
        tunable_parameters: [
          { name: 'spread_entry_z', default: 2.0, min: 1, max: 4 },
          { name: 'spread_exit_z', default: 0.4, min: 0.1, max: 1.5 },
          { name: 'max_pair_hold_bars', default: 10, min: 2, max: 30 },
        ],
        compatible_regimes: ['range', 'range_normal', 'range_high_vol'],
        expected_holding_horizon: '2-10 bars',
        cost_sensitivity_assumptions:
          'Medium-high; borrow, spread, and slippage assumptions matter.',
        risk_profile: 'relative_value_reversion',
        activation_conditions: [
          'pair spread is statistically stretched while residual trend remains weak',
        ],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
        public_reference_ids: ['nber_pairs_trading'],
      },
    ],
  },
  {
    family_name: 'Regime Transition',
    templates: [
      {
        strategy_template_name: 'trend_to_range_transition',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['trend_decay_score', 'range_probability', 'breadth_rotation'],
        tunable_parameters: [
          { name: 'trend_decay_min', default: 0.55, min: 0.3, max: 0.9 },
          { name: 'range_prob_min', default: 0.6, min: 0.4, max: 0.95 },
          { name: 'cooldown_bars', default: 2, min: 0, max: 10 },
        ],
        compatible_regimes: ['range', 'transition'],
        expected_holding_horizon: '2-6 bars',
        cost_sensitivity_assumptions: 'Medium; transition noise can increase churn',
        risk_profile: 'transition_adaptive',
        activation_conditions: ['trend confidence decay', 'range odds rising'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
      },
      {
        strategy_template_name: 'volatility_regime_switch',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['vol_percentile', 'vol_acceleration', 'cross_market_stress'],
        tunable_parameters: [
          { name: 'high_vol_threshold', default: 0.75, min: 0.55, max: 0.95 },
          { name: 'sizing_cut_multiplier', default: 0.55, min: 0.2, max: 0.9 },
          { name: 'stabilization_window', default: 3, min: 1, max: 12 },
        ],
        compatible_regimes: ['high_volatility', 'risk_off', 'transition'],
        expected_holding_horizon: '1-4 bars',
        cost_sensitivity_assumptions: 'High; slippage can spike during transitions',
        risk_profile: 'volatility_switch_defensive',
        activation_conditions: ['volatility regime flip detected', 'risk controls active'],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
      },
      {
        strategy_template_name: 'risk_on_to_risk_off_transition',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['risk_on_off_score', 'breadth_decay', 'cross_asset_stress'],
        tunable_parameters: [
          { name: 'risk_off_score_trigger', default: 0.62, min: 0.45, max: 0.95 },
          { name: 'position_cut_multiplier', default: 0.5, min: 0.15, max: 0.9 },
          { name: 'transition_confirmation_bars', default: 2, min: 1, max: 8 },
        ],
        compatible_regimes: ['risk_off', 'stress_risk_off', 'transition'],
        expected_holding_horizon: '1-4 bars',
        cost_sensitivity_assumptions:
          'Medium; risk reduction logic has priority over edge capture.',
        risk_profile: 'defensive_transition',
        activation_conditions: ['risk-on to risk-off shift confirmed'],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
      },
      {
        strategy_template_name: 'false_breakout_failed_trend_capture',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['breakout_failure_rate', 'retest_fail_signal', 'trend_confidence'],
        tunable_parameters: [
          { name: 'failure_confirmation_bars', default: 2, min: 1, max: 10 },
          { name: 'trend_confidence_cap', default: 0.48, min: 0.2, max: 0.7 },
          { name: 'max_hold_bars', default: 4, min: 1, max: 12 },
        ],
        compatible_regimes: ['range', 'range_high_vol', 'downtrend_normal'],
        expected_holding_horizon: '1-4 bars',
        cost_sensitivity_assumptions: 'Medium-high due to reversal slippage risk.',
        risk_profile: 'failed_trend_capture',
        activation_conditions: ['breakout failure and retest rejection align'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
      },
    ],
  },
  {
    family_name: 'Relative Strength',
    templates: [
      {
        strategy_template_name: 'sector_strength_rotation',
        supported_asset_classes: ['US_STOCK'],
        required_inputs: ['sector_rel_strength', 'breadth', 'leadership_dispersion'],
        tunable_parameters: [
          { name: 'top_sector_rank_cutoff', default: 0.2, min: 0.05, max: 0.5 },
          { name: 'rotation_holding_days', default: 5, min: 2, max: 20 },
          { name: 'sector_cap_pct', default: 30, min: 10, max: 45 },
        ],
        compatible_regimes: ['trend', 'risk_recovery', 'range_normal'],
        expected_holding_horizon: '3-12 bars',
        cost_sensitivity_assumptions: 'Low in liquid sector ETFs, medium in single names',
        risk_profile: 'cross_sectional_leadership',
        activation_conditions: ['sector breadth supports rotation'],
        lifecycle_stage: LIFECYCLE_STAGE.PROD,
      },
      {
        strategy_template_name: 'cross_asset_momentum',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['cross_asset_rank', 'beta_adjusted_momentum', 'risk_on_off'],
        tunable_parameters: [
          { name: 'momentum_rank_cutoff', default: 0.25, min: 0.05, max: 0.5 },
          { name: 'rebalance_frequency_days', default: 3, min: 1, max: 14 },
          { name: 'correlation_limit', default: 0.85, min: 0.6, max: 0.98 },
        ],
        compatible_regimes: ['trend', 'risk_recovery', 'range'],
        expected_holding_horizon: '2-8 bars',
        cost_sensitivity_assumptions: 'Medium; rebalance frequency dominates turnover cost',
        risk_profile: 'cross_asset_rotation',
        activation_conditions: ['cross-market leadership is stable'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
      },
      {
        strategy_template_name: 'basket_rank_momentum',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['basket_rank', 'rank_trend', 'turnover_cost_proxy'],
        tunable_parameters: [
          { name: 'top_rank_cutoff', default: 0.2, min: 0.05, max: 0.5 },
          { name: 'rebalance_days', default: 5, min: 1, max: 20 },
          { name: 'max_turnover_pct', default: 0.35, min: 0.1, max: 0.8 },
        ],
        compatible_regimes: ['trend', 'uptrend_normal', 'risk_recovery'],
        expected_holding_horizon: '3-12 bars',
        cost_sensitivity_assumptions: 'Medium due to rebalance frequency.',
        risk_profile: 'rank_rotation',
        activation_conditions: ['rank persistence above threshold'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
      },
      {
        strategy_template_name: 'leader_laggard_pair',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['leader_score', 'laggard_score', 'spread_zscore'],
        tunable_parameters: [
          { name: 'spread_entry_z', default: 1.5, min: 0.8, max: 3.5 },
          { name: 'pair_exit_z', default: 0.4, min: 0.1, max: 1.2 },
          { name: 'max_pair_hold_bars', default: 6, min: 1, max: 20 },
        ],
        compatible_regimes: ['range', 'range_normal', 'uptrend_normal', 'downtrend_normal'],
        expected_holding_horizon: '2-8 bars',
        cost_sensitivity_assumptions: 'Medium-high if pair turnover rises.',
        risk_profile: 'relative_pair',
        activation_conditions: ['leader-laggard spread reaches statistically significant extreme'],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
      },
      {
        strategy_template_name: 'cross_sectional_value_quality',
        supported_asset_classes: ['US_STOCK'],
        required_inputs: [
          'value_rank',
          'quality_rank',
          'profitability_proxy',
          'investment_discipline_proxy',
        ],
        tunable_parameters: [
          { name: 'top_decile_cutoff', default: 0.15, min: 0.05, max: 0.35 },
          { name: 'rebalance_days', default: 20, min: 5, max: 60 },
          { name: 'quality_weight', default: 0.55, min: 0.2, max: 0.8 },
        ],
        compatible_regimes: ['trend', 'range_normal', 'risk_recovery'],
        expected_holding_horizon: '10-40 bars',
        cost_sensitivity_assumptions:
          'Low-medium; turnover is manageable when rebalanced on slower cadence.',
        risk_profile: 'value_quality_rank',
        activation_conditions: ['cheap and high-quality names remain supported by healthy breadth'],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
        public_reference_ids: ['ff_5_factor', 'aqr_qmj', 'aqr_vme'],
      },
      {
        strategy_template_name: 'betting_against_beta_defensive',
        supported_asset_classes: ['US_STOCK'],
        required_inputs: ['beta_rank', 'realized_volatility', 'drawdown_rank', 'sector_balance'],
        tunable_parameters: [
          { name: 'low_beta_cutoff', default: 0.3, min: 0.1, max: 0.5 },
          { name: 'rebalance_days', default: 10, min: 3, max: 30 },
          { name: 'sector_cap_pct', default: 25, min: 10, max: 40 },
        ],
        compatible_regimes: ['risk_off', 'range_normal', 'high_volatility', 'risk_recovery'],
        expected_holding_horizon: '5-20 bars',
        cost_sensitivity_assumptions:
          'Low in liquid large caps and ETFs; suited to defensive rotation.',
        risk_profile: 'defensive_low_beta',
        activation_conditions: ['beta dispersion is wide and defensive basket remains liquid'],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
        public_reference_ids: ['aqr_bab'],
      },
      {
        strategy_template_name: 'factor_momentum_rotation',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: [
          'factor_return_rank',
          'factor_dispersion',
          'crowding_proxy',
          'breadth_confirmation',
        ],
        tunable_parameters: [
          { name: 'factor_rank_cutoff', default: 0.3, min: 0.1, max: 0.5 },
          { name: 'rebalance_days', default: 5, min: 1, max: 20 },
          { name: 'crowding_cap', default: 0.75, min: 0.4, max: 0.95 },
        ],
        compatible_regimes: ['trend', 'risk_recovery', 'transition'],
        expected_holding_horizon: '3-12 bars',
        cost_sensitivity_assumptions:
          'Medium; factor rotations can churn if crowding rises too far.',
        risk_profile: 'factor_rotation',
        activation_conditions: ['winning factors remain persistent while breadth stays healthy'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
        public_reference_ids: ['aqr_factor_momentum'],
      },
    ],
  },
  {
    family_name: 'Crypto-Specific',
    templates: [
      {
        strategy_template_name: 'funding_dislocation',
        supported_asset_classes: ['CRYPTO'],
        required_inputs: [
          'funding_rate',
          'funding_zscore',
          'basis_annualized',
          'open_interest_change',
        ],
        tunable_parameters: [
          { name: 'funding_extreme_z', default: 2, min: 1, max: 4 },
          { name: 'basis_confirmation_min', default: 0.1, min: -0.2, max: 0.6 },
          { name: 'max_leverage_cap', default: 1.5, min: 1, max: 3 },
        ],
        compatible_regimes: ['range', 'high_volatility', 'risk_off'],
        expected_holding_horizon: '1-6 bars',
        cost_sensitivity_assumptions: 'High; funding + slippage + spread all matter',
        risk_profile: 'carry_dislocation',
        activation_conditions: ['funding dislocation beyond threshold', 'liquidity still tradable'],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
      },
      {
        strategy_template_name: 'basis_compression_expansion',
        supported_asset_classes: ['CRYPTO'],
        required_inputs: ['basis_annualized', 'term_structure', 'spot_perp_spread'],
        tunable_parameters: [
          { name: 'compression_threshold_bps', default: 25, min: 5, max: 120 },
          { name: 'expansion_threshold_bps', default: 45, min: 10, max: 180 },
          { name: 'execution_window_hours', default: 8, min: 1, max: 48 },
        ],
        compatible_regimes: ['trend', 'range', 'high_volatility'],
        expected_holding_horizon: '1-8 bars',
        cost_sensitivity_assumptions: 'High for smaller alts; medium for BTC/ETH',
        risk_profile: 'basis_structure',
        activation_conditions: ['basis state shift validated by flow'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
      },
      {
        strategy_template_name: 'carry_oriented_setup',
        supported_asset_classes: ['CRYPTO'],
        required_inputs: ['funding_trend', 'basis_term_structure', 'carry_score'],
        tunable_parameters: [
          { name: 'carry_score_min', default: 0.55, min: 0.3, max: 0.95 },
          { name: 'carry_decay_exit', default: 0.2, min: 0.05, max: 0.6 },
          { name: 'carry_hold_bars', default: 8, min: 2, max: 32 },
        ],
        compatible_regimes: ['trend', 'range_normal', 'risk_recovery'],
        expected_holding_horizon: '4-16 bars',
        cost_sensitivity_assumptions: 'High when funding and basis swing rapidly.',
        risk_profile: 'carry_capture',
        activation_conditions: ['carry remains positive without stress escalation'],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
      },
      {
        strategy_template_name: 'velocity_shock',
        supported_asset_classes: ['CRYPTO'],
        required_inputs: ['velocity_score', 'acceleration_shock', 'liquidation_imbalance'],
        tunable_parameters: [
          { name: 'shock_threshold', default: 0.7, min: 0.4, max: 0.98 },
          { name: 'cooldown_bars', default: 2, min: 0, max: 8 },
          { name: 'size_cap_pct', default: 0.35, min: 0.1, max: 0.8 },
        ],
        compatible_regimes: ['high_volatility', 'downtrend_high_vol', 'uptrend_high_vol'],
        expected_holding_horizon: '0.5-3 bars',
        cost_sensitivity_assumptions: 'Very high; strict slippage guard required.',
        risk_profile: 'shock_response',
        activation_conditions: ['velocity shock with validated continuation or exhaustion'],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
      },
      {
        strategy_template_name: 'exchange_divergence_stress_proxy',
        supported_asset_classes: ['CRYPTO'],
        required_inputs: ['cross_exchange_spread', 'basis_divergence', 'liquidity_split'],
        tunable_parameters: [
          { name: 'divergence_threshold_bps', default: 20, min: 5, max: 90 },
          { name: 'max_holding_bars', default: 4, min: 1, max: 12 },
          { name: 'execution_confidence_min', default: 0.6, min: 0.3, max: 0.95 },
        ],
        compatible_regimes: ['high_volatility', 'stress_risk_off', 'risk_off'],
        expected_holding_horizon: '1-4 bars',
        cost_sensitivity_assumptions: 'Very high due to venue dislocation and slippage risk.',
        risk_profile: 'exchange_stress_arb',
        activation_conditions: [
          'exchange divergence exceeds stress threshold with executable depth',
        ],
        lifecycle_stage: LIFECYCLE_STAGE.DRAFT,
      },
      {
        strategy_template_name: 'liquidity_stress',
        supported_asset_classes: ['CRYPTO'],
        required_inputs: [
          'depth_imbalance',
          'spread_bps',
          'liquidation_pressure',
          'velocity_shock',
        ],
        tunable_parameters: [
          { name: 'max_spread_bps', default: 18, min: 6, max: 60 },
          { name: 'liquidation_pressure_cap', default: 0.7, min: 0.3, max: 0.95 },
          { name: 'position_scale_floor', default: 0.2, min: 0.05, max: 0.8 },
        ],
        compatible_regimes: ['high_volatility', 'risk_off'],
        expected_holding_horizon: '0.5-3 bars',
        cost_sensitivity_assumptions: 'Very high; execution assumptions dominate expected edge',
        risk_profile: 'stress_defensive',
        activation_conditions: ['stress detected but not full market dislocation'],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
      },
      {
        strategy_template_name: 'funding_basis_carry_capture',
        supported_asset_classes: ['CRYPTO'],
        required_inputs: [
          'funding_rate',
          'basis_annualized',
          'carry_score',
          'basis_term_structure',
        ],
        tunable_parameters: [
          { name: 'carry_score_floor', default: 0.58, min: 0.35, max: 0.95 },
          { name: 'basis_confirmation_bps', default: 12, min: 3, max: 80 },
          { name: 'max_hold_bars', default: 12, min: 2, max: 40 },
        ],
        compatible_regimes: ['range', 'range_normal', 'risk_recovery', 'trend'],
        expected_holding_horizon: '4-20 bars',
        cost_sensitivity_assumptions:
          'Medium-high; carry must dominate fees, spread, and basis mean reversion risk.',
        risk_profile: 'systematic_carry',
        activation_conditions: [
          'carry remains positive and market stress is not compressing the basis aggressively',
        ],
        lifecycle_stage: LIFECYCLE_STAGE.CANARY,
        public_reference_ids: ['aqr_vme'],
      },
      {
        strategy_template_name: 'crypto_attention_momentum',
        supported_asset_classes: ['CRYPTO'],
        required_inputs: [
          'news_shock_proxy',
          'volume_expansion',
          'relative_strength',
          'funding_acceleration',
        ],
        tunable_parameters: [
          { name: 'attention_score_floor', default: 0.65, min: 0.35, max: 0.98 },
          { name: 'holding_bars', default: 4, min: 1, max: 12 },
          { name: 'funding_acceleration_cap', default: 0.8, min: 0.2, max: 0.98 },
        ],
        compatible_regimes: ['trend', 'uptrend_high_vol', 'risk_recovery'],
        expected_holding_horizon: '1-6 bars',
        cost_sensitivity_assumptions:
          'High; attention bursts decay quickly and require tight execution discipline.',
        risk_profile: 'attention_momentum',
        activation_conditions: [
          'attention shock aligns with relative strength and funding is not yet fully crowded',
        ],
        lifecycle_stage: LIFECYCLE_STAGE.SHADOW,
        public_reference_ids: ['aqr_trend_following'],
      },
    ],
  },
  {
    family_name: 'Future Overlay (Optional)',
    templates: [
      {
        strategy_template_name: 'event_aware_filter_overlay',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['event_risk_score', 'calendar_proximity', 'gap_risk'],
        tunable_parameters: [{ name: 'event_risk_cap', default: 0.7, min: 0.3, max: 0.99 }],
        compatible_regimes: ['all'],
        expected_holding_horizon: 'overlay',
        cost_sensitivity_assumptions: 'N/A overlay',
        risk_profile: 'event_overlay',
        activation_conditions: ['used as additional filter before execution'],
        lifecycle_stage: LIFECYCLE_STAGE.DRAFT,
      },
      {
        strategy_template_name: 'options_flow_overlay',
        supported_asset_classes: ['US_STOCK'],
        required_inputs: ['options_flow_imbalance', 'iv_skew_shift', 'gamma_pressure'],
        tunable_parameters: [{ name: 'flow_signal_min', default: 0.6, min: 0.3, max: 0.95 }],
        compatible_regimes: ['trend', 'range', 'high_volatility'],
        expected_holding_horizon: 'overlay',
        cost_sensitivity_assumptions: 'N/A overlay',
        risk_profile: 'options_overlay',
        activation_conditions: ['overlay only; no standalone execution'],
        lifecycle_stage: LIFECYCLE_STAGE.DRAFT,
      },
      {
        strategy_template_name: 'sentiment_overlay',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['sentiment_score', 'sentiment_dispersion', 'news_shock_proxy'],
        tunable_parameters: [{ name: 'sentiment_weight_cap', default: 0.25, min: 0.05, max: 0.5 }],
        compatible_regimes: ['all'],
        expected_holding_horizon: 'overlay',
        cost_sensitivity_assumptions: 'N/A overlay',
        risk_profile: 'sentiment_overlay',
        activation_conditions: ['auxiliary confidence adjuster only'],
        lifecycle_stage: LIFECYCLE_STAGE.DRAFT,
      },
      {
        strategy_template_name: 'vol_surface_overlay',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['term_structure_slope', 'skew_surface_proxy', 'vol_of_vol'],
        tunable_parameters: [{ name: 'vol_surface_alert_min', default: 0.65, min: 0.2, max: 0.99 }],
        compatible_regimes: ['high_volatility', 'risk_off'],
        expected_holding_horizon: 'overlay',
        cost_sensitivity_assumptions: 'N/A overlay',
        risk_profile: 'vol_surface_overlay',
        activation_conditions: ['future compatible overlay feature'],
        lifecycle_stage: LIFECYCLE_STAGE.DRAFT,
      },
      {
        strategy_template_name: 'turn_of_month_overlay',
        supported_asset_classes: ['US_STOCK'],
        required_inputs: ['calendar_proximity', 'seasonality_score', 'breadth_confirmation'],
        tunable_parameters: [{ name: 'tom_window_days', default: 4, min: 2, max: 8 }],
        compatible_regimes: ['trend', 'range_normal', 'risk_recovery'],
        expected_holding_horizon: 'overlay',
        cost_sensitivity_assumptions:
          'Low; overlay is only meant to tilt entry timing, not replace signal quality.',
        risk_profile: 'calendar_overlay',
        activation_conditions: [
          'calendar tailwind is present and core signal already passed quality gates',
        ],
        lifecycle_stage: LIFECYCLE_STAGE.DRAFT,
        public_reference_ids: ['ff_data_library'],
      },
      {
        strategy_template_name: 'factor_rotation_overlay',
        supported_asset_classes: ['US_STOCK', 'CRYPTO'],
        required_inputs: ['factor_return_rank', 'factor_dispersion', 'regime_transition_score'],
        tunable_parameters: [
          { name: 'factor_overlay_weight_cap', default: 0.2, min: 0.05, max: 0.4 },
        ],
        compatible_regimes: ['trend', 'transition', 'risk_recovery'],
        expected_holding_horizon: 'overlay',
        cost_sensitivity_assumptions:
          'Low as a sizing overlay, but should not override hard risk controls.',
        risk_profile: 'factor_overlay',
        activation_conditions: [
          'factor leadership is persistent enough to justify tilting toward compatible families',
        ],
        lifecycle_stage: LIFECYCLE_STAGE.DRAFT,
        public_reference_ids: ['aqr_factor_momentum'],
      },
    ],
  },
]);

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function lifecycleFromLegacyStage(stage) {
  const normalized = slugify(stage);
  if (normalized === 'champion' || normalized === 'prod') return LIFECYCLE_STAGE.PROD;
  if (normalized === 'candidate' || normalized === 'paper' || normalized === 'canary')
    return LIFECYCLE_STAGE.CANARY;
  if (normalized === 'testing' || normalized === 'challenger' || normalized === 'shadow')
    return LIFECYCLE_STAGE.SHADOW;
  if (normalized === 'retired' || normalized === 'retire') return LIFECYCLE_STAGE.RETIRE;
  return LIFECYCLE_STAGE.DRAFT;
}

function inferFamilyByStrategyId(strategyId) {
  const id = String(strategyId || '').toUpperCase();
  if (id.includes('VEL') || id.includes('SWING') || id.includes('BREAK') || id.includes('MOM')) {
    return 'Momentum / Trend';
  }
  if (id.includes('MR') || id.includes('REV')) {
    return 'Mean Reversion';
  }
  if (id.includes('REG') || id.includes('RISK') || id.includes('TRANS')) {
    return 'Regime Transition';
  }
  if (id.includes('REL') || id.includes('RS') || id.includes('LEADER')) {
    return 'Relative Strength';
  }
  if (id.includes('CR_') || id.includes('CRYPTO') || id.includes('BAS') || id.includes('CARRY')) {
    return 'Crypto-Specific';
  }
  return 'Momentum / Trend';
}

function flattenTemplates(families) {
  const rows = [];
  for (const family of families) {
    for (const template of family.templates) {
      const defaults = {
        validation_requirements:
          template.validation_requirements || TEMPLATE_DEFAULTS.validation_requirements,
        compatible_filters: template.compatible_filters || TEMPLATE_DEFAULTS.compatible_filters,
        governance_hooks: template.governance_hooks || TEMPLATE_DEFAULTS.governance_hooks,
      };
      rows.push({
        template_id: `${slugify(family.family_name)}__${slugify(template.strategy_template_name)}`,
        family_name: family.family_name,
        ...defaults,
        ...template,
      });
    }
  }
  return rows;
}

function mapExistingStrategies(strategyRegistry = [], asOf) {
  return (strategyRegistry || []).map((row) => ({
    strategy_id: row.strategy_id,
    strategy_version:
      row?.notes?.find?.((item) => String(item).startsWith('version='))?.split('=')[1] || 'v1',
    inferred_family: inferFamilyByStrategyId(row.strategy_id),
    lifecycle_stage: lifecycleFromLegacyStage(row.current_stage),
    source_stage: row.current_stage,
    linked_model_ids: row.enabled_model_ids || [],
    linked_alpha_ids: row.enabled_alpha_ids || [],
    observed_at: asOf,
    governance_id: registryId('strategy_variant', row.strategy_id, asOf.slice(0, 10)),
  }));
}

export function listStrategyFamilyTemplates() {
  return flattenTemplates(FAMILY_REGISTRY);
}

export function buildStrategyFamilyRegistry({
  asOf = new Date().toISOString(),
  strategyRegistry = [],
} = {}) {
  const templates = flattenTemplates(FAMILY_REGISTRY);
  const liveVariants = mapExistingStrategies(strategyRegistry, asOf);

  const familyCoverage = FAMILY_REGISTRY.map((family) => ({
    family_name: family.family_name,
    template_count: family.templates.length,
    lifecycle_distribution: family.templates.reduce((acc, item) => {
      const key = item.lifecycle_stage;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    supported_asset_classes: [
      ...new Set(family.templates.flatMap((item) => item.supported_asset_classes)),
    ],
  }));

  return {
    generated_at: asOf,
    registry_version: 'strategy-family-registry.v1',
    family_count: FAMILY_REGISTRY.length,
    template_count: templates.length,
    families: FAMILY_REGISTRY,
    templates,
    family_coverage: familyCoverage,
    strategy_variants: liveVariants,
    extensibility_note:
      'Add a new family by appending a family object with template metadata and activation conditions.',
  };
}

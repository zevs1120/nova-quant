function toKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

const FEATURE_SUPPORT = Object.freeze({
  ret_1d: {
    status: 'measured',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derived directly from persisted OHLCV bars.',
  },
  ret_5d: {
    status: 'measured',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derived directly from persisted OHLCV bars.',
  },
  ret_20d: {
    status: 'measured',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Covered by the current momentum measurement pipeline.',
  },
  ret_60d: {
    status: 'measured',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Covered by the current momentum measurement pipeline.',
  },
  residual_return_20d: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable by subtracting market-proxy beta return from symbol return over synchronized OHLCV bars.',
  },
  residual_return_60d: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable by subtracting market-proxy beta return from symbol return over synchronized OHLCV bars.',
  },
  market_beta: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from covariance versus a market proxy using persisted OHLCV bars.',
  },
  market_drawdown_60d: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from the current market proxy OHLCV panel.',
  },
  market_rebound_5d: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from five-bar returns of the market proxy after a drawdown window.',
  },
  momentum_volatility: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable as realized volatility of a symbol or momentum sleeve over persisted return history.',
  },
  idiosyncratic_volatility: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from residual returns versus a market proxy using synchronized OHLCV bars.',
  },
  gap_survival: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK'],
    note: 'Derivable by checking whether the post-event open/close keeps trading beyond the event gap midpoint.',
  },
  distance_to_52w_high: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from rolling 252-bar highs in persisted OHLCV history.',
  },
  rolling_high_252d: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from persisted OHLCV bars and reusable by 52-week-high anchor signals.',
  },
  rolling_sharpe: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from rolling bar returns and volatility over the current OHLCV store.',
  },
  realized_volatility_rank: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable by ranking realized volatility across the current bar panel.',
  },
  funding_rate: {
    status: 'measured',
    asset_classes: ['CRYPTO'],
    note: 'Persisted in the crypto funding-rate store.',
  },
  basis_annualized: {
    status: 'measured',
    asset_classes: ['CRYPTO'],
    note: 'Supported through persisted basis history and carry diagnostics.',
  },
  liquidity_score: {
    status: 'measured',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Supported through rolling dollar-volume and illiquidity proxies.',
  },
  realized_volatility: {
    status: 'measured',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Supported through realized-volatility calculations on OHLCV bars.',
  },
  trend_slope: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from current OHLCV history; only a dedicated adapter is missing.',
  },
  volatility_filter: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from current OHLCV volatility history and threshold adapters.',
  },
  breakout_distance: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from rolling highs/lows in persisted bar history.',
  },
  breakout_percentile: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from rolling highs/lows in persisted bar history.',
  },
  trend_strength: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Available as a runtime concept and derivable from bar trends.',
  },
  volume_expansion: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from persisted volume history and rolling ADV baselines.',
  },
  vol_percentile: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from realized-volatility history.',
  },
  range_breakout: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from OHLCV range compression and breakout state.',
  },
  zscore_lookback: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from rolling return and price-deviation statistics.',
  },
  spread_bps: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Supported conceptually by execution realism; dedicated persistence is still thin.',
  },
  liquidation_imbalance: {
    status: 'adapter_ready',
    asset_classes: ['CRYPTO'],
    note: 'Requires a dedicated crypto stress adapter, but fits the current market-state model.',
  },
  funding_zscore: {
    status: 'adapter_ready',
    asset_classes: ['CRYPTO'],
    note: 'Derivable from persisted funding-rate history.',
  },
  carry_score: {
    status: 'adapter_ready',
    asset_classes: ['CRYPTO'],
    note: 'Derivable from funding and basis history already stored in the runtime.',
  },
  basis_term_structure: {
    status: 'adapter_ready',
    asset_classes: ['CRYPTO'],
    note: 'Needs a dedicated term-structure adapter on top of the basis store.',
  },
  open_interest_change: {
    status: 'adapter_ready',
    asset_classes: ['CRYPTO'],
    note: 'Can be wired once derivative venue snapshots are normalized into the runtime feed.',
  },
  cross_asset_rank: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from synchronized cross-sectional return panels.',
  },
  basket_rank: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from synchronized cross-sectional return panels.',
  },
  relative_strength: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from cross-sectional momentum ranks already aligned with current bars.',
  },
  sector_relative_strength: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK'],
    note: 'Needs a sector-mapping adapter on top of current cross-sectional returns.',
  },
  breadth_ratio: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Needs a breadth adapter, but current market-state overlays already use related posture logic.',
  },
  breadth_confirmation: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Needs a breadth adapter, but the regime overlay path is already present.',
  },
  beta_rank: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK'],
    note: 'Derivable from relative market beta computed over existing OHLCV history.',
  },
  drawdown_rank: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from rolling drawdown history in current bars.',
  },
  sector_balance: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK'],
    note: 'Needs asset taxonomy enrichment, but not a new research architecture.',
  },
  spread_zscore: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Derivable from synchronized pair spreads using existing OHLCV history.',
  },
  cointegration_proxy: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Needs a pair-statistics adapter on top of synchronized OHLCV history.',
  },
  beta_balance: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Needs a pair-level risk-balancing adapter built from current bars.',
  },
  event_gap_strength: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK'],
    note: 'Derivable from daily gap statistics without new external data.',
  },
  post_event_volume: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK'],
    note: 'Derivable from persisted daily volume history.',
  },
  intraday_extension: {
    status: 'adapter_ready',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Can be approximated with shorter-bar extensions where intraday bars exist.',
  },
  value_rank: {
    status: 'blocked_missing_data',
    asset_classes: ['US_STOCK'],
    note: 'Requires fundamental valuation history that is not yet persisted in the runtime store.',
  },
  quality_rank: {
    status: 'blocked_missing_data',
    asset_classes: ['US_STOCK'],
    note: 'Requires fundamental quality history that is not yet persisted in the runtime store.',
  },
  profitability_proxy: {
    status: 'blocked_missing_data',
    asset_classes: ['US_STOCK'],
    note: 'Requires fundamental profitability history that is not yet persisted in the runtime store.',
  },
  investment_discipline_proxy: {
    status: 'blocked_missing_data',
    asset_classes: ['US_STOCK'],
    note: 'Requires balance-sheet and investment data not yet in the runtime store.',
  },
  analyst_revision_proxy: {
    status: 'blocked_missing_data',
    asset_classes: ['US_STOCK'],
    note: 'Requires estimate-revision history not yet ingested into the runtime store.',
  },
  factor_return_rank: {
    status: 'blocked_missing_data',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Requires persisted factor-return history that is not yet a first-class artifact.',
  },
  factor_dispersion: {
    status: 'blocked_missing_data',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Requires persisted factor-return cross-sections that are not yet stored.',
  },
  crowding_proxy: {
    status: 'blocked_missing_data',
    asset_classes: ['US_STOCK', 'CRYPTO'],
    note: 'Requires dedicated crowding or positioning data that is not yet available.',
  },
  social_attention_zscore: {
    status: 'blocked_missing_data',
    asset_classes: ['CRYPTO'],
    note: 'Requires alternative attention data that is not yet available in the runtime.',
  },
  attention_burst: {
    status: 'blocked_missing_data',
    asset_classes: ['CRYPTO'],
    note: 'Requires alternative attention data that is not yet available in the runtime.',
  },
});

const FEATURE_ALIASES = Object.freeze({
  ma_alignment: 'trend_strength',
  trend_age: 'trend_strength',
  multi_day_return: 'ret_20d',
  beta_adjusted_momentum: 'residual_return_20d',
  idiosyncratic_momentum: 'residual_return_20d',
  market_drawdown: 'market_drawdown_60d',
  market_snapback: 'market_rebound_5d',
  post_gap_hold: 'gap_survival',
  price_to_52w_high: 'distance_to_52w_high',
  fifty_two_week_high_distance: 'distance_to_52w_high',
  rolling_return_sharpe: 'rolling_sharpe',
  atr_14: 'realized_volatility',
  iv_hv_spread: 'realized_volatility',
  range_expansion: 'range_breakout',
  percentile_rank: 'zscore_lookback',
  vwap_deviation: 'zscore_lookback',
  reversion_speed: 'zscore_lookback',
  extension_threshold: 'zscore_lookback',
  risk_on_off_score: 'breadth_ratio',
  sector_rotation_strength: 'breadth_ratio',
  credit_stress_proxy: 'breadth_ratio',
  spot_perp_spread: 'basis_annualized',
  order_imbalance: 'spread_bps',
  velocity_shock: 'spread_bps',
});

function unique(values = []) {
  return [...new Set((values || []).map((item) => toKey(item)).filter(Boolean))];
}

function supportsAssetClass(featureRow, assetClasses = []) {
  if (!featureRow?.asset_classes?.length || !assetClasses.length) return true;
  const expected = new Set(assetClasses.map((item) => String(item).toUpperCase()));
  return featureRow.asset_classes.some((item) => expected.has(String(item).toUpperCase()));
}

export function resolveRuntimeFeatureSupport(feature, assetClasses = []) {
  const normalizedFeature = toKey(feature);
  const canonicalFeature = FEATURE_ALIASES[normalizedFeature] || normalizedFeature;
  const row = FEATURE_SUPPORT[canonicalFeature];

  if (!row) {
    return {
      feature: normalizedFeature,
      canonical_feature: canonicalFeature,
      status: 'blocked_missing_data',
      asset_classes: assetClasses,
      note: 'No runtime adapter or persisted data path exists for this feature yet.',
    };
  }

  if (!supportsAssetClass(row, assetClasses)) {
    return {
      feature: normalizedFeature,
      canonical_feature: canonicalFeature,
      status: 'blocked_missing_data',
      asset_classes: row.asset_classes,
      note: 'This feature exists conceptually, but not for the requested asset-class scope.',
    };
  }

  return {
    feature: normalizedFeature,
    canonical_feature: canonicalFeature,
    status: row.status,
    asset_classes: row.asset_classes,
    note: row.note,
  };
}

export function assessFeatureSet(features = [], assetClasses = []) {
  const rows = unique(features).map((feature) =>
    resolveRuntimeFeatureSupport(feature, assetClasses),
  );
  const measured = rows.filter((row) => row.status === 'measured');
  const adapterReady = rows.filter((row) => row.status === 'adapter_ready');
  const blocked = rows.filter((row) => row.status === 'blocked_missing_data');
  const total = rows.length;

  return {
    readiness: blocked.length
      ? 'blocked_missing_data'
      : adapterReady.length
        ? 'adapter_ready'
        : 'measured',
    features: rows,
    measured_features: measured.map((row) => row.feature),
    adapter_pending_features: adapterReady.map((row) => row.feature),
    blocking_features: blocked.map((row) => row.feature),
    summary: {
      total_features: total,
      measured_count: measured.length,
      adapter_ready_count: adapterReady.length,
      blocked_count: blocked.length,
      measured_ratio: total ? Number((measured.length / total).toFixed(4)) : 0,
      ready_ratio: total ? Number(((measured.length + adapterReady.length) / total).toFixed(4)) : 0,
    },
  };
}

export function scoreFeatureReadiness(features = [], assetClasses = []) {
  const support = assessFeatureSet(features, assetClasses);
  const {
    measured_ratio: measuredRatio,
    ready_ratio: readyRatio,
    blocked_count: blockedCount,
  } = support.summary;
  const blockedPenalty = Math.min(0.4, blockedCount * 0.08);
  return Math.max(0, Math.min(1, readyRatio * 0.72 + measuredRatio * 0.28 - blockedPenalty));
}

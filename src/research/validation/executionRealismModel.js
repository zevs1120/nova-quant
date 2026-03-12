import { clamp, round } from '../../engines/math.js';

export const FILL_POLICIES = Object.freeze({
  TOUCH_BASED: 'touch_based',
  BAR_CROSS_BASED: 'bar_cross_based',
  CONSERVATIVE_FILL: 'conservative_fill',
  OPTIMISTIC_FILL: 'optimistic_fill'
});

const DEFAULT_EXECUTION_REALISM_PROFILES = Object.freeze({
  replay: Object.freeze({
    profile_id: 'exec-realism.replay.v2',
    mode: 'replay',
    allow_optimistic_fill_policy: false,
    fill_policy: {
      entry: FILL_POLICIES.BAR_CROSS_BASED,
      exit: FILL_POLICIES.CONSERVATIVE_FILL
    },
    markets: {
      US: {
        fee_bps_per_side: 2.8,
        funding_bps_per_day: 0,
        leverage_cap: 2,
        fill_policy: {
          entry: FILL_POLICIES.BAR_CROSS_BASED,
          exit: FILL_POLICIES.CONSERVATIVE_FILL
        },
        spread_bps_by_vol_bucket: {
          low: 1.1,
          normal: 1.9,
          high: 3.4,
          stress: 5
        },
        slippage_bps_by_vol_bucket: {
          low: { entry: 2.2, exit: 2.5 },
          normal: { entry: 4, exit: 4.4 },
          high: { entry: 6.8, exit: 7.2 },
          stress: { entry: 9.5, exit: 10.5 }
        }
      },
      CRYPTO: {
        fee_bps_per_side: 4.5,
        funding_bps_per_day: 1.8,
        leverage_cap: 3,
        fill_policy: {
          entry: FILL_POLICIES.BAR_CROSS_BASED,
          exit: FILL_POLICIES.CONSERVATIVE_FILL
        },
        spread_bps_by_vol_bucket: {
          low: 1.6,
          normal: 3.2,
          high: 6,
          stress: 9.4
        },
        slippage_bps_by_vol_bucket: {
          low: { entry: 3.2, exit: 3.8 },
          normal: { entry: 6.2, exit: 6.9 },
          high: { entry: 10.4, exit: 11.5 },
          stress: { entry: 14.5, exit: 16.2 }
        }
      }
    },
    volatility_buckets: {
      low: { max_range_pct: 0.012, max_percentile: 25 },
      normal: { max_range_pct: 0.024, max_percentile: 65 },
      high: { max_range_pct: 0.045, max_percentile: 85 },
      stress: { max_range_pct: Infinity, max_percentile: 100 }
    },
    notes: [
      'Bar-level replay with explicit cost/fill assumptions.',
      'No queue-priority or tick-level simulation.',
      'Optimistic fill policy is disabled by default.'
    ]
  }),
  backtest: Object.freeze({
    profile_id: 'exec-realism.backtest.v2',
    mode: 'backtest',
    allow_optimistic_fill_policy: true,
    fill_policy: {
      entry: FILL_POLICIES.TOUCH_BASED,
      exit: FILL_POLICIES.BAR_CROSS_BASED
    },
    markets: {
      US: {
        fee_bps_per_side: 2.4,
        funding_bps_per_day: 0,
        leverage_cap: 2,
        spread_bps_by_vol_bucket: {
          low: 1,
          normal: 1.6,
          high: 3,
          stress: 4.2
        },
        slippage_bps_by_vol_bucket: {
          low: { entry: 1.8, exit: 2.1 },
          normal: { entry: 3.5, exit: 3.9 },
          high: { entry: 5.8, exit: 6.4 },
          stress: { entry: 8.2, exit: 9.1 }
        }
      },
      CRYPTO: {
        fee_bps_per_side: 4,
        funding_bps_per_day: 1.3,
        leverage_cap: 3,
        spread_bps_by_vol_bucket: {
          low: 1.4,
          normal: 2.8,
          high: 5.2,
          stress: 8.1
        },
        slippage_bps_by_vol_bucket: {
          low: { entry: 2.8, exit: 3.1 },
          normal: { entry: 5.2, exit: 5.8 },
          high: { entry: 8.8, exit: 9.7 },
          stress: { entry: 12.4, exit: 13.8 }
        }
      }
    },
    volatility_buckets: {
      low: { max_range_pct: 0.012, max_percentile: 25 },
      normal: { max_range_pct: 0.024, max_percentile: 65 },
      high: { max_range_pct: 0.045, max_percentile: 85 },
      stress: { max_range_pct: Infinity, max_percentile: 100 }
    },
    notes: [
      'Backtest assumptions are slightly less conservative than replay.',
      'Used for candidate-stage quick validation and synthetic walk-forward stress.'
    ]
  }),
  paper: Object.freeze({
    profile_id: 'exec-realism.paper.v2',
    mode: 'paper',
    allow_optimistic_fill_policy: false,
    fill_policy: {
      entry: FILL_POLICIES.CONSERVATIVE_FILL,
      exit: FILL_POLICIES.CONSERVATIVE_FILL
    },
    markets: {
      US: {
        fee_bps_per_side: 3,
        funding_bps_per_day: 0,
        leverage_cap: 2,
        spread_bps_by_vol_bucket: {
          low: 1.3,
          normal: 2.1,
          high: 3.8,
          stress: 5.4
        },
        slippage_bps_by_vol_bucket: {
          low: { entry: 2.5, exit: 2.8 },
          normal: { entry: 4.4, exit: 4.9 },
          high: { entry: 7.5, exit: 8.2 },
          stress: { entry: 10.4, exit: 11.5 }
        }
      },
      CRYPTO: {
        fee_bps_per_side: 5,
        funding_bps_per_day: 2.2,
        leverage_cap: 3,
        spread_bps_by_vol_bucket: {
          low: 1.8,
          normal: 3.5,
          high: 6.4,
          stress: 10
        },
        slippage_bps_by_vol_bucket: {
          low: { entry: 3.5, exit: 4.2 },
          normal: { entry: 6.8, exit: 7.8 },
          high: { entry: 11.2, exit: 12.5 },
          stress: { entry: 16, exit: 17.8 }
        }
      }
    },
    volatility_buckets: {
      low: { max_range_pct: 0.012, max_percentile: 25 },
      normal: { max_range_pct: 0.024, max_percentile: 65 },
      high: { max_range_pct: 0.045, max_percentile: 85 },
      stress: { max_range_pct: Infinity, max_percentile: 100 }
    },
    notes: [
      'Paper profile is the strictest default profile.',
      'Used for portfolio and governance realism stress.'
    ]
  })
});

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function mergeObjects(base = {}, override = {}) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    const baseValue = out[key];
    if (baseValue && value && typeof baseValue === 'object' && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = mergeObjects(baseValue, value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function modeKey(mode) {
  const key = String(mode || '').toLowerCase();
  if (key === 'backtest' || key === 'paper' || key === 'replay') return key;
  return 'replay';
}

function normalizeMarket(value) {
  const raw = String(value || '').toUpperCase();
  if (raw.includes('CRYPTO')) return 'CRYPTO';
  return 'US';
}

function normalizeFillPolicy(value, fallback, allowOptimistic = false) {
  const raw = String(value || '').toLowerCase();
  if (!raw) return fallback;

  if (raw === FILL_POLICIES.TOUCH_BASED || raw === 'limit_touch_mid') return FILL_POLICIES.TOUCH_BASED;
  if (raw === FILL_POLICIES.BAR_CROSS_BASED || raw === 'bar_cross') return FILL_POLICIES.BAR_CROSS_BASED;
  if (raw === FILL_POLICIES.CONSERVATIVE_FILL || raw === 'touch_price_with_adverse_slippage') return FILL_POLICIES.CONSERVATIVE_FILL;
  if (raw === FILL_POLICIES.OPTIMISTIC_FILL || raw === 'best_touch_for_trader') {
    return allowOptimistic ? FILL_POLICIES.OPTIMISTIC_FILL : fallback;
  }
  return fallback;
}

export function resolveExecutionRealismProfile({
  mode = 'replay',
  profile = {},
  overrides = {}
} = {}) {
  const key = modeKey(mode);
  const base = deepClone(DEFAULT_EXECUTION_REALISM_PROFILES[key] || DEFAULT_EXECUTION_REALISM_PROFILES.replay);
  const mergedProfile = mergeObjects(base, profile || {});
  const merged = mergeObjects(mergedProfile, overrides || {});
  return {
    ...merged,
    mode: key,
    profile_id: merged.profile_id || `exec-realism.${key}.custom`
  };
}

function bucketFromPercentile(percentile, profile) {
  if (!Number.isFinite(percentile)) return null;
  const buckets = profile?.volatility_buckets || {};
  if (percentile <= safeNumber(buckets.low?.max_percentile, 25)) return 'low';
  if (percentile <= safeNumber(buckets.normal?.max_percentile, 65)) return 'normal';
  if (percentile <= safeNumber(buckets.high?.max_percentile, 85)) return 'high';
  return 'stress';
}

function bucketFromRange(rangePct, profile) {
  const buckets = profile?.volatility_buckets || {};
  if (!Number.isFinite(rangePct)) return 'normal';
  if (rangePct <= safeNumber(buckets.low?.max_range_pct, 0.012)) return 'low';
  if (rangePct <= safeNumber(buckets.normal?.max_range_pct, 0.024)) return 'normal';
  if (rangePct <= safeNumber(buckets.high?.max_range_pct, 0.045)) return 'high';
  return 'stress';
}

export function inferVolatilityBucket({
  signal = {},
  bar = {},
  profile = DEFAULT_EXECUTION_REALISM_PROFILES.replay
} = {}) {
  const percentile = safeNumber(
    signal?.volatility_percentile ??
      signal?.risk_context?.volatility_percentile ??
      signal?.market_context?.volatility_percentile,
    NaN
  );
  const fromPct = bucketFromPercentile(percentile, profile);
  if (fromPct) return fromPct;

  const high = safeNumber(bar?.high, NaN);
  const low = safeNumber(bar?.low, NaN);
  const close = safeNumber(bar?.close, NaN);
  const rangePct = Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close) && close > 0
    ? (high - low) / close
    : NaN;

  return bucketFromRange(rangePct, profile);
}

function marketDefaults(profile, market) {
  const markets = profile?.markets || {};
  return markets[market] || markets.US || {};
}

function bucketedSpread(marketCfg = {}, bucket = 'normal') {
  return safeNumber(marketCfg?.spread_bps_by_vol_bucket?.[bucket], safeNumber(marketCfg?.spread_bps_by_vol_bucket?.normal, 2));
}

function bucketedSlippage(marketCfg = {}, bucket = 'normal') {
  const row = marketCfg?.slippage_bps_by_vol_bucket?.[bucket] || marketCfg?.slippage_bps_by_vol_bucket?.normal || {};
  return {
    entry: safeNumber(row.entry, 4),
    exit: safeNumber(row.exit, 4)
  };
}

export function resolveExecutionAssumptions({
  profile = DEFAULT_EXECUTION_REALISM_PROFILES.replay,
  signal = {},
  bar = {},
  mode = 'replay',
  fillPolicy = {}
} = {}) {
  const resolvedProfile = resolveExecutionRealismProfile({ mode, profile });
  const market = normalizeMarket(signal?.market || signal?.market_hint || signal?.asset_class);
  const bucket = inferVolatilityBucket({ signal, bar, profile: resolvedProfile });
  const marketCfg = marketDefaults(resolvedProfile, market);
  const spreadBps = bucketedSpread(marketCfg, bucket);
  const slippage = bucketedSlippage(marketCfg, bucket);
  const fillDefaults = {
    entry: marketCfg?.fill_policy?.entry || resolvedProfile?.fill_policy?.entry || FILL_POLICIES.TOUCH_BASED,
    exit: marketCfg?.fill_policy?.exit || resolvedProfile?.fill_policy?.exit || FILL_POLICIES.CONSERVATIVE_FILL
  };
  const allowOptimistic = Boolean(resolvedProfile.allow_optimistic_fill_policy);

  const entryPolicy = normalizeFillPolicy(
    fillPolicy?.entry || fillPolicy?.entry_fill_model,
    normalizeFillPolicy(fillDefaults.entry, FILL_POLICIES.TOUCH_BASED, allowOptimistic),
    allowOptimistic
  );
  const exitPolicy = normalizeFillPolicy(
    fillPolicy?.exit || fillPolicy?.exit_fill_model,
    normalizeFillPolicy(fillDefaults.exit, FILL_POLICIES.CONSERVATIVE_FILL, allowOptimistic),
    allowOptimistic
  );

  return {
    profile_id: resolvedProfile.profile_id,
    mode: resolvedProfile.mode,
    market,
    volatility_bucket: bucket,
    fee_bps_per_side: safeNumber(marketCfg?.fee_bps_per_side, 3),
    spread_bps: spreadBps,
    entry_slippage_bps: slippage.entry,
    exit_slippage_bps: slippage.exit,
    funding_bps_per_day: safeNumber(marketCfg?.funding_bps_per_day, 0),
    leverage_cap: safeNumber(marketCfg?.leverage_cap, 1),
    fill_policy: {
      entry: entryPolicy,
      exit: exitPolicy
    },
    realism_notes: [
      ...new Set([...(resolvedProfile?.notes || []), `Volatility bucket: ${bucket}`])
    ]
  };
}

export function adjustPriceForExecution({
  price = 0,
  direction = 'LONG',
  side = 'entry',
  slippageBps = 0,
  spreadBps = 0
} = {}) {
  const px = safeNumber(price, NaN);
  if (!Number.isFinite(px) || px <= 0) return NaN;

  const slip = safeNumber(slippageBps, 0) / 10000;
  const halfSpread = safeNumber(spreadBps, 0) / 20000;
  const isLong = String(direction || '').toUpperCase() !== 'SHORT';
  const burden = slip + halfSpread;

  if (side === 'entry') {
    return isLong ? px * (1 + burden) : px * (1 - burden);
  }
  return isLong ? px * (1 - burden) : px * (1 + burden);
}

export function normalizedTurnover(value) {
  const n = safeNumber(value, 0);
  return n > 2 ? clamp(n / 100, 0, 4) : clamp(n, 0, 4);
}

export function estimateCostDragPct({
  assumption = {},
  turnover = 0,
  holdingDays = 1,
  includeFunding = true
} = {}) {
  const tr = normalizedTurnover(turnover);
  const feeDrag = (safeNumber(assumption?.fee_bps_per_side, 0) * 2) / 10000;
  const spreadDrag = safeNumber(assumption?.spread_bps, 0) / 10000;
  const slippageDrag =
    (safeNumber(assumption?.entry_slippage_bps, 0) + safeNumber(assumption?.exit_slippage_bps, 0)) / 10000;
  const fundingDrag = includeFunding
    ? (safeNumber(assumption?.funding_bps_per_day, 0) / 10000) * Math.max(1, safeNumber(holdingDays, 1))
    : 0;
  return round(tr * (feeDrag + spreadDrag + slippageDrag) + fundingDrag, 8);
}

export function buildExecutionSensitivityScenarios(profile = {}) {
  const allowOptimistic = Boolean(profile.allow_optimistic_fill_policy);
  return [
    {
      scenario_id: 'baseline',
      label: 'Baseline assumptions',
      slippage_multiplier: 1,
      spread_multiplier: 1,
      funding_multiplier: 1,
      fill_policy_override: null
    },
    {
      scenario_id: 'slippage_plus_25',
      label: '+25% slippage',
      slippage_multiplier: 1.25,
      spread_multiplier: 1,
      funding_multiplier: 1,
      fill_policy_override: null
    },
    {
      scenario_id: 'slippage_plus_50',
      label: '+50% slippage',
      slippage_multiplier: 1.5,
      spread_multiplier: 1,
      funding_multiplier: 1,
      fill_policy_override: null
    },
    {
      scenario_id: 'wider_spread',
      label: 'Wider spread',
      slippage_multiplier: 1,
      spread_multiplier: 1.5,
      funding_multiplier: 1,
      fill_policy_override: null
    },
    {
      scenario_id: 'adverse_funding',
      label: 'More adverse funding',
      slippage_multiplier: 1,
      spread_multiplier: 1,
      funding_multiplier: 1.7,
      fill_policy_override: null
    },
    {
      scenario_id: 'strict_fill',
      label: 'Stricter fill policy',
      slippage_multiplier: 1.1,
      spread_multiplier: 1.1,
      funding_multiplier: 1,
      fill_policy_override: {
        entry: FILL_POLICIES.CONSERVATIVE_FILL,
        exit: FILL_POLICIES.CONSERVATIVE_FILL
      }
    },
    ...(allowOptimistic
      ? [
          {
            scenario_id: 'optimistic_fill_test_only',
            label: 'Optimistic fill (test only)',
            slippage_multiplier: 0.85,
            spread_multiplier: 0.9,
            funding_multiplier: 1,
            fill_policy_override: {
              entry: FILL_POLICIES.OPTIMISTIC_FILL,
              exit: FILL_POLICIES.OPTIMISTIC_FILL
            },
            test_only: true
          }
        ]
      : [])
  ];
}

export function applyScenarioToAssumption(assumption = {}, scenario = {}) {
  const slippageMul = safeNumber(scenario?.slippage_multiplier, 1);
  const spreadMul = safeNumber(scenario?.spread_multiplier, 1);
  const fundingMul = safeNumber(scenario?.funding_multiplier, 1);
  const fillOverride = scenario?.fill_policy_override || null;

  return {
    ...assumption,
    scenario_id: scenario?.scenario_id || 'baseline',
    entry_slippage_bps: round(safeNumber(assumption.entry_slippage_bps, 0) * slippageMul, 6),
    exit_slippage_bps: round(safeNumber(assumption.exit_slippage_bps, 0) * slippageMul, 6),
    spread_bps: round(safeNumber(assumption.spread_bps, 0) * spreadMul, 6),
    funding_bps_per_day: round(safeNumber(assumption.funding_bps_per_day, 0) * fundingMul, 6),
    fill_policy: fillOverride
      ? {
          entry: fillOverride.entry || assumption?.fill_policy?.entry || FILL_POLICIES.TOUCH_BASED,
          exit: fillOverride.exit || assumption?.fill_policy?.exit || FILL_POLICIES.CONSERVATIVE_FILL
        }
      : { ...(assumption?.fill_policy || {}) }
  };
}

export function applyScenarioToProfile(profile = {}, scenario = {}) {
  if (!scenario || scenario.scenario_id === 'baseline') return deepClone(profile);
  const out = deepClone(profile);
  const slippageMul = safeNumber(scenario.slippage_multiplier, 1);
  const spreadMul = safeNumber(scenario.spread_multiplier, 1);
  const fundingMul = safeNumber(scenario.funding_multiplier, 1);
  const fillOverride = scenario.fill_policy_override || null;

  const markets = out?.markets || {};
  for (const marketKey of Object.keys(markets)) {
    const market = markets[marketKey];
    market.funding_bps_per_day = round(safeNumber(market.funding_bps_per_day, 0) * fundingMul, 6);

    for (const key of Object.keys(market?.spread_bps_by_vol_bucket || {})) {
      market.spread_bps_by_vol_bucket[key] = round(safeNumber(market.spread_bps_by_vol_bucket[key], 0) * spreadMul, 6);
    }

    for (const key of Object.keys(market?.slippage_bps_by_vol_bucket || {})) {
      const row = market.slippage_bps_by_vol_bucket[key] || {};
      market.slippage_bps_by_vol_bucket[key] = {
        entry: round(safeNumber(row.entry, 0) * slippageMul, 6),
        exit: round(safeNumber(row.exit, 0) * slippageMul, 6)
      };
    }

    if (fillOverride) {
      market.fill_policy = {
        entry: fillOverride.entry || market?.fill_policy?.entry || FILL_POLICIES.TOUCH_BASED,
        exit: fillOverride.exit || market?.fill_policy?.exit || FILL_POLICIES.CONSERVATIVE_FILL
      };
    }
  }

  if (fillOverride) {
    out.fill_policy = {
      entry: fillOverride.entry || out?.fill_policy?.entry || FILL_POLICIES.TOUCH_BASED,
      exit: fillOverride.exit || out?.fill_policy?.exit || FILL_POLICIES.CONSERVATIVE_FILL
    };
  }

  out.profile_id = `${out.profile_id}|${scenario.scenario_id}`;
  out.assumption_scenario = scenario.scenario_id;
  out.scenario_label = scenario.label || scenario.scenario_id;
  return out;
}

export function executionRealismProfileCatalog() {
  return deepClone(DEFAULT_EXECUTION_REALISM_PROFILES);
}

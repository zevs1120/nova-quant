import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { computePositionPct, resolveRiskProfile, runRiskEngine } from '../src/engines/riskEngine.js';
// @ts-ignore JS runtime module import
import { RISK_PROFILES, DYNAMIC_RISK_BUCKETS } from '../src/engines/params.js';

/* ─────────────────────────────────────────────────
 * resolveRiskProfile — config key resolution
 * ───────────────────────────────────────────────── */

describe('resolveRiskProfile', () => {
  it('returns the requested profile when valid', () => {
    expect(resolveRiskProfile({ risk_profile: 'aggressive' })).toBe('aggressive');
    expect(resolveRiskProfile({ risk_profile: 'conservative' })).toBe('conservative');
  });

  it('falls back to balanced on unknown key', () => {
    expect(resolveRiskProfile({ risk_profile: 'yolo' })).toBe('balanced');
    expect(resolveRiskProfile({ risk_profile: '' })).toBe('balanced');
  });

  it('reads risk_profile_key as alternative field', () => {
    expect(resolveRiskProfile({ risk_profile_key: 'aggressive' })).toBe('aggressive');
  });

  it('reads nested risk_rules.profile', () => {
    expect(resolveRiskProfile({ risk_rules: { profile: 'conservative' } })).toBe('conservative');
  });

  it('defaults to balanced when config is empty', () => {
    expect(resolveRiskProfile()).toBe('balanced');
    expect(resolveRiskProfile({})).toBe('balanced');
  });
});

/* ─────────────────────────────────────────────────
 * computePositionPct — position sizing math
 *
 * This is the most critical function in the quant stack.
 * Bugs here produce absurd position sizes that cause real losses.
 * ───────────────────────────────────────────────── */

describe('computePositionPct', () => {
  const balanced = RISK_PROFILES.balanced;

  it('produces a reasonable position size under normal conditions', () => {
    const pct = computePositionPct({
      entry: 100,
      stopLoss: 95,
      profile: balanced,
      bucketMultiplier: 1,
      activeSignalCount: 3
    });
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(balanced.per_signal_cap_pct * (0.8 + balanced.leverage_cap * 0.2));
  });

  it('caps position when entry ≈ stopLoss (tiny stop distance)', () => {
    // If stop distance is near zero, raw sizing blows up.
    // The engine must clamp to per_signal_cap_pct.
    const pct = computePositionPct({
      entry: 100,
      stopLoss: 99.999,
      profile: balanced,
      bucketMultiplier: 1,
      activeSignalCount: 1
    });
    expect(pct).toBeGreaterThan(0);
    // Must not exceed the leverage-scaled per-signal cap
    const maxAllowed = balanced.per_signal_cap_pct * (0.8 + balanced.leverage_cap * 0.2);
    expect(pct).toBeLessThanOrEqual(maxAllowed);
  });

  it('handles zero entry gracefully (falls back to 1e-6)', () => {
    const pct = computePositionPct({
      entry: 0,
      stopLoss: 0,
      profile: balanced,
      bucketMultiplier: 1,
      activeSignalCount: 1
    });
    expect(Number.isFinite(pct)).toBe(true);
    expect(pct).toBeGreaterThanOrEqual(0);
  });

  it('handles NaN entry without crashing', () => {
    const pct = computePositionPct({
      entry: NaN,
      stopLoss: NaN,
      profile: balanced,
      bucketMultiplier: 1,
      activeSignalCount: 1
    });
    expect(Number.isFinite(pct)).toBe(true);
  });

  it('scales down with DERISKED bucket multiplier', () => {
    // Use a wide stop distance (10%) so position stays well under the per_signal_cap.
    // With a 5% stop and balanced profile, both multipliers hit the cap ceiling.
    const base = computePositionPct({
      entry: 100,
      stopLoss: 90,
      profile: balanced,
      bucketMultiplier: DYNAMIC_RISK_BUCKETS.BASE.multiplier,
      activeSignalCount: 3
    });
    const derisked = computePositionPct({
      entry: 100,
      stopLoss: 90,
      profile: balanced,
      bucketMultiplier: DYNAMIC_RISK_BUCKETS.DERISKED.multiplier,
      activeSignalCount: 3
    });
    expect(derisked).toBeLessThan(base);
  });

  it('reduces per-signal allocation when many signals are active', () => {
    const single = computePositionPct({
      entry: 100,
      stopLoss: 95,
      profile: balanced,
      bucketMultiplier: 1,
      activeSignalCount: 1
    });
    const many = computePositionPct({
      entry: 100,
      stopLoss: 95,
      profile: balanced,
      bucketMultiplier: 1,
      activeSignalCount: 10
    });
    expect(many).toBeLessThanOrEqual(single);
  });

  it('conservative profile produces smaller positions than aggressive', () => {
    const args = { entry: 100, stopLoss: 95, bucketMultiplier: 1, activeSignalCount: 1 };
    const conservative = computePositionPct({ ...args, profile: RISK_PROFILES.conservative });
    const aggressive = computePositionPct({ ...args, profile: RISK_PROFILES.aggressive });
    expect(conservative).toBeLessThan(aggressive);
  });
});

/* ─────────────────────────────────────────────────
 * runRiskEngine — integrated risk state machine
 * ───────────────────────────────────────────────── */

function makeVelocityState(percentile = 0.5) {
  return {
    primary_key: 'US:SPY:1d',
    global: { percentile },
    generated_at: '2026-03-24T00:00:00Z',
    series_index: {
      'US:SPY:1d': {
        velocity: {
          percentile: [percentile],
          vol_percentile: [percentile]
        }
      }
    }
  };
}

function makeRegimeState(riskOffScore = 0.5, volPercentile = 0.5) {
  return {
    primary: { risk_off_score: riskOffScore, vol_percentile: volPercentile }
  };
}

describe('runRiskEngine', () => {
  it('returns BASE bucket under normal conditions', () => {
    const result = runRiskEngine({
      config: { risk_profile: 'balanced' },
      trades: [],
      velocityState: makeVelocityState(0.5),
      regimeState: makeRegimeState(0.3)
    });
    expect(result.bucket_state).toBe('BASE');
    expect(result.bucket_multiplier).toBe(1);
    expect(result.status.trading_on).toBe(true);
    expect(result.status.current_level).toBe('LOW');
  });

  it('triggers DERISKED when velocity percentile > 90th', () => {
    const result = runRiskEngine({
      config: { risk_profile: 'balanced' },
      trades: [],
      velocityState: makeVelocityState(0.95),
      regimeState: makeRegimeState(0.5)
    });
    expect(result.bucket_state).toBe('DERISKED');
    expect(result.bucket_multiplier).toBe(DYNAMIC_RISK_BUCKETS.DERISKED.multiplier);
  });

  it('sets HIGH risk level when risk_off_score >= 0.7', () => {
    const result = runRiskEngine({
      config: { risk_profile: 'balanced' },
      trades: [],
      velocityState: makeVelocityState(0.5),
      regimeState: makeRegimeState(0.75)
    });
    expect(result.status.current_level).toBe('HIGH');
  });

  it('turns off trading when daily loss exceeds profile limit', () => {
    const trades = [
      { symbol: 'SPY', time_out: '2026-03-24T10:00:00Z', pnl_pct: -3.5 }
    ];
    const result = runRiskEngine({
      config: { risk_profile: 'balanced' },
      trades,
      velocityState: makeVelocityState(0.5),
      regimeState: makeRegimeState(0.3)
    });
    // balanced max_daily_loss_pct is 3.0, trade lost 3.5% → should shut off
    expect(result.status.trading_on).toBe(false);
  });

  it('turns off trading when max drawdown exceeds limit', () => {
    // Simulate equity going 1.0 → 0.85 (15% DD) which exceeds balanced 12% limit
    const trades = [
      { symbol: 'SPY', time_out: '2026-03-20T10:00:00Z', pnl_pct: -8 },
      { symbol: 'SPY', time_out: '2026-03-21T10:00:00Z', pnl_pct: -8 }
    ];
    const result = runRiskEngine({
      config: { risk_profile: 'balanced' },
      trades,
      velocityState: makeVelocityState(0.5),
      regimeState: makeRegimeState(0.3)
    });
    expect(result.status.trading_on).toBe(false);
    expect(result.status.diagnostics.max_dd_pct).toBeGreaterThan(12);
  });

  it('keeps trading on when losses are within limits', () => {
    const trades = [
      { symbol: 'SPY', time_out: '2026-03-24T10:00:00Z', pnl_pct: -1.5 }
    ];
    const result = runRiskEngine({
      config: { risk_profile: 'balanced' },
      trades,
      velocityState: makeVelocityState(0.5),
      regimeState: makeRegimeState(0.3)
    });
    expect(result.status.trading_on).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { runSignalEngine } from '../src/engines/signalEngine.js';
// @ts-ignore JS runtime module import
import { runVelocityEngine } from '../src/engines/velocityEngine.js';
// @ts-ignore JS runtime module import
import { RISK_PROFILES, DYNAMIC_RISK_BUCKETS } from '../src/engines/params.js';

/* ─────────────────────────────────────────────────
 * Shared test fixture builders
 * ───────────────────────────────────────────────── */

function makeVelocityState(percentile = 0.5) {
  return {
    primary_key: 'US:SPY:1d',
    global: { percentile },
    generated_at: '2026-03-24T00:00:00Z',
    series_index: {
      'US:SPY:1d': {
        market: 'US',
        symbol: 'SPY',
        latest: { percentile, acceleration: 0.01, velocity: 0.03 },
        velocity: {
          percentile: [percentile],
          vol_percentile: [percentile],
        },
        event_study: {
          conditional_stats: {
            CROSS_ABOVE_90: { 7: { p_up: 0.62, sample_size: 45, e_max_drawdown: 0.025 } },
            CROSS_BELOW_10: { 7: { p_up: 0.38, sample_size: 40, e_max_drawdown: 0.03 } },
          },
        },
      },
      'CRYPTO:BTCUSDT:4H': {
        market: 'CRYPTO',
        symbol: 'BTCUSDT',
        latest: { percentile: 0.55, acceleration: 0.005 },
        velocity: {
          percentile: [0.55],
          vol_percentile: [0.5],
        },
      },
    },
  };
}

function makeRegimeState(riskOffScore = 0.35, trendStrength = 0.6, volPercentile = 0.45) {
  const snapshot = {
    regime_id: 'TREND',
    regime_label: 'TREND',
    risk_off_score: riskOffScore,
    trend_strength: trendStrength,
    vol_percentile: volPercentile,
    market: 'US',
    symbol: 'SPY',
  };
  return {
    primary: snapshot,
    snapshots: { 'US:SPY:1d': snapshot },
  };
}

function makeRiskState(bucketState = 'BASE') {
  const profile = RISK_PROFILES.balanced;
  return {
    profile_key: 'balanced',
    profile,
    bucket_state: bucketState,
    bucket_multiplier: DYNAMIC_RISK_BUCKETS[bucketState].multiplier,
    rules: {
      per_trade_risk_pct: profile.max_loss_per_trade_pct,
      daily_loss_pct: profile.max_daily_loss_pct,
      max_dd_pct: profile.max_drawdown_pct,
      exposure_cap_pct: profile.exposure_cap_pct,
      leverage_cap: profile.leverage_cap,
    },
  };
}

function makeSignal(overrides = {}) {
  const now = new Date();
  return {
    signal_id: 'test-sig-001',
    symbol: 'SPY',
    market: 'US',
    direction: 'LONG',
    entry_min: 520,
    entry_max: 525,
    stop_loss: 510,
    take_profit: 545,
    confidence: 4,
    status: 'PENDING',
    generated_at: now.toISOString(),
    model_version: 'v0.3',
    ...overrides,
  };
}

/* ─────────────────────────────────────────────────
 * runSignalEngine — core output contract
 * ───────────────────────────────────────────────── */

describe('runSignalEngine output contract', () => {
  it('produces enriched signals with all required fields', () => {
    const result = runSignalEngine({
      signals: [makeSignal()],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(result).toHaveLength(1);
    const sig = result[0];
    // Core fields
    expect(sig.id).toBe('test-sig-001');
    expect(sig.strategy_id).toBeDefined();
    expect(sig.asset_class).toBe('US_STOCK');
    expect(sig.direction).toBe('LONG');
    // Position sizing
    expect(sig.position_pct).toBeGreaterThan(0);
    expect(Number.isFinite(sig.position_pct)).toBe(true);
    // Risk metrics
    expect(Number.isFinite(sig.expected_R)).toBe(true);
    expect(Number.isFinite(sig.risk_score)).toBe(true);
    expect(sig.risk_score).toBeGreaterThanOrEqual(6);
    expect(sig.risk_score).toBeLessThanOrEqual(96);
    // Labels
    expect(['LOW', 'NORMAL', 'HIGH']).toContain(sig.market_heat);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(sig.crowded_risk);
    // Take profit levels
    expect(sig.take_profit_levels).toHaveLength(2);
    expect(sig.take_profit_levels[0].size_pct).toBe(60);
    expect(sig.take_profit_levels[1].size_pct).toBe(40);
  });

  it('handles crypto signal correctly', () => {
    const result = runSignalEngine({
      signals: [
        makeSignal({
          signal_id: 'crypto-001',
          symbol: 'BTCUSDT',
          market: 'CRYPTO',
          asset_class: 'CRYPTO',
          entry_min: 62000,
          entry_max: 62500,
          stop_loss: 60000,
          take_profit: 66000,
          confidence: 3.5,
        }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(result).toHaveLength(1);
    expect(result[0].asset_class).toBe('CRYPTO');
    expect(result[0].payload.kind).toBe('CRYPTO');
    expect(result[0].cost_model.funding_est_bps).toBeGreaterThan(0);
  });

  it('[regression #4] strategy_evaluation uses aggregate shape for US stock', () => {
    const result = runSignalEngine({
      signals: [makeSignal()],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    const sig = result[0];
    // US stock with multiple matching templates MUST produce aggregate shape
    expect(sig.strategy_evaluation).toBeDefined();
    expect(sig.strategy_evaluation.primary).toBeDefined();
    expect(sig.strategy_evaluation.consensus_signal).toBeDefined();
    expect(typeof sig.strategy_evaluation.weighted_adjustment).toBe('number');
    expect(sig.strategy_evaluation.evaluation_count).toBeGreaterThan(1);
  });

  it('[P3 e2e] velocity→signal pipeline plumbs bars to detectPatterns', () => {
    // Use runVelocityEngine to get real OHLCV bars
    const velocityState = runVelocityEngine({
      signals: [makeSignal()],
      trades: [],
      velocitySeed: null,
      featureSeries: null,
      anchorTime: Date.now(),
    });
    // Verify bars exist on the series that signal engine will resolve
    const seriesKeys = Object.keys(velocityState.series_index);
    const spySeries = Object.values(velocityState.series_index).find(
      (s: any) => s.market === 'US' && s.symbol === 'SPY',
    ) as any;
    expect(spySeries).toBeDefined();
    expect(Array.isArray(spySeries.bars)).toBe(true);
    expect(spySeries.bars.length).toBe(20);

    const result = runSignalEngine({
      signals: [makeSignal()],
      velocityState,
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    // detected_patterns is populated as an array (may be empty if no pattern matches)
    expect(Array.isArray(result[0].detected_patterns)).toBe(true);
  });

  it('[P3] detected_patterns finds patterns when bars contain engulfing', () => {
    // Inject specific bars with a bullish engulfing pattern
    const velocityState = makeVelocityState();
    (velocityState.series_index['US:SPY:1d'] as Record<string, unknown>).bars = [
      // 18 neutral bars
      ...Array.from({ length: 18 }, () => ({
        open: 520,
        high: 522,
        low: 518,
        close: 519,
        volume: 1000,
      })),
      // Bar 19: bearish (prev for engulfing)
      { open: 525, high: 526, low: 516, close: 517, volume: 1200 },
      // Bar 20: bullish engulfing — opens below prev close, closes above prev open
      { open: 515, high: 530, low: 514, close: 528, volume: 1800 },
    ];
    const result = runSignalEngine({
      signals: [makeSignal()],
      velocityState,
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    const sig = result[0];
    expect(sig.detected_patterns.length).toBeGreaterThan(0);
    const engulfing = sig.detected_patterns.find((p: any) => p.type === 'bullish_engulfing');
    expect(engulfing).toBeDefined();
    expect(engulfing.direction).toBe('LONG');
    expect(typeof engulfing.confidence).toBe('number');
    expect(typeof engulfing.score_adjustment).toBe('number');
  });

  it('[P3] detected_patterns is empty when velocity state has no bars', () => {
    // Hand-crafted fixture without bars field — simulates legacy velocity state
    const result = runSignalEngine({
      signals: [makeSignal()],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    const sig = result[0];
    expect(Array.isArray(sig.detected_patterns)).toBe(true);
    expect(sig.detected_patterns).toHaveLength(0);
  });

  it('sentiment_cycle is present with expected shape', () => {
    const result = runSignalEngine({
      signals: [makeSignal()],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    const sig = result[0];
    expect(sig.sentiment_cycle).toBeDefined();
    expect(sig.sentiment_cycle.phase).toBeDefined();
    expect(typeof sig.sentiment_cycle.adjustment).toBe('number');
    expect(typeof sig.sentiment_cycle.factors.volume_ratio).toBe('number');
    expect(typeof sig.sentiment_cycle.factors.velocity_percentile).toBe('number');
    expect(typeof sig.sentiment_cycle.factors.ma_convergence).toBe('number');
  });

  it('[regression #2] low-strike OPTIONS symbol is correctly inferred', () => {
    const result = runSignalEngine({
      signals: [
        makeSignal({
          signal_id: 'opt-001',
          symbol: 'TSLA260619C00200000',
          market: 'US',
          entry_min: 5.2,
          entry_max: 5.8,
          stop_loss: 3.5,
          take_profit: 9.0,
        }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(result).toHaveLength(1);
    expect(result[0].asset_class).toBe('OPTIONS');
    expect(result[0].strategy_id).toBe('OP_INTRADAY');
  });

  it('[regression #2] high-strike OPTIONS symbol (SPX) is correctly inferred', () => {
    const result = runSignalEngine({
      signals: [
        makeSignal({
          signal_id: 'opt-spx-001',
          symbol: 'SPX260619C01200000',
          market: 'US',
          entry_min: 12.0,
          entry_max: 13.5,
          stop_loss: 8.0,
          take_profit: 20.0,
        }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(result).toHaveLength(1);
    expect(result[0].asset_class).toBe('OPTIONS');
    expect(result[0].strategy_id).toBe('OP_INTRADAY');
  });
});

/* ─────────────────────────────────────────────────
 * Signal scoring — regime fit impact
 * ───────────────────────────────────────────────── */

describe('signal scoring and ranking', () => {
  it('TREND regime signal scores higher than RISK_OFF', () => {
    const trendSignals = runSignalEngine({
      signals: [makeSignal({ signal_id: 'trend-sig', confidence: 4 })],
      velocityState: makeVelocityState(0.6),
      regimeState: makeRegimeState(0.2, 0.7, 0.4), // low risk-off, strong trend
      riskState: makeRiskState(),
    });
    const riskOffSignals = runSignalEngine({
      signals: [makeSignal({ signal_id: 'riskoff-sig', confidence: 4 })],
      velocityState: makeVelocityState(0.6),
      regimeState: {
        primary: {
          risk_off_score: 0.8,
          trend_strength: 0.2,
          vol_percentile: 0.85,
          regime_label: 'RISK_OFF',
        },
        snapshots: {},
      },
      riskState: makeRiskState(),
    });
    expect(trendSignals[0].score).toBeGreaterThan(riskOffSignals[0].score);
  });

  it('higher confidence produces higher score', () => {
    const lowConf = runSignalEngine({
      signals: [makeSignal({ signal_id: 'low', confidence: 1 })],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    const highConf = runSignalEngine({
      signals: [makeSignal({ signal_id: 'high', confidence: 5 })],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(highConf[0].score).toBeGreaterThan(lowConf[0].score);
  });
});

/* ─────────────────────────────────────────────────
 * Expected R and take profit — direction correctness
 * ───────────────────────────────────────────────── */

describe('expected R calculation', () => {
  it('LONG signal has positive R when TP > entry > stop', () => {
    const result = runSignalEngine({
      signals: [
        makeSignal({
          direction: 'LONG',
          entry_min: 100,
          entry_max: 102,
          stop_loss: 95,
          take_profit: 115,
        }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(result[0].expected_R).toBeGreaterThan(0);
  });

  it('SHORT signal has positive R when stop > entry > TP', () => {
    const result = runSignalEngine({
      signals: [
        makeSignal({
          direction: 'SHORT',
          entry_min: 100,
          entry_max: 102,
          stop_loss: 108,
          take_profit: 90,
        }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(result[0].expected_R).toBeGreaterThan(0);
  });

  it('TP2 extends beyond TP1 for LONG', () => {
    const result = runSignalEngine({
      signals: [makeSignal({ direction: 'LONG', take_profit: 545 })],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    const levels = result[0].take_profit_levels;
    expect(levels[1].price).toBeGreaterThan(levels[0].price);
  });

  it('TP2 extends below TP1 for SHORT', () => {
    const result = runSignalEngine({
      signals: [
        makeSignal({
          direction: 'SHORT',
          entry_min: 100,
          entry_max: 102,
          stop_loss: 108,
          take_profit: 90,
        }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    const levels = result[0].take_profit_levels;
    expect(levels[1].price).toBeLessThan(levels[0].price);
  });
});

/* ─────────────────────────────────────────────────
 * resolveConflicts — opposite-direction conflict muting
 * ───────────────────────────────────────────────── */

describe('signal conflict resolution', () => {
  it('mutes lower-scored opposite-direction signal on same asset', () => {
    const longSig = makeSignal({
      signal_id: 'long-001',
      direction: 'LONG',
      confidence: 5,
      entry_min: 100,
      entry_max: 102,
      stop_loss: 95,
      take_profit: 115,
    });
    const shortSig = makeSignal({
      signal_id: 'short-001',
      direction: 'SHORT',
      confidence: 2,
      entry_min: 100,
      entry_max: 102,
      stop_loss: 108,
      take_profit: 92,
    });
    const result = runSignalEngine({
      signals: [longSig, shortSig],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    // Higher confidence LONG should win, SHORT should be INVALIDATED
    const longResult = result.find((s: any) => s.signal_id === 'long-001');
    const shortResult = result.find((s: any) => s.signal_id === 'short-001');
    expect(longResult).toBeDefined();
    expect(shortResult).toBeDefined();
    expect(shortResult.status).toBe('INVALIDATED');
    expect(shortResult.tags).toContain('conflict-muted');
  });

  it('preserves TRIGGERED signal in conflict', () => {
    const pendingSig = makeSignal({
      signal_id: 'pending-001',
      direction: 'LONG',
      confidence: 5,
      status: 'PENDING',
    });
    const triggeredSig = makeSignal({
      signal_id: 'triggered-001',
      direction: 'SHORT',
      confidence: 2,
      status: 'TRIGGERED',
      entry_min: 520,
      entry_max: 525,
      stop_loss: 535,
      take_profit: 500,
    });
    const result = runSignalEngine({
      signals: [pendingSig, triggeredSig],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    const triggered = result.find((s: any) => s.signal_id === 'triggered-001');
    // TRIGGERED is always preserved
    expect(triggered.status).not.toBe('INVALIDATED');
  });
});

/* ─────────────────────────────────────────────────
 * Status expiry — time based
 * ───────────────────────────────────────────────── */

describe('signal expiry', () => {
  it('marks signal as EXPIRED when past expiry time', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const result = runSignalEngine({
      signals: [
        makeSignal({
          signal_id: 'old-sig',
          generated_at: twoDaysAgo,
          status: 'PENDING',
        }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(result[0].status).toBe('EXPIRED');
  });

  it('keeps recent signal as NEW', () => {
    const result = runSignalEngine({
      signals: [
        makeSignal({
          signal_id: 'fresh-sig',
          generated_at: new Date().toISOString(),
          status: 'PENDING',
        }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(result[0].status).toBe('NEW');
  });
});

/* ─────────────────────────────────────────────────
 * Cost model — crypto vs US cost differences
 * ───────────────────────────────────────────────── */

describe('cost model', () => {
  it('crypto signals have higher total cost than US equities', () => {
    const usSig = runSignalEngine({
      signals: [makeSignal({ signal_id: 'us' })],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    const cryptoSig = runSignalEngine({
      signals: [
        makeSignal({
          signal_id: 'crypto',
          symbol: 'BTCUSDT',
          market: 'CRYPTO',
          entry_min: 62000,
          entry_max: 62500,
          stop_loss: 60000,
          take_profit: 66000,
        }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(cryptoSig[0].cost_model.total_bps).toBeGreaterThan(usSig[0].cost_model.total_bps);
  });

  it('crypto signals include funding cost estimate', () => {
    const result = runSignalEngine({
      signals: [
        makeSignal({
          symbol: 'BTCUSDT',
          market: 'CRYPTO',
          entry_min: 62000,
          entry_max: 62500,
          stop_loss: 60000,
          take_profit: 66000,
        }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState(),
    });
    expect(result[0].cost_model.funding_est_bps).toBeGreaterThan(0);
  });
});

/* ─────────────────────────────────────────────────
 * DERISKED bucket shrinks position
 * ───────────────────────────────────────────────── */

describe('risk bucket impact on position sizes', () => {
  it('DERISKED bucket produces smaller positions than BASE', () => {
    // Use a wide stop (10%) and many active signals so sizing stays below cap ceiling.
    const wideSig = {
      signal_id: 'test',
      entry_min: 100,
      entry_max: 102,
      stop_loss: 90,
      take_profit: 120,
    };
    const baseResult = runSignalEngine({
      signals: [
        makeSignal(wideSig),
        makeSignal({ ...wideSig, signal_id: 'pad1' }),
        makeSignal({ ...wideSig, signal_id: 'pad2' }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState('BASE'),
    });
    const deriskedResult = runSignalEngine({
      signals: [
        makeSignal(wideSig),
        makeSignal({ ...wideSig, signal_id: 'pad1' }),
        makeSignal({ ...wideSig, signal_id: 'pad2' }),
      ],
      velocityState: makeVelocityState(),
      regimeState: makeRegimeState(),
      riskState: makeRiskState('DERISKED'),
    });
    const basePct = baseResult.find((s: any) => s.signal_id === 'test').position_pct;
    const deriskedPct = deriskedResult.find((s: any) => s.signal_id === 'test').position_pct;
    expect(deriskedPct).toBeLessThan(basePct);
  });
});

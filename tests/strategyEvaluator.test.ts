import { describe, expect, it } from 'vitest';
import {
  evaluateStrategy,
  aggregateEvaluations,
  evaluateCondition,
  buildConditionContext,
} from '../src/engines/strategyEvaluator.js';

/* ---------- test helpers ---------- */

function makeTemplate(overrides = {}) {
  return {
    strategy_id: 'TEST_STRAT',
    strategy_family: 'Test',
    features: ['trend_strength', 'velocity_percentile'],
    trigger_conditions: ['Trend aligns.'],
    invalidation: ['Trend breaks.'],
    rules: ['Follow trend.'],
    regime_tags: ['trending'],
    ...overrides,
  };
}

function makeRegime(overrides = {}) {
  return {
    trend_strength: 0.6,
    vol_percentile: 0.4,
    risk_off_score: 0.3,
    ...overrides,
  };
}

function makeSeries(overrides = {}) {
  return {
    latest: { percentile: 0.6, acceleration: 0.02, ...overrides },
  };
}

/* ---------- P5: evaluateCondition ---------- */

describe('evaluateCondition', () => {
  it('> operator', () => {
    expect(
      evaluateCondition({ field: 'x', op: '>', value: 5, label: 'test' }, { x: 6 }).passed,
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'x', op: '>', value: 5, label: 'test' }, { x: 5 }).passed,
    ).toBe(false);
  });

  it('>= operator', () => {
    expect(
      evaluateCondition({ field: 'x', op: '>=', value: 5, label: 'test' }, { x: 5 }).passed,
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'x', op: '>=', value: 5, label: 'test' }, { x: 4 }).passed,
    ).toBe(false);
  });

  it('< operator', () => {
    expect(
      evaluateCondition({ field: 'x', op: '<', value: 5, label: 'test' }, { x: 4 }).passed,
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'x', op: '<', value: 5, label: 'test' }, { x: 5 }).passed,
    ).toBe(false);
  });

  it('<= operator', () => {
    expect(
      evaluateCondition({ field: 'x', op: '<=', value: 5, label: 'test' }, { x: 5 }).passed,
    ).toBe(true);
  });

  it('== operator', () => {
    expect(
      evaluateCondition({ field: 'x', op: '==', value: 'BULL', label: 'test' }, { x: 'BULL' })
        .passed,
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'x', op: '==', value: 'BULL', label: 'test' }, { x: 'BEAR' })
        .passed,
    ).toBe(false);
  });

  it('!= operator', () => {
    expect(
      evaluateCondition({ field: 'x', op: '!=', value: 'BEAR', label: 'test' }, { x: 'BULL' })
        .passed,
    ).toBe(true);
  });

  it('in operator', () => {
    expect(
      evaluateCondition({ field: 'x', op: 'in', value: ['A', 'B'], label: 'test' }, { x: 'A' })
        .passed,
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'x', op: 'in', value: ['A', 'B'], label: 'test' }, { x: 'C' })
        .passed,
    ).toBe(false);
  });

  it('missing field fails', () => {
    expect(
      evaluateCondition({ field: 'missing', op: '>', value: 0, label: 'test' }, { x: 1 }).passed,
    ).toBe(false);
  });

  it('uses auto-generated label when not provided', () => {
    const result = evaluateCondition({ field: 'x', op: '>', value: 5 } as any, { x: 6 });
    expect(result.label).toBe('x_>_5');
  });
});

/* ---------- P5: buildConditionContext ---------- */

describe('buildConditionContext', () => {
  it('flattens regime, series, and technicalIndicators', () => {
    const ctx = buildConditionContext({
      regime: { trend_strength: 0.7, vol_percentile: 0.4, risk_off_score: 0.3 },
      series: { latest: { percentile: 0.65, acceleration: 0.03 } },
      technicalIndicators: {
        rsi_14: 55,
        rsi_6: 60,
        bias_rate_5: 1.2,
        bias_rate_10: 0.8,
        bias_rate_20: 0.5,
        volume_ratio: 1.3,
        bar_count: 30,
        macd: {
          dif: 1.5,
          dea: 1.2,
          bar: 0.6,
          above_zero: true,
          golden_cross: false,
          death_cross: false,
        },
        bollinger: { upper: 110, middle: 100, lower: 90, width: 0.2 },
        ma_alignment: { status: 'BULL', ma5: 105, ma10: 103, ma20: 100 },
      },
      expectedR: 2.5,
    }) as any;

    expect(ctx.trend_strength).toBe(0.7);
    expect(ctx.velocity_percentile).toBe(0.65);
    expect(ctx.rsi_14).toBe(55);
    expect(ctx['macd.dif']).toBe(1.5);
    expect(ctx['macd.above_zero']).toBe(true);
    expect(ctx['bollinger.width']).toBe(0.2);
    expect(ctx['ma_alignment.status']).toBe('BULL');
    expect(ctx.volume_ratio).toBe(1.3);
    expect(ctx.expected_R).toBe(2.5);
  });

  it('uses safe defaults when data is missing', () => {
    const ctx = buildConditionContext({
      regime: null,
      series: null,
      technicalIndicators: null,
      expectedR: 0,
    }) as any;
    expect(ctx.trend_strength).toBe(0.5);
    expect(ctx.velocity_percentile).toBe(0.5);
    expect(ctx.rsi_14).toBeUndefined(); // no TI → no indicator fields
  });
});

/* ---------- P5: structured trigger_conditions in evaluateStrategy ---------- */

describe('evaluateStrategy with structured conditions', () => {
  it('evaluates structured conditions and classifies signal', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        trigger_conditions: [
          { field: 'trend_strength', op: '>=', value: 0.55, label: 'trend_ok' },
          { field: 'velocity_percentile', op: '>', value: 0.4, label: 'vel_ok' },
          { field: 'vol_percentile', op: '<', value: 0.75, label: 'vol_ok' },
        ],
      }),
      regime: makeRegime({ trend_strength: 0.7 }),
      series: makeSeries({ percentile: 0.6 }),
      expectedR: 2.0,
      confidenceNorm: 0.8,
    }) as any;
    expect(result.conditions_met).toContain('trend_ok');
    expect(result.conditions_met).toContain('vel_ok');
    expect(result.conditions_met).toContain('vol_ok');
    expect(result.signal).toBe('strong');
  });

  it('structured conditions can produce missed conditions', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        trigger_conditions: [
          { field: 'trend_strength', op: '>=', value: 0.8, label: 'trend_high' },
          { field: 'rsi_14', op: '<=', value: 30, label: 'oversold' },
        ],
      }),
      regime: makeRegime({ trend_strength: 0.5 }),
      series: makeSeries(),
      expectedR: 1.0,
      confidenceNorm: 0.5,
      technicalIndicators: { rsi_14: 60 },
    }) as any;
    expect(result.conditions_missed).toContain('trend_high');
    expect(result.conditions_missed).toContain('oversold');
    expect(['weak', 'skip']).toContain(result.signal);
  });

  it('uses technicalIndicators for MACD/RSI/Bollinger conditions', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        trigger_conditions: [
          { field: 'macd.above_zero', op: '==', value: true, label: 'macd_bullish' },
          { field: 'rsi_14', op: '<', value: 70, label: 'not_overbought' },
          {
            field: 'ma_alignment.status',
            op: 'in',
            value: ['BULL', 'WEAK_BULL'],
            label: 'ma_bullish',
          },
        ],
      }),
      regime: makeRegime(),
      series: makeSeries(),
      expectedR: 2.0,
      confidenceNorm: 0.7,
      technicalIndicators: {
        rsi_14: 55,
        macd: {
          dif: 1,
          dea: 0.5,
          bar: 1,
          above_zero: true,
          golden_cross: false,
          death_cross: false,
        },
        ma_alignment: { status: 'BULL', ma5: 105, ma10: 103, ma20: 100 },
      },
    }) as any;
    expect(result.conditions_met).toContain('macd_bullish');
    expect(result.conditions_met).toContain('not_overbought');
    expect(result.conditions_met).toContain('ma_bullish');
    expect(result.signal).toBe('strong');
  });

  it('P7: structured invalidation triggers skip signal', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        trigger_conditions: [{ field: 'trend_strength', op: '>=', value: 0.5, label: 'trend_ok' }],
        invalidation: [{ field: 'rsi_14', op: '>', value: 80, label: 'extreme_overbought' }],
      }),
      regime: makeRegime({ trend_strength: 0.6 }),
      series: makeSeries(),
      expectedR: 2.0,
      confidenceNorm: 0.7,
      technicalIndicators: { rsi_14: 85 },
    }) as any;
    expect(result.signal).toBe('skip');
    expect(result.invalidation_reasons).toContain('extreme_overbought');
    expect(result.conditions_missed).toContain('extreme_overbought');
  });

  it('P7: non-triggered structured invalidation has no effect', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        trigger_conditions: [{ field: 'trend_strength', op: '>=', value: 0.5, label: 'trend_ok' }],
        invalidation: [{ field: 'rsi_14', op: '>', value: 80, label: 'extreme_overbought' }],
      }),
      regime: makeRegime({ trend_strength: 0.6 }),
      series: makeSeries(),
      expectedR: 2.0,
      confidenceNorm: 0.7,
      technicalIndicators: { rsi_14: 50 },
    }) as any;
    expect(result.signal).not.toBe('skip');
    expect(result.invalidation_reasons).toHaveLength(0);
  });

  it('P7: NL invalidation backward compat — legacy heuristic still works', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        trigger_conditions: [
          { field: 'trend_strength', op: '>=', value: 0.5, label: 'trend_ok' },
          { field: 'vol_percentile', op: '<', value: 0.8, label: 'vol_ok' },
        ],
        invalidation: ['Trend channel breaks.'],
      }),
      regime: makeRegime({ trend_strength: 0.2 }), // below 0.25
      series: makeSeries(),
      expectedR: 1.0,
      confidenceNorm: 0.5,
      technicalIndicators: { rsi_14: 50 },
    }) as any;
    // trend_strength=0.2 < 0.5 → missed, vol_ok → met
    // Legacy heuristic: trend_strength < 0.25 && missed >= 2
    // conditionsMissed has 'trend_ok', needs >= 2 to trigger legacy
    // So with only 1 missed, legacy won't trigger
    expect(result.invalidation_reasons).toHaveLength(0);
  });
});

/* ---------- legacy evaluateStrategy (backward compat) ---------- */

describe('evaluateStrategy (legacy NL conditions)', () => {
  it('returns strong signal for well-aligned conditions', () => {
    const result = evaluateStrategy({
      template: makeTemplate(),
      regime: makeRegime({ trend_strength: 0.8 }),
      series: makeSeries({ percentile: 0.75 }),
      expectedR: 2.0,
      confidenceNorm: 0.8,
    }) as any;
    expect(result.strategy_id).toBe('TEST_STRAT');
    expect(result.signal).toBe('strong');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.conditions_met.length).toBeGreaterThan(0);
    expect(result.score_adjustment).toBeGreaterThan(0);
  });

  it('returns moderate signal for partial alignment', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        features: ['trend_strength', 'velocity_percentile', 'vol_percentile'],
      }),
      regime: makeRegime({ trend_strength: 0.5, vol_percentile: 0.8 }),
      series: makeSeries({ percentile: 0.45 }),
      expectedR: 1.3,
      confidenceNorm: 0.6,
    }) as any;
    expect(['moderate', 'weak']).toContain(result.signal);
  });

  it('returns weak/skip for poor conditions', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        features: ['trend_strength', 'velocity_percentile', 'vol_percentile', 'risk_off_score'],
      }),
      regime: makeRegime({ trend_strength: 0.2, vol_percentile: 0.9, risk_off_score: 0.8 }),
      series: makeSeries({ percentile: 0.2 }),
      expectedR: 0.8,
      confidenceNorm: 0.3,
    }) as any;
    expect(['weak', 'skip']).toContain(result.signal);
  });

  it('detects near-invalidation zone', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        features: [
          'trend_strength',
          'velocity_percentile',
          'vol_percentile',
          'risk_off_score',
          'volume_confirmation',
        ],
        invalidation: ['Trend breaks hard.'],
      }),
      regime: makeRegime({ trend_strength: 0.15, vol_percentile: 0.9, risk_off_score: 0.9 }),
      series: makeSeries({ percentile: 0.1, acceleration: -0.05 }),
      expectedR: 0.5,
      confidenceNorm: 0.2,
    }) as any;
    expect(result.signal).toBe('skip');
    expect(result.conditions_missed).toContain('near_invalidation_zone');
  });

  it('handles high_vol strategies correctly', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        features: ['vol_percentile'],
        regime_tags: ['high_vol'],
      }),
      regime: makeRegime({ vol_percentile: 0.8 }),
      series: makeSeries(),
      expectedR: 1.5,
      confidenceNorm: 0.7,
    }) as any;
    expect(result.conditions_met).toContain('vol_environment_favorable');
  });

  it('handles risk_off strategies correctly', () => {
    const result = evaluateStrategy({
      template: makeTemplate({
        features: ['risk_off_score'],
        regime_tags: ['risk_off'],
      }),
      regime: makeRegime({ risk_off_score: 0.7 }),
      series: makeSeries(),
      expectedR: 1.5,
      confidenceNorm: 0.7,
    }) as any;
    expect(result.conditions_met).toContain('risk_off_environment_matches');
  });

  it('evaluates volume expansion', () => {
    const result = evaluateStrategy({
      template: makeTemplate({ features: ['volume_confirmation'] }),
      regime: makeRegime(),
      series: makeSeries({ acceleration: 0.05 }),
      expectedR: 1.5,
      confidenceNorm: 0.7,
    }) as any;
    expect(result.conditions_met).toContain('volume_expanding');
  });

  it('evaluates carry/basis features', () => {
    const result = evaluateStrategy({
      template: makeTemplate({ features: ['basis_spread', 'funding_rate'] }),
      regime: makeRegime({ risk_off_score: 0.3 }),
      series: makeSeries(),
      expectedR: 1.5,
      confidenceNorm: 0.7,
    }) as any;
    expect(result.conditions_met).toContain('carry_conditions_acceptable');
  });

  it('confidence is bounded [0, 1]', () => {
    const strong = evaluateStrategy({
      template: makeTemplate(),
      regime: makeRegime({ trend_strength: 0.95 }),
      series: makeSeries({ percentile: 0.95 }),
      expectedR: 3.0,
      confidenceNorm: 1.5, // intentionally out of range
    }) as any;
    expect(strong.confidence).toBeLessThanOrEqual(1);
    expect(strong.confidence).toBeGreaterThanOrEqual(0);
  });

  it('handles empty features array gracefully', () => {
    const result = evaluateStrategy({
      template: makeTemplate({ features: [] }),
      regime: makeRegime(),
      series: makeSeries(),
      expectedR: 1.5,
      confidenceNorm: 0.5,
    }) as any;
    expect(result.strategy_id).toBe('TEST_STRAT');
    expect(result.signal).toBeDefined();
  });
});

/* ---------- aggregateEvaluations ---------- */

describe('aggregateEvaluations', () => {
  it('returns primary (highest confidence) evaluation', () => {
    const evals = [
      { strategy_id: 'A', signal: 'weak', confidence: 0.3, score_adjustment: -3 },
      { strategy_id: 'B', signal: 'strong', confidence: 0.8, score_adjustment: 10 },
      { strategy_id: 'C', signal: 'moderate', confidence: 0.5, score_adjustment: 4 },
    ];
    const result = aggregateEvaluations(evals) as any;
    expect(result.primary.strategy_id).toBe('B');
    expect(result.primary.confidence).toBe(0.8);
    expect(result.evaluation_count).toBe(3);
  });

  it('computes consensus from majority signal', () => {
    const evals = [
      { strategy_id: 'A', signal: 'moderate', confidence: 0.5, score_adjustment: 3 },
      { strategy_id: 'B', signal: 'moderate', confidence: 0.6, score_adjustment: 5 },
      { strategy_id: 'C', signal: 'strong', confidence: 0.8, score_adjustment: 10 },
    ];
    const result = aggregateEvaluations(evals) as any;
    expect(result.consensus_signal).toBe('moderate');
  });

  it('computes weighted adjustment', () => {
    const evals = [
      { strategy_id: 'A', signal: 'strong', confidence: 0.8, score_adjustment: 10 },
      { strategy_id: 'B', signal: 'weak', confidence: 0.2, score_adjustment: -5 },
    ];
    const result = aggregateEvaluations(evals) as any;
    // Weighted: (10*0.8 + (-5)*0.2) / (0.8+0.2) = (8-1)/1 = 7
    expect(result.weighted_adjustment).toBe(7);
  });

  it('returns skip for empty evaluations', () => {
    const result = aggregateEvaluations([]) as any;
    expect(result.consensus_signal).toBe('skip');
    expect(result.weighted_adjustment).toBe(0);
    expect(result.primary).toBe(null);
  });

  it('returns skip for null input', () => {
    const result = aggregateEvaluations(null as any) as any;
    expect(result.consensus_signal).toBe('skip');
    expect(result.evaluation_count).toBe(0);
  });

  it('handles single evaluation', () => {
    const evals = [{ strategy_id: 'A', signal: 'strong', confidence: 0.9, score_adjustment: 12 }];
    const result = aggregateEvaluations(evals) as any;
    expect(result.primary.strategy_id).toBe('A');
    expect(result.consensus_signal).toBe('strong');
    expect(result.weighted_adjustment).toBe(12);
    expect(result.evaluation_count).toBe(1);
  });
});

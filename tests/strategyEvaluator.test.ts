import { describe, expect, it } from 'vitest';
import { evaluateStrategy, aggregateEvaluations } from '../src/engines/strategyEvaluator.js';

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

/* ---------- evaluateStrategy ---------- */

describe('evaluateStrategy', () => {
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

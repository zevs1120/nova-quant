import { describe, expect, it } from 'vitest';
import {
  PandaAutoLearner,
  PandaStrategyBase,
  RiskBucket,
  buildPandaAdaptiveDecision,
  resolvePandaModelConfig,
} from '../src/server/quant/pandaEngine.js';

function buildBars(count: number, start = 100) {
  const rows: Array<{
    ts_open: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];
  let px = start;
  const now = Date.now() - count * 3600_000;
  for (let i = 0; i < count; i += 1) {
    const open = px;
    const drift = 0.15 + (i % 7) * 0.01;
    const close = open + drift;
    const high = close + 0.08;
    const low = open - 0.07;
    rows.push({
      ts_open: now + i * 3600_000,
      open,
      high,
      low,
      close,
      volume: 1000 + i * 4,
    });
    px = close;
  }
  return rows;
}

describe('panda engine modules', () => {
  it('strategy base calculates factors and emits decision', () => {
    const strategy = new PandaStrategyBase({
      longSignalThreshold: 0.6,
      shortSignalThreshold: 0.9,
    });
    strategy.add_factor('trend_strength', (frame) => frame.close.map(() => 0.72));
    strategy.add_factor('reversal_score', (frame) => frame.close.map(() => 0.15));
    const frame = {
      close: [1, 2, 3, 4],
      open: [1, 2, 3, 4],
      high: [1, 2, 3, 4],
      low: [1, 2, 3, 4],
      volume: [10, 10, 10, 10],
    };
    const out = strategy.decision(frame);
    expect(out.signal).toBe(1);
    expect(out.frame.trend_strength.length).toBe(4);
  });

  it('risk bucket enforces drawdown/position and sizes conservatively', () => {
    const risk = new RiskBucket(0.02, 0.3, 0.12, 0.05);
    risk.update_equity(1);
    risk.update_equity(0.86);
    const [allowed, reason] = risk.is_trade_allowed(1, 100000, 10000);
    expect(allowed).toBe(false);
    expect(reason).toBe('drawdown_limit');
    const shares = risk.calc_position_size(100000, 120, 0.02);
    expect(shares).toBeGreaterThanOrEqual(0);
  });

  it('auto learner scores factors and adapts params from performance', () => {
    const learner = new PandaAutoLearner();
    const factors = {
      trend_strength: [0.1, 0.2, 0.3, 0.4, 0.45, 0.5],
      reversal_score: [0.6, 0.55, 0.5, 0.45, 0.4, 0.35],
    };
    const returns = [0.01, 0.015, 0.012, 0.02, 0.022, 0.025];
    const top = learner.select_top_factors(factors, returns, 1);
    expect(top.length).toBe(1);
    expect(typeof learner.factor_scores[top[0]]).toBe('number');
    expect(learner.adaptive_param([-0.01, -0.02], resolvePandaModelConfig()).risk).toBeLessThan(
      0.02,
    );
    expect(
      learner.adaptive_param([0.01], resolvePandaModelConfig()).position,
    ).toBeGreaterThanOrEqual(0.3);
  });

  it('builds adaptive decision with factor ranking and risk decision', () => {
    const out = buildPandaAdaptiveDecision({
      market: 'US',
      bars: buildBars(120, 300),
      performanceHistory: [-0.01, -0.005, 0.004],
      riskProfile: {
        user_id: 'u1',
        profile_key: 'balanced',
        max_loss_per_trade: 1,
        max_daily_loss: 3,
        max_drawdown: 12,
        exposure_cap: 55,
        leverage_cap: 2,
        updated_at_ms: Date.now(),
      },
    });
    expect(out.profile.learningStatus).toBe('READY');
    expect(out.topFactors.length).toBeGreaterThan(0);
    expect(typeof out.risk.allowed).toBe('boolean');
    expect(out.adaptiveParams.risk).toBeGreaterThan(0);
  });
});

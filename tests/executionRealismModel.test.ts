import { describe, expect, it } from 'vitest';
// @ts-ignore JS module has no bundled declaration file.
import {
  FILL_POLICIES,
  adjustPriceForExecution,
  applyScenarioToAssumption,
  buildExecutionSensitivityScenarios,
  estimateCostDragPct,
  resolveExecutionAssumptions,
  resolveExecutionRealismProfile
} from '../src/research/validation/executionRealismModel.js';

describe('execution realism model', () => {
  it('resolves market assumptions with fill policies', () => {
    const profile = resolveExecutionRealismProfile({ mode: 'replay' });
    const assumption = resolveExecutionAssumptions({
      profile,
      signal: { market: 'CRYPTO', volatility_percentile: 92, created_at: '2026-03-08T03:00:00.000Z' },
      mode: 'replay'
    });

    expect(assumption.market).toBe('CRYPTO');
    expect(assumption.volatility_bucket).toBe('stress');
    expect(assumption.session_state).toBeTruthy();
    expect(assumption.liquidity_bucket).toBeTruthy();
    expect(assumption.fill_policy.entry).toBeTruthy();
    expect(assumption.entry_slippage_bps).toBeGreaterThan(0);
    expect(assumption.spread_bps).toBeGreaterThan(0);
    expect(assumption.partial_fill_probability).toBeGreaterThan(0);
  });

  it('applies cost and scenario stress consistently', () => {
    const profile = resolveExecutionRealismProfile({ mode: 'backtest' });
    const base = resolveExecutionAssumptions({
      profile,
      signal: { market: 'US' },
      mode: 'backtest',
      fillPolicy: { entry: FILL_POLICIES.TOUCH_BASED, exit: FILL_POLICIES.BAR_CROSS_BASED }
    });
    const scenario = buildExecutionSensitivityScenarios(profile).find(
      (row: { scenario_id: string }) => row.scenario_id === 'slippage_plus_50'
    );
    const stressed = applyScenarioToAssumption(base, scenario);

    const baseCost = estimateCostDragPct({ assumption: base, turnover: 0.45, holdingDays: 3 });
    const stressedCost = estimateCostDragPct({ assumption: stressed, turnover: 0.45, holdingDays: 3 });

    expect(stressedCost).toBeGreaterThan(baseCost);

    const longEntry = adjustPriceForExecution({
      price: 100,
      direction: 'LONG',
      side: 'entry',
      slippageBps: base.entry_slippage_bps,
      spreadBps: base.spread_bps
    });
    const longExit = adjustPriceForExecution({
      price: 100,
      direction: 'LONG',
      side: 'exit',
      slippageBps: base.exit_slippage_bps,
      spreadBps: base.spread_bps
    });
    expect(longEntry).toBeGreaterThan(100);
    expect(longExit).toBeLessThan(100);
  });

  it('adds contextual borrow and liquidity stress for fragile short execution', () => {
    const profile = resolveExecutionRealismProfile({ mode: 'replay' });
    const assumption = resolveExecutionAssumptions({
      profile,
      signal: {
        market: 'US',
        direction: 'SHORT',
        created_at: '2026-03-10T12:40:00.000Z',
        liquidity_score: 0.18
      },
      bar: {
        high: 101,
        low: 98,
        close: 99,
        volume: 120000
      },
      mode: 'replay'
    });

    expect(assumption.session_state).toBe('premarket');
    expect(assumption.liquidity_bucket).toBe('fragile');
    expect(assumption.borrow_bps_per_day).toBeGreaterThan(0);
    expect(assumption.partial_fill_probability).toBeLessThan(0.9);
  });
});

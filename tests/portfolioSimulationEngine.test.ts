import { describe, expect, it } from 'vitest';
// @ts-ignore runtime JS import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('portfolio simulation engine', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' }
  });

  const sim = state?.research?.research_core?.portfolio_simulation_engine;

  it('emits portfolio-level metrics and exposures', () => {
    expect(sim).toBeTruthy();
    expect(sim?.metrics).toBeTruthy();
    expect(sim?.metrics?.portfolio_return).toBeTypeOf('number');
    expect(sim?.metrics?.drawdown).toBeTypeOf('number');
    expect(sim?.metrics?.sharpe).toBeTypeOf('number');
    expect(sim?.exposures?.by_strategy_family?.length).toBeGreaterThan(0);
  });

  it('emits diversification diagnostics', () => {
    expect(sim?.diagnostics?.diversification_contribution).toBeTruthy();
    expect(sim?.diagnostics?.strategy_correlation_matrix?.length).toBeGreaterThan(0);
    expect(sim?.diagnostics?.portfolio_stability_across_regimes?.length).toBeGreaterThan(0);
    expect(sim?.diagnostics?.drawdown_concentration?.by_family?.length).toBeGreaterThan(0);
    expect(sim?.diagnostics?.institutional_scorecard?.checks?.length).toBeGreaterThan(0);
    expect(sim?.diagnostics?.tail_risk?.worst_period_return).toBeTypeOf('number');
    expect(sim?.diagnostics?.execution_realism?.assumption_profile?.profile_id).toBeTruthy();
    expect(sim?.diagnostics?.execution_realism?.scenario_sensitivity?.length).toBeGreaterThan(0);
  });

  it('enforces family crowding guard in allocation', () => {
    const cap = Number(sim?.allocation?.crowding_guard?.family_cap || 0);
    expect(cap).toBeGreaterThan(0);

    const familyExposureAfter = sim?.diagnostics?.allocation_crowding_guard?.family_exposure_after || [];
    expect(familyExposureAfter.length).toBeGreaterThan(0);

    const maxFamilyExposure = Math.max(...familyExposureAfter.map((row: any) => Number(row.exposure || 0)));
    expect(maxFamilyExposure).toBeLessThanOrEqual(cap + 0.0005);
    expect(Number(sim?.allocation?.crowding_guard?.unallocated_cash_buffer || 0)).toBeGreaterThanOrEqual(0);
  });

  it('applies institutional portfolio risk guardrails', () => {
    expect(sim?.allocation?.institutional_risk_guard).toBeTruthy();
    const maxStrategyWeight = Math.max(
      ...(sim?.allocation?.strategy_rows || []).map((row: any) => Number(row.weight || 0))
    );
    expect(maxStrategyWeight).toBeLessThanOrEqual(
      Number(sim?.allocation?.institutional_risk_guard?.max_strategy_weight || 1) + 0.0005
    );
    expect(sim?.diagnostics?.institutional_risk_guard?.market_exposure_after?.length).toBeGreaterThan(0);
  });
});

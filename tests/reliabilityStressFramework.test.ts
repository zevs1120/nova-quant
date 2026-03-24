import { describe, expect, it } from 'vitest';
// @ts-ignore runtime JS import
import { loadReliabilityScenarioPacks } from '../src/research/reliability/scenarioPacks.js';
// @ts-ignore runtime JS import
import { runReliabilityStressFramework } from '../src/research/reliability/reliabilityStressFramework.js';

describe('reliability stress framework', () => {
  it('loads deterministic scenario packs with required stress cases', () => {
    const packs = loadReliabilityScenarioPacks();
    const ids = packs.scenarios.map((row: { scenario_id: string }) => row.scenario_id);

    expect(packs.seed_id).toBeTruthy();
    expect(packs.scenarios.length).toBeGreaterThanOrEqual(8);
    expect(ids).toContain('elevated_volatility');
    expect(ids).toContain('risk_off_regime');
    expect(ids).toContain('concentrated_exposure');
    expect(ids).toContain('high_slippage');
    expect(ids).toContain('poor_fills');
    expect(ids).toContain('strategy_starvation');
    expect(ids).toContain('strategy_crowding_fake_diversification');
    expect(ids).toContain('degraded_candidate_quality');
  });

  it('runs full stress suite and emits module-level reliability summary', () => {
    const suite = runReliabilityStressFramework({
      asOf: '2026-03-08T00:00:00.000Z',
      riskProfileKey: 'balanced',
    });

    expect(suite.framework_version).toBeTruthy();
    expect(suite.scenarios.length).toBe(8);
    expect(suite.summary.total_scenarios).toBe(8);
    expect(suite.summary.weakest_modules.length).toBeGreaterThan(0);
    expect(suite.summary.strongest_modules.length).toBeGreaterThan(0);
    expect(Array.isArray(suite.summary.first_failure_chain)).toBe(true);
    expect(suite.summary.graceful_degradation_ratio).toBeGreaterThanOrEqual(0);
    expect(suite.summary.graceful_degradation_ratio).toBeLessThanOrEqual(1);
  });

  it('exposes scenario-specific brittleness and sensitivity outputs', () => {
    const suite = runReliabilityStressFramework({
      asOf: '2026-03-08T00:00:00.000Z',
      riskProfileKey: 'balanced',
    });

    const starvation = suite.scenarios.find(
      (row: { scenario_id: string }) => row.scenario_id === 'strategy_starvation',
    );
    const crowding = suite.scenarios.find(
      (row: { scenario_id: string }) =>
        row.scenario_id === 'strategy_crowding_fake_diversification',
    );
    const poorFills = suite.scenarios.find(
      (row: { scenario_id: string }) => row.scenario_id === 'poor_fills',
    );

    expect(starvation).toBeTruthy();
    expect(starvation?.metrics?.generated_candidates).toBeLessThanOrEqual(2);
    expect(starvation?.metrics?.mapping_failures).toBeGreaterThan(0);

    expect(crowding).toBeTruthy();
    expect(crowding?.metrics?.avg_pairwise_correlation).toBeGreaterThan(0.5);

    expect(poorFills).toBeTruthy();
    expect(poorFills?.metrics?.strict_fill_monotonicity_ok).toBe(true);
    expect(poorFills?.metrics?.governance_action_count).toBeGreaterThan(0);
  });
});

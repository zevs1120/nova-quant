import { describe, expect, it } from 'vitest';
// @ts-ignore test imports JS runtime module without d.ts
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('research governance outputs', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-07T00:00:00.000Z',
    config: { risk_profile: 'balanced' }
  });
  const research = state.research;

  it('emits dataset governance + registries + promotion + paper ops', () => {
    expect(research).toBeTruthy();
    expect(research.multi_asset?.dataset_governance?.registry?.length).toBeGreaterThan(0);
    expect(research.registry_system?.alpha_registry?.length).toBeGreaterThan(0);
    expect(research.registry_system?.model_registry?.length).toBeGreaterThan(0);
    expect(research.registry_system?.strategy_registry?.length).toBeGreaterThan(0);
    expect(research.promotion_decisions?.length).toBeGreaterThan(0);
    expect(research.paper_ops?.daily_runs?.length).toBeGreaterThan(0);
  });

  it('keeps governance contract checks passing', () => {
    const checks = research.contract_checks;
    expect(checks).toBeTruthy();
    expect(checks.overall_status).toBe('pass');
    expect(checks.invalid_objects).toBe(0);
  });
});

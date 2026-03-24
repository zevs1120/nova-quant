import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('pipeline smoke with research core v2', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' },
  });

  it('emits research core v2 with seven pillars', () => {
    const core = state?.research?.research_core;
    expect(core).toBeTruthy();
    expect(core.strategy_families?.family_count).toBeGreaterThan(0);
    expect(core.regime_engine?.state?.primary).toBeTruthy();
    expect(core.risk_bucket_system?.trade_level_buckets?.length).toBeGreaterThan(0);
    expect(core.signal_funnel_diagnostics?.overall).toBeTruthy();
    expect(core.shadow_opportunity_log?.records).toBeTruthy();
    expect(core.walk_forward_validation?.strategies?.length).toBeGreaterThan(0);
    expect(core.walk_forward_validation?.replay_validation?.summary?.total_signals).toBeGreaterThan(
      0,
    );
    expect(core.strategy_governance?.decisions?.length).toBeGreaterThan(0);
  });

  it('keeps component status transparency labels', () => {
    const status = state?.research?.research_core?.component_status;
    expect(status).toBeTruthy();
    expect(status.data_feed).toBe('MODEL_DERIVED');
    expect(status.shadow_opportunity_log).toBeTruthy();
  });
});

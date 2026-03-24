import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('signal funnel diagnostics v2 depth', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' },
  });

  it('includes pass-stage counters and sensitivity diagnostics', () => {
    const funnel = state?.research?.research_core?.signal_funnel_diagnostics;
    expect(funnel).toBeTruthy();
    expect(funnel.overall.prefilter_passed).toBeTypeOf('number');
    expect(funnel.overall.regime_filter_passed).toBeTypeOf('number');
    expect(funnel.overall.score_threshold_passed).toBeTypeOf('number');
    expect(funnel.threshold_sensitivity).toBeTruthy();
    expect(funnel.over_filtering_detection).toBeTruthy();
    expect(funnel.by_asset_class?.length).toBeGreaterThan(0);
  });
});

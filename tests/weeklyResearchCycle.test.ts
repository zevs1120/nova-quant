import { describe, expect, it } from 'vitest';
// @ts-ignore runtime JS import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('weekly research cycle', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' }
  });

  const weekly = state?.research?.research_core?.weekly_research_cycle;

  it('generates weekly cycle sections and recommendations', () => {
    expect(weekly).toBeTruthy();
    expect(weekly?.discovery_results).toBeTruthy();
    expect(weekly?.validation_results).toBeTruthy();
    expect(weekly?.signal_density_issues).toBeTruthy();
    expect(weekly?.regime_insights).toBeTruthy();
    expect(weekly?.research_recommendations?.length).toBeGreaterThan(0);
  });

  it('contains markdown report body', () => {
    expect(weekly?.markdown).toBeTruthy();
    expect(weekly?.markdown?.includes('Weekly Research Report')).toBe(true);
  });
});

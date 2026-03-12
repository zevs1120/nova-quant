import { describe, expect, it } from 'vitest';
// @ts-ignore runtime JS import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('ai research copilot', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' }
  });

  const copilot = state?.research?.research_core?.ai_research_copilot;

  it('generates structured research insights and suggestions', () => {
    expect(copilot).toBeTruthy();
    expect(copilot?.research_insights?.length).toBeGreaterThan(0);
    expect(copilot?.hypothesis_suggestions?.length).toBeGreaterThan(0);
    expect(copilot?.top_actions?.length).toBeGreaterThan(0);
  });

  it('includes warning buckets for validation/regime where needed', () => {
    expect(copilot?.validation_warnings).toBeTruthy();
    expect(copilot?.regime_coverage_warnings).toBeTruthy();
  });
});

import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('research automation loop', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' }
  });

  it('emits weekly summary, alerts, and candidate suggestions', () => {
    const loop = state?.research?.research_core?.research_automation_loop;
    expect(loop).toBeTruthy();
    expect(loop.cycle_steps?.length).toBeGreaterThan(0);
    expect(loop.weekly_research_summary?.headline).toBeTruthy();
    expect(loop.candidate_strategy_suggestions?.length).toBeGreaterThan(0);
    expect(loop.signal_starvation).toBeTruthy();
  });
});

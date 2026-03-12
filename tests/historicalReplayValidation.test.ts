import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('historical replay validation', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' }
  });

  const walkForward = state?.research?.research_core?.walk_forward_validation;
  const replay = walkForward?.replay_validation;

  it('builds replay validation summary and signal outcomes', () => {
    expect(replay).toBeTruthy();
    expect(replay?.summary?.total_signals).toBeGreaterThan(0);
    expect(replay?.replayed_signals?.length).toBeGreaterThan(0);
    expect(replay?.signal_outcome_map).toBeTruthy();
  });

  it('records event-ordered lifecycle and trade realism fields', () => {
    const sample = replay?.replayed_signals?.[0];
    expect(sample).toBeTruthy();
    expect(sample.signal_time).toBeTruthy();
    expect(sample.regime_state).toBeTruthy();
    expect(sample.replay_entry_event).toBeTruthy();
    expect(sample.replay_exit_event).toBeTruthy();
    expect(sample.fill_assumption_used).toBeTruthy();
    expect(sample.slippage_assumption_used).toBeTruthy();
    expect(sample.assumption_profile?.profile_id).toBeTruthy();
    expect(sample.realized_holding_duration).toBeTruthy();
    expect(sample.forward_performance).toBeTruthy();
    expect(sample.lifecycle_events?.length).toBeGreaterThan(1);
  });

  it('emits execution sensitivity scenarios', () => {
    expect(replay?.execution_sensitivity?.length).toBeGreaterThan(0);
    const ids = replay?.execution_sensitivity?.map((row: { scenario_id: string }) => row.scenario_id) || [];
    expect(ids).toContain('slippage_plus_25');
    expect(ids).toContain('slippage_plus_50');
    expect(ids).toContain('wider_spread');
    expect(ids).toContain('adverse_funding');
    expect(ids).toContain('strict_fill');
  });
});

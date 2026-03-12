import { describe, expect, it } from 'vitest';
// @ts-ignore runtime JS import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('research evidence system', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' }
  });

  const evidence = state?.research?.research_core?.research_evidence_system;

  it('builds evidence records with chain fields', () => {
    expect(evidence).toBeTruthy();
    expect(evidence?.strategies?.length).toBeGreaterThan(0);

    const sample = evidence.strategies[0];
    expect(sample.strategy_id).toBeTruthy();
    expect(sample.validation_summary).toBeTruthy();
    expect(sample.governance_state).toBeTruthy();
    expect(sample.production_recommendation).toBeTruthy();
    expect(sample.audit_chain).toBeTruthy();
    expect(sample.promotion_history).toBeTruthy();
    const withAssumption = evidence.strategies.find((row: { assumption_profile: unknown }) => Boolean(row.assumption_profile));
    expect(withAssumption).toBeTruthy();
    expect(sample.cost_realism_notes?.length).toBeGreaterThan(0);
  });

  it('computes evidence quality summary', () => {
    expect(evidence?.summary?.total_evidence_records).toBeGreaterThan(0);
    expect(evidence?.summary?.average_evidence_quality_score).toBeGreaterThanOrEqual(0);
    expect(evidence?.summary?.average_evidence_quality_score).toBeLessThanOrEqual(1);
  });
});

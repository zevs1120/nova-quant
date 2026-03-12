import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('strategy governance workflow hardening', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-09T00:00:00.000Z',
    config: { risk_profile: 'balanced' }
  });

  const governance = state?.research?.research_core?.strategy_governance;

  it('exposes enforced five-stage lifecycle and workflow specs', () => {
    expect(governance).toBeTruthy();
    expect(governance?.lifecycle).toEqual(['DRAFT', 'SHADOW', 'CANARY', 'PROD', 'RETIRED']);
    expect(governance?.stage_workflow?.DRAFT?.explicit_requirements?.length).toBeGreaterThan(0);
    expect(governance?.stage_workflow?.SHADOW?.validation_criteria).toBeTruthy();
    expect(governance?.stage_workflow?.CANARY?.monitoring_requirements?.length).toBeGreaterThan(0);
    expect(governance?.stage_workflow?.PROD?.demotion_conditions?.length).toBeGreaterThan(0);
  });

  it('tracks strategy-version governance records and review workflow', () => {
    const records = governance?.strategy_records || [];
    expect(records.length).toBeGreaterThan(0);

    const sample = records[0];
    expect(sample.strategy_id).toBeTruthy();
    expect(sample.version).toBeTruthy();
    expect(sample.evidence_summary).toBeTruthy();
    expect(sample.validation_summary).toBeTruthy();
    expect(sample.review_status).toBeTruthy();
    expect(sample.next_eligible_action).toBeTruthy();
    expect(Array.isArray(sample.promotion_history)).toBe(true);
    expect(Array.isArray(sample.demotion_history)).toBe(true);
    expect(Array.isArray(sample.rollback_history)).toBe(true);
    expect(sample.latest_review?.review_timestamp).toBeTruthy();

    expect(governance?.review_workflow?.reviews?.length).toBe(records.length);
  });

  it('emits typed governance decision objects and registry readiness view', () => {
    const decisionObjects = governance?.decision_objects;
    expect(decisionObjects).toBeTruthy();
    expect(Array.isArray(decisionObjects?.PromotionDecision)).toBe(true);
    expect(Array.isArray(decisionObjects?.DemotionDecision)).toBe(true);
    expect(Array.isArray(decisionObjects?.RollbackDecision)).toBe(true);
    expect(Array.isArray(decisionObjects?.RetirementDecision)).toBe(true);
    expect(Array.isArray(decisionObjects?.all)).toBe(true);

    const registry = state?.research?.registry_system?.strategy_registry || [];
    expect(registry.length).toBeGreaterThan(0);
    const first = registry[0];
    expect(first.current_state).toBeTruthy();
    expect(first.evidence_status).toBeTruthy();
    expect(first.validation_status).toBeTruthy();
    expect(first.review_status).toBeTruthy();
    expect(first.next_eligible_action).toBeTruthy();
  });
});

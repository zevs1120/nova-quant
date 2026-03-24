import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('strategy discovery engine', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' },
  });

  const discovery = state?.research?.research_core?.strategy_discovery_engine;

  it('emits structured discovery layers', () => {
    expect(discovery).toBeTruthy();
    expect(discovery?.hypothesis_registry?.hypotheses?.length).toBeGreaterThan(0);
    expect(discovery?.template_registry?.templates?.length).toBeGreaterThan(0);
    expect(discovery?.candidate_generation?.summary?.total_candidates).toBeGreaterThan(0);
    expect(discovery?.candidate_validation?.summary?.total_candidates).toBeGreaterThan(0);
    expect(discovery?.candidate_scoring?.summary?.total_candidates).toBeGreaterThan(0);
    expect(discovery?.candidate_diagnostics?.summary).toBeTruthy();
  });

  it('keeps candidate traceability from hypothesis to promotion decision', () => {
    const candidates = discovery?.candidates || [];
    expect(candidates.length).toBeGreaterThan(0);

    const sample = candidates[0];
    expect(sample.hypothesis_id).toBeTruthy();
    expect(sample.template_id).toBeTruthy();
    expect(sample.parameter_set).toBeTruthy();
    expect(sample.validation).toBeTruthy();
    expect(sample.scoring).toBeTruthy();
    expect(sample.traceability?.hypothesis_origin).toBe(sample.hypothesis_id);
    expect(sample.traceability?.template_origin).toBe(sample.template_id);
    expect(sample.candidate_source_metadata?.source_type).toBe('seed_driven_runtime');
    expect(sample.candidate_source_metadata?.hypothesis_seed_id).toBeTruthy();
    expect(sample.candidate_source_metadata?.template_seed_id).toBeTruthy();
  });

  it('produces lifecycle decisions with DRAFT to SHADOW promotion path', () => {
    const decisions = discovery?.promotion_decisions || [];
    expect(decisions.length).toBeGreaterThan(0);

    for (const row of decisions.slice(0, 4)) {
      expect(row.from_stage).toBe('DRAFT');
      expect(['DRAFT', 'SHADOW']).toContain(row.to_stage);
    }
  });

  it('exposes runtime seed utilization diagnostics', () => {
    expect(discovery?.seed_runtime?.runtime_version).toBeTruthy();
    expect(discovery?.seed_runtime?.hypothesis_seed?.total).toBeGreaterThan(0);
    expect(discovery?.candidate_generation?.summary?.runtime_seed_diagnostics).toBeTruthy();
    expect(discovery?.candidate_diagnostics?.seed_runtime_diagnostics).toBeTruthy();
  });

  it('supports constrained discovery runs by market/asset/family', () => {
    const constrained = runQuantPipeline({
      as_of: '2026-03-08T00:00:00.000Z',
      config: {
        risk_profile: 'balanced',
        discovery: {
          generation: {
            market: 'CRYPTO',
            asset_class: 'CRYPTO',
            family: 'Crypto-Native Families',
            discovery_batch_size: 12,
          },
        },
      },
    });

    const constrainedDiscovery = constrained?.research?.research_core?.strategy_discovery_engine;
    const constrainedCandidates = constrainedDiscovery?.candidate_generation?.candidates || [];
    expect(constrainedCandidates.length).toBeGreaterThan(0);
    for (const row of constrainedCandidates) {
      expect(row.strategy_family).toBe('Crypto-Native Families');
      expect(row.supported_asset_classes).toContain('CRYPTO');
    }
  });
});

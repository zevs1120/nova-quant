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

  it('keeps public-seed candidates limited to runtime-supported feature sets', () => {
    const publicCandidates = (discovery?.candidates || []).filter((row: any) =>
      String(row.candidate_source_metadata?.hypothesis_source?.seed_id || '').startsWith('public_'),
    );
    const publicHypotheses = [...new Set(publicCandidates.map((row: any) => row.hypothesis_id))];

    expect(publicCandidates.length).toBeGreaterThan(0);
    expect(publicHypotheses.length).toBeGreaterThan(1);
    for (const row of publicCandidates) {
      expect(
        row.candidate_source_metadata?.runtime_feature_support?.blocking_features || [],
      ).toHaveLength(0);
    }
  });

  it('can generate newly sourced public-research families with auditable urls', () => {
    const constrained = runQuantPipeline({
      as_of: '2026-03-08T00:00:00.000Z',
      config: {
        risk_profile: 'balanced',
        discovery: {
          generation: {
            family: 'Momentum / Trend Following',
            discovery_batch_size: 80,
          },
        },
      },
    });
    const candidates =
      constrained?.research?.research_core?.strategy_discovery_engine?.candidates || [];
    const volManaged = candidates.find(
      (row: any) => row.hypothesis_id === 'HYP-PUBLIC-VOLMAN-TSMOM-001',
    );
    const highAnchor = candidates.find((row: any) => row.hypothesis_id === 'HYP-PUBLIC-52WH-001');

    expect(volManaged?.template_id).toBe('TPL-PUBLIC-VOLMAN-TSMOM-01');
    expect(highAnchor?.supporting_features).toContain('distance_to_52w_high');
    expect(
      volManaged?.candidate_source_metadata?.hypothesis_source?.public_reference_urls || [],
    ).toContain('https://www.nber.org/papers/w22208');
    expect(
      highAnchor?.candidate_source_metadata?.template_source?.public_reference_urls || [],
    ).toContain('https://www.bauer.uh.edu/TGeorge/papers/gh4-paper.pdf');
  });
});

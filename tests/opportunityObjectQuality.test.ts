import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { runQuantPipeline } from '../src/engines/pipeline.js';

describe('product-facing opportunity object quality', () => {
  const state = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' },
  });

  it('provides structured opportunity objects with lineage', () => {
    const opportunities = state?.research?.research_core?.product_opportunities || [];
    expect(opportunities.length).toBeGreaterThan(0);
    const item = opportunities[0];

    expect(item.asset).toBeTruthy();
    expect(item.market).toBeTruthy();
    expect(item.direction).toBeTruthy();
    expect(item.strategy_family).toBeTruthy();
    expect(item.strategy_template).toBeTruthy();
    expect(item.regime_compatibility).toBeTruthy();
    expect(item.entry).toBeTruthy();
    expect(item.stop).toBeTruthy();
    expect(item.targets).toBeTruthy();
    expect(item.suggested_size_pct).toBeTypeOf('number');
    expect(item.risk_bucket).toBeTruthy();
    expect(item.holding_horizon).toBeTypeOf('number');
    expect(item.rationale_summary?.length).toBeGreaterThan(0);
    expect(item.audit_lineage?.signal_id).toBeTruthy();
  });
});

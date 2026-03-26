import { describe, expect, it } from 'vitest';
import { buildPublicAlphaSupplyReport } from '../src/server/research/publicAlphaSupply.js';

describe('public alpha supply layer', () => {
  it('separates quick-win public supply from ideas blocked by missing data classes', () => {
    const report = buildPublicAlphaSupplyReport({ market: 'US', assetClass: 'US_STOCK' });
    const supply = report.supply;

    expect(supply.summary.public_hypothesis_count).toBeGreaterThan(0);
    expect(supply.summary.public_template_count).toBeGreaterThan(0);
    expect(supply.summary.matched_supply_rows).toBeGreaterThan(0);
    expect(supply.summary.adapter_quick_win).toBeGreaterThan(0);
    expect(supply.summary.blocked_missing_data).toBeGreaterThan(0);

    const trend = supply.rows.find((row: any) => row.hypothesis_id === 'HYP-PUBLIC-TSMOM-001');
    expect(trend?.deployment_stage).toBe('adapter_quick_win');
    expect(trend?.blocking_features || []).toHaveLength(0);

    const pead = supply.rows.find((row: any) => row.hypothesis_id === 'HYP-PUBLIC-PEAD-001');
    expect(pead?.deployment_stage).toBe('blocked_missing_data');
    expect((pead?.blocking_features || []).length).toBeGreaterThan(0);
  });
});

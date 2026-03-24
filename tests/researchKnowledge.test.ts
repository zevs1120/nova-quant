import { describe, expect, it } from 'vitest';
import {
  getFactorDefinition,
  getResearchDoctrineProfile,
  listCrossSectionalModelCatalog,
  listFactorCatalog,
  listRegimeTaxonomy,
  listStrategyMetadata,
} from '../src/server/research/knowledge.js';

describe('research knowledge layer', () => {
  it('exposes the core factor taxonomy backbone', () => {
    const catalog = listFactorCatalog();
    const ids = catalog.map((row) => row.factor_id);
    expect(ids).toContain('value');
    expect(ids).toContain('momentum');
    expect(ids).toContain('quality');
    expect(ids).toContain('carry');
    expect(ids).toContain('low_vol');
  });

  it('returns rich metadata for a factor definition', () => {
    const factor = getFactorDefinition('momentum');
    expect(factor?.title).toBe('Momentum');
    expect(factor?.proxies.length).toBeGreaterThan(0);
    expect(factor?.failure_modes.length).toBeGreaterThan(0);
    expect((factor?.public_references || []).length).toBeGreaterThan(0);
  });

  it('includes regime taxonomy, strategy metadata, and cross-sectional model catalog', () => {
    const regimes = listRegimeTaxonomy();
    const strategies = listStrategyMetadata();
    const models = listCrossSectionalModelCatalog();

    expect(regimes.some((row) => row.regime_id === 'stress_risk_off')).toBe(true);
    expect(strategies.length).toBeGreaterThan(0);
    expect(
      strategies.some((family) =>
        family.templates.some(
          (template) => template.strategy_template_name === 'time_series_momentum',
        ),
      ),
    ).toBe(true);
    expect(models.some((row) => row.model_id === 'linear_baseline')).toBe(true);
  });

  it('exposes the Nova cross-asset research doctrine profile', () => {
    const doctrine = getResearchDoctrineProfile();
    expect(doctrine.doctrine_id).toContain('doctrine');
    expect(doctrine.market_scope.priority[0]).toBe('COMMODITY_FUTURES');
    expect(doctrine.prohibited_shortcuts.some((row) => row.includes('RSI'))).toBe(true);
  });
});

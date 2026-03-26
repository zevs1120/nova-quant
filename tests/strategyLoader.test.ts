import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import {
  validateTemplate,
  normalizeTemplate,
  loadStrategyFromYaml,
  loadStrategiesFromDirectory,
  mergeTemplates,
} from '../src/engines/strategyLoader.js';

/* ---------- test fixtures ---------- */

const TMP_DIR = join(process.cwd(), 'tmp_strategy_test_' + process.pid);

function writeTmpYaml(filename: string, content: string) {
  writeFileSync(join(TMP_DIR, filename), content, 'utf-8');
}

const VALID_YAML = `
strategy_id: TEST_STRAT
strategy_family: Test/Family
asset_class: US_STOCK
market: US
default_timeframe: 1D
name: Test Strategy
features:
  - trend_strength
  - volume
trigger_conditions:
  - 'Trend aligns.'
invalidation:
  - 'Trend breaks.'
rules:
  - 'Follow trend.'
  - 'Cut losses.'
cost_assumptions:
  fee_bps: 3
  spread_bps: 2
  slippage_bps: 3
trailing_rule:
  mode: ema-trail
  trigger_r_multiple: 1.2
  trail_distance_pct: 1.5
regime_tags:
  - trending
  - range
`;

const MINIMAL_YAML = `
strategy_id: MINIMAL
strategy_family: Minimal
asset_class: CRYPTO
market: CRYPTO
features:
  - basis
rules:
  - 'Trade basis.'
`;

const MISSING_FIELDS_YAML = `
strategy_id: BAD_STRAT
# missing strategy_family, asset_class, market, features, rules
`;

const INVALID_TYPES_YAML = `
strategy_id: BAD_TYPES
strategy_family: BadTypes
asset_class: US_STOCK
market: US
features: 'not-an-array'
rules: 'also-not-an-array'
`;

/* ---------- setup / teardown ---------- */

beforeEach(() => {
  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

/* ---------- validateTemplate ---------- */

describe('validateTemplate', () => {
  it('accepts a valid template object', () => {
    const data = {
      strategy_id: 'X',
      strategy_family: 'Y',
      asset_class: 'US_STOCK',
      market: 'US',
      features: ['a'],
      rules: ['b'],
    };
    const { valid, errors } = validateTemplate(data);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('rejects null or non-object input', () => {
    expect(validateTemplate(null as any).valid).toBe(false);
    expect(validateTemplate('string' as any).valid).toBe(false);
  });

  it('reports missing required fields', () => {
    const { valid, errors } = validateTemplate({ strategy_id: 'X' });
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(errors.some((e: string) => e.includes('strategy_family'))).toBe(true);
    expect(errors.some((e: string) => e.includes('features'))).toBe(true);
  });

  it('rejects non-array features', () => {
    const data = {
      strategy_id: 'X',
      strategy_family: 'Y',
      asset_class: 'US_STOCK',
      market: 'US',
      features: 'not-array',
      rules: ['ok'],
    };
    const { valid, errors } = validateTemplate(data);
    expect(valid).toBe(false);
    expect(errors.some((e: string) => e.includes("'features' must be an array"))).toBe(true);
  });

  it('rejects non-array rules', () => {
    const data = {
      strategy_id: 'X',
      strategy_family: 'Y',
      asset_class: 'US_STOCK',
      market: 'US',
      features: ['a'],
      rules: 42,
    };
    const { valid, errors } = validateTemplate(data);
    expect(valid).toBe(false);
    expect(errors.some((e: string) => e.includes("'rules' must be an array"))).toBe(true);
  });

  it('rejects non-array regime_tags', () => {
    const data = {
      strategy_id: 'X',
      strategy_family: 'Y',
      asset_class: 'US_STOCK',
      market: 'US',
      features: ['a'],
      rules: ['b'],
      regime_tags: 'trending',
    };
    const { valid, errors } = validateTemplate(data);
    expect(valid).toBe(false);
    expect(errors.some((e: string) => e.includes('regime_tags'))).toBe(true);
  });
});

/* ---------- normalizeTemplate ---------- */

describe('normalizeTemplate', () => {
  it('normalizes a complete template', () => {
    const data = {
      strategy_id: '  TEST  ',
      strategy_family: 'Family',
      asset_class: 'CRYPTO',
      market: 'CRYPTO',
      default_timeframe: '4H',
      name: 'Test',
      features: ['a', 'b'],
      rules: ['r'],
      regime_tags: ['trending'],
      cost_assumptions: { fee_bps: 5, spread_bps: 3 },
    };
    const t = normalizeTemplate(data) as any;
    expect(t.strategy_id).toBe('TEST');
    expect(t.source).toBe('yaml');
    expect(t.regime_tags).toEqual(['trending']);
    expect(t.cost_assumptions.fee_bps).toBe(5);
    expect(t.cost_assumptions.slippage_bps).toBe(3); // default
  });

  it('applies defaults for missing optional fields', () => {
    const t = normalizeTemplate({
      strategy_id: 'X',
      strategy_family: 'F',
    }) as any;
    expect(t.asset_class).toBe('US_STOCK');
    expect(t.market).toBe('US');
    expect(t.default_timeframe).toBe('1D');
    expect(t.features).toEqual([]);
    expect(t.regime_tags).toEqual([]);
    expect(t.cost_assumptions.fee_bps).toBe(3);
  });
});

/* ---------- loadStrategyFromYaml ---------- */

describe('loadStrategyFromYaml', () => {
  it('loads and normalizes a valid YAML file', () => {
    writeTmpYaml('valid.yaml', VALID_YAML);
    const t = loadStrategyFromYaml(join(TMP_DIR, 'valid.yaml')) as any;
    expect(t.strategy_id).toBe('TEST_STRAT');
    expect(t.strategy_family).toBe('Test/Family');
    expect(t.features).toContain('trend_strength');
    expect(t.regime_tags).toContain('trending');
    expect(t.source).toBe('yaml');
  });

  it('loads a minimal valid YAML file', () => {
    writeTmpYaml('minimal.yaml', MINIMAL_YAML);
    const t = loadStrategyFromYaml(join(TMP_DIR, 'minimal.yaml')) as any;
    expect(t.strategy_id).toBe('MINIMAL');
    expect(t.market).toBe('CRYPTO');
  });

  it('throws on missing file', () => {
    expect(() => loadStrategyFromYaml('/nonexistent/file.yaml')).toThrow('not found');
  });

  it('throws on invalid YAML syntax', () => {
    writeTmpYaml('bad_syntax.yaml', ':\n  - :\n  invalid yaml }{');
    expect(() => loadStrategyFromYaml(join(TMP_DIR, 'bad_syntax.yaml'))).toThrow();
  });

  it('throws on missing required fields', () => {
    writeTmpYaml('missing.yaml', MISSING_FIELDS_YAML);
    expect(() => loadStrategyFromYaml(join(TMP_DIR, 'missing.yaml'))).toThrow('Invalid strategy');
  });
});

/* ---------- loadStrategiesFromDirectory ---------- */

describe('loadStrategiesFromDirectory', () => {
  it('loads all YAML files from directory', () => {
    writeTmpYaml('a.yaml', VALID_YAML);
    writeTmpYaml(
      'b.yml',
      VALID_YAML.replace('TEST_STRAT', 'TEST_STRAT_2').replace('Test Strategy', 'Test 2'),
    );
    const templates = loadStrategiesFromDirectory(TMP_DIR) as any[];
    expect(templates.length).toBe(2);
    const ids = templates.map((t) => t.strategy_id);
    expect(ids).toContain('TEST_STRAT');
    expect(ids).toContain('TEST_STRAT_2');
  });

  it('returns empty array for nonexistent directory', () => {
    const result = loadStrategiesFromDirectory('/nonexistent/path');
    expect(result).toEqual([]);
  });

  it('returns empty array for empty directory', () => {
    const result = loadStrategiesFromDirectory(TMP_DIR);
    expect(result).toEqual([]);
  });

  it('skips invalid files and continues', () => {
    writeTmpYaml('valid.yaml', VALID_YAML);
    writeTmpYaml('invalid.yaml', MISSING_FIELDS_YAML);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const templates = loadStrategiesFromDirectory(TMP_DIR) as any[];
    expect(templates.length).toBe(1);
    expect(templates[0].strategy_id).toBe('TEST_STRAT');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('ignores non-YAML files', () => {
    writeTmpYaml('readme.md', '# Not a strategy');
    writeFileSync(join(TMP_DIR, 'data.json'), '{}');
    writeTmpYaml('valid.yaml', VALID_YAML);
    const templates = loadStrategiesFromDirectory(TMP_DIR) as any[];
    expect(templates.length).toBe(1);
  });
});

/* ---------- mergeTemplates ---------- */

describe('mergeTemplates', () => {
  it('adds new templates from YAML', () => {
    const builtins = { A: { strategy_id: 'A', name: 'A-builtin' } };
    const yamlTs = [{ strategy_id: 'B', name: 'B-yaml' }];
    const merged = mergeTemplates(builtins, yamlTs as any) as any;
    expect(merged.A.name).toBe('A-builtin');
    expect(merged.B.name).toBe('B-yaml');
  });

  it('YAML overrides built-in with same strategy_id', () => {
    const builtins = { A: { strategy_id: 'A', name: 'original' } };
    const yamlTs = [{ strategy_id: 'A', name: 'overridden' }];
    const merged = mergeTemplates(builtins, yamlTs as any) as any;
    expect(merged.A.name).toBe('overridden');
  });

  it('does not mutate the original built-in map', () => {
    const builtins = { A: { strategy_id: 'A', name: 'original' } };
    const yamlTs = [{ strategy_id: 'B', name: 'new' }];
    mergeTemplates(builtins, yamlTs as any);
    expect(builtins).not.toHaveProperty('B');
  });

  it('handles empty YAML array', () => {
    const builtins = { A: { strategy_id: 'A' } };
    const merged = mergeTemplates(builtins, []) as any;
    expect(Object.keys(merged)).toEqual(['A']);
  });
});

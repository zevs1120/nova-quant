import { describe, expect, it } from 'vitest';
import {
  listStrategyTemplates,
  getStrategyTemplate,
  resolveStrategyId,
  buildSignalExplanation,
  strategyTemplateVersion,
} from '../src/engines/strategyTemplates.js';

/* ---------- template catalog ---------- */

describe('strategy template catalog', () => {
  it('lists all 9 templates', () => {
    const templates = listStrategyTemplates();
    expect(templates.length).toBe(9);
    const ids = templates.map((t: any) => t.strategy_id);
    expect(ids).toContain('CR_BAS');
    expect(ids).toContain('CR_VEL');
    expect(ids).toContain('CR_TRAP');
    expect(ids).toContain('CR_CARRY');
    expect(ids).toContain('EQ_VEL');
    expect(ids).toContain('EQ_EVT');
    expect(ids).toContain('EQ_REG');
    expect(ids).toContain('EQ_SWING');
    expect(ids).toContain('OP_INTRADAY');
  });

  it('every template has required fields', () => {
    for (const t of listStrategyTemplates() as any[]) {
      expect(t.strategy_id).toBeTruthy();
      expect(t.strategy_family).toBeTruthy();
      expect(t.asset_class).toBeTruthy();
      expect(t.market).toBeTruthy();
      expect(t.default_timeframe).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.features.length).toBeGreaterThan(0);
      expect(t.trigger_conditions.length).toBeGreaterThan(0);
      expect(t.invalidation.length).toBeGreaterThan(0);
      expect(t.rules.length).toBeGreaterThan(0);
      expect(t.cost_assumptions).toBeTruthy();
      expect(typeof t.cost_assumptions.fee_bps).toBe('number');
    }
  });

  it('version is defined', () => {
    expect(strategyTemplateVersion).toBeTruthy();
    expect(typeof strategyTemplateVersion).toBe('string');
  });
});

/* ---------- getStrategyTemplate ---------- */

describe('getStrategyTemplate', () => {
  it('returns requested template by ID', () => {
    const t = getStrategyTemplate('CR_BAS') as any;
    expect(t.strategy_id).toBe('CR_BAS');
    expect(t.asset_class).toBe('CRYPTO');
  });

  it('falls back to EQ_REG for unknown ID', () => {
    const t = getStrategyTemplate('NONEXISTENT') as any;
    expect(t.strategy_id).toBe('EQ_REG');
  });
});

/* ---------- resolveStrategyId ---------- */

describe('resolveStrategyId', () => {
  it('returns signal.strategy_id when it exists in templates', () => {
    expect(resolveStrategyId({ strategy_id: 'CR_BAS', market: 'CRYPTO', symbol: 'BTC-USDT' })).toBe(
      'CR_BAS',
    );
  });

  it('ignores invalid strategy_id and uses symbol map', () => {
    expect(
      resolveStrategyId({ strategy_id: 'INVALID', market: 'CRYPTO', symbol: 'BTC-USDT' }),
    ).toBe('CR_BAS');
  });

  it('resolves via SYMBOL_TO_STRATEGY map', () => {
    expect(resolveStrategyId({ market: 'CRYPTO', symbol: 'ETH-USDT' })).toBe('CR_VEL');
    expect(resolveStrategyId({ market: 'US', symbol: 'SPY' })).toBe('EQ_REG');
    expect(resolveStrategyId({ market: 'US', symbol: 'AAPL' })).toBe('EQ_VEL');
    expect(resolveStrategyId({ market: 'US', symbol: 'NVDA' })).toBe('EQ_EVT');
  });

  it('falls back by asset_class for unmapped symbols', () => {
    expect(resolveStrategyId({ market: 'US', symbol: 'UNKNOWN', asset_class: 'OPTIONS' })).toBe(
      'OP_INTRADAY',
    );
    expect(resolveStrategyId({ market: 'US', symbol: 'UNKNOWN', asset_class: 'US_STOCK' })).toBe(
      'EQ_SWING',
    );
  });

  it('falls back by market when nothing else matches', () => {
    expect(resolveStrategyId({ market: 'CRYPTO', symbol: 'UNKNOWN' })).toBe('CR_VEL');
    expect(resolveStrategyId({ market: 'US', symbol: 'UNKNOWN' })).toBe('EQ_REG');
  });

  it('resolves options symbols', () => {
    expect(resolveStrategyId({ market: 'US', symbol: 'SPY240621C00540000' })).toBe('OP_INTRADAY');
  });
});

/* ---------- buildSignalExplanation ---------- */

describe('buildSignalExplanation', () => {
  it('produces 4 explanation lines', () => {
    const lines = buildSignalExplanation({
      signal: { symbol: 'BTC-USDT', direction: 'LONG', entry_min: 68000, entry_max: 69000 },
      template: getStrategyTemplate('CR_BAS'),
      regime: { regime_id: 'RGM_RISK_ON', trend_strength: 0.7, vol_percentile: 0.4 },
      velocity: { percentile: 0.65 },
      risk: { bucket_state: 'BASE', sample_size_reference: 42 },
      expectedR: 2.1,
      hitRateEst: 0.58,
      costEstimate: { total_bps: 8 },
    });
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('CR_BAS');
    expect(lines[0]).toContain('long');
    expect(lines[0]).toContain('68000');
    expect(lines[1]).toContain('RGM_RISK_ON');
    expect(lines[1]).toContain('BASE');
    expect(lines[2]).toContain('R=2.10');
    expect(lines[2]).toContain('58%');
    expect(lines[3]).toContain('Avoid when');
  });

  it('handles zero velocity percentile', () => {
    const lines = buildSignalExplanation({
      signal: { symbol: 'AAPL', direction: 'SHORT', entry_min: 180, entry_max: 182 },
      template: getStrategyTemplate('EQ_VEL'),
      regime: { regime_id: 'RGM_NEUTRAL', trend_strength: 0.45, vol_percentile: 0.5 },
      velocity: { percentile: 0 },
      risk: { bucket_state: 'DERISKED', sample_size_reference: 10 },
      expectedR: 1.2,
      hitRateEst: 0.45,
      costEstimate: { total_bps: 4 },
    });
    expect(lines[1]).toContain('velocity_pct=0%');
  });
});

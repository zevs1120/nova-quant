import { describe, expect, it } from 'vitest';
import {
  ASSET_CLASS,
  DATA_STATUS,
  FREQUENCY,
  REQUIRED_FIELDS,
  buildProvenance,
  createAssetId,
  safeNumber,
  toIsoDate,
  toIsoTimestamp
} from '../src/types/multiAssetSchema.js';

/* ---------- constants ---------- */

describe('multiAssetSchema — constants', () => {
  it('ASSET_CLASS has equity, option, crypto', () => {
    expect(ASSET_CLASS.EQUITY).toBe('equity');
    expect(ASSET_CLASS.OPTION).toBe('option');
    expect(ASSET_CLASS.CRYPTO).toBe('crypto');
  });

  it('DATA_STATUS has raw, normalized, derived', () => {
    expect(DATA_STATUS.RAW).toBe('raw');
    expect(DATA_STATUS.NORMALIZED).toBe('normalized');
    expect(DATA_STATUS.DERIVED).toBe('derived');
  });

  it('FREQUENCY has daily, hourly, 5m', () => {
    expect(FREQUENCY.DAILY).toBe('1d');
    expect(FREQUENCY.HOURLY).toBe('1h');
    expect(FREQUENCY.MINUTE_5).toBe('5m');
  });
});

/* ---------- REQUIRED_FIELDS ---------- */

describe('multiAssetSchema — REQUIRED_FIELDS', () => {
  it('Asset has 6 required fields', () => {
    expect(REQUIRED_FIELDS.Asset).toHaveLength(6);
    expect(REQUIRED_FIELDS.Asset).toContain('asset_id');
    expect(REQUIRED_FIELDS.Asset).toContain('symbol');
    expect(REQUIRED_FIELDS.Asset).toContain('source');
  });

  it('EquityBar has 8 required fields including OHLCV', () => {
    expect(REQUIRED_FIELDS.EquityBar).toHaveLength(8);
    expect(REQUIRED_FIELDS.EquityBar).toContain('open');
    expect(REQUIRED_FIELDS.EquityBar).toContain('close');
    expect(REQUIRED_FIELDS.EquityBar).toContain('volume');
  });

  it('CryptoBar has 8 required fields', () => {
    expect(REQUIRED_FIELDS.CryptoBar).toHaveLength(8);
    expect(REQUIRED_FIELDS.CryptoBar).toContain('product_id');
  });

  it('OptionContract has 6 required fields', () => {
    expect(REQUIRED_FIELDS.OptionContract).toHaveLength(6);
    expect(REQUIRED_FIELDS.OptionContract).toContain('strike');
    expect(REQUIRED_FIELDS.OptionContract).toContain('option_type');
  });

  it('DatasetSnapshot has 7 required fields', () => {
    expect(REQUIRED_FIELDS.DatasetSnapshot).toHaveLength(7);
    expect(REQUIRED_FIELDS.DatasetSnapshot).toContain('coverage_summary');
  });

  it('TrainingDataset has 6 required fields', () => {
    expect(REQUIRED_FIELDS.TrainingDataset).toHaveLength(6);
    expect(REQUIRED_FIELDS.TrainingDataset).toContain('split');
  });
});

/* ---------- buildProvenance ---------- */

describe('buildProvenance', () => {
  it('maps all fields correctly', () => {
    const p = buildProvenance({
      source: 'stooq',
      fetched_at: '2026-01-01',
      frequency: '1d',
      id: 'equity:us:AAPL',
      data_status: 'normalized',
      use_notes: 'Clean daily bars',
      license_notes: 'Free for research'
    });
    expect(p.source).toBe('stooq');
    expect(p.identifier).toBe('equity:us:AAPL');
    expect(p.data_status).toBe('normalized');
    expect(p.use_notes).toBe('Clean daily bars');
    expect(p.license_notes).toBe('Free for research');
  });

  it('handles missing optional fields gracefully', () => {
    const p = buildProvenance({
      source: 'binance',
      fetched_at: '2026-03-01',
      frequency: '1h',
      id: 'crypto:binance:BTC-USDT',
      data_status: 'raw'
    });
    expect(p.source).toBe('binance');
    expect(p.use_notes).toBeUndefined();
    expect(p.license_notes).toBeUndefined();
  });
});

/* ---------- createAssetId ---------- */

describe('createAssetId', () => {
  it('concatenates class:venue:symbol', () => {
    expect(createAssetId('equity', 'us', 'AAPL')).toBe('equity:us:AAPL');
  });

  it('works for crypto', () => {
    expect(createAssetId('crypto', 'binance', 'BTC-USDT')).toBe('crypto:binance:BTC-USDT');
  });

  it('works for options', () => {
    expect(createAssetId('option', 'us', 'SPY240621C00540000')).toBe('option:us:SPY240621C00540000');
  });
});

/* ---------- safeNumber ---------- */

describe('safeNumber', () => {
  it('returns numbers as-is', () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(-3.14)).toBe(-3.14);
  });

  it('parses numeric strings', () => {
    expect(safeNumber('123.45')).toBe(123.45);
  });

  it('returns fallback for NaN', () => {
    expect(safeNumber(NaN)).toBe(0);
    expect(safeNumber(NaN, -1)).toBe(-1);
  });

  it('returns fallback for non-numeric strings', () => {
    expect(safeNumber('abc')).toBe(0);
    expect(safeNumber('abc', 99)).toBe(99);
  });

  it('returns fallback for null/undefined', () => {
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber(undefined)).toBe(0);
  });

  it('returns fallback for Infinity', () => {
    expect(safeNumber(Infinity)).toBe(0);
    expect(safeNumber(-Infinity, -1)).toBe(-1);
  });
});

/* ---------- toIsoDate ---------- */

describe('toIsoDate', () => {
  it('extracts YYYY-MM-DD from ISO timestamp', () => {
    expect(toIsoDate('2026-03-15T14:30:00Z')).toBe('2026-03-15');
  });

  it('preserves date-only string', () => {
    expect(toIsoDate('2026-03-15')).toBe('2026-03-15');
  });

  it('returns empty-ish for falsy input', () => {
    expect(toIsoDate('')).toBe('');
    expect(toIsoDate(null)).toBe('');
    expect(toIsoDate(undefined)).toBe('');
  });
});

/* ---------- toIsoTimestamp ---------- */

describe('toIsoTimestamp', () => {
  it('converts date-only to full timestamp', () => {
    const result = toIsoTimestamp('2026-03-15');
    expect(result).toBe('2026-03-15T00:00:00.000Z');
  });

  it('passes through ISO timestamp', () => {
    const result = toIsoTimestamp('2026-03-15T14:30:00Z');
    expect(result).toMatch(/2026-03-15T/);
  });

  it('returns current ISO for falsy input', () => {
    const result = toIsoTimestamp('');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns current ISO for undefined', () => {
    const result = toIsoTimestamp(undefined);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

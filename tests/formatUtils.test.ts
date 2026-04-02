import { describe, expect, it } from 'vitest';
import {
  confidenceBand,
  directionIcon,
  formatDateTime,
  formatNumber,
  formatPercent,
} from '../src/utils/format.js';

const locale = 'en-US';

describe('format utils', () => {
  it('formatNumber handles nullish and NaN', () => {
    expect(formatNumber(null, 2, locale)).toBe('--');
    expect(formatNumber(undefined, 2, locale)).toBe('--');
    expect(formatNumber(Number.NaN, 2, locale)).toBe('--');
  });

  it('formatNumber formats finite values', () => {
    expect(formatNumber(1234.5, 2, locale)).toMatch(/1,234\.5/);
    expect(formatNumber(10, 2, locale)).toMatch(/^10/);
  });

  it('formatPercent scales and supports signed prefix', () => {
    expect(formatPercent(null, 1, false)).toBe('--');
    expect(formatPercent(0.0123, 2, false)).toBe('1.23%');
    expect(formatPercent(0.05, 1, true)).toBe('+5.0%');
  });

  it('formatDateTime handles invalid iso', () => {
    expect(formatDateTime('', locale)).toBe('--');
    expect(formatDateTime('not-a-date', locale)).toBe('--');
    expect(formatDateTime('2024-06-01T12:30:00.000Z', locale)).not.toBe('--');
  });

  it('confidenceBand thresholds', () => {
    expect(confidenceBand(5)).toBe('high');
    expect(confidenceBand(3)).toBe('medium');
    expect(confidenceBand(2)).toBe('low');
  });

  it('directionIcon', () => {
    expect(directionIcon('LONG')).toBe('↗');
    expect(directionIcon('SHORT')).toBe('↘');
  });
});

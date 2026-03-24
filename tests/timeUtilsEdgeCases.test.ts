import { describe, expect, it } from 'vitest';
import {
  timeframeToMs,
  toMsUtc,
  isoToMs,
  floorToTimeframe,
  monthRange,
  dayRange,
} from '../src/server/utils/time.js';

/* ---------- timeframeToMs ---------- */

describe('timeframeToMs', () => {
  it('converts 1m to 60_000ms', () => {
    expect(timeframeToMs('1m')).toBe(60_000);
  });

  it('converts 5m to 300_000ms', () => {
    expect(timeframeToMs('5m')).toBe(5 * 60_000);
  });

  it('converts 15m to 900_000ms', () => {
    expect(timeframeToMs('15m')).toBe(15 * 60_000);
  });

  it('converts 1h to 3_600_000ms', () => {
    expect(timeframeToMs('1h')).toBe(60 * 60_000);
  });

  it('converts 1d to 86_400_000ms', () => {
    expect(timeframeToMs('1d')).toBe(24 * 60 * 60_000);
  });

  it('throws for unsupported timeframe', () => {
    expect(() => timeframeToMs('3d' as any)).toThrow(/unsupported timeframe/i);
  });
});

/* ---------- toMsUtc ---------- */

describe('toMsUtc', () => {
  it('returns number input directly', () => {
    expect(toMsUtc(1700000000000)).toBe(1700000000000);
  });

  it('converts Date to ms', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(toMsUtc(d)).toBe(d.getTime());
  });

  it('converts ISO string to ms', () => {
    const ms = toMsUtc('2026-01-15T12:00:00Z');
    expect(ms).toBe(new Date('2026-01-15T12:00:00Z').getTime());
  });

  it('converts numeric string to number', () => {
    expect(toMsUtc('1700000000000')).toBe(1700000000000);
  });

  it('throws for invalid string', () => {
    expect(() => toMsUtc('not-a-date')).toThrow(/invalid timestamp/i);
  });
});

/* ---------- isoToMs ---------- */

describe('isoToMs', () => {
  it('returns undefined for empty input', () => {
    expect(isoToMs()).toBeUndefined();
    expect(isoToMs('')).toBeUndefined();
  });

  it('parses ISO string', () => {
    const ms = isoToMs('2026-03-01T00:00:00Z');
    expect(ms).toBe(Date.parse('2026-03-01T00:00:00Z'));
  });

  it('returns numeric string as number', () => {
    expect(isoToMs('1700000000000')).toBe(1700000000000);
  });

  it('returns undefined for garbage string', () => {
    expect(isoToMs('garbage')).toBeUndefined();
  });
});

/* ---------- floorToTimeframe ---------- */

describe('floorToTimeframe', () => {
  it('floors to 1h boundary', () => {
    const ts = Date.parse('2026-01-15T14:37:22Z');
    const floored = floorToTimeframe(ts, '1h');
    const expected = Date.parse('2026-01-15T14:00:00Z');
    expect(floored).toBe(expected);
  });

  it('floors to 1d boundary', () => {
    const ts = Date.parse('2026-01-15T14:37:22Z');
    const floored = floorToTimeframe(ts, '1d');
    const expected = Date.parse('2026-01-15T00:00:00Z');
    expect(floored).toBe(expected);
  });

  it('floors to 5m boundary', () => {
    const ts = Date.parse('2026-01-15T14:37:22Z');
    const floored = floorToTimeframe(ts, '5m');
    const expected = Date.parse('2026-01-15T14:35:00Z');
    expect(floored).toBe(expected);
  });

  it('returns same value when already aligned', () => {
    const ts = Date.parse('2026-01-15T14:00:00Z');
    expect(floorToTimeframe(ts, '1h')).toBe(ts);
  });
});

/* ---------- monthRange ---------- */

describe('monthRange', () => {
  it('returns single month for same start/end month', () => {
    const range = monthRange('2026-03-15', new Date('2026-03-20'));
    expect(range).toEqual(['2026-03']);
  });

  it('returns multiple months', () => {
    const range = monthRange('2026-01-01', new Date('2026-03-15'));
    expect(range).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('handles year boundary', () => {
    const range = monthRange('2025-11-15', new Date('2026-02-10'));
    expect(range).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('returns empty for reversed range', () => {
    const range = monthRange('2026-06-01', new Date('2026-01-01'));
    expect(range).toEqual([]);
  });
});

/* ---------- dayRange ---------- */

describe('dayRange', () => {
  it('returns N days ending at given date', () => {
    const end = new Date('2026-03-15T12:00:00Z');
    const range = dayRange(3, end);
    expect(range).toHaveLength(3);
    expect(range[0]).toBe('2026-03-15');
    expect(range[1]).toBe('2026-03-14');
    expect(range[2]).toBe('2026-03-13');
  });

  it('returns empty for 0 days', () => {
    expect(dayRange(0, new Date('2026-01-01'))).toEqual([]);
  });

  it('returns 1 day for count=1', () => {
    const range = dayRange(1, new Date('2026-06-30T23:59:59Z'));
    expect(range).toHaveLength(1);
    expect(range[0]).toBe('2026-06-30');
  });

  it('handles month boundary', () => {
    const end = new Date('2026-03-02T12:00:00Z');
    const range = dayRange(4, end);
    expect(range).toContain('2026-02-28');
    expect(range).toContain('2026-02-27');
  });
});

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { addUniqueKey, calcStreak, localDateKey, weekStartKey } from '../src/utils/date.js';

describe('discipline date utils', () => {
  it('localDateKey returns YYYY-MM-DD in local calendar', () => {
    const d = new Date(2024, 5, 9);
    expect(localDateKey(d)).toBe('2024-06-09');
  });

  it('localDateKey returns empty for invalid date', () => {
    expect(localDateKey(Number.NaN)).toBe('');
    expect(localDateKey('invalid')).toBe('');
  });

  it('weekStartKey returns Monday-based week start (ISO week alignment)', () => {
    const wed = new Date(2024, 5, 12);
    expect(weekStartKey(wed)).toBe('2024-06-10');
    const mon = new Date(2024, 5, 10);
    expect(weekStartKey(mon)).toBe('2024-06-10');
  });

  it('weekStartKey returns empty for invalid', () => {
    expect(weekStartKey(Number.NaN)).toBe('');
  });

  it('addUniqueKey dedupes and sorts', () => {
    expect(addUniqueKey(['b', 'a'], 'c')).toEqual(['a', 'b', 'c']);
    expect(addUniqueKey(['a'], 'a')).toEqual(['a']);
    expect(addUniqueKey([], '')).toEqual([]);
  });

  it('calcStreak walks backwards by stepDays', () => {
    expect(calcStreak(['2024-06-03', '2024-06-02', '2024-06-01'], '2024-06-03', 1)).toBe(3);
    expect(calcStreak(['2024-06-10', '2024-06-03'], '2024-06-10', 7)).toBe(2);
    expect(calcStreak([], '2024-06-03', 1)).toBe(0);
    expect(calcStreak(['2024-06-01'], '', 1)).toBe(0);
  });
});

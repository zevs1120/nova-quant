import type { NormalizedBar, Timeframe } from '../types.js';
import { timeframeToMs } from '../utils/time.js';

export function decimalToString(value: string | number): string {
  if (typeof value === 'string') {
    if (value.trim() === '') return '0';
    return value.trim();
  }
  if (!Number.isFinite(value)) return '0';
  return value.toString();
}

export function normalizeBars(rows: NormalizedBar[]): NormalizedBar[] {
  if (!rows.length) return [];

  const dedup = new Map<number, NormalizedBar>();
  for (const row of rows) {
    if (!Number.isFinite(row.ts_open)) continue;
    dedup.set(row.ts_open, {
      ts_open: row.ts_open,
      open: decimalToString(row.open),
      high: decimalToString(row.high),
      low: decimalToString(row.low),
      close: decimalToString(row.close),
      volume: decimalToString(row.volume),
    });
  }

  return [...dedup.values()].sort((a, b) => a.ts_open - b.ts_open);
}

export function detectGaps(
  tsList: number[],
  timeframe: Timeframe,
): Array<{ from: number; to: number; missingBars: number }> {
  if (tsList.length < 2) return [];

  const step = timeframeToMs(timeframe);
  const gaps: Array<{ from: number; to: number; missingBars: number }> = [];

  for (let i = 1; i < tsList.length; i += 1) {
    const prev = tsList[i - 1];
    const curr = tsList[i];
    const delta = curr - prev;
    if (delta > step) {
      const missingBars = Math.max(1, Math.round(delta / step) - 1);
      gaps.push({ from: prev + step, to: curr - step, missingBars });
    }
  }

  return gaps;
}

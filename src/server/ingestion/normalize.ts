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

function parseFiniteNumber(value: string | number): number | null {
  const next =
    typeof value === 'string'
      ? Number(
          String(value)
            .trim()
            .replace(/[$,\s]/g, ''),
        )
      : Number(value);
  return Number.isFinite(next) ? next : null;
}

export type BarQualityInspection = {
  invalidTimestamp: boolean;
  invalidPrice: boolean;
  envelopeAdjusted: boolean;
  zeroVolume: boolean;
  negativeVolume: boolean;
  sanitized: NormalizedBar | null;
};

export function inspectBarQuality(row: NormalizedBar): BarQualityInspection {
  const tsOpen = Number(row?.ts_open);
  if (!Number.isFinite(tsOpen) || tsOpen <= 0) {
    return {
      invalidTimestamp: true,
      invalidPrice: false,
      envelopeAdjusted: false,
      zeroVolume: false,
      negativeVolume: false,
      sanitized: null,
    };
  }

  const open = parseFiniteNumber(row?.open);
  const high = parseFiniteNumber(row?.high);
  const low = parseFiniteNumber(row?.low);
  const close = parseFiniteNumber(row?.close);
  const volume = parseFiniteNumber(row?.volume);

  if (
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0
  ) {
    return {
      invalidTimestamp: false,
      invalidPrice: true,
      envelopeAdjusted: false,
      zeroVolume: false,
      negativeVolume: false,
      sanitized: null,
    };
  }

  const sanitizedHigh = Math.max(open, high, low, close);
  const sanitizedLow = Math.min(open, high, low, close);
  const negativeVolume = volume !== null && volume < 0;
  const sanitizedVolume = volume === null ? 0 : Math.max(0, volume);

  return {
    invalidTimestamp: false,
    invalidPrice: false,
    envelopeAdjusted: sanitizedHigh !== high || sanitizedLow !== low,
    zeroVolume: sanitizedVolume === 0,
    negativeVolume,
    sanitized: {
      ts_open: tsOpen,
      open: decimalToString(open),
      high: decimalToString(sanitizedHigh),
      low: decimalToString(sanitizedLow),
      close: decimalToString(close),
      volume: decimalToString(sanitizedVolume),
    },
  };
}

export function sanitizeBar(row: NormalizedBar): NormalizedBar | null {
  return inspectBarQuality(row).sanitized;
}

export function normalizeBars(rows: NormalizedBar[]): NormalizedBar[] {
  if (!rows.length) return [];

  const dedup = new Map<number, NormalizedBar>();
  for (const row of rows) {
    const sanitized = sanitizeBar(row);
    if (!sanitized) continue;
    dedup.set(sanitized.ts_open, sanitized);
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

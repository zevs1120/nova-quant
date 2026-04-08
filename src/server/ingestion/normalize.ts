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

export type SequenceAnomalyType =
  | 'EXTREME_MOVE_ANOMALY'
  | 'FLAT_RUN_ANOMALY'
  | 'ZERO_VOLUME_RUN_ANOMALY';

export type BarSequenceInspection = {
  extremeMoveCount: number;
  flatRunCount: number;
  zeroVolumeRunCount: number;
  maxMovePct: number;
  anomalies: Array<{
    tsOpen: number;
    anomalyType: SequenceAnomalyType;
    detail: string;
  }>;
};

export type CorporateActionContext = {
  effectiveTs: number;
  actionType: 'SPLIT' | 'DIVIDEND' | 'HALT' | 'RESUME';
  splitRatio?: number | null;
};

function sequenceMoveThreshold(timeframe: Timeframe): number {
  if (timeframe === '1d') return 0.45;
  if (timeframe === '1h') return 0.22;
  if (timeframe === '15m') return 0.14;
  return 0.1;
}

function sequenceContextLabel(args: {
  source?: string;
  symbol?: string;
  timeframe: Timeframe;
  tsOpen: number;
  message: string;
}): string {
  const source = String(args.source || 'SERIES').trim();
  const symbol = String(args.symbol || '').trim();
  return `${source}${symbol ? ` ${symbol}` : ''} ${args.timeframe} ${args.message} at ${args.tsOpen}`.trim();
}

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

export function inspectBarSequenceQuality(args: {
  rows: NormalizedBar[];
  timeframe: Timeframe;
  source?: string;
  symbol?: string;
  corporateActions?: CorporateActionContext[];
}): BarSequenceInspection {
  const rows = [...(args.rows || [])].sort((a, b) => a.ts_open - b.ts_open);
  const anomalies: BarSequenceInspection['anomalies'] = [];
  const moveThreshold = sequenceMoveThreshold(args.timeframe);
  const step = timeframeToMs(args.timeframe);
  const corporateActions = [...(args.corporateActions || [])].sort(
    (a, b) => a.effectiveTs - b.effectiveTs,
  );
  let extremeMoveCount = 0;
  let flatRunCount = 0;
  let zeroVolumeRunCount = 0;
  let maxMovePct = 0;
  let flatStreak = 0;
  let zeroVolumeStreak = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index];
    const previous = rows[index - 1] || null;
    const open = parseFiniteNumber(current.open);
    const high = parseFiniteNumber(current.high);
    const low = parseFiniteNumber(current.low);
    const close = parseFiniteNumber(current.close);
    const volume = parseFiniteNumber(current.volume);
    if (
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null
    ) {
      flatStreak = 0;
      zeroVolumeStreak = 0;
      continue;
    }

    const isFlatBar = open === high && high === low && low === close;
    const prevClose = previous ? parseFiniteNumber(previous.close) : null;
    const prevVolume = previous ? parseFiniteNumber(previous.volume) : null;
    const sameCloseAsPrevious = prevClose !== null && prevClose === close;
    const sameVolumeAsPrevious = prevVolume !== null && prevVolume === volume;

    if (isFlatBar && sameCloseAsPrevious && sameVolumeAsPrevious) {
      flatStreak += 1;
    } else {
      flatStreak = 0;
    }
    if (flatStreak === 2) {
      flatRunCount += 1;
      anomalies.push({
        tsOpen: current.ts_open,
        anomalyType: 'FLAT_RUN_ANOMALY',
        detail: sequenceContextLabel({
          source: args.source,
          symbol: args.symbol,
          timeframe: args.timeframe,
          tsOpen: current.ts_open,
          message: 'detected repeated flat bars',
        }),
      });
    }

    if (volume === 0) {
      zeroVolumeStreak += 1;
    } else {
      zeroVolumeStreak = 0;
    }
    if (zeroVolumeStreak === 3) {
      zeroVolumeRunCount += 1;
      anomalies.push({
        tsOpen: current.ts_open,
        anomalyType: 'ZERO_VOLUME_RUN_ANOMALY',
        detail: sequenceContextLabel({
          source: args.source,
          symbol: args.symbol,
          timeframe: args.timeframe,
          tsOpen: current.ts_open,
          message: 'detected repeated zero-volume bars',
        }),
      });
    }

    if (prevClose !== null && prevClose > 0) {
      const movePct = Math.abs(close / prevClose - 1);
      maxMovePct = Math.max(maxMovePct, movePct);
      const explainedByCorporateAction = corporateActions.some((action) => {
        if (action.actionType !== 'SPLIT') return false;
        const splitRatio = Number(action.splitRatio);
        if (!Number.isFinite(splitRatio) || splitRatio <= 0) return false;
        if (action.effectiveTs < current.ts_open - step || action.effectiveTs > current.ts_open + step) {
          return false;
        }
        const observedRatio = Math.max(close, prevClose) / Math.max(1e-9, Math.min(close, prevClose));
        const expectedRatio = Math.max(splitRatio, 1 / splitRatio);
        const ratioDeviation = Math.abs(observedRatio / expectedRatio - 1);
        return ratioDeviation <= 0.25;
      });
      if (movePct > moveThreshold && !explainedByCorporateAction) {
        extremeMoveCount += 1;
        anomalies.push({
          tsOpen: current.ts_open,
          anomalyType: 'EXTREME_MOVE_ANOMALY',
          detail: sequenceContextLabel({
            source: args.source,
            symbol: args.symbol,
            timeframe: args.timeframe,
            tsOpen: current.ts_open,
            message: `detected extreme move ${Math.round(movePct * 10000) / 100}%`,
          }),
        });
      }
    }
  }

  return {
    extremeMoveCount,
    flatRunCount,
    zeroVolumeRunCount,
    maxMovePct,
    anomalies,
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

function toUtcDayStart(ts: number): number {
  const date = new Date(ts);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function toUtcDayKey(ts: number): string {
  return new Date(toUtcDayStart(ts)).toISOString().slice(0, 10);
}

function countWeekdaysBetween(startTs: number, endTs: number): number {
  let count = 0;
  let cursor = toUtcDayStart(startTs);
  const end = toUtcDayStart(endTs);
  while (cursor < end) {
    cursor += 86_400_000;
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export function detectGaps(
  tsList: number[],
  timeframe: Timeframe,
  options?: { market?: string | null; closedDayKeys?: string[] },
): Array<{ from: number; to: number; missingBars: number }> {
  if (tsList.length < 2) return [];

  const step = timeframeToMs(timeframe);
  const gaps: Array<{ from: number; to: number; missingBars: number }> = [];
  const market = String(options?.market || '').trim().toUpperCase();
  const closedDayKeys = new Set((options?.closedDayKeys || []).map((value) => String(value || '')));

  for (let i = 1; i < tsList.length; i += 1) {
    const prev = tsList[i - 1];
    const curr = tsList[i];
    let missingBars = 0;

    if (timeframe === '1d' && market === 'US') {
      missingBars = Math.max(
        0,
        countWeekdaysBetween(prev, curr) -
          [...closedDayKeys].filter((dayKey) => {
            const ts = Date.parse(`${dayKey}T00:00:00.000Z`);
            return Number.isFinite(ts) && ts > toUtcDayStart(prev) && ts <= toUtcDayStart(curr);
          }).length -
          1,
      );
    } else {
      const delta = curr - prev;
      if (delta > step) {
        missingBars = Math.max(1, Math.round(delta / step) - 1);
      }
    }

    if (missingBars > 0) {
      gaps.push({ from: prev + step, to: curr - step, missingBars });
    }
  }

  return gaps;
}

import type { Timeframe } from '../types.js';

const TF_TO_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000
};

export function timeframeToMs(tf: Timeframe): number {
  const ms = TF_TO_MS[tf];
  if (!ms) throw new Error(`Unsupported timeframe: ${tf}`);
  return ms;
}

export function toMsUtc(input: string | number | Date): number {
  if (typeof input === 'number') return input;
  if (input instanceof Date) return input.getTime();
  const n = Number(input);
  if (Number.isFinite(n)) return n;
  const dt = new Date(input);
  const ms = dt.getTime();
  if (!Number.isFinite(ms)) throw new Error(`Invalid timestamp: ${input}`);
  return ms;
}

export function isoToMs(input?: string): number | undefined {
  if (!input) return undefined;
  const numeric = Number(input);
  if (Number.isFinite(numeric)) return numeric;
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return undefined;
  return ms;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function floorToTimeframe(tsMs: number, tf: Timeframe): number {
  const step = timeframeToMs(tf);
  return Math.floor(tsMs / step) * step;
}

export function monthRange(startIso: string, end: Date): string[] {
  const out: string[] = [];
  const start = new Date(startIso);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (cursor <= stop) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    out.push(`${y}-${m}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return out;
}

export function dayRange(days: number, end = new Date()): string[] {
  const out: string[] = [];
  const cursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  for (let i = 0; i < days; i += 1) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cursor.getUTCDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out;
}

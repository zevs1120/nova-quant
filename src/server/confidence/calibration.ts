import type { Market, SignalContract, SignalDirection } from '../types.js';
import type { MarketRepository } from '../db/repository.js';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

type CalibrationExample = {
  market: Market;
  direction: SignalDirection;
  regime: string;
  rawConfidence: number;
  pnlPct: number;
  realizedWin: number;
};

type BucketStats = {
  key: string;
  sampleSize: number;
  avgConfidence: number;
  winRate: number;
  avgPnlPct: number;
  avgLossPct: number;
  brier: number;
};

type CalibrationSummary = {
  sample_size: number;
  ece: number;
  brier: number;
};

export type ConfidenceCalibration = {
  raw_confidence: number;
  calibrated_confidence: number;
  direction_confidence: number;
  return_confidence: number;
  execution_confidence: number;
  risk_confidence: number;
  calibration_bucket: string;
  calibration_sample_size: number;
  bucket_win_rate: number;
  bucket_avg_pnl_pct: number;
  bucket_avg_loss_pct: number;
  brier_score: number;
  ece: number;
  sizing_multiplier: number;
  sizing_band: 'tiny' | 'light' | 'base' | 'press';
};

export type ConfidenceCalibrator = {
  summary: CalibrationSummary;
  calibrateSignal: (signal: SignalContract & Record<string, unknown>) => ConfidenceCalibration;
};

function confidenceBucket(value: number): number {
  return Math.max(0, Math.min(4, Math.floor(clamp(value, 0, 0.999) * 5)));
}

function buildBucketKey(args: { market: Market | 'ALL'; direction: SignalDirection | 'ALL'; regime: string | 'ALL'; bucket: number | 'ALL' }) {
  return [args.market, args.direction, args.regime, args.bucket].join('|');
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildExamples(repo: MarketRepository, userId: string): CalibrationExample[] {
  const executions = repo
    .listExecutions({ userId, limit: 2000 })
    .filter((row) => Number.isFinite(row.pnl_pct) && (row.action === 'DONE' || row.action === 'CLOSE'));

  return executions
    .map((row) => {
      const signal = repo.getSignal(row.signal_id);
      if (!signal) return null;
      return {
        market: signal.market,
        direction: signal.direction,
        regime: String(signal.regime_id || 'UNKNOWN').toUpperCase(),
        rawConfidence: clamp(Number(signal.confidence || 0.5), 0.01, 0.99),
        pnlPct: Number(row.pnl_pct || 0),
        realizedWin: Number(row.pnl_pct || 0) > 0 ? 1 : 0
      } satisfies CalibrationExample;
    })
    .filter((row): row is CalibrationExample => Boolean(row));
}

function summarizeBucket(key: string, rows: CalibrationExample[]): BucketStats {
  const confidences = rows.map((row) => row.rawConfidence);
  const wins = rows.map((row) => row.realizedWin);
  const pnl = rows.map((row) => row.pnlPct);
  const losses = pnl.filter((value) => value < 0).map((value) => Math.abs(value));
  const avgConfidence = mean(confidences);
  const winRate = mean(wins);
  const avgPnlPct = mean(pnl);
  const avgLossPct = mean(losses);
  const brier = mean(confidences.map((value, index) => (value - wins[index]) ** 2));
  return {
    key,
    sampleSize: rows.length,
    avgConfidence: round(avgConfidence, 4),
    winRate: round(winRate, 4),
    avgPnlPct: round(avgPnlPct, 4),
    avgLossPct: round(avgLossPct, 4),
    brier: round(brier, 4)
  };
}

function buildBucketStats(examples: CalibrationExample[]) {
  const buckets = new Map<string, CalibrationExample[]>();
  for (const row of examples) {
    const bucket = confidenceBucket(row.rawConfidence);
    const keys = [
      buildBucketKey({ market: row.market, direction: row.direction, regime: row.regime, bucket }),
      buildBucketKey({ market: row.market, direction: row.direction, regime: 'ALL', bucket }),
      buildBucketKey({ market: 'ALL', direction: row.direction, regime: 'ALL', bucket }),
      buildBucketKey({ market: 'ALL', direction: 'ALL', regime: 'ALL', bucket })
    ];
    for (const key of keys) {
      const existing = buckets.get(key) || [];
      existing.push(row);
      buckets.set(key, existing);
    }
  }

  const stats = new Map<string, BucketStats>();
  for (const [key, rows] of buckets.entries()) {
    stats.set(key, summarizeBucket(key, rows));
  }
  return stats;
}

function buildSummary(examples: CalibrationExample[]): CalibrationSummary {
  if (!examples.length) {
    return { sample_size: 0, ece: 0, brier: 0 };
  }
  const brier = mean(examples.map((row) => (row.rawConfidence - row.realizedWin) ** 2));
  const grouped = new Map<number, CalibrationExample[]>();
  for (const row of examples) {
    const bucket = confidenceBucket(row.rawConfidence);
    const existing = grouped.get(bucket) || [];
    existing.push(row);
    grouped.set(bucket, existing);
  }
  let weightedError = 0;
  for (const rows of grouped.values()) {
    weightedError += Math.abs(mean(rows.map((row) => row.rawConfidence)) - mean(rows.map((row) => row.realizedWin))) * (rows.length / examples.length);
  }
  return {
    sample_size: examples.length,
    ece: round(weightedError, 4),
    brier: round(brier, 4)
  };
}

function sizingBandForConfidence(value: number): { band: ConfidenceCalibration['sizing_band']; multiplier: number } {
  if (value >= 0.74) return { band: 'press', multiplier: 1 };
  if (value >= 0.66) return { band: 'base', multiplier: 0.84 };
  if (value >= 0.58) return { band: 'light', multiplier: 0.64 };
  return { band: 'tiny', multiplier: 0.42 };
}

export function createConfidenceCalibrator(args: { repo: MarketRepository; userId: string }): ConfidenceCalibrator {
  const examples = buildExamples(args.repo, args.userId);
  const stats = buildBucketStats(examples);
  const summary = buildSummary(examples);

  return {
    summary,
    calibrateSignal(signal) {
      const rawConfidence = clamp(Number(signal.confidence || 0.5), 0.01, 0.99);
      const bucket = confidenceBucket(rawConfidence);
      const regime = String(signal.regime_id || 'UNKNOWN').toUpperCase();
      const keys = [
        buildBucketKey({ market: signal.market, direction: signal.direction, regime, bucket }),
        buildBucketKey({ market: signal.market, direction: signal.direction, regime: 'ALL', bucket }),
        buildBucketKey({ market: 'ALL', direction: signal.direction, regime: 'ALL', bucket }),
        buildBucketKey({ market: 'ALL', direction: 'ALL', regime: 'ALL', bucket })
      ];
      const bucketStats = keys.map((key) => stats.get(key)).find((row) => row && row.sampleSize >= 6) || {
        key: keys[keys.length - 1],
        sampleSize: 0,
        avgConfidence: rawConfidence,
        winRate: 0.5,
        avgPnlPct: 0,
        avgLossPct: 0,
        brier: summary.brier
      };

      const posteriorWinRate = (bucketStats.winRate * bucketStats.sampleSize + 6) / (bucketStats.sampleSize + 12);
      const returnConfidence = clamp(0.5 + bucketStats.avgPnlPct / 8, 0.2, 0.85);
      const executionConfidence = clamp(bucketStats.sampleSize / 24, 0.25, 1);
      const riskConfidence = clamp(1 - bucketStats.avgLossPct / 12, 0.25, 0.95);
      const shrunk = 0.5 + ((rawConfidence - 0.5) * 0.5 + (posteriorWinRate - 0.5) * 0.5) * (0.55 + executionConfidence * 0.45);
      const calibratedConfidence = clamp(
        shrunk * 0.65 + returnConfidence * 0.15 + riskConfidence * 0.2,
        0.18,
        0.94
      );
      const sizingBase = sizingBandForConfidence(calibratedConfidence);
      const sizingMultiplier = round(clamp(sizingBase.multiplier * (0.8 + riskConfidence * 0.3), 0.25, 1.05), 4);

      return {
        raw_confidence: round(rawConfidence, 4),
        calibrated_confidence: round(calibratedConfidence, 4),
        direction_confidence: round(posteriorWinRate, 4),
        return_confidence: round(returnConfidence, 4),
        execution_confidence: round(executionConfidence, 4),
        risk_confidence: round(riskConfidence, 4),
        calibration_bucket: bucketStats.key,
        calibration_sample_size: bucketStats.sampleSize,
        bucket_win_rate: bucketStats.winRate,
        bucket_avg_pnl_pct: bucketStats.avgPnlPct,
        bucket_avg_loss_pct: bucketStats.avgLossPct,
        brier_score: bucketStats.brier,
        ece: summary.ece,
        sizing_multiplier: sizingMultiplier,
        sizing_band: sizingBase.band
      };
    }
  };
}

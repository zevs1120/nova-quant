import { MarketRepository } from '../db/repository.js';
import type { NormalizedBar, Timeframe } from '../types.js';
import { inspectBarQuality, inspectBarSequenceQuality } from './normalize.js';

export type ProviderGateSummary = {
  rawCount: number;
  insertedCount: number;
  droppedCount: number;
  invalidTimestampCount: number;
  invalidPriceCount: number;
  envelopeAdjustedCount: number;
  zeroVolumeCount: number;
  negativeVolumeCount: number;
  extremeMoveCount: number;
  flatRunCount: number;
  zeroVolumeRunCount: number;
  sourceConflictCount: number;
  adjustmentDriftCount: number;
  priorityRetainedCount: number;
  priorityOverrideCount: number;
  anomalyCount: number;
};

type PreparedProviderBars = {
  bars: NormalizedBar[];
  anomalies: Array<{ tsOpen: number | null; anomalyType: string; detail: string }>;
  summary: ProviderGateSummary;
};

function buildAnomalyDetail(args: {
  source: string;
  symbol?: string;
  timeframe: Timeframe;
  tsOpen: number | null;
  message: string;
}): string {
  const symbolLabel = args.symbol ? `${args.symbol} ` : '';
  const tsLabel = args.tsOpen === null ? 'unknown-ts' : String(args.tsOpen);
  return `${args.source} ${symbolLabel}${args.timeframe} ${args.message} at ${tsLabel}`.trim();
}

function sourcePriority(source: string): number {
  const normalized = String(source || '')
    .trim()
    .toUpperCase();
  if (!normalized) return 50;
  if (normalized.includes('BINANCE_REPAIR')) return 100;
  if (normalized.includes('MASSIVE')) return 95;
  if (normalized.includes('NASDAQ')) return 90;
  if (normalized.includes('YAHOO_REPAIR')) return 85;
  if (normalized.includes('YAHOO')) return 75;
  if (normalized.includes('ALPHA_VANTAGE_REPAIR')) return 72;
  if (normalized.includes('ALPHA_VANTAGE')) return 65;
  if (normalized.includes('STOOQ')) return 60;
  if (normalized.includes('BINANCE')) return 80;
  return 50;
}

function parseBarNumber(value: string): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function computeConflictPct(existing: NormalizedBar, incoming: NormalizedBar): number {
  const existingNumbers = [
    parseBarNumber(existing.open),
    parseBarNumber(existing.high),
    parseBarNumber(existing.low),
    parseBarNumber(existing.close),
  ];
  const incomingNumbers = [
    parseBarNumber(incoming.open),
    parseBarNumber(incoming.high),
    parseBarNumber(incoming.low),
    parseBarNumber(incoming.close),
  ];
  return existingNumbers.reduce((maxDiff, existingValue, index) => {
    const incomingValue = incomingNumbers[index];
    const denominator = Math.max(Math.abs(existingValue), Math.abs(incomingValue), 1);
    return Math.max(maxDiff, Math.abs(existingValue - incomingValue) / denominator);
  }, 0);
}

function detectAdjustmentDrift(args: {
  existingRows: Array<{
    ts_open: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    source: string;
  }>;
  incomingRows: NormalizedBar[];
}): {
  detected: boolean;
  overlapCount: number;
  medianRatio: number | null;
  maxDeviationPct: number;
} {
  const incomingByTs = new Map(args.incomingRows.map((row) => [row.ts_open, row] as const));
  const ratios = args.existingRows
    .map((existing) => {
      const incoming = incomingByTs.get(existing.ts_open);
      if (!incoming) return null;
      const existingClose = parseBarNumber(existing.close);
      const incomingClose = parseBarNumber(incoming.close);
      if (existingClose <= 0 || incomingClose <= 0) return null;
      return existingClose / incomingClose;
    })
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (ratios.length < 3) {
    return { detected: false, overlapCount: ratios.length, medianRatio: null, maxDeviationPct: 0 };
  }

  const medianRatio = ratios[Math.floor(ratios.length / 2)] || null;
  if (!medianRatio) {
    return { detected: false, overlapCount: ratios.length, medianRatio: null, maxDeviationPct: 0 };
  }

  const normalizedRatio = Math.max(medianRatio, 1 / medianRatio);
  const maxDeviationPct = ratios.reduce((max, ratio) => {
    return Math.max(max, Math.abs(ratio / medianRatio - 1));
  }, 0);
  const detected = normalizedRatio >= 1.25 && maxDeviationPct <= 0.08;
  return {
    detected,
    overlapCount: ratios.length,
    medianRatio,
    maxDeviationPct,
  };
}

function deriveQualityState(summary: ProviderGateSummary): {
  status: 'TRUSTED' | 'SUSPECT' | 'QUARANTINED';
  reason: string | null;
} {
  const droppedRatio = summary.rawCount > 0 ? summary.droppedCount / summary.rawCount : 0;
  const conflictRatio = summary.rawCount > 0 ? summary.sourceConflictCount / summary.rawCount : 0;

  if (summary.insertedCount === 0 && summary.priorityRetainedCount === 0) {
    return { status: 'QUARANTINED', reason: 'NO_ACCEPTED_PROVIDER_BARS' };
  }
  if (droppedRatio > 0.2) {
    return { status: 'QUARANTINED', reason: 'INVALID_PROVIDER_BAR_RATIO' };
  }
  if (
    summary.flatRunCount > 0 ||
    summary.zeroVolumeRunCount > 0 ||
    summary.extremeMoveCount > 0 ||
    summary.envelopeAdjustedCount > 0 ||
    summary.adjustmentDriftCount > 0 ||
    conflictRatio > 0.1
  ) {
    return {
      status: 'SUSPECT',
      reason:
        summary.adjustmentDriftCount > 0
          ? 'PROVIDER_ADJUSTMENT_DRIFT'
          : summary.sourceConflictCount > 0
            ? 'PROVIDER_SOURCE_CONFLICT'
            : summary.flatRunCount > 0
              ? 'SEQUENCE_FLAT_RUN'
              : summary.zeroVolumeRunCount > 0
                ? 'SEQUENCE_ZERO_VOLUME_RUN'
                : summary.extremeMoveCount > 0
                  ? 'SEQUENCE_EXTREME_MOVE'
                  : 'ENVELOPE_OR_VOLUME_ANOMALY',
    };
  }
  return { status: 'TRUSTED', reason: null };
}

export function prepareProviderBars(args: {
  rows: NormalizedBar[];
  source: string;
  timeframe: Timeframe;
  symbol?: string;
  corporateActions?: Array<{
    effectiveTs: number;
    actionType: 'SPLIT' | 'DIVIDEND' | 'HALT' | 'RESUME';
    splitRatio?: number | null;
  }>;
}): PreparedProviderBars {
  const deduped = new Map<number, NormalizedBar>();
  const anomalies: PreparedProviderBars['anomalies'] = [];
  let invalidTimestampCount = 0;
  let invalidPriceCount = 0;
  let envelopeAdjustedCount = 0;
  let zeroVolumeCount = 0;
  let negativeVolumeCount = 0;

  for (const row of args.rows) {
    const quality = inspectBarQuality(row);
    const tsOpen = Number.isFinite(Number(row?.ts_open)) ? Number(row.ts_open) : null;

    if (quality.invalidTimestamp) {
      invalidTimestampCount += 1;
      anomalies.push({
        tsOpen,
        anomalyType: 'TIMESTAMP_ANOMALY',
        detail: buildAnomalyDetail({
          source: args.source,
          symbol: args.symbol,
          timeframe: args.timeframe,
          tsOpen,
          message: 'dropped invalid timestamp bar',
        }),
      });
      continue;
    }

    if (quality.invalidPrice || !quality.sanitized) {
      invalidPriceCount += 1;
      anomalies.push({
        tsOpen,
        anomalyType: 'PRICE_ANOMALY',
        detail: buildAnomalyDetail({
          source: args.source,
          symbol: args.symbol,
          timeframe: args.timeframe,
          tsOpen,
          message: 'dropped invalid price bar before storage',
        }),
      });
      continue;
    }

    if (quality.envelopeAdjusted) {
      envelopeAdjustedCount += 1;
      anomalies.push({
        tsOpen: quality.sanitized.ts_open,
        anomalyType: 'OHLC_ENVELOPE_ANOMALY',
        detail: buildAnomalyDetail({
          source: args.source,
          symbol: args.symbol,
          timeframe: args.timeframe,
          tsOpen: quality.sanitized.ts_open,
          message: 'adjusted OHLC envelope before storage',
        }),
      });
    }

    if (quality.zeroVolume) {
      zeroVolumeCount += 1;
      if (quality.negativeVolume) negativeVolumeCount += 1;
      anomalies.push({
        tsOpen: quality.sanitized.ts_open,
        anomalyType: 'ZERO_VOLUME_ANOMALY',
        detail: buildAnomalyDetail({
          source: args.source,
          symbol: args.symbol,
          timeframe: args.timeframe,
          tsOpen: quality.sanitized.ts_open,
          message: quality.negativeVolume
            ? 'clamped negative volume to zero before storage'
            : 'stored zero-volume bar',
        }),
      });
    }

    deduped.set(quality.sanitized.ts_open, quality.sanitized);
  }

  const bars = [...deduped.values()].sort((a, b) => a.ts_open - b.ts_open);
  const sequence = inspectBarSequenceQuality({
    rows: bars,
    timeframe: args.timeframe,
    source: args.source,
    symbol: args.symbol,
    corporateActions: args.corporateActions,
  });
  anomalies.push(...sequence.anomalies);
  return {
    bars,
    anomalies,
    summary: {
      rawCount: args.rows.length,
      insertedCount: bars.length,
      droppedCount: invalidTimestampCount + invalidPriceCount,
      invalidTimestampCount,
      invalidPriceCount,
      envelopeAdjustedCount,
      zeroVolumeCount,
      negativeVolumeCount,
      extremeMoveCount: sequence.extremeMoveCount,
      flatRunCount: sequence.flatRunCount,
      zeroVolumeRunCount: sequence.zeroVolumeRunCount,
      sourceConflictCount: 0,
      adjustmentDriftCount: 0,
      priorityRetainedCount: 0,
      priorityOverrideCount: 0,
      anomalyCount: anomalies.length,
    },
  };
}

export function ingestProviderBars(args: {
  repo: MarketRepository;
  assetId: number;
  timeframe: Timeframe;
  rows: NormalizedBar[];
  source: string;
  symbol?: string;
}): ProviderGateSummary {
  const tsOpenList = args.rows
    .map((row) => Number(row.ts_open))
    .filter((value) => Number.isFinite(value));
  const prepared = prepareProviderBars({
    ...args,
    corporateActions: tsOpenList.length
      ? args.repo
          .listCorporateActions({
            assetId: args.assetId,
            startTs: Math.min(...tsOpenList) - 2 * 86_400_000,
            endTs: Math.max(...tsOpenList) + 2 * 86_400_000,
          })
          .map((action) => ({
            effectiveTs: action.effective_ts,
            actionType: action.action_type,
            splitRatio: action.split_ratio,
          }))
      : [],
  });
  const existingRows = args.repo.getOhlcvByTsOpen(
    args.assetId,
    args.timeframe,
    prepared.bars.map((row) => row.ts_open),
  );
  const existingByTs = new Map(existingRows.map((row) => [row.ts_open, row] as const));
  const acceptedBars: NormalizedBar[] = [];
  let sourceConflictCount = 0;
  let adjustmentDriftCount = 0;
  let priorityRetainedCount = 0;
  let priorityOverrideCount = 0;
  const adjustmentDrift = detectAdjustmentDrift({
    existingRows,
    incomingRows: prepared.bars,
  });
  if (adjustmentDrift.detected) {
    adjustmentDriftCount = 1;
    prepared.anomalies.push({
      tsOpen: prepared.bars[0]?.ts_open ?? null,
      anomalyType: 'ADJUSTMENT_DRIFT_ANOMALY',
      detail: buildAnomalyDetail({
        source: args.source,
        symbol: args.symbol,
        timeframe: args.timeframe,
        tsOpen: prepared.bars[0]?.ts_open ?? null,
        message: `shows likely adjusted-vs-unadjusted drift vs existing source around ratio ${Math.round((adjustmentDrift.medianRatio || 0) * 1000) / 1000}`,
      }),
    });
  }
  for (const row of prepared.bars) {
    const existing = existingByTs.get(row.ts_open);
    if (!existing || String(existing.source || '') === String(args.source || '')) {
      acceptedBars.push(row);
      continue;
    }
    if (adjustmentDrift.detected) {
      priorityRetainedCount += 1;
      continue;
    }
    const existingPriority = sourcePriority(existing.source);
    const incomingPriority = sourcePriority(args.source);
    const conflictPct = computeConflictPct(existing, row);
    if (conflictPct > 0.03) {
      sourceConflictCount += 1;
      prepared.anomalies.push({
        tsOpen: row.ts_open,
        anomalyType: 'SOURCE_CONFLICT_ANOMALY',
        detail: buildAnomalyDetail({
          source: args.source,
          symbol: args.symbol,
          timeframe: args.timeframe,
          tsOpen: row.ts_open,
          message: `conflicted with ${existing.source} by ${Math.round(conflictPct * 10000) / 100}%`,
        }),
      });
    }
    if (incomingPriority > existingPriority) {
      priorityOverrideCount += 1;
      acceptedBars.push(row);
      continue;
    }
    priorityRetainedCount += 1;
  }

  for (const anomaly of prepared.anomalies) {
    args.repo.logAnomaly({
      assetId: args.assetId,
      timeframe: args.timeframe,
      tsOpen: anomaly.tsOpen,
      anomalyType: anomaly.anomalyType,
      detail: anomaly.detail,
    });
  }
  if (acceptedBars.length > 0) {
    args.repo.upsertOhlcvBars(args.assetId, args.timeframe, acceptedBars, args.source);
  }
  const summary: ProviderGateSummary = {
    ...prepared.summary,
    insertedCount: acceptedBars.length,
    sourceConflictCount,
    adjustmentDriftCount,
    priorityRetainedCount,
    priorityOverrideCount,
    anomalyCount: prepared.anomalies.length,
  };
  const qualityState = deriveQualityState(summary);
  args.repo.upsertOhlcvQualityState({
    assetId: args.assetId,
    timeframe: args.timeframe,
    status: qualityState.status,
    reason: qualityState.reason,
    metricsJson: JSON.stringify({
      source: args.source,
      summary,
      adjustment_drift: adjustmentDrift.detected
        ? {
            overlap_count: adjustmentDrift.overlapCount,
            median_ratio: adjustmentDrift.medianRatio,
            max_deviation_pct: adjustmentDrift.maxDeviationPct,
            incoming_source: args.source,
            existing_sources: [...new Set(existingRows.map((row) => row.source))],
          }
        : null,
    }),
  });
  return summary;
}

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

export function prepareProviderBars(args: {
  rows: NormalizedBar[];
  source: string;
  timeframe: Timeframe;
  symbol?: string;
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
  const prepared = prepareProviderBars(args);
  for (const anomaly of prepared.anomalies) {
    args.repo.logAnomaly({
      assetId: args.assetId,
      timeframe: args.timeframe,
      tsOpen: anomaly.tsOpen,
      anomalyType: anomaly.anomalyType,
      detail: anomaly.detail,
    });
  }
  if (prepared.bars.length > 0) {
    args.repo.upsertOhlcvBars(args.assetId, args.timeframe, prepared.bars, args.source);
  }
  return prepared.summary;
}

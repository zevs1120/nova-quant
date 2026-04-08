import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { ingestProviderBars, prepareProviderBars } from '../src/server/ingestion/providerGate.js';

describe('provider gate', () => {
  it('drops invalid provider bars before storage and records anomalies immediately', () => {
    const prepared = prepareProviderBars({
      source: 'TEST_PROVIDER',
      timeframe: '1d',
      symbol: 'AAPL',
      rows: [
        {
          ts_open: 1_700_000_000_000,
          open: '100',
          high: '90',
          low: '105',
          close: '102',
          volume: '-15',
        },
        {
          ts_open: 1_700_086_400_000,
          open: '0',
          high: '101',
          low: '99',
          close: '100',
          volume: '10',
        },
        {
          ts_open: Number.NaN,
          open: '100',
          high: '101',
          low: '99',
          close: '100',
          volume: '10',
        },
      ],
    });

    expect(prepared.summary.insertedCount).toBe(1);
    expect(prepared.summary.droppedCount).toBe(2);
    expect(prepared.summary.invalidPriceCount).toBe(1);
    expect(prepared.summary.invalidTimestampCount).toBe(1);
    expect(prepared.summary.envelopeAdjustedCount).toBe(1);
    expect(prepared.summary.zeroVolumeCount).toBe(1);
    expect(prepared.summary.negativeVolumeCount).toBe(1);
    expect(prepared.bars[0]).toMatchObject({
      high: '105',
      low: '90',
      volume: '0',
    });
    expect(prepared.anomalies.map((row) => row.anomalyType)).toContain('TIMESTAMP_ANOMALY');
    expect(prepared.anomalies.map((row) => row.anomalyType)).toContain('PRICE_ANOMALY');
    expect(prepared.anomalies.map((row) => row.anomalyType)).toContain('OHLC_ENVELOPE_ANOMALY');
    expect(prepared.anomalies.map((row) => row.anomalyType)).toContain('ZERO_VOLUME_ANOMALY');
  });

  it('ingests only sanitized bars and logs provider anomalies into ingest_anomalies', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const asset = repo.upsertAsset({
      symbol: 'AAPL',
      market: 'US',
      venue: 'TEST_PROVIDER',
    });

    const summary = ingestProviderBars({
      repo,
      assetId: asset.asset_id,
      timeframe: '1d',
      source: 'TEST_PROVIDER',
      symbol: 'AAPL',
      rows: [
        {
          ts_open: 1_700_000_000_000,
          open: '100',
          high: '90',
          low: '105',
          close: '102',
          volume: '-15',
        },
        {
          ts_open: 1_700_086_400_000,
          open: '0',
          high: '101',
          low: '99',
          close: '100',
          volume: '10',
        },
      ],
    });

    expect(summary.insertedCount).toBe(1);
    expect(summary.anomalyCount).toBe(3);

    const bars = repo.getOhlcv({
      assetId: asset.asset_id,
      timeframe: '1d',
    });
    const anomalies = db
      .prepare(
        'SELECT anomaly_type, detail FROM ingest_anomalies WHERE asset_id = ? ORDER BY created_at ASC',
      )
      .all(asset.asset_id) as Array<{ anomaly_type: string; detail: string }>;

    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({
      high: '105',
      low: '90',
      volume: '0',
    });
    expect(anomalies.map((row) => row.anomaly_type)).toEqual(
      expect.arrayContaining(['OHLC_ENVELOPE_ANOMALY', 'ZERO_VOLUME_ANOMALY', 'PRICE_ANOMALY']),
    );
    expect(anomalies.some((row) => row.detail.includes('before storage'))).toBe(true);
  });

  it('records sequence-level anomalies for repeated flat runs, zero-volume runs, and extreme moves', () => {
    const prepared = prepareProviderBars({
      source: 'TEST_PROVIDER',
      timeframe: '1d',
      symbol: 'MSFT',
      rows: [
        {
          ts_open: 1_700_000_000_000,
          open: '100',
          high: '100',
          low: '100',
          close: '100',
          volume: '0',
        },
        {
          ts_open: 1_700_086_400_000,
          open: '100',
          high: '100',
          low: '100',
          close: '100',
          volume: '0',
        },
        {
          ts_open: 1_700_172_800_000,
          open: '100',
          high: '100',
          low: '100',
          close: '100',
          volume: '0',
        },
        {
          ts_open: 1_700_259_200_000,
          open: '190',
          high: '190',
          low: '190',
          close: '190',
          volume: '0',
        },
      ],
    });

    expect(prepared.summary.insertedCount).toBe(4);
    expect(prepared.summary.flatRunCount).toBe(1);
    expect(prepared.summary.zeroVolumeRunCount).toBe(1);
    expect(prepared.summary.extremeMoveCount).toBe(1);
    expect(prepared.anomalies.map((row) => row.anomalyType)).toContain('FLAT_RUN_ANOMALY');
    expect(prepared.anomalies.map((row) => row.anomalyType)).toContain(
      'ZERO_VOLUME_RUN_ANOMALY',
    );
    expect(prepared.anomalies.map((row) => row.anomalyType)).toContain('EXTREME_MOVE_ANOMALY');
  });

  it('does not flag split-driven price jumps as extreme move anomalies', () => {
    const prepared = prepareProviderBars({
      source: 'TEST_PROVIDER',
      timeframe: '1d',
      symbol: 'NVDA',
      corporateActions: [
        {
          effectiveTs: 1_700_086_400_000,
          actionType: 'SPLIT',
          splitRatio: 10,
        },
      ],
      rows: [
        {
          ts_open: 1_700_000_000_000,
          open: '1000',
          high: '1010',
          low: '995',
          close: '1000',
          volume: '1000',
        },
        {
          ts_open: 1_700_086_400_000,
          open: '101',
          high: '102',
          low: '99',
          close: '100',
          volume: '1200',
        },
      ],
    });

    expect(prepared.summary.extremeMoveCount).toBe(0);
    expect(prepared.anomalies.map((row) => row.anomalyType)).not.toContain(
      'EXTREME_MOVE_ANOMALY',
    );
  });

  it('keeps the higher-priority provider bar when the same timestamp conflicts materially', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const asset = repo.upsertAsset({
      symbol: 'AAPL',
      market: 'US',
      venue: 'MASSIVE',
    });

    ingestProviderBars({
      repo,
      assetId: asset.asset_id,
      timeframe: '1d',
      source: 'MASSIVE_REST',
      symbol: 'AAPL',
      rows: [
        {
          ts_open: 1_700_000_000_000,
          open: '100',
          high: '101',
          low: '99',
          close: '100.5',
          volume: '1000',
        },
      ],
    });

    const summary = ingestProviderBars({
      repo,
      assetId: asset.asset_id,
      timeframe: '1d',
      source: 'STOOQ_BULK',
      symbol: 'AAPL',
      rows: [
        {
          ts_open: 1_700_000_000_000,
          open: '92',
          high: '93',
          low: '90',
          close: '91',
          volume: '800',
        },
      ],
    });

    const stored = repo.getOhlcv({
      assetId: asset.asset_id,
      timeframe: '1d',
    });
    const state = repo.getOhlcvQualityState({
      assetId: asset.asset_id,
      timeframe: '1d',
    });

    expect(summary.insertedCount).toBe(0);
    expect(summary.sourceConflictCount).toBe(1);
    expect(summary.priorityRetainedCount).toBe(1);
    expect(stored[0]?.source).toBe('MASSIVE_REST');
    expect(stored[0]?.close).toBe('100.5');
    expect(state?.status).toBe('SUSPECT');
    expect(state?.reason).toBe('PROVIDER_SOURCE_CONFLICT');
  });

  it('flags likely adjusted-vs-unadjusted provider drift across overlapping history', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const asset = repo.upsertAsset({
      symbol: 'TSLA',
      market: 'US',
      venue: 'STOOQ',
    });

    ingestProviderBars({
      repo,
      assetId: asset.asset_id,
      timeframe: '1d',
      source: 'MASSIVE_REST',
      symbol: 'TSLA',
      rows: [
        {
          ts_open: 1_700_000_000_000,
          open: '100',
          high: '101',
          low: '99',
          close: '100',
          volume: '1000',
        },
        {
          ts_open: 1_700_086_400_000,
          open: '102',
          high: '103',
          low: '101',
          close: '102',
          volume: '1000',
        },
        {
          ts_open: 1_700_172_800_000,
          open: '104',
          high: '105',
          low: '103',
          close: '104',
          volume: '1000',
        },
      ],
    });

    const summary = ingestProviderBars({
      repo,
      assetId: asset.asset_id,
      timeframe: '1d',
      source: 'YAHOO_CHART',
      symbol: 'TSLA',
      rows: [
        {
          ts_open: 1_700_000_000_000,
          open: '50',
          high: '50.5',
          low: '49.5',
          close: '50',
          volume: '1000',
        },
        {
          ts_open: 1_700_086_400_000,
          open: '51',
          high: '51.5',
          low: '50.5',
          close: '51',
          volume: '1000',
        },
        {
          ts_open: 1_700_172_800_000,
          open: '52',
          high: '52.5',
          low: '51.5',
          close: '52',
          volume: '1000',
        },
      ],
    });

    const state = repo.getOhlcvQualityState({
      assetId: asset.asset_id,
      timeframe: '1d',
    });
    const anomalies = db
      .prepare(
        'SELECT anomaly_type FROM ingest_anomalies WHERE asset_id = ? ORDER BY created_at ASC',
      )
      .all(asset.asset_id) as Array<{ anomaly_type: string }>;

    expect(summary.adjustmentDriftCount).toBe(1);
    expect(summary.insertedCount).toBe(0);
    expect(state?.status).toBe('SUSPECT');
    expect(state?.reason).toBe('PROVIDER_ADJUSTMENT_DRIFT');
    expect(anomalies.map((row) => row.anomaly_type)).toContain('ADJUSTMENT_DRIFT_ANOMALY');
  });
});

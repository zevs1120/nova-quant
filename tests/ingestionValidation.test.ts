import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { validateAndRepair } from '../src/server/ingestion/validation.js';

describe('ingestion validation anomalies', () => {
  it('records price, envelope, and zero-volume anomalies from stored bars', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const asset = repo.upsertAsset({
      symbol: 'AAPL',
      market: 'US',
      venue: 'STOOQ',
    });
    const now = Date.now();

    repo.upsertOhlcvBars(
      asset.asset_id,
      '1d',
      [
        {
          ts_open: now - 3 * 86_400_000,
          open: '100',
          high: '101',
          low: '99',
          close: '100.5',
          volume: '10',
        },
        {
          ts_open: now - 2 * 86_400_000,
          open: '100',
          high: '90',
          low: '105',
          close: '102',
          volume: '0',
        },
        {
          ts_open: now - 86_400_000,
          open: '0',
          high: '101',
          low: '99',
          close: '100.2',
          volume: '20',
        },
      ],
      'TEST',
    );

    await validateAndRepair({
      repo,
      timeframes: ['1d'],
      lookbackBars: 10,
    });

    const anomalies = db
      .prepare(
        'SELECT anomaly_type FROM ingest_anomalies WHERE asset_id = ? ORDER BY created_at ASC',
      )
      .all(asset.asset_id) as Array<{ anomaly_type: string }>;
    const summary = repo.getIngestAnomalySummary({
      assetId: asset.asset_id,
      timeframe: '1d',
      startTsOpen: now - 10 * 86_400_000,
      endTsOpen: now,
    });

    expect(anomalies.map((row) => row.anomaly_type)).toContain('OHLC_ENVELOPE_ANOMALY');
    expect(anomalies.map((row) => row.anomaly_type)).toContain('ZERO_VOLUME_ANOMALY');
    expect(anomalies.map((row) => row.anomaly_type)).toContain('PRICE_ANOMALY');
    expect(summary.totalCount).toBe(3);
    expect(summary.distinctTsCount).toBe(2);
    expect(summary.countsByType.PRICE_ANOMALY).toBe(1);
    expect(summary.countsByType.OHLC_ENVELOPE_ANOMALY).toBe(1);
    expect(summary.countsByType.ZERO_VOLUME_ANOMALY).toBe(1);
  });
});

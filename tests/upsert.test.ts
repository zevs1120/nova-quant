import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';

describe('upsert logic', () => {
  it('is idempotent on ohlcv primary key', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    const asset = repo.upsertAsset({
      symbol: 'BTCUSDT',
      market: 'CRYPTO',
      venue: 'BINANCE_UM',
      base: 'BTC',
      quote: 'USDT',
    });

    const bar = {
      ts_open: 1700000000000,
      open: '40000',
      high: '40100',
      low: '39900',
      close: '40050',
      volume: '123',
    };

    repo.upsertOhlcvBars(asset.asset_id, '5m', [bar], 'TEST_A');
    repo.upsertOhlcvBars(asset.asset_id, '5m', [{ ...bar, close: '40111' }], 'TEST_B');

    const rows = repo.getOhlcv({ assetId: asset.asset_id, timeframe: '5m' });
    expect(rows).toHaveLength(1);
    expect(rows[0].close).toBe('40111');
    expect(rows[0].source).toBe('TEST_B');
  });

  it('stores and updates ingestion cursor', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    const asset = repo.upsertAsset({
      symbol: 'AAPL',
      market: 'US',
      venue: 'STOOQ',
    });

    repo.setCursor(asset.asset_id, '1d', 1700000000000, 'TEST');
    expect(repo.getCursor(asset.asset_id, '1d')).toBe(1700000000000);

    repo.setCursor(asset.asset_id, '1d', 1700000100000, 'TEST2');
    expect(repo.getCursor(asset.asset_id, '1d')).toBe(1700000100000);
  });
});

import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';

const fetchBinanceKlinesMock = vi.fn();
const fetchYahooChartSnapshotMock = vi.fn();
const fetchAlphaVantageDailyBarsMock = vi.fn();

vi.mock('../src/server/ingestion/binanceIncremental.js', () => ({
  fetchBinanceKlines: fetchBinanceKlinesMock,
  isBinanceAccessBlockedError: (error: unknown) =>
    error instanceof Error && error.message.includes('region-blocked'),
}));

vi.mock('../src/server/ingestion/yahoo.js', () => ({
  fetchYahooChartSnapshot: fetchYahooChartSnapshotMock,
}));

vi.mock('../src/server/ingestion/hostedData.js', () => ({
  fetchAlphaVantageDailyBars: fetchAlphaVantageDailyBarsMock,
}));

describe('ingestion gap repair', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchBinanceKlinesMock.mockReset();
    fetchYahooChartSnapshotMock.mockReset();
    fetchAlphaVantageDailyBarsMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('repairs US daily gaps from Yahoo and marks the series as repaired', async () => {
    const { validateAndRepair } = await import('../src/server/ingestion/validation.js');
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const asset = repo.upsertAsset({
      symbol: 'AAPL',
      market: 'US',
      venue: 'STOOQ',
    });

    const tuesday = Date.UTC(2026, 3, 7);
    const wednesday = Date.UTC(2026, 3, 8);
    const thursday = Date.UTC(2026, 3, 9);

    repo.upsertOhlcvBars(
      asset.asset_id,
      '1d',
      [
        {
          ts_open: tuesday,
          open: '100',
          high: '101',
          low: '99',
          close: '100.5',
          volume: '10',
        },
        {
          ts_open: thursday,
          open: '102',
          high: '103',
          low: '101',
          close: '102.6',
          volume: '12',
        },
      ],
      'STOOQ_BULK',
    );

    fetchYahooChartSnapshotMock.mockResolvedValue({
      bars: [
        {
          ts_open: wednesday,
          open: '100.8',
          high: '102',
          low: '100.4',
          close: '101.8',
          volume: '11',
        },
        {
          ts_open: thursday,
          open: '102',
          high: '103',
          low: '101',
          close: '102.6',
          volume: '12',
        },
      ],
      corporateActions: [],
    });
    fetchAlphaVantageDailyBarsMock.mockResolvedValue([]);

    await validateAndRepair({
      repo,
      timeframes: ['1d'],
      lookbackBars: 10,
    });

    const repairedRow = repo.getOhlcv({
      assetId: asset.asset_id,
      timeframe: '1d',
      start: wednesday,
      end: wednesday,
    });
    const qualityState = repo.getOhlcvQualityState({
      assetId: asset.asset_id,
      timeframe: '1d',
    });

    expect(repairedRow).toHaveLength(1);
    expect(fetchAlphaVantageDailyBarsMock).not.toHaveBeenCalled();
    expect(qualityState?.status).toBe('REPAIRED');
    expect(qualityState?.reason).toBe('GAP_REPAIRED_YAHOO_REPAIR');
    expect(JSON.parse(String(qualityState?.metrics_json || '{}')).last_repair.source).toBe(
      'YAHOO_REPAIR',
    );
  });

  it('falls back to Alpha Vantage when Yahoo cannot repair a US daily gap', async () => {
    const { validateAndRepair } = await import('../src/server/ingestion/validation.js');
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const asset = repo.upsertAsset({
      symbol: 'MSFT',
      market: 'US',
      venue: 'STOOQ',
    });

    const tuesday = Date.UTC(2026, 3, 14);
    const wednesday = Date.UTC(2026, 3, 15);
    const thursday = Date.UTC(2026, 3, 16);

    repo.upsertOhlcvBars(
      asset.asset_id,
      '1d',
      [
        {
          ts_open: tuesday,
          open: '200',
          high: '201',
          low: '199',
          close: '200.4',
          volume: '20',
        },
        {
          ts_open: thursday,
          open: '204',
          high: '205',
          low: '203',
          close: '204.3',
          volume: '22',
        },
      ],
      'STOOQ_BULK',
    );

    fetchYahooChartSnapshotMock.mockRejectedValue(new Error('Yahoo unavailable'));
    fetchAlphaVantageDailyBarsMock.mockResolvedValue([
      {
        ts_open: wednesday,
        open: '201',
        high: '202',
        low: '200.5',
        close: '201.8',
        volume: '21',
      },
    ]);

    await validateAndRepair({
      repo,
      timeframes: ['1d'],
      lookbackBars: 10,
    });

    const repairedRow = repo.getOhlcv({
      assetId: asset.asset_id,
      timeframe: '1d',
      start: wednesday,
      end: wednesday,
    });
    const qualityState = repo.getOhlcvQualityState({
      assetId: asset.asset_id,
      timeframe: '1d',
    });

    expect(repairedRow).toHaveLength(1);
    expect(fetchYahooChartSnapshotMock).toHaveBeenCalledOnce();
    expect(fetchAlphaVantageDailyBarsMock).toHaveBeenCalledOnce();
    expect(qualityState?.status).toBe('REPAIRED');
    expect(qualityState?.reason).toBe('GAP_REPAIRED_ALPHA_VANTAGE_REPAIR');
  });

  it('stores Yahoo split events so future sequence checks can explain split-driven jumps', async () => {
    const { validateAndRepair } = await import('../src/server/ingestion/validation.js');
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const asset = repo.upsertAsset({
      symbol: 'NVDA',
      market: 'US',
      venue: 'STOOQ',
    });

    const tuesday = Date.UTC(2026, 5, 9);
    const wednesday = Date.UTC(2026, 5, 10);
    const thursday = Date.UTC(2026, 5, 11);

    repo.upsertOhlcvBars(
      asset.asset_id,
      '1d',
      [
        {
          ts_open: tuesday,
          open: '1000',
          high: '1012',
          low: '995',
          close: '1000',
          volume: '20',
        },
        {
          ts_open: thursday,
          open: '102',
          high: '103',
          low: '99',
          close: '100',
          volume: '25',
        },
      ],
      'STOOQ_BULK',
    );

    fetchYahooChartSnapshotMock.mockResolvedValue({
      bars: [
        {
          ts_open: wednesday,
          open: '101',
          high: '102',
          low: '99',
          close: '100',
          volume: '23',
        },
      ],
      corporateActions: [
        {
          effectiveTs: wednesday,
          actionType: 'SPLIT',
          splitRatio: 10,
          notes: '10-for-1 split',
        },
      ],
    });
    fetchAlphaVantageDailyBarsMock.mockResolvedValue([]);

    await validateAndRepair({
      repo,
      timeframes: ['1d'],
      lookbackBars: 10,
    });

    const actions = repo.listCorporateActions({
      assetId: asset.asset_id,
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.action_type).toBe('SPLIT');
    expect(actions[0]?.split_ratio).toBe(10);
  });
});

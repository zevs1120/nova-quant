import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { syncBinanceDerivatives } from '../src/server/ingestion/binanceDerivatives.js';

const originalFetch = global.fetch;

describe('syncBinanceDerivatives', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('stores public funding history and basis snapshots for crypto symbols', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/fapi/v1/fundingRate')) {
        return new Response(
          JSON.stringify([
            { symbol: 'BTCUSDT', fundingRate: '0.0001', fundingTime: 1_710_000_000_000 },
            { symbol: 'BTCUSDT', fundingRate: '0.0002', fundingTime: 1_710_028_800_000 },
          ]),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      if (url.includes('/fapi/v1/premiumIndex')) {
        return new Response(
          JSON.stringify({
            symbol: 'BTCUSDT',
            markPrice: '50500',
            indexPrice: '50000',
            lastFundingRate: '0.0002',
            time: 1_710_028_800_000,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const result = await syncBinanceDerivatives({
      repo,
      symbols: ['BTCUSDT'],
    });

    const asset = repo.getAssetBySymbol('CRYPTO', 'BTCUSDT');
    expect(asset).toBeTruthy();
    expect(result.symbols_processed).toBe(1);
    expect(result.funding_points).toBeGreaterThanOrEqual(2);
    expect(result.basis_points).toBe(1);

    const fundingRows = repo.listFundingRates({ assetId: asset!.asset_id });
    const latestBasis = repo.getLatestBasisSnapshot(asset!.asset_id);

    expect(fundingRows.length).toBeGreaterThanOrEqual(2);
    expect(Number(fundingRows[fundingRows.length - 1]?.funding_rate)).toBeCloseTo(0.0002, 8);
    expect(Number(latestBasis?.basis_bps)).toBeCloseTo(100, 6);
  });
});

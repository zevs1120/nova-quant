import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { buildFactorMeasurementReport } from '../src/server/research/factorMeasurements.js';
import type { NormalizedBar } from '../src/server/types.js';

function buildRepo() {
  const db = new Database(':memory:');
  ensureSchema(db);
  return new MarketRepository(db);
}

function series(start: number, dailyRate: number, count: number): NormalizedBar[] {
  let price = start;
  const rows: NormalizedBar[] = [];
  for (let i = 0; i < count; i += 1) {
    price = price * (1 + dailyRate);
    rows.push({
      ts_open: Date.UTC(2025, 0, 1 + i),
      open: price.toFixed(4),
      high: (price * 1.01).toFixed(4),
      low: (price * 0.99).toFixed(4),
      close: price.toFixed(4),
      volume: String(1_000_000 + i * 5000),
    });
  }
  return rows;
}

function carrySeries(
  start: number,
  dailyRate: number,
  fundingRate: number,
  basisBps: number,
  count: number,
) {
  return {
    bars: series(start, dailyRate, count),
    funding: Array.from({ length: count }, (_, index) => ({
      ts_open: Date.UTC(2025, 0, 1 + index),
      funding_rate: fundingRate.toFixed(6),
    })),
    basis: Array.from({ length: count }, (_, index) => ({
      ts_open: Date.UTC(2025, 0, 1 + index),
      basis_bps: basisBps.toFixed(4),
    })),
  };
}

describe('factor measurement research layer', () => {
  it('computes measured momentum diagnostics from aligned cross-sectional bars', () => {
    const repo = buildRepo();
    const assets = [
      { symbol: 'AAA', rate: 0.006 },
      { symbol: 'BBB', rate: 0.0035 },
      { symbol: 'CCC', rate: 0.001 },
      { symbol: 'DDD', rate: -0.0015 },
    ];

    for (const item of assets) {
      const asset = repo.upsertAsset({
        symbol: item.symbol,
        market: 'US',
        venue: 'TEST',
        status: 'ACTIVE',
      });
      repo.upsertOhlcvBars(asset.asset_id, '1d', series(100, item.rate, 220), 'test_seed');
    }

    const result = buildFactorMeasurementReport(repo, {
      factorId: 'momentum',
      market: 'US',
      assetClass: 'US_STOCK',
    });

    expect(result.report?.availability).toBe('measured');
    expect((result.report?.measured_metrics?.sample_dates || 0) > 20).toBe(true);
    expect((result.report?.measured_metrics?.ic || 0) > 0).toBe(true);
    expect((result.report?.measured_metrics?.rank_ic || 0) > 0).toBe(true);
    expect((result.report?.regime_conditioned_metrics?.length || 0) > 0).toBe(true);
  });

  it('honestly downgrades unsupported factors to knowledge-only', () => {
    const repo = buildRepo();
    const result = buildFactorMeasurementReport(repo, {
      factorId: 'value',
      market: 'US',
      assetClass: 'US_STOCK',
    });

    expect(result.source_status).toBe('DB_BACKED');
    expect(result.report?.availability).toBe('knowledge_only');
    expect(result.report?.measured_metrics).toBeNull();
    expect(result.report?.notes?.[0]).toContain('fundamental');
  });

  it('computes measured carry diagnostics from funding and basis history', () => {
    const repo = buildRepo();
    const assets = [
      { symbol: 'BTCUSDT', rate: 0.005, funding: 0.0009, basis: 18 },
      { symbol: 'ETHUSDT', rate: 0.0038, funding: 0.0006, basis: 12 },
      { symbol: 'SOLUSDT', rate: 0.0018, funding: 0.0002, basis: 4 },
      { symbol: 'ADAUSDT', rate: -0.0008, funding: -0.0004, basis: -6 },
    ];

    for (const item of assets) {
      const asset = repo.upsertAsset({
        symbol: item.symbol,
        market: 'CRYPTO',
        venue: 'TEST',
        status: 'ACTIVE',
      });
      const payload = carrySeries(100, item.rate, item.funding, item.basis, 220);
      repo.upsertOhlcvBars(asset.asset_id, '1d', payload.bars, 'test_seed');
      repo.upsertFundingRates(asset.asset_id, payload.funding, 'test_seed');
      repo.upsertBasisSnapshots(asset.asset_id, payload.basis, 'test_seed');
    }

    const result = buildFactorMeasurementReport(repo, {
      factorId: 'carry',
      market: 'CRYPTO',
      assetClass: 'CRYPTO',
    });

    expect(result.report?.availability).toBe('measured');
    expect((result.report?.measured_metrics?.sample_dates || 0) > 20).toBe(true);
    expect((result.report?.measured_metrics?.ic || 0) > 0).toBe(true);
  });
});

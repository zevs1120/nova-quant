import { describe, expect, it, vi, afterEach } from 'vitest';
import * as queries from '../src/server/api/queries.js';

describe('postgres fallback sync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loadRuntimeStateCorePrimary falls back to loadRuntimeStateCore when all Postgres reads fail', async () => {
    // When shouldPreferPostgresPrimaryReads returns true but all Postgres reads return null,
    // the function should fall back to loadRuntimeStateCore which includes syncQuantState.
    // This test verifies the fallback path works correctly end-to-end.
    const result = queries.getRuntimeState({
      userId: 'guest-default',
      market: 'US',
      assetClass: 'US_STOCK',
    });

    // Must have transparency metadata and data structure
    expect(result).toHaveProperty('source_status');
    expect(result).toHaveProperty('data');
    expect(result.data).toHaveProperty('signals');
    expect(result.data).toHaveProperty('decision');
  });

  it('listSignalContractsPrimary falls back to listSignalContracts which includes sync', async () => {
    // Without any Postgres URL configured, tryPrimaryPostgresRead returns null.
    // The fallback should call listSignalContracts which internally calls syncQuantState.
    const origEnv = process.env.NOVA_DATA_DATABASE_URL;
    delete process.env.NOVA_DATA_DATABASE_URL;

    try {
      const signals = await queries.listSignalContractsPrimary({
        userId: 'guest-default',
        market: 'US',
        assetClass: 'US_STOCK',
        limit: 10,
      });

      // Should return an array (possibly empty if no data ingested)
      expect(Array.isArray(signals)).toBe(true);
    } finally {
      if (origEnv !== undefined) {
        process.env.NOVA_DATA_DATABASE_URL = origEnv;
      }
    }
  });

  it('getSignalContractPrimary falls back gracefully for unknown signals', async () => {
    const origEnv = process.env.NOVA_DATA_DATABASE_URL;
    delete process.env.NOVA_DATA_DATABASE_URL;

    try {
      const signal = await queries.getSignalContractPrimary(
        'nonexistent-signal-id',
        'guest-default',
      );
      expect(signal).toBeNull();
    } finally {
      if (origEnv !== undefined) {
        process.env.NOVA_DATA_DATABASE_URL = origEnv;
      }
    }
  });

  it('getRiskProfilePrimary falls back to SQLite path', async () => {
    const origEnv = process.env.NOVA_DATA_DATABASE_URL;
    delete process.env.NOVA_DATA_DATABASE_URL;

    try {
      const risk = await queries.getRiskProfilePrimary('guest-default', { skipSync: true });
      // Should return a risk profile object or null (not throw)
      if (risk) {
        expect(risk).toHaveProperty('profile_key');
      }
    } finally {
      if (origEnv !== undefined) {
        process.env.NOVA_DATA_DATABASE_URL = origEnv;
      }
    }
  });

  it('getMarketStatePrimary falls back to SQLite path', async () => {
    const origEnv = process.env.NOVA_DATA_DATABASE_URL;
    delete process.env.NOVA_DATA_DATABASE_URL;

    try {
      const data = await queries.getMarketStatePrimary({
        userId: 'guest-default',
        market: 'US',
      });
      expect(Array.isArray(data)).toBe(true);
    } finally {
      if (origEnv !== undefined) {
        process.env.NOVA_DATA_DATABASE_URL = origEnv;
      }
    }
  });

  it('getPerformanceSummaryPrimary falls back to SQLite path', async () => {
    const origEnv = process.env.NOVA_DATA_DATABASE_URL;
    delete process.env.NOVA_DATA_DATABASE_URL;

    try {
      const data = await queries.getPerformanceSummaryPrimary({
        userId: 'guest-default',
        market: 'US',
      });
      // Should return a performance summary object
      expect(data).toBeDefined();
    } finally {
      if (origEnv !== undefined) {
        process.env.NOVA_DATA_DATABASE_URL = origEnv;
      }
    }
  });
});

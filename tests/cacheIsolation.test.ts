import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import {
  __buildQuantCacheKeyForTests,
  __resetQuantDataCacheForTests,
  ensureQuantData,
  type QuantRuntimeContext
} from '../src/server/quant/service.js';

function buildRepo() {
  const db = new Database(':memory:');
  ensureSchema(db);
  return new MarketRepository(db);
}

describe('quant runtime cache isolation', () => {
  beforeEach(() => {
    __resetQuantDataCacheForTests();
  });

  it('does not share cache entries across different users', () => {
    const repo = buildRepo();
    const a = ensureQuantData(repo, 'user-a', false, {
      market: 'US',
      assetClass: 'US_STOCK'
    });
    const b = ensureQuantData(repo, 'user-b', false, {
      market: 'US',
      assetClass: 'US_STOCK'
    });
    expect(a).not.toBe(b);
  });

  it('does not share cache entries across risk profile keys for same user', () => {
    const repo = buildRepo();
    const balanced = ensureQuantData(repo, 'user-a', false, {
      riskProfileKey: 'balanced',
      market: 'US',
      assetClass: 'US_STOCK'
    });
    const aggressive = ensureQuantData(repo, 'user-a', false, {
      riskProfileKey: 'aggressive',
      market: 'US',
      assetClass: 'US_STOCK'
    });
    expect(balanced).not.toBe(aggressive);
  });

  it('reuses same cache entry for identical key within ttl', () => {
    const repo = buildRepo();
    const first = ensureQuantData(repo, 'user-a', false, {
      riskProfileKey: 'balanced',
      market: 'US',
      assetClass: 'US_STOCK',
      timeframe: '1d'
    });
    const second = ensureQuantData(repo, 'user-a', false, {
      riskProfileKey: 'balanced',
      market: 'US',
      assetClass: 'US_STOCK',
      timeframe: '1d'
    });
    expect(second).toBe(first);
  });

  it('force refresh invalidates only the current key', () => {
    const repo = buildRepo();
    const keyA = ensureQuantData(repo, 'user-a', false, {
      riskProfileKey: 'balanced',
      market: 'US',
      assetClass: 'US_STOCK'
    });
    const keyB = ensureQuantData(repo, 'user-b', false, {
      riskProfileKey: 'balanced',
      market: 'US',
      assetClass: 'US_STOCK'
    });

    const refreshedA = ensureQuantData(repo, 'user-a', true, {
      riskProfileKey: 'balanced',
      market: 'US',
      assetClass: 'US_STOCK'
    });
    const reusedB = ensureQuantData(repo, 'user-b', false, {
      riskProfileKey: 'balanced',
      market: 'US',
      assetClass: 'US_STOCK'
    });

    expect(refreshedA).not.toBe(keyA);
    expect(reusedB).toBe(keyB);
  });

  it('builds cache key from user+risk+market+asset+timeframe+scope', () => {
    const context: QuantRuntimeContext = {
      userId: 'alice',
      riskProfileKey: 'balanced',
      market: 'CRYPTO',
      assetClass: 'CRYPTO',
      timeframe: '1h',
      universeScope: 'watchlist-core'
    };
    const key = __buildQuantCacheKeyForTests(context);
    expect(key).toContain('user:alice');
    expect(key).toContain('risk:balanced');
    expect(key).toContain('market:CRYPTO');
    expect(key).toContain('asset:CRYPTO');
    expect(key).toContain('tf:1h');
    expect(key).toContain('scope:watchlist-core');
  });
});

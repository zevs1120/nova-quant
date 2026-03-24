import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import {
  convertCryptoSymbol,
  mapTimeframe,
  massiveBarToNormalized,
  fetchMassiveAggs,
  backfillMassiveStocks,
  backfillMassiveCrypto,
  type MassiveAggBar,
  type MassiveAggsResponse
} from '../src/server/ingestion/massive.js';
import { normalizeBars } from '../src/server/ingestion/normalize.js';

// ── Helper: create a mock Massive response ──────────────────────────────────

function makeMockResponse(overrides?: Partial<MassiveAggsResponse>): MassiveAggsResponse {
  return {
    ticker: 'AAPL',
    queryCount: 2,
    resultsCount: 2,
    adjusted: true,
    results: [
      { v: 100, o: 150, c: 151, h: 152, l: 149, t: 1700000000000 },
      { v: 200, o: 151, c: 153, h: 154, l: 150, t: 1700086400000 }
    ],
    status: 'OK',
    request_id: 'test-123',
    ...overrides
  };
}

function defaultFetchParams(overrides?: Record<string, unknown>) {
  return {
    ticker: 'AAPL',
    timeframe: '1d' as const,
    from: new Date('2024-01-01'),
    to: new Date('2024-01-31'),
    apiKey: 'test-key',
    baseUrl: 'https://api.massive.com',
    timeoutMs: 5000,
    retry: { attempts: 1, baseDelayMs: 100 },
    requestDelayMs: 0,
    ...overrides
  };
}

describe('Massive API ingestion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PURE FUNCTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('mapTimeframe', () => {
    it('maps 1d to day multiplier 1', () => {
      expect(mapTimeframe('1d')).toEqual({ multiplier: 1, timespan: 'day' });
    });

    it('maps 5m to minute multiplier 5', () => {
      expect(mapTimeframe('5m')).toEqual({ multiplier: 5, timespan: 'minute' });
    });

    it('maps 1h to hour multiplier 1', () => {
      expect(mapTimeframe('1h')).toEqual({ multiplier: 1, timespan: 'hour' });
    });

    it('maps 15m to minute multiplier 15', () => {
      expect(mapTimeframe('15m')).toEqual({ multiplier: 15, timespan: 'minute' });
    });

    it('maps 1m to minute multiplier 1', () => {
      expect(mapTimeframe('1m')).toEqual({ multiplier: 1, timespan: 'minute' });
    });
  });

  describe('convertCryptoSymbol', () => {
    it('converts BTCUSDT to X:BTCUSD', () => {
      expect(convertCryptoSymbol('BTCUSDT')).toBe('X:BTCUSD');
    });

    it('converts ETHUSDT to X:ETHUSD', () => {
      expect(convertCryptoSymbol('ETHUSDT')).toBe('X:ETHUSD');
    });

    it('converts SOLUSDT to X:SOLUSD', () => {
      expect(convertCryptoSymbol('SOLUSDT')).toBe('X:SOLUSD');
    });

    it('handles already-USD symbols', () => {
      expect(convertCryptoSymbol('BTCUSD')).toBe('X:BTCUSD');
    });

    it('handles lowercase input', () => {
      expect(convertCryptoSymbol('btcusdt')).toBe('X:BTCUSD');
    });

    it('handles non-standard symbols like SHIBUSDT', () => {
      expect(convertCryptoSymbol('SHIBUSDT')).toBe('X:SHIBUSD');
    });

    it('handles symbols without USD suffix', () => {
      // DOGEUSDT → X:DOGEUSD
      expect(convertCryptoSymbol('DOGEUSDT')).toBe('X:DOGEUSD');
    });
  });

  describe('massiveBarToNormalized', () => {
    it('converts a Massive bar to NormalizedBar', () => {
      const bar: MassiveAggBar = {
        v: 1234567,
        vw: 150.5,
        o: 148.0,
        c: 152.3,
        h: 153.0,
        l: 147.5,
        t: 1700000000000,
        n: 500
      };

      const result = massiveBarToNormalized(bar);

      expect(result).toEqual({
        ts_open: 1700000000000,
        open: '148',
        high: '153',
        low: '147.5',
        close: '152.3',
        volume: '1234567'
      });
    });

    it('handles zero volume', () => {
      const bar: MassiveAggBar = {
        v: 0, o: 100, c: 101, h: 102, l: 99, t: 1700000000000
      };
      expect(massiveBarToNormalized(bar).volume).toBe('0');
    });

    it('preserves decimal precision in prices', () => {
      const bar: MassiveAggBar = {
        v: 50, o: 123.456789, c: 124.987654, h: 125.111, l: 122.002, t: 1700000000000
      };
      const result = massiveBarToNormalized(bar);
      expect(result.open).toBe('123.456789');
      expect(result.close).toBe('124.987654');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // fetchMassiveAggs — CORE FETCH LOGIC
  // ═══════════════════════════════════════════════════════════════════════════

  describe('fetchMassiveAggs', () => {
    it('fetches and returns normalized bars with correct URL structure', async () => {
      const mockResponse = makeMockResponse();
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify(mockResponse), { status: 200 })
      ) as typeof fetch;
      vi.stubGlobal('fetch', fetchMock);

      const bars = await fetchMassiveAggs(defaultFetchParams());

      expect(bars).toHaveLength(2);
      expect(bars[0].open).toBe('150');
      expect(bars[1].close).toBe('153');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(calledUrl).toContain('/v2/aggs/ticker/AAPL/range/1/day/');
      expect(calledUrl).toContain('apiKey=test-key');
      expect(calledUrl).toContain('adjusted=true');
      expect(calledUrl).toContain('sort=asc');
    });

    it('handles empty results array gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response(JSON.stringify(makeMockResponse({ results: [] })), { status: 200 })
      ) as typeof fetch);

      const bars = await fetchMassiveAggs(defaultFetchParams());
      expect(bars).toHaveLength(0);
    });

    it('handles results: undefined gracefully', async () => {
      const resp = makeMockResponse();
      delete (resp as Record<string, unknown>).results;
      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response(JSON.stringify(resp), { status: 200 })
      ) as typeof fetch);

      const bars = await fetchMassiveAggs(defaultFetchParams());
      expect(bars).toHaveLength(0);
    });

    it('follows next_url for pagination', async () => {
      const page1 = makeMockResponse({
        results: [{ v: 100, o: 150, c: 151, h: 152, l: 149, t: 1700000000000 }],
        next_url: 'https://api.massive.com/v2/aggs/ticker/AAPL/range/1/day/2024-01-01/2024-01-31?cursor=abc'
      });
      const page2 = makeMockResponse({
        results: [{ v: 200, o: 151, c: 153, h: 154, l: 150, t: 1700086400000 }],
        next_url: undefined
      });

      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn(async () => {
        callCount += 1;
        return new Response(JSON.stringify(callCount === 1 ? page1 : page2), { status: 200 });
      }) as typeof fetch);

      const bars = await fetchMassiveAggs(defaultFetchParams());
      expect(bars).toHaveLength(2);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

    // ── Error handling ────────────────────────────────────────────────────

    it('handles 429 rate limit — retries after pause', async () => {
      const sleepModule = await import('../src/server/utils/time.js');
      vi.spyOn(sleepModule, 'sleep').mockResolvedValue();

      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) return new Response('Rate limited', { status: 429 });
        return new Response(JSON.stringify(makeMockResponse()), { status: 200 });
      }) as typeof fetch);

      const bars = await fetchMassiveAggs(defaultFetchParams());
      expect(bars).toHaveLength(2);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
      // Verify 15s sleep was called for rate limit
      expect(sleepModule.sleep).toHaveBeenCalledWith(15_000);
    });

    it('handles 403 Forbidden — stops immediately with zero bars', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response('Forbidden', { status: 403 })
      ) as typeof fetch);

      const bars = await fetchMassiveAggs(defaultFetchParams());
      expect(bars).toHaveLength(0);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('handles 401 Unauthorized — stops immediately with zero bars', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response('Unauthorized', { status: 401 })
      ) as typeof fetch);

      const bars = await fetchMassiveAggs(defaultFetchParams());
      expect(bars).toHaveLength(0);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('handles 500 Internal Server Error — stops with zero bars', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response('Internal Server Error', { status: 500 })
      ) as typeof fetch);

      const bars = await fetchMassiveAggs(defaultFetchParams());
      expect(bars).toHaveLength(0);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('handles 503 Service Unavailable — stops with zero bars', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response('Service Unavailable', { status: 503 })
      ) as typeof fetch);

      const bars = await fetchMassiveAggs(defaultFetchParams());
      expect(bars).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it('handles network timeout — retries then breaks', async () => {
      const sleepModule = await import('../src/server/utils/time.js');
      vi.spyOn(sleepModule, 'sleep').mockResolvedValue();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('AbortError: The operation was aborted');
      }) as typeof fetch);

      const bars = await fetchMassiveAggs(defaultFetchParams({
        retry: { attempts: 2, baseDelayMs: 100 }
      }));

      // Should retry up to attempts count, then break with empty bars
      expect(bars).toHaveLength(0);
      // First attempt pageCount=1 <= attempts(2): retry. Second attempt pageCount=2 <= attempts(2): retry. Third attempt pageCount=3 > attempts(2): break.
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
      warnSpy.mockRestore();
    });

    it('handles invalid JSON response — stops with zero bars', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response('<html>Not JSON</html>', { status: 200 })
      ) as typeof fetch);

      const bars = await fetchMassiveAggs(defaultFetchParams());
      expect(bars).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it('appends apiKey to next_url when not present', async () => {
      const page1 = makeMockResponse({
        results: [{ v: 100, o: 150, c: 151, h: 152, l: 149, t: 1700000000000 }],
        next_url: 'https://api.massive.com/v2/aggs?cursor=abc' // no apiKey
      });
      const page2 = makeMockResponse({
        results: [{ v: 200, o: 151, c: 153, h: 154, l: 150, t: 1700086400000 }],
      });

      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn(async () => {
        callCount += 1;
        return new Response(JSON.stringify(callCount === 1 ? page1 : page2), { status: 200 });
      }) as typeof fetch);

      await fetchMassiveAggs(defaultFetchParams());

      // Second call should have apiKey appended
      const secondUrl = vi.mocked(fetch).mock.calls[1][0] as string;
      expect(secondUrl).toContain('apiKey=test-key');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // backfillMassiveStocks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('backfillMassiveStocks', () => {
    it('skips gracefully when MASSIVE_API_KEY is not set', async () => {
      const db = new Database(':memory:');
      ensureSchema(db);
      const repo = new MarketRepository(db);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await backfillMassiveStocks({ repo });
      // Should not throw
      warnSpy.mockRestore();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // backfillMassiveCrypto
  // ═══════════════════════════════════════════════════════════════════════════

  describe('backfillMassiveCrypto', () => {
    it('skips gracefully when MASSIVE_API_KEY is not set', async () => {
      const db = new Database(':memory:');
      ensureSchema(db);
      const repo = new MarketRepository(db);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await backfillMassiveCrypto({ repo });
      // Should not throw
      warnSpy.mockRestore();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // END-TO-END DATA PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('data pipeline: fetch → normalize → persist → read', () => {
    it('full stock round-trip: fetch → upsert → getOhlcv', async () => {
      const db = new Database(':memory:');
      ensureSchema(db);
      const repo = new MarketRepository(db);

      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response(JSON.stringify(makeMockResponse()), { status: 200 })
      ) as typeof fetch);

      // 1. Fetch
      const bars = await fetchMassiveAggs(defaultFetchParams());
      expect(bars).toHaveLength(2);

      // 2. Persist
      const asset = repo.upsertAsset({
        market: 'US', symbol: 'AAPL', venue: 'MASSIVE', quote: 'USD', status: 'ACTIVE'
      });
      const normalized = normalizeBars(bars);
      repo.upsertOhlcvBars(asset.asset_id, '1d', normalized, 'MASSIVE');

      // 3. Read back via getOhlcv (the path downstream consumers use)
      const readBack = repo.getOhlcv({
        assetId: asset.asset_id,
        timeframe: '1d'
      });

      expect(readBack).toHaveLength(2);
      expect(readBack[0].open).toBe('150');
      expect(readBack[0].close).toBe('151');
      expect(readBack[0].source).toBe('MASSIVE');
      expect(readBack[1].open).toBe('151');
      expect(readBack[1].close).toBe('153');
    });

    it('full crypto round-trip: convertSymbol → fetch → upsert → getOhlcv', async () => {
      const db = new Database(':memory:');
      ensureSchema(db);
      const repo = new MarketRepository(db);

      const cryptoResponse = makeMockResponse({ ticker: 'X:BTCUSD' });
      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response(JSON.stringify(cryptoResponse), { status: 200 })
      ) as typeof fetch);

      // 1. Convert symbol
      const massiveTicker = convertCryptoSymbol('BTCUSDT');
      expect(massiveTicker).toBe('X:BTCUSD');

      // 2. Fetch
      const bars = await fetchMassiveAggs(defaultFetchParams({ ticker: massiveTicker }));
      expect(bars).toHaveLength(2);

      // 3. Persist
      const asset = repo.upsertAsset({
        market: 'CRYPTO', symbol: 'BTCUSDT', venue: 'MASSIVE', base: 'BTC', quote: 'USD', status: 'ACTIVE'
      });
      const normalized = normalizeBars(bars);
      repo.upsertOhlcvBars(asset.asset_id, '1d', normalized, 'MASSIVE');

      // 4. Read back
      const readBack = repo.getOhlcv({ assetId: asset.asset_id, timeframe: '1d' });
      expect(readBack).toHaveLength(2);
      expect(readBack[0].source).toBe('MASSIVE');
    });

    it('upsert idempotency — same data twice produces same row count', async () => {
      const db = new Database(':memory:');
      ensureSchema(db);
      const repo = new MarketRepository(db);

      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response(JSON.stringify(makeMockResponse()), { status: 200 })
      ) as typeof fetch);

      const asset = repo.upsertAsset({
        market: 'US', symbol: 'AAPL', venue: 'MASSIVE', quote: 'USD', status: 'ACTIVE'
      });

      // First ingestion
      const bars1 = await fetchMassiveAggs(defaultFetchParams());
      const norm1 = normalizeBars(bars1);
      repo.upsertOhlcvBars(asset.asset_id, '1d', norm1, 'MASSIVE');

      const count1 = (db.prepare("SELECT COUNT(*) as cnt FROM ohlcv WHERE source = 'MASSIVE'").get() as { cnt: number }).cnt;
      expect(count1).toBe(2);

      // Second ingestion with same data — should upsert, not duplicate
      const bars2 = await fetchMassiveAggs(defaultFetchParams());
      const norm2 = normalizeBars(bars2);
      repo.upsertOhlcvBars(asset.asset_id, '1d', norm2, 'MASSIVE');

      const count2 = (db.prepare("SELECT COUNT(*) as cnt FROM ohlcv WHERE source = 'MASSIVE'").get() as { cnt: number }).cnt;
      expect(count2).toBe(2); // Still 2, not 4

      // Verify getOhlcvStats too
      const stats = repo.getOhlcvStats(asset.asset_id, '1d');
      expect(stats.bar_count).toBe(2);
    });

    it('upsert overwrites with updated data', async () => {
      const db = new Database(':memory:');
      ensureSchema(db);
      const repo = new MarketRepository(db);

      const asset = repo.upsertAsset({
        market: 'US', symbol: 'AAPL', venue: 'MASSIVE', quote: 'USD', status: 'ACTIVE'
      });

      // First write: close = 151
      const bars1 = normalizeBars([{
        ts_open: 1700000000000, open: '150', high: '152', low: '149', close: '151', volume: '100'
      }]);
      repo.upsertOhlcvBars(asset.asset_id, '1d', bars1, 'MASSIVE');

      // Second write: same ts_open, but close updated to 155 (adjusted data)
      const bars2 = normalizeBars([{
        ts_open: 1700000000000, open: '150', high: '156', low: '149', close: '155', volume: '120'
      }]);
      repo.upsertOhlcvBars(asset.asset_id, '1d', bars2, 'MASSIVE');

      const readBack = repo.getOhlcv({ assetId: asset.asset_id, timeframe: '1d' });
      expect(readBack).toHaveLength(1);
      expect(readBack[0].close).toBe('155'); // Updated
      expect(readBack[0].high).toBe('156');
      expect(readBack[0].volume).toBe('120');
    });

    it('getLatestTsOpen works with MASSIVE source data', async () => {
      const db = new Database(':memory:');
      ensureSchema(db);
      const repo = new MarketRepository(db);

      const asset = repo.upsertAsset({
        market: 'US', symbol: 'AAPL', venue: 'MASSIVE', quote: 'USD', status: 'ACTIVE'
      });

      const bars = normalizeBars([
        { ts_open: 1700000000000, open: '150', high: '152', low: '149', close: '151', volume: '100' },
        { ts_open: 1700086400000, open: '151', high: '154', low: '150', close: '153', volume: '200' }
      ]);
      repo.upsertOhlcvBars(asset.asset_id, '1d', bars, 'MASSIVE');

      const latest = repo.getLatestTsOpen(asset.asset_id, '1d');
      expect(latest).toBe(1700086400000);
    });
  });
});

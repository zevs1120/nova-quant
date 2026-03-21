import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { resetBinanceAccessBlockForTests, updateBinanceIncremental } from '../src/server/ingestion/binanceIncremental.js';
import { resetBinanceDerivativesBlockForTests, syncBinanceDerivatives } from '../src/server/ingestion/binanceDerivatives.js';

describe('updateBinanceIncremental', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetBinanceAccessBlockForTests();
    resetBinanceDerivativesBlockForTests();
  });

  it('backs off quietly when Binance futures REST returns 451', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    const fetchMock = vi.fn(async () => new Response('blocked', { status: 451 })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await updateBinanceIncremental({
      repo,
      symbols: ['BTCUSDT', 'ETHUSDT'],
      timeframes: ['1h']
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    await updateBinanceIncremental({
      repo,
      symbols: ['BTCUSDT', 'ETHUSDT'],
      timeframes: ['1h']
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('backs off quietly when Binance derivatives endpoints return 451', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    const fetchMock = vi.fn(async () => new Response('blocked', { status: 451 })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await syncBinanceDerivatives({
      repo,
      symbols: ['BTCUSDT', 'ETHUSDT']
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    await syncBinanceDerivatives({
      repo,
      symbols: ['BTCUSDT', 'ETHUSDT']
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

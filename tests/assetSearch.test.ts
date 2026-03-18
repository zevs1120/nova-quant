import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchAssets } from '../src/server/api/queries.js';

const originalFetch = globalThis.fetch;
const originalAlphaKey = process.env.ALPHA_VANTAGE_API_KEY;
const originalCoinGeckoKey = process.env.COINGECKO_DEMO_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalAlphaKey === undefined) delete process.env.ALPHA_VANTAGE_API_KEY;
  else process.env.ALPHA_VANTAGE_API_KEY = originalAlphaKey;
  if (originalCoinGeckoKey === undefined) delete process.env.COINGECKO_DEMO_API_KEY;
  else process.env.COINGECKO_DEMO_API_KEY = originalCoinGeckoKey;
  vi.restoreAllMocks();
});

describe('asset search providers', () => {
  it('falls back to the SEC ticker universe for stock search without a market-data key', async () => {
    delete process.env.ALPHA_VANTAGE_API_KEY;
    delete process.env.COINGECKO_DEMO_API_KEY;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('sec.gov/files/company_tickers.json');
      return {
        ok: true,
        async json() {
          return {
            0: {
              ticker: 'IONQ',
              title: 'IonQ, Inc.'
            }
          };
        }
      } as Response;
    }) as typeof fetch;

    const results = await searchAssets({
      query: 'ionq',
      market: 'US',
      limit: 10
    });

    expect(results.some((row) => row.symbol === 'IONQ' && row.source === 'remote')).toBe(true);
  });

  it('ranks company-name matches near the top', async () => {
    delete process.env.ALPHA_VANTAGE_API_KEY;
    delete process.env.COINGECKO_DEMO_API_KEY;

    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        async json() {
          return {
            0: {
              ticker: 'TSLA',
              title: 'Tesla, Inc.'
            },
            1: {
              ticker: 'TLSA',
              title: 'Tiziana Life Sciences Ltd'
            }
          };
        }
      } as Response;
    }) as typeof fetch;

    const results = await searchAssets({
      query: 'tesla',
      market: 'US',
      limit: 10
    });

    expect(results[0]?.symbol).toBe('TSLA');
  });

  it('includes remote equity results from Alpha Vantage', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-alpha';
    delete process.env.COINGECKO_DEMO_API_KEY;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('sec.gov/files/company_tickers.json')) {
        return {
          ok: true,
          async json() {
            return {};
          }
        } as Response;
      }
      expect(url).toContain('alphavantage.co/query');
      return {
        ok: true,
        async json() {
          return {
            bestMatches: [
              {
                '1. symbol': 'IONQ',
                '2. name': 'IonQ, Inc.',
                '3. type': 'Equity',
                '4. region': 'United States',
                '8. currency': 'USD'
              }
            ]
          };
        }
      } as Response;
    }) as typeof fetch;

    const results = await searchAssets({
      query: 'ionq',
      market: 'US',
      limit: 10
    });

    expect(results.some((row) => row.symbol === 'IONQ' && row.source === 'remote')).toBe(true);
  });

  it('includes remote crypto results from CoinGecko', async () => {
    delete process.env.ALPHA_VANTAGE_API_KEY;
    process.env.COINGECKO_DEMO_API_KEY = 'test-cg';

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('api.coingecko.com/api/v3/search');
      return {
        ok: true,
        async json() {
          return {
            coins: [
              {
                symbol: 'bonk',
                name: 'Bonk',
                market_cap_rank: 72
              }
            ]
          };
        }
      } as Response;
    }) as typeof fetch;

    const results = await searchAssets({
      query: 'bonk',
      market: 'CRYPTO',
      limit: 10
    });

    expect(results.some((row) => row.symbol === 'BONK' && row.source === 'remote')).toBe(true);
  });
});

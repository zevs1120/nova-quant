import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  importHoldingsFromCsvText,
  importHoldingsFromScreenshot,
} from '../src/server/holdings/import.js';

describe('holdings import', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('parses CSV holdings and derives market-value weights', () => {
    const result = importHoldingsFromCsvText({
      filename: 'positions.csv',
      csvText: `Symbol,Quantity,Avg Cost,Market Price
AAPL,10,100,120
BTC,0.5,60000,64000`,
    });

    expect(result.summary.imported_count).toBe(2);
    expect(result.holdings[0].source_kind).toBe('CSV');
    expect(result.holdings.map((row: { symbol: string }) => row.symbol)).toContain('AAPL');
    expect(result.holdings.map((row: { symbol: string }) => row.symbol)).toContain('BTC-USDT');
    const totalWeight = result.holdings.reduce(
      (sum: number, row: { weight_pct?: number | null }) => sum + Number(row.weight_pct || 0),
      0,
    );
    expect(totalWeight).toBeCloseTo(100, 2);
  });

  it('imports screenshot holdings through the vision parser when configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_MODEL', 'gpt-4o-mini');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  holdings: [
                    {
                      symbol: 'NVDA',
                      asset_class: 'US_STOCK',
                      market: 'US',
                      quantity: 5,
                      current_price: 900,
                      market_value: 4500,
                      cost_basis: 800,
                      import_confidence: 0.92,
                    },
                  ],
                  warnings: ['Double-check quantity.'],
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await importHoldingsFromScreenshot({
      imageDataUrl: 'data:image/png;base64,AAAA',
    });

    expect(result.summary.source).toBe('SCREENSHOT');
    expect(result.summary.imported_count).toBe(1);
    expect(result.holdings[0].symbol).toBe('NVDA');
    expect(result.holdings[0].source_kind).toBe('SCREENSHOT');
    expect(result.summary.warnings[0]).toContain('Double-check');
  });
});

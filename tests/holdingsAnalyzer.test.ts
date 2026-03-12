import { describe, expect, it } from 'vitest';
import { buildHoldingsReview } from '../src/research/holdingsAnalyzer.js';

describe('buildHoldingsReview', () => {
  it('computes market value and pnl amount when quantity and current price are available', () => {
    const review = buildHoldingsReview({
      holdings: [
        {
          symbol: 'AAPL',
          asset_class: 'US_STOCK',
          quantity: 10,
          cost_basis: 100,
          current_price_override: 110,
          weight_pct: 40
        },
        {
          symbol: 'BTC-USDT',
          asset_class: 'CRYPTO',
          quantity: 0.5,
          cost_basis: 60000,
          current_price_override: 63000,
          weight_pct: 60
        }
      ],
      state: {
        safety: { mode: 'normal risk' },
        layers: {
          data_layer: { instruments: [] },
          portfolio_layer: { candidates: [], filtered_out: [] }
        }
      }
    });

    expect(review.totals.total_market_value).toBe(32600);
    expect(review.totals.total_unrealized_pnl_amount).toBe(1600);
    expect(review.rows[0].market_value).toBeTruthy();
    expect(review.rows[0].pnl_amount).toBeTruthy();
  });
});

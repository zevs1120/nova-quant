import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import HoldingsTab from '../../src/components/HoldingsTab';

describe('HoldingsTab Component (Wallet-Like Card)', () => {
  const mockHoldingsReview = {
    totals: {
      total_market_value: 12500.5,
      total_unrealized_pnl_amount: 1200,
      estimated_unrealized_pnl_pct: 0.096,
    },
    rows: [
      {
        id: '1',
        symbol: 'AAPL',
        market_value: 8000,
        pnl_amount: 1000,
        pnl_pct: 0.125,
        system_status: 'aligned',
        quantity: 50,
      },
      {
        id: '2',
        symbol: 'TSLA',
        market_value: 4500.5,
        pnl_amount: 200,
        pnl_pct: 0.044,
        system_status: 'contradicted',
        quantity: 20,
      },
    ],
  };

  it('renders total balance and correct PnL formats safely', () => {
    const { container } = render(
      <HoldingsTab
        holdings={mockHoldingsReview.rows}
        holdingsReview={mockHoldingsReview}
        locale="en"
      />,
    );

    // Verify total balance string is present
    expect(container.textContent).toMatch(/12,500\.50/);
    // Verify formatting for positive PnL string
    expect(container.textContent).toMatch(/\+\$1,200\.00/);
    expect(container.textContent).toMatch(/\+9\.6\%/);

    // Verify symbols are mapped into the list
    expect(container.textContent).toMatch(/AAPL/);
    expect(container.textContent).toMatch(/TSLA/);

    // Check system status tags (aligned -> Favored, contradicted -> Reduce)
    expect(container.textContent).toMatch(/Favored/i);
    expect(container.textContent).toMatch(/Reduce/i);
  });
});

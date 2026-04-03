import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SignalCard from '../../src/components/SignalCard';

describe('SignalCard Component', () => {
  const mockSignal = {
    id: 'mock-signal-1',
    symbol: 'AAPL',
    direction: 'LONG',
    entry_min: 150,
    entry_max: 155,
    stop_loss: 140,
    take_profit: 200,
    valid_until_at: new Date(Date.now() + 86400000).toISOString(),
  };

  it('renders symbol and direction safely', () => {
    const defaultT = (key, _, defaultText) => defaultText || key;
    const { container } = render(<SignalCard signal={mockSignal} t={defaultT} locale="en" />);
    // Just verify the basic dom elements exist and it doesn't crash
    expect(container.textContent).toMatch(/AAPL/);
    expect(container.textContent).toMatch(/LONG|Buy/i);
  });
});

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TradeTicketSheet from '../../src/components/TradeTicketSheet';

describe('TradeTicketSheet Component', () => {
  const signal = { symbol: 'NVDA' };

  it('renders copy-ticket mode when broker handoff is unavailable', () => {
    const intent = {
      symbol: 'NVDA',
      orderType: 'LIMIT',
      side: 'BUY',
      canOpenBroker: false,
      targets: [],
      checklist: [],
    };
    const { container } = render(
      <TradeTicketSheet open={true} signal={signal} intent={intent} locale="en" />,
    );
    // Should fallback to copy mode
    expect(container.textContent).toMatch(/Copy ticket/i);
  });

  it('renders handoff workflow when broker integration is verified', () => {
    const intent = {
      symbol: 'NVDA',
      orderType: 'MARKET',
      side: 'SELL',
      canOpenBroker: true,
      targets: [],
      checklist: [],
    };
    const { container } = render(
      <TradeTicketSheet open={true} signal={signal} intent={intent} locale="en" />,
    );
    // Broker block should appear
    expect(container.textContent).toMatch(/Broker handoff/i);
  });
});

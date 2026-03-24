import { describe, expect, it } from 'vitest';
import { buildTradeIntent } from '../src/utils/tradeIntent.js';

describe('tradeIntent broker handoff', () => {
  it('uses Robinhood stock universal links for US equities', () => {
    const intent = buildTradeIntent(
      {
        symbol: 'AAPL',
        market: 'US',
        direction: 'LONG',
        entry_zone: { low: 195, high: 197 },
        take_profit_levels: [{ price: 205 }],
        stop_loss: { price: 191 }
      },
      { broker: 'Robinhood' }
    );

    expect(intent.canOpenBroker).toBe(true);
    expect(intent.brokerHandoffUrl).toBe('https://robinhood.com/stocks/AAPL');
    expect(intent.handoffOpensAppIfInstalled).toBe(true);
  });

  it('uses Robinhood crypto universal links for crypto assets', () => {
    const intent = buildTradeIntent(
      {
        symbol: 'BTC-USD',
        market: 'CRYPTO',
        asset_class: 'CRYPTO',
        direction: 'LONG',
        entry_zone: { low: 62000, high: 62500 },
        take_profit_levels: [{ price: 65000 }],
        stop_loss: { price: 60000 }
      },
      { broker: 'Robinhood' }
    );

    expect(intent.canOpenBroker).toBe(true);
    expect(intent.brokerHandoffUrl).toBe('https://robinhood.com/crypto/BTC');
    expect(intent.handoffOpensAppIfInstalled).toBe(true);
  });

  it('falls back to Robinhood handoff when the saved broker has no deeplink template', () => {
    const intent = buildTradeIntent(
      {
        symbol: 'NVDA',
        market: 'US',
        asset_class: 'US_STOCK',
        direction: 'SHORT',
        entry_zone: { low: 175, high: 176 },
        take_profit_levels: [{ price: 164 }],
        stop_loss: { price: 182 }
      },
      { broker: 'Webull' }
    );

    expect(intent.canOpenBroker).toBe(true);
    expect(intent.handoffBrokerLabel).toBe('Robinhood');
    expect(intent.brokerHandoffUrl).toBe('https://robinhood.com/stocks/NVDA');
  });
});

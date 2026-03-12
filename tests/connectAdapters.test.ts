import { describe, expect, it } from 'vitest';
import { createBrokerAdapter, createExchangeAdapter } from '../src/server/connect/adapters.js';

describe('connection adapters default honesty mode', () => {
  it('returns disconnected null-state for broker when credentials are absent', async () => {
    process.env.ALPACA_API_KEY = '';
    process.env.ALPACA_API_SECRET = '';
    const adapter = createBrokerAdapter('ALPACA');
    const snapshot = await adapter.fetchSnapshot();

    expect(snapshot.status).toBe('DISCONNECTED');
    expect(snapshot.reason_code).toBe('NO_CREDENTIALS');
    expect(snapshot.source_status).toBe('DISCONNECTED');
    expect(snapshot.data_status).toBe('NO_CREDENTIALS');
    expect(snapshot.source_label).toBe('NO_CREDENTIALS');
    expect(snapshot.buying_power).toBeNull();
    expect(snapshot.cash).toBeNull();
    expect(snapshot.positions).toHaveLength(0);
    expect(snapshot.can_trade).toBe(false);
  });

  it('returns disconnected null-state for exchange when credentials are absent', async () => {
    process.env.BINANCE_API_KEY = '';
    process.env.BINANCE_API_SECRET = '';
    const adapter = createExchangeAdapter('BINANCE');
    const snapshot = await adapter.fetchSnapshot();

    expect(snapshot.status).toBe('DISCONNECTED');
    expect(snapshot.reason_code).toBe('NO_CREDENTIALS');
    expect(snapshot.source_status).toBe('DISCONNECTED');
    expect(snapshot.data_status).toBe('NO_CREDENTIALS');
    expect(snapshot.source_label).toBe('NO_CREDENTIALS');
    expect(snapshot.balances).toHaveLength(0);
    expect(snapshot.positions).toHaveLength(0);
    expect(snapshot.can_trade).toBe(false);
  });
});

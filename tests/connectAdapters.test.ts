import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrokerAdapter, createExchangeAdapter } from '../src/server/connect/adapters.js';

describe('connection adapters default honesty mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NOVA_ENABLE_ORDER_ROUTING = '';
    process.env.NOVA_ENABLE_ALPACA_TRADING = '';
    process.env.NOVA_ENABLE_BINANCE_TRADING = '';
    process.env.ALPACA_API_KEY = '';
    process.env.ALPACA_API_SECRET = '';
    process.env.BINANCE_API_KEY = '';
    process.env.BINANCE_API_SECRET = '';
  });

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

  it('submits an Alpaca order when routing is enabled', async () => {
    process.env.ALPACA_API_KEY = 'key';
    process.env.ALPACA_API_SECRET = 'secret';
    process.env.NOVA_ENABLE_ALPACA_TRADING = '1';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'ord_123',
          client_order_id: 'client_123',
          symbol: 'SPY',
          side: 'buy',
          type: 'limit',
          time_in_force: 'day',
          status: 'new',
          qty: '1',
          filled_qty: '0',
          notional: null,
          limit_price: '500',
          submitted_at: '2026-03-21T00:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ) as never,
    );

    const adapter = createBrokerAdapter('ALPACA');
    const order = await adapter.submitOrder?.({
      symbol: 'SPY',
      side: 'BUY',
      type: 'LIMIT',
      qty: 1,
      limit_price: 500,
      time_in_force: 'DAY',
    });

    expect(order?.order_id).toBe('ord_123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(String(init?.method || 'GET')).toBe('POST');
  });

  it('submits a Binance spot order when routing is enabled', async () => {
    process.env.BINANCE_API_KEY = 'key';
    process.env.BINANCE_API_SECRET = 'secret';
    process.env.NOVA_ENABLE_BINANCE_TRADING = '1';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          symbol: 'BTCUSDT',
          orderId: 99,
          clientOrderId: 'client_456',
          price: '50000',
          origQty: '0.01',
          executedQty: '0',
          cummulativeQuoteQty: '0',
          status: 'NEW',
          timeInForce: 'GTC',
          type: 'LIMIT',
          side: 'BUY',
          transactTime: Date.UTC(2026, 2, 21),
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ) as never,
    );

    const adapter = createExchangeAdapter('BINANCE');
    const order = await adapter.submitOrder?.({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'LIMIT',
      qty: 0.01,
      limit_price: 50_000,
      time_in_force: 'GTC',
    });

    expect(order?.order_id).toBe('99');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/api/v3/order?');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBrokerAdapter,
  createExchangeAdapter
} from '../src/server/connect/adapters.js';

/* ---------- credential / config detection ---------- */

describe('broker adapter — credential checks', () => {
  beforeEach(() => {
    vi.stubEnv('ALPACA_API_KEY', '');
    vi.stubEnv('ALPACA_API_SECRET', '');
    vi.stubEnv('APCA_API_KEY_ID', '');
    vi.stubEnv('APCA_API_SECRET_KEY', '');
    vi.stubEnv('BINANCE_API_KEY', '');
    vi.stubEnv('BINANCE_API_SECRET', '');
    vi.stubEnv('NOVA_ENABLE_ORDER_ROUTING', '');
    vi.stubEnv('NOVA_ENABLE_LIVE_EXECUTION', '');
    vi.stubEnv('NOVA_ENABLE_TRADING', '');
    vi.stubEnv('NOVA_ENABLE_ALPACA_TRADING', '');
    vi.stubEnv('NOVA_ENABLE_BINANCE_TRADING', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns DISCONNECTED with NO_CREDENTIALS for Alpaca when keys missing', async () => {
    const adapter = createBrokerAdapter('ALPACA');
    const snap = await adapter.fetchSnapshot();
    expect(snap.status).toBe('DISCONNECTED');
    expect(snap.reason_code).toBe('NO_CREDENTIALS');
    expect(snap.can_read_positions).toBe(false);
    expect(snap.can_trade).toBe(false);
    expect(snap.positions).toEqual([]);
  });

  it('returns DISCONNECTED for unsupported broker provider', async () => {
    const adapter = createBrokerAdapter('SCHWAB');
    const snap = await adapter.fetchSnapshot();
    expect(snap.status).toBe('DISCONNECTED');
    expect(snap.reason_code).toBe('UNSUPPORTED_PROVIDER');
  });

  it('provider name is normalized to uppercase', async () => {
    const adapter = createBrokerAdapter('alpaca');
    const snap = await adapter.fetchSnapshot();
    expect(snap.provider).toBe('ALPACA');
  });
});

describe('exchange adapter — credential checks', () => {
  beforeEach(() => {
    vi.stubEnv('ALPACA_API_KEY', '');
    vi.stubEnv('ALPACA_API_SECRET', '');
    vi.stubEnv('BINANCE_API_KEY', '');
    vi.stubEnv('BINANCE_API_SECRET', '');
    vi.stubEnv('NOVA_ENABLE_ORDER_ROUTING', '');
    vi.stubEnv('NOVA_ENABLE_TRADING', '');
    vi.stubEnv('NOVA_ENABLE_BINANCE_TRADING', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns DISCONNECTED with NO_CREDENTIALS for Binance when keys missing', async () => {
    const adapter = createExchangeAdapter('BINANCE');
    const snap = await adapter.fetchSnapshot();
    expect(snap.status).toBe('DISCONNECTED');
    expect(snap.reason_code).toBe('NO_CREDENTIALS');
    expect(snap.can_read_positions).toBe(false);
    expect(snap.balances).toEqual([]);
    expect(snap.positions).toEqual([]);
  });

  it('returns DISCONNECTED for unsupported exchange provider', async () => {
    const adapter = createExchangeAdapter('BYBIT');
    const snap = await adapter.fetchSnapshot();
    expect(snap.status).toBe('DISCONNECTED');
    expect(snap.reason_code).toBe('UNSUPPORTED_PROVIDER');
  });
});

/* ---------- trading flag checks ---------- */

describe('adapter — trading flags', () => {
  beforeEach(() => {
    vi.stubEnv('ALPACA_API_KEY', '');
    vi.stubEnv('ALPACA_API_SECRET', '');
    vi.stubEnv('BINANCE_API_KEY', '');
    vi.stubEnv('BINANCE_API_SECRET', '');
    vi.stubEnv('NOVA_ENABLE_ORDER_ROUTING', '');
    vi.stubEnv('NOVA_ENABLE_LIVE_EXECUTION', '');
    vi.stubEnv('NOVA_ENABLE_TRADING', '');
    vi.stubEnv('NOVA_ENABLE_ALPACA_TRADING', '');
    vi.stubEnv('NOVA_ENABLE_BINANCE_TRADING', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('Alpaca submitOrder throws when trading disabled and no credentials', async () => {
    const adapter = createBrokerAdapter('ALPACA');
    await expect(
      adapter.submitOrder!({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        qty: 10,
        limit_price: 180
      })
    ).rejects.toThrow(/credentials|configured/i);
  });

  it('Binance submitOrder throws when trading disabled', async () => {
    const adapter = createExchangeAdapter('BINANCE');
    await expect(
      adapter.submitOrder!({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        qty: 0.01
      })
    ).rejects.toThrow(/credentials|configured/i);
  });

  it('getOrder throws when orderId and clientOrderId both missing', async () => {
    vi.stubEnv('ALPACA_API_KEY', 'test-key');
    vi.stubEnv('ALPACA_API_SECRET', 'test-secret');
    vi.stubEnv('NOVA_ENABLE_ORDER_ROUTING', '1');
    const adapter = createBrokerAdapter('ALPACA');
    await expect(adapter.getOrder!({})).rejects.toThrow(/orderId or clientOrderId/i);
  });

  it('cancelOrder throws when orderId missing for Alpaca', async () => {
    vi.stubEnv('ALPACA_API_KEY', 'test-key');
    vi.stubEnv('ALPACA_API_SECRET', 'test-secret');
    vi.stubEnv('NOVA_ENABLE_ORDER_ROUTING', '1');
    const adapter = createBrokerAdapter('ALPACA');
    await expect(adapter.cancelOrder!({})).rejects.toThrow(/orderId is required/i);
  });
});

/* ---------- snapshot contract ---------- */

describe('adapter — snapshot structure', () => {
  beforeEach(() => {
    vi.stubEnv('ALPACA_API_KEY', '');
    vi.stubEnv('ALPACA_API_SECRET', '');
    vi.stubEnv('BINANCE_API_KEY', '');
    vi.stubEnv('BINANCE_API_SECRET', '');
    vi.stubEnv('NOVA_ENABLE_ORDER_ROUTING', '');
    vi.stubEnv('NOVA_ENABLE_TRADING', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('broker snapshot has all required fields', async () => {
    const adapter = createBrokerAdapter('ALPACA');
    const snap = await adapter.fetchSnapshot();
    expect(snap.provider).toBe('ALPACA');
    expect(snap.mode).toBeTruthy();
    expect(snap.status).toBeTruthy();
    expect(snap.source_status).toBeTruthy();
    expect(snap.data_status).toBeTruthy();
    expect(snap.reason_code).toBeTruthy();
    expect(snap.last_checked_at).toBeTruthy();
    expect(typeof snap.can_read_positions).toBe('boolean');
    expect(typeof snap.can_trade).toBe('boolean');
    expect(Array.isArray(snap.positions)).toBe(true);
  });

  it('exchange snapshot has all required fields', async () => {
    const adapter = createExchangeAdapter('BINANCE');
    const snap = await adapter.fetchSnapshot();
    expect(snap.provider).toBe('BINANCE');
    expect(snap.mode).toBeTruthy();
    expect(snap.status).toBeTruthy();
    expect(snap.source_status).toBeTruthy();
    expect(Array.isArray(snap.balances)).toBe(true);
    expect(Array.isArray(snap.positions)).toBe(true);
  });

  it('disconnected snapshot timestamps are valid ISO strings', async () => {
    const adapter = createBrokerAdapter('ALPACA');
    const snap = await adapter.fetchSnapshot();
    expect(Date.parse(snap.last_checked_at)).toBeGreaterThan(0);
  });
});

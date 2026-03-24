import { createHmac } from 'node:crypto';
import { RUNTIME_STATUS, type RuntimeStatus } from '../runtimeStatus.js';
import { fetchWithRetry } from '../utils/http.js';

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED';
export type ConnectionReason =
  | 'NO_CREDENTIALS'
  | 'NOT_CONFIGURED'
  | 'READ_ONLY_UNAVAILABLE'
  | 'UNSUPPORTED_PROVIDER'
  | 'PROVIDER_ERROR';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderTimeInForce = 'DAY' | 'GTC' | 'IOC' | 'FOK';

interface SnapshotBase {
  provider: string;
  mode: 'READ_ONLY' | 'TRADING';
  status: ConnectionStatus;
  source_status: RuntimeStatus;
  data_status: RuntimeStatus;
  source_label: RuntimeStatus;
  reason_code: ConnectionReason;
  message: string;
  last_checked_at: string;
  can_read_positions: boolean;
  can_trade: boolean;
}

export interface BrokerSnapshot extends SnapshotBase {
  buying_power: number | null;
  cash: number | null;
  positions: Array<{
    symbol: string;
    qty: number;
    market_value: number;
    current_price?: number | null;
    avg_entry_price?: number | null;
    unrealized_pnl?: number | null;
  }>;
}

export interface ExchangeSnapshot extends SnapshotBase {
  balances: Array<{
    asset: string;
    free: number;
    locked: number;
    total?: number;
    mark_price?: number | null;
    market_value?: number | null;
  }>;
  positions: Array<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entry: number;
    unrealized_pnl: number;
  }>;
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type?: OrderType;
  qty?: number | null;
  notional?: number | null;
  limit_price?: number | null;
  time_in_force?: OrderTimeInForce;
  client_order_id?: string | null;
}

export interface OrderStatusSnapshot {
  provider: string;
  order_id: string;
  client_order_id: string | null;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  time_in_force: string | null;
  status: string;
  qty: number | null;
  notional: number | null;
  limit_price: number | null;
  filled_qty: number | null;
  filled_avg_price: number | null;
  submitted_at: string | null;
  raw: Record<string, unknown> | null;
}

export interface BrokerAdapter {
  provider: string;
  fetchSnapshot(): Promise<BrokerSnapshot>;
  submitOrder?(order: OrderRequest): Promise<OrderStatusSnapshot>;
  getOrder?(args: { orderId?: string; clientOrderId?: string; symbol?: string }): Promise<OrderStatusSnapshot>;
  cancelOrder?(args: { orderId?: string; clientOrderId?: string; symbol?: string }): Promise<OrderStatusSnapshot>;
}

export interface ExchangeAdapter {
  provider: string;
  fetchSnapshot(): Promise<ExchangeSnapshot>;
  submitOrder?(order: OrderRequest): Promise<OrderStatusSnapshot>;
  getOrder?(args: { orderId?: string; clientOrderId?: string; symbol?: string }): Promise<OrderStatusSnapshot>;
  cancelOrder?(args: { orderId?: string; clientOrderId?: string; symbol?: string }): Promise<OrderStatusSnapshot>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveAlpacaCredentials() {
  return {
    apiKey: String(process.env.ALPACA_API_KEY || process.env.APCA_API_KEY_ID || '').trim(),
    apiSecret: String(process.env.ALPACA_API_SECRET || process.env.APCA_API_SECRET_KEY || '').trim(),
    baseUrl: String(process.env.ALPACA_API_BASE_URL || 'https://paper-api.alpaca.markets').trim().replace(/\/+$/, '')
  };
}

function resolveBinanceCredentials() {
  return {
    apiKey: String(process.env.BINANCE_API_KEY || '').trim(),
    apiSecret: String(process.env.BINANCE_API_SECRET || '').trim(),
    baseUrl: String(process.env.BINANCE_API_BASE_URL || 'https://api.binance.com').trim().replace(/\/+$/, '')
  };
}

function isConfigured(provider: string): boolean {
  const p = String(provider || '').toUpperCase();
  if (p === 'ALPACA') {
    const credentials = resolveAlpacaCredentials();
    return Boolean(credentials.apiKey && credentials.apiSecret);
  }
  if (p === 'BINANCE') {
    const credentials = resolveBinanceCredentials();
    return Boolean(credentials.apiKey && credentials.apiSecret);
  }
  return false;
}

function tradingEnabled(provider: string): boolean {
  const globalEnabled =
    process.env.NOVA_ENABLE_ORDER_ROUTING === '1' ||
    process.env.NOVA_ENABLE_LIVE_EXECUTION === '1' ||
    process.env.NOVA_ENABLE_TRADING === '1';
  const p = String(provider || '').toUpperCase();
  if (p === 'ALPACA') {
    return globalEnabled || process.env.NOVA_ENABLE_ALPACA_TRADING === '1';
  }
  if (p === 'BINANCE') {
    return globalEnabled || process.env.NOVA_ENABLE_BINANCE_TRADING === '1';
  }
  return false;
}

function providerMode(provider: string): 'READ_ONLY' | 'TRADING' {
  return tradingEnabled(provider) ? 'TRADING' : 'READ_ONLY';
}

function missingCredentialMessage(provider: string) {
  const p = String(provider || '').toUpperCase();
  if (p === 'ALPACA') {
    return 'Alpaca credentials are not configured. Set ALPACA_API_KEY/APCA_API_KEY_ID and ALPACA_API_SECRET/APCA_API_SECRET_KEY.';
  }
  if (p === 'BINANCE') {
    return 'Binance credentials are not configured. Set BINANCE_API_KEY and BINANCE_API_SECRET.';
  }
  return `${p || 'Provider'} credentials are not configured.`;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value: number | null | undefined, digits = 8): string | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return numeric.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
}

function ensureTradingEnabled(provider: string) {
  if (!isConfigured(provider)) {
    throw new Error(missingCredentialMessage(provider));
  }
  if (!tradingEnabled(provider)) {
    throw new Error(`${provider} trading is disabled. Set NOVA_ENABLE_ORDER_ROUTING=1 or the provider-specific trading flag.`);
  }
}

async function readJsonOrError<T>(response: Response): Promise<{ ok: true; data: T } | { ok: false; detail: string }> {
  if (response.ok) {
    return { ok: true, data: (await response.json()) as T };
  }
  const text = await response.text().catch(() => '');
  return {
    ok: false,
    detail: `HTTP ${response.status}${text ? ` ${text.slice(0, 240)}` : ''}`
  };
}

function providerErrorBroker(provider: string, detail: string): BrokerSnapshot {
  return {
    provider,
    mode: 'READ_ONLY',
    status: 'DISCONNECTED',
    source_status: RUNTIME_STATUS.DISCONNECTED,
    data_status: RUNTIME_STATUS.DISCONNECTED,
    source_label: RUNTIME_STATUS.DISCONNECTED,
    reason_code: 'PROVIDER_ERROR',
    message: detail,
    last_checked_at: nowIso(),
    can_read_positions: false,
    can_trade: false,
    buying_power: null,
    cash: null,
    positions: []
  };
}

function providerErrorExchange(provider: string, detail: string): ExchangeSnapshot {
  return {
    provider,
    mode: 'READ_ONLY',
    status: 'DISCONNECTED',
    source_status: RUNTIME_STATUS.DISCONNECTED,
    data_status: RUNTIME_STATUS.DISCONNECTED,
    source_label: RUNTIME_STATUS.DISCONNECTED,
    reason_code: 'PROVIDER_ERROR',
    message: detail,
    last_checked_at: nowIso(),
    can_read_positions: false,
    can_trade: false,
    balances: [],
    positions: []
  };
}

function binanceSignature(secret: string, query: URLSearchParams): string {
  return createHmac('sha256', secret).update(query.toString()).digest('hex');
}

function signBinanceQuery(secret: string, query: URLSearchParams) {
  query.set('signature', binanceSignature(secret, query));
  return query;
}

function disconnectedBroker(provider: string, reasonCode: ConnectionReason, message: string): BrokerSnapshot {
  const dataStatus = reasonCode === 'NO_CREDENTIALS' ? RUNTIME_STATUS.NO_CREDENTIALS : RUNTIME_STATUS.DISCONNECTED;
  return {
    provider,
    mode: 'READ_ONLY',
    status: 'DISCONNECTED',
    source_status: RUNTIME_STATUS.DISCONNECTED,
    data_status: dataStatus,
    source_label: dataStatus,
    reason_code: reasonCode,
    message,
    last_checked_at: nowIso(),
    can_read_positions: false,
    can_trade: false,
    buying_power: null,
    cash: null,
    positions: []
  };
}

function disconnectedExchange(provider: string, reasonCode: ConnectionReason, message: string): ExchangeSnapshot {
  const dataStatus = reasonCode === 'NO_CREDENTIALS' ? RUNTIME_STATUS.NO_CREDENTIALS : RUNTIME_STATUS.DISCONNECTED;
  return {
    provider,
    mode: 'READ_ONLY',
    status: 'DISCONNECTED',
    source_status: RUNTIME_STATUS.DISCONNECTED,
    data_status: dataStatus,
    source_label: dataStatus,
    reason_code: reasonCode,
    message,
    last_checked_at: nowIso(),
    can_read_positions: false,
    can_trade: false,
    balances: [],
    positions: []
  };
}

function parseAlpacaOrder(provider: string, data: Record<string, unknown>): OrderStatusSnapshot {
  return {
    provider,
    order_id: String(data.id || ''),
    client_order_id: data.client_order_id ? String(data.client_order_id) : null,
    symbol: String(data.symbol || '').toUpperCase(),
    side: String(data.side || 'buy').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    type: String(data.type || 'market').toUpperCase() === 'LIMIT' ? 'LIMIT' : 'MARKET',
    time_in_force: data.time_in_force ? String(data.time_in_force).toUpperCase() : null,
    status: String(data.status || 'UNKNOWN'),
    qty: toNumber(data.qty),
    notional: toNumber(data.notional),
    limit_price: toNumber(data.limit_price),
    filled_qty: toNumber(data.filled_qty),
    filled_avg_price: toNumber(data.filled_avg_price),
    submitted_at: data.submitted_at ? String(data.submitted_at) : null,
    raw: data
  };
}

function parseBinanceOrder(provider: string, data: Record<string, unknown>): OrderStatusSnapshot {
  const filledQty = toNumber(data.executedQty);
  const cumulativeQuoteQty = toNumber(data.cummulativeQuoteQty);
  return {
    provider,
    order_id: String(data.orderId || ''),
    client_order_id: data.clientOrderId ? String(data.clientOrderId) : null,
    symbol: String(data.symbol || '').toUpperCase(),
    side: String(data.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    type: String(data.type || 'MARKET').toUpperCase() === 'LIMIT' ? 'LIMIT' : 'MARKET',
    time_in_force: data.timeInForce ? String(data.timeInForce).toUpperCase() : null,
    status: String(data.status || 'UNKNOWN'),
    qty: toNumber(data.origQty),
    notional: cumulativeQuoteQty,
    limit_price: toNumber(data.price),
    filled_qty: filledQty,
    filled_avg_price: filledQty && cumulativeQuoteQty ? cumulativeQuoteQty / filledQty : toNumber(data.price),
    submitted_at: data.transactTime ? new Date(Number(data.transactTime)).toISOString() : null,
    raw: data
  };
}

class HonestBrokerAdapter implements BrokerAdapter {
  constructor(public provider: string) {}

  async fetchSnapshot(): Promise<BrokerSnapshot> {
    const provider = String(this.provider || '').toUpperCase();
    if (provider !== 'ALPACA') {
      return disconnectedBroker(provider, 'UNSUPPORTED_PROVIDER', 'Broker provider is not supported in this build.');
    }
    if (!isConfigured(provider)) {
      return disconnectedBroker(provider, 'NO_CREDENTIALS', missingCredentialMessage(provider));
    }
    const credentials = resolveAlpacaCredentials();
    const headers = {
      accept: 'application/json',
      'APCA-API-KEY-ID': credentials.apiKey,
      'APCA-API-SECRET-KEY': credentials.apiSecret
    };
    try {
      const [accountRes, positionsRes] = await Promise.all([
        fetchWithRetry(`${credentials.baseUrl}/v2/account`, { headers }, { attempts: 2, baseDelayMs: 400 }, 12_000),
        fetchWithRetry(`${credentials.baseUrl}/v2/positions`, { headers }, { attempts: 2, baseDelayMs: 400 }, 12_000)
      ]);
      const account = await readJsonOrError<Record<string, unknown>>(accountRes);
      if (!account.ok) {
        return providerErrorBroker(provider, `Alpaca account fetch failed. ${account.detail}`);
      }
      const positions = await readJsonOrError<Array<Record<string, unknown>>>(positionsRes);
      if (!positions.ok) {
        return providerErrorBroker(provider, `Alpaca positions fetch failed. ${positions.detail}`);
      }
      const mode = providerMode(provider);
      return {
        provider,
        mode,
        status: 'CONNECTED',
        source_status: RUNTIME_STATUS.REALIZED,
        data_status: RUNTIME_STATUS.REALIZED,
        source_label: RUNTIME_STATUS.REALIZED,
        reason_code: 'NOT_CONFIGURED',
        message: positions.data.length
          ? mode === 'TRADING'
            ? 'Live Alpaca account connected with order routing enabled.'
            : 'Live Alpaca positions loaded in read-only mode.'
          : mode === 'TRADING'
            ? 'Live Alpaca account connected with order routing enabled. No open positions were reported.'
            : 'Live Alpaca account connected. No open positions were reported.',
        last_checked_at: nowIso(),
        can_read_positions: true,
        can_trade: mode === 'TRADING',
        buying_power: toNumber(account.data.buying_power),
        cash: toNumber(account.data.cash),
        positions: positions.data
          .map((row) => ({
            symbol: String(row.symbol || '').toUpperCase(),
            qty: toNumber(row.qty) ?? 0,
            market_value: toNumber(row.market_value) ?? 0,
            current_price: toNumber(row.current_price),
            avg_entry_price: toNumber(row.avg_entry_price),
            unrealized_pnl: toNumber(row.unrealized_pl)
          }))
          .filter((row) => row.symbol && row.qty > 0)
      };
    } catch (error) {
      return providerErrorBroker(provider, error instanceof Error ? error.message : String(error));
    }
  }

  async submitOrder(order: OrderRequest): Promise<OrderStatusSnapshot> {
    const provider = String(this.provider || '').toUpperCase();
    if (provider !== 'ALPACA') {
      throw new Error(`Broker provider ${provider} is not supported for order routing.`);
    }
    ensureTradingEnabled(provider);
    const credentials = resolveAlpacaCredentials();
    const payload: Record<string, string | number | boolean> = {
      symbol: String(order.symbol || '').trim().toUpperCase(),
      side: String(order.side || 'BUY').toLowerCase(),
      type: String(order.type || 'LIMIT').toLowerCase(),
      time_in_force: String(order.time_in_force || 'DAY').toLowerCase(),
      client_order_id: String(order.client_order_id || `nq_${Date.now()}`)
    };
    if (!payload.symbol) throw new Error('symbol is required.');
    if (Number.isFinite(Number(order.qty))) payload.qty = Number(order.qty);
    if (Number.isFinite(Number(order.notional))) payload.notional = Number(order.notional);
    if (!('qty' in payload) && !('notional' in payload)) {
      throw new Error('qty or notional is required for Alpaca order routing.');
    }
    if (String(payload.type).toUpperCase() === 'LIMIT') {
      if (!Number.isFinite(Number(order.limit_price))) {
        throw new Error('limit_price is required for limit orders.');
      }
      payload.limit_price = Number(order.limit_price);
    }

    const response = await fetchWithRetry(
      `${credentials.baseUrl}/v2/orders`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'APCA-API-KEY-ID': credentials.apiKey,
          'APCA-API-SECRET-KEY': credentials.apiSecret
        },
        body: JSON.stringify(payload)
      },
      { attempts: 2, baseDelayMs: 400 },
      12_000
    );
    const parsed = await readJsonOrError<Record<string, unknown>>(response);
    if (!parsed.ok) {
      throw new Error(`Alpaca order submit failed. ${parsed.detail}`);
    }
    return parseAlpacaOrder(provider, parsed.data);
  }

  async getOrder(args: { orderId?: string; clientOrderId?: string }): Promise<OrderStatusSnapshot> {
    const provider = String(this.provider || '').toUpperCase();
    if (provider !== 'ALPACA') {
      throw new Error(`Broker provider ${provider} is not supported for order routing.`);
    }
    ensureTradingEnabled(provider);
    const credentials = resolveAlpacaCredentials();
    const orderId = String(args.orderId || '').trim();
    const clientOrderId = String(args.clientOrderId || '').trim();
    if (!orderId && !clientOrderId) {
      throw new Error('orderId or clientOrderId is required.');
    }
    const path = orderId
      ? `/v2/orders/${encodeURIComponent(orderId)}`
      : `/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`;
    const response = await fetchWithRetry(
      `${credentials.baseUrl}${path}`,
      {
        headers: {
          accept: 'application/json',
          'APCA-API-KEY-ID': credentials.apiKey,
          'APCA-API-SECRET-KEY': credentials.apiSecret
        }
      },
      { attempts: 2, baseDelayMs: 400 },
      12_000
    );
    const parsed = await readJsonOrError<Record<string, unknown>>(response);
    if (!parsed.ok) {
      throw new Error(`Alpaca order lookup failed. ${parsed.detail}`);
    }
    return parseAlpacaOrder(provider, parsed.data);
  }

  async cancelOrder(args: { orderId?: string; clientOrderId?: string }): Promise<OrderStatusSnapshot> {
    const provider = String(this.provider || '').toUpperCase();
    if (provider !== 'ALPACA') {
      throw new Error(`Broker provider ${provider} is not supported for order routing.`);
    }
    ensureTradingEnabled(provider);
    const credentials = resolveAlpacaCredentials();
    const orderId = String(args.orderId || '').trim();
    if (!orderId) {
      throw new Error('orderId is required to cancel an Alpaca order.');
    }
    const response = await fetchWithRetry(
      `${credentials.baseUrl}/v2/orders/${encodeURIComponent(orderId)}`,
      {
        method: 'DELETE',
        headers: {
          accept: 'application/json',
          'APCA-API-KEY-ID': credentials.apiKey,
          'APCA-API-SECRET-KEY': credentials.apiSecret
        }
      },
      { attempts: 2, baseDelayMs: 400 },
      12_000
    );
    if (response.status === 204) {
      return {
        provider,
        order_id: orderId,
        client_order_id: args.clientOrderId ? String(args.clientOrderId) : null,
        symbol: '',
        side: 'BUY',
        type: 'MARKET',
        time_in_force: null,
        status: 'CANCELLED',
        qty: null,
        notional: null,
        limit_price: null,
        filled_qty: null,
        filled_avg_price: null,
        submitted_at: null,
        raw: null
      };
    }
    const parsed = await readJsonOrError<Record<string, unknown>>(response);
    if (!parsed.ok) {
      throw new Error(`Alpaca order cancel failed. ${parsed.detail}`);
    }
    return parseAlpacaOrder(provider, parsed.data);
  }
}

class HonestExchangeAdapter implements ExchangeAdapter {
  constructor(public provider: string) {}

  async fetchSnapshot(): Promise<ExchangeSnapshot> {
    const provider = String(this.provider || '').toUpperCase();
    if (provider !== 'BINANCE') {
      return disconnectedExchange(provider, 'UNSUPPORTED_PROVIDER', 'Exchange provider is not supported in this build.');
    }
    if (!isConfigured(provider)) {
      return disconnectedExchange(provider, 'NO_CREDENTIALS', missingCredentialMessage(provider));
    }
    const credentials = resolveBinanceCredentials();
    const query = signBinanceQuery(
      credentials.apiSecret,
      new URLSearchParams({
        timestamp: String(Date.now()),
        recvWindow: '5000'
      })
    );
    try {
      const response = await fetchWithRetry(
        `${credentials.baseUrl}/api/v3/account?${query.toString()}`,
        {
          headers: {
            'X-MBX-APIKEY': credentials.apiKey
          }
        },
        { attempts: 2, baseDelayMs: 400 },
        12_000
      );
      const account = await readJsonOrError<{ balances?: Array<Record<string, unknown>> }>(response);
      if (!account.ok) {
        return providerErrorExchange(provider, `Binance account fetch failed. ${account.detail}`);
      }
      const balances = (account.data.balances || [])
        .map((row) => {
          const free = toNumber(row.free) ?? 0;
          const locked = toNumber(row.locked) ?? 0;
          return {
            asset: String(row.asset || '').toUpperCase(),
            free,
            locked,
            total: free + locked
          };
        })
        .filter((row) => row.asset && row.total > 0);

      const mode = providerMode(provider);
      return {
        provider,
        mode,
        status: 'CONNECTED',
        source_status: RUNTIME_STATUS.REALIZED,
        data_status: RUNTIME_STATUS.REALIZED,
        source_label: RUNTIME_STATUS.REALIZED,
        reason_code: 'NOT_CONFIGURED',
        message: balances.length
          ? mode === 'TRADING'
            ? 'Live Binance account connected with spot order routing enabled.'
            : 'Live Binance balances loaded in read-only mode.'
          : mode === 'TRADING'
            ? 'Live Binance account connected with spot order routing enabled. No non-zero balances were reported.'
            : 'Live Binance account connected. No non-zero balances were reported.',
        last_checked_at: nowIso(),
        can_read_positions: true,
        can_trade: mode === 'TRADING',
        balances,
        positions: []
      };
    } catch (error) {
      return providerErrorExchange(provider, error instanceof Error ? error.message : String(error));
    }
  }

  async submitOrder(order: OrderRequest): Promise<OrderStatusSnapshot> {
    const provider = String(this.provider || '').toUpperCase();
    if (provider !== 'BINANCE') {
      throw new Error(`Exchange provider ${provider} is not supported for order routing.`);
    }
    ensureTradingEnabled(provider);
    const credentials = resolveBinanceCredentials();
    const symbol = String(order.symbol || '').trim().toUpperCase();
    if (!symbol) throw new Error('symbol is required.');
    const type = String(order.type || 'LIMIT').toUpperCase() === 'MARKET' ? 'MARKET' : 'LIMIT';
    const side = String(order.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const query = new URLSearchParams({
      symbol,
      side,
      type,
      newClientOrderId: String(order.client_order_id || `nq_${Date.now()}`),
      recvWindow: '5000',
      timestamp: String(Date.now())
    });
    if (type === 'LIMIT') {
      const price = Number(order.limit_price);
      const qty = Number(order.qty ?? (Number.isFinite(Number(order.notional)) && price > 0 ? Number(order.notional) / price : NaN));
      if (!Number.isFinite(price) || price <= 0) throw new Error('limit_price is required for Binance limit orders.');
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('qty or notional is required for Binance limit orders.');
      query.set('timeInForce', String(order.time_in_force || 'GTC').toUpperCase());
      query.set('price', formatNumber(price) || String(price));
      query.set('quantity', formatNumber(qty) || String(qty));
    } else if (Number.isFinite(Number(order.qty)) && Number(order.qty) > 0) {
      query.set('quantity', formatNumber(Number(order.qty)) || String(Number(order.qty)));
    } else if (Number.isFinite(Number(order.notional)) && Number(order.notional) > 0) {
      query.set('quoteOrderQty', formatNumber(Number(order.notional), 6) || String(Number(order.notional)));
    } else {
      throw new Error('qty or notional is required for Binance market orders.');
    }
    signBinanceQuery(credentials.apiSecret, query);

    const response = await fetchWithRetry(
      `${credentials.baseUrl}/api/v3/order?${query.toString()}`,
      {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': credentials.apiKey
        }
      },
      { attempts: 2, baseDelayMs: 400 },
      12_000
    );
    const parsed = await readJsonOrError<Record<string, unknown>>(response);
    if (!parsed.ok) {
      throw new Error(`Binance order submit failed. ${parsed.detail}`);
    }
    return parseBinanceOrder(provider, parsed.data);
  }

  async getOrder(args: { orderId?: string; clientOrderId?: string; symbol?: string }): Promise<OrderStatusSnapshot> {
    const provider = String(this.provider || '').toUpperCase();
    if (provider !== 'BINANCE') {
      throw new Error(`Exchange provider ${provider} is not supported for order routing.`);
    }
    ensureTradingEnabled(provider);
    const credentials = resolveBinanceCredentials();
    const symbol = String(args.symbol || '').trim().toUpperCase();
    if (!symbol) throw new Error('symbol is required for Binance order lookup.');
    const query = new URLSearchParams({
      symbol,
      recvWindow: '5000',
      timestamp: String(Date.now())
    });
    if (args.orderId) {
      query.set('orderId', String(args.orderId));
    } else if (args.clientOrderId) {
      query.set('origClientOrderId', String(args.clientOrderId));
    } else {
      throw new Error('orderId or clientOrderId is required.');
    }
    signBinanceQuery(credentials.apiSecret, query);
    const response = await fetchWithRetry(
      `${credentials.baseUrl}/api/v3/order?${query.toString()}`,
      {
        headers: {
          'X-MBX-APIKEY': credentials.apiKey
        }
      },
      { attempts: 2, baseDelayMs: 400 },
      12_000
    );
    const parsed = await readJsonOrError<Record<string, unknown>>(response);
    if (!parsed.ok) {
      throw new Error(`Binance order lookup failed. ${parsed.detail}`);
    }
    return parseBinanceOrder(provider, parsed.data);
  }

  async cancelOrder(args: { orderId?: string; clientOrderId?: string; symbol?: string }): Promise<OrderStatusSnapshot> {
    const provider = String(this.provider || '').toUpperCase();
    if (provider !== 'BINANCE') {
      throw new Error(`Exchange provider ${provider} is not supported for order routing.`);
    }
    ensureTradingEnabled(provider);
    const credentials = resolveBinanceCredentials();
    const symbol = String(args.symbol || '').trim().toUpperCase();
    if (!symbol) throw new Error('symbol is required for Binance order cancel.');
    const query = new URLSearchParams({
      symbol,
      recvWindow: '5000',
      timestamp: String(Date.now())
    });
    if (args.orderId) {
      query.set('orderId', String(args.orderId));
    } else if (args.clientOrderId) {
      query.set('origClientOrderId', String(args.clientOrderId));
    } else {
      throw new Error('orderId or clientOrderId is required.');
    }
    signBinanceQuery(credentials.apiSecret, query);
    const response = await fetchWithRetry(
      `${credentials.baseUrl}/api/v3/order?${query.toString()}`,
      {
        method: 'DELETE',
        headers: {
          'X-MBX-APIKEY': credentials.apiKey
        }
      },
      { attempts: 2, baseDelayMs: 400 },
      12_000
    );
    const parsed = await readJsonOrError<Record<string, unknown>>(response);
    if (!parsed.ok) {
      throw new Error(`Binance order cancel failed. ${parsed.detail}`);
    }
    return parseBinanceOrder(provider, parsed.data);
  }
}

export function createBrokerAdapter(provider: string): BrokerAdapter {
  return new HonestBrokerAdapter(provider);
}

export function createExchangeAdapter(provider: string): ExchangeAdapter {
  return new HonestExchangeAdapter(provider);
}

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

export interface BrokerAdapter {
  provider: string;
  fetchSnapshot(): Promise<BrokerSnapshot>;
}

export interface ExchangeAdapter {
  provider: string;
  fetchSnapshot(): Promise<ExchangeSnapshot>;
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

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

class HonestBrokerAdapter implements BrokerAdapter {
  constructor(public provider: string) {}

  async fetchSnapshot(): Promise<BrokerSnapshot> {
    const provider = String(this.provider || '').toUpperCase();
    if (provider !== 'ALPACA') {
      return disconnectedBroker(provider, 'UNSUPPORTED_PROVIDER', 'Broker provider is not supported in this build.');
    }
    if (!isConfigured(provider)) {
      return disconnectedBroker(provider, 'NO_CREDENTIALS', 'Broker credentials are not configured.');
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
      return {
        provider,
        mode: 'READ_ONLY',
        status: 'CONNECTED',
        source_status: RUNTIME_STATUS.REALIZED,
        data_status: RUNTIME_STATUS.REALIZED,
        source_label: RUNTIME_STATUS.REALIZED,
        reason_code: 'NOT_CONFIGURED',
        message: positions.data.length
          ? 'Live Alpaca positions loaded in read-only mode.'
          : 'Live Alpaca account connected. No open positions were reported.',
        last_checked_at: nowIso(),
        can_read_positions: true,
        can_trade: false,
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
}

class HonestExchangeAdapter implements ExchangeAdapter {
  constructor(public provider: string) {}

  async fetchSnapshot(): Promise<ExchangeSnapshot> {
    const provider = String(this.provider || '').toUpperCase();
    if (provider !== 'BINANCE') {
      return disconnectedExchange(provider, 'UNSUPPORTED_PROVIDER', 'Exchange provider is not supported in this build.');
    }
    if (!isConfigured(provider)) {
      return disconnectedExchange(provider, 'NO_CREDENTIALS', 'Exchange credentials are not configured.');
    }
    const credentials = resolveBinanceCredentials();
    const query = new URLSearchParams({
      timestamp: String(Date.now()),
      recvWindow: '5000'
    });
    query.set('signature', binanceSignature(credentials.apiSecret, query));
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

      return {
        provider,
        mode: 'READ_ONLY',
        status: 'CONNECTED',
        source_status: RUNTIME_STATUS.REALIZED,
        data_status: RUNTIME_STATUS.REALIZED,
        source_label: RUNTIME_STATUS.REALIZED,
        reason_code: 'NOT_CONFIGURED',
        message: balances.length
          ? 'Live Binance balances loaded in read-only mode.'
          : 'Live Binance account connected. No non-zero balances were reported.',
        last_checked_at: nowIso(),
        can_read_positions: true,
        can_trade: false,
        balances,
        positions: []
      };
    } catch (error) {
      return providerErrorExchange(provider, error instanceof Error ? error.message : String(error));
    }
  }
}

export function createBrokerAdapter(provider: string): BrokerAdapter {
  return new HonestBrokerAdapter(provider);
}

export function createExchangeAdapter(provider: string): ExchangeAdapter {
  return new HonestExchangeAdapter(provider);
}

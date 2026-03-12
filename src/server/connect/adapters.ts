import { RUNTIME_STATUS, type RuntimeStatus } from '../runtimeStatus.js';

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
  }>;
}

export interface ExchangeSnapshot extends SnapshotBase {
  balances: Array<{
    asset: string;
    free: number;
    locked: number;
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

function isConfigured(provider: string): boolean {
  const p = String(provider || '').toUpperCase();
  if (p === 'ALPACA') {
    return Boolean(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET);
  }
  if (p === 'BINANCE') {
    return Boolean(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);
  }
  return false;
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
    return disconnectedBroker(provider, 'READ_ONLY_UNAVAILABLE', 'Provider adapter interface exists but live fetch is not enabled.');
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
    return disconnectedExchange(provider, 'READ_ONLY_UNAVAILABLE', 'Provider adapter interface exists but live fetch is not enabled.');
  }
}

export function createBrokerAdapter(provider: string): BrokerAdapter {
  return new HonestBrokerAdapter(provider);
}

export function createExchangeAdapter(provider: string): ExchangeAdapter {
  return new HonestExchangeAdapter(provider);
}

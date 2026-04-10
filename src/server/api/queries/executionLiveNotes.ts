import type { SignalContract } from '../../types.js';
import {
  createBrokerAdapter,
  createExchangeAdapter,
  type OrderStatusSnapshot,
} from '../../connect/adapters.js';

export function midpoint(low?: number | null, high?: number | null) {
  if (Number.isFinite(low) && Number.isFinite(high)) return (Number(low) + Number(high)) / 2;
  if (Number.isFinite(low)) return Number(low);
  if (Number.isFinite(high)) return Number(high);
  return null;
}

export function signalEntryMid(signal: SignalContract): number | null {
  return midpoint(signal.entry_zone?.low, signal.entry_zone?.high);
}

export function inferExecutionProvider(signal: SignalContract, provider?: string | null) {
  if (provider) return String(provider).trim().toUpperCase();
  return signal.market === 'CRYPTO' ? 'BINANCE' : 'ALPACA';
}

export function signalExecutionSide(signal: SignalContract): 'BUY' | 'SELL' {
  if (signal.direction === 'LONG') return 'BUY';
  if (signal.direction === 'SHORT') return 'SELL';
  throw new Error('Signal direction is FLAT and cannot be routed as an order.');
}

export type StoredLiveExecutionNote = {
  type: 'live_execution';
  provider: string;
  order_id: string;
  client_order_id: string | null;
  status: string;
  qty: number | null;
  notional: number | null;
  limit_price: number | null;
  filled_qty: number | null;
  filled_avg_price: number | null;
  submitted_at: string | null;
  expected_entry_price: number | null;
  expected_notional: number | null;
  strategy_id: string;
  strategy_family: string;
  signal_score: number;
  entry_method: string;
  routing: {
    route_key: string;
    champion_mode: 'LIVE';
    challenger_mode: 'PAPER';
    shadow_execution_id: string | null;
  };
  execution_guard?: Record<string, unknown> | null;
  user_note?: string | null;
};

export type StoredShadowExecutionNote = {
  type: 'shadow_execution';
  shadow_role: 'CHALLENGER';
  provider: string;
  paired_live_execution_id: string | null;
  order_id: string;
  client_order_id: string | null;
  expected_entry_price: number | null;
  strategy_id: string;
  strategy_family: string;
  route_key: string;
  user_note?: string | null;
};

export function parseExecutionNoteObject(
  note: string | null | undefined,
): Record<string, unknown> | null {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function parseLiveExecutionNote(
  note: string | null | undefined,
): StoredLiveExecutionNote | null {
  const parsed = parseExecutionNoteObject(note);
  if (!parsed || parsed.type !== 'live_execution') return null;
  return {
    type: 'live_execution',
    provider: String(parsed.provider || '').toUpperCase(),
    order_id: String(parsed.order_id || ''),
    client_order_id: parsed.client_order_id ? String(parsed.client_order_id) : null,
    status: String(parsed.status || 'UNKNOWN'),
    qty: Number.isFinite(Number(parsed.qty)) ? Number(parsed.qty) : null,
    notional: Number.isFinite(Number(parsed.notional)) ? Number(parsed.notional) : null,
    limit_price: Number.isFinite(Number(parsed.limit_price)) ? Number(parsed.limit_price) : null,
    filled_qty: Number.isFinite(Number(parsed.filled_qty)) ? Number(parsed.filled_qty) : null,
    filled_avg_price: Number.isFinite(Number(parsed.filled_avg_price))
      ? Number(parsed.filled_avg_price)
      : null,
    submitted_at: parsed.submitted_at ? String(parsed.submitted_at) : null,
    expected_entry_price: Number.isFinite(Number(parsed.expected_entry_price))
      ? Number(parsed.expected_entry_price)
      : null,
    expected_notional: Number.isFinite(Number(parsed.expected_notional))
      ? Number(parsed.expected_notional)
      : null,
    strategy_id: String(parsed.strategy_id || ''),
    strategy_family: String(parsed.strategy_family || ''),
    signal_score: Number.isFinite(Number(parsed.signal_score)) ? Number(parsed.signal_score) : 0,
    entry_method: String(parsed.entry_method || ''),
    routing:
      parsed.routing && typeof parsed.routing === 'object'
        ? {
            route_key: String(
              (parsed.routing as Record<string, unknown>).route_key ||
                'live_champion_paper_challenger',
            ),
            champion_mode: 'LIVE',
            challenger_mode: 'PAPER',
            shadow_execution_id: (parsed.routing as Record<string, unknown>).shadow_execution_id
              ? String((parsed.routing as Record<string, unknown>).shadow_execution_id)
              : null,
          }
        : {
            route_key: 'live_champion_paper_challenger',
            champion_mode: 'LIVE',
            challenger_mode: 'PAPER',
            shadow_execution_id: null,
          },
    execution_guard:
      parsed.execution_guard && typeof parsed.execution_guard === 'object'
        ? (parsed.execution_guard as Record<string, unknown>)
        : null,
    user_note: parsed.user_note ? String(parsed.user_note) : null,
  };
}

export function parseShadowExecutionNote(
  note: string | null | undefined,
): StoredShadowExecutionNote | null {
  const parsed = parseExecutionNoteObject(note);
  if (!parsed || parsed.type !== 'shadow_execution') return null;
  return {
    type: 'shadow_execution',
    shadow_role: 'CHALLENGER',
    provider: String(parsed.provider || '').toUpperCase(),
    paired_live_execution_id: parsed.paired_live_execution_id
      ? String(parsed.paired_live_execution_id)
      : null,
    order_id: String(parsed.order_id || ''),
    client_order_id: parsed.client_order_id ? String(parsed.client_order_id) : null,
    expected_entry_price: Number.isFinite(Number(parsed.expected_entry_price))
      ? Number(parsed.expected_entry_price)
      : null,
    strategy_id: String(parsed.strategy_id || ''),
    strategy_family: String(parsed.strategy_family || ''),
    route_key: String(parsed.route_key || 'live_champion_paper_challenger'),
    user_note: parsed.user_note ? String(parsed.user_note) : null,
  };
}

export async function deriveSignalNotional(
  signal: SignalContract,
  provider: string,
): Promise<number | null> {
  const targetPct = Number(signal.position_advice?.position_pct || 0);
  if (!Number.isFinite(targetPct) || targetPct <= 0) return null;

  if (provider === 'ALPACA') {
    const adapter = createBrokerAdapter(provider);
    const snapshot = await adapter.fetchSnapshot();
    const capital = snapshot.buying_power ?? snapshot.cash;
    return Number.isFinite(Number(capital)) ? Number(capital) * (targetPct / 100) : null;
  }

  if (provider === 'BINANCE') {
    const adapter = createExchangeAdapter(provider);
    const snapshot = await adapter.fetchSnapshot();
    const quote = snapshot.balances.find((row) =>
      ['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD'].includes(String(row.asset || '').toUpperCase()),
    );
    const capital = quote?.free ?? quote?.total ?? null;
    return Number.isFinite(Number(capital)) ? Number(capital) * (targetPct / 100) : null;
  }

  return null;
}

export function stringifyLiveExecutionNote(args: {
  provider: string;
  order: OrderStatusSnapshot;
  signal: SignalContract;
  expectedEntryPrice?: number | null;
  expectedNotional?: number | null;
  shadowExecutionId?: string | null;
  executionGuard?: Record<string, unknown> | null;
  userNote?: string;
}) {
  return JSON.stringify({
    type: 'live_execution',
    provider: args.provider,
    order_id: args.order.order_id,
    client_order_id: args.order.client_order_id,
    status: args.order.status,
    qty: args.order.qty,
    notional: args.order.notional,
    limit_price: args.order.limit_price,
    filled_qty: args.order.filled_qty,
    filled_avg_price: args.order.filled_avg_price,
    submitted_at: args.order.submitted_at,
    expected_entry_price: args.expectedEntryPrice ?? null,
    expected_notional: args.expectedNotional ?? null,
    strategy_id: args.signal.strategy_id,
    strategy_family: args.signal.strategy_family,
    signal_score: args.signal.score,
    entry_method: args.signal.entry_zone?.method || 'LIMIT',
    routing: {
      route_key: 'live_champion_paper_challenger',
      champion_mode: 'LIVE',
      challenger_mode: 'PAPER',
      shadow_execution_id: args.shadowExecutionId ?? null,
    },
    execution_guard: args.executionGuard || null,
    user_note: args.userNote || null,
  });
}

export function stringifyShadowExecutionNote(args: {
  provider: string;
  signal: SignalContract;
  order: OrderStatusSnapshot;
  liveExecutionId?: string | null;
  userNote?: string;
}) {
  return JSON.stringify({
    type: 'shadow_execution',
    shadow_role: 'CHALLENGER',
    provider: args.provider,
    paired_live_execution_id: args.liveExecutionId ?? null,
    order_id: args.order.order_id,
    client_order_id: args.order.client_order_id,
    expected_entry_price: signalEntryMid(args.signal),
    strategy_id: args.signal.strategy_id,
    strategy_family: args.signal.strategy_family,
    route_key: 'live_champion_paper_challenger',
    user_note: args.userNote || null,
  });
}

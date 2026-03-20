import { createHash } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import type { NotificationEventRecord, SignalContract } from '../types.js';

function toneForSignal(signal: SignalContract): string {
  if (signal.regime_id === 'RISK_OFF') return 'protective';
  if (signal.direction === 'SHORT') return 'defensive';
  if (signal.direction === 'LONG') return 'watchful';
  return 'steady';
}

function bodyForSignal(signal: SignalContract, eventType: string): string {
  const entry = `${signal.entry_zone.low.toFixed(2)}-${signal.entry_zone.high.toFixed(2)}`;
  if (eventType === 'STATUS_CHANGED') {
    return `${signal.symbol} is now ${signal.status}. Re-check entry ${entry} and invalidation ${signal.stop_loss.price.toFixed(2)}.`;
  }
  return `${signal.symbol} ${signal.direction} card is ready. Entry ${entry}, stop ${signal.stop_loss.price.toFixed(2)}, size ${signal.position_advice.position_pct.toFixed(1)}%.`;
}

export function deliverSignalToInternalInbox(args: {
  repo: MarketRepository;
  userId: string;
  signal: SignalContract;
  eventType: string;
}) {
  const now = Date.now();
  const fingerprint = createHash('sha256')
    .update(`${args.userId}:${args.signal.id}:${args.eventType}:${args.signal.status}`)
    .digest('hex');

  const event: NotificationEventRecord = {
    id: `notif-signal-${fingerprint.slice(0, 20)}`,
    user_id: args.userId,
    market: args.signal.market,
    asset_class: args.signal.asset_class,
    category: args.signal.regime_id === 'RISK_OFF' ? 'PROTECTIVE' : 'STATE_SHIFT',
    trigger_type: `SIGNAL_${args.eventType}`,
    fingerprint,
    title: `${args.signal.symbol} · ${args.signal.direction} · ${args.signal.strategy_id}`,
    body: bodyForSignal(args.signal, args.eventType),
    tone: toneForSignal(args.signal),
    status: 'ACTIVE',
    action_target: 'today',
    reason_json: JSON.stringify({
      signal_id: args.signal.id,
      strategy_id: args.signal.strategy_id,
      strategy_family: args.signal.strategy_family,
      event_type: args.eventType,
      score: args.signal.score
    }),
    created_at_ms: now,
    updated_at_ms: now
  };

  args.repo.upsertNotificationEvent(event);
  args.repo.logSignalDelivery({
    signal_id: args.signal.id,
    channel: 'IN_APP',
    endpoint: args.userId,
    event_type: args.eventType,
    status: 'SENT',
    detail: event.id
  });
}

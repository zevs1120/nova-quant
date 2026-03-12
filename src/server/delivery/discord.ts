import type { MarketRepository } from '../db/repository.js';
import type { SignalContract } from '../types.js';

function eventLabel(eventType: string): string {
  if (eventType === 'CREATED') return 'Signal Created';
  if (eventType === 'STATUS_CHANGED') return 'Signal Status Changed';
  return eventType;
}

export async function deliverSignalToDiscord(args: {
  repo: MarketRepository;
  signal: SignalContract;
  eventType: string;
}) {
  const webhook = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!webhook) {
    args.repo.logSignalDelivery({
      signal_id: args.signal.id,
      channel: 'DISCORD',
      endpoint: null,
      event_type: args.eventType,
      status: 'SKIPPED',
      detail: 'DISCORD_WEBHOOK_URL missing'
    });
    return;
  }

  const entry = `${args.signal.entry_zone.low.toFixed(2)} - ${args.signal.entry_zone.high.toFixed(2)}`;
  const tp = args.signal.take_profit_levels[0]?.price ?? 0;
  const body = {
    username: 'Nova Quant Bot',
    embeds: [
      {
        title: `${eventLabel(args.eventType)} · ${args.signal.symbol}`,
        description: `${args.signal.asset_class} | ${args.signal.market} | ${args.signal.strategy_id}`,
        color: 0x6aa6ff,
        fields: [
          { name: 'Direction', value: args.signal.direction, inline: true },
          { name: 'Status', value: args.signal.status, inline: true },
          { name: 'Confidence', value: `${(args.signal.confidence * 100).toFixed(0)}%`, inline: true },
          { name: 'Entry', value: entry, inline: true },
          { name: 'Stop', value: args.signal.stop_loss.price.toFixed(2), inline: true },
          { name: 'TP1', value: tp.toFixed(2), inline: true },
          { name: 'Position %', value: `${args.signal.position_advice.position_pct.toFixed(2)}%`, inline: true },
          { name: 'Regime', value: `${args.signal.regime_id} / temp ${args.signal.temperature_percentile.toFixed(1)}`, inline: true }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  };

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      args.repo.logSignalDelivery({
        signal_id: args.signal.id,
        channel: 'DISCORD',
        endpoint: webhook,
        event_type: args.eventType,
        status: 'FAILED',
        detail: `HTTP ${res.status} ${text.slice(0, 200)}`
      });
      return;
    }
    args.repo.logSignalDelivery({
      signal_id: args.signal.id,
      channel: 'DISCORD',
      endpoint: webhook,
      event_type: args.eventType,
      status: 'SENT',
      detail: null
    });
  } catch (error) {
    args.repo.logSignalDelivery({
      signal_id: args.signal.id,
      channel: 'DISCORD',
      endpoint: webhook,
      event_type: args.eventType,
      status: 'FAILED',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

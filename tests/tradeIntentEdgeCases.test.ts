import { describe, expect, it } from 'vitest';
import {
  buildTradeIntent,
  buildNovaTradeQuestion,
  tradeIntentHandoffLabel,
  // @ts-ignore JS runtime module import
} from '../src/utils/tradeIntent.js';

/* ─────────────────────────────────────────────────
 * buildTradeIntent — defensive data handling
 *
 * This runs in the browser and receives arbitrary signal shapes.
 * Must never crash, must always produce safe defaults.
 * ───────────────────────────────────────────────── */

describe('buildTradeIntent defensive handling', () => {
  it('handles completely empty signal without crashing', () => {
    const intent = buildTradeIntent({}, {});
    expect(intent).toBeDefined();
    expect(intent.symbol).toBe('');
    expect(intent.side).toBe('LONG');
    expect(intent.orderType).toBe('LIMIT');
    expect(intent.sizeLabel).toBe('watch only');
    expect(intent.canOpenBroker).toBe(false);
    expect(typeof intent.copyText).toBe('string');
  });

  it('handles undefined signal', () => {
    const intent = buildTradeIntent(undefined, undefined);
    expect(intent).toBeDefined();
    expect(intent.side).toBe('LONG');
  });

  it('resolves stop_loss from nested stop_loss.price object', () => {
    const intent = buildTradeIntent({
      symbol: 'AAPL',
      stop_loss: { price: 185 },
    });
    expect(intent.stopLoss).toBe(185);
  });

  it('resolves stop_loss from stop_loss_value fallback', () => {
    const intent = buildTradeIntent({
      symbol: 'AAPL',
      stop_loss_value: 183,
    });
    expect(intent.stopLoss).toBe(183);
  });

  it('resolves stop_loss from invalidation_level fallback', () => {
    const intent = buildTradeIntent({
      symbol: 'AAPL',
      invalidation_level: 180,
    });
    expect(intent.stopLoss).toBe(180);
  });

  it('falls back to numeric stop_loss when no object', () => {
    const intent = buildTradeIntent({
      symbol: 'AAPL',
      stop_loss: 178,
    });
    expect(intent.stopLoss).toBe(178);
  });

  it('handles legacy take_profit (single number) fallback', () => {
    const intent = buildTradeIntent({
      symbol: 'AAPL',
      take_profit: 215,
    });
    expect(intent.targets).toHaveLength(1);
    expect(intent.targets[0].price).toBe(215);
  });

  it('prefers take_profit_levels over legacy take_profit', () => {
    const intent = buildTradeIntent({
      symbol: 'AAPL',
      take_profit: 200,
      take_profit_levels: [{ price: 210 }, { price: 225 }],
    });
    expect(intent.targets).toHaveLength(2);
    expect(intent.targets[0].price).toBe(210);
  });

  it('resolves position sizing from nested position_advice.position_pct', () => {
    const intent = buildTradeIntent({
      symbol: 'AAPL',
      position_advice: { position_pct: 7.5 },
    });
    expect(intent.sizePct).toBe(7.5);
    expect(intent.sizeLabel).toBe('small');
  });

  it('correctly categorizes position size labels', () => {
    expect(buildTradeIntent({ position_pct: 0 }).sizeLabel).toBe('watch only');
    expect(buildTradeIntent({ position_pct: 3 }).sizeLabel).toBe('starter');
    expect(buildTradeIntent({ position_pct: 8 }).sizeLabel).toBe('small');
    expect(buildTradeIntent({ position_pct: 15 }).sizeLabel).toBe('active');
    expect(buildTradeIntent({ position_pct: 25 }).sizeLabel).toBe('capped');
  });
});

/* ─────────────────────────────────────────────────
 * Entry zone resolution
 * ───────────────────────────────────────────────── */

describe('buildTradeIntent entry zone', () => {
  it('computes entryMid from entry_zone.low / entry_zone.high', () => {
    const intent = buildTradeIntent({
      entry_zone: { low: 100, high: 110 },
    });
    expect(intent.entryMid).toBe(105);
    expect(intent.entryLabel).toBe('100.00 - 110.00');
  });

  it('falls back to entry_zone.min / entry_zone.max', () => {
    const intent = buildTradeIntent({
      entry_zone: { min: 200, max: 210 },
    });
    expect(intent.entryMid).toBe(205);
  });

  it('falls back to entry_min / entry_max', () => {
    const intent = buildTradeIntent({
      entry_min: 50,
      entry_max: 55,
    });
    expect(intent.entryMid).toBe(52.5);
  });

  it('shows single price when low == high', () => {
    const intent = buildTradeIntent({
      entry_zone: { low: 100, high: 100 },
    });
    expect(intent.entryLabel).toBe('100.00');
  });
});

/* ─────────────────────────────────────────────────
 * copyText — text clipboard format
 * ───────────────────────────────────────────────── */

describe('copyText payload', () => {
  it('includes all key parameters', () => {
    const intent = buildTradeIntent({
      signal_id: 'SIG-123',
      symbol: 'NVDA',
      market: 'US',
      direction: 'LONG',
      entry_zone: { low: 120, high: 125 },
      stop_loss: { price: 115 },
      take_profit_levels: [{ price: 140 }],
      position_advice: { position_pct: 8 },
      strategy_id: 'EQ_VEL',
    });
    expect(intent.copyText).toContain('symbol: NVDA');
    expect(intent.copyText).toContain('side: LONG');
    expect(intent.copyText).toContain('stop_loss: 115');
    expect(intent.copyText).toContain('signal_id: SIG-123');
  });

  it('uses -- for missing fields', () => {
    const intent = buildTradeIntent({
      symbol: 'AAPL',
    });
    expect(intent.copyText).toContain('stop_loss: --');
    expect(intent.copyText).toContain('entry_mid: --');
  });
});

/* ─────────────────────────────────────────────────
 * tradeIntentHandoffLabel — i18n
 * ───────────────────────────────────────────────── */

describe('tradeIntentHandoffLabel i18n', () => {
  it('returns Chinese label for prefilled ticket', () => {
    const label = tradeIntentHandoffLabel(
      {
        handoffPrefillsTicket: true,
        handoffBrokerLabel: 'Robinhood',
      },
      'zh',
    );
    expect(label).toContain('Robinhood');
    expect(label).toContain('下单');
  });

  it('returns English label for opening broker', () => {
    const label = tradeIntentHandoffLabel(
      {
        canOpenBroker: true,
        handoffBrokerLabel: 'Robinhood',
      },
      'en',
    );
    expect(label).toBe('Open Robinhood');
  });

  it('returns copy fallback when no broker available', () => {
    const enLabel = tradeIntentHandoffLabel({}, 'en');
    expect(enLabel).toBe('Copy trade ticket');
    const zhLabel = tradeIntentHandoffLabel({}, 'zh');
    expect(zhLabel).toBe('复制交易票据');
  });
});

/* ─────────────────────────────────────────────────
 * buildNovaTradeQuestion — AI prompt building
 * ───────────────────────────────────────────────── */

describe('buildNovaTradeQuestion', () => {
  it('includes symbol and key parameters in English', () => {
    const question = buildNovaTradeQuestion(
      { symbol: 'NVDA', direction: 'LONG' },
      {
        symbol: 'NVDA',
        side: 'LONG',
        entryLabel: '120.00 - 125.00',
        stopLoss: 115,
        targets: [{ price: 140 }],
        sizePct: 8,
      },
      'en',
    );
    expect(question).toContain('NVDA');
    expect(question).toContain('LONG');
    expect(question).toContain('120.00 - 125.00');
    expect(question).toContain('115');
    expect(question).toContain('140');
    expect(question).toContain('8');
  });

  it('generates Chinese prompt for zh locale', () => {
    const question = buildNovaTradeQuestion(
      { symbol: 'AAPL' },
      {
        symbol: 'AAPL',
        side: 'LONG',
        entryLabel: '195.00',
        stopLoss: 190,
        targets: [{ price: 210 }],
        sizePct: 5,
      },
      'zh',
    );
    expect(question).toContain('AAPL');
    expect(question).toContain('行动卡');
    expect(question).toContain('四部分');
  });
});

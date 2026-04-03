import { describe, expect, it } from 'vitest';
import {
  formatSignalDetailTimestamp,
  humanizeSignalToken,
  humanSignalAssetLabel,
  humanSignalDirectionLabel,
  humanSignalPositionSizeText,
  humanSignalStatusLabel,
  humanSignalValidityText,
} from '../src/utils/signalHumanLabels.js';

describe('signalHumanLabels.humanizeSignalToken', () => {
  it('returns -- for empty', () => {
    expect(humanizeSignalToken('')).toBe('--');
    expect(humanizeSignalToken(null)).toBe('--');
  });

  it('strips signals. and validity. prefixes', () => {
    expect(humanizeSignalToken('signals.foo_bar')).toBe('Foo Bar');
    expect(humanizeSignalToken('validity.swing')).toBe('Swing');
  });

  it('title-cases tokens after cleanup', () => {
    expect(humanizeSignalToken('raw_token-name')).toBe('Raw Token Name');
  });
});

describe('signalHumanLabels.formatSignalDetailTimestamp', () => {
  it('returns -- when missing', () => {
    expect(formatSignalDetailTimestamp(null, 'en')).toBe('--');
    expect(formatSignalDetailTimestamp('', 'en')).toBe('--');
  });

  it('returns raw string for invalid dates', () => {
    expect(formatSignalDetailTimestamp('not-a-date', 'en')).toBe('not-a-date');
  });

  it('formats valid ISO timestamps', () => {
    const s = formatSignalDetailTimestamp('2026-01-15T14:30:00.000Z', 'en-US');
    expect(s).toMatch(/Jan/);
    expect(s).toMatch(/15/);
  });
});

describe('signalHumanLabels.humanSignalAssetLabel', () => {
  it('classifies OPTIONS', () => {
    expect(humanSignalAssetLabel({ asset_class: 'OPTIONS' }, false)).toBe('Options');
    expect(humanSignalAssetLabel({ asset_class: 'OPTIONS' }, true)).toBe('期权');
  });

  it('classifies US_STOCK before market', () => {
    expect(humanSignalAssetLabel({ asset_class: 'US_STOCK', market: 'CRYPTO' }, false)).toBe(
      'US stocks',
    );
  });

  it('uses market US when asset_class absent', () => {
    expect(humanSignalAssetLabel({ market: 'US' }, false)).toBe('US stocks');
  });

  it('defaults to crypto copy', () => {
    expect(humanSignalAssetLabel({ market: 'CRYPTO' }, false)).toBe('Crypto');
    expect(humanSignalAssetLabel({ market: 'CRYPTO' }, true)).toBe('加密货币');
  });
});

describe('signalHumanLabels.humanSignalDirectionLabel', () => {
  it.each([
    ['LONG', false, 'Long'],
    ['BUY', true, '做多'],
    ['short', false, 'Short'],
    ['SELL', true, '做空'],
  ])('%s → %s (%s)', (dir, zh, expected) => {
    expect(humanSignalDirectionLabel(dir, zh)).toBe(expected);
  });

  it('humanizes unknown directions (uppercases via direction key)', () => {
    expect(humanSignalDirectionLabel('custom_side', false)).toBe('CUSTOM SIDE');
  });
});

describe('signalHumanLabels.humanSignalStatusLabel', () => {
  it.each([
    ['NEW', false, 'New'],
    ['WITHHELD', true, '先观察'],
    ['EXPIRED', false, 'Expired'],
    ['TRIGGERED', true, '已触发'],
  ])('%s locale zh=%s', (status, zh, label) => {
    expect(humanSignalStatusLabel(status, zh)).toBe(label);
  });

  it('humanizes unknown status tokens', () => {
    expect(humanSignalStatusLabel('CUSTOM', false)).toBe('CUSTOM');
  });
});

describe('signalHumanLabels.humanSignalPositionSizeText', () => {
  it('formats finite pct from position_pct', () => {
    expect(humanSignalPositionSizeText({ position_pct: 12.4 }, false)).toBe('Up to 12% size');
    expect(humanSignalPositionSizeText({ position_pct: 12.4 }, true)).toBe('最多 12% 仓位');
  });

  it('falls back to position_size_pct', () => {
    expect(humanSignalPositionSizeText({ position_size_pct: 5 }, false)).toBe('Up to 5% size');
  });

  it('returns -- when not numeric', () => {
    expect(humanSignalPositionSizeText({}, false)).toBe('--');
    expect(humanSignalPositionSizeText({ position_pct: 'x' }, false)).toBe('--');
  });
});

describe('signalHumanLabels.humanSignalValidityText', () => {
  it('maps INTRADAY and SWING', () => {
    expect(humanSignalValidityText({ validity: 'INTRADAY' }, false)).toBe('Today only');
    expect(humanSignalValidityText({ validity: 'swing' }, true)).toBe('可持有几天');
  });

  it('returns default when blank or undefined string', () => {
    expect(humanSignalValidityText({ validity: '' }, false)).toBe('Until conditions break');
    expect(humanSignalValidityText({ validity: 'undefined' }, true)).toBe('直到条件失效');
  });

  it('humanizes other validity tokens', () => {
    expect(humanSignalValidityText({ validity: 'custom_horizon' }, false)).toBe('Custom Horizon');
  });
});

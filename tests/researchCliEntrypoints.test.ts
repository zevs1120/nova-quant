import { describe, expect, it } from 'vitest';
import { parseSignalReplayCliArgs } from '../scripts/backtest-signal-replay.js';
import { parseQlibResearchFactoryCliArgs } from '../scripts/run-qlib-research-factory.js';

describe('research CLI entrypoints', () => {
  it('parses Qlib factory manual-run options without touching the runtime repository', () => {
    const out = parseQlibResearchFactoryCliArgs([
      '--user',
      'researcher-1',
      '--market',
      'US',
      '--symbols',
      'aapl,nvda,spy',
      '--model',
      'lightgbm',
      '--lookback-days',
      '365',
      '--max-symbols',
      '12',
      '--require-healthy-bridge',
      '--no-native',
    ]);

    expect(out.userId).toBe('researcher-1');
    expect(out.market).toBe('US');
    expect(out.symbols).toEqual(['AAPL', 'NVDA', 'SPY']);
    expect(out.modelName).toBe('lightgbm');
    expect(out.lookbackDays).toBe(365);
    expect(out.maxSymbols).toBe(12);
    expect(out.requireHealthyBridge).toBe(true);
    expect(out.runNativeBacktest).toBe(false);
  });

  it('parses signal replay filters for a strategy-family slice', () => {
    const out = parseSignalReplayCliArgs([
      '--market',
      'US',
      '--family',
      'Regime Transition',
      '--symbols',
      'googl,meta',
      '--since',
      '2026-03-20',
      '--until',
      '2026-04-08',
      '--max-hold-bars',
      '5',
      '--limit',
      '400',
    ]);

    expect(out.market).toBe('US');
    expect(out.family).toBe('Regime Transition');
    expect(out.symbols).toEqual(['GOOGL', 'META']);
    expect(new Date(out.sinceMs).toISOString()).toBe('2026-03-20T00:00:00.000Z');
    expect(new Date(out.untilMs).toISOString()).toBe('2026-04-08T00:00:00.000Z');
    expect(out.maxHoldBars).toBe(5);
    expect(out.limit).toBe(400);
  });
});

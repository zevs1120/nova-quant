import { describe, expect, it } from 'vitest';
import {
  buildInvestorDemoEnvironment,
  buildInvestorDemoSignals,
  INVESTOR_DEMO_PERFORMANCE,
  INVESTOR_DEMO_STATUS,
} from '../src/demo/investorDemo.js';

describe('investor demo pack', () => {
  it('exposes fixed investor demo performance metrics with explicit demo status', () => {
    expect(INVESTOR_DEMO_PERFORMANCE.source_status).toBe(INVESTOR_DEMO_STATUS);
    expect(INVESTOR_DEMO_PERFORMANCE.weekly_return).toBe(0.037);
    expect(INVESTOR_DEMO_PERFORMANCE.max_drawdown).toBe(0.041);
    expect(INVESTOR_DEMO_PERFORMANCE.win_rate).toBe(0.674);
    expect(INVESTOR_DEMO_PERFORMANCE.payoff_ratio).toBe(1.62);
  });

  it('builds demo fallback signals with explicit demo transparency', () => {
    const signals = buildInvestorDemoSignals('US_STOCK');
    expect(signals.length).toBeGreaterThan(1);
    expect(signals[0].data_status).toBe(INVESTOR_DEMO_STATUS);
    expect(signals[0].source_transparency?.data_status).toBe(INVESTOR_DEMO_STATUS);
    expect(signals[0].strategy_source).toBe('AI quant strategy');
    expect(signals[0].entry_zone?.low).toBeTruthy();
  });

  it('builds a full demo environment for the app shell', () => {
    const demo = buildInvestorDemoEnvironment('US_STOCK');
    expect(demo.today.tradeability).toBe('can_trade');
    expect(demo.safety.mode).toBe('normal risk');
    expect(demo.signals.length).toBeGreaterThan(1);
    expect(demo.evidence.top_signals.length).toBe(3);
    expect(demo.config.runtime.source_status).toBe(INVESTOR_DEMO_STATUS);
  });
});

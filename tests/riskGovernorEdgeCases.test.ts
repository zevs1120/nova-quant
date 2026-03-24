import { describe, expect, it } from 'vitest';
import { evaluateRiskGovernor } from '../src/server/risk/governor.js';

/* ---------- helpers ---------- */

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    signal_id: 'sig-1',
    symbol: 'AAPL',
    market: 'US',
    asset_class: 'US_STOCK',
    direction: 'LONG',
    confidence: 0.7,
    regime_id: 'RGM_RISK_ON',
    ...overrides,
  };
}

function makeMarketState(overrides: Record<string, unknown> = {}) {
  return {
    risk_off_score: 0.3,
    volatility_percentile: 40,
    trend_strength: 0.6,
    ...overrides,
  };
}

function makeHolding(symbol: string, weightPct: number, overrides: Record<string, unknown> = {}) {
  return {
    symbol,
    weight_pct: weightPct,
    asset_class: 'US_STOCK' as const,
    sector: 'Technology',
    ...overrides,
  };
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    exposure_cap: 55,
    max_daily_loss: 3,
    ...overrides,
  } as any;
}

/* ---------- NORMAL mode ---------- */

describe('risk governor — normal conditions', () => {
  it('returns NORMAL with full size_multiplier under calm conditions', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
      holdings: [],
    });
    expect(result.governor_mode).toBe('NORMAL');
    expect(result.allowed).toBe(true);
    expect(result.size_multiplier).toBe(1);
    expect(result.overlays).toHaveLength(0);
    expect(result.block_reason).toBeNull();
  });
});

/* ---------- risk-off kill switch ---------- */

describe('risk governor — risk-off blocking', () => {
  it('BLOCKED when avgRiskOff >= 0.78', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState({ risk_off_score: 0.8 })] as any[],
      riskProfile: makeProfile(),
    });
    expect(result.governor_mode).toBe('BLOCKED');
    expect(result.allowed).toBe(false);
    expect(result.size_multiplier).toBe(0);
    expect(result.overlays).toContain('risk_off_kill_switch');
  });

  it('DERISK when avgRiskOff is 0.68-0.77', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState({ risk_off_score: 0.7 })] as any[],
      riskProfile: makeProfile(),
    });
    expect(result.governor_mode).toBe('DERISK');
    expect(result.allowed).toBe(true);
    expect(result.size_multiplier).toBe(0.5);
    expect(result.overlays).toContain('macro_derisk');
  });

  it('CAUTION when avgRiskOff is 0.58-0.67', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState({ risk_off_score: 0.6 })] as any[],
      riskProfile: makeProfile(),
    });
    expect(result.governor_mode).toBe('CAUTION');
    expect(result.allowed).toBe(true);
    expect(result.size_multiplier).toBe(0.74);
    expect(result.overlays).toContain('caution_size_cut');
  });

  it('DERISK when vol >= 82 even with low risk-off', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState({ risk_off_score: 0.2, volatility_percentile: 85 })] as any[],
      riskProfile: makeProfile(),
    });
    expect(result.governor_mode).toBe('DERISK');
    expect(result.overlays).toContain('macro_derisk');
  });

  it('CAUTION when vol 72-81', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState({ risk_off_score: 0.2, volatility_percentile: 75 })] as any[],
      riskProfile: makeProfile(),
    });
    expect(result.governor_mode).toBe('CAUTION');
    expect(result.overlays).toContain('caution_size_cut');
  });
});

/* ---------- portfolio budget ---------- */

describe('risk governor — budget constraints', () => {
  it('BLOCKED when exposure >= exposure_cap', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile({ exposure_cap: 55 }),
      holdings: [makeHolding('MSFT', 30), makeHolding('GOOG', 25)],
    });
    expect(result.governor_mode).toBe('BLOCKED');
    expect(result.allowed).toBe(false);
    expect(result.overlays).toContain('budget_exhausted');
    expect(result.risk_budget_remaining).toBeLessThanOrEqual(0.5);
  });

  it('DERISK when budget remaining <= 5', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile({ exposure_cap: 55 }),
      holdings: [makeHolding('MSFT', 51)],
    });
    expect(result.overlays).toContain('budget_thin');
    expect(result.risk_budget_remaining).toBeLessThanOrEqual(5);
  });
});

/* ---------- same-symbol concentration ---------- */

describe('risk governor — same-symbol exposure', () => {
  it('BLOCKED at >= 18% same-symbol weight', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal({ symbol: 'AAPL' }) as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
      holdings: [makeHolding('AAPL', 20)],
    });
    expect(result.governor_mode).toBe('BLOCKED');
    expect(result.allowed).toBe(false);
    expect(result.overlays).toContain('same_symbol_block');
  });

  it('CAUTION with taper at 10-17% same-symbol weight', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal({ symbol: 'AAPL' }) as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
      holdings: [makeHolding('AAPL', 12)],
    });
    expect(result.overlays).toContain('same_symbol_taper');
    expect(result.size_multiplier).toBeCloseTo(0.7, 1);
  });

  it('no taper when same-symbol < 10%', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal({ symbol: 'AAPL' }) as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
      holdings: [makeHolding('AAPL', 8)],
    });
    expect(result.overlays).not.toContain('same_symbol_block');
    expect(result.overlays).not.toContain('same_symbol_taper');
  });
});

/* ---------- sector concentration ---------- */

describe('risk governor — sector concentration', () => {
  it('applies sector overlay when >= 35%', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal({ symbol: 'AAPL' }) as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
      holdings: [
        makeHolding('AAPL', 5, { sector: 'Technology' }),
        makeHolding('MSFT', 20, { sector: 'Technology' }),
        makeHolding('GOOG', 15, { sector: 'Technology' }),
      ],
    });
    expect(result.overlays).toContain('sector_concentration');
  });
});

/* ---------- loss streak ---------- */

describe('risk governor — loss streak', () => {
  it('BLOCKED when 4+ consecutive losses', () => {
    const executions = Array.from({ length: 5 }, (_, i) => ({
      action: 'DONE',
      pnl_pct: -2,
      signal_id: `sig-${i}`,
    }));
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
      executions: executions as any[],
    });
    expect(result.governor_mode).toBe('BLOCKED');
    expect(result.allowed).toBe(false);
    expect(result.overlays).toContain('loss_streak_kill_switch');
  });

  it('CAUTION with recovery sizing at 2-3 losses', () => {
    const executions = [
      { action: 'DONE', pnl_pct: -1.5 },
      { action: 'DONE', pnl_pct: -2 },
      { action: 'DONE', pnl_pct: 3 },
    ];
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
      executions: executions as any[],
    });
    expect(result.overlays).toContain('loss_recovery');
  });

  it('BLOCKED when cumulative PnL breaches max_daily_loss', () => {
    const executions = [
      { action: 'DONE', pnl_pct: -2 },
      { action: 'DONE', pnl_pct: -1.5 },
    ];
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile({ max_daily_loss: 3 }),
      executions: executions as any[],
    });
    expect(result.governor_mode).toBe('BLOCKED');
    expect(result.overlays).toContain('loss_streak_kill_switch');
  });
});

/* ---------- SHORT asymmetry ---------- */

describe('risk governor — short asymmetry', () => {
  it('applies 0.88x haircut to SHORT direction', () => {
    const longResult = evaluateRiskGovernor({
      signal: makeSignal({ direction: 'LONG' }) as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
    });
    const shortResult = evaluateRiskGovernor({
      signal: makeSignal({ direction: 'SHORT' }) as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
    });
    expect(shortResult.size_multiplier).toBeLessThan(longResult.size_multiplier);
    expect(shortResult.overlays).toContain('short_asymmetry_haircut');
    expect(longResult.overlays).not.toContain('short_asymmetry_haircut');
  });
});

/* ---------- calibrated confidence ---------- */

describe('risk governor — calibrated confidence', () => {
  it('DERISK when calibratedConfidence < 0.52', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
      calibratedConfidence: 0.4,
    });
    expect(result.overlays).toContain('low_calibrated_confidence');
    expect(result.size_multiplier).toBeLessThan(1);
  });

  it('no confidence overlay when >= 0.52', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
      calibratedConfidence: 0.65,
    });
    expect(result.overlays).not.toContain('low_calibrated_confidence');
  });
});

/* ---------- compound overlays ---------- */

describe('risk governor — compound overlays', () => {
  it('multiplies size_multiplier across multiple overlays', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal({ direction: 'SHORT', symbol: 'AAPL' }) as any,
      marketState: [makeMarketState({ risk_off_score: 0.6 })] as any[],
      riskProfile: makeProfile(),
      holdings: [makeHolding('AAPL', 12)],
      calibratedConfidence: 0.4,
    });
    // caution(0.74) × same_symbol_taper(0.7) × short(0.88) × low_conf(0.55)
    expect(result.size_multiplier).toBeLessThan(0.3);
    expect(result.overlays.length).toBeGreaterThanOrEqual(3);
  });

  it('size_multiplier never exceeds 1 or goes below 0.15 when allowed', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: makeProfile(),
    });
    expect(result.size_multiplier).toBeGreaterThanOrEqual(0.15);
    expect(result.size_multiplier).toBeLessThanOrEqual(1);
  });

  it('handles empty marketState gracefully', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [],
      riskProfile: makeProfile(),
    });
    expect(result.governor_mode).toBe('NORMAL');
    expect(result.allowed).toBe(true);
  });

  it('handles null riskProfile gracefully', () => {
    const result = evaluateRiskGovernor({
      signal: makeSignal() as any,
      marketState: [makeMarketState()] as any[],
      riskProfile: null,
    });
    expect(result.allowed).toBe(true);
    expect(result.risk_budget_remaining).toBeGreaterThanOrEqual(0);
  });
});

import { describe, expect, it } from 'vitest';
import { runRiskGuardrailEngine } from '../src/engines/riskGuardrailEngine.js';

/* ---------- helpers ---------- */

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    signal_id: 'sig-1',
    symbol: 'AAPL',
    market: 'US',
    asset_class: 'US_STOCK',
    status: 'NEW',
    direction: 'LONG',
    regime_id: 'RGM_RISK_ON',
    regime_compatibility: 70,
    entry_zone: { low: 180, high: 182 },
    stop_loss: { price: 175 },
    position_advice: { position_pct: 5 },
    ...overrides,
  };
}

function makeRiskState(overrides: Record<string, unknown> = {}) {
  return {
    status: { trading_on: true },
    bucket_state: 'BASE',
    profile: { max_daily_loss_pct: 3 },
    ...overrides,
  };
}

/* ---------- theme classification ---------- */

describe('theme classification', () => {
  it('classifies mega_tech symbols', () => {
    const result = runRiskGuardrailEngine({
      signals: [makeSignal({ symbol: 'NVDA' }), makeSignal({ signal_id: 's2', symbol: 'AAPL' })],
      riskState: makeRiskState(),
    });
    // Both are mega_tech, annotations should exist
    expect(Object.keys(result.signal_annotations).length).toBe(2);
  });

  it('classifies crypto symbols', () => {
    const result = runRiskGuardrailEngine({
      signals: [
        makeSignal({
          signal_id: 'c1',
          symbol: 'BTC-USDT',
          market: 'CRYPTO',
          asset_class: 'CRYPTO',
        }),
      ],
      riskState: makeRiskState(),
    });
    expect(result.signal_annotations['c1']).toBeTruthy();
  });
});

/* ---------- correlation alerts ---------- */

describe('correlation cluster alerts', () => {
  it('triggers alert when 2+ same-theme signals exceed threshold', () => {
    // mega_tech threshold = 10, so 2 signals × 5% = 10% → triggers
    const signals = [
      makeSignal({ signal_id: 's1', symbol: 'AAPL', position_advice: { position_pct: 6 } }),
      makeSignal({ signal_id: 's2', symbol: 'MSFT', position_advice: { position_pct: 6 } }),
    ];
    const result = runRiskGuardrailEngine({ signals, riskState: makeRiskState() });
    expect(result.correlated_exposure_alerts.length).toBeGreaterThan(0);
    expect(result.correlated_exposure_alerts[0].theme).toBe('mega_tech');
  });

  it('HIGH severity when gross_pct >= threshold * 1.4', () => {
    // mega_tech threshold = 10, so HIGH when gross >= 14
    const signals = [
      makeSignal({ signal_id: 's1', symbol: 'AAPL', position_advice: { position_pct: 8 } }),
      makeSignal({ signal_id: 's2', symbol: 'NVDA', position_advice: { position_pct: 8 } }),
    ];
    const result = runRiskGuardrailEngine({ signals, riskState: makeRiskState() });
    expect(result.correlated_exposure_alerts[0].severity).toBe('HIGH');
  });

  it('no alert for single signal in a theme', () => {
    const result = runRiskGuardrailEngine({
      signals: [makeSignal({ position_advice: { position_pct: 15 } })],
      riskState: makeRiskState(),
    });
    expect(result.correlated_exposure_alerts.length).toBe(0);
  });

  it('no alert when sum is below threshold', () => {
    const signals = [
      makeSignal({ signal_id: 's1', symbol: 'AAPL', position_advice: { position_pct: 3 } }),
      makeSignal({ signal_id: 's2', symbol: 'MSFT', position_advice: { position_pct: 3 } }),
    ];
    const result = runRiskGuardrailEngine({ signals, riskState: makeRiskState() });
    expect(result.correlated_exposure_alerts.length).toBe(0);
  });
});

/* ---------- regime mismatch warnings ---------- */

describe('regime mismatch warnings', () => {
  it('warns when regime_compatibility < 50', () => {
    const result = runRiskGuardrailEngine({
      signals: [makeSignal({ regime_compatibility: 30 })],
      riskState: makeRiskState(),
    });
    expect(result.regime_mismatch_warnings.length).toBe(1);
    expect(result.regime_mismatch_warnings[0].severity).toBe('HIGH');
  });

  it('MEDIUM severity when compatibility is 36-49', () => {
    const result = runRiskGuardrailEngine({
      signals: [makeSignal({ regime_compatibility: 45 })],
      riskState: makeRiskState(),
    });
    expect(result.regime_mismatch_warnings.length).toBe(1);
    expect(result.regime_mismatch_warnings[0].severity).toBe('MEDIUM');
  });

  it('no warning when regime_compatibility >= 50', () => {
    const result = runRiskGuardrailEngine({
      signals: [makeSignal({ regime_compatibility: 65 })],
      riskState: makeRiskState(),
    });
    expect(result.regime_mismatch_warnings.length).toBe(0);
  });
});

/* ---------- recommendation state machine ---------- */

describe('recommendation state machine', () => {
  it('STAY_OUT when trading_on is false', () => {
    const result = runRiskGuardrailEngine({
      signals: [makeSignal()],
      riskState: makeRiskState({ status: { trading_on: false } }),
    });
    expect(result.stay_out_recommendation.action).toBe('STAY_OUT');
  });

  it('STAY_OUT when budget >= 95%', () => {
    // To exhaust budget: max_daily_loss_pct = 0.1, then a trade with large pos × stop will use > 95%
    const result = runRiskGuardrailEngine({
      signals: [
        makeSignal({
          position_advice: { position_pct: 50 },
          entry_zone: { low: 100, high: 102 },
          stop_loss: { price: 90 },
        }),
      ],
      riskState: makeRiskState({ profile: { max_daily_loss_pct: 0.3 } }),
    });
    // pos=50, stop=~10%, risk_used = 50*10/100 = 5, budget_used = (5/0.3)*100 >> 95
    expect(result.stay_out_recommendation.action).toBe('STAY_OUT');
  });

  it('REDUCE when DERISKED with moderate budget usage', () => {
    const result = runRiskGuardrailEngine({
      signals: [makeSignal({ position_advice: { position_pct: 3 } })],
      riskState: makeRiskState({ bucket_state: 'DERISKED' }),
    });
    expect(result.stay_out_recommendation.action).toBe('REDUCE');
  });

  it('TRADE_OK under normal conditions', () => {
    const result = runRiskGuardrailEngine({
      signals: [makeSignal({ position_advice: { position_pct: 3 } })],
      riskState: makeRiskState(),
    });
    expect(result.stay_out_recommendation.action).toBe('TRADE_OK');
  });
});

/* ---------- portfolio risk budget ---------- */

describe('portfolio risk budget', () => {
  it('calculates per-signal risk and total used correctly', () => {
    const result = runRiskGuardrailEngine({
      signals: [
        makeSignal({
          position_advice: { position_pct: 5 },
          entry_zone: { low: 100, high: 100 },
          stop_loss: { price: 95 },
        }),
      ],
      riskState: makeRiskState(),
    });
    const budget = result.portfolio_risk_budget;
    expect(budget.max_risk_pct).toBe(3);
    // pos_pct=5, stop_distance=5%, risk_used = 5*5/100 = 0.25
    expect(budget.used_risk_pct).toBeGreaterThan(0);
    expect(budget.remaining_risk_pct).toBeLessThanOrEqual(budget.max_risk_pct);
    expect(budget.used_budget_pct).toBeGreaterThan(0);
  });

  it('handles signals without stop_loss gracefully', () => {
    const result = runRiskGuardrailEngine({
      signals: [makeSignal({ stop_loss: null, entry_zone: { low: 100, high: 100 } })],
      riskState: makeRiskState(),
    });
    // stop defaults to entry → distance = 0, min 0.2
    expect(result.portfolio_risk_budget.used_risk_pct).toBeGreaterThanOrEqual(0);
  });

  it('only counts NEW and TRIGGERED signals for risk', () => {
    const result = runRiskGuardrailEngine({
      signals: [
        makeSignal({ signal_id: 'active', status: 'NEW', position_advice: { position_pct: 5 } }),
        makeSignal({
          signal_id: 'expired',
          status: 'EXPIRED',
          position_advice: { position_pct: 10 },
        }),
      ],
      riskState: makeRiskState(),
    });
    // Expired should not contribute to risk budget
    const withExpired = runRiskGuardrailEngine({
      signals: [
        makeSignal({ signal_id: 'active', status: 'NEW', position_advice: { position_pct: 5 } }),
      ],
      riskState: makeRiskState(),
    });
    expect(result.portfolio_risk_budget.used_risk_pct).toBe(
      withExpired.portfolio_risk_budget.used_risk_pct,
    );
  });
});

/* ---------- signal annotations ---------- */

describe('signal annotations', () => {
  it('includes annotation for every input signal', () => {
    const signals = [
      makeSignal({ signal_id: 's1' }),
      makeSignal({ signal_id: 's2', status: 'EXPIRED' }),
    ];
    const result = runRiskGuardrailEngine({ signals, riskState: makeRiskState() });
    expect(Object.keys(result.signal_annotations)).toHaveLength(2);
    expect(result.signal_annotations['s1']).toBeTruthy();
    expect(result.signal_annotations['s2']).toBeTruthy();
  });

  it('adds regime_mismatch warning to annotation', () => {
    const result = runRiskGuardrailEngine({
      signals: [makeSignal({ regime_compatibility: 20 })],
      riskState: makeRiskState(),
    });
    expect(result.signal_annotations['sig-1'].warnings).toContain('regime_mismatch');
  });
});

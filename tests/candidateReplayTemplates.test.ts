import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { runCandidateBarReplay } from '../src/research/discovery/candidateReplay.js';

function toBar(ts: number, close: number, prevClose: number, volume = 1_000_000) {
  const open = prevClose;
  const high = Math.max(open, close) * 1.004;
  const low = Math.min(open, close) * 0.996;
  return {
    ts_open: Date.UTC(2026, 0, 1) + ts * 86_400_000,
    open,
    high,
    low,
    close,
    volume,
  };
}

function buildResidualMomentumBars(count = 140) {
  const rows = [];
  let price = 100;
  for (let idx = 0; idx < count; idx += 1) {
    const prev = price;
    const dailyMove = idx < 70 ? 0.0006 : idx % 11 === 0 ? -0.002 : 0.0022;
    price *= 1 + dailyMove;
    rows.push(toBar(idx, price, prev));
  }
  return rows;
}

function buildCrashReboundBars(count = 108) {
  const rows = [];
  let price = 100;
  for (let idx = 0; idx < count; idx += 1) {
    const prev = price;
    if (idx < 55) {
      price *= 1.0014;
    } else if (idx < 83) {
      price *= 0.981;
    } else {
      price *= 1.023;
    }
    rows.push(toBar(idx, price, prev, idx >= 83 ? 1_400_000 : 1_000_000));
  }
  return rows;
}

describe('candidate OHLCV replay public-template interpreters', () => {
  it('uses residual-momentum semantics instead of erasing the template into generic momentum', () => {
    const result = runCandidateBarReplay({
      candidate: {
        candidate_id: 'resmom-candidate',
        hypothesis_id: 'HYP-PUBLIC-RESMOM-001',
        template_id: 'TPL-PUBLIC-RESMOM-01',
        template_name: 'Residual momentum continuation',
        supporting_features: ['residual_return_60d', 'idiosyncratic_volatility'],
        parameter_set: {
          min_residual_return: 0.004,
        },
        expected_holding_horizon: '5-10 bars',
      },
      barSets: [{ market: 'US', symbol: 'LOWBETA', bars: buildResidualMomentumBars() }],
      config: { cost_bps_round_trip: 16 },
    });

    expect(result.replay_family).toBe('residual_momentum');
    expect(result.closed_trades).toBeGreaterThan(2);
    expect(result.symbols_with_trades).toBe(1);
  });

  it('de-risks crash-aware momentum during violent local drawdown and snapback windows', () => {
    const bars = buildCrashReboundBars();
    const generic = runCandidateBarReplay({
      candidate: {
        candidate_id: 'generic-momentum',
        template_id: 'TMP-GENERIC-MOM',
        template_name: 'Breakout momentum',
        expected_holding_horizon: '4-8 bars',
      },
      barSets: [{ market: 'US', symbol: 'REBOUND', bars }],
      config: { cost_bps_round_trip: 16 },
    });
    const crashAware = runCandidateBarReplay({
      candidate: {
        candidate_id: 'crash-aware',
        hypothesis_id: 'HYP-PUBLIC-MOM-CRASH-AWARE-001',
        template_id: 'TPL-PUBLIC-MOM-CRASH-AWARE-01',
        template_name: 'Momentum crash aware trend',
        supporting_features: ['market_drawdown_60d', 'market_rebound_5d'],
        parameter_set: {
          market_drawdown_trigger: 0.12,
          max_rebound_5d: 0.04,
        },
        expected_holding_horizon: '4-8 bars',
      },
      barSets: [{ market: 'US', symbol: 'REBOUND', bars }],
      config: { cost_bps_round_trip: 16 },
    });

    expect(generic.closed_trades).toBeGreaterThan(0);
    expect(generic.replay_family).toBe('momentum');
    expect(crashAware.replay_family).toBe('crash_aware_momentum');
    expect(crashAware.closed_trades).toBeLessThan(generic.closed_trades);
  });
});

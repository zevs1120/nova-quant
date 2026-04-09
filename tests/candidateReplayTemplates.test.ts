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

function buildPanelTrendBars(args: {
  count?: number;
  drift: number;
  shockEvery?: number;
  shock?: number;
}) {
  const rows = [];
  let price = 100;
  const count = args.count || 150;
  for (let idx = 0; idx < count; idx += 1) {
    const prev = price;
    const shock = args.shockEvery && idx > 35 && idx % args.shockEvery === 0 ? args.shock || 0 : 0;
    price *= 1 + args.drift + shock;
    rows.push(toBar(idx, price, prev));
  }
  return rows;
}

function buildAnchorBars(count = 290) {
  const rows = [];
  let price = 100;
  for (let idx = 0; idx < count; idx += 1) {
    const prev = price;
    if (idx < 180) {
      price *= 1.0006;
    } else if (idx < 230) {
      price *= 0.998;
    } else {
      price *= 1.004;
    }
    rows.push(toBar(idx, price, prev));
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

  it('uses cross-sectional rank for low-volatility relative-strength candidates', () => {
    const lowVolWinner = buildPanelTrendBars({ drift: 0.002, shockEvery: 23, shock: -0.001 });
    const highVolWinner = buildPanelTrendBars({ drift: 0.0023, shockEvery: 6, shock: -0.022 });
    const loser = buildPanelTrendBars({ drift: -0.0003, shockEvery: 17, shock: 0.003 });

    const result = runCandidateBarReplay({
      candidate: {
        candidate_id: 'low-vol-rs',
        hypothesis_id: 'HYP-PUBLIC-LOWVOL-RS-001',
        template_id: 'TPL-PUBLIC-LOWVOL-RS-01',
        template_name: 'Low-volatility relative strength',
        supporting_features: ['relative_strength', 'realized_volatility_rank'],
        parameter_set: {
          relative_strength_cutoff: 0.55,
          realized_vol_rank_cap: 0.45,
        },
        expected_holding_horizon: '5-12 bars',
      },
      barSets: [
        { market: 'US', symbol: 'LOWVOL_WINNER', bars: lowVolWinner },
        { market: 'US', symbol: 'HIGHVOL_WINNER', bars: highVolWinner },
        { market: 'US', symbol: 'LOSER', bars: loser },
      ],
      config: { cost_bps_round_trip: 16 },
    });

    expect(result.replay_family).toBe('low_vol_relative_strength');
    expect(result.closed_trades).toBeGreaterThan(2);
    expect(result.symbol_summaries.map((row: any) => row.symbol)).toContain('LOWVOL_WINNER');
    expect(result.symbol_summaries.map((row: any) => row.symbol)).not.toContain('LOSER');
  });

  it('replays 52-week-high anchor candidates as anchor continuation rather than generic breakout', () => {
    const result = runCandidateBarReplay({
      candidate: {
        candidate_id: 'high-anchor',
        hypothesis_id: 'HYP-PUBLIC-52WH-001',
        template_id: 'TPL-PUBLIC-52WH-01',
        template_name: '52-week high anchor momentum',
        supporting_features: ['distance_to_52w_high', 'relative_strength'],
        parameter_set: {
          anchor_distance_max_pct: 12,
          relative_strength_cutoff: 0.55,
        },
        expected_holding_horizon: '8-16 bars',
      },
      barSets: [{ market: 'US', symbol: 'ANCHOR', bars: buildAnchorBars() }],
      config: { cost_bps_round_trip: 16 },
    });

    expect(result.replay_family).toBe('high_anchor_momentum');
    expect(result.closed_trades).toBeGreaterThan(1);
    expect(result.sample_trades.every((trade: any) => trade.direction === 'LONG')).toBe(true);
  });
});

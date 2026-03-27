import { describe, expect, it } from 'vitest';
// @ts-ignore runtime JS import
import { buildPortfolioSimulationEngine } from '../src/portfolio_simulation/portfolioSimulationEngine.js';

function makeEvidenceRow(args: {
  id: string;
  family: string;
  market: 'US' | 'CRYPTO';
  baseReturn: number;
  drawdown: number;
  turnover: number;
  quality: number;
  oosReturn: number;
  positiveRatio: number;
  diversification: number;
  signalCount: number;
  regimes: string[];
  currentStage?: string;
}) {
  return {
    strategy_id: args.id,
    candidate_id: `cand-${args.id}`,
    template_id: args.family,
    audit_chain: {
      template: args.family,
    },
    production_recommendation: {
      recommendation: 'HOLD_FOR_RETEST',
    },
    validation_summary: {
      candidate_quality_score: args.quality,
      stage_metrics: {
        stage_1_fast_sanity: {
          estimated_signal_count: args.signalCount,
          estimated_turnover: args.turnover,
        },
        stage_2_quick_backtest: {
          return: args.baseReturn,
          drawdown: args.drawdown,
          turnover: args.turnover,
          average_holding_time: args.market === 'CRYPTO' ? 4 : 6,
          funding_bps_per_day: args.market === 'CRYPTO' ? 1.2 : 0,
          execution_assumption_profile: {
            profile_id: 'exec-realism.paper.v2',
            mode: 'paper',
            market: args.market,
          },
        },
        stage_3_robustness_tests: {
          perturbation_return_std: args.drawdown * 0.05,
          cost_stress: {
            plus_50pct_cost: args.oosReturn - args.turnover * 0.006,
          },
          execution_realism_profile: {
            profile_id: 'exec-realism.paper.v2',
            mode: 'paper',
            market: args.market,
          },
        },
        stage_4_walkforward: {
          window_count: 5,
          positive_window_ratio: args.positiveRatio,
          avg_test_return: args.oosReturn,
          degradation: args.positiveRatio < 0.6 ? -0.03 : -0.005,
          windows: Array.from({ length: 5 }, (_, index) => ({
            window_id: `wf-${index + 1}`,
            test_return: args.oosReturn * (1 - index * 0.03),
            drawdown: args.drawdown * (0.95 + index * 0.03),
          })),
        },
        stage_5_portfolio_contribution: {
          diversification_score: args.diversification,
          independent_alpha_score: args.diversification * 0.08,
        },
      },
    },
    regime_performance: {
      expected_regimes: args.regimes,
    },
    walk_forward_results: {
      summary: {
        window_count: 5,
        positive_window_ratio: args.positiveRatio,
        avg_test_return: args.oosReturn,
        degradation: args.positiveRatio < 0.6 ? -0.03 : -0.005,
      },
    },
    governance_state: {
      current_stage: args.currentStage || 'DRAFT',
      operational_confidence: args.quality,
    },
    cost_sensitivity: {
      validation_cost_stress: {
        plus_50pct_cost: args.oosReturn - args.turnover * 0.006,
      },
    },
    linked_product_recommendation:
      args.market === 'CRYPTO'
        ? {
            asset: 'BTCUSDT',
            suggested_size_pct: 4,
          }
        : {
            asset: 'SPY',
            suggested_size_pct: 4,
          },
  };
}

function naivePoolSharpe(rows: Array<Record<string, any>>) {
  const candidates = rows.map((row) => {
    const quick = row.validation_summary?.stage_metrics?.stage_2_quick_backtest || {};
    const walk = row.walk_forward_results?.summary || {};
    const market = String(quick.execution_assumption_profile?.market || 'US').toUpperCase();
    return {
      market,
      expected_return:
        Number(walk.avg_test_return || 0) -
        Number(quick.turnover || 0) * 0.03 -
        Number(quick.drawdown || 0) * 0.12,
      volatility: Number(quick.drawdown || 0) * 0.8 + Number(quick.turnover || 0) * 0.09,
    };
  });
  const n = Math.max(1, candidates.length);
  const weight = 1 / n;
  let portfolioReturn = 0;
  let variance = 0;

  for (const row of candidates) {
    portfolioReturn += weight * row.expected_return;
  }
  for (const left of candidates) {
    for (const right of candidates) {
      const corr = left === right ? 1 : left.market === right.market ? 0.74 : 0.48;
      variance += weight * weight * left.volatility * right.volatility * corr;
    }
  }
  const volatility = Math.sqrt(Math.max(variance, 1e-9));
  return (portfolioReturn / volatility) * Math.sqrt(252);
}

describe('portfolio simulation sharpe upgrade', () => {
  it('lifts a noisy mixed pool to sharpe >= 1.2 through structural filtering and risk parity', () => {
    const evidenceSystem = {
      strategies: [
        makeEvidenceRow({
          id: 'good-us-1',
          family: 'TPL-TREND-US-1',
          market: 'US',
          baseReturn: 0.1,
          drawdown: 0.09,
          turnover: 0.18,
          quality: 0.86,
          oosReturn: 0.082,
          positiveRatio: 0.92,
          diversification: 0.82,
          signalCount: 8,
          regimes: ['high_volatility', 'transition'],
          currentStage: 'PROD',
        }),
        makeEvidenceRow({
          id: 'good-us-2',
          family: 'TPL-TREND-US-2',
          market: 'US',
          baseReturn: 0.092,
          drawdown: 0.085,
          turnover: 0.16,
          quality: 0.84,
          oosReturn: 0.076,
          positiveRatio: 0.88,
          diversification: 0.78,
          signalCount: 7,
          regimes: ['high_volatility', 'range_high_vol'],
          currentStage: 'PROD',
        }),
        makeEvidenceRow({
          id: 'good-crypto-1',
          family: 'TPL-CR-TREND-1',
          market: 'CRYPTO',
          baseReturn: 0.115,
          drawdown: 0.1,
          turnover: 0.2,
          quality: 0.88,
          oosReturn: 0.091,
          positiveRatio: 0.9,
          diversification: 0.8,
          signalCount: 9,
          regimes: ['high_volatility', 'transition'],
          currentStage: 'PROD',
        }),
        makeEvidenceRow({
          id: 'good-crypto-2',
          family: 'TPL-CR-TREND-2',
          market: 'CRYPTO',
          baseReturn: 0.104,
          drawdown: 0.094,
          turnover: 0.22,
          quality: 0.83,
          oosReturn: 0.078,
          positiveRatio: 0.84,
          diversification: 0.76,
          signalCount: 9,
          regimes: ['high_volatility'],
          currentStage: 'PROD',
        }),
        makeEvidenceRow({
          id: 'bad-us-1',
          family: 'TPL-NOISE-US-1',
          market: 'US',
          baseReturn: 0.03,
          drawdown: 0.22,
          turnover: 0.72,
          quality: 0.64,
          oosReturn: 0.01,
          positiveRatio: 0.48,
          diversification: 0.42,
          signalCount: 22,
          regimes: ['trend'],
        }),
        makeEvidenceRow({
          id: 'bad-us-2',
          family: 'TPL-NOISE-US-2',
          market: 'US',
          baseReturn: 0.026,
          drawdown: 0.24,
          turnover: 0.78,
          quality: 0.62,
          oosReturn: 0.006,
          positiveRatio: 0.45,
          diversification: 0.38,
          signalCount: 26,
          regimes: ['trend'],
        }),
        makeEvidenceRow({
          id: 'bad-us-3',
          family: 'TPL-NOISE-US-3',
          market: 'US',
          baseReturn: 0.018,
          drawdown: 0.2,
          turnover: 0.66,
          quality: 0.6,
          oosReturn: 0.004,
          positiveRatio: 0.42,
          diversification: 0.4,
          signalCount: 19,
          regimes: ['trend'],
        }),
        makeEvidenceRow({
          id: 'bad-crypto-1',
          family: 'TPL-NOISE-CR-1',
          market: 'CRYPTO',
          baseReturn: 0.04,
          drawdown: 0.28,
          turnover: 0.82,
          quality: 0.63,
          oosReturn: 0.008,
          positiveRatio: 0.46,
          diversification: 0.36,
          signalCount: 28,
          regimes: ['trend'],
        }),
        makeEvidenceRow({
          id: 'bad-crypto-2',
          family: 'TPL-NOISE-CR-2',
          market: 'CRYPTO',
          baseReturn: 0.034,
          drawdown: 0.26,
          turnover: 0.76,
          quality: 0.61,
          oosReturn: 0.007,
          positiveRatio: 0.43,
          diversification: 0.34,
          signalCount: 24,
          regimes: ['trend'],
        }),
        makeEvidenceRow({
          id: 'bad-crypto-3',
          family: 'TPL-NOISE-CR-3',
          market: 'CRYPTO',
          baseReturn: 0.028,
          drawdown: 0.24,
          turnover: 0.69,
          quality: 0.59,
          oosReturn: 0.005,
          positiveRatio: 0.41,
          diversification: 0.33,
          signalCount: 21,
          regimes: ['trend'],
        }),
      ],
    };

    const sim = buildPortfolioSimulationEngine({
      asOf: '2026-03-08T00:00:00.000Z',
      evidenceSystem,
      regimeState: {
        state: {
          primary: 'high_volatility',
          combined: 'range_high_vol',
          recommended_user_posture: 'REDUCE',
          default_sizing_multiplier: 0.56,
        },
      },
      riskBucketSystem: {
        user_risk_bucket: {
          total_exposure_cap_pct: 55,
          correlated_exposure_cap_pct: 22,
        },
      },
      executionRealism: {
        mode: 'paper',
      },
    });

    const lift = sim?.diagnostics?.sharpe_optimization;
    const baselineSharpe = naivePoolSharpe(evidenceSystem.strategies);
    expect(lift).toBeTruthy();
    expect(baselineSharpe).toBeLessThan(1);
    expect(lift?.optimized?.sharpe).toBeGreaterThanOrEqual(1.2);
    expect(lift?.uplift?.sharpe).toBeGreaterThan(0.3);
    expect(lift?.filtering?.rejected_candidates).toBeGreaterThan(0);
    expect(sim?.metrics?.sharpe).toBeGreaterThanOrEqual(1.2);
  });
});

import { describe, expect, it } from 'vitest';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import {
  generateNovaProductionStrategyPack,
  type NumericBar,
} from '../src/server/nova/productionStrategyPack.js';

function getRepo() {
  const db = getDb();
  ensureSchema(db);
  return new MarketRepository(db);
}

function buildTrendBars(args: {
  count: number;
  startPrice: number;
  intervalMs: number;
  baseVolume: number;
  drift: number;
  pulseEvery: number;
}): NumericBar[] {
  const bars: NumericBar[] = [];
  let price = args.startPrice;
  const startTs = Date.UTC(2023, 0, 1);
  for (let i = 0; i < args.count; i += 1) {
    const pulse = i % args.pulseEvery === 0 ? 0.018 : 0;
    const pullback = i % 37 >= 29 && i % 37 <= 32 ? -0.006 : 0;
    const noise = ((i % 11) - 5) * 0.0007;
    const ret = args.drift + pulse + pullback + noise;
    const open = price;
    const close = Math.max(1, open * (1 + ret));
    const high = Math.max(open, close) * (1 + 0.006 + (i % 3) * 0.0008);
    const low = Math.min(open, close) * (1 - 0.005 - (i % 4) * 0.0006);
    const volumeBoost = i % args.pulseEvery === 0 ? 1.9 : i % 9 === 0 ? 1.25 : 1;
    bars.push({
      ts_open: startTs + i * args.intervalMs,
      open,
      high,
      low,
      close,
      volume: args.baseVolume * volumeBoost * (1 + (i % 5) * 0.04),
      source: 'vitest-synth',
    });
    price = close;
  }
  return bars;
}

describe('nova production strategy pack', () => {
  it('builds a full A-M production strategy pack from injected market data', async () => {
    const repo = getRepo();
    const result = await generateNovaProductionStrategyPack({
      repo,
      market: 'ALL',
      riskProfile: 'balanced',
      symbolBarsByMarket: {
        US: {
          SPY: buildTrendBars({
            count: 340,
            startPrice: 100,
            intervalMs: 24 * 60 * 60 * 1000,
            baseVolume: 1_500_000,
            drift: 0.0016,
            pulseEvery: 21,
          }),
          QQQ: buildTrendBars({
            count: 340,
            startPrice: 210,
            intervalMs: 24 * 60 * 60 * 1000,
            baseVolume: 1_700_000,
            drift: 0.0018,
            pulseEvery: 18,
          }),
        },
        CRYPTO: {
          BTCUSDT: buildTrendBars({
            count: 420,
            startPrice: 25_000,
            intervalMs: 4 * 60 * 60 * 1000,
            baseVolume: 60_000_000,
            drift: 0.0013,
            pulseEvery: 16,
          }),
          ETHUSDT: buildTrendBars({
            count: 420,
            startPrice: 1_800,
            intervalMs: 4 * 60 * 60 * 1000,
            baseVolume: 35_000_000,
            drift: 0.0015,
            pulseEvery: 14,
          }),
        },
      },
    });

    expect(result.markets.length).toBe(2);
    expect(result.combined_portfolio.metrics).toBeTruthy();
    expect(result.markdown_report).toContain('A. Strategy Hypothesis');
    for (const key of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']) {
      expect(result.sections[key]).toBeTruthy();
      expect(result.sections[key].bullets.length).toBeGreaterThan(0);
    }
    for (const marketPack of result.markets) {
      expect(marketPack.grid_results.length).toBeGreaterThanOrEqual(4);
      expect(marketPack.backtest.trades.length).toBeGreaterThan(0);
      expect(marketPack.walk_forward.windows.length).toBeGreaterThan(0);
      expect(marketPack.monte_carlo.simulations).toBeGreaterThan(0);
      expect(marketPack.backtest.diagnostics.future_leak_violations).toBe(0);
      expect(marketPack.overfit_audit).toBeTruthy();
      expect(marketPack.overfit_audit.robust_parameter_intervals.length).toBeGreaterThan(0);
      expect(marketPack.overfit_audit.parameter_heatmap.total_cells).toBeGreaterThan(0);
      expect(marketPack.overfit_audit.cross_asset_validation.length).toBeGreaterThan(0);
      expect(marketPack.overfit_audit.rolling_oos_pass_rate).toBeGreaterThanOrEqual(0);
      expect(marketPack.overfit_audit.perturbation_pass_rate).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps every entry strictly after the signal bar to prevent lookahead leakage', async () => {
    const repo = getRepo();
    const result = await generateNovaProductionStrategyPack({
      repo,
      market: 'US',
      riskProfile: 'balanced',
      symbolBarsByMarket: {
        US: {
          SPY: buildTrendBars({
            count: 320,
            startPrice: 100,
            intervalMs: 24 * 60 * 60 * 1000,
            baseVolume: 2_000_000,
            drift: 0.0018,
            pulseEvery: 20,
          }),
        },
      },
    });

    const trades = result.markets[0]?.backtest?.trades || [];
    expect(trades.length).toBeGreaterThan(0);
    for (const trade of trades) {
      expect(trade.entry_ts).toBeGreaterThan(trade.signal_ts);
      expect(trade.exit_ts).toBeGreaterThan(trade.entry_ts);
    }
  });

  it('shows worse or equal performance under harsher execution stress', async () => {
    const repo = getRepo();
    const result = await generateNovaProductionStrategyPack({
      repo,
      market: 'CRYPTO',
      riskProfile: 'balanced',
      symbolBarsByMarket: {
        CRYPTO: {
          BTCUSDT: buildTrendBars({
            count: 420,
            startPrice: 30_000,
            intervalMs: 4 * 60 * 60 * 1000,
            baseVolume: 70_000_000,
            drift: 0.0014,
            pulseEvery: 15,
          }),
          ETHUSDT: buildTrendBars({
            count: 420,
            startPrice: 2_000,
            intervalMs: 4 * 60 * 60 * 1000,
            baseVolume: 45_000_000,
            drift: 0.0016,
            pulseEvery: 13,
          }),
        },
      },
    });

    const marketPack = result.markets[0];
    expect(marketPack).toBeTruthy();
    const baseline = marketPack.scenario_sensitivity.find((row) => row.scenario_id === 'baseline');
    const stressed = marketPack.scenario_sensitivity.find(
      (row) => row.scenario_id === 'slippage_plus_50',
    );
    const delayScenario = marketPack.scenario_sensitivity.find(
      (row) => row.scenario_id === 'signal_delay_1bar',
    );

    expect(baseline).toBeTruthy();
    expect(stressed).toBeTruthy();
    expect(delayScenario).toBeTruthy();
    expect(stressed!.metrics.annual_return).toBeLessThanOrEqual(baseline!.metrics.annual_return);
    expect(stressed!.metrics.max_drawdown).toBeGreaterThanOrEqual(baseline!.metrics.max_drawdown);
    expect(delayScenario!.metrics.annual_return).toBeLessThanOrEqual(
      baseline!.metrics.annual_return,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import {
  runNovaRobustnessTraining,
  type NovaRobustnessTrainingTaskSpec,
} from '../src/server/nova/robustnessTraining.js';
import type { NumericBar } from '../src/server/nova/productionStrategyPack.js';

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

function buildSidewaysBars(args: {
  count: number;
  startPrice: number;
  intervalMs: number;
  baseVolume: number;
}): NumericBar[] {
  const bars: NumericBar[] = [];
  let price = args.startPrice;
  const startTs = Date.UTC(2023, 0, 1);
  for (let i = 0; i < args.count; i += 1) {
    const noise = ((i % 13) - 6) * 0.0008;
    const ret = noise;
    const open = price;
    const close = Math.max(1, open * (1 + ret));
    bars.push({
      ts_open: startTs + i * args.intervalMs,
      open,
      high: Math.max(open, close) * 1.004,
      low: Math.min(open, close) * 0.996,
      close,
      volume: args.baseVolume * (1 + (i % 5) * 0.03),
      source: 'vitest-synth',
    });
    price = close;
  }
  return bars;
}

describe('nova robustness training', () => {
  it('builds a runnable robustness-training report from sampled tasks', async () => {
    const repo = getRepo();
    const result = await runNovaRobustnessTraining({
      repo,
      market: 'ALL',
      taskLimit: 5,
      seed: 42,
      writeArtifacts: false,
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
          AAPL: buildTrendBars({
            count: 340,
            startPrice: 150,
            intervalMs: 24 * 60 * 60 * 1000,
            baseVolume: 1_900_000,
            drift: 0.0017,
            pulseEvery: 19,
          }),
          MSFT: buildTrendBars({
            count: 340,
            startPrice: 280,
            intervalMs: 24 * 60 * 60 * 1000,
            baseVolume: 1_800_000,
            drift: 0.00165,
            pulseEvery: 20,
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
          SOLUSDT: buildTrendBars({
            count: 420,
            startPrice: 100,
            intervalMs: 4 * 60 * 60 * 1000,
            baseVolume: 22_000_000,
            drift: 0.00145,
            pulseEvery: 15,
          }),
          BNBUSDT: buildTrendBars({
            count: 420,
            startPrice: 320,
            intervalMs: 4 * 60 * 60 * 1000,
            baseVolume: 18_000_000,
            drift: 0.0012,
            pulseEvery: 17,
          }),
        },
      },
    });

    expect(result.workflow_id).toContain('workflow-nova-robustness-');
    expect(result.tasks.length).toBe(5);
    expect(result.summary.task_count).toBe(5);
    expect(result.summary.completed_task_count).toBe(5);
    expect(result.summary.target_pass_rate).toBeGreaterThanOrEqual(0);
    expect(result.summary.target_pass_rate).toBeLessThanOrEqual(1);
    expect(result.summary.average_rolling_oos_pass_rate).toBeGreaterThanOrEqual(0);
    expect(result.summary.average_perturbation_pass_rate).toBeGreaterThanOrEqual(0);
    expect(result.promotion_gate.thresholds.target_pass_rate_min).toBeGreaterThan(0);
    expect(result.markdown_report).toContain('**Pass Rate**');
    expect(result.tasks.every((row) => row.status === 'SUCCEEDED')).toBe(true);
  });

  it('respects explicit task specs and preserves per-task labels', async () => {
    const repo = getRepo();
    const taskSpecs: NovaRobustnessTrainingTaskSpec[] = [
      {
        task_id: 'task-a',
        label: 'all-balanced-recent',
        market_scope: 'ALL',
        risk_profile: 'balanced',
        start: '2024-01-01',
        end: '2025-01-01',
        duration_days: 366,
        offset_days: 0,
      },
      {
        task_id: 'task-b',
        label: 'crypto-aggressive-fast',
        market_scope: 'CRYPTO',
        risk_profile: 'aggressive',
        symbols: ['BTCUSDT', 'ETHUSDT'],
        start: '2024-06-01',
        end: '2025-01-01',
        duration_days: 214,
        offset_days: 0,
      },
    ];

    const result = await runNovaRobustnessTraining({
      repo,
      writeArtifacts: false,
      taskSpecs,
      symbolBarsByMarket: {
        US: {
          SPY: buildTrendBars({
            count: 340,
            startPrice: 100,
            intervalMs: 24 * 60 * 60 * 1000,
            baseVolume: 1_400_000,
            drift: 0.0015,
            pulseEvery: 21,
          }),
        },
        CRYPTO: {
          BTCUSDT: buildTrendBars({
            count: 420,
            startPrice: 25_000,
            intervalMs: 4 * 60 * 60 * 1000,
            baseVolume: 60_000_000,
            drift: 0.0012,
            pulseEvery: 16,
          }),
          ETHUSDT: buildTrendBars({
            count: 420,
            startPrice: 1_800,
            intervalMs: 4 * 60 * 60 * 1000,
            baseVolume: 35_000_000,
            drift: 0.0014,
            pulseEvery: 14,
          }),
        },
      },
    });

    expect(result.tasks.map((row) => row.task.task_id)).toEqual(['task-a', 'task-b']);
    expect(result.tasks.map((row) => row.task.label)).toEqual([
      'all-balanced-recent',
      'crypto-aggressive-fast',
    ]);
    expect(result.summary.task_count).toBe(2);
  });

  it('keeps the promotion gate closed when sampled tasks are weak', async () => {
    const repo = getRepo();
    const result = await runNovaRobustnessTraining({
      repo,
      market: 'US',
      taskLimit: 3,
      seed: 7,
      writeArtifacts: false,
      symbolBarsByMarket: {
        US: {
          SPY: buildSidewaysBars({
            count: 340,
            startPrice: 100,
            intervalMs: 24 * 60 * 60 * 1000,
            baseVolume: 1_500_000,
          }),
          QQQ: buildSidewaysBars({
            count: 340,
            startPrice: 210,
            intervalMs: 24 * 60 * 60 * 1000,
            baseVolume: 1_700_000,
          }),
        },
      },
    });

    expect(result.promotion_gate.ready).toBe(false);
    expect(result.summary.annual_pass_rate).toBeLessThan(1);
    expect(
      result.summary.top_failure_reasons.some((row) =>
        row.reason.includes('combined_annual_return_below_threshold'),
      ),
    ).toBe(true);
  });
});

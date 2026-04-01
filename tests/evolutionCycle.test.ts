import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { runEvolutionCycle } from '../src/server/quant/evolution.js';
import type { NormalizedBar } from '../src/server/types.js';

function buildTrendBars(
  startTs: number,
  stepMs: number,
  startPrice: number,
  count: number,
): NormalizedBar[] {
  const rows: NormalizedBar[] = [];
  let px = startPrice;
  for (let i = 0; i < count; i += 1) {
    const open = px;
    const drift = 0.28 + i * 0.0015;
    const close = open + drift;
    const high = Math.max(open, close) + 0.18;
    const low = Math.min(open, close) - 0.14;
    rows.push({
      ts_open: startTs + i * stepMs,
      open: open.toFixed(4),
      high: high.toFixed(4),
      low: low.toFixed(4),
      close: close.toFixed(4),
      volume: String(1200 + i * 4),
    });
    px = close;
  }
  return rows;
}

describe('runEvolutionCycle', () => {
  it('bootstraps a champion, records workflow lineage, and emits walk-forward artifacts', async () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    const asset = repo.upsertAsset({
      symbol: 'SPY',
      market: 'US',
      venue: 'STOOQ',
    });

    const now = Date.now();
    repo.upsertOhlcvBars(
      asset.asset_id,
      '1d',
      buildTrendBars(now - 240 * 86_400_000, 86_400_000, 480, 240),
      'TEST',
    );

    const result = await runEvolutionCycle({
      repo,
      userId: 'test-user',
      runtimeSnapshot: {
        sourceStatus: 'DB_BACKED',
        freshnessSummary: { US: { latest_bar_age_minutes: 8 } },
        coverageSummary: { US: { symbols: 1, complete: true } },
      },
      markets: ['US'],
    });

    expect(result.markets).toHaveLength(1);
    expect(result.markets[0]?.market).toBe('US');
    expect(result.markets[0]?.factorEvalCount).toBeGreaterThan(0);
    expect(result.markets[0]?.activeModelId).toBeTruthy();

    const workflow = repo.listWorkflowRuns({
      workflowKey: 'quant_evolution_cycle',
      status: 'SUCCEEDED',
      limit: 5,
    })[0];
    expect(workflow).toBeTruthy();
    expect(workflow?.id).toBe(result.workflowId);

    const models = repo.listModelVersions({ modelKey: 'panda-runtime-us', limit: 10 });
    expect(models.some((row) => row.status === 'active')).toBe(true);

    const backtestRuns = repo.listBacktestRuns({ limit: 20 });
    expect(backtestRuns.length).toBeGreaterThan(0);
    const metric = repo.getBacktestMetric(backtestRuns[0]!.id);
    expect(metric).toBeTruthy();
    expect(typeof metric?.sample_size).toBe('number');
    expect(metric?.sample_size).toBeGreaterThanOrEqual(0);

    const experiments = repo.listExperimentRecords(20);
    expect(experiments.length).toBeGreaterThan(0);

    const auditEvents = repo.listAuditEvents({ traceId: result.traceId, limit: 50 });
    expect(auditEvents.some((row) => row.event_type === 'EVOLUTION_STARTED')).toBe(true);
    expect(auditEvents.some((row) => row.event_type === 'EVOLUTION_COMPLETED')).toBe(true);
  });
});

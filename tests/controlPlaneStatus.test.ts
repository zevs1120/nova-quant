import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/server/db/database.js';
import { MarketRepository } from '../src/server/db/repository.js';
import {
  getControlPlaneStatus,
  getFlywheelStatus,
  resetRepoSingleton,
  __resetFrontendReadCacheForTesting,
  __resetControlPlaneStatusCacheForTesting,
} from '../src/server/api/queries.js';
import * as pgReads from '../src/server/admin/postgresBusinessRead.js';

function seedWorkflowRun(
  repo: MarketRepository,
  args: {
    id: string;
    workflowKey: string;
    output: unknown;
    updatedAtMs: number;
    triggerType?: 'scheduled' | 'manual' | 'shadow' | 'replay';
  },
) {
  repo.upsertWorkflowRun({
    id: args.id,
    workflow_key: args.workflowKey,
    workflow_version: `${args.workflowKey}.test`,
    trigger_type: args.triggerType || 'scheduled',
    status: 'SUCCEEDED',
    trace_id: `trace-${args.id}`,
    input_json: JSON.stringify({ seeded: true }),
    output_json: JSON.stringify(args.output),
    attempt_count: 1,
    started_at_ms: args.updatedAtMs - 1_000,
    updated_at_ms: args.updatedAtMs,
    completed_at_ms: args.updatedAtMs,
  });
}

describe('control plane flywheel status', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetRepoSingleton();
    __resetFrontendReadCacheForTesting();
    __resetControlPlaneStatusCacheForTesting();
  });

  it('surfaces recent ingestion, evolution, and training state through the status APIs', async () => {
    const repo = new MarketRepository(getDb());

    // Clean up future-dated workflow_runs that may have accumulated from prior
    // test executions. Without this, old rows with high updated_at_ms values
    // occupy the LIMIT 6 window and evict freshly seeded rows.
    const cleanupThreshold = Date.UTC(2100, 0, 1, 0, 0, 0);
    getDb().exec(`DELETE FROM workflow_runs WHERE updated_at_ms >= ${cleanupThreshold}`);

    const baseTs = Date.UTC(2199, 0, 1, 0, 0, 0) + Math.floor(Math.random() * 1_000_000_000);
    const userId = `control-plane-${baseTs}`;

    repo.upsertNewsItem({
      id: `news-${baseTs}`,
      market: 'CRYPTO',
      symbol: 'BTCUSDT',
      headline: 'Bitcoin funding remains calm as basis stays positive',
      source: 'Test Wire',
      url: 'https://example.com/btc-funding',
      published_at_ms: baseTs + 100,
      sentiment_label: 'NEUTRAL',
      relevance_score: 0.78,
      payload_json: JSON.stringify({ seeded: true }),
      updated_at_ms: baseTs + 100,
    });

    seedWorkflowRun(repo, {
      id: `workflow-free-${baseTs}`,
      workflowKey: 'free_data_flywheel',
      updatedAtMs: baseTs + 200,
      output: {
        workflow_id: `workflow-free-${baseTs}`,
        market: 'ALL',
        news: {
          targets: 12,
          refreshed_symbols: 5,
          skipped_symbols: 7,
          rows_upserted: 24,
          errors: [],
        },
        crypto_structure: {
          symbols_processed: 3,
          funding_points: 18,
          basis_points: 3,
          latest_funding_symbols: 3,
          latest_basis_symbols: 3,
          symbols: [
            {
              symbol: 'BTCUSDT',
              funding_inserted: 6,
              basis_inserted: 1,
              latest_funding_rate: 0.0001,
              latest_basis_bps: 8.2,
            },
          ],
        },
      },
    });

    seedWorkflowRun(repo, {
      id: `workflow-evo-${baseTs}`,
      workflowKey: 'quant_evolution_cycle',
      updatedAtMs: baseTs + 300,
      output: [
        {
          market: 'US',
          factorEvalCount: 4,
          promoted: true,
          rolledBack: false,
          safeMode: false,
          activeModelId: 'model-us-active',
          challengerModelId: 'model-us-challenger',
          summary: 'Promoted model-us-active after walk-forward improvement.',
        },
        {
          market: 'CRYPTO',
          factorEvalCount: 4,
          promoted: false,
          rolledBack: false,
          safeMode: true,
          activeModelId: 'model-crypto-active',
          challengerModelId: 'model-crypto-challenger',
          summary: 'Kept CRYPTO runtime in safe mode.',
        },
      ],
    });

    seedWorkflowRun(repo, {
      id: `workflow-train-${baseTs}`,
      workflowKey: 'nova_training_flywheel',
      updatedAtMs: baseTs + 400,
      output: {
        workflow_id: `workflow-train-${baseTs}`,
        trainer: 'mlx-lora',
        dataset_count: 2,
        ready_for_training: true,
        task_types: ['assistant_grounded_answer'],
        manifest_path: 'artifacts/training/test-manifest.json',
        execution: {
          attempted: true,
          executed: false,
          success: false,
          reason: 'insufficient_training_rows:2',
          exit_code: null,
        },
      },
    });

    const status = await getControlPlaneStatus({ userId });
    expect(status.flywheel).toBeTruthy();
    expect(status.execution_governance).toBeTruthy();
    expect(status.execution_governance.kill_switch.active).toBe(false);
    expect(status.flywheel.training.current_dataset_count).toBe(2);
    expect(status.flywheel.training.minimum_training_rows).toBe(8);
    expect(status.flywheel.training.latest_execution_reason).toBe('insufficient_training_rows:2');

    const freeRun = status.flywheel.free_data.recent_runs.find(
      (row: { id?: string }) => row.id === `workflow-free-${baseTs}`,
    );
    expect(
      freeRun,
      `workflow-free-${baseTs} not in recent_runs (got ${status.flywheel.free_data.recent_runs.map((r: { id?: string }) => r.id).join(', ')})`,
    ).toBeTruthy();
    if (!freeRun) throw new Error('expected free data run');
    expect(freeRun.news.refreshed_symbols).toBe(5);
    expect(freeRun.crypto_structure.funding_points).toBe(18);

    const evolutionRun = status.flywheel.evolution.recent_runs.find(
      (row: { id?: string }) => row.id === `workflow-evo-${baseTs}`,
    );
    expect(evolutionRun).toBeTruthy();
    if (!evolutionRun) throw new Error('expected evolution run');
    expect(evolutionRun.promoted_count).toBe(1);
    expect(evolutionRun.safe_mode_count).toBe(1);

    expect(
      status.flywheel.recent_activity.some(
        (row: { workflow_key?: string; detail?: string }) =>
          row.workflow_key === 'nova_training_flywheel' &&
          String(row.detail || '').includes('insufficient_training_rows:2'),
      ),
    ).toBe(true);

    const flywheel = await getFlywheelStatus({ userId });
    const recentNewsItem = flywheel.free_data.recent_news.find(
      (row: { symbol?: string }) => row.symbol === 'BTCUSDT',
    );
    expect(recentNewsItem).toBeTruthy();
    expect(recentNewsItem!.symbol).toBe('BTCUSDT');
    expect(flywheel.training.current_dataset_count).toBe(2);
    const evoRun = flywheel.evolution.recent_runs.find(
      (row: { markets?: Array<{ market?: string }> }) =>
        row.markets?.some((m: { market?: string }) => m.market === 'US'),
    );
    expect(evoRun).toBeTruthy();
  });

  it('collapses guest control-plane reads onto the shared public scope', async () => {
    const repo = new MarketRepository(getDb());
    const baseTs = Date.UTC(2199, 0, 2, 0, 0, 0) + Math.floor(Math.random() * 1_000_000_000);

    repo.upsertNotificationEvent({
      id: `notif-${baseTs}`,
      user_id: 'guest-default',
      market: 'ALL',
      asset_class: 'ALL',
      category: 'STATE_SHIFT',
      trigger_type: 'test',
      fingerprint: `guest-public-${baseTs}`,
      title: 'Shared guest notification',
      body: 'This should be visible through the public guest scope.',
      tone: 'INFO',
      status: 'ACTIVE',
      action_target: null,
      reason_json: JSON.stringify({ seeded: true }),
      created_at_ms: baseTs,
      updated_at_ms: baseTs,
    });

    const status = await getControlPlaneStatus({
      userId: `guest-${Math.random().toString(36).slice(2, 10)}`,
    });

    expect(status.delivery.active_notification_count).toBeGreaterThanOrEqual(1);
  });

  it('uses async postgres flywheel reads and lightweight governance on hot-path mode', async () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('NOVA_ENABLE_PG_PRIMARY_READS_TEST', '1');
    vi.stubEnv('NOVA_ALLOW_SYNC_HOT_PATH_FALLBACK', '0');

    const baseTs = Date.UTC(2199, 0, 3, 0, 0, 0);
    const repoWorkflowSpy = vi.spyOn(MarketRepository.prototype, 'listWorkflowRuns');
    const repoNewsSpy = vi.spyOn(MarketRepository.prototype, 'listNewsItems');
    const repoExecutionSpy = vi.spyOn(MarketRepository.prototype, 'listExecutions');

    vi.spyOn(pgReads, 'readPostgresRuntimeStateBundle').mockResolvedValue({
      risk: null,
      signals: [],
      marketState: [],
      performance: [],
    });
    vi.spyOn(pgReads, 'readPostgresRiskProfile').mockResolvedValue(null);
    vi.spyOn(pgReads, 'readPostgresSignalRecords').mockResolvedValue([]);
    vi.spyOn(pgReads, 'readPostgresMarketState').mockResolvedValue([]);
    vi.spyOn(pgReads, 'readPostgresPerformanceSnapshots').mockResolvedValue([]);
    vi.spyOn(pgReads, 'readPostgresAssets').mockResolvedValue([]);
    vi.spyOn(pgReads, 'readPostgresNotificationEvents').mockResolvedValue([]);
    vi.spyOn(pgReads, 'readPostgresNewsItems').mockResolvedValue([
      {
        id: `news-hot-${baseTs}`,
        market: 'US',
        symbol: 'SPY',
        headline: 'Hot-path PG news',
        source: 'PG Test',
        url: null,
        published_at_ms: baseTs + 50,
        sentiment_label: 'NEUTRAL',
        relevance_score: 0.5,
        payload_json: '{}',
        updated_at_ms: baseTs + 50,
      },
    ]);
    vi.spyOn(pgReads, 'readPostgresWorkflowRuns').mockImplementation(async (args) => {
      const workflowKeys = args?.workflowKeys || [];
      if (workflowKeys.includes('nova_strategy_lab')) {
        return [
          {
            id: `workflow-strategy-${baseTs}`,
            workflow_key: 'nova_strategy_lab',
            workflow_version: 'nova_strategy_lab.test',
            trigger_type: 'scheduled',
            status: 'SUCCEEDED',
            trace_id: 'trace-strategy',
            input_json: '{}',
            output_json: '{}',
            attempt_count: 1,
            started_at_ms: baseTs + 10,
            updated_at_ms: baseTs + 10,
            completed_at_ms: baseTs + 10,
          },
        ];
      }
      return [
        {
          id: `workflow-free-${baseTs}`,
          workflow_key: 'free_data_flywheel',
          workflow_version: 'free.test',
          trigger_type: 'scheduled',
          status: 'SUCCEEDED',
          trace_id: 'trace-free',
          input_json: '{}',
          output_json: JSON.stringify({
            workflow_id: `workflow-free-${baseTs}`,
            news: { refreshed_symbols: 2, skipped_symbols: 0, rows_upserted: 10, errors: [] },
            crypto_structure: { funding_points: 4, basis_points: 1, symbols: [] },
          }),
          attempt_count: 1,
          started_at_ms: baseTs + 20,
          updated_at_ms: baseTs + 20,
          completed_at_ms: baseTs + 20,
        },
        {
          id: `workflow-evo-${baseTs}`,
          workflow_key: 'quant_evolution_cycle',
          workflow_version: 'evo.test',
          trigger_type: 'scheduled',
          status: 'SUCCEEDED',
          trace_id: 'trace-evo',
          input_json: '{}',
          output_json: JSON.stringify([
            {
              market: 'US',
              factorEvalCount: 3,
              promoted: true,
              rolledBack: false,
              safeMode: false,
              activeModelId: 'model-us',
              challengerModelId: 'model-us-shadow',
              summary: 'ok',
            },
          ]),
          attempt_count: 1,
          started_at_ms: baseTs + 30,
          updated_at_ms: baseTs + 30,
          completed_at_ms: baseTs + 30,
        },
        {
          id: `workflow-train-${baseTs}`,
          workflow_key: 'nova_training_flywheel',
          workflow_version: 'train.test',
          trigger_type: 'scheduled',
          status: 'SUCCEEDED',
          trace_id: 'trace-train',
          input_json: '{}',
          output_json: JSON.stringify({
            trainer: 'mlx-lora',
            dataset_count: 12,
            ready_for_training: true,
            task_types: ['assistant_grounded_answer'],
            execution: {
              attempted: true,
              executed: false,
              success: false,
              reason: 'scheduled',
              exit_code: null,
            },
          }),
          attempt_count: 1,
          started_at_ms: baseTs + 40,
          updated_at_ms: baseTs + 40,
          completed_at_ms: baseTs + 40,
        },
      ];
    });

    const status = await getControlPlaneStatus({ userId: 'control-plane-hot-path-user' });

    expect(status.flywheel.training.current_dataset_count).toBe(12);
    expect(status.flywheel.training.current_dataset_source).toBe('latest_training_run');
    expect(status.execution_governance.kill_switch.active).toBe(false);
    expect(status.strategy_factory.latest_status).toBe('SUCCEEDED');
    expect(repoWorkflowSpy).not.toHaveBeenCalled();
    expect(repoNewsSpy).not.toHaveBeenCalled();
    expect(repoExecutionSpy).not.toHaveBeenCalled();
  });
});

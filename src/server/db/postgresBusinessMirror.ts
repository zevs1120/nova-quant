import type Database from 'better-sqlite3';
import { Pool } from 'pg';
import type {
  AlphaCandidateRecord,
  AlphaEvaluationRecord,
  AlphaLifecycleEventRecord,
  AlphaShadowObservationRecord,
  BacktestMetricRecord,
  BacktestRunRecord,
  DatasetVersionRecord,
  FundamentalSnapshotRecord,
  MarketStateRecord,
  NewsItemRecord,
  NovaTaskRunRecord,
  OptionChainSnapshotRecord,
  PerformanceSnapshotRecord,
  SignalContract,
  SignalRecord,
  WorkflowRunRecord,
} from '../types.js';
import { MarketRepository } from './repository.js';
import {
  buildInsertSql,
  qualifyPgTable,
  quotePgIdentifier,
  recommendedBatchSize,
  resolvePostgresBusinessUrl,
} from './postgresMigration.js';

type MirrorHandle = {
  repo: MarketRepository;
  flush: () => Promise<void>;
  mirrorEnabled: boolean;
};

type MirrorRow = object;

let poolSingleton: Pool | null = null;

function shouldUseSsl(connectionString: string) {
  if (
    String(process.env.NOVA_DATA_PG_SSL || '')
      .trim()
      .toLowerCase() === 'disable'
  ) {
    return false;
  }
  return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
}

function resolvePostgresBusinessSchema() {
  return String(process.env.NOVA_DATA_PG_SCHEMA || 'novaquant_data').trim() || 'novaquant_data';
}

function hasPostgresBusinessMirrorWrites() {
  if (
    String(process.env.NOVA_DISABLE_PG_MIRROR_WRITES || '')
      .trim()
      .toLowerCase() === '1'
  ) {
    return false;
  }
  return Boolean(resolvePostgresBusinessUrl());
}

function getMirrorPool() {
  if (!hasPostgresBusinessMirrorWrites()) {
    throw new Error('POSTGRES_BUSINESS_MIRROR_DISABLED');
  }
  if (poolSingleton) return poolSingleton;
  const connectionString = resolvePostgresBusinessUrl();
  poolSingleton = new Pool({
    connectionString,
    max: Math.max(1, Number(process.env.NOVA_DATA_PG_POOL_MAX || 3)),
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  return poolSingleton;
}

function flattenRows<T extends MirrorRow>(rows: T[], columns: string[]) {
  return rows.flatMap((row) => {
    const values = row as Record<string, unknown>;
    return columns.map((column) => values[column] ?? null);
  });
}

function batchRows<T>(rows: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }
  return batches;
}

function schemaTable(tableName: string) {
  return qualifyPgTable(resolvePostgresBusinessSchema(), tableName);
}

class PostgresBusinessWriteMirror {
  private readonly pool = getMirrorPool();
  private tail: Promise<void> = Promise.resolve();
  private lastError: Error | null = null;

  enqueue(label: string, write: () => Promise<void>) {
    this.tail = this.tail.then(write).catch((error) => {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      console.warn('[pg-mirror] write failed', {
        label,
        error: this.lastError.message,
      });
    });
  }

  async flush() {
    await this.tail;
  }

  getLastError() {
    return this.lastError;
  }

  private async upsertRows<T extends MirrorRow>(args: {
    table: string;
    columns: string[];
    rows: T[];
    conflictColumns: string[];
    updateColumns?: string[];
  }) {
    if (!args.rows.length) return;
    const batchSize = recommendedBatchSize(args.columns.length, 200);
    const updates = (args.updateColumns || args.columns).filter(
      (column) => !args.conflictColumns.includes(column),
    );
    const updateSql = updates.length
      ? ` DO UPDATE SET ${updates
          .map((column) => `${quotePgIdentifier(column)} = EXCLUDED.${quotePgIdentifier(column)}`)
          .join(', ')}`
      : ' DO NOTHING';

    for (const batch of batchRows(args.rows, batchSize)) {
      const sql =
        `${buildInsertSql(resolvePostgresBusinessSchema(), args.table, args.columns, batch.length)}` +
        ` ON CONFLICT (${args.conflictColumns.map(quotePgIdentifier).join(', ')})${updateSql}`;
      await this.pool.query(sql, flattenRows(batch, args.columns));
    }
  }

  async upsertWorkflowRuns(rows: WorkflowRunRecord[]) {
    await this.upsertRows({
      table: 'workflow_runs',
      columns: [
        'id',
        'workflow_key',
        'workflow_version',
        'trigger_type',
        'status',
        'trace_id',
        'input_json',
        'output_json',
        'attempt_count',
        'started_at_ms',
        'updated_at_ms',
        'completed_at_ms',
      ],
      rows,
      conflictColumns: ['id'],
    });
  }

  async upsertNewsItems(rows: NewsItemRecord[]) {
    await this.upsertRows({
      table: 'news_items',
      columns: [
        'id',
        'market',
        'symbol',
        'headline',
        'source',
        'url',
        'published_at_ms',
        'sentiment_label',
        'relevance_score',
        'payload_json',
        'updated_at_ms',
      ],
      rows,
      conflictColumns: ['id'],
    });
  }

  async upsertFundamentalSnapshots(rows: FundamentalSnapshotRecord[]) {
    await this.upsertRows({
      table: 'fundamental_snapshots',
      columns: ['id', 'market', 'symbol', 'source', 'asof_date', 'payload_json', 'updated_at_ms'],
      rows,
      conflictColumns: ['id'],
    });
  }

  async upsertOptionChainSnapshots(rows: OptionChainSnapshotRecord[]) {
    await this.upsertRows({
      table: 'option_chain_snapshots',
      columns: [
        'id',
        'market',
        'symbol',
        'expiration_date',
        'snapshot_ts_ms',
        'source',
        'payload_json',
        'updated_at_ms',
      ],
      rows,
      conflictColumns: ['id'],
    });
  }

  async upsertSignals(rows: SignalRecord[]) {
    await this.upsertRows({
      table: 'signals',
      columns: [
        'signal_id',
        'created_at_ms',
        'expires_at_ms',
        'asset_class',
        'market',
        'symbol',
        'timeframe',
        'strategy_id',
        'strategy_family',
        'strategy_version',
        'regime_id',
        'temperature_percentile',
        'volatility_percentile',
        'direction',
        'strength',
        'confidence',
        'entry_low',
        'entry_high',
        'entry_method',
        'invalidation_level',
        'stop_type',
        'stop_price',
        'tp1_price',
        'tp1_size_pct',
        'tp2_price',
        'tp2_size_pct',
        'trailing_type',
        'trailing_params_json',
        'position_pct',
        'leverage_cap',
        'risk_bucket_applied',
        'fee_bps',
        'spread_bps',
        'slippage_bps',
        'funding_est_bps',
        'basis_est',
        'expected_r',
        'hit_rate_est',
        'sample_size',
        'expected_max_dd_est',
        'status',
        'score',
        'payload_json',
        'updated_at_ms',
      ],
      rows,
      conflictColumns: ['signal_id'],
    });
  }

  async expireSignalsNotIn(activeSignalIds: string[], updatedAtMs: number) {
    if (!activeSignalIds.length) {
      await this.pool.query(
        `UPDATE ${schemaTable('signals')}
         SET status = 'EXPIRED', updated_at_ms = $1
         WHERE status IN ('NEW', 'TRIGGERED')`,
        [updatedAtMs],
      );
      return;
    }
    await this.pool.query(
      `UPDATE ${schemaTable('signals')}
       SET status = 'EXPIRED', updated_at_ms = $1
       WHERE status IN ('NEW', 'TRIGGERED')
         AND signal_id <> ALL($2::text[])`,
      [updatedAtMs, activeSignalIds],
    );
  }

  async upsertAlphaCandidates(rows: AlphaCandidateRecord[]) {
    await this.upsertRows({
      table: 'alpha_candidates',
      columns: [
        'id',
        'thesis',
        'family',
        'formula_json',
        'params_json',
        'feature_dependencies_json',
        'regime_constraints_json',
        'compatible_markets_json',
        'holding_period',
        'entry_logic_json',
        'exit_logic_json',
        'sizing_hint_json',
        'integration_path',
        'complexity_score',
        'source',
        'status',
        'parent_alpha_id',
        'acceptance_score',
        'last_evaluation_id',
        'last_rejection_reason',
        'last_promotion_reason',
        'metadata_json',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows,
      conflictColumns: ['id'],
    });
  }

  async insertAlphaEvaluations(rows: AlphaEvaluationRecord[]) {
    await this.upsertRows({
      table: 'alpha_evaluations',
      columns: [
        'id',
        'alpha_candidate_id',
        'workflow_run_id',
        'backtest_run_id',
        'evaluation_status',
        'acceptance_score',
        'metrics_json',
        'rejection_reasons_json',
        'notes',
        'created_at_ms',
      ],
      rows,
      conflictColumns: ['id'],
    });
  }

  async upsertAlphaShadowObservations(rows: AlphaShadowObservationRecord[]) {
    await this.upsertRows({
      table: 'alpha_shadow_observations',
      columns: [
        'id',
        'alpha_candidate_id',
        'workflow_run_id',
        'signal_id',
        'market',
        'symbol',
        'shadow_action',
        'alignment_score',
        'adjusted_confidence',
        'suggested_weight_multiplier',
        'realized_pnl_pct',
        'realized_source',
        'payload_json',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows,
      conflictColumns: ['alpha_candidate_id', 'signal_id'],
    });
  }

  async insertAlphaLifecycleEvents(rows: AlphaLifecycleEventRecord[]) {
    await this.upsertRows({
      table: 'alpha_lifecycle_events',
      columns: [
        'id',
        'alpha_candidate_id',
        'from_status',
        'to_status',
        'reason',
        'payload_json',
        'created_at_ms',
      ],
      rows,
      conflictColumns: ['id'],
    });
  }

  async upsertDatasetVersions(rows: DatasetVersionRecord[]) {
    await this.upsertRows({
      table: 'dataset_versions',
      columns: [
        'id',
        'market',
        'asset_class',
        'timeframe',
        'source_bundle_hash',
        'coverage_summary_json',
        'freshness_summary_json',
        'notes',
        'created_at_ms',
      ],
      rows,
      conflictColumns: ['id'],
    });
  }

  async upsertBacktestRuns(rows: BacktestRunRecord[]) {
    await this.upsertRows({
      table: 'backtest_runs',
      columns: [
        'id',
        'run_type',
        'strategy_version_id',
        'dataset_version_id',
        'universe_version_id',
        'execution_profile_id',
        'config_hash',
        'started_at_ms',
        'completed_at_ms',
        'status',
        'train_window',
        'validation_window',
        'test_window',
        'notes',
      ],
      rows,
      conflictColumns: ['id'],
    });
  }

  async insertBacktestMetrics(rows: BacktestMetricRecord[]) {
    const materialized = rows
      .filter((row) => Number.isFinite(Number(row.id)))
      .map((row) => ({ ...row, id: Number(row.id) }));
    await this.upsertRows({
      table: 'backtest_metrics',
      columns: [
        'id',
        'backtest_run_id',
        'gross_return',
        'net_return',
        'sharpe',
        'sortino',
        'max_drawdown',
        'turnover',
        'win_rate',
        'hit_rate',
        'cost_drag',
        'sample_size',
        'withheld_reason',
        'realism_grade',
        'robustness_grade',
        'status',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows: materialized,
      conflictColumns: ['id'],
    });
  }

  async upsertNovaTaskRuns(rows: NovaTaskRunRecord[]) {
    await this.upsertRows({
      table: 'nova_task_runs',
      columns: [
        'id',
        'user_id',
        'thread_id',
        'task_type',
        'route_alias',
        'model_name',
        'endpoint',
        'trace_id',
        'prompt_version_id',
        'parent_run_id',
        'input_json',
        'context_json',
        'output_json',
        'status',
        'error',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows,
      conflictColumns: ['id'],
    });
  }

  async upsertMarketStates(rows: MarketStateRecord[]) {
    await this.upsertRows({
      table: 'market_state',
      columns: [
        'market',
        'symbol',
        'timeframe',
        'snapshot_ts_ms',
        'regime_id',
        'trend_strength',
        'temperature_percentile',
        'volatility_percentile',
        'risk_off_score',
        'stance',
        'event_stats_json',
        'assumptions_json',
        'updated_at_ms',
      ],
      rows,
      conflictColumns: ['market', 'symbol', 'timeframe'],
    });
  }

  async upsertPerformanceSnapshots(rows: PerformanceSnapshotRecord[]) {
    await this.upsertRows({
      table: 'performance_snapshots',
      columns: [
        'market',
        'range',
        'segment_type',
        'segment_key',
        'source_label',
        'sample_size',
        'payload_json',
        'asof_ms',
        'updated_at_ms',
      ],
      rows,
      conflictColumns: ['market', 'range', 'segment_type', 'segment_key'],
    });
  }
}

export function createMirroringMarketRepository(db: Database.Database): MirrorHandle {
  const repo = new MarketRepository(db);
  if (!hasPostgresBusinessMirrorWrites()) {
    return {
      repo,
      flush: async () => {},
      mirrorEnabled: false,
    };
  }

  const mirror = new PostgresBusinessWriteMirror();
  const proxy = new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;

      return (...args: unknown[]) => {
        const result = value.apply(target, args);

        switch (String(prop)) {
          case 'upsertWorkflowRun': {
            const row = args[0] as WorkflowRunRecord | undefined;
            if (row) {
              mirror.enqueue('workflow_runs', async () => {
                await mirror.upsertWorkflowRuns([row]);
              });
            }
            break;
          }
          case 'upsertNewsItem': {
            const row = args[0] as NewsItemRecord | undefined;
            if (row) {
              mirror.enqueue('news_items', async () => {
                await mirror.upsertNewsItems([row]);
              });
            }
            break;
          }
          case 'upsertNewsItems': {
            const rows = (args[0] as NewsItemRecord[] | undefined) || [];
            if (rows.length) {
              mirror.enqueue('news_items_bulk', async () => {
                await mirror.upsertNewsItems(rows);
              });
            }
            break;
          }
          case 'upsertFundamentalSnapshot': {
            const row = args[0] as FundamentalSnapshotRecord | undefined;
            if (row) {
              mirror.enqueue('fundamental_snapshots', async () => {
                await mirror.upsertFundamentalSnapshots([row]);
              });
            }
            break;
          }
          case 'upsertFundamentalSnapshots': {
            const rows = (args[0] as FundamentalSnapshotRecord[] | undefined) || [];
            if (rows.length) {
              mirror.enqueue('fundamental_snapshots_bulk', async () => {
                await mirror.upsertFundamentalSnapshots(rows);
              });
            }
            break;
          }
          case 'upsertOptionChainSnapshot': {
            const row = args[0] as OptionChainSnapshotRecord | undefined;
            if (row) {
              mirror.enqueue('option_chain_snapshots', async () => {
                await mirror.upsertOptionChainSnapshots([row]);
              });
            }
            break;
          }
          case 'upsertOptionChainSnapshots': {
            const rows = (args[0] as OptionChainSnapshotRecord[] | undefined) || [];
            if (rows.length) {
              mirror.enqueue('option_chain_snapshots_bulk', async () => {
                await mirror.upsertOptionChainSnapshots(rows);
              });
            }
            break;
          }
          case 'upsertSignal': {
            const signal = args[0] as SignalContract | undefined;
            if (signal?.id) {
              const row = target.getSignal(signal.id);
              if (row) {
                mirror.enqueue('signals', async () => {
                  await mirror.upsertSignals([row]);
                });
              }
            }
            break;
          }
          case 'upsertSignals': {
            const signals = (args[0] as SignalContract[] | undefined) || [];
            const rows = signals
              .map((signal) => target.getSignal(signal.id))
              .filter((row): row is SignalRecord => Boolean(row));
            if (rows.length) {
              mirror.enqueue('signals_bulk', async () => {
                await mirror.upsertSignals(rows);
              });
            }
            break;
          }
          case 'expireSignalsNotIn': {
            const activeSignalIds = (args[0] as string[] | undefined) || [];
            const updatedAtMs = Date.now();
            mirror.enqueue('signals_expire', async () => {
              await mirror.expireSignalsNotIn(activeSignalIds, updatedAtMs);
            });
            break;
          }
          case 'upsertAlphaCandidate': {
            const rowArg = args[0] as AlphaCandidateRecord | undefined;
            if (rowArg?.id) {
              const row = target.getAlphaCandidate(rowArg.id);
              if (row) {
                mirror.enqueue('alpha_candidates', async () => {
                  await mirror.upsertAlphaCandidates([row]);
                });
              }
            }
            break;
          }
          case 'insertAlphaEvaluation': {
            const row = args[0] as AlphaEvaluationRecord | undefined;
            if (row) {
              mirror.enqueue('alpha_evaluations', async () => {
                await mirror.insertAlphaEvaluations([row]);
              });
            }
            break;
          }
          case 'upsertAlphaShadowObservation': {
            const row = args[0] as AlphaShadowObservationRecord | undefined;
            if (row) {
              mirror.enqueue('alpha_shadow_observations', async () => {
                await mirror.upsertAlphaShadowObservations([row]);
              });
            }
            break;
          }
          case 'upsertAlphaShadowObservations': {
            const rows = (args[0] as AlphaShadowObservationRecord[] | undefined) || [];
            if (rows.length) {
              mirror.enqueue('alpha_shadow_observations_bulk', async () => {
                await mirror.upsertAlphaShadowObservations(rows);
              });
            }
            break;
          }
          case 'insertAlphaLifecycleEvent': {
            const row = args[0] as AlphaLifecycleEventRecord | undefined;
            if (row) {
              mirror.enqueue('alpha_lifecycle_events', async () => {
                await mirror.insertAlphaLifecycleEvents([row]);
              });
            }
            break;
          }
          case 'createDatasetVersion': {
            const rowArg = args[0] as DatasetVersionRecord | undefined;
            if (rowArg?.id) {
              const row = target.getDatasetVersion(rowArg.id);
              if (row) {
                mirror.enqueue('dataset_versions', async () => {
                  await mirror.upsertDatasetVersions([row]);
                });
              }
            }
            break;
          }
          case 'createBacktestRun': {
            const rowArg = args[0] as BacktestRunRecord | undefined;
            if (rowArg?.id) {
              const row = target.getBacktestRun(rowArg.id);
              if (row) {
                mirror.enqueue('backtest_runs', async () => {
                  await mirror.upsertBacktestRuns([row]);
                });
              }
            }
            break;
          }
          case 'updateBacktestRunStatus': {
            const rowArg = args[0] as { id?: string } | undefined;
            if (rowArg?.id) {
              const row = target.getBacktestRun(rowArg.id);
              if (row) {
                mirror.enqueue('backtest_runs_update', async () => {
                  await mirror.upsertBacktestRuns([row]);
                });
              }
            }
            break;
          }
          case 'upsertBacktestMetric': {
            const rowArg = args[0] as BacktestMetricRecord | undefined;
            if (rowArg?.backtest_run_id) {
              const row = target.getBacktestMetric(rowArg.backtest_run_id);
              if (row) {
                mirror.enqueue('backtest_metrics', async () => {
                  await mirror.insertBacktestMetrics([row]);
                });
              }
            }
            break;
          }
          case 'upsertNovaTaskRun': {
            const rowArg = args[0] as NovaTaskRunRecord | undefined;
            if (rowArg?.id) {
              const row = target.getNovaTaskRun(rowArg.id);
              if (row) {
                mirror.enqueue('nova_task_runs', async () => {
                  await mirror.upsertNovaTaskRuns([row]);
                });
              }
            }
            break;
          }
          case 'upsertMarketState': {
            const row = args[0] as MarketStateRecord | undefined;
            if (row) {
              mirror.enqueue('market_state', async () => {
                await mirror.upsertMarketStates([row]);
              });
            }
            break;
          }
          case 'upsertMarketStates': {
            const rows = (args[0] as MarketStateRecord[] | undefined) || [];
            if (rows.length) {
              mirror.enqueue('market_state_bulk', async () => {
                await mirror.upsertMarketStates(rows);
              });
            }
            break;
          }
          case 'upsertPerformanceSnapshot': {
            const row = args[0] as PerformanceSnapshotRecord | undefined;
            if (row) {
              mirror.enqueue('performance_snapshots', async () => {
                await mirror.upsertPerformanceSnapshots([row]);
              });
            }
            break;
          }
          case 'upsertPerformanceSnapshots': {
            const rows = (args[0] as PerformanceSnapshotRecord[] | undefined) || [];
            if (rows.length) {
              mirror.enqueue('performance_snapshots_bulk', async () => {
                await mirror.upsertPerformanceSnapshots(rows);
              });
            }
            break;
          }
          default:
            break;
        }

        return result;
      };
    },
  }) as MarketRepository;

  return {
    repo: proxy,
    flush: async () => {
      await mirror.flush();
    },
    mirrorEnabled: true,
  };
}

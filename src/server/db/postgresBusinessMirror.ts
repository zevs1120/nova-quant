import type Database from 'better-sqlite3';
import { Pool } from 'pg';
import type {
  AlphaCandidateRecord,
  AlphaEvaluationRecord,
  AlphaLifecycleEventRecord,
  AlphaShadowObservationRecord,
  BacktestMetricRecord,
  BacktestRunRecord,
  DecisionSnapshotRecord,
  DatasetVersionRecord,
  ExecutionRecord,
  FundamentalSnapshotRecord,
  MarketStateRecord,
  NewsItemRecord,
  NovaTaskRunRecord,
  NotificationEventRecord,
  NotificationPreferenceRecord,
  OptionChainSnapshotRecord,
  PerformanceSnapshotRecord,
  SignalContract,
  SignalRecord,
  SignalEventRecord,
  UserRiskProfileRecord,
  UserRitualEventRecord,
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

type ApiKeyMirrorRecord = {
  key_id: string;
  key_hash: string;
  label: string;
  scope: string;
  status: 'ACTIVE' | 'DISABLED';
  created_at_ms: number;
  updated_at_ms: number;
};

type ExternalConnectionMirrorRecord = {
  connection_id: string;
  user_id: string;
  connection_type: 'BROKER' | 'EXCHANGE';
  provider: string;
  mode: 'READ_ONLY' | 'TRADING';
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
  meta_json: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

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
    process.env.NODE_ENV === 'test' &&
    String(process.env.NOVA_ENABLE_PG_MIRROR_WRITES_TEST || '') !== '1'
  ) {
    return false;
  }
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
    this.tail = this.tail
      .catch(() => undefined)
      .then(async () => {
        try {
          await write();
          this.lastError = null;
        } catch (error) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : String(error || 'POSTGRES_MIRROR_WRITE_FAILED');
          this.lastError = error instanceof Error ? error : new Error(message);
          if (!this.lastError.message) {
            this.lastError = new Error(message);
          }
          console.warn('[pg-mirror] write failed', {
            label,
            error: message,
          });
          throw this.lastError;
        }
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

  async insertSignalEvents(rows: SignalEventRecord[]) {
    const materialized = rows
      .filter((row) => Number.isFinite(Number(row.id)))
      .map((row) => ({
        ...row,
        id: Number(row.id),
        payload_json: row.payload_json ?? null,
      }));
    if (!materialized.length) return;
    await this.upsertRows({
      table: 'signal_events',
      columns: ['id', 'signal_id', 'event_type', 'payload_json', 'created_at_ms'],
      rows: materialized,
      conflictColumns: ['id'],
    });
  }

  async upsertExecutions(rows: ExecutionRecord[]) {
    await this.upsertRows({
      table: 'executions',
      columns: [
        'execution_id',
        'signal_id',
        'user_id',
        'mode',
        'action',
        'market',
        'symbol',
        'entry_price',
        'stop_price',
        'tp_price',
        'size_pct',
        'pnl_pct',
        'note',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows: rows.map((row) => ({
        ...row,
        entry_price: row.entry_price ?? null,
        stop_price: row.stop_price ?? null,
        tp_price: row.tp_price ?? null,
        size_pct: row.size_pct ?? null,
        pnl_pct: row.pnl_pct ?? null,
        note: row.note ?? null,
      })),
      conflictColumns: ['execution_id'],
    });
  }

  async upsertUserRiskProfiles(rows: UserRiskProfileRecord[]) {
    await this.upsertRows({
      table: 'user_risk_profiles',
      columns: [
        'user_id',
        'profile_key',
        'max_loss_per_trade',
        'max_daily_loss',
        'max_drawdown',
        'exposure_cap',
        'leverage_cap',
        'updated_at_ms',
      ],
      rows,
      conflictColumns: ['user_id'],
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

  async upsertDecisionSnapshots(rows: DecisionSnapshotRecord[]) {
    await this.upsertRows({
      table: 'decision_snapshots',
      columns: [
        'id',
        'user_id',
        'market',
        'asset_class',
        'snapshot_date',
        'context_hash',
        'evidence_mode',
        'performance_mode',
        'source_status',
        'data_status',
        'risk_state_json',
        'portfolio_context_json',
        'actions_json',
        'summary_json',
        'top_action_id',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows: rows.map((row) => ({
        ...row,
        top_action_id: row.top_action_id ?? null,
      })),
      conflictColumns: ['id'],
    });
  }

  async upsertUserRitualEvents(rows: UserRitualEventRecord[]) {
    await this.upsertRows({
      table: 'user_ritual_events',
      columns: [
        'id',
        'user_id',
        'market',
        'asset_class',
        'event_date',
        'week_key',
        'event_type',
        'snapshot_id',
        'reason_json',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows: rows.map((row) => ({
        ...row,
        week_key: row.week_key ?? null,
        snapshot_id: row.snapshot_id ?? null,
      })),
      conflictColumns: ['user_id', 'market', 'asset_class', 'event_date', 'event_type'],
      updateColumns: ['week_key', 'snapshot_id', 'reason_json', 'updated_at_ms'],
    });
  }

  async upsertNotificationPreferences(rows: NotificationPreferenceRecord[]) {
    await this.upsertRows({
      table: 'user_notification_preferences',
      columns: [
        'user_id',
        'morning_enabled',
        'state_shift_enabled',
        'protective_enabled',
        'wrap_up_enabled',
        'frequency',
        'quiet_start_hour',
        'quiet_end_hour',
        'updated_at_ms',
      ],
      rows: rows.map((row) => ({
        ...row,
        quiet_start_hour: row.quiet_start_hour ?? null,
        quiet_end_hour: row.quiet_end_hour ?? null,
      })),
      conflictColumns: ['user_id'],
    });
  }

  async upsertNotificationEvents(rows: NotificationEventRecord[]) {
    await this.upsertRows({
      table: 'notification_events',
      columns: [
        'id',
        'user_id',
        'market',
        'asset_class',
        'category',
        'trigger_type',
        'fingerprint',
        'title',
        'body',
        'tone',
        'status',
        'action_target',
        'reason_json',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows: rows.map((row) => ({
        ...row,
        action_target: row.action_target ?? null,
      })),
      conflictColumns: ['fingerprint'],
      updateColumns: [
        'title',
        'body',
        'tone',
        'status',
        'action_target',
        'reason_json',
        'updated_at_ms',
      ],
    });
  }

  async upsertExternalConnections(rows: ExternalConnectionMirrorRecord[]) {
    await this.upsertRows({
      table: 'external_connections',
      columns: [
        'connection_id',
        'user_id',
        'connection_type',
        'provider',
        'mode',
        'status',
        'meta_json',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows,
      conflictColumns: ['connection_id'],
      updateColumns: [
        'user_id',
        'connection_type',
        'provider',
        'mode',
        'status',
        'meta_json',
        'updated_at_ms',
      ],
    });
  }

  async upsertApiKeys(rows: ApiKeyMirrorRecord[]) {
    await this.upsertRows({
      table: 'api_keys',
      columns: ['key_id', 'key_hash', 'label', 'scope', 'status', 'created_at_ms', 'updated_at_ms'],
      rows,
      conflictColumns: ['key_id'],
      updateColumns: ['key_hash', 'label', 'scope', 'status', 'updated_at_ms'],
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
          case 'appendSignalEvent': {
            const signalId = String(args[0] || '').trim();
            if (signalId) {
              const row = target.listSignalEvents(signalId, 1)[0];
              if (row?.id !== undefined) {
                mirror.enqueue('signal_events', async () => {
                  await mirror.insertSignalEvents([
                    {
                      ...row,
                      payload_json: row.payload_json ?? undefined,
                    },
                  ]);
                });
              }
            }
            break;
          }
          case 'upsertExecution': {
            const row = args[0] as ExecutionRecord | undefined;
            if (row?.execution_id) {
              mirror.enqueue('executions', async () => {
                await mirror.upsertExecutions([
                  {
                    ...row,
                    updated_at_ms: row.updated_at_ms ?? Date.now(),
                  },
                ]);
              });
            }
            break;
          }
          case 'upsertUserRiskProfile': {
            const row = args[0] as UserRiskProfileRecord | undefined;
            if (row?.user_id) {
              mirror.enqueue('user_risk_profiles', async () => {
                await mirror.upsertUserRiskProfiles([row]);
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
          case 'upsertDecisionSnapshot': {
            const row = args[0] as DecisionSnapshotRecord | undefined;
            if (row?.id) {
              mirror.enqueue('decision_snapshots', async () => {
                await mirror.upsertDecisionSnapshots([row]);
              });
            }
            break;
          }
          case 'upsertUserRitualEvent': {
            const row = args[0] as UserRitualEventRecord | undefined;
            if (row?.id) {
              mirror.enqueue('user_ritual_events', async () => {
                await mirror.upsertUserRitualEvents([row]);
              });
            }
            break;
          }
          case 'upsertUserNotificationPreferences': {
            const row = args[0] as NotificationPreferenceRecord | undefined;
            if (row?.user_id) {
              mirror.enqueue('user_notification_preferences', async () => {
                await mirror.upsertNotificationPreferences([row]);
              });
            }
            break;
          }
          case 'upsertNotificationEvent': {
            const row = args[0] as NotificationEventRecord | undefined;
            if (row?.id) {
              mirror.enqueue('notification_events', async () => {
                await mirror.upsertNotificationEvents([row]);
              });
            }
            break;
          }
          case 'upsertExternalConnection': {
            const input = args[0] as
              | {
                  connection_id?: string;
                  user_id?: string;
                  connection_type?: 'BROKER' | 'EXCHANGE';
                }
              | undefined;
            if (input?.connection_id && input?.user_id) {
              const row = target
                .listExternalConnections({
                  userId: input.user_id,
                  connectionType: input.connection_type,
                })
                .find((item) => item.connection_id === input.connection_id);
              if (row) {
                mirror.enqueue('external_connections', async () => {
                  await mirror.upsertExternalConnections([
                    {
                      ...row,
                      created_at_ms: row.updated_at_ms,
                    },
                  ]);
                });
              }
            }
            break;
          }
          case 'upsertApiKey': {
            const input = args[0] as { key_hash?: string } | undefined;
            if (input?.key_hash) {
              const row = target.getApiKeyByHash(input.key_hash);
              if (row) {
                mirror.enqueue('api_keys', async () => {
                  await mirror.upsertApiKeys([
                    {
                      ...row,
                      status: row.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
                      created_at_ms: Date.now(),
                      updated_at_ms: Date.now(),
                    },
                  ]);
                });
              }
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

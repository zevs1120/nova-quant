import type Database from 'better-sqlite3';
import type {
  AlphaCandidateRecord,
  AlphaEvaluationRecord,
  AlphaLifecycleEventRecord,
  AlphaShadowObservationRecord,
  Asset,
  AssetClass,
  AssetInput,
  BacktestArtifactRecord,
  BacktestMetricRecord,
  BacktestRunRecord,
  BasisSnapshotRow,
  ChatMessageRecord,
  ChatThreadRecord,
  DatasetVersionRecord,
  DecisionSnapshotRecord,
  EvidenceStatus,
  EvalRegistryRecord,
  ExecutionProfileRecord,
  ExecutionRecord,
  ExperimentRegistryRecord,
  FeatureSnapshotRecord,
  FundingRateRow,
  FundamentalSnapshotRecord,
  Market,
  MarketStateRecord,
  NewsItemRecord,
  ModelVersionRecord,
  NormalizedBar,
  NotificationEventRecord,
  NotificationPreferenceRecord,
  OptionChainSnapshotRecord,
  OutcomeReviewRecord,
  PerformanceSnapshotRecord,
  PromptVersionRecord,
  RecommendationReviewRecord,
  ReplayPaperReconciliationRecord,
  SandboxRunRecord,
  SignalContract,
  SignalEventRecord,
  SignalRecord,
  SignalSnapshotRecord,
  SignalStatus,
  StrategyVersionRecord,
  Timeframe,
  UniverseSnapshotRecord,
  UserResponseEventRecord,
  UserRitualEventRecord,
  UserRiskProfileRecord,
  WorkflowRunRecord,
  AuditEventRecord,
  MarketStateSnapshotRecord,
  EvidenceSnapshotRecord,
  ActionSnapshotRecord,
  UserStateSnapshotRecord,
  DecisionIntelligenceDatasetRecord,
  ExternalSurfaceRecord,
  ComplianceLogRecord,
  NovaTaskRunRecord,
  NovaReviewLabelRecord,
} from '../types.js';
import { MarketRepository } from './repository.js';
import {
  beginTransactionSync,
  commitTransactionSync,
  executeSync,
  getPostgresBusinessSchema,
  insertRowsSync,
  qualifyBusinessTable,
  queryRowSync,
  queryRowsSync,
  rollbackTransactionSync,
  upsertRowsSync,
} from './postgresSyncBridge.js';
import { quotePgIdentifier } from './postgresMigration.js';

const UNSUPPORTED_DB = {
  prepare() {
    throw new Error('POSTGRES_RUNTIME_METHOD_NOT_IMPLEMENTED');
  },
  transaction() {
    throw new Error('POSTGRES_RUNTIME_METHOD_NOT_IMPLEMENTED');
  },
} as unknown as Database.Database;

const AUTO_ID_TABLES = [
  'ingest_anomalies',
  'chat_audit_logs',
  'chat_messages',
  'signal_events',
  'signal_deliveries',
  'backtest_metrics',
  'backtest_artifacts',
  'audit_events',
] as const;

let sequencesReady = false;

function nowMs() {
  return Date.now();
}

function toNullableNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function limitValue(limit: number | undefined, fallback: number) {
  return Math.max(1, Number(limit || fallback));
}

function normalizeBooleanNumber(value: unknown) {
  return Number(value) ? 1 : 0;
}

function qualifySequence(table: string) {
  const schema = quotePgIdentifier(getPostgresBusinessSchema());
  const sequence = quotePgIdentifier(`${table}_id_seq`);
  return `${schema}.${sequence}`;
}

function ensureSequences() {
  if (sequencesReady) return;
  for (const table of AUTO_ID_TABLES) {
    const sequence = qualifySequence(table);
    const qualifiedTable = qualifyBusinessTable(table);
    beginTransactionSync();
    try {
      executeSync(`CREATE SEQUENCE IF NOT EXISTS ${sequence};`);
      executeSync(
        `ALTER TABLE ${qualifiedTable} ALTER COLUMN ${quotePgIdentifier('id')} SET DEFAULT nextval('${sequence}'::regclass);`,
      );
      executeSync(`LOCK TABLE ${qualifiedTable} IN EXCLUSIVE MODE;`);
      executeSync(
        `SELECT setval('${sequence}'::regclass, COALESCE((SELECT MAX(id) FROM ${qualifiedTable}), 0), true);`,
      );
      commitTransactionSync();
    } catch (error) {
      rollbackTransactionSync();
      throw error;
    }
  }
  sequencesReady = true;
}

function mapSignalRecord(row: Record<string, unknown>): SignalRecord {
  return {
    signal_id: String(row.signal_id || ''),
    created_at_ms: Number(row.created_at_ms || 0),
    expires_at_ms: Number(row.expires_at_ms || 0),
    asset_class: String(row.asset_class || 'US_STOCK') as SignalRecord['asset_class'],
    market: String(row.market || 'US') as Market,
    symbol: String(row.symbol || ''),
    timeframe: String(row.timeframe || ''),
    strategy_id: String(row.strategy_id || ''),
    strategy_family: String(row.strategy_family || ''),
    strategy_version: String(row.strategy_version || ''),
    regime_id: String(row.regime_id || ''),
    temperature_percentile: Number(row.temperature_percentile || 0),
    volatility_percentile: Number(row.volatility_percentile || 0),
    direction: String(row.direction || 'LONG') as SignalRecord['direction'],
    strength: Number(row.strength || 0),
    confidence: Number(row.confidence || 0),
    entry_low: Number(row.entry_low || 0),
    entry_high: Number(row.entry_high || 0),
    entry_method: String(row.entry_method || ''),
    invalidation_level: Number(row.invalidation_level || 0),
    stop_type: String(row.stop_type || ''),
    stop_price: Number(row.stop_price || 0),
    tp1_price: toNullableNumber(row.tp1_price),
    tp1_size_pct: toNullableNumber(row.tp1_size_pct),
    tp2_price: toNullableNumber(row.tp2_price),
    tp2_size_pct: toNullableNumber(row.tp2_size_pct),
    trailing_type: String(row.trailing_type || ''),
    trailing_params_json: String(row.trailing_params_json || '{}'),
    position_pct: Number(row.position_pct || 0),
    leverage_cap: Number(row.leverage_cap || 0),
    risk_bucket_applied: String(row.risk_bucket_applied || ''),
    fee_bps: Number(row.fee_bps || 0),
    spread_bps: Number(row.spread_bps || 0),
    slippage_bps: Number(row.slippage_bps || 0),
    funding_est_bps: toNullableNumber(row.funding_est_bps),
    basis_est: toNullableNumber(row.basis_est),
    expected_r: Number(row.expected_r || 0),
    hit_rate_est: Number(row.hit_rate_est || 0),
    sample_size: Number(row.sample_size || 0),
    expected_max_dd_est: toNullableNumber(row.expected_max_dd_est),
    status: String(row.status || 'NEW') as SignalRecord['status'],
    score: Number(row.score || 0),
    payload_json: String(row.payload_json || '{}'),
    updated_at_ms: Number(row.updated_at_ms || 0),
  };
}

function mapSignalContract(signal: SignalContract): SignalRecord {
  const tp1 = signal.take_profit_levels?.[0];
  const tp2 = signal.take_profit_levels?.[1];
  const updatedAt = nowMs();
  return {
    signal_id: signal.id,
    created_at_ms: Date.parse(signal.created_at) || updatedAt,
    expires_at_ms: Date.parse(signal.expires_at) || updatedAt,
    asset_class: signal.asset_class,
    market: signal.market,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    strategy_id: signal.strategy_id,
    strategy_family: signal.strategy_family,
    strategy_version: signal.strategy_version,
    regime_id: signal.regime_id,
    temperature_percentile: signal.temperature_percentile,
    volatility_percentile: signal.volatility_percentile,
    direction: signal.direction,
    strength: signal.strength,
    confidence: signal.confidence,
    entry_low: signal.entry_zone.low,
    entry_high: signal.entry_zone.high,
    entry_method: signal.entry_zone.method,
    invalidation_level: signal.invalidation_level,
    stop_type: signal.stop_loss.type,
    stop_price: signal.stop_loss.price,
    tp1_price: tp1?.price ?? null,
    tp1_size_pct: tp1?.size_pct ?? null,
    tp2_price: tp2?.price ?? null,
    tp2_size_pct: tp2?.size_pct ?? null,
    trailing_type: signal.trailing_rule.type,
    trailing_params_json: JSON.stringify(signal.trailing_rule.params ?? {}),
    position_pct: signal.position_advice.position_pct,
    leverage_cap: signal.position_advice.leverage_cap,
    risk_bucket_applied: signal.position_advice.risk_bucket_applied,
    fee_bps: signal.cost_model.fee_bps,
    spread_bps: signal.cost_model.spread_bps,
    slippage_bps: signal.cost_model.slippage_bps,
    funding_est_bps: signal.cost_model.funding_est_bps ?? null,
    basis_est: signal.cost_model.basis_est ?? null,
    expected_r: signal.expected_metrics.expected_R,
    hit_rate_est: signal.expected_metrics.hit_rate_est,
    sample_size: signal.expected_metrics.sample_size,
    expected_max_dd_est: signal.expected_metrics.expected_max_dd_est ?? null,
    status: signal.status,
    score: signal.score,
    payload_json: JSON.stringify(signal),
    updated_at_ms: updatedAt,
  };
}

export class PostgresRuntimeRepository extends MarketRepository {
  constructor() {
    super(UNSUPPORTED_DB);
    ensureSequences();
  }

  upsertAsset(input: AssetInput): Asset {
    const ts = nowMs();
    const row = queryRowSync<Asset>(
      `
        INSERT INTO ${qualifyBusinessTable('assets')}(
          symbol, market, venue, base, quote, status, created_at, updated_at
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT(symbol, market, venue) DO UPDATE SET
          base = EXCLUDED.base,
          quote = EXCLUDED.quote,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
        RETURNING asset_id, symbol, market, venue, base, quote, status, created_at, updated_at
      `,
      [
        input.symbol,
        input.market,
        input.venue,
        input.base ?? null,
        input.quote ?? null,
        input.status ?? 'ACTIVE',
        ts,
        ts,
      ],
    );
    if (!row) throw new Error(`Failed to upsert asset ${input.symbol} (${input.market})`);
    return row;
  }

  getAssetBySymbol(market: string, symbol: string): Asset | null {
    return (
      queryRowSync<Asset>(
        `
          SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at
          FROM ${qualifyBusinessTable('assets')}
          WHERE market = $1 AND symbol = $2 AND status = 'ACTIVE'
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [market, symbol],
      ) || null
    );
  }

  listAssets(market?: string): Asset[] {
    if (market) {
      return queryRowsSync<Asset>(
        `
          SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at
          FROM ${qualifyBusinessTable('assets')}
          WHERE market = $1
          ORDER BY symbol
        `,
        [market],
      );
    }
    return queryRowsSync<Asset>(
      `
        SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at
        FROM ${qualifyBusinessTable('assets')}
        ORDER BY market, symbol
      `,
    );
  }

  upsertOhlcvBars(
    assetId: number,
    timeframe: Timeframe,
    bars: NormalizedBar[],
    source: string,
  ): number {
    if (!bars.length) return 0;
    const ingestAt = nowMs();
    upsertRowsSync({
      table: 'ohlcv',
      columns: [
        'asset_id',
        'timeframe',
        'ts_open',
        'open',
        'high',
        'low',
        'close',
        'volume',
        'source',
        'ingest_at',
      ],
      rows: bars.map((bar) => ({
        asset_id: assetId,
        timeframe,
        ts_open: bar.ts_open,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        source,
        ingest_at: ingestAt,
      })),
      conflictColumns: ['asset_id', 'timeframe', 'ts_open'],
    });
    return bars.length;
  }

  upsertFundingRates(
    assetId: number,
    rows: Array<{ ts_open: number; funding_rate: string }>,
    source: string,
  ): number {
    if (!rows.length) return 0;
    const ingestAt = nowMs();
    upsertRowsSync({
      table: 'funding_rates',
      columns: ['asset_id', 'ts_open', 'funding_rate', 'source', 'ingest_at'],
      rows: rows.map((row) => ({
        asset_id: assetId,
        ts_open: row.ts_open,
        funding_rate: row.funding_rate,
        source,
        ingest_at: ingestAt,
      })),
      conflictColumns: ['asset_id', 'ts_open'],
    });
    return rows.length;
  }

  listFundingRates(params: {
    assetId: number;
    start?: number;
    end?: number;
    limit?: number;
  }): FundingRateRow[] {
    const where: string[] = ['asset_id = $1'];
    const values: unknown[] = [params.assetId];
    if (params.start !== undefined) {
      values.push(params.start);
      where.push(`ts_open >= $${values.length}`);
    }
    if (params.end !== undefined) {
      values.push(params.end);
      where.push(`ts_open <= $${values.length}`);
    }
    if (params.limit) {
      values.push(params.limit);
      return queryRowsSync<FundingRateRow>(
        `
          SELECT asset_id, ts_open, funding_rate, source, ingest_at
          FROM (
            SELECT asset_id, ts_open, funding_rate, source, ingest_at
            FROM ${qualifyBusinessTable('funding_rates')}
            WHERE ${where.join(' AND ')}
            ORDER BY ts_open DESC
            LIMIT $${values.length}
          ) ranked
          ORDER BY ts_open ASC
        `,
        values,
      );
    }
    return queryRowsSync<FundingRateRow>(
      `
        SELECT asset_id, ts_open, funding_rate, source, ingest_at
        FROM ${qualifyBusinessTable('funding_rates')}
        WHERE ${where.join(' AND ')}
        ORDER BY ts_open ASC
      `,
      values,
    );
  }

  getLatestFundingRate(assetId: number): FundingRateRow | null {
    return (
      queryRowSync<FundingRateRow>(
        `
          SELECT asset_id, ts_open, funding_rate, source, ingest_at
          FROM ${qualifyBusinessTable('funding_rates')}
          WHERE asset_id = $1
          ORDER BY ts_open DESC
          LIMIT 1
        `,
        [assetId],
      ) || null
    );
  }

  upsertBasisSnapshots(
    assetId: number,
    rows: Array<{ ts_open: number; basis_bps: string }>,
    source: string,
  ): number {
    if (!rows.length) return 0;
    const ingestAt = nowMs();
    upsertRowsSync({
      table: 'basis_snapshots',
      columns: ['asset_id', 'ts_open', 'basis_bps', 'source', 'ingest_at'],
      rows: rows.map((row) => ({
        asset_id: assetId,
        ts_open: row.ts_open,
        basis_bps: row.basis_bps,
        source,
        ingest_at: ingestAt,
      })),
      conflictColumns: ['asset_id', 'ts_open'],
    });
    return rows.length;
  }

  listBasisSnapshots(params: {
    assetId: number;
    start?: number;
    end?: number;
    limit?: number;
  }): BasisSnapshotRow[] {
    const where: string[] = ['asset_id = $1'];
    const values: unknown[] = [params.assetId];
    if (params.start !== undefined) {
      values.push(params.start);
      where.push(`ts_open >= $${values.length}`);
    }
    if (params.end !== undefined) {
      values.push(params.end);
      where.push(`ts_open <= $${values.length}`);
    }
    if (params.limit) {
      values.push(params.limit);
      return queryRowsSync<BasisSnapshotRow>(
        `
          SELECT asset_id, ts_open, basis_bps, source, ingest_at
          FROM (
            SELECT asset_id, ts_open, basis_bps, source, ingest_at
            FROM ${qualifyBusinessTable('basis_snapshots')}
            WHERE ${where.join(' AND ')}
            ORDER BY ts_open DESC
            LIMIT $${values.length}
          ) ranked
          ORDER BY ts_open ASC
        `,
        values,
      );
    }
    return queryRowsSync<BasisSnapshotRow>(
      `
        SELECT asset_id, ts_open, basis_bps, source, ingest_at
        FROM ${qualifyBusinessTable('basis_snapshots')}
        WHERE ${where.join(' AND ')}
        ORDER BY ts_open ASC
      `,
      values,
    );
  }

  getLatestBasisSnapshot(assetId: number): BasisSnapshotRow | null {
    return (
      queryRowSync<BasisSnapshotRow>(
        `
          SELECT asset_id, ts_open, basis_bps, source, ingest_at
          FROM ${qualifyBusinessTable('basis_snapshots')}
          WHERE asset_id = $1
          ORDER BY ts_open DESC
          LIMIT 1
        `,
        [assetId],
      ) || null
    );
  }

  getOhlcv(params: {
    assetId: number;
    timeframe: Timeframe;
    start?: number;
    end?: number;
    limit?: number;
  }): Array<{
    ts_open: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    source: string;
  }> {
    const where: string[] = ['asset_id = $1', 'timeframe = $2'];
    const values: unknown[] = [params.assetId, params.timeframe];
    if (params.start !== undefined) {
      values.push(params.start);
      where.push(`ts_open >= $${values.length}`);
    }
    if (params.end !== undefined) {
      values.push(params.end);
      where.push(`ts_open <= $${values.length}`);
    }
    if (params.limit) {
      values.push(params.limit);
      return queryRowsSync<{
        ts_open: number;
        open: string;
        high: string;
        low: string;
        close: string;
        volume: string;
        source: string;
      }>(
        `
          SELECT ts_open, open, high, low, close, volume, source
          FROM (
            SELECT ts_open, open, high, low, close, volume, source
            FROM ${qualifyBusinessTable('ohlcv')}
            WHERE ${where.join(' AND ')}
            ORDER BY ts_open DESC
            LIMIT $${values.length}
          ) ranked
          ORDER BY ts_open ASC
        `,
        values,
      );
    }
    return queryRowsSync<{
      ts_open: number;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
      source: string;
    }>(
      `
        SELECT ts_open, open, high, low, close, volume, source
        FROM ${qualifyBusinessTable('ohlcv')}
        WHERE ${where.join(' AND ')}
        ORDER BY ts_open ASC
      `,
      values,
    );
  }

  getLatestTsOpen(assetId: number, timeframe: Timeframe): number | null {
    const row = queryRowSync<{ ts_open: number }>(
      `
        SELECT ts_open
        FROM ${qualifyBusinessTable('ohlcv')}
        WHERE asset_id = $1 AND timeframe = $2
        ORDER BY ts_open DESC
        LIMIT 1
      `,
      [assetId, timeframe],
    );
    return row?.ts_open ?? null;
  }

  getOhlcvStats(assetId: number, timeframe: Timeframe) {
    const row = queryRowSync<{
      bar_count: number;
      first_ts_open: number | null;
      last_ts_open: number | null;
    }>(
      `
        SELECT COUNT(*) AS bar_count, MIN(ts_open) AS first_ts_open, MAX(ts_open) AS last_ts_open
        FROM ${qualifyBusinessTable('ohlcv')}
        WHERE asset_id = $1 AND timeframe = $2
      `,
      [assetId, timeframe],
    );
    return {
      bar_count: Number(row?.bar_count || 0),
      first_ts_open: row?.first_ts_open ?? null,
      last_ts_open: row?.last_ts_open ?? null,
    };
  }

  getCursor(assetId: number, timeframe: Timeframe): number | null {
    const row = queryRowSync<{ last_ts_open: number }>(
      `
        SELECT last_ts_open
        FROM ${qualifyBusinessTable('ingest_cursors')}
        WHERE asset_id = $1 AND timeframe = $2
      `,
      [assetId, timeframe],
    );
    return row?.last_ts_open ?? null;
  }

  setCursor(assetId: number, timeframe: Timeframe, lastTsOpen: number, source: string): void {
    executeSync(
      `
        INSERT INTO ${qualifyBusinessTable('ingest_cursors')}(
          asset_id, timeframe, last_ts_open, source, updated_at
        ) VALUES($1, $2, $3, $4, $5)
        ON CONFLICT(asset_id, timeframe) DO UPDATE SET
          last_ts_open = EXCLUDED.last_ts_open,
          source = EXCLUDED.source,
          updated_at = EXCLUDED.updated_at
      `,
      [assetId, timeframe, lastTsOpen, source, nowMs()],
    );
  }

  listAssetIdsByMarket(market?: string) {
    if (market) {
      return queryRowsSync<
        Array<{ asset_id: number; symbol: string; market: string; venue: string }>[number]
      >(
        `
          SELECT asset_id, symbol, market, venue
          FROM ${qualifyBusinessTable('assets')}
          WHERE market = $1
          ORDER BY symbol
        `,
        [market],
      );
    }
    return queryRowsSync<
      Array<{ asset_id: number; symbol: string; market: string; venue: string }>[number]
    >(
      `
        SELECT asset_id, symbol, market, venue
        FROM ${qualifyBusinessTable('assets')}
        ORDER BY market, symbol
      `,
    );
  }

  listBarsRange(assetId: number, timeframe: Timeframe, start: number, end: number): number[] {
    return queryRowsSync<{ ts_open: number }>(
      `
        SELECT ts_open
        FROM ${qualifyBusinessTable('ohlcv')}
        WHERE asset_id = $1 AND timeframe = $2 AND ts_open >= $3 AND ts_open <= $4
        ORDER BY ts_open ASC
      `,
      [assetId, timeframe, start, end],
    ).map((row) => row.ts_open);
  }

  logAnomaly(args: {
    assetId?: number | null;
    timeframe: Timeframe;
    tsOpen?: number | null;
    anomalyType: string;
    detail: string;
  }): void {
    executeSync(
      `
        INSERT INTO ${qualifyBusinessTable('ingest_anomalies')}(
          asset_id, timeframe, ts_open, anomaly_type, detail, created_at
        ) VALUES($1, $2, $3, $4, $5, $6)
      `,
      [
        args.assetId ?? null,
        args.timeframe,
        args.tsOpen ?? null,
        args.anomalyType,
        args.detail,
        nowMs(),
      ],
    );
  }

  upsertSignal(signal: SignalContract): void {
    this.upsertSignals([signal]);
  }

  upsertSignals(signals: SignalContract[]): void {
    if (!signals.length) return;
    upsertRowsSync({
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
      rows: signals.map((signal) => mapSignalContract(signal)),
      conflictColumns: ['signal_id'],
    });
  }

  expireSignalsNotIn(activeSignalIds: string[]): number {
    const updatedAt = nowMs();
    if (!activeSignalIds.length) {
      return Number(
        executeSync(
          `
            UPDATE ${qualifyBusinessTable('signals')}
            SET status = 'EXPIRED', updated_at_ms = $1
            WHERE status IN ('NEW', 'TRIGGERED')
          `,
          [updatedAt],
        ).rowCount || 0,
      );
    }
    return Number(
      executeSync(
        `
          UPDATE ${qualifyBusinessTable('signals')}
          SET status = 'EXPIRED', updated_at_ms = $1
          WHERE status IN ('NEW', 'TRIGGERED')
            AND NOT (signal_id = ANY($2::text[]))
        `,
        [updatedAt, activeSignalIds],
      ).rowCount || 0,
    );
  }

  listSignals(params?: {
    assetClass?: AssetClass;
    market?: Market;
    symbol?: string;
    status?: SignalStatus | 'ALL';
    limit?: number;
  }): SignalRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.assetClass) {
      values.push(params.assetClass);
      where.push(`asset_class = $${values.length}`);
    }
    if (params?.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params?.symbol) {
      values.push(params.symbol.toUpperCase());
      where.push(`symbol = $${values.length}`);
    }
    if (params?.status && params.status !== 'ALL') {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<Record<string, unknown>>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('signals')}
        ${whereSql}
        ORDER BY score DESC, created_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    ).map(mapSignalRecord);
  }

  getSignal(signalId: string): SignalRecord | null {
    const row = queryRowSync<Record<string, unknown>>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('signals')}
        WHERE signal_id = $1
        LIMIT 1
      `,
      [signalId],
    );
    return row ? mapSignalRecord(row) : null;
  }

  appendSignalEvent(signalId: string, eventType: string, payload?: Record<string, unknown>): void {
    executeSync(
      `
        INSERT INTO ${qualifyBusinessTable('signal_events')}(
          signal_id, event_type, payload_json, created_at_ms
        ) VALUES($1, $2, $3, $4)
      `,
      [signalId, eventType, payload ? JSON.stringify(payload) : null, nowMs()],
    );
  }

  listSignalEvents(
    signalId: string,
    limit = 40,
  ): Array<{
    id: number;
    signal_id: string;
    event_type: string;
    payload_json: string | null;
    created_at_ms: number;
  }> {
    return queryRowsSync<{
      id: number;
      signal_id: string;
      event_type: string;
      payload_json: string | null;
      created_at_ms: number;
    }>(
      `
        SELECT id, signal_id, event_type, payload_json, created_at_ms
        FROM ${qualifyBusinessTable('signal_events')}
        WHERE signal_id = $1
        ORDER BY created_at_ms DESC
        LIMIT $2
      `,
      [signalId, limit],
    );
  }

  upsertExecution(
    input: Omit<ExecutionRecord, 'updated_at_ms'> & { updated_at_ms?: number },
  ): void {
    const ts = input.updated_at_ms ?? nowMs();
    executeSync(
      `
        INSERT INTO ${qualifyBusinessTable('executions')}(
          execution_id, signal_id, user_id, mode, action, market, symbol,
          entry_price, stop_price, tp_price, size_pct, pnl_pct, note,
          created_at_ms, updated_at_ms
        ) VALUES(
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15
        )
        ON CONFLICT(execution_id) DO UPDATE SET
          signal_id = EXCLUDED.signal_id,
          user_id = EXCLUDED.user_id,
          mode = EXCLUDED.mode,
          action = EXCLUDED.action,
          market = EXCLUDED.market,
          symbol = EXCLUDED.symbol,
          entry_price = EXCLUDED.entry_price,
          stop_price = EXCLUDED.stop_price,
          tp_price = EXCLUDED.tp_price,
          size_pct = EXCLUDED.size_pct,
          pnl_pct = EXCLUDED.pnl_pct,
          note = EXCLUDED.note,
          created_at_ms = EXCLUDED.created_at_ms,
          updated_at_ms = EXCLUDED.updated_at_ms
      `,
      [
        input.execution_id,
        input.signal_id,
        input.user_id,
        input.mode,
        input.action,
        input.market,
        input.symbol,
        input.entry_price ?? null,
        input.stop_price ?? null,
        input.tp_price ?? null,
        input.size_pct ?? null,
        input.pnl_pct ?? null,
        input.note ?? null,
        input.created_at_ms,
        ts,
      ],
    );
  }

  listExecutions(params?: {
    userId?: string;
    market?: Market;
    mode?: 'PAPER' | 'LIVE';
    signalId?: string;
    limit?: number;
  }): ExecutionRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.userId) {
      values.push(params.userId);
      where.push(`user_id = $${values.length}`);
    }
    if (params?.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params?.mode) {
      values.push(params.mode);
      where.push(`mode = $${values.length}`);
    }
    if (params?.signalId) {
      values.push(params.signalId);
      where.push(`signal_id = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 200));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<ExecutionRecord>(
      `
        SELECT
          execution_id, signal_id, user_id, mode, action, market, symbol,
          entry_price, stop_price, tp_price, size_pct, pnl_pct, note,
          created_at_ms, updated_at_ms
        FROM ${qualifyBusinessTable('executions')}
        ${whereSql}
        ORDER BY created_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    ).map((row) => ({
      ...row,
      entry_price: row.entry_price ?? undefined,
      stop_price: row.stop_price ?? undefined,
      tp_price: row.tp_price ?? undefined,
      size_pct: row.size_pct ?? undefined,
      pnl_pct: row.pnl_pct ?? undefined,
      note: row.note ?? undefined,
    }));
  }

  upsertUserRiskProfile(profile: UserRiskProfileRecord): void {
    upsertRowsSync({
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
      rows: [profile],
      conflictColumns: ['user_id'],
    });
  }

  getUserRiskProfile(userId: string): UserRiskProfileRecord | null {
    return (
      queryRowSync<UserRiskProfileRecord>(
        `
          SELECT
            user_id, profile_key, max_loss_per_trade, max_daily_loss, max_drawdown, exposure_cap, leverage_cap, updated_at_ms
          FROM ${qualifyBusinessTable('user_risk_profiles')}
          WHERE user_id = $1
          LIMIT 1
        `,
        [userId],
      ) || null
    );
  }

  upsertMarketState(record: MarketStateRecord): void {
    this.upsertMarketStates([record]);
  }

  upsertMarketStates(rows: MarketStateRecord[]): void {
    if (!rows.length) return;
    upsertRowsSync({
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

  listMarketState(params?: {
    market?: Market;
    symbol?: string;
    timeframe?: string;
  }): MarketStateRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params?.symbol) {
      values.push(params.symbol.toUpperCase());
      where.push(`symbol = $${values.length}`);
    }
    if (params?.timeframe) {
      values.push(params.timeframe);
      where.push(`timeframe = $${values.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<MarketStateRecord>(
      `
        SELECT
          market, symbol, timeframe, snapshot_ts_ms, regime_id, trend_strength, temperature_percentile,
          volatility_percentile, risk_off_score, stance, event_stats_json, assumptions_json, updated_at_ms
        FROM ${qualifyBusinessTable('market_state')}
        ${whereSql}
        ORDER BY temperature_percentile DESC, updated_at_ms DESC
      `,
      values,
    );
  }

  upsertPerformanceSnapshot(record: PerformanceSnapshotRecord): void {
    this.upsertPerformanceSnapshots([record]);
  }

  upsertPerformanceSnapshots(rows: PerformanceSnapshotRecord[]): void {
    if (!rows.length) return;
    upsertRowsSync({
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

  listPerformanceSnapshots(params?: {
    market?: Market;
    range?: string;
    segmentType?: string;
  }): PerformanceSnapshotRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params?.range) {
      values.push(params.range);
      where.push(`range = $${values.length}`);
    }
    if (params?.segmentType) {
      values.push(params.segmentType);
      where.push(`segment_type = $${values.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<PerformanceSnapshotRecord>(
      `
        SELECT market, range, segment_type, segment_key, source_label, sample_size, payload_json, asof_ms, updated_at_ms
        FROM ${qualifyBusinessTable('performance_snapshots')}
        ${whereSql}
        ORDER BY asof_ms DESC, sample_size DESC
      `,
      values,
    );
  }

  upsertNewsItem(record: NewsItemRecord): void {
    this.upsertNewsItems([record]);
  }

  upsertNewsItems(rows: NewsItemRecord[]): void {
    if (!rows.length) return;
    upsertRowsSync({
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

  listNewsItems(params?: {
    market?: Market | 'ALL';
    symbol?: string;
    limit?: number;
    sinceMs?: number;
  }): NewsItemRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params?.symbol) {
      values.push(params.symbol.toUpperCase());
      where.push(`symbol = $${values.length}`);
    }
    if (Number.isFinite(params?.sinceMs)) {
      values.push(params?.sinceMs);
      where.push(`published_at_ms >= $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<NewsItemRecord>(
      `
        SELECT id, market, symbol, headline, source, url, published_at_ms, sentiment_label, relevance_score, payload_json, updated_at_ms
        FROM ${qualifyBusinessTable('news_items')}
        ${whereSql}
        ORDER BY published_at_ms DESC, updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertFundamentalSnapshot(record: FundamentalSnapshotRecord): void {
    this.upsertFundamentalSnapshots([record]);
  }

  upsertFundamentalSnapshots(rows: FundamentalSnapshotRecord[]): void {
    if (!rows.length) return;
    upsertRowsSync({
      table: 'fundamental_snapshots',
      columns: ['id', 'market', 'symbol', 'source', 'asof_date', 'payload_json', 'updated_at_ms'],
      rows,
      conflictColumns: ['id'],
    });
  }

  listFundamentalSnapshots(params?: {
    market?: Market;
    symbol?: string;
    limit?: number;
  }): FundamentalSnapshotRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params?.symbol) {
      values.push(params.symbol.toUpperCase());
      where.push(`symbol = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<FundamentalSnapshotRecord>(
      `
        SELECT id, market, symbol, source, asof_date, payload_json, updated_at_ms
        FROM ${qualifyBusinessTable('fundamental_snapshots')}
        ${whereSql}
        ORDER BY updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertOptionChainSnapshot(record: OptionChainSnapshotRecord): void {
    this.upsertOptionChainSnapshots([record]);
  }

  upsertOptionChainSnapshots(rows: OptionChainSnapshotRecord[]): void {
    if (!rows.length) return;
    upsertRowsSync({
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

  listOptionChainSnapshots(params?: {
    market?: Market;
    symbol?: string;
    limit?: number;
  }): OptionChainSnapshotRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params?.symbol) {
      values.push(params.symbol.toUpperCase());
      where.push(`symbol = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<OptionChainSnapshotRecord>(
      `
        SELECT id, market, symbol, expiration_date, snapshot_ts_ms, source, payload_json, updated_at_ms
        FROM ${qualifyBusinessTable('option_chain_snapshots')}
        ${whereSql}
        ORDER BY snapshot_ts_ms DESC, updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertAlphaCandidate(input: AlphaCandidateRecord): void {
    upsertRowsSync({
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
      rows: [input],
      conflictColumns: ['id'],
    });
  }

  getAlphaCandidate(id: string): AlphaCandidateRecord | null {
    return (
      queryRowSync<AlphaCandidateRecord>(
        `SELECT * FROM ${qualifyBusinessTable('alpha_candidates')} WHERE id = $1 LIMIT 1`,
        [id],
      ) || null
    );
  }

  listAlphaCandidates(params?: {
    status?: AlphaCandidateRecord['status'] | 'ALL';
    family?: string;
    source?: string;
    limit?: number;
  }): AlphaCandidateRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.status && params.status !== 'ALL') {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }
    if (params?.family) {
      values.push(params.family);
      where.push(`family = $${values.length}`);
    }
    if (params?.source) {
      values.push(params.source);
      where.push(`source = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 100));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<AlphaCandidateRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('alpha_candidates')}
        ${whereSql}
        ORDER BY updated_at_ms DESC, acceptance_score DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  insertAlphaEvaluation(input: AlphaEvaluationRecord): void {
    insertRowsSync({
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
      rows: [input],
    });
  }

  listAlphaEvaluations(params?: {
    alphaCandidateId?: string;
    evaluationStatus?: AlphaEvaluationRecord['evaluation_status'];
    limit?: number;
  }): AlphaEvaluationRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.alphaCandidateId) {
      values.push(params.alphaCandidateId);
      where.push(`alpha_candidate_id = $${values.length}`);
    }
    if (params?.evaluationStatus) {
      values.push(params.evaluationStatus);
      where.push(`evaluation_status = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 100));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<AlphaEvaluationRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('alpha_evaluations')}
        ${whereSql}
        ORDER BY created_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  getLatestAlphaEvaluation(alphaCandidateId: string): AlphaEvaluationRecord | null {
    return (
      queryRowSync<AlphaEvaluationRecord>(
        `
          SELECT *
          FROM ${qualifyBusinessTable('alpha_evaluations')}
          WHERE alpha_candidate_id = $1
          ORDER BY created_at_ms DESC
          LIMIT 1
        `,
        [alphaCandidateId],
      ) || null
    );
  }

  upsertAlphaShadowObservation(input: AlphaShadowObservationRecord): void {
    this.upsertAlphaShadowObservations([input]);
  }

  upsertAlphaShadowObservations(rows: AlphaShadowObservationRecord[]): void {
    if (!rows.length) return;
    upsertRowsSync({
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

  listAlphaShadowObservations(params?: {
    alphaCandidateId?: string;
    signalId?: string;
    limit?: number;
  }): AlphaShadowObservationRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.alphaCandidateId) {
      values.push(params.alphaCandidateId);
      where.push(`alpha_candidate_id = $${values.length}`);
    }
    if (params?.signalId) {
      values.push(params.signalId);
      where.push(`signal_id = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 120));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<AlphaShadowObservationRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('alpha_shadow_observations')}
        ${whereSql}
        ORDER BY updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  insertAlphaLifecycleEvent(input: AlphaLifecycleEventRecord): void {
    insertRowsSync({
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
      rows: [input],
    });
  }

  listAlphaLifecycleEvents(params?: {
    alphaCandidateId?: string;
    limit?: number;
  }): AlphaLifecycleEventRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.alphaCandidateId) {
      values.push(params.alphaCandidateId);
      where.push(`alpha_candidate_id = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 120));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<AlphaLifecycleEventRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('alpha_lifecycle_events')}
        ${whereSql}
        ORDER BY created_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertApiKey(input: {
    key_id: string;
    key_hash: string;
    label: string;
    scope: string;
    status?: 'ACTIVE' | 'DISABLED';
  }): void {
    const ts = nowMs();
    upsertRowsSync({
      table: 'api_keys',
      columns: ['key_id', 'key_hash', 'label', 'scope', 'status', 'created_at_ms', 'updated_at_ms'],
      rows: [
        {
          key_id: input.key_id,
          key_hash: input.key_hash,
          label: input.label,
          scope: input.scope,
          status: input.status ?? 'ACTIVE',
          created_at_ms: ts,
          updated_at_ms: ts,
        },
      ],
      conflictColumns: ['key_id'],
    });
  }

  getApiKeyByHash(keyHash: string) {
    return (
      queryRowSync<{
        key_id: string;
        key_hash: string;
        label: string;
        scope: string;
        status: string;
      }>(
        `
          SELECT key_id, key_hash, label, scope, status
          FROM ${qualifyBusinessTable('api_keys')}
          WHERE key_hash = $1
          LIMIT 1
        `,
        [keyHash],
      ) || null
    );
  }

  logSignalDelivery(input: {
    signal_id: string;
    channel: string;
    endpoint?: string | null;
    event_type: string;
    status: 'SENT' | 'FAILED' | 'SKIPPED';
    detail?: string | null;
  }): void {
    executeSync(
      `
        INSERT INTO ${qualifyBusinessTable('signal_deliveries')}(
          signal_id, channel, endpoint, event_type, status, detail, created_at_ms
        ) VALUES($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.signal_id,
        input.channel,
        input.endpoint ?? null,
        input.event_type,
        input.status,
        input.detail ?? null,
        nowMs(),
      ],
    );
  }

  upsertExternalConnection(input: {
    connection_id: string;
    user_id: string;
    connection_type: 'BROKER' | 'EXCHANGE';
    provider: string;
    mode: 'READ_ONLY' | 'TRADING';
    status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
    meta_json?: string | null;
  }): void {
    const ts = nowMs();
    upsertRowsSync({
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
      rows: [
        {
          connection_id: input.connection_id,
          user_id: input.user_id,
          connection_type: input.connection_type,
          provider: input.provider,
          mode: input.mode,
          status: input.status,
          meta_json: input.meta_json ?? null,
          created_at_ms: ts,
          updated_at_ms: ts,
        },
      ],
      conflictColumns: ['connection_id'],
    });
  }

  listExternalConnections(params: { userId: string; connectionType?: 'BROKER' | 'EXCHANGE' }) {
    const where: string[] = ['user_id = $1'];
    const values: unknown[] = [params.userId];
    if (params.connectionType) {
      values.push(params.connectionType);
      where.push(`connection_type = $${values.length}`);
    }
    return queryRowsSync<{
      connection_id: string;
      user_id: string;
      connection_type: 'BROKER' | 'EXCHANGE';
      provider: string;
      mode: 'READ_ONLY' | 'TRADING';
      status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
      meta_json: string | null;
      updated_at_ms: number;
    }>(
      `
        SELECT connection_id, user_id, connection_type, provider, mode, status, meta_json, updated_at_ms
        FROM ${qualifyBusinessTable('external_connections')}
        WHERE ${where.join(' AND ')}
        ORDER BY updated_at_ms DESC
      `,
      values,
    );
  }

  upsertChatThread(input: ChatThreadRecord): void {
    upsertRowsSync({
      table: 'chat_threads',
      columns: [
        'id',
        'user_id',
        'title',
        'last_context_json',
        'last_message_preview',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
    });
  }

  getChatThread(id: string, userId: string): ChatThreadRecord | null {
    return (
      queryRowSync<ChatThreadRecord>(
        `
          SELECT id, user_id, title, last_context_json, last_message_preview, created_at_ms, updated_at_ms
          FROM ${qualifyBusinessTable('chat_threads')}
          WHERE id = $1 AND user_id = $2
          LIMIT 1
        `,
        [id, userId],
      ) || null
    );
  }

  listChatThreads(userId: string, limit = 20): ChatThreadRecord[] {
    return queryRowsSync<ChatThreadRecord>(
      `
        SELECT id, user_id, title, last_context_json, last_message_preview, created_at_ms, updated_at_ms
        FROM ${qualifyBusinessTable('chat_threads')}
        WHERE user_id = $1
        ORDER BY updated_at_ms DESC
        LIMIT $2
      `,
      [userId, limit],
    );
  }

  appendChatMessage(input: ChatMessageRecord): number {
    const row = queryRowSync<{ id: number }>(
      `
        INSERT INTO ${qualifyBusinessTable('chat_messages')}(
          thread_id, user_id, role, content, context_json, provider, status, created_at_ms
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [
        input.thread_id,
        input.user_id,
        input.role,
        input.content,
        input.context_json ?? null,
        input.provider ?? null,
        input.status,
        input.created_at_ms,
      ],
    );
    return Number(row?.id || 0);
  }

  listChatMessages(threadId: string, limit = 20): ChatMessageRecord[] {
    const rows = queryRowsSync<ChatMessageRecord>(
      `
        SELECT id, thread_id, user_id, role, content, context_json, provider, status, created_at_ms
        FROM ${qualifyBusinessTable('chat_messages')}
        WHERE thread_id = $1
        ORDER BY created_at_ms DESC
        LIMIT $2
      `,
      [threadId, limit],
    );
    return [...rows].reverse();
  }

  upsertWorkflowRun(input: WorkflowRunRecord): void {
    upsertRowsSync({
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
      rows: [input],
      conflictColumns: ['id'],
    });
  }

  listWorkflowRuns(params?: {
    workflowKey?: string;
    status?: string;
    limit?: number;
  }): WorkflowRunRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.workflowKey) {
      values.push(params.workflowKey);
      where.push(`workflow_key = $${values.length}`);
    }
    if (params?.status) {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<WorkflowRunRecord>(
      `
        SELECT
          id, workflow_key, workflow_version, trigger_type, status, trace_id, input_json, output_json, attempt_count,
          started_at_ms, updated_at_ms, completed_at_ms
        FROM ${qualifyBusinessTable('workflow_runs')}
        ${whereSql}
        ORDER BY updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  insertAuditEvent(input: AuditEventRecord): void {
    executeSync(
      `
        INSERT INTO ${qualifyBusinessTable('audit_events')}(
          trace_id, scope, event_type, user_id, entity_type, entity_id, payload_json, created_at_ms
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        input.trace_id,
        input.scope,
        input.event_type,
        input.user_id ?? null,
        input.entity_type,
        input.entity_id ?? null,
        input.payload_json,
        input.created_at_ms,
      ],
    );
  }

  listAuditEvents(params?: {
    traceId?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
  }): AuditEventRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.traceId) {
      values.push(params.traceId);
      where.push(`trace_id = $${values.length}`);
    }
    if (params?.entityType) {
      values.push(params.entityType);
      where.push(`entity_type = $${values.length}`);
    }
    if (params?.entityId) {
      values.push(params.entityId);
      where.push(`entity_id = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 100));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<AuditEventRecord>(
      `
        SELECT id, trace_id, scope, event_type, user_id, entity_type, entity_id, payload_json, created_at_ms
        FROM ${qualifyBusinessTable('audit_events')}
        ${whereSql}
        ORDER BY created_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertDecisionSnapshot(input: DecisionSnapshotRecord): void {
    upsertRowsSync({
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
      rows: [input],
      conflictColumns: ['id'],
    });
  }

  getLatestDecisionSnapshot(params: {
    userId: string;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
  }): DecisionSnapshotRecord | null {
    const where: string[] = ['user_id = $1'];
    const values: unknown[] = [params.userId];
    if (params.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params.assetClass) {
      values.push(params.assetClass);
      where.push(`asset_class = $${values.length}`);
    }
    return (
      queryRowSync<DecisionSnapshotRecord>(
        `
          SELECT *
          FROM ${qualifyBusinessTable('decision_snapshots')}
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at_ms DESC
          LIMIT 1
        `,
        values,
      ) || null
    );
  }

  listDecisionSnapshots(params: {
    userId: string;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    limit?: number;
  }): DecisionSnapshotRecord[] {
    const where: string[] = ['user_id = $1'];
    const values: unknown[] = [params.userId];
    if (params.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params.assetClass) {
      values.push(params.assetClass);
      where.push(`asset_class = $${values.length}`);
    }
    values.push(limitValue(params.limit, 20));
    return queryRowsSync<DecisionSnapshotRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('decision_snapshots')}
        WHERE ${where.join(' AND ')}
        ORDER BY updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertUserRitualEvent(input: UserRitualEventRecord): void {
    upsertRowsSync({
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
      rows: [input],
      conflictColumns: ['user_id', 'market', 'asset_class', 'event_date', 'event_type'],
    });
  }

  listUserRitualEvents(params: {
    userId: string;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): UserRitualEventRecord[] {
    const where: string[] = ['user_id = $1'];
    const values: unknown[] = [params.userId];
    if (params.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params.assetClass) {
      values.push(params.assetClass);
      where.push(`asset_class = $${values.length}`);
    }
    if (params.fromDate) {
      values.push(params.fromDate);
      where.push(`event_date >= $${values.length}`);
    }
    if (params.toDate) {
      values.push(params.toDate);
      where.push(`event_date <= $${values.length}`);
    }
    values.push(limitValue(params.limit, 120));
    return queryRowsSync<UserRitualEventRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('user_ritual_events')}
        WHERE ${where.join(' AND ')}
        ORDER BY updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  getUserNotificationPreferences(userId: string): NotificationPreferenceRecord | null {
    return (
      queryRowSync<NotificationPreferenceRecord>(
        `
          SELECT *
          FROM ${qualifyBusinessTable('user_notification_preferences')}
          WHERE user_id = $1
          LIMIT 1
        `,
        [userId],
      ) || null
    );
  }

  upsertUserNotificationPreferences(input: NotificationPreferenceRecord): void {
    upsertRowsSync({
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
      rows: [
        {
          ...input,
          morning_enabled: normalizeBooleanNumber(input.morning_enabled),
          state_shift_enabled: normalizeBooleanNumber(input.state_shift_enabled),
          protective_enabled: normalizeBooleanNumber(input.protective_enabled),
          wrap_up_enabled: normalizeBooleanNumber(input.wrap_up_enabled),
        },
      ],
      conflictColumns: ['user_id'],
    });
  }

  upsertNotificationEvent(input: NotificationEventRecord): void {
    upsertRowsSync({
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
      rows: [input],
      conflictColumns: ['fingerprint'],
    });
  }

  listNotificationEvents(params: {
    userId: string;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    status?: string;
    limit?: number;
  }): NotificationEventRecord[] {
    const where: string[] = ['user_id = $1'];
    const values: unknown[] = [params.userId];
    if (params.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params.assetClass) {
      values.push(params.assetClass);
      where.push(`asset_class = $${values.length}`);
    }
    if (params.status) {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }
    values.push(limitValue(params.limit, 20));
    return queryRowsSync<NotificationEventRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('notification_events')}
        WHERE ${where.join(' AND ')}
        ORDER BY updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertNovaTaskRun(input: NovaTaskRunRecord): void {
    upsertRowsSync({
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
      rows: [input],
      conflictColumns: ['id'],
    });
  }

  listNovaTaskRuns(params?: {
    userId?: string;
    threadId?: string;
    taskType?: string;
    status?: string;
    limit?: number;
  }): NovaTaskRunRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.userId) {
      values.push(params.userId);
      where.push(`user_id = $${values.length}`);
    }
    if (params?.threadId) {
      values.push(params.threadId);
      where.push(`thread_id = $${values.length}`);
    }
    if (params?.taskType) {
      values.push(params.taskType);
      where.push(`task_type = $${values.length}`);
    }
    if (params?.status) {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 60));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<NovaTaskRunRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('nova_task_runs')}
        ${whereSql}
        ORDER BY created_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  getNovaTaskRun(runId: string): NovaTaskRunRecord | null {
    return (
      queryRowSync<NovaTaskRunRecord>(
        `
          SELECT *
          FROM ${qualifyBusinessTable('nova_task_runs')}
          WHERE id = $1
          LIMIT 1
        `,
        [runId],
      ) || null
    );
  }

  upsertStrategyVersion(input: StrategyVersionRecord): void {
    upsertRowsSync({
      table: 'strategy_versions',
      columns: [
        'id',
        'strategy_key',
        'family',
        'version',
        'config_hash',
        'config_json',
        'status',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
    });
  }

  listStrategyVersions(params?: {
    strategyKey?: string;
    status?: string;
    limit?: number;
  }): StrategyVersionRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.strategyKey) {
      values.push(params.strategyKey);
      where.push(`strategy_key = $${values.length}`);
    }
    if (params?.status) {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<StrategyVersionRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('strategy_versions')}
        ${whereSql}
        ORDER BY updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  getStrategyVersion(id: string): StrategyVersionRecord | null {
    return (
      queryRowSync<StrategyVersionRecord>(
        `SELECT * FROM ${qualifyBusinessTable('strategy_versions')} WHERE id = $1 LIMIT 1`,
        [id],
      ) || null
    );
  }

  createDatasetVersion(input: DatasetVersionRecord): void {
    executeSync(
      `
        INSERT INTO ${qualifyBusinessTable('dataset_versions')}(
          id, market, asset_class, timeframe, source_bundle_hash, coverage_summary_json, freshness_summary_json, notes, created_at_ms
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT(id) DO NOTHING
      `,
      [
        input.id,
        input.market,
        input.asset_class,
        input.timeframe,
        input.source_bundle_hash,
        input.coverage_summary_json,
        input.freshness_summary_json,
        input.notes ?? null,
        input.created_at_ms,
      ],
    );
  }

  findDatasetVersionByHash(params: {
    market: Market | 'ALL';
    assetClass: AssetClass | 'ALL';
    timeframe: string;
    sourceBundleHash: string;
  }): DatasetVersionRecord | null {
    return (
      queryRowSync<DatasetVersionRecord>(
        `
          SELECT *
          FROM ${qualifyBusinessTable('dataset_versions')}
          WHERE market = $1 AND asset_class = $2 AND timeframe = $3 AND source_bundle_hash = $4
          ORDER BY created_at_ms DESC
          LIMIT 1
        `,
        [params.market, params.assetClass, params.timeframe, params.sourceBundleHash],
      ) || null
    );
  }

  getDatasetVersion(id: string): DatasetVersionRecord | null {
    return (
      queryRowSync<DatasetVersionRecord>(
        `SELECT * FROM ${qualifyBusinessTable('dataset_versions')} WHERE id = $1 LIMIT 1`,
        [id],
      ) || null
    );
  }

  listDatasetVersions(params?: {
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    timeframe?: string;
    limit?: number;
  }): DatasetVersionRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params?.assetClass) {
      values.push(params.assetClass);
      where.push(`asset_class = $${values.length}`);
    }
    if (params?.timeframe) {
      values.push(params.timeframe);
      where.push(`timeframe = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<DatasetVersionRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('dataset_versions')}
        ${whereSql}
        ORDER BY created_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertUniverseSnapshot(input: UniverseSnapshotRecord): void {
    upsertRowsSync({
      table: 'universe_snapshots',
      columns: [
        'id',
        'dataset_version_id',
        'snapshot_ts_ms',
        'market',
        'asset_class',
        'members_json',
        'created_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
      updateColumns: ['members_json', 'snapshot_ts_ms'],
    });
  }

  getUniverseSnapshot(id: string): UniverseSnapshotRecord | null {
    return (
      queryRowSync<UniverseSnapshotRecord>(
        `SELECT * FROM ${qualifyBusinessTable('universe_snapshots')} WHERE id = $1 LIMIT 1`,
        [id],
      ) || null
    );
  }

  listUniverseSnapshots(params?: {
    datasetVersionId?: string;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    limit?: number;
  }): UniverseSnapshotRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.datasetVersionId) {
      values.push(params.datasetVersionId);
      where.push(`dataset_version_id = $${values.length}`);
    }
    if (params?.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params?.assetClass) {
      values.push(params.assetClass);
      where.push(`asset_class = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<UniverseSnapshotRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('universe_snapshots')}
        ${whereSql}
        ORDER BY snapshot_ts_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertFeatureSnapshot(input: FeatureSnapshotRecord): void {
    upsertRowsSync({
      table: 'feature_snapshots',
      columns: [
        'id',
        'dataset_version_id',
        'feature_version',
        'snapshot_ts_ms',
        'feature_hash',
        'metadata_json',
        'created_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
      updateColumns: ['feature_hash', 'metadata_json', 'snapshot_ts_ms'],
    });
  }

  listFeatureSnapshots(params?: {
    datasetVersionId?: string;
    featureVersion?: string;
    limit?: number;
  }): FeatureSnapshotRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.datasetVersionId) {
      values.push(params.datasetVersionId);
      where.push(`dataset_version_id = $${values.length}`);
    }
    if (params?.featureVersion) {
      values.push(params.featureVersion);
      where.push(`feature_version = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<FeatureSnapshotRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('feature_snapshots')}
        ${whereSql}
        ORDER BY snapshot_ts_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertExecutionProfile(input: ExecutionProfileRecord): void {
    upsertRowsSync({
      table: 'execution_profiles',
      columns: [
        'id',
        'profile_name',
        'spread_model_json',
        'slippage_model_json',
        'fee_model_json',
        'fill_policy_json',
        'latency_assumption_json',
        'version',
        'created_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
      updateColumns: [
        'spread_model_json',
        'slippage_model_json',
        'fee_model_json',
        'fill_policy_json',
        'latency_assumption_json',
        'version',
      ],
    });
  }

  getExecutionProfile(id: string): ExecutionProfileRecord | null {
    return (
      queryRowSync<ExecutionProfileRecord>(
        `SELECT * FROM ${qualifyBusinessTable('execution_profiles')} WHERE id = $1 LIMIT 1`,
        [id],
      ) || null
    );
  }

  listExecutionProfiles(limit = 20): ExecutionProfileRecord[] {
    return queryRowsSync<ExecutionProfileRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('execution_profiles')}
        ORDER BY created_at_ms DESC
        LIMIT $1
      `,
      [limit],
    );
  }

  createBacktestRun(input: BacktestRunRecord): void {
    insertRowsSync({
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
      rows: [input],
    });
  }

  updateBacktestRunStatus(args: {
    id: string;
    status: BacktestRunRecord['status'];
    completedAtMs?: number | null;
    notes?: string | null;
  }): void {
    executeSync(
      `
        UPDATE ${qualifyBusinessTable('backtest_runs')}
        SET status = $2,
            completed_at_ms = COALESCE($3, completed_at_ms),
            notes = COALESCE($4, notes)
        WHERE id = $1
      `,
      [args.id, args.status, args.completedAtMs ?? null, args.notes ?? null],
    );
  }

  listBacktestRuns(params?: {
    runType?: string;
    status?: string;
    strategyVersionId?: string;
    limit?: number;
  }): BacktestRunRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.runType) {
      values.push(params.runType);
      where.push(`run_type = $${values.length}`);
    }
    if (params?.status) {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }
    if (params?.strategyVersionId) {
      values.push(params.strategyVersionId);
      where.push(`strategy_version_id = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 100));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<BacktestRunRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('backtest_runs')}
        ${whereSql}
        ORDER BY started_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  getBacktestRun(id: string): BacktestRunRecord | null {
    return (
      queryRowSync<BacktestRunRecord>(
        `SELECT * FROM ${qualifyBusinessTable('backtest_runs')} WHERE id = $1 LIMIT 1`,
        [id],
      ) || null
    );
  }

  upsertSignalSnapshots(rows: SignalSnapshotRecord[]): void {
    if (!rows.length) return;
    upsertRowsSync({
      table: 'signal_snapshots',
      columns: [
        'id',
        'signal_id',
        'strategy_version_id',
        'dataset_version_id',
        'backtest_run_id',
        'snapshot_ts_ms',
        'symbol',
        'market',
        'asset_class',
        'timeframe',
        'direction',
        'conviction',
        'regime_context_json',
        'entry_logic_json',
        'invalidation_logic_json',
        'source_transparency_json',
        'evidence_status',
        'created_at_ms',
      ],
      rows,
      conflictColumns: ['id'],
      updateColumns: [
        'signal_id',
        'strategy_version_id',
        'dataset_version_id',
        'backtest_run_id',
        'snapshot_ts_ms',
        'symbol',
        'market',
        'asset_class',
        'timeframe',
        'direction',
        'conviction',
        'regime_context_json',
        'entry_logic_json',
        'invalidation_logic_json',
        'source_transparency_json',
        'evidence_status',
      ],
    });
  }

  listSignalSnapshots(params?: {
    signalId?: string;
    runId?: string;
    symbol?: string;
    market?: Market;
    evidenceStatus?: EvidenceStatus;
    limit?: number;
  }): SignalSnapshotRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.signalId) {
      values.push(params.signalId);
      where.push(`signal_id = $${values.length}`);
    }
    if (params?.runId) {
      values.push(params.runId);
      where.push(`backtest_run_id = $${values.length}`);
    }
    if (params?.symbol) {
      values.push(params.symbol.toUpperCase());
      where.push(`symbol = $${values.length}`);
    }
    if (params?.market) {
      values.push(params.market);
      where.push(`market = $${values.length}`);
    }
    if (params?.evidenceStatus) {
      values.push(params.evidenceStatus);
      where.push(`evidence_status = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 120));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<SignalSnapshotRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('signal_snapshots')}
        ${whereSql}
        ORDER BY snapshot_ts_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertBacktestMetric(input: BacktestMetricRecord): void {
    executeSync(
      `
        INSERT INTO ${qualifyBusinessTable('backtest_metrics')}(
          backtest_run_id, gross_return, net_return, sharpe, sortino, max_drawdown, turnover, win_rate, hit_rate,
          cost_drag, sample_size, withheld_reason, realism_grade, robustness_grade, status, created_at_ms, updated_at_ms
        ) VALUES(
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17
        )
      `,
      [
        input.backtest_run_id,
        input.gross_return,
        input.net_return,
        input.sharpe,
        input.sortino,
        input.max_drawdown,
        input.turnover,
        input.win_rate,
        input.hit_rate,
        input.cost_drag,
        input.sample_size,
        input.withheld_reason,
        input.realism_grade,
        input.robustness_grade,
        input.status,
        input.created_at_ms,
        input.updated_at_ms,
      ],
    );
  }

  getBacktestMetric(backtestRunId: string): BacktestMetricRecord | null {
    return (
      queryRowSync<BacktestMetricRecord>(
        `
          SELECT *
          FROM ${qualifyBusinessTable('backtest_metrics')}
          WHERE backtest_run_id = $1
          ORDER BY updated_at_ms DESC
          LIMIT 1
        `,
        [backtestRunId],
      ) || null
    );
  }

  insertBacktestArtifacts(rows: BacktestArtifactRecord[]): void {
    if (!rows.length) return;
    insertRowsSync({
      table: 'backtest_artifacts',
      columns: ['backtest_run_id', 'artifact_type', 'path_or_payload', 'created_at_ms'],
      rows,
    });
  }

  listBacktestArtifacts(backtestRunId: string): BacktestArtifactRecord[] {
    return queryRowsSync<BacktestArtifactRecord>(
      `
        SELECT id, backtest_run_id, artifact_type, path_or_payload, created_at_ms
        FROM ${qualifyBusinessTable('backtest_artifacts')}
        WHERE backtest_run_id = $1
        ORDER BY created_at_ms DESC
      `,
      [backtestRunId],
    );
  }

  upsertReconciliationRows(rows: ReplayPaperReconciliationRecord[]): void {
    if (!rows.length) return;
    upsertRowsSync({
      table: 'replay_paper_reconciliation',
      columns: [
        'id',
        'signal_snapshot_id',
        'trade_group_id',
        'replay_run_id',
        'paper_execution_group_id',
        'expected_fill_price',
        'paper_fill_price',
        'expected_pnl',
        'paper_pnl',
        'expected_hold_period',
        'actual_hold_period',
        'slippage_gap',
        'attribution_json',
        'status',
        'created_at_ms',
      ],
      rows,
      conflictColumns: ['id'],
      updateColumns: [
        'paper_execution_group_id',
        'expected_fill_price',
        'paper_fill_price',
        'expected_pnl',
        'paper_pnl',
        'expected_hold_period',
        'actual_hold_period',
        'slippage_gap',
        'attribution_json',
        'status',
      ],
    });
  }

  listReconciliationRows(params?: {
    replayRunId?: string;
    status?: ReplayPaperReconciliationRecord['status'];
    symbol?: string;
    strategyVersionId?: string;
    limit?: number;
  }): Array<
    ReplayPaperReconciliationRecord & {
      symbol: string | null;
      strategy_version_id: string | null;
      regime_id: string | null;
    }
  > {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.replayRunId) {
      values.push(params.replayRunId);
      where.push(`r.replay_run_id = $${values.length}`);
    }
    if (params?.status) {
      values.push(params.status);
      where.push(`r.status = $${values.length}`);
    }
    if (params?.symbol) {
      values.push(params.symbol.toUpperCase());
      where.push(`ss.symbol = $${values.length}`);
    }
    if (params?.strategyVersionId) {
      values.push(params.strategyVersionId);
      where.push(`ss.strategy_version_id = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 200));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryRowsSync<
      ReplayPaperReconciliationRecord & {
        symbol: string | null;
        strategy_version_id: string | null;
        regime_id: string | null;
      }
    >(
      `
        SELECT
          r.id, r.signal_snapshot_id, r.trade_group_id, r.replay_run_id, r.paper_execution_group_id,
          r.expected_fill_price, r.paper_fill_price, r.expected_pnl, r.paper_pnl, r.expected_hold_period, r.actual_hold_period,
          r.slippage_gap, r.attribution_json, r.status, r.created_at_ms,
          ss.symbol AS symbol, ss.strategy_version_id AS strategy_version_id,
          ss.regime_context_json ->> 'regime_id' AS regime_id
        FROM ${qualifyBusinessTable('replay_paper_reconciliation')} r
        JOIN ${qualifyBusinessTable('signal_snapshots')} ss ON ss.id = r.signal_snapshot_id
        ${whereSql}
        ORDER BY r.created_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertExperimentRecord(input: ExperimentRegistryRecord): void {
    upsertRowsSync({
      table: 'experiment_registry',
      columns: [
        'id',
        'backtest_run_id',
        'strategy_version_id',
        'decision_status',
        'promotion_reason',
        'demotion_reason',
        'approved_at_ms',
        'created_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
    });
  }

  listExperimentRecords(limit = 100): ExperimentRegistryRecord[] {
    return queryRowsSync<ExperimentRegistryRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('experiment_registry')}
        ORDER BY created_at_ms DESC
        LIMIT $1
      `,
      [limit],
    );
  }

  upsertModelVersion(input: ModelVersionRecord): void {
    upsertRowsSync({
      table: 'model_versions',
      columns: [
        'id',
        'model_key',
        'provider',
        'endpoint',
        'task_scope',
        'semantic_version',
        'status',
        'config_json',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
    });
  }

  listModelVersions(params?: {
    modelKey?: string;
    status?: string;
    limit?: number;
  }): ModelVersionRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.modelKey) {
      values.push(params.modelKey);
      where.push(`model_key = $${values.length}`);
    }
    if (params?.status) {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')} ` : '';
    return queryRowsSync<ModelVersionRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('model_versions')}
        ${whereSql}
        ORDER BY updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertPromptVersion(input: PromptVersionRecord): void {
    upsertRowsSync({
      table: 'prompt_versions',
      columns: [
        'id',
        'task_key',
        'semantic_version',
        'prompt_hash',
        'prompt_text',
        'status',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
    });
  }

  listPromptVersions(params?: {
    taskKey?: string;
    status?: string;
    limit?: number;
  }): PromptVersionRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.taskKey) {
      values.push(params.taskKey);
      where.push(`task_key = $${values.length}`);
    }
    if (params?.status) {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')} ` : '';
    return queryRowsSync<PromptVersionRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('prompt_versions')}
        ${whereSql}
        ORDER BY updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertEvalRecord(input: EvalRegistryRecord): void {
    upsertRowsSync({
      table: 'eval_registry',
      columns: [
        'id',
        'eval_type',
        'subject_type',
        'subject_id',
        'subject_version',
        'score_json',
        'notes',
        'created_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
      updateColumns: [
        'eval_type',
        'subject_type',
        'subject_id',
        'subject_version',
        'score_json',
        'notes',
      ],
    });
  }

  listEvalRecords(params?: {
    subjectType?: string;
    evalType?: string;
    limit?: number;
  }): EvalRegistryRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.subjectType) {
      values.push(params.subjectType);
      where.push(`subject_type = $${values.length}`);
    }
    if (params?.evalType) {
      values.push(params.evalType);
      where.push(`eval_type = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')} ` : '';
    return queryRowsSync<EvalRegistryRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('eval_registry')}
        ${whereSql}
        ORDER BY created_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertRecommendationReview(input: RecommendationReviewRecord): void {
    upsertRowsSync({
      table: 'recommendation_reviews',
      columns: [
        'id',
        'decision_snapshot_id',
        'action_id',
        'review_type',
        'score',
        'notes',
        'payload_json',
        'created_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
      updateColumns: [
        'decision_snapshot_id',
        'action_id',
        'review_type',
        'score',
        'notes',
        'payload_json',
      ],
    });
  }

  listRecommendationReviews(params?: {
    decisionSnapshotId?: string;
    reviewType?: string;
    limit?: number;
  }): RecommendationReviewRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.decisionSnapshotId) {
      values.push(params.decisionSnapshotId);
      where.push(`decision_snapshot_id = $${values.length}`);
    }
    if (params?.reviewType) {
      values.push(params.reviewType);
      where.push(`review_type = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 40));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')} ` : '';
    return queryRowsSync<RecommendationReviewRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('recommendation_reviews')}
        ${whereSql}
        ORDER BY created_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertOutcomeReview(input: OutcomeReviewRecord): void {
    upsertRowsSync({
      table: 'outcome_reviews',
      columns: [
        'id',
        'user_id',
        'market',
        'asset_class',
        'decision_snapshot_id',
        'action_id',
        'review_kind',
        'score',
        'verdict',
        'summary',
        'payload_json',
        'created_at_ms',
        'updated_at_ms',
      ],
      rows: [input],
      conflictColumns: ['id'],
      updateColumns: ['score', 'verdict', 'summary', 'payload_json', 'updated_at_ms'],
    });
  }

  listOutcomeReviews(params?: {
    decisionSnapshotId?: string;
    reviewKind?: string;
    userId?: string;
    limit?: number;
  }): OutcomeReviewRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.decisionSnapshotId) {
      values.push(params.decisionSnapshotId);
      where.push(`decision_snapshot_id = $${values.length}`);
    }
    if (params?.reviewKind) {
      values.push(params.reviewKind);
      where.push(`review_kind = $${values.length}`);
    }
    if (params?.userId) {
      values.push(params.userId);
      where.push(`user_id = $${values.length}`);
    }
    values.push(limitValue(params?.limit, 60));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')} ` : '';
    return queryRowsSync<OutcomeReviewRecord>(
      `
        SELECT *
        FROM ${qualifyBusinessTable('outcome_reviews')}
        ${whereSql}
        ORDER BY updated_at_ms DESC
        LIMIT $${values.length}
      `,
      values,
    );
  }

  upsertNovaReviewLabel(input: NovaReviewLabelRecord): void {
    executeSync(
      `
        INSERT INTO ${qualifyBusinessTable('nova_review_labels')}(
          id, run_id, reviewer_id, label, score, notes, include_in_training, created_at_ms, updated_at_ms
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT(id) DO UPDATE SET
          run_id = EXCLUDED.run_id,
          reviewer_id = EXCLUDED.reviewer_id,
          label = EXCLUDED.label,
          score = EXCLUDED.score,
          notes = EXCLUDED.notes,
          include_in_training = EXCLUDED.include_in_training,
          updated_at_ms = EXCLUDED.updated_at_ms
      `,
      [
        input.id,
        input.run_id,
        input.reviewer_id,
        input.label,
        input.score,
        input.notes,
        input.include_in_training,
        input.created_at_ms,
        input.updated_at_ms,
      ],
    );
  }

  listNovaReviewLabels(params?: {
    runId?: string;
    includeInTraining?: boolean;
    limit?: number;
  }): NovaReviewLabelRecord[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (params?.runId) {
      values.push(params.runId);
      where.push(`run_id = $${values.length}`);
    }
    if (typeof params?.includeInTraining === 'boolean') {
      values.push(params.includeInTraining ? 1 : 0);
      where.push(`include_in_training = $${values.length}`);
    }
    if (params?.limit) {
      values.push(params.limit);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? `LIMIT $${values.length}` : '';
    return queryRowsSync<NovaReviewLabelRecord>(
      `
        SELECT
          id, run_id, reviewer_id, label, score, notes, include_in_training, created_at_ms, updated_at_ms
        FROM ${qualifyBusinessTable('nova_review_labels')}
        ${whereSql}
        ORDER BY updated_at_ms DESC
        ${limitSql}
      `,
      values,
    );
  }
}

import type Database from 'better-sqlite3';
import type {
  Asset,
  AssetClass,
  AssetInput,
  BacktestArtifactRecord,
  BacktestMetricRecord,
  BacktestRunRecord,
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
  Market,
  MarketStateRecord,
  ModelVersionRecord,
  NotificationEventRecord,
  NotificationPreferenceRecord,
  OutcomeReviewRecord,
  NovaReviewLabelRecord,
  NovaTaskRunRecord,
  ActionSnapshotRecord,
  ComplianceLogRecord,
  DecisionIntelligenceDatasetRecord,
  NormalizedBar,
  PerformanceSnapshotRecord,
  PromptVersionRecord,
  RecommendationReviewRecord,
  ReplayPaperReconciliationRecord,
  SandboxRunRecord,
  SignalContract,
  SignalRecord,
  SignalSnapshotRecord,
  SignalStatus,
  StrategyVersionRecord,
  Timeframe,
  ExternalSurfaceRecord,
  EvidenceSnapshotRecord,
  MarketStateSnapshotRecord,
  UserResponseEventRecord,
  UserStateSnapshotRecord,
  UniverseSnapshotRecord,
  WorkflowRunRecord,
  AuditEventRecord,
  UserRitualEventRecord,
  UserRiskProfileRecord
} from '../types.js';

function nowMs(): number {
  return Date.now();
}

export class MarketRepository {
  constructor(private readonly db: Database.Database) {}

  upsertAsset(input: AssetInput): Asset {
    const ts = nowMs();
    const stmt = this.db.prepare(`
      INSERT INTO assets(symbol, market, venue, base, quote, status, created_at, updated_at)
      VALUES(@symbol, @market, @venue, @base, @quote, @status, @created_at, @updated_at)
      ON CONFLICT(symbol, market, venue) DO UPDATE SET
        base = excluded.base,
        quote = excluded.quote,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);

    stmt.run({
      symbol: input.symbol,
      market: input.market,
      venue: input.venue,
      base: input.base ?? null,
      quote: input.quote ?? null,
      status: input.status ?? 'ACTIVE',
      created_at: ts,
      updated_at: ts
    });

    const row = this.db
      .prepare(
        'SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at FROM assets WHERE symbol=? AND market=? AND venue=?'
      )
      .get(input.symbol, input.market, input.venue) as Asset | undefined;

    if (!row) throw new Error(`Failed to upsert asset ${input.symbol} (${input.market})`);
    return row;
  }

  getAssetBySymbol(market: string, symbol: string): Asset | null {
    const row = this.db
      .prepare(
        `SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at
         FROM assets WHERE market=? AND symbol=? AND status='ACTIVE' ORDER BY updated_at DESC LIMIT 1`
      )
      .get(market, symbol) as Asset | undefined;
    return row ?? null;
  }

  listAssets(market?: string): Asset[] {
    if (market) {
      return this.db
        .prepare(
          'SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at FROM assets WHERE market=? ORDER BY symbol'
        )
        .all(market) as Asset[];
    }

    return this.db
      .prepare('SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at FROM assets ORDER BY market, symbol')
      .all() as Asset[];
  }

  upsertOhlcvBars(
    assetId: number,
    timeframe: Timeframe,
    bars: NormalizedBar[],
    source: string
  ): number {
    if (!bars.length) return 0;

    const ingestAt = nowMs();
    const stmt = this.db.prepare(`
      INSERT INTO ohlcv(asset_id, timeframe, ts_open, open, high, low, close, volume, source, ingest_at)
      VALUES(@asset_id, @timeframe, @ts_open, @open, @high, @low, @close, @volume, @source, @ingest_at)
      ON CONFLICT(asset_id, timeframe, ts_open) DO UPDATE SET
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume,
        source = excluded.source,
        ingest_at = excluded.ingest_at
    `);

    const tx = this.db.transaction((records: NormalizedBar[]) => {
      for (const bar of records) {
        stmt.run({
          asset_id: assetId,
          timeframe,
          ts_open: bar.ts_open,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          source,
          ingest_at: ingestAt
        });
      }
    });

    tx(bars);
    return bars.length;
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
    const where: string[] = ['asset_id = @asset_id', 'timeframe = @timeframe'];
    if (params.start !== undefined) where.push('ts_open >= @start');
    if (params.end !== undefined) where.push('ts_open <= @end');
    const limitSql = params.limit ? 'LIMIT @limit' : '';

    const sql = `
      SELECT ts_open, open, high, low, close, volume, source
      FROM ohlcv
      WHERE ${where.join(' AND ')}
      ORDER BY ts_open ASC
      ${limitSql}
    `;

    return this.db.prepare(sql).all({
      asset_id: params.assetId,
      timeframe: params.timeframe,
      start: params.start,
      end: params.end,
      limit: params.limit
    }) as Array<{
      ts_open: number;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
      source: string;
    }>;
  }

  getLatestTsOpen(assetId: number, timeframe: Timeframe): number | null {
    const row = this.db
      .prepare('SELECT ts_open FROM ohlcv WHERE asset_id=? AND timeframe=? ORDER BY ts_open DESC LIMIT 1')
      .get(assetId, timeframe) as { ts_open: number } | undefined;
    return row?.ts_open ?? null;
  }

  getOhlcvStats(assetId: number, timeframe: Timeframe): {
    bar_count: number;
    first_ts_open: number | null;
    last_ts_open: number | null;
  } {
    const row = this.db
      .prepare(
        `
          SELECT COUNT(*) AS bar_count, MIN(ts_open) AS first_ts_open, MAX(ts_open) AS last_ts_open
          FROM ohlcv
          WHERE asset_id = ? AND timeframe = ?
        `
      )
      .get(assetId, timeframe) as { bar_count: number; first_ts_open: number | null; last_ts_open: number | null } | undefined;
    return {
      bar_count: Number(row?.bar_count || 0),
      first_ts_open: row?.first_ts_open ?? null,
      last_ts_open: row?.last_ts_open ?? null
    };
  }

  getCursor(assetId: number, timeframe: Timeframe): number | null {
    const row = this.db
      .prepare('SELECT last_ts_open FROM ingest_cursors WHERE asset_id=? AND timeframe=?')
      .get(assetId, timeframe) as { last_ts_open: number } | undefined;
    return row?.last_ts_open ?? null;
  }

  setCursor(assetId: number, timeframe: Timeframe, lastTsOpen: number, source: string): void {
    this.db
      .prepare(
        `
          INSERT INTO ingest_cursors(asset_id, timeframe, last_ts_open, source, updated_at)
          VALUES(@asset_id, @timeframe, @last_ts_open, @source, @updated_at)
          ON CONFLICT(asset_id, timeframe) DO UPDATE SET
            last_ts_open = excluded.last_ts_open,
            source = excluded.source,
            updated_at = excluded.updated_at
        `
      )
      .run({
        asset_id: assetId,
        timeframe,
        last_ts_open: lastTsOpen,
        source,
        updated_at: nowMs()
      });
  }

  listAssetIdsByMarket(market?: string): Array<{ asset_id: number; symbol: string; market: string; venue: string }> {
    if (market) {
      return this.db
        .prepare('SELECT asset_id, symbol, market, venue FROM assets WHERE market = ? ORDER BY symbol')
        .all(market) as Array<{ asset_id: number; symbol: string; market: string; venue: string }>;
    }

    return this.db
      .prepare('SELECT asset_id, symbol, market, venue FROM assets ORDER BY market, symbol')
      .all() as Array<{ asset_id: number; symbol: string; market: string; venue: string }>;
  }

  listBarsRange(assetId: number, timeframe: Timeframe, start: number, end: number): number[] {
    const rows = this.db
      .prepare(
        'SELECT ts_open FROM ohlcv WHERE asset_id=? AND timeframe=? AND ts_open>=? AND ts_open<=? ORDER BY ts_open ASC'
      )
      .all(assetId, timeframe, start, end) as Array<{ ts_open: number }>;
    return rows.map((row) => row.ts_open);
  }

  logAnomaly(args: {
    assetId?: number | null;
    timeframe: Timeframe;
    tsOpen?: number | null;
    anomalyType: string;
    detail: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO ingest_anomalies(asset_id, timeframe, ts_open, anomaly_type, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(args.assetId ?? null, args.timeframe, args.tsOpen ?? null, args.anomalyType, args.detail, nowMs());
  }

  upsertSignal(signal: SignalContract): void {
    const tp1 = signal.take_profit_levels?.[0];
    const tp2 = signal.take_profit_levels?.[1];
    const payload = JSON.stringify(signal);
    const updatedAt = nowMs();
    const stmt = this.db.prepare(`
      INSERT INTO signals(
        signal_id, created_at_ms, expires_at_ms, asset_class, market, symbol, timeframe, strategy_id, strategy_family, strategy_version,
        regime_id, temperature_percentile, volatility_percentile, direction, strength, confidence,
        entry_low, entry_high, entry_method, invalidation_level,
        stop_type, stop_price, tp1_price, tp1_size_pct, tp2_price, tp2_size_pct,
        trailing_type, trailing_params_json,
        position_pct, leverage_cap, risk_bucket_applied,
        fee_bps, spread_bps, slippage_bps, funding_est_bps, basis_est,
        expected_r, hit_rate_est, sample_size, expected_max_dd_est,
        status, score, payload_json, updated_at_ms
      ) VALUES (
        @signal_id, @created_at_ms, @expires_at_ms, @asset_class, @market, @symbol, @timeframe, @strategy_id, @strategy_family, @strategy_version,
        @regime_id, @temperature_percentile, @volatility_percentile, @direction, @strength, @confidence,
        @entry_low, @entry_high, @entry_method, @invalidation_level,
        @stop_type, @stop_price, @tp1_price, @tp1_size_pct, @tp2_price, @tp2_size_pct,
        @trailing_type, @trailing_params_json,
        @position_pct, @leverage_cap, @risk_bucket_applied,
        @fee_bps, @spread_bps, @slippage_bps, @funding_est_bps, @basis_est,
        @expected_r, @hit_rate_est, @sample_size, @expected_max_dd_est,
        @status, @score, @payload_json, @updated_at_ms
      )
      ON CONFLICT(signal_id) DO UPDATE SET
        created_at_ms = excluded.created_at_ms,
        expires_at_ms = excluded.expires_at_ms,
        asset_class = excluded.asset_class,
        market = excluded.market,
        symbol = excluded.symbol,
        timeframe = excluded.timeframe,
        strategy_id = excluded.strategy_id,
        strategy_family = excluded.strategy_family,
        strategy_version = excluded.strategy_version,
        regime_id = excluded.regime_id,
        temperature_percentile = excluded.temperature_percentile,
        volatility_percentile = excluded.volatility_percentile,
        direction = excluded.direction,
        strength = excluded.strength,
        confidence = excluded.confidence,
        entry_low = excluded.entry_low,
        entry_high = excluded.entry_high,
        entry_method = excluded.entry_method,
        invalidation_level = excluded.invalidation_level,
        stop_type = excluded.stop_type,
        stop_price = excluded.stop_price,
        tp1_price = excluded.tp1_price,
        tp1_size_pct = excluded.tp1_size_pct,
        tp2_price = excluded.tp2_price,
        tp2_size_pct = excluded.tp2_size_pct,
        trailing_type = excluded.trailing_type,
        trailing_params_json = excluded.trailing_params_json,
        position_pct = excluded.position_pct,
        leverage_cap = excluded.leverage_cap,
        risk_bucket_applied = excluded.risk_bucket_applied,
        fee_bps = excluded.fee_bps,
        spread_bps = excluded.spread_bps,
        slippage_bps = excluded.slippage_bps,
        funding_est_bps = excluded.funding_est_bps,
        basis_est = excluded.basis_est,
        expected_r = excluded.expected_r,
        hit_rate_est = excluded.hit_rate_est,
        sample_size = excluded.sample_size,
        expected_max_dd_est = excluded.expected_max_dd_est,
        status = excluded.status,
        score = excluded.score,
        payload_json = excluded.payload_json,
        updated_at_ms = excluded.updated_at_ms
    `);

    stmt.run({
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
      payload_json: payload,
      updated_at_ms: updatedAt
    });
  }

  upsertSignals(signals: SignalContract[]): void {
    const tx = this.db.transaction((rows: SignalContract[]) => {
      for (const signal of rows) this.upsertSignal(signal);
    });
    tx(signals);
  }

  expireSignalsNotIn(activeSignalIds: string[]): number {
    const ts = nowMs();
    if (!activeSignalIds.length) {
      const result = this.db
        .prepare(
          `UPDATE signals
           SET status='EXPIRED', updated_at_ms=?
           WHERE status IN ('NEW', 'TRIGGERED')`
        )
        .run(ts);
      return Number(result.changes || 0);
    }

    const placeholders = activeSignalIds.map(() => '?').join(', ');
    const sql = `
      UPDATE signals
      SET status='EXPIRED', updated_at_ms=?
      WHERE status IN ('NEW', 'TRIGGERED')
        AND signal_id NOT IN (${placeholders})
    `;
    const result = this.db.prepare(sql).run(ts, ...activeSignalIds);
    return Number(result.changes || 0);
  }

  listSignals(params?: {
    assetClass?: AssetClass;
    market?: Market;
    symbol?: string;
    status?: SignalStatus | 'ALL';
    limit?: number;
  }): SignalRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.symbol) {
      where.push('symbol = @symbol');
      q.symbol = params.symbol.toUpperCase();
    }
    if (params?.status && params.status !== 'ALL') {
      where.push('status = @status');
      q.status = params.status;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    if (params?.limit) q.limit = params.limit;

    const sql = `
      SELECT * FROM signals
      ${whereSql}
      ORDER BY score DESC, created_at_ms DESC
      ${limitSql}
    `;
    return this.db.prepare(sql).all(q) as SignalRecord[];
  }

  getSignal(signalId: string): SignalRecord | null {
    const row = this.db.prepare('SELECT * FROM signals WHERE signal_id = ? LIMIT 1').get(signalId) as
      | SignalRecord
      | undefined;
    return row ?? null;
  }

  appendSignalEvent(signalId: string, eventType: string, payload?: Record<string, unknown>): void {
    this.db
      .prepare(
        `INSERT INTO signal_events(signal_id, event_type, payload_json, created_at_ms)
         VALUES (?, ?, ?, ?)`
      )
      .run(signalId, eventType, payload ? JSON.stringify(payload) : null, nowMs());
  }

  listSignalEvents(signalId: string, limit = 40): Array<{ id: number; signal_id: string; event_type: string; payload_json: string | null; created_at_ms: number }> {
    return this.db
      .prepare(
        `SELECT id, signal_id, event_type, payload_json, created_at_ms
         FROM signal_events
         WHERE signal_id = ?
         ORDER BY created_at_ms DESC
         LIMIT ?`
      )
      .all(signalId, limit) as Array<{ id: number; signal_id: string; event_type: string; payload_json: string | null; created_at_ms: number }>;
  }

  upsertExecution(input: Omit<ExecutionRecord, 'updated_at_ms'> & { updated_at_ms?: number }): void {
    const ts = input.updated_at_ms ?? nowMs();
    this.db
      .prepare(
        `
          INSERT INTO executions(
            execution_id, signal_id, user_id, mode, action, market, symbol,
            entry_price, stop_price, tp_price, size_pct, pnl_pct, note,
            created_at_ms, updated_at_ms
          ) VALUES(
            @execution_id, @signal_id, @user_id, @mode, @action, @market, @symbol,
            @entry_price, @stop_price, @tp_price, @size_pct, @pnl_pct, @note,
            @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(execution_id) DO UPDATE SET
            signal_id = excluded.signal_id,
            user_id = excluded.user_id,
            mode = excluded.mode,
            action = excluded.action,
            market = excluded.market,
            symbol = excluded.symbol,
            entry_price = excluded.entry_price,
            stop_price = excluded.stop_price,
            tp_price = excluded.tp_price,
            size_pct = excluded.size_pct,
            pnl_pct = excluded.pnl_pct,
            note = excluded.note,
            created_at_ms = excluded.created_at_ms,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run({
        execution_id: input.execution_id,
        signal_id: input.signal_id,
        user_id: input.user_id,
        mode: input.mode,
        action: input.action,
        market: input.market,
        symbol: input.symbol,
        entry_price: input.entry_price ?? null,
        stop_price: input.stop_price ?? null,
        tp_price: input.tp_price ?? null,
        size_pct: input.size_pct ?? null,
        pnl_pct: input.pnl_pct ?? null,
        note: input.note ?? null,
        created_at_ms: input.created_at_ms,
        updated_at_ms: ts
      });
  }

  listExecutions(params?: {
    userId?: string;
    market?: Market;
    mode?: 'PAPER' | 'LIVE';
    signalId?: string;
    limit?: number;
  }): ExecutionRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.userId) {
      where.push('user_id = @user_id');
      q.user_id = params.userId;
    }
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.mode) {
      where.push('mode = @mode');
      q.mode = params.mode;
    }
    if (params?.signalId) {
      where.push('signal_id = @signal_id');
      q.signal_id = params.signalId;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    if (params?.limit) q.limit = params.limit;

    const rows = this.db
      .prepare(
        `
        SELECT
          execution_id, signal_id, user_id, mode, action, market, symbol,
          entry_price, stop_price, tp_price, size_pct, pnl_pct, note,
          created_at_ms, updated_at_ms
        FROM executions
        ${whereSql}
        ORDER BY created_at_ms DESC
        ${limitSql}
      `
      )
      .all(q) as Array<{
      execution_id: string;
      signal_id: string;
      user_id: string;
      mode: 'PAPER' | 'LIVE';
      action: 'EXECUTE' | 'DONE' | 'CLOSE';
      market: Market;
      symbol: string;
      entry_price: number | null;
      stop_price: number | null;
      tp_price: number | null;
      size_pct: number | null;
      pnl_pct: number | null;
      note: string | null;
      created_at_ms: number;
      updated_at_ms: number;
    }>;

    return rows.map((row) => ({
      ...row,
      entry_price: row.entry_price ?? undefined,
      stop_price: row.stop_price ?? undefined,
      tp_price: row.tp_price ?? undefined,
      size_pct: row.size_pct ?? undefined,
      pnl_pct: row.pnl_pct ?? undefined,
      note: row.note ?? undefined
    }));
  }

  upsertUserRiskProfile(profile: UserRiskProfileRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO user_risk_profiles(
            user_id, profile_key, max_loss_per_trade, max_daily_loss, max_drawdown, exposure_cap, leverage_cap, updated_at_ms
          ) VALUES(
            @user_id, @profile_key, @max_loss_per_trade, @max_daily_loss, @max_drawdown, @exposure_cap, @leverage_cap, @updated_at_ms
          )
          ON CONFLICT(user_id) DO UPDATE SET
            profile_key = excluded.profile_key,
            max_loss_per_trade = excluded.max_loss_per_trade,
            max_daily_loss = excluded.max_daily_loss,
            max_drawdown = excluded.max_drawdown,
            exposure_cap = excluded.exposure_cap,
            leverage_cap = excluded.leverage_cap,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(profile);
  }

  getUserRiskProfile(userId: string): UserRiskProfileRecord | null {
    const row = this.db
      .prepare(
        `SELECT user_id, profile_key, max_loss_per_trade, max_daily_loss, max_drawdown, exposure_cap, leverage_cap, updated_at_ms
         FROM user_risk_profiles WHERE user_id = ? LIMIT 1`
      )
      .get(userId) as UserRiskProfileRecord | undefined;
    return row ?? null;
  }

  upsertMarketState(record: MarketStateRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO market_state(
            market, symbol, timeframe, snapshot_ts_ms, regime_id, trend_strength, temperature_percentile,
            volatility_percentile, risk_off_score, stance, event_stats_json, assumptions_json, updated_at_ms
          ) VALUES(
            @market, @symbol, @timeframe, @snapshot_ts_ms, @regime_id, @trend_strength, @temperature_percentile,
            @volatility_percentile, @risk_off_score, @stance, @event_stats_json, @assumptions_json, @updated_at_ms
          )
          ON CONFLICT(market, symbol, timeframe) DO UPDATE SET
            snapshot_ts_ms = excluded.snapshot_ts_ms,
            regime_id = excluded.regime_id,
            trend_strength = excluded.trend_strength,
            temperature_percentile = excluded.temperature_percentile,
            volatility_percentile = excluded.volatility_percentile,
            risk_off_score = excluded.risk_off_score,
            stance = excluded.stance,
            event_stats_json = excluded.event_stats_json,
            assumptions_json = excluded.assumptions_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(record);
  }

  upsertMarketStates(rows: MarketStateRecord[]): void {
    const tx = this.db.transaction((records: MarketStateRecord[]) => {
      for (const row of records) this.upsertMarketState(row);
    });
    tx(rows);
  }

  listMarketState(params?: { market?: Market; symbol?: string; timeframe?: string }): MarketStateRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.symbol) {
      where.push('symbol = @symbol');
      q.symbol = params.symbol.toUpperCase();
    }
    if (params?.timeframe) {
      where.push('timeframe = @timeframe');
      q.timeframe = params.timeframe;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db
      .prepare(
        `
      SELECT
        market, symbol, timeframe, snapshot_ts_ms, regime_id, trend_strength, temperature_percentile,
        volatility_percentile, risk_off_score, stance, event_stats_json, assumptions_json, updated_at_ms
      FROM market_state
      ${whereSql}
      ORDER BY temperature_percentile DESC, updated_at_ms DESC
    `
      )
      .all(q) as MarketStateRecord[];
  }

  upsertPerformanceSnapshot(record: PerformanceSnapshotRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO performance_snapshots(
            market, range, segment_type, segment_key, source_label, sample_size, payload_json, asof_ms, updated_at_ms
          ) VALUES(
            @market, @range, @segment_type, @segment_key, @source_label, @sample_size, @payload_json, @asof_ms, @updated_at_ms
          )
          ON CONFLICT(market, range, segment_type, segment_key) DO UPDATE SET
            source_label = excluded.source_label,
            sample_size = excluded.sample_size,
            payload_json = excluded.payload_json,
            asof_ms = excluded.asof_ms,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(record);
  }

  upsertPerformanceSnapshots(rows: PerformanceSnapshotRecord[]): void {
    const tx = this.db.transaction((records: PerformanceSnapshotRecord[]) => {
      for (const row of records) this.upsertPerformanceSnapshot(row);
    });
    tx(rows);
  }

  listPerformanceSnapshots(params?: { market?: Market; range?: string; segmentType?: string }): PerformanceSnapshotRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.range) {
      where.push('range = @range');
      q.range = params.range;
    }
    if (params?.segmentType) {
      where.push('segment_type = @segment_type');
      q.segment_type = params.segmentType;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db
      .prepare(
        `
      SELECT market, range, segment_type, segment_key, source_label, sample_size, payload_json, asof_ms, updated_at_ms
      FROM performance_snapshots
      ${whereSql}
      ORDER BY asof_ms DESC, sample_size DESC
    `
      )
      .all(q) as PerformanceSnapshotRecord[];
  }

  upsertApiKey(input: {
    key_id: string;
    key_hash: string;
    label: string;
    scope: string;
    status?: 'ACTIVE' | 'DISABLED';
  }): void {
    const ts = nowMs();
    this.db
      .prepare(
        `
        INSERT INTO api_keys(key_id, key_hash, label, scope, status, created_at_ms, updated_at_ms)
        VALUES(@key_id, @key_hash, @label, @scope, @status, @created_at_ms, @updated_at_ms)
        ON CONFLICT(key_id) DO UPDATE SET
          key_hash = excluded.key_hash,
          label = excluded.label,
          scope = excluded.scope,
          status = excluded.status,
          updated_at_ms = excluded.updated_at_ms
      `
      )
      .run({
        ...input,
        status: input.status ?? 'ACTIVE',
        created_at_ms: ts,
        updated_at_ms: ts
      });
  }

  getApiKeyByHash(keyHash: string): { key_id: string; key_hash: string; label: string; scope: string; status: string } | null {
    const row = this.db
      .prepare(
        `SELECT key_id, key_hash, label, scope, status
         FROM api_keys
         WHERE key_hash = ?
         LIMIT 1`
      )
      .get(keyHash) as { key_id: string; key_hash: string; label: string; scope: string; status: string } | undefined;
    return row ?? null;
  }

  logSignalDelivery(input: {
    signal_id: string;
    channel: string;
    endpoint?: string | null;
    event_type: string;
    status: 'SENT' | 'FAILED' | 'SKIPPED';
    detail?: string | null;
  }): void {
    this.db
      .prepare(
        `
          INSERT INTO signal_deliveries(signal_id, channel, endpoint, event_type, status, detail, created_at_ms)
          VALUES(@signal_id, @channel, @endpoint, @event_type, @status, @detail, @created_at_ms)
      `
      )
      .run({
        signal_id: input.signal_id,
        channel: input.channel,
        endpoint: input.endpoint ?? null,
        event_type: input.event_type,
        status: input.status,
        detail: input.detail ?? null,
        created_at_ms: nowMs()
      });
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
    this.db
      .prepare(
        `
          INSERT INTO external_connections(
            connection_id, user_id, connection_type, provider, mode, status, meta_json, created_at_ms, updated_at_ms
          ) VALUES(
            @connection_id, @user_id, @connection_type, @provider, @mode, @status, @meta_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(connection_id) DO UPDATE SET
            user_id = excluded.user_id,
            connection_type = excluded.connection_type,
            provider = excluded.provider,
            mode = excluded.mode,
            status = excluded.status,
            meta_json = excluded.meta_json,
            updated_at_ms = excluded.updated_at_ms
      `
      )
      .run({
        ...input,
        meta_json: input.meta_json ?? null,
        created_at_ms: ts,
        updated_at_ms: ts
      });
  }

  listExternalConnections(params: { userId: string; connectionType?: 'BROKER' | 'EXCHANGE' }): Array<{
    connection_id: string;
    user_id: string;
    connection_type: 'BROKER' | 'EXCHANGE';
    provider: string;
    mode: 'READ_ONLY' | 'TRADING';
    status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
    meta_json: string | null;
    updated_at_ms: number;
  }> {
    const where = ['user_id = @user_id'];
    const q: Record<string, unknown> = { user_id: params.userId };
    if (params.connectionType) {
      where.push('connection_type = @connection_type');
      q.connection_type = params.connectionType;
    }
    return this.db
      .prepare(
        `
          SELECT connection_id, user_id, connection_type, provider, mode, status, meta_json, updated_at_ms
          FROM external_connections
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at_ms DESC
      `
      )
      .all(q) as Array<{
      connection_id: string;
      user_id: string;
      connection_type: 'BROKER' | 'EXCHANGE';
      provider: string;
      mode: 'READ_ONLY' | 'TRADING';
      status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
      meta_json: string | null;
      updated_at_ms: number;
    }>;
  }

  upsertChatThread(input: ChatThreadRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO chat_threads(
            id, user_id, title, last_context_json, last_message_preview, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @title, @last_context_json, @last_message_preview, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            last_context_json = excluded.last_context_json,
            last_message_preview = excluded.last_message_preview,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  getChatThread(id: string, userId: string): ChatThreadRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT id, user_id, title, last_context_json, last_message_preview, created_at_ms, updated_at_ms
          FROM chat_threads
          WHERE id = ? AND user_id = ?
          LIMIT 1
        `
      )
      .get(id, userId) as ChatThreadRecord | undefined;
    return row ?? null;
  }

  listChatThreads(userId: string, limit = 20): ChatThreadRecord[] {
    return this.db
      .prepare(
        `
          SELECT id, user_id, title, last_context_json, last_message_preview, created_at_ms, updated_at_ms
          FROM chat_threads
          WHERE user_id = ?
          ORDER BY updated_at_ms DESC
          LIMIT ?
        `
      )
      .all(userId, limit) as ChatThreadRecord[];
  }

  appendChatMessage(input: ChatMessageRecord): number {
    const result = this.db
      .prepare(
        `
          INSERT INTO chat_messages(
            thread_id, user_id, role, content, context_json, provider, status, created_at_ms
          ) VALUES(
            @thread_id, @user_id, @role, @content, @context_json, @provider, @status, @created_at_ms
          )
        `
      )
      .run({
        ...input,
        context_json: input.context_json ?? null,
        provider: input.provider ?? null
      });
    return Number(result.lastInsertRowid);
  }

  listChatMessages(threadId: string, limit = 20): ChatMessageRecord[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, thread_id, user_id, role, content, context_json, provider, status, created_at_ms
          FROM chat_messages
          WHERE thread_id = ?
          ORDER BY created_at_ms DESC
          LIMIT ?
        `
      )
      .all(threadId, limit) as ChatMessageRecord[];
    return [...rows].reverse();
  }

  upsertStrategyVersion(input: StrategyVersionRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO strategy_versions(
            id, strategy_key, family, version, config_hash, config_json, status, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @strategy_key, @family, @version, @config_hash, @config_json, @status, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            strategy_key = excluded.strategy_key,
            family = excluded.family,
            version = excluded.version,
            config_hash = excluded.config_hash,
            config_json = excluded.config_json,
            status = excluded.status,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listStrategyVersions(params?: { strategyKey?: string; status?: string; limit?: number }): StrategyVersionRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.strategyKey) {
      where.push('strategy_key = @strategy_key');
      q.strategy_key = params.strategyKey;
    }
    if (params?.status) {
      where.push('status = @status');
      q.status = params.status;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, strategy_key, family, version, config_hash, config_json, status, created_at_ms, updated_at_ms
          FROM strategy_versions
          ${whereSql}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as StrategyVersionRecord[];
  }

  getStrategyVersion(id: string): StrategyVersionRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT id, strategy_key, family, version, config_hash, config_json, status, created_at_ms, updated_at_ms
          FROM strategy_versions
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(id) as StrategyVersionRecord | undefined;
    return row ?? null;
  }

  createDatasetVersion(input: DatasetVersionRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO dataset_versions(
            id, market, asset_class, timeframe, source_bundle_hash, coverage_summary_json, freshness_summary_json, notes, created_at_ms
          ) VALUES(
            @id, @market, @asset_class, @timeframe, @source_bundle_hash, @coverage_summary_json, @freshness_summary_json, @notes, @created_at_ms
          )
          ON CONFLICT(id) DO NOTHING
        `
      )
      .run(input);
  }

  findDatasetVersionByHash(params: {
    market: Market | 'ALL';
    assetClass: AssetClass | 'ALL';
    timeframe: string;
    sourceBundleHash: string;
  }): DatasetVersionRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT id, market, asset_class, timeframe, source_bundle_hash, coverage_summary_json, freshness_summary_json, notes, created_at_ms
          FROM dataset_versions
          WHERE market = ? AND asset_class = ? AND timeframe = ? AND source_bundle_hash = ?
          ORDER BY created_at_ms DESC
          LIMIT 1
        `
      )
      .get(params.market, params.assetClass, params.timeframe, params.sourceBundleHash) as DatasetVersionRecord | undefined;
    return row ?? null;
  }

  getDatasetVersion(id: string): DatasetVersionRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT id, market, asset_class, timeframe, source_bundle_hash, coverage_summary_json, freshness_summary_json, notes, created_at_ms
          FROM dataset_versions
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(id) as DatasetVersionRecord | undefined;
    return row ?? null;
  }

  listDatasetVersions(params?: {
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    timeframe?: string;
    limit?: number;
  }): DatasetVersionRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    if (params?.timeframe) {
      where.push('timeframe = @timeframe');
      q.timeframe = params.timeframe;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, market, asset_class, timeframe, source_bundle_hash, coverage_summary_json, freshness_summary_json, notes, created_at_ms
          FROM dataset_versions
          ${whereSql}
          ORDER BY created_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as DatasetVersionRecord[];
  }

  upsertUniverseSnapshot(input: UniverseSnapshotRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO universe_snapshots(
            id, dataset_version_id, snapshot_ts_ms, market, asset_class, members_json, created_at_ms
          ) VALUES(
            @id, @dataset_version_id, @snapshot_ts_ms, @market, @asset_class, @members_json, @created_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            members_json = excluded.members_json,
            snapshot_ts_ms = excluded.snapshot_ts_ms
        `
      )
      .run(input);
  }

  getUniverseSnapshot(id: string): UniverseSnapshotRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT id, dataset_version_id, snapshot_ts_ms, market, asset_class, members_json, created_at_ms
          FROM universe_snapshots WHERE id = ? LIMIT 1
        `
      )
      .get(id) as UniverseSnapshotRecord | undefined;
    return row ?? null;
  }

  listUniverseSnapshots(params?: {
    datasetVersionId?: string;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    limit?: number;
  }): UniverseSnapshotRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.datasetVersionId) {
      where.push('dataset_version_id = @dataset_version_id');
      q.dataset_version_id = params.datasetVersionId;
    }
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, dataset_version_id, snapshot_ts_ms, market, asset_class, members_json, created_at_ms
          FROM universe_snapshots
          ${whereSql}
          ORDER BY snapshot_ts_ms DESC
          ${limitSql}
        `
      )
      .all(q) as UniverseSnapshotRecord[];
  }

  upsertFeatureSnapshot(input: FeatureSnapshotRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO feature_snapshots(
            id, dataset_version_id, feature_version, snapshot_ts_ms, feature_hash, metadata_json, created_at_ms
          ) VALUES(
            @id, @dataset_version_id, @feature_version, @snapshot_ts_ms, @feature_hash, @metadata_json, @created_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            feature_hash = excluded.feature_hash,
            metadata_json = excluded.metadata_json,
            snapshot_ts_ms = excluded.snapshot_ts_ms
        `
      )
      .run(input);
  }

  listFeatureSnapshots(params?: {
    datasetVersionId?: string;
    featureVersion?: string;
    limit?: number;
  }): FeatureSnapshotRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.datasetVersionId) {
      where.push('dataset_version_id = @dataset_version_id');
      q.dataset_version_id = params.datasetVersionId;
    }
    if (params?.featureVersion) {
      where.push('feature_version = @feature_version');
      q.feature_version = params.featureVersion;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, dataset_version_id, feature_version, snapshot_ts_ms, feature_hash, metadata_json, created_at_ms
          FROM feature_snapshots
          ${whereSql}
          ORDER BY snapshot_ts_ms DESC
          ${limitSql}
        `
      )
      .all(q) as FeatureSnapshotRecord[];
  }

  upsertExecutionProfile(input: ExecutionProfileRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO execution_profiles(
            id, profile_name, spread_model_json, slippage_model_json, fee_model_json,
            fill_policy_json, latency_assumption_json, version, created_at_ms
          ) VALUES(
            @id, @profile_name, @spread_model_json, @slippage_model_json, @fee_model_json,
            @fill_policy_json, @latency_assumption_json, @version, @created_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            spread_model_json = excluded.spread_model_json,
            slippage_model_json = excluded.slippage_model_json,
            fee_model_json = excluded.fee_model_json,
            fill_policy_json = excluded.fill_policy_json,
            latency_assumption_json = excluded.latency_assumption_json,
            version = excluded.version
        `
      )
      .run(input);
  }

  getExecutionProfile(id: string): ExecutionProfileRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT id, profile_name, spread_model_json, slippage_model_json, fee_model_json,
                 fill_policy_json, latency_assumption_json, version, created_at_ms
          FROM execution_profiles
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(id) as ExecutionProfileRecord | undefined;
    return row ?? null;
  }

  listExecutionProfiles(limit = 20): ExecutionProfileRecord[] {
    return this.db
      .prepare(
        `
          SELECT id, profile_name, spread_model_json, slippage_model_json, fee_model_json,
                 fill_policy_json, latency_assumption_json, version, created_at_ms
          FROM execution_profiles
          ORDER BY created_at_ms DESC
          LIMIT ?
        `
      )
      .all(limit) as ExecutionProfileRecord[];
  }

  createBacktestRun(input: BacktestRunRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO backtest_runs(
            id, run_type, strategy_version_id, dataset_version_id, universe_version_id, execution_profile_id,
            config_hash, started_at_ms, completed_at_ms, status, train_window, validation_window, test_window, notes
          ) VALUES(
            @id, @run_type, @strategy_version_id, @dataset_version_id, @universe_version_id, @execution_profile_id,
            @config_hash, @started_at_ms, @completed_at_ms, @status, @train_window, @validation_window, @test_window, @notes
          )
        `
      )
      .run(input);
  }

  updateBacktestRunStatus(args: {
    id: string;
    status: BacktestRunRecord['status'];
    completedAtMs?: number | null;
    notes?: string | null;
  }): void {
    this.db
      .prepare(
        `
          UPDATE backtest_runs
          SET status = @status,
              completed_at_ms = COALESCE(@completed_at_ms, completed_at_ms),
              notes = COALESCE(@notes, notes)
          WHERE id = @id
        `
      )
      .run({
        id: args.id,
        status: args.status,
        completed_at_ms: args.completedAtMs ?? null,
        notes: args.notes ?? null
      });
  }

  listBacktestRuns(params?: {
    runType?: string;
    status?: string;
    strategyVersionId?: string;
    limit?: number;
  }): BacktestRunRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.runType) {
      where.push('run_type = @run_type');
      q.run_type = params.runType;
    }
    if (params?.status) {
      where.push('status = @status');
      q.status = params.status;
    }
    if (params?.strategyVersionId) {
      where.push('strategy_version_id = @strategy_version_id');
      q.strategy_version_id = params.strategyVersionId;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT
            id, run_type, strategy_version_id, dataset_version_id, universe_version_id, execution_profile_id,
            config_hash, started_at_ms, completed_at_ms, status, train_window, validation_window, test_window, notes
          FROM backtest_runs
          ${whereSql}
          ORDER BY started_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as BacktestRunRecord[];
  }

  getBacktestRun(id: string): BacktestRunRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id, run_type, strategy_version_id, dataset_version_id, universe_version_id, execution_profile_id,
            config_hash, started_at_ms, completed_at_ms, status, train_window, validation_window, test_window, notes
          FROM backtest_runs
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(id) as BacktestRunRecord | undefined;
    return row ?? null;
  }

  upsertSignalSnapshots(rows: SignalSnapshotRecord[]): void {
    if (!rows.length) return;
    const stmt = this.db.prepare(
      `
        INSERT INTO signal_snapshots(
          id, signal_id, strategy_version_id, dataset_version_id, backtest_run_id, snapshot_ts_ms,
          symbol, market, asset_class, timeframe, direction, conviction, regime_context_json, entry_logic_json,
          invalidation_logic_json, source_transparency_json, evidence_status, created_at_ms
        ) VALUES(
          @id, @signal_id, @strategy_version_id, @dataset_version_id, @backtest_run_id, @snapshot_ts_ms,
          @symbol, @market, @asset_class, @timeframe, @direction, @conviction, @regime_context_json, @entry_logic_json,
          @invalidation_logic_json, @source_transparency_json, @evidence_status, @created_at_ms
        )
        ON CONFLICT(id) DO UPDATE SET
          signal_id = excluded.signal_id,
          strategy_version_id = excluded.strategy_version_id,
          dataset_version_id = excluded.dataset_version_id,
          backtest_run_id = excluded.backtest_run_id,
          snapshot_ts_ms = excluded.snapshot_ts_ms,
          symbol = excluded.symbol,
          market = excluded.market,
          asset_class = excluded.asset_class,
          timeframe = excluded.timeframe,
          direction = excluded.direction,
          conviction = excluded.conviction,
          regime_context_json = excluded.regime_context_json,
          entry_logic_json = excluded.entry_logic_json,
          invalidation_logic_json = excluded.invalidation_logic_json,
          source_transparency_json = excluded.source_transparency_json,
          evidence_status = excluded.evidence_status
      `
    );
    const tx = this.db.transaction((items: SignalSnapshotRecord[]) => {
      for (const row of items) stmt.run(row);
    });
    tx(rows);
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
    const q: Record<string, unknown> = {};
    if (params?.signalId) {
      where.push('signal_id = @signal_id');
      q.signal_id = params.signalId;
    }
    if (params?.runId) {
      where.push('backtest_run_id = @backtest_run_id');
      q.backtest_run_id = params.runId;
    }
    if (params?.symbol) {
      where.push('symbol = @symbol');
      q.symbol = params.symbol.toUpperCase();
    }
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.evidenceStatus) {
      where.push('evidence_status = @evidence_status');
      q.evidence_status = params.evidenceStatus;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT
            id, signal_id, strategy_version_id, dataset_version_id, backtest_run_id, snapshot_ts_ms,
            symbol, market, asset_class, timeframe, direction, conviction, regime_context_json, entry_logic_json,
            invalidation_logic_json, source_transparency_json, evidence_status, created_at_ms
          FROM signal_snapshots
          ${whereSql}
          ORDER BY snapshot_ts_ms DESC
          ${limitSql}
        `
      )
      .all(q) as SignalSnapshotRecord[];
  }

  upsertBacktestMetric(input: BacktestMetricRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO backtest_metrics(
            backtest_run_id, gross_return, net_return, sharpe, sortino, max_drawdown, turnover, win_rate, hit_rate,
            cost_drag, sample_size, withheld_reason, realism_grade, robustness_grade, status, created_at_ms, updated_at_ms
          ) VALUES(
            @backtest_run_id, @gross_return, @net_return, @sharpe, @sortino, @max_drawdown, @turnover, @win_rate, @hit_rate,
            @cost_drag, @sample_size, @withheld_reason, @realism_grade, @robustness_grade, @status, @created_at_ms, @updated_at_ms
          )
        `
      )
      .run(input);
  }

  getBacktestMetric(backtestRunId: string): BacktestMetricRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id, backtest_run_id, gross_return, net_return, sharpe, sortino, max_drawdown, turnover, win_rate, hit_rate,
            cost_drag, sample_size, withheld_reason, realism_grade, robustness_grade, status, created_at_ms, updated_at_ms
          FROM backtest_metrics
          WHERE backtest_run_id = ?
          ORDER BY updated_at_ms DESC
          LIMIT 1
        `
      )
      .get(backtestRunId) as BacktestMetricRecord | undefined;
    return row ?? null;
  }

  insertBacktestArtifacts(rows: BacktestArtifactRecord[]): void {
    if (!rows.length) return;
    const stmt = this.db.prepare(
      `
        INSERT INTO backtest_artifacts(backtest_run_id, artifact_type, path_or_payload, created_at_ms)
        VALUES(@backtest_run_id, @artifact_type, @path_or_payload, @created_at_ms)
      `
    );
    const tx = this.db.transaction((items: BacktestArtifactRecord[]) => {
      for (const row of items) stmt.run(row);
    });
    tx(rows);
  }

  listBacktestArtifacts(backtestRunId: string): BacktestArtifactRecord[] {
    return this.db
      .prepare(
        `
          SELECT id, backtest_run_id, artifact_type, path_or_payload, created_at_ms
          FROM backtest_artifacts
          WHERE backtest_run_id = ?
          ORDER BY created_at_ms DESC
        `
      )
      .all(backtestRunId) as BacktestArtifactRecord[];
  }

  upsertReconciliationRows(rows: ReplayPaperReconciliationRecord[]): void {
    if (!rows.length) return;
    const stmt = this.db.prepare(
      `
        INSERT INTO replay_paper_reconciliation(
          id, signal_snapshot_id, trade_group_id, replay_run_id, paper_execution_group_id,
          expected_fill_price, paper_fill_price, expected_pnl, paper_pnl, expected_hold_period, actual_hold_period,
          slippage_gap, attribution_json, status, created_at_ms
        ) VALUES(
          @id, @signal_snapshot_id, @trade_group_id, @replay_run_id, @paper_execution_group_id,
          @expected_fill_price, @paper_fill_price, @expected_pnl, @paper_pnl, @expected_hold_period, @actual_hold_period,
          @slippage_gap, @attribution_json, @status, @created_at_ms
        )
        ON CONFLICT(id) DO UPDATE SET
          paper_execution_group_id = excluded.paper_execution_group_id,
          expected_fill_price = excluded.expected_fill_price,
          paper_fill_price = excluded.paper_fill_price,
          expected_pnl = excluded.expected_pnl,
          paper_pnl = excluded.paper_pnl,
          expected_hold_period = excluded.expected_hold_period,
          actual_hold_period = excluded.actual_hold_period,
          slippage_gap = excluded.slippage_gap,
          attribution_json = excluded.attribution_json,
          status = excluded.status
      `
    );
    const tx = this.db.transaction((items: ReplayPaperReconciliationRecord[]) => {
      for (const row of items) stmt.run(row);
    });
    tx(rows);
  }

  listReconciliationRows(params?: {
    replayRunId?: string;
    status?: ReplayPaperReconciliationRecord['status'];
    symbol?: string;
    strategyVersionId?: string;
    limit?: number;
  }): Array<ReplayPaperReconciliationRecord & { symbol: string | null; strategy_version_id: string | null; regime_id: string | null }> {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.replayRunId) {
      where.push('r.replay_run_id = @replay_run_id');
      q.replay_run_id = params.replayRunId;
    }
    if (params?.status) {
      where.push('r.status = @status');
      q.status = params.status;
    }
    if (params?.symbol) {
      where.push('ss.symbol = @symbol');
      q.symbol = params.symbol.toUpperCase();
    }
    if (params?.strategyVersionId) {
      where.push('ss.strategy_version_id = @strategy_version_id');
      q.strategy_version_id = params.strategyVersionId;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT
            r.id, r.signal_snapshot_id, r.trade_group_id, r.replay_run_id, r.paper_execution_group_id,
            r.expected_fill_price, r.paper_fill_price, r.expected_pnl, r.paper_pnl, r.expected_hold_period, r.actual_hold_period,
            r.slippage_gap, r.attribution_json, r.status, r.created_at_ms,
            ss.symbol AS symbol, ss.strategy_version_id AS strategy_version_id,
            json_extract(ss.regime_context_json, '$.regime_id') AS regime_id
          FROM replay_paper_reconciliation r
          JOIN signal_snapshots ss ON ss.id = r.signal_snapshot_id
          ${whereSql}
          ORDER BY r.created_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as Array<ReplayPaperReconciliationRecord & { symbol: string | null; strategy_version_id: string | null; regime_id: string | null }>;
  }

  upsertExperimentRecord(input: ExperimentRegistryRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO experiment_registry(
            id, backtest_run_id, strategy_version_id, decision_status, promotion_reason, demotion_reason, approved_at_ms, created_at_ms
          ) VALUES(
            @id, @backtest_run_id, @strategy_version_id, @decision_status, @promotion_reason, @demotion_reason, @approved_at_ms, @created_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            backtest_run_id = excluded.backtest_run_id,
            strategy_version_id = excluded.strategy_version_id,
            decision_status = excluded.decision_status,
            promotion_reason = excluded.promotion_reason,
            demotion_reason = excluded.demotion_reason,
            approved_at_ms = excluded.approved_at_ms
        `
      )
      .run(input);
  }

  listExperimentRecords(limit = 100): ExperimentRegistryRecord[] {
    return this.db
      .prepare(
        `
          SELECT
            id, backtest_run_id, strategy_version_id, decision_status, promotion_reason, demotion_reason, approved_at_ms, created_at_ms
          FROM experiment_registry
          ORDER BY created_at_ms DESC
          LIMIT ?
        `
      )
      .all(limit) as ExperimentRegistryRecord[];
  }

  upsertModelVersion(input: ModelVersionRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO model_versions(
            id, model_key, provider, endpoint, task_scope, semantic_version, status, config_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @model_key, @provider, @endpoint, @task_scope, @semantic_version, @status, @config_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            model_key = excluded.model_key,
            provider = excluded.provider,
            endpoint = excluded.endpoint,
            task_scope = excluded.task_scope,
            semantic_version = excluded.semantic_version,
            status = excluded.status,
            config_json = excluded.config_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listModelVersions(params?: { modelKey?: string; status?: string; limit?: number }): ModelVersionRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.modelKey) {
      where.push('model_key = @model_key');
      q.model_key = params.modelKey;
    }
    if (params?.status) {
      where.push('status = @status');
      q.status = params.status;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, model_key, provider, endpoint, task_scope, semantic_version, status, config_json, created_at_ms, updated_at_ms
          FROM model_versions
          ${whereSql}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as ModelVersionRecord[];
  }

  upsertPromptVersion(input: PromptVersionRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO prompt_versions(
            id, task_key, semantic_version, prompt_hash, prompt_text, status, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @task_key, @semantic_version, @prompt_hash, @prompt_text, @status, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            task_key = excluded.task_key,
            semantic_version = excluded.semantic_version,
            prompt_hash = excluded.prompt_hash,
            prompt_text = excluded.prompt_text,
            status = excluded.status,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listPromptVersions(params?: { taskKey?: string; status?: string; limit?: number }): PromptVersionRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.taskKey) {
      where.push('task_key = @task_key');
      q.task_key = params.taskKey;
    }
    if (params?.status) {
      where.push('status = @status');
      q.status = params.status;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, task_key, semantic_version, prompt_hash, prompt_text, status, created_at_ms, updated_at_ms
          FROM prompt_versions
          ${whereSql}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as PromptVersionRecord[];
  }

  upsertEvalRecord(input: EvalRegistryRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO eval_registry(
            id, eval_type, subject_type, subject_id, subject_version, score_json, notes, created_at_ms
          ) VALUES(
            @id, @eval_type, @subject_type, @subject_id, @subject_version, @score_json, @notes, @created_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            eval_type = excluded.eval_type,
            subject_type = excluded.subject_type,
            subject_id = excluded.subject_id,
            subject_version = excluded.subject_version,
            score_json = excluded.score_json,
            notes = excluded.notes
        `
      )
      .run(input);
  }

  listEvalRecords(params?: { subjectType?: string; evalType?: string; limit?: number }): EvalRegistryRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.subjectType) {
      where.push('subject_type = @subject_type');
      q.subject_type = params.subjectType;
    }
    if (params?.evalType) {
      where.push('eval_type = @eval_type');
      q.eval_type = params.evalType;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, eval_type, subject_type, subject_id, subject_version, score_json, notes, created_at_ms
          FROM eval_registry
          ${whereSql}
          ORDER BY created_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as EvalRegistryRecord[];
  }

  upsertWorkflowRun(input: WorkflowRunRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO workflow_runs(
            id, workflow_key, workflow_version, trigger_type, status, trace_id, input_json, output_json, attempt_count,
            started_at_ms, updated_at_ms, completed_at_ms
          ) VALUES(
            @id, @workflow_key, @workflow_version, @trigger_type, @status, @trace_id, @input_json, @output_json, @attempt_count,
            @started_at_ms, @updated_at_ms, @completed_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            workflow_key = excluded.workflow_key,
            workflow_version = excluded.workflow_version,
            trigger_type = excluded.trigger_type,
            status = excluded.status,
            trace_id = excluded.trace_id,
            input_json = excluded.input_json,
            output_json = excluded.output_json,
            attempt_count = excluded.attempt_count,
            updated_at_ms = excluded.updated_at_ms,
            completed_at_ms = excluded.completed_at_ms
        `
      )
      .run(input);
  }

  listWorkflowRuns(params?: { workflowKey?: string; status?: string; limit?: number }): WorkflowRunRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.workflowKey) {
      where.push('workflow_key = @workflow_key');
      q.workflow_key = params.workflowKey;
    }
    if (params?.status) {
      where.push('status = @status');
      q.status = params.status;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT
            id, workflow_key, workflow_version, trigger_type, status, trace_id, input_json, output_json, attempt_count,
            started_at_ms, updated_at_ms, completed_at_ms
          FROM workflow_runs
          ${whereSql}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as WorkflowRunRecord[];
  }

  insertAuditEvent(input: AuditEventRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO audit_events(
            trace_id, scope, event_type, user_id, entity_type, entity_id, payload_json, created_at_ms
          ) VALUES(
            @trace_id, @scope, @event_type, @user_id, @entity_type, @entity_id, @payload_json, @created_at_ms
          )
        `
      )
      .run(input);
  }

  listAuditEvents(params?: { traceId?: string; entityType?: string; entityId?: string; limit?: number }): AuditEventRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.traceId) {
      where.push('trace_id = @trace_id');
      q.trace_id = params.traceId;
    }
    if (params?.entityType) {
      where.push('entity_type = @entity_type');
      q.entity_type = params.entityType;
    }
    if (params?.entityId) {
      where.push('entity_id = @entity_id');
      q.entity_id = params.entityId;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, trace_id, scope, event_type, user_id, entity_type, entity_id, payload_json, created_at_ms
          FROM audit_events
          ${whereSql}
          ORDER BY created_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as AuditEventRecord[];
  }

  upsertRecommendationReview(input: RecommendationReviewRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO recommendation_reviews(
            id, decision_snapshot_id, action_id, review_type, score, notes, payload_json, created_at_ms
          ) VALUES(
            @id, @decision_snapshot_id, @action_id, @review_type, @score, @notes, @payload_json, @created_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            decision_snapshot_id = excluded.decision_snapshot_id,
            action_id = excluded.action_id,
            review_type = excluded.review_type,
            score = excluded.score,
            notes = excluded.notes,
            payload_json = excluded.payload_json
        `
      )
      .run(input);
  }

  listRecommendationReviews(params?: { decisionSnapshotId?: string; reviewType?: string; limit?: number }): RecommendationReviewRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.decisionSnapshotId) {
      where.push('decision_snapshot_id = @decision_snapshot_id');
      q.decision_snapshot_id = params.decisionSnapshotId;
    }
    if (params?.reviewType) {
      where.push('review_type = @review_type');
      q.review_type = params.reviewType;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, decision_snapshot_id, action_id, review_type, score, notes, payload_json, created_at_ms
          FROM recommendation_reviews
          ${whereSql}
          ORDER BY created_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as RecommendationReviewRecord[];
  }

  upsertDecisionSnapshot(input: DecisionSnapshotRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO decision_snapshots(
            id, user_id, market, asset_class, snapshot_date, context_hash, source_status, data_status,
            risk_state_json, portfolio_context_json, actions_json, summary_json, top_action_id, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @market, @asset_class, @snapshot_date, @context_hash, @source_status, @data_status,
            @risk_state_json, @portfolio_context_json, @actions_json, @summary_json, @top_action_id, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            market = excluded.market,
            asset_class = excluded.asset_class,
            snapshot_date = excluded.snapshot_date,
            context_hash = excluded.context_hash,
            source_status = excluded.source_status,
            data_status = excluded.data_status,
            risk_state_json = excluded.risk_state_json,
            portfolio_context_json = excluded.portfolio_context_json,
            actions_json = excluded.actions_json,
            summary_json = excluded.summary_json,
            top_action_id = excluded.top_action_id,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  getLatestDecisionSnapshot(params: {
    userId: string;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
  }): DecisionSnapshotRecord | null {
    const where = ['user_id = @user_id'];
    const q: Record<string, unknown> = { user_id: params.userId };
    if (params.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    const row = this.db
      .prepare(
        `
          SELECT
            id, user_id, market, asset_class, snapshot_date, context_hash, source_status, data_status,
            risk_state_json, portfolio_context_json, actions_json, summary_json, top_action_id, created_at_ms, updated_at_ms
          FROM decision_snapshots
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at_ms DESC
          LIMIT 1
        `
      )
      .get(q) as DecisionSnapshotRecord | undefined;
    return row ?? null;
  }

  listDecisionSnapshots(params: {
    userId: string;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    limit?: number;
  }): DecisionSnapshotRecord[] {
    const where = ['user_id = @user_id'];
    const q: Record<string, unknown> = { user_id: params.userId };
    if (params.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    if (params.limit) q.limit = params.limit;
    const limitSql = params.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT
            id, user_id, market, asset_class, snapshot_date, context_hash, source_status, data_status,
            risk_state_json, portfolio_context_json, actions_json, summary_json, top_action_id, created_at_ms, updated_at_ms
          FROM decision_snapshots
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as DecisionSnapshotRecord[];
  }

  upsertUserRitualEvent(input: UserRitualEventRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO user_ritual_events(
            id, user_id, market, asset_class, event_date, week_key, event_type, snapshot_id, reason_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @market, @asset_class, @event_date, @week_key, @event_type, @snapshot_id, @reason_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(user_id, market, asset_class, event_date, event_type) DO UPDATE SET
            week_key = excluded.week_key,
            snapshot_id = excluded.snapshot_id,
            reason_json = excluded.reason_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listUserRitualEvents(params: {
    userId: string;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): UserRitualEventRecord[] {
    const where = ['user_id = @user_id'];
    const q: Record<string, unknown> = { user_id: params.userId };
    if (params.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    if (params.fromDate) {
      where.push('event_date >= @from_date');
      q.from_date = params.fromDate;
    }
    if (params.toDate) {
      where.push('event_date <= @to_date');
      q.to_date = params.toDate;
    }
    if (params.limit) q.limit = params.limit;
    const limitSql = params.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT
            id, user_id, market, asset_class, event_date, week_key, event_type, snapshot_id, reason_json, created_at_ms, updated_at_ms
          FROM user_ritual_events
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as UserRitualEventRecord[];
  }

  getUserNotificationPreferences(userId: string): NotificationPreferenceRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            user_id, morning_enabled, state_shift_enabled, protective_enabled, wrap_up_enabled,
            frequency, quiet_start_hour, quiet_end_hour, updated_at_ms
          FROM user_notification_preferences
          WHERE user_id = ?
          LIMIT 1
        `
      )
      .get(userId) as NotificationPreferenceRecord | undefined;
    return row ?? null;
  }

  upsertUserNotificationPreferences(input: NotificationPreferenceRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO user_notification_preferences(
            user_id, morning_enabled, state_shift_enabled, protective_enabled, wrap_up_enabled,
            frequency, quiet_start_hour, quiet_end_hour, updated_at_ms
          ) VALUES(
            @user_id, @morning_enabled, @state_shift_enabled, @protective_enabled, @wrap_up_enabled,
            @frequency, @quiet_start_hour, @quiet_end_hour, @updated_at_ms
          )
          ON CONFLICT(user_id) DO UPDATE SET
            morning_enabled = excluded.morning_enabled,
            state_shift_enabled = excluded.state_shift_enabled,
            protective_enabled = excluded.protective_enabled,
            wrap_up_enabled = excluded.wrap_up_enabled,
            frequency = excluded.frequency,
            quiet_start_hour = excluded.quiet_start_hour,
            quiet_end_hour = excluded.quiet_end_hour,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  upsertNotificationEvent(input: NotificationEventRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO notification_events(
            id, user_id, market, asset_class, category, trigger_type, fingerprint, title, body, tone, status,
            action_target, reason_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @market, @asset_class, @category, @trigger_type, @fingerprint, @title, @body, @tone, @status,
            @action_target, @reason_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(fingerprint) DO UPDATE SET
            title = excluded.title,
            body = excluded.body,
            tone = excluded.tone,
            status = excluded.status,
            action_target = excluded.action_target,
            reason_json = excluded.reason_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listNotificationEvents(params: {
    userId: string;
    market?: Market | 'ALL';
    assetClass?: AssetClass | 'ALL';
    status?: string;
    limit?: number;
  }): NotificationEventRecord[] {
    const where = ['user_id = @user_id'];
    const q: Record<string, unknown> = { user_id: params.userId };
    if (params.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    if (params.status) {
      where.push('status = @status');
      q.status = params.status;
    }
    if (params.limit) q.limit = params.limit;
    const limitSql = params.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT
            id, user_id, market, asset_class, category, trigger_type, fingerprint, title, body, tone, status,
            action_target, reason_json, created_at_ms, updated_at_ms
          FROM notification_events
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as NotificationEventRecord[];
  }

  upsertNovaTaskRun(input: NovaTaskRunRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO nova_task_runs(
            id, user_id, thread_id, task_type, route_alias, model_name, endpoint, trace_id, prompt_version_id,
            parent_run_id, input_json, context_json, output_json, status, error, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @thread_id, @task_type, @route_alias, @model_name, @endpoint, @trace_id, @prompt_version_id,
            @parent_run_id, @input_json, @context_json, @output_json, @status, @error, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            thread_id = excluded.thread_id,
            task_type = excluded.task_type,
            route_alias = excluded.route_alias,
            model_name = excluded.model_name,
            endpoint = excluded.endpoint,
            trace_id = excluded.trace_id,
            prompt_version_id = excluded.prompt_version_id,
            parent_run_id = excluded.parent_run_id,
            input_json = excluded.input_json,
            context_json = excluded.context_json,
            output_json = excluded.output_json,
            status = excluded.status,
            error = excluded.error,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listNovaTaskRuns(params?: {
    userId?: string;
    threadId?: string;
    taskType?: string;
    status?: string;
    limit?: number;
  }): NovaTaskRunRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.userId) {
      where.push('user_id = @user_id');
      q.user_id = params.userId;
    }
    if (params?.threadId) {
      where.push('thread_id = @thread_id');
      q.thread_id = params.threadId;
    }
    if (params?.taskType) {
      where.push('task_type = @task_type');
      q.task_type = params.taskType;
    }
    if (params?.status) {
      where.push('status = @status');
      q.status = params.status;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT
            id, user_id, thread_id, task_type, route_alias, model_name, endpoint, trace_id, prompt_version_id,
            parent_run_id, input_json, context_json, output_json, status, error, created_at_ms, updated_at_ms
          FROM nova_task_runs
          ${whereSql}
          ORDER BY created_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as NovaTaskRunRecord[];
  }

  getNovaTaskRun(runId: string): NovaTaskRunRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id, user_id, thread_id, task_type, route_alias, model_name, endpoint, trace_id, prompt_version_id,
            parent_run_id, input_json, context_json, output_json, status, error, created_at_ms, updated_at_ms
          FROM nova_task_runs
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(runId) as NovaTaskRunRecord | undefined;
    return row ?? null;
  }

  upsertNovaReviewLabel(input: NovaReviewLabelRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO nova_review_labels(
            id, run_id, reviewer_id, label, score, notes, include_in_training, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @run_id, @reviewer_id, @label, @score, @notes, @include_in_training, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            run_id = excluded.run_id,
            reviewer_id = excluded.reviewer_id,
            label = excluded.label,
            score = excluded.score,
            notes = excluded.notes,
            include_in_training = excluded.include_in_training,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listNovaReviewLabels(params?: { runId?: string; includeInTraining?: boolean; limit?: number }): NovaReviewLabelRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.runId) {
      where.push('run_id = @run_id');
      q.run_id = params.runId;
    }
    if (typeof params?.includeInTraining === 'boolean') {
      where.push('include_in_training = @include_in_training');
      q.include_in_training = params.includeInTraining ? 1 : 0;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT
            id, run_id, reviewer_id, label, score, notes, include_in_training, created_at_ms, updated_at_ms
          FROM nova_review_labels
          ${whereSql}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as NovaReviewLabelRecord[];
  }

  upsertMarketStateSnapshot(input: MarketStateSnapshotRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO market_state_snapshots(
            id, user_id, market, asset_class, snapshot_date, decision_snapshot_id, regime_id, risk_posture,
            style_climate, event_context_json, drivers_json, source_status, data_status, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @market, @asset_class, @snapshot_date, @decision_snapshot_id, @regime_id, @risk_posture,
            @style_climate, @event_context_json, @drivers_json, @source_status, @data_status, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            decision_snapshot_id = excluded.decision_snapshot_id,
            regime_id = excluded.regime_id,
            risk_posture = excluded.risk_posture,
            style_climate = excluded.style_climate,
            event_context_json = excluded.event_context_json,
            drivers_json = excluded.drivers_json,
            source_status = excluded.source_status,
            data_status = excluded.data_status,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listMarketStateSnapshots(params: { userId: string; market?: Market | 'ALL'; assetClass?: AssetClass | 'ALL'; limit?: number }): MarketStateSnapshotRecord[] {
    const where = ['user_id = @user_id'];
    const q: Record<string, unknown> = { user_id: params.userId };
    if (params.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    if (params.limit) q.limit = params.limit;
    const limitSql = params.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, user_id, market, asset_class, snapshot_date, decision_snapshot_id, regime_id, risk_posture,
                 style_climate, event_context_json, drivers_json, source_status, data_status, created_at_ms, updated_at_ms
          FROM market_state_snapshots
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as MarketStateSnapshotRecord[];
  }

  upsertEvidenceSnapshot(input: EvidenceSnapshotRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO evidence_snapshots(
            id, decision_snapshot_id, user_id, action_id, thesis, supporting_factors_json, opposing_factors_json,
            regime_context_json, ranking_reason, invalidation_conditions_json, similar_case_json, change_summary_json,
            horizon, source_status, data_status, model_version_id, prompt_version_id, payload_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @decision_snapshot_id, @user_id, @action_id, @thesis, @supporting_factors_json, @opposing_factors_json,
            @regime_context_json, @ranking_reason, @invalidation_conditions_json, @similar_case_json, @change_summary_json,
            @horizon, @source_status, @data_status, @model_version_id, @prompt_version_id, @payload_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            thesis = excluded.thesis,
            supporting_factors_json = excluded.supporting_factors_json,
            opposing_factors_json = excluded.opposing_factors_json,
            regime_context_json = excluded.regime_context_json,
            ranking_reason = excluded.ranking_reason,
            invalidation_conditions_json = excluded.invalidation_conditions_json,
            similar_case_json = excluded.similar_case_json,
            change_summary_json = excluded.change_summary_json,
            horizon = excluded.horizon,
            source_status = excluded.source_status,
            data_status = excluded.data_status,
            model_version_id = excluded.model_version_id,
            prompt_version_id = excluded.prompt_version_id,
            payload_json = excluded.payload_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listEvidenceSnapshots(params: { decisionSnapshotId?: string; actionId?: string; limit?: number }): EvidenceSnapshotRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params.decisionSnapshotId) {
      where.push('decision_snapshot_id = @decision_snapshot_id');
      q.decision_snapshot_id = params.decisionSnapshotId;
    }
    if (params.actionId) {
      where.push('action_id = @action_id');
      q.action_id = params.actionId;
    }
    if (params.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, decision_snapshot_id, user_id, action_id, thesis, supporting_factors_json, opposing_factors_json,
                 regime_context_json, ranking_reason, invalidation_conditions_json, similar_case_json, change_summary_json,
                 horizon, source_status, data_status, model_version_id, prompt_version_id, payload_json, created_at_ms, updated_at_ms
          FROM evidence_snapshots
          ${whereSql}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as EvidenceSnapshotRecord[];
  }

  upsertActionSnapshot(input: ActionSnapshotRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO action_snapshots(
            id, decision_snapshot_id, user_id, action_id, signal_id, symbol, rank, action_label, action_state,
            portfolio_intent, conviction, why_now, caution, invalidation, horizon, evidence_snapshot_id,
            payload_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @decision_snapshot_id, @user_id, @action_id, @signal_id, @symbol, @rank, @action_label, @action_state,
            @portfolio_intent, @conviction, @why_now, @caution, @invalidation, @horizon, @evidence_snapshot_id,
            @payload_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            signal_id = excluded.signal_id,
            symbol = excluded.symbol,
            rank = excluded.rank,
            action_label = excluded.action_label,
            action_state = excluded.action_state,
            portfolio_intent = excluded.portfolio_intent,
            conviction = excluded.conviction,
            why_now = excluded.why_now,
            caution = excluded.caution,
            invalidation = excluded.invalidation,
            horizon = excluded.horizon,
            evidence_snapshot_id = excluded.evidence_snapshot_id,
            payload_json = excluded.payload_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listActionSnapshots(params: { decisionSnapshotId?: string; userId?: string; limit?: number }): ActionSnapshotRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params.decisionSnapshotId) {
      where.push('decision_snapshot_id = @decision_snapshot_id');
      q.decision_snapshot_id = params.decisionSnapshotId;
    }
    if (params.userId) {
      where.push('user_id = @user_id');
      q.user_id = params.userId;
    }
    if (params.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, decision_snapshot_id, user_id, action_id, signal_id, symbol, rank, action_label, action_state,
                 portfolio_intent, conviction, why_now, caution, invalidation, horizon, evidence_snapshot_id,
                 payload_json, created_at_ms, updated_at_ms
          FROM action_snapshots
          ${whereSql}
          ORDER BY rank ASC, updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as ActionSnapshotRecord[];
  }

  upsertUserResponseEvent(input: UserResponseEventRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO user_response_events(
            id, user_id, market, asset_class, decision_snapshot_id, action_id, thread_id, event_type,
            event_date, payload_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @market, @asset_class, @decision_snapshot_id, @action_id, @thread_id, @event_type,
            @event_date, @payload_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            decision_snapshot_id = excluded.decision_snapshot_id,
            action_id = excluded.action_id,
            thread_id = excluded.thread_id,
            payload_json = excluded.payload_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listUserResponseEvents(params: {
    userId: string;
    eventType?: string;
    decisionSnapshotId?: string;
    fromDate?: string;
    limit?: number;
  }): UserResponseEventRecord[] {
    const where = ['user_id = @user_id'];
    const q: Record<string, unknown> = { user_id: params.userId };
    if (params.eventType) {
      where.push('event_type = @event_type');
      q.event_type = params.eventType;
    }
    if (params.decisionSnapshotId) {
      where.push('decision_snapshot_id = @decision_snapshot_id');
      q.decision_snapshot_id = params.decisionSnapshotId;
    }
    if (params.fromDate) {
      where.push('event_date >= @from_date');
      q.from_date = params.fromDate;
    }
    if (params.limit) q.limit = params.limit;
    const limitSql = params.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, user_id, market, asset_class, decision_snapshot_id, action_id, thread_id, event_type,
                 event_date, payload_json, created_at_ms, updated_at_ms
          FROM user_response_events
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as UserResponseEventRecord[];
  }

  upsertOutcomeReview(input: OutcomeReviewRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO outcome_reviews(
            id, user_id, market, asset_class, decision_snapshot_id, action_id, review_kind,
            score, verdict, summary, payload_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @market, @asset_class, @decision_snapshot_id, @action_id, @review_kind,
            @score, @verdict, @summary, @payload_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            score = excluded.score,
            verdict = excluded.verdict,
            summary = excluded.summary,
            payload_json = excluded.payload_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listOutcomeReviews(params?: { decisionSnapshotId?: string; reviewKind?: string; userId?: string; limit?: number }): OutcomeReviewRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.decisionSnapshotId) {
      where.push('decision_snapshot_id = @decision_snapshot_id');
      q.decision_snapshot_id = params.decisionSnapshotId;
    }
    if (params?.reviewKind) {
      where.push('review_kind = @review_kind');
      q.review_kind = params.reviewKind;
    }
    if (params?.userId) {
      where.push('user_id = @user_id');
      q.user_id = params.userId;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, user_id, market, asset_class, decision_snapshot_id, action_id, review_kind,
                 score, verdict, summary, payload_json, created_at_ms, updated_at_ms
          FROM outcome_reviews
          ${whereSql}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as OutcomeReviewRecord[];
  }

  upsertUserStateSnapshot(input: UserStateSnapshotRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO user_state_snapshots(
            id, user_id, market, asset_class, snapshot_date, portfolio_state_json, discipline_state_json,
            behavioral_pattern_json, impulse_risk_json, trust_state_json, decision_profile_json,
            personalization_context_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @market, @asset_class, @snapshot_date, @portfolio_state_json, @discipline_state_json,
            @behavioral_pattern_json, @impulse_risk_json, @trust_state_json, @decision_profile_json,
            @personalization_context_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(user_id, market, asset_class, snapshot_date) DO UPDATE SET
            portfolio_state_json = excluded.portfolio_state_json,
            discipline_state_json = excluded.discipline_state_json,
            behavioral_pattern_json = excluded.behavioral_pattern_json,
            impulse_risk_json = excluded.impulse_risk_json,
            trust_state_json = excluded.trust_state_json,
            decision_profile_json = excluded.decision_profile_json,
            personalization_context_json = excluded.personalization_context_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  getLatestUserStateSnapshot(params: { userId: string; market?: Market | 'ALL'; assetClass?: AssetClass | 'ALL' }): UserStateSnapshotRecord | null {
    const where = ['user_id = @user_id'];
    const q: Record<string, unknown> = { user_id: params.userId };
    if (params.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    const row = this.db
      .prepare(
        `
          SELECT id, user_id, market, asset_class, snapshot_date, portfolio_state_json, discipline_state_json,
                 behavioral_pattern_json, impulse_risk_json, trust_state_json, decision_profile_json,
                 personalization_context_json, created_at_ms, updated_at_ms
          FROM user_state_snapshots
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at_ms DESC
          LIMIT 1
        `
      )
      .get(q) as UserStateSnapshotRecord | undefined;
    return row ?? null;
  }

  upsertDecisionIntelligenceDatasetRecord(input: DecisionIntelligenceDatasetRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO decision_intelligence_dataset(
            id, user_id, market, asset_class, decision_snapshot_id, market_state_snapshot_id, user_state_snapshot_id,
            label_state, export_ready, payload_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @market, @asset_class, @decision_snapshot_id, @market_state_snapshot_id, @user_state_snapshot_id,
            @label_state, @export_ready, @payload_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            market_state_snapshot_id = excluded.market_state_snapshot_id,
            user_state_snapshot_id = excluded.user_state_snapshot_id,
            label_state = excluded.label_state,
            export_ready = excluded.export_ready,
            payload_json = excluded.payload_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listDecisionIntelligenceDataset(params: { userId?: string; market?: Market | 'ALL'; assetClass?: AssetClass | 'ALL'; labelState?: string; limit?: number }): DecisionIntelligenceDatasetRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params.userId) {
      where.push('user_id = @user_id');
      q.user_id = params.userId;
    }
    if (params.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    if (params.labelState) {
      where.push('label_state = @label_state');
      q.label_state = params.labelState;
    }
    if (params.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, user_id, market, asset_class, decision_snapshot_id, market_state_snapshot_id, user_state_snapshot_id,
                 label_state, export_ready, payload_json, created_at_ms, updated_at_ms
          FROM decision_intelligence_dataset
          ${whereSql}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as DecisionIntelligenceDatasetRecord[];
  }

  upsertSandboxRun(input: SandboxRunRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO sandbox_runs(
            id, user_id, decision_snapshot_id, action_id, scenario_type, input_json, result_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @user_id, @decision_snapshot_id, @action_id, @scenario_type, @input_json, @result_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            result_json = excluded.result_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listSandboxRuns(params: { userId: string; decisionSnapshotId?: string; limit?: number }): SandboxRunRecord[] {
    const where = ['user_id = @user_id'];
    const q: Record<string, unknown> = { user_id: params.userId };
    if (params.decisionSnapshotId) {
      where.push('decision_snapshot_id = @decision_snapshot_id');
      q.decision_snapshot_id = params.decisionSnapshotId;
    }
    if (params.limit) q.limit = params.limit;
    const limitSql = params.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, user_id, decision_snapshot_id, action_id, scenario_type, input_json, result_json, created_at_ms, updated_at_ms
          FROM sandbox_runs
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as SandboxRunRecord[];
  }

  upsertExternalSurface(input: ExternalSurfaceRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO external_surfaces(
            id, surface_type, market, asset_class, source_decision_snapshot_id, share_key, status, payload_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @surface_type, @market, @asset_class, @source_decision_snapshot_id, @share_key, @status, @payload_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            source_decision_snapshot_id = excluded.source_decision_snapshot_id,
            share_key = excluded.share_key,
            status = excluded.status,
            payload_json = excluded.payload_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listExternalSurfaces(params?: { surfaceType?: string; market?: Market | 'ALL'; assetClass?: AssetClass | 'ALL'; limit?: number }): ExternalSurfaceRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.surfaceType) {
      where.push('surface_type = @surface_type');
      q.surface_type = params.surfaceType;
    }
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.assetClass) {
      where.push('asset_class = @asset_class');
      q.asset_class = params.assetClass;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, surface_type, market, asset_class, source_decision_snapshot_id, share_key, status, payload_json, created_at_ms, updated_at_ms
          FROM external_surfaces
          ${whereSql}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as ExternalSurfaceRecord[];
  }

  upsertComplianceLog(input: ComplianceLogRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO compliance_logs(
            id, log_type, user_id, decision_snapshot_id, action_id, evidence_snapshot_id, model_version_id,
            prompt_version_id, policy_version, trace_id, payload_json, created_at_ms, updated_at_ms
          ) VALUES(
            @id, @log_type, @user_id, @decision_snapshot_id, @action_id, @evidence_snapshot_id, @model_version_id,
            @prompt_version_id, @policy_version, @trace_id, @payload_json, @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(id) DO UPDATE SET
            payload_json = excluded.payload_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(input);
  }

  listComplianceLogs(params?: { logType?: string; userId?: string; decisionSnapshotId?: string; limit?: number }): ComplianceLogRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.logType) {
      where.push('log_type = @log_type');
      q.log_type = params.logType;
    }
    if (params?.userId) {
      where.push('user_id = @user_id');
      q.user_id = params.userId;
    }
    if (params?.decisionSnapshotId) {
      where.push('decision_snapshot_id = @decision_snapshot_id');
      q.decision_snapshot_id = params.decisionSnapshotId;
    }
    if (params?.limit) q.limit = params.limit;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    return this.db
      .prepare(
        `
          SELECT id, log_type, user_id, decision_snapshot_id, action_id, evidence_snapshot_id, model_version_id,
                 prompt_version_id, policy_version, trace_id, payload_json, created_at_ms, updated_at_ms
          FROM compliance_logs
          ${whereSql}
          ORDER BY updated_at_ms DESC
          ${limitSql}
        `
      )
      .all(q) as ComplianceLogRecord[];
  }
}

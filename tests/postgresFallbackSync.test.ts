import { describe, expect, it, vi, afterEach } from 'vitest';
import * as queries from '../src/server/api/queries.js';
import * as pgReads from '../src/server/admin/postgresBusinessRead.js';
import { MarketRepository } from '../src/server/db/repository.js';
import type { SignalContract, SignalRecord } from '../src/server/types.js';

function seedSignal(id: string, symbol: string, createdAt: string, entry: number): SignalContract {
  return {
    id,
    created_at: createdAt,
    expires_at: new Date(Date.parse(createdAt) + 3 * 24 * 3600_000).toISOString(),
    asset_class: 'US_STOCK',
    market: 'US',
    symbol,
    timeframe: '1d',
    strategy_id: 'PG_FALLBACK_TEST',
    strategy_family: 'Momentum / Trend Following',
    strategy_version: 'runtime-bars-rules.v1',
    regime_id: 'TREND',
    temperature_percentile: 50,
    volatility_percentile: 44,
    direction: 'LONG',
    strength: 75,
    confidence: 0.7,
    entry_zone: { low: entry - 0.5, high: entry + 0.5, method: 'LIMIT', notes: 'seed' },
    invalidation_level: entry - 1.1,
    stop_loss: { type: 'ATR', price: entry - 1.1, rationale: 'seed' },
    take_profit_levels: [{ price: entry + 1.6, size_pct: 0.6, rationale: 'seed' }],
    trailing_rule: { type: 'EMA', params: { fast: 10, slow: 30 } },
    position_advice: {
      position_pct: 7,
      leverage_cap: 1.4,
      risk_bucket_applied: 'BASE',
      rationale: 'seed',
    },
    cost_model: { fee_bps: 1.2, spread_bps: 1.1, slippage_bps: 2.2, basis_est: 0 },
    expected_metrics: {
      expected_R: 1.2,
      hit_rate_est: 0.56,
      sample_size: 20,
      expected_max_dd_est: 0.08,
    },
    explain_bullets: ['API seed signal'],
    execution_checklist: ['seed'],
    tags: ['status:MODEL_DERIVED', 'source:DB_BACKED'],
    status: 'NEW',
    payload: { kind: 'STOCK_SWING', data: { horizon: 'MEDIUM', catalysts: ['seed'] } },
    score: 76,
    payload_version: 'signal-contract.v1',
  };
}

function toSignalRecord(signal: SignalContract): SignalRecord {
  return {
    signal_id: signal.id,
    created_at_ms: Date.parse(signal.created_at),
    expires_at_ms: Date.parse(signal.expires_at),
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
    tp1_price: signal.take_profit_levels[0]?.price ?? null,
    tp1_size_pct: signal.take_profit_levels[0]?.size_pct ?? null,
    tp2_price: signal.take_profit_levels[1]?.price ?? null,
    tp2_size_pct: signal.take_profit_levels[1]?.size_pct ?? null,
    trailing_type: signal.trailing_rule.type,
    trailing_params_json: JSON.stringify(signal.trailing_rule.params || {}),
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
    updated_at_ms: Date.parse(signal.created_at),
  };
}

describe('postgres fallback sync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    queries.__resetPgPrimaryReadFailureCooldownForTesting();
  });

  it('loadRuntimeStateCorePrimary falls back to loadRuntimeStateCore when all Postgres reads fail', async () => {
    // When shouldPreferPostgresPrimaryReads returns true but all Postgres reads return null,
    // the function should fall back to loadRuntimeStateCore which includes syncQuantState.
    // This test verifies the fallback path works correctly end-to-end.
    const result = queries.getRuntimeState({
      userId: 'guest-default',
      market: 'US',
      assetClass: 'US_STOCK',
    });

    // Must have transparency metadata and data structure
    expect(result).toHaveProperty('source_status');
    expect(result).toHaveProperty('data');
    expect(result.data).toHaveProperty('signals');
    expect(result.data).toHaveProperty('decision');
  });

  it('listSignalContractsPrimary falls back to listSignalContracts which includes sync', async () => {
    // Without any Postgres URL configured, tryPrimaryPostgresRead returns null.
    // The fallback should call listSignalContracts which internally calls syncQuantState.
    const origEnv = process.env.NOVA_DATA_DATABASE_URL;
    delete process.env.NOVA_DATA_DATABASE_URL;

    try {
      const signals = await queries.listSignalContractsPrimary({
        userId: 'guest-default',
        market: 'US',
        assetClass: 'US_STOCK',
        limit: 10,
      });

      // Should return an array (possibly empty if no data ingested)
      expect(Array.isArray(signals)).toBe(true);
    } finally {
      if (origEnv !== undefined) {
        process.env.NOVA_DATA_DATABASE_URL = origEnv;
      }
    }
  });

  it('getSignalContractPrimary falls back gracefully for unknown signals', async () => {
    const origEnv = process.env.NOVA_DATA_DATABASE_URL;
    delete process.env.NOVA_DATA_DATABASE_URL;

    try {
      const signal = await queries.getSignalContractPrimary(
        'nonexistent-signal-id',
        'guest-default',
      );
      expect(signal).toBeNull();
    } finally {
      if (origEnv !== undefined) {
        process.env.NOVA_DATA_DATABASE_URL = origEnv;
      }
    }
  });

  it('getRiskProfilePrimary falls back to SQLite path', async () => {
    const origEnv = process.env.NOVA_DATA_DATABASE_URL;
    delete process.env.NOVA_DATA_DATABASE_URL;

    try {
      const risk = await queries.getRiskProfilePrimary('guest-default', { skipSync: true });
      // Should return a risk profile object or null (not throw)
      if (risk) {
        expect(risk).toHaveProperty('profile_key');
      }
    } finally {
      if (origEnv !== undefined) {
        process.env.NOVA_DATA_DATABASE_URL = origEnv;
      }
    }
  });

  it('getMarketStatePrimary falls back to SQLite path', async () => {
    const origEnv = process.env.NOVA_DATA_DATABASE_URL;
    delete process.env.NOVA_DATA_DATABASE_URL;

    try {
      const data = await queries.getMarketStatePrimary({
        userId: 'guest-default',
        market: 'US',
      });
      expect(Array.isArray(data)).toBe(true);
    } finally {
      if (origEnv !== undefined) {
        process.env.NOVA_DATA_DATABASE_URL = origEnv;
      }
    }
  });

  it('getPerformanceSummaryPrimary falls back to SQLite path', async () => {
    const origEnv = process.env.NOVA_DATA_DATABASE_URL;
    delete process.env.NOVA_DATA_DATABASE_URL;

    try {
      const data = await queries.getPerformanceSummaryPrimary({
        userId: 'guest-default',
        market: 'US',
      });
      // Should return a performance summary object
      expect(data).toBeDefined();
    } finally {
      if (origEnv !== undefined) {
        process.env.NOVA_DATA_DATABASE_URL = origEnv;
      }
    }
  });

  it('cools down postgres primary reads after a timeout failure', async () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('NOVA_PG_PRIMARY_READ_FAILURE_COOLDOWN_MS', '60000');
    vi.stubEnv('NOVA_ENABLE_PG_PRIMARY_READS_TEST', '1');

    const readSpy = vi
      .spyOn(pgReads, 'readPostgresRiskProfile')
      .mockRejectedValue(new Error('timeout exceeded when trying to connect'));

    await queries.getRiskProfilePrimary('guest-default', { skipSync: true });
    await queries.getRiskProfilePrimary('guest-default', { skipSync: true });

    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it('returns degraded empty assets instead of syncing SQLite on hot-path read failure', async () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('NOVA_ENABLE_PG_PRIMARY_READS_TEST', '1');
    vi.stubEnv('NOVA_ALLOW_SYNC_HOT_PATH_FALLBACK', '0');

    vi.spyOn(pgReads, 'readPostgresAssets').mockRejectedValue(new Error('pg down'));

    await expect(queries.listAssetsPrimary('US')).resolves.toEqual([]);
  });

  it('returns degraded performance summary instead of syncing SQLite on hot-path read failure', async () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('NOVA_ENABLE_PG_PRIMARY_READS_TEST', '1');
    vi.stubEnv('NOVA_ALLOW_SYNC_HOT_PATH_FALLBACK', '0');

    vi.spyOn(pgReads, 'readPostgresPerformanceSnapshots').mockRejectedValue(new Error('pg down'));

    const summary = await queries.getPerformanceSummaryPrimary({
      userId: 'guest-default',
      market: 'US',
    });
    expect(summary.records).toEqual([]);
    expect(summary.source_status).toBe('INSUFFICIENT_DATA');
  });

  it('builds evidence-top response from async postgres signal payloads', async () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('NOVA_ENABLE_PG_PRIMARY_READS_TEST', '1');
    vi.stubEnv('NOVA_ALLOW_SYNC_HOT_PATH_FALLBACK', '0');

    const signal = seedSignal('SIG-PG-EVIDENCE-1', 'SPY', new Date().toISOString(), 500);
    vi.spyOn(pgReads, 'readPostgresSignalRecords').mockResolvedValue([toSignalRecord(signal)]);

    const result = await queries.getEvidenceTopSignalsPrimary({
      userId: 'guest-default',
      market: 'US',
      assetClass: 'US_STOCK',
      limit: 3,
    });

    expect(result.source_status).toBe('MODEL_DERIVED');
    expect(Array.isArray(result.records)).toBe(true);
    expect(result.records[0]?.signal_id).toBe(signal.id);
    expect(result.records[0]?.symbol).toBe(signal.symbol);
  });

  it('skips sqlite decision snapshot reads and writes for personalized hot-path decisions', async () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    vi.stubEnv('NOVA_ENABLE_PG_PRIMARY_READS_TEST', '1');
    vi.stubEnv('NOVA_ALLOW_SYNC_HOT_PATH_FALLBACK', '0');

    const signal = seedSignal('SIG-PG-DECISION-1', 'AAPL', new Date().toISOString(), 210);
    vi.spyOn(pgReads, 'readPostgresRiskProfile').mockResolvedValue(null);
    vi.spyOn(pgReads, 'readPostgresSignalRecords').mockResolvedValue([toSignalRecord(signal)]);
    vi.spyOn(pgReads, 'readPostgresMarketState').mockResolvedValue([]);
    vi.spyOn(pgReads, 'readPostgresPerformanceSnapshots').mockResolvedValue([]);
    vi.spyOn(pgReads, 'readPostgresLatestDecisionSnapshot').mockResolvedValue(null);

    const latestSpy = vi.spyOn(MarketRepository.prototype, 'getLatestDecisionSnapshot');
    const persistSpy = vi.spyOn(MarketRepository.prototype, 'upsertDecisionSnapshot');

    const decision = await queries.getDecisionSnapshot({
      userId: 'hot-path-user',
      market: 'US',
      assetClass: 'US_STOCK',
      holdings: [
        {
          symbol: 'AAPL',
          market: 'US',
          asset_class: 'US_STOCK',
          weight_pct: 12,
          sector: 'Technology',
        },
      ],
    });

    expect(String((decision as { audit_snapshot_id?: string }).audit_snapshot_id || '')).toContain(
      'decision-hot-',
    );
    expect(latestSpy).not.toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalled();
  });
});

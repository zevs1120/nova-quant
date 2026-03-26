import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { getTopSignalEvidence, runEvidenceEngine } from '../src/server/evidence/engine.js';
import type { NormalizedBar, SignalContract } from '../src/server/types.js';

function buildBars(
  startTs: number,
  count: number,
  stepMs: number,
  startPrice: number,
): NormalizedBar[] {
  const rows: NormalizedBar[] = [];
  let px = startPrice;
  for (let i = 0; i < count; i += 1) {
    const open = px;
    const drift = 0.35 + (i % 3) * 0.05;
    const close = open + drift;
    const high = close + 0.4;
    const low = open - 0.35;
    rows.push({
      ts_open: startTs + i * stepMs,
      open: open.toFixed(4),
      high: high.toFixed(4),
      low: low.toFixed(4),
      close: close.toFixed(4),
      volume: String(2000 + i * 10),
    });
    px = close;
  }
  return rows;
}

function buildSignal(args: {
  id: string;
  symbol: string;
  market: 'US' | 'CRYPTO';
  createdAt: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  timeframe: string;
  strategy: string;
  status?: SignalContract['status'];
}): SignalContract {
  return {
    id: args.id,
    created_at: args.createdAt,
    expires_at: new Date(Date.parse(args.createdAt) + 5 * 24 * 3600_000).toISOString(),
    asset_class: args.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK',
    market: args.market,
    symbol: args.symbol,
    timeframe: args.timeframe,
    strategy_id: args.strategy,
    strategy_family: 'Momentum / Trend Following',
    strategy_version: 'runtime-bars-rules.v1',
    regime_id: 'TREND',
    temperature_percentile: 58,
    volatility_percentile: 43,
    direction: args.direction,
    strength: 72,
    confidence: 0.68,
    entry_zone: {
      low: args.entry - 0.4,
      high: args.entry + 0.4,
      method: 'LIMIT',
      notes: 'test',
    },
    invalidation_level: args.entry - (args.direction === 'LONG' ? 1.1 : -1.1),
    stop_loss: {
      type: 'ATR',
      price: args.entry - (args.direction === 'LONG' ? 1.1 : -1.1),
      rationale: 'test',
    },
    take_profit_levels: [
      {
        price: args.entry + (args.direction === 'LONG' ? 1.8 : -1.8),
        size_pct: 0.6,
        rationale: 'tp1',
      },
    ],
    trailing_rule: {
      type: 'EMA',
      params: { fast: 10, slow: 30 },
    },
    position_advice: {
      position_pct: 8,
      leverage_cap: 1.5,
      risk_bucket_applied: 'BASE',
      rationale: 'test',
    },
    cost_model: {
      fee_bps: 1.2,
      spread_bps: 1.1,
      slippage_bps: 2.3,
      funding_est_bps: args.market === 'CRYPTO' ? 0.8 : undefined,
      basis_est: 0,
    },
    expected_metrics: {
      expected_R: 1.4,
      hit_rate_est: 0.57,
      sample_size: 30,
      expected_max_dd_est: 0.08,
    },
    explain_bullets: ['Test thesis'],
    execution_checklist: ['test'],
    tags: ['status:MODEL_DERIVED', 'source:DB_BACKED'],
    status: args.status || 'NEW',
    payload: {
      kind: 'STOCK_SWING',
      data: {
        horizon: 'MEDIUM',
        catalysts: ['test'],
      },
    },
    references: {
      docs_url: 'docs/RUNTIME_DATA_LINEAGE.md',
    },
    score: 78,
    payload_version: 'signal-contract.v1',
  };
}

describe('evidence engine canonical chain', () => {
  it('builds dataset/version/run/snapshot/reconciliation chain without synthetic fallback', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();
    const start = now - 140 * 24 * 3600_000;

    const aapl = repo.upsertAsset({
      symbol: 'AAPL',
      market: 'US',
      venue: 'STOOQ',
    });
    const msft = repo.upsertAsset({
      symbol: 'MSFT',
      market: 'US',
      venue: 'STOOQ',
    });
    repo.upsertOhlcvBars(aapl.asset_id, '1d', buildBars(start, 140, 24 * 3600_000, 180), 'TEST');
    repo.upsertOhlcvBars(msft.asset_id, '1d', buildBars(start, 140, 24 * 3600_000, 320), 'TEST');

    const signalIds: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const symbol = i % 2 === 0 ? 'AAPL' : 'MSFT';
      const barIndex = 90 + i;
      const entry = symbol === 'AAPL' ? 180 + barIndex * 0.45 : 320 + barIndex * 0.45;
      const signal = buildSignal({
        id: `SIG-EVD-${i + 1}`,
        symbol,
        market: 'US',
        createdAt: new Date(start + barIndex * 24 * 3600_000).toISOString(),
        direction: i % 3 === 0 ? 'SHORT' : 'LONG',
        entry,
        timeframe: '1d',
        strategy: i % 2 === 0 ? 'EQ_TREND_A' : 'EQ_TREND_B',
      });
      signalIds.push(signal.id);
      repo.upsertSignal(signal);
    }

    repo.upsertExecution({
      execution_id: 'EXE-EVD-OPEN-1',
      signal_id: signalIds[0],
      user_id: 'u-evidence',
      mode: 'PAPER',
      action: 'EXECUTE',
      market: 'US',
      symbol: 'AAPL',
      entry_price: 222,
      stop_price: 220,
      tp_price: 226,
      size_pct: 8,
      pnl_pct: null,
      note: 'open',
      created_at_ms: now - 2 * 24 * 3600_000,
      updated_at_ms: now - 2 * 24 * 3600_000,
    });
    repo.upsertExecution({
      execution_id: 'EXE-EVD-CLOSE-1',
      signal_id: signalIds[0],
      user_id: 'u-evidence',
      mode: 'PAPER',
      action: 'DONE',
      market: 'US',
      symbol: 'AAPL',
      entry_price: 222,
      stop_price: 220,
      tp_price: 226,
      size_pct: 8,
      pnl_pct: 1.7,
      note: 'close',
      created_at_ms: now - 1 * 24 * 3600_000,
      updated_at_ms: now - 1 * 24 * 3600_000,
    });

    const out = runEvidenceEngine(repo, {
      userId: 'u-evidence',
      market: 'US',
      assetClass: 'US_STOCK',
      timeframe: '1d',
      maxSignals: 30,
    });

    expect(out.run_id).toBeTruthy();
    expect(out.dataset_version_id).toBeTruthy();
    expect(out.universe_version_id).toBeTruthy();
    expect(out.execution_profile_id).toBe('exec-replay-baseline-v1');

    const run = repo.getBacktestRun(out.run_id);
    expect(run?.run_type).toBe('portfolio_replay');
    expect(['SUCCESS', 'WITHHELD']).toContain(String(run?.status));

    const metric = repo.getBacktestMetric(out.run_id);
    expect(metric).toBeTruthy();
    expect(metric?.sample_size).toBeGreaterThanOrEqual(0);

    const snapshots = repo.listSignalSnapshots({ runId: out.run_id });
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0].dataset_version_id).toBe(out.dataset_version_id);
    expect(snapshots[0].evidence_status).not.toBe('EXPERIMENTAL');

    const artifacts = repo.listBacktestArtifacts(out.run_id);
    const equity = artifacts.find((row) => row.artifact_type === 'equity_curve');
    expect(equity).toBeTruthy();
    const parsedEquity = JSON.parse(String(equity?.path_or_payload || '{}'));
    expect(parsedEquity.source_status).toBe('DB_BACKED');
    expect(parsedEquity).not.toHaveProperty('synthetic');

    const reconciliations = repo.listReconciliationRows({ replayRunId: out.run_id });
    expect(reconciliations.length).toBeGreaterThan(0);
    expect(reconciliations.some((row) => row.status === 'RECONCILED')).toBe(true);
    expect(reconciliations.some((row) => row.status === 'PAPER_DATA_UNAVAILABLE')).toBe(true);
  });

  it('falls back to current runtime signals when replay evidence has not been generated yet', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();

    repo.upsertSignal(
      buildSignal({
        id: 'SIG-EVD-FALLBACK-1',
        symbol: 'AAPL',
        market: 'US',
        createdAt: new Date(now - 45 * 60_000).toISOString(),
        direction: 'LONG',
        entry: 214,
        timeframe: '1d',
        strategy: 'EQ_TREND_FALLBACK',
      }),
    );

    const out = getTopSignalEvidence(repo, {
      userId: 'u-evidence-fallback',
      market: 'US',
      assetClass: 'US_STOCK',
      limit: 3,
    });

    expect(out.source_status).toBe('MODEL_DERIVED');
    expect(out.data_status).toBe('MODEL_DERIVED');
    expect(out.supporting_run_id).toBeNull();
    expect(out.records.length).toBeGreaterThan(0);
    expect(out.records[0].signal_id).toBe('SIG-EVD-FALLBACK-1');
    expect(out.records[0].reconciliation_status).toBe('REPLAY_DATA_UNAVAILABLE');
    expect(out.records[0].replay_paper_evidence_available).toBe(false);
    expect(out.records[0].source_transparency?.evidence_mode).toBe('RUNTIME_SIGNAL_FALLBACK');
  });

  it('excludes expired runtime signals from replay-missing fallback evidence ranking', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();

    repo.upsertSignal(
      buildSignal({
        id: 'SIG-EVD-EXPIRED',
        symbol: 'AAPL',
        market: 'US',
        createdAt: new Date(now - 10 * 60_000).toISOString(),
        direction: 'LONG',
        entry: 214,
        timeframe: '1d',
        strategy: 'EQ_TREND_FALLBACK',
        status: 'EXPIRED',
      }),
    );

    repo.upsertSignal(
      buildSignal({
        id: 'SIG-EVD-LIVE',
        symbol: 'MSFT',
        market: 'US',
        createdAt: new Date(now - 60 * 60_000).toISOString(),
        direction: 'LONG',
        entry: 320,
        timeframe: '1d',
        strategy: 'EQ_TREND_FALLBACK',
      }),
    );

    const out = getTopSignalEvidence(repo, {
      userId: 'u-evidence-filter',
      market: 'US',
      assetClass: 'US_STOCK',
      limit: 3,
    });

    expect(out.records.map((row) => row.signal_id)).toEqual(['SIG-EVD-LIVE']);
  });
});

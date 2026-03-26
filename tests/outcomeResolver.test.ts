import { describe, expect, it, vi } from 'vitest';
import {
  resolveOutcomesForDate,
  resolveRecentOutcomes,
  getOutcomeSummaryStats,
} from '../src/server/outcome/resolver.js';
import type { MarketRepository } from '../src/server/db/repository.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo(overrides: Partial<Record<string, unknown>> = {}): MarketRepository {
  return {
    listDecisionSnapshots: vi.fn().mockReturnValue([]),
    getAssetBySymbol: vi.fn().mockReturnValue(null),
    getOhlcv: vi.fn().mockReturnValue([]),
    upsertOutcomeReview: vi.fn(),
    listOutcomeReviews: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as MarketRepository;
}

function makeSnapshot(date: string, actionsJson: string) {
  return {
    id: `snap-${date}`,
    user_id: 'test-user',
    market: 'US' as const,
    asset_class: 'US_STOCK' as const,
    snapshot_date: date,
    context_hash: 'hash-1',
    evidence_mode: 'DB_BACKED',
    performance_mode: 'DB_BACKED',
    source_status: 'DB_BACKED',
    data_status: 'DB_BACKED',
    risk_state_json: '{}',
    portfolio_context_json: '{}',
    actions_json: actionsJson,
    summary_json: '{}',
    top_action_id: null,
    created_at_ms: Date.now(),
    updated_at_ms: Date.now(),
  };
}

const AAPL_ACTIONS = JSON.stringify([
  {
    action_id: 'act-1',
    symbol: 'AAPL',
    market: 'US',
    asset_class: 'US_STOCK',
    direction: 'LONG',
    confidence: 0.82,
    action: 'buy',
    entry_zone: { low: 198.4, high: 199.2 },
  },
]);

const MULTI_ACTIONS = JSON.stringify([
  {
    action_id: 'act-a',
    symbol: 'AAPL',
    market: 'US',
    asset_class: 'US_STOCK',
    direction: 'LONG',
    confidence: 0.8,
    action: 'buy',
    entry_zone: null,
  },
  {
    action_id: 'act-b',
    symbol: 'TSLA',
    market: 'US',
    asset_class: 'US_STOCK',
    direction: 'SHORT',
    confidence: 0.7,
    action: 'sell',
    entry_zone: null,
  },
]);

const NO_ACTION_JSON = JSON.stringify([
  {
    action_id: 'act-wait',
    symbol: null,
    action: 'no_action',
    direction: 'LONG',
    confidence: 0,
  },
]);

/**
 * Helper that produces a mock getOhlcv returning N trading bars.
 * The new resolver queries ALL forward bars in a single call
 * using `start + limit`, so the mock must return an array of bars.
 */
function mockOhlcvBars(bars: Array<{ close: string }>): () => typeof bars {
  return vi.fn().mockReturnValue(bars);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('outcome resolver', () => {
  it('returns empty when no decision snapshots exist for the date', () => {
    const repo = makeRepo();
    const result = resolveOutcomesForDate(repo, '2026-03-20', 'test-user');
    expect(result).toEqual([]);
  });

  it('returns PENDING when no asset found for the symbol', () => {
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', AAPL_ACTIONS)]),
    });

    const result = resolveOutcomesForDate(repo, '2026-03-20', 'test-user');

    expect(result).toHaveLength(1);
    expect(result[0].verdict).toBe('PENDING');
    expect(result[0].symbol).toBe('AAPL');
    expect(result[0].forward_returns).toHaveLength(3);
    expect(result[0].forward_returns.every((r) => r.close === null)).toBe(true);
  });

  it('classifies HIT when LONG price increases by >0.3% (trading-bar semantics)', () => {
    // allBars: [base, T+1, T+2, T+3, T+4, T+5]
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', AAPL_ACTIONS)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 1, symbol: 'AAPL', market: 'US' }),
      getOhlcv: mockOhlcvBars([
        { close: '200.00' }, // index 0: base
        { close: '201.00' }, // index 1: T+1 (+0.5%)
        { close: '202.00' }, // index 2 (not in HORIZONS)
        { close: '203.00' }, // index 3: T+3 (+1.5%)
        { close: '204.00' }, // index 4 (not in HORIZONS)
        { close: '205.00' }, // index 5: T+5 (+2.5%)
      ]),
    });

    const result = resolveOutcomesForDate(repo, '2026-03-20', 'test-user');

    expect(result).toHaveLength(1);
    expect(result[0].verdict).toBe('HIT');
    expect(result[0].verdict_return_pct).toBeCloseTo(0.015, 4); // T+3
    expect(result[0].forward_returns[0].return_pct).toBeCloseTo(0.005, 4); // T+1
    expect(result[0].forward_returns[1].return_pct).toBeCloseTo(0.015, 4); // T+3
    expect(result[0].forward_returns[2].return_pct).toBeCloseTo(0.025, 4); // T+5
  });

  it('classifies MISS when LONG price decreases by >0.3%', () => {
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', AAPL_ACTIONS)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 1, symbol: 'AAPL', market: 'US' }),
      getOhlcv: mockOhlcvBars([
        { close: '200.00' }, // base
        { close: '199.00' }, // T+1: -0.5%
        { close: '198.00' }, // T+2
        { close: '196.00' }, // T+3: -2.0%
        { close: '195.00' }, // T+4
        { close: '194.00' }, // T+5: -3.0%
      ]),
    });

    const result = resolveOutcomesForDate(repo, '2026-03-20', 'test-user');

    expect(result).toHaveLength(1);
    expect(result[0].verdict).toBe('MISS');
    expect(result[0].verdict_return_pct).toBeCloseTo(-0.02, 4);
  });

  it('classifies INCONCLUSIVE when return is within ±0.3%', () => {
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', AAPL_ACTIONS)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 1, symbol: 'AAPL', market: 'US' }),
      getOhlcv: mockOhlcvBars([
        { close: '200.00' }, // base
        { close: '200.20' }, // T+1: +0.1%
        { close: '200.15' }, // T+2
        { close: '200.10' }, // T+3: +0.05% → INCONCLUSIVE
        { close: '200.20' }, // T+4
        { close: '200.30' }, // T+5: +0.15%
      ]),
    });

    const result = resolveOutcomesForDate(repo, '2026-03-20', 'test-user');

    expect(result).toHaveLength(1);
    expect(result[0].verdict).toBe('INCONCLUSIVE');
  });

  it('inverts return for SHORT direction', () => {
    const shortActions = JSON.stringify([
      {
        action_id: 'act-short',
        symbol: 'NVDA',
        market: 'US',
        asset_class: 'US_STOCK',
        direction: 'SHORT',
        confidence: 0.75,
        action: 'sell',
        entry_zone: null,
      },
    ]);

    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', shortActions)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 2, symbol: 'NVDA', market: 'US' }),
      getOhlcv: mockOhlcvBars([
        { close: '100.00' }, // base
        { close: '98.00' }, // T+1: raw −2%, SHORT → +2%
        { close: '97.50' }, // T+2
        { close: '97.00' }, // T+3: raw −3%, SHORT → +3%
        { close: '96.50' }, // T+4
        { close: '96.00' }, // T+5: raw −4%, SHORT → +4%
      ]),
    });

    const result = resolveOutcomesForDate(repo, '2026-03-20', 'test-user');

    expect(result).toHaveLength(1);
    expect(result[0].verdict).toBe('HIT');
    expect(result[0].verdict_return_pct).toBeCloseTo(0.03, 4); // inverted
  });

  it('skips no_action and wait actions', () => {
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', NO_ACTION_JSON)]),
    });

    const result = resolveOutcomesForDate(repo, '2026-03-20', 'test-user');
    expect(result).toHaveLength(0);
  });

  it('handles multiple actions per snapshot', () => {
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', MULTI_ACTIONS)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 1, symbol: 'ANY', market: 'US' }),
      getOhlcv: mockOhlcvBars([
        { close: '100.00' }, // base
        { close: '101.00' }, // T+1
        { close: '101.50' }, // T+2
        { close: '102.00' }, // T+3
        { close: '102.50' }, // T+4
        { close: '103.00' }, // T+5
      ]),
    });

    const result = resolveOutcomesForDate(repo, '2026-03-20', 'test-user');
    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe('AAPL');
    expect(result[1].symbol).toBe('TSLA');
  });

  it('persists outcome reviews via upsert', () => {
    const upsertFn = vi.fn();
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', AAPL_ACTIONS)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 1, symbol: 'AAPL', market: 'US' }),
      getOhlcv: mockOhlcvBars([{ close: '200.00' }]), // base only, no forward bars
      upsertOutcomeReview: upsertFn,
    });

    resolveOutcomesForDate(repo, '2026-03-20', 'test-user');

    expect(upsertFn).toHaveBeenCalledTimes(1);
    const review = upsertFn.mock.calls[0][0];
    expect(review.id).toContain('outcome-');
    expect(review.decision_snapshot_id).toBe('snap-2026-03-20');
  });

  it('uses single OHLCV query per asset (trading-bar approach, not per-day)', () => {
    const ohlcvFn = vi
      .fn()
      .mockReturnValue([
        { close: '100.00' },
        { close: '101.00' },
        { close: '102.00' },
        { close: '103.00' },
        { close: '104.00' },
        { close: '105.00' },
      ]);
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', AAPL_ACTIONS)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 1, symbol: 'AAPL', market: 'US' }),
      getOhlcv: ohlcvFn,
    });

    resolveOutcomesForDate(repo, '2026-03-20', 'test-user');

    // Should make exactly 1 call to getOhlcv (not 4 as before)
    expect(ohlcvFn).toHaveBeenCalledTimes(1);
    // With limit = MAX_HORIZON + 1 = 6
    expect(ohlcvFn.mock.calls[0][0].limit).toBe(6);
    // No 'end' parameter — queries all bars from start
    expect(ohlcvFn.mock.calls[0][0].end).toBeUndefined();
  });

  it('returns PENDING when not enough bars for T+3 verdict', () => {
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', AAPL_ACTIONS)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 1, symbol: 'AAPL', market: 'US' }),
      getOhlcv: mockOhlcvBars([
        { close: '200.00' }, // base
        { close: '201.00' }, // T+1 exists
        // No T+2, T+3, T+4, T+5 bars → PENDING
      ]),
    });

    const result = resolveOutcomesForDate(repo, '2026-03-20', 'test-user');

    expect(result).toHaveLength(1);
    expect(result[0].verdict).toBe('PENDING'); // T+3 bar missing
    expect(result[0].forward_returns[0].return_pct).toBeCloseTo(0.005, 4); // T+1 resolved
    expect(result[0].forward_returns[1].return_pct).toBeNull(); // T+3 missing
    expect(result[0].forward_returns[2].return_pct).toBeNull(); // T+5 missing
  });

  it('handles FAILURE review_kind for MISS verdicts', () => {
    const upsertFn = vi.fn();
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', AAPL_ACTIONS)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 1, symbol: 'AAPL', market: 'US' }),
      getOhlcv: mockOhlcvBars([
        { close: '200.00' }, // base
        { close: '195.00' }, // T+1
        { close: '192.00' }, // T+2
        { close: '190.00' }, // T+3: −5%
        { close: '189.00' }, // T+4
        { close: '188.00' }, // T+5
      ]),
      upsertOutcomeReview: upsertFn,
    });

    resolveOutcomesForDate(repo, '2026-03-20', 'test-user');
    expect(upsertFn.mock.calls[0][0].review_kind).toBe('FAILURE');
  });

  it('persists snapshot_date in payload (not resolved_at as snapshot_date)', () => {
    const upsertFn = vi.fn();
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', AAPL_ACTIONS)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 1, symbol: 'AAPL', market: 'US' }),
      getOhlcv: mockOhlcvBars([{ close: '200.00' }]),
      upsertOutcomeReview: upsertFn,
    });

    resolveOutcomesForDate(repo, '2026-03-20', 'test-user');

    const payload = JSON.parse(upsertFn.mock.calls[0][0].payload_json);
    expect(payload.snapshot_date).toBe('2026-03-20');
    expect(payload.resolved_at).toBeDefined();
    // snapshot_date and resolved_at should be different values
    expect(payload.snapshot_date).not.toBe(payload.resolved_at);
  });
});

describe('resolveRecentOutcomes', () => {
  it('resolves multiple dates in batch', () => {
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([]),
    });

    const result = resolveRecentOutcomes(repo, 'test-user', 5);

    expect(result.dates).toHaveLength(5);
    expect(result.resolved).toBe(0);
  });
});

describe('getOutcomeSummaryStats', () => {
  it('computes aggregate stats from outcome reviews', () => {
    const repo = makeRepo({
      listOutcomeReviews: vi.fn().mockReturnValue([
        {
          id: 'r1',
          user_id: 'test-user',
          market: 'US',
          asset_class: 'US_STOCK',
          decision_snapshot_id: 'snap-1',
          action_id: 'act-1',
          review_kind: 'OUTCOME',
          score: 0.015,
          verdict: 'HIT',
          summary: 'AAPL LONG T+3: +1.5%',
          payload_json: JSON.stringify({
            symbol: 'AAPL',
            direction: 'LONG',
            conviction: 0.8,
            forward_returns: [
              { horizon: 1, close: 201, return_pct: 0.005 },
              { horizon: 3, close: 203, return_pct: 0.015 },
              { horizon: 5, close: 205, return_pct: 0.025 },
            ],
            verdict_horizon: 3,
            snapshot_date: '2026-03-15',
          }),
          created_at_ms: Date.now(),
          updated_at_ms: Date.now(),
        },
        {
          id: 'r2',
          user_id: 'test-user',
          market: 'US',
          asset_class: 'US_STOCK',
          decision_snapshot_id: 'snap-2',
          action_id: 'act-2',
          review_kind: 'FAILURE',
          score: -0.02,
          verdict: 'MISS',
          summary: 'TSLA LONG T+3: -2.0%',
          payload_json: JSON.stringify({
            symbol: 'TSLA',
            direction: 'LONG',
            conviction: 0.7,
            forward_returns: [
              { horizon: 1, close: 98, return_pct: -0.01 },
              { horizon: 3, close: 96, return_pct: -0.02 },
              { horizon: 5, close: 94, return_pct: -0.03 },
            ],
            verdict_horizon: 3,
            snapshot_date: '2026-03-14',
          }),
          created_at_ms: Date.now(),
          updated_at_ms: Date.now(),
        },
      ]),
    });

    const { outcomes, stats } = getOutcomeSummaryStats(repo, 'test-user');

    expect(outcomes).toHaveLength(2);
    expect(stats.total).toBe(2);
    expect(stats.resolved).toBe(2);
    expect(stats.hit).toBe(1);
    expect(stats.miss).toBe(1);
    expect(stats.hit_rate).toBeCloseTo(0.5, 4);
    expect(stats.avg_return_t1).toBeCloseTo(-0.0025, 4);
    expect(stats.avg_return_t3).toBeCloseTo(-0.0025, 4);
  });

  it('reads snapshot_date correctly (not resolved_at)', () => {
    const repo = makeRepo({
      listOutcomeReviews: vi.fn().mockReturnValue([
        {
          id: 'r1',
          user_id: 'test-user',
          market: 'US',
          asset_class: 'US_STOCK',
          decision_snapshot_id: 'snap-1',
          action_id: 'act-1',
          review_kind: 'OUTCOME',
          score: 0.01,
          verdict: 'HIT',
          summary: 'AAPL LONG T+3: +1.0%',
          payload_json: JSON.stringify({
            symbol: 'AAPL',
            direction: 'LONG',
            snapshot_date: '2026-03-15',
            resolved_at: '2026-03-22T08:00:00Z',
            forward_returns: [],
          }),
          created_at_ms: Date.now(),
          updated_at_ms: Date.now(),
        },
      ]),
    });

    const { outcomes } = getOutcomeSummaryStats(repo, 'test-user');
    // Should show 2026-03-15 (decision date), NOT 2026-03-22 (resolution date)
    expect(outcomes[0].snapshot_date).toBe('2026-03-15');
  });

  it('returns null rates when no outcomes exist', () => {
    const repo = makeRepo();
    const { outcomes, stats } = getOutcomeSummaryStats(repo, 'test-user');

    expect(outcomes).toHaveLength(0);
    expect(stats.total).toBe(0);
    expect(stats.hit_rate).toBeNull();
    expect(stats.avg_return_t1).toBeNull();
  });

  it('handles malformed payload_json gracefully', () => {
    const repo = makeRepo({
      listOutcomeReviews: vi.fn().mockReturnValue([
        {
          id: 'r-bad',
          user_id: 'test-user',
          market: 'US',
          asset_class: 'US_STOCK',
          decision_snapshot_id: 'snap-bad',
          action_id: 'act-bad',
          review_kind: 'OUTCOME',
          score: null,
          verdict: 'PENDING',
          summary: 'Bad data',
          payload_json: '{invalid json',
          created_at_ms: Date.now(),
          updated_at_ms: Date.now(),
        },
      ]),
    });

    const { outcomes, stats } = getOutcomeSummaryStats(repo, 'test-user');

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].forward_returns).toEqual([]);
    expect(stats.pending).toBe(1);
  });

  it('is idempotent: running twice produces the same upsert ID', () => {
    const upsertFn = vi.fn();
    const repo = makeRepo({
      listDecisionSnapshots: vi.fn().mockReturnValue([makeSnapshot('2026-03-20', AAPL_ACTIONS)]),
      getAssetBySymbol: vi.fn().mockReturnValue({ asset_id: 1, symbol: 'AAPL', market: 'US' }),
      getOhlcv: mockOhlcvBars([{ close: '200.00' }]),
      upsertOutcomeReview: upsertFn,
    });

    resolveOutcomesForDate(repo, '2026-03-20', 'test-user');
    resolveOutcomesForDate(repo, '2026-03-20', 'test-user');

    expect(upsertFn).toHaveBeenCalledTimes(2);
    // Same ID for both calls — upsert should be idempotent
    expect(upsertFn.mock.calls[0][0].id).toBe(upsertFn.mock.calls[1][0].id);
  });
});

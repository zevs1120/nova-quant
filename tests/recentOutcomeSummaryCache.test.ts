import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeRepo, resetRuntimeRepoSingleton } from '../src/server/db/runtimeRepository.js';
import {
  __resetFrontendReadCacheForTesting,
  getRecentOutcomeSummary,
  invalidateFrontendReadCacheForUser,
  resetRepoSingleton,
} from '../src/server/api/queries.js';

describe('recent outcome summary cache', () => {
  beforeEach(() => {
    resetRepoSingleton();
    __resetFrontendReadCacheForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRepoSingleton();
    resetRuntimeRepoSingleton();
    __resetFrontendReadCacheForTesting();
  });

  it('reuses cached summaries and invalidates them after writes', async () => {
    const repo = getRuntimeRepo();
    const userId = `outcome-cache-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const decisionSnapshotId = `snapshot-${userId}`;

    repo.upsertDecisionSnapshot({
      id: decisionSnapshotId,
      user_id: userId,
      market: 'US',
      asset_class: 'US_STOCK',
      snapshot_date: '2026-04-01',
      context_hash: `ctx-${userId}`,
      evidence_mode: 'BACKTEST',
      performance_mode: 'BACKTEST',
      source_status: 'BACKTEST_ONLY',
      data_status: 'BACKTEST_ONLY',
      risk_state_json: JSON.stringify({}),
      portfolio_context_json: JSON.stringify({}),
      actions_json: JSON.stringify([]),
      summary_json: JSON.stringify({}),
      top_action_id: null,
      created_at_ms: now,
      updated_at_ms: now,
    });

    repo.upsertOutcomeReview({
      id: `review-${userId}`,
      user_id: userId,
      market: 'US',
      asset_class: 'US_STOCK',
      decision_snapshot_id: decisionSnapshotId,
      action_id: 'action-1',
      review_kind: 'OUTCOME',
      score: 0.01,
      verdict: 'HIT',
      summary: 'AAPL LONG T+3: +1.0%',
      payload_json: JSON.stringify({
        symbol: 'AAPL',
        direction: 'LONG',
        conviction: 0.8,
        snapshot_date: '2026-04-01',
        verdict_horizon: 3,
        forward_returns: [
          { horizon: 1, close: 201, return_pct: 0.005 },
          { horizon: 3, close: 203, return_pct: 0.01 },
        ],
      }),
      created_at_ms: now,
      updated_at_ms: now,
    });

    const listSpy = vi.spyOn(repo, 'listOutcomeReviews');

    const first = await getRecentOutcomeSummary({ userId, limit: 50 });
    const second = await getRecentOutcomeSummary({ userId, limit: 50 });

    expect(first.outcomes).toHaveLength(1);
    expect(second.outcomes).toHaveLength(1);
    expect(listSpy).toHaveBeenCalledTimes(1);

    invalidateFrontendReadCacheForUser(userId);
    await getRecentOutcomeSummary({ userId, limit: 50 });

    expect(listSpy).toHaveBeenCalledTimes(2);
  });
});

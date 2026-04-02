// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEngagement } from '../../src/hooks/useEngagement.js';

const now = new Date('2024-06-15T10:00:00.000Z');

function buildArgs(overrides: Record<string, unknown> = {}) {
  const setDisciplineLog = vi.fn();
  const setExecutions = vi.fn();
  const setRefreshNonce = vi.fn();
  const fetchJson = vi.fn();
  return {
    fetchJson,
    effectiveUserId: 'u1',
    market: 'US',
    assetClass: 'US_STOCK',
    lang: 'en',
    effectiveHoldings: [],
    isDemoRuntime: false,
    hasLoaded: true,
    decisionSnapshot: { audit_snapshot_id: 'a1' },
    setRefreshNonce,
    now,
    disciplineLog: { checkins: [], boundary_kept: [], weekly_reviews: [] },
    setDisciplineLog,
    executions: [],
    setExecutions,
    ...overrides,
  };
}

describe('useEngagement', () => {
  it('uses demo manual state when isDemoRuntime', async () => {
    const fetchJson = vi.fn();
    const { result } = renderHook(() =>
      useEngagement(
        buildArgs({
          isDemoRuntime: true,
          fetchJson,
        }),
      ),
    );
    await waitFor(() => expect(result.current.manualState?.mode).toBe('DEMO'));
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('computes local discipline streaks from log', () => {
    const localNow = new Date(2024, 5, 15, 12, 0, 0);
    const todayKey = '2024-06-15';
    const weekStart = '2024-06-10';
    const { result } = renderHook(() =>
      useEngagement(
        buildArgs({
          isDemoRuntime: true,
          disciplineLog: {
            checkins: [todayKey, '2024-06-14'],
            boundary_kept: [todayKey],
            weekly_reviews: [weekStart],
          },
          now: localNow,
        }),
      ),
    );
    expect(result.current.discipline.checkinStreak).toBeGreaterThanOrEqual(1);
    expect(result.current.discipline.checkedToday).toBe(true);
  });

  it('markDailyCheckin posts to API when not demo', async () => {
    const fetchJson = vi.fn().mockResolvedValue({ habit_state: { checkedToday: true } });
    const { result } = renderHook(() => useEngagement(buildArgs({ fetchJson })));
    await waitFor(() => expect(fetchJson).toHaveBeenCalled());
    await act(async () => {
      await result.current.markDailyCheckin();
    });
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/engagement/morning-check',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('recordExecution appends in demo runtime', async () => {
    const setExecutions = vi.fn();
    const { result } = renderHook(() =>
      useEngagement(
        buildArgs({
          isDemoRuntime: true,
          setExecutions,
        }),
      ),
    );
    await act(async () => {
      await result.current.recordExecution({
        signal: {
          signal_id: 's1',
          market: 'US',
          symbol: 'SPY',
          direction: 'LONG',
          entry_zone: { low: 400, high: 402 },
          take_profit_levels: [{ price: 410 }],
          quick_pnl_pct: 0.5,
        },
        mode: 'PAPER',
        action: 'DONE',
      });
    });
    expect(setExecutions).toHaveBeenCalled();
  });
});

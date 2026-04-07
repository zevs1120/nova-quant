import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_MANUAL_STATE } from '../config/appConstants';
import { localDateKey, weekStartKey, addUniqueKey, calcStreak } from '../utils/date';
import { fetchApi } from '../utils/api';

async function postManualJson(path, body) {
  const response = await fetchApi(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body ?? {}),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    return { ok: false, error: payload?.error || 'REQUEST_FAILED', payload };
  }
  return { ok: true, payload };
}

/**
 * Handles engagement state loading, daily check-in, boundary, wrap-up, weekly review,
 * execution recording, manual state, VIP redemption, and discipline tracking.
 */
export function useEngagement({
  fetchJson,
  effectiveUserId,
  market,
  assetClass,
  lang,
  effectiveHoldings,
  isDemoRuntime,
  authHydrated = true,
  hasLoaded,
  decisionSnapshot,
  setRefreshNonce,
  now,
  disciplineLog,
  setDisciplineLog,
  executions,
  setExecutions,
}) {
  const [engagementState, setEngagementState] = useState(null);
  const [manualState, setManualState] = useState(DEMO_MANUAL_STATE);

  const todayKey = localDateKey(now);
  const currentWeekKey = weekStartKey(now);
  const currentHour = now.getHours();
  const engagementRefreshKey = `${todayKey}:${currentHour}`;

  // Ref for `now` to avoid unstable Date references in useCallback deps.
  // `todayKey` (string) is stable within a day; `now.getHours()` via ref avoids
  // loadEngagementState / buildEngagementBody re-creation every engagementClock tick.
  const nowRef = useRef(now);
  nowRef.current = now;

  // Load manual state
  useEffect(() => {
    if (isDemoRuntime) {
      setManualState(DEMO_MANUAL_STATE);
      return undefined;
    }
    if (!authHydrated) return undefined;
    let cancelled = false;
    void fetchJson('/api/manual/state')
      .then((payload) => {
        if (!cancelled) setManualState(payload || null);
      })
      .catch(() => {
        if (!cancelled) {
          setManualState({
            ...DEMO_MANUAL_STATE,
            available: false,
            mode: 'REAL',
            reason: 'MANUAL_UNAVAILABLE',
            summary: {
              balance: 0,
              expiringSoon: 0,
              vipDays: 0,
              vipDaysRedeemed: 0,
            },
            referrals: {
              inviteCode: null,
              referredByCode: null,
              total: 0,
              rewarded: 0,
            },
            ledger: [],
            rewards: [
              {
                id: 'vip-1d',
                kind: 'vip_day',
                title: 'Redeem 1 VIP day',
                description: '1000 points unlocks one more VIP day.',
                costPoints: 1000,
                enabled: false,
              },
            ],
            predictions: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authHydrated, effectiveUserId, isDemoRuntime, fetchJson]);

  const loadEngagementState = useCallback(async () => {
    if (isDemoRuntime || !hasLoaded) return null;
    try {
      const payload = await fetchJson('/api/engagement/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          market,
          assetClass,
          localDate: todayKey,
          localHour: nowRef.current.getHours(),
          locale: lang,
          holdings: effectiveHoldings,
        }),
      });
      setEngagementState(payload || null);
      return payload || null;
    } catch {
      setEngagementState(null);
      return null;
    }
  }, [
    assetClass,
    effectiveUserId,
    hasLoaded,
    effectiveHoldings,
    isDemoRuntime,
    lang,
    market,
    todayKey,
    fetchJson,
  ]); // `now` accessed via nowRef to avoid 60s churn

  // Load engagement after the decision snapshot arrives and when the local
  // hour/day boundary changes. This keeps hour-sensitive server state
  // truthful without reintroducing render-driven POST storms.
  useEffect(() => {
    if (!authHydrated || !decisionSnapshot || isDemoRuntime || !hasLoaded) return;
    void loadEngagementState();
  }, [
    authHydrated,
    decisionSnapshot?.audit_snapshot_id,
    engagementRefreshKey,
    isDemoRuntime,
    hasLoaded,
    loadEngagementState,
  ]);

  const syncLocalDisciplineLog = useCallback(
    (updater) => {
      setDisciplineLog((current) =>
        updater(current || { checkins: [], boundary_kept: [], weekly_reviews: [] }),
      );
    },
    [setDisciplineLog],
  );

  const localDiscipline = useMemo(() => {
    const checkins = disciplineLog?.checkins || [];
    const boundary = disciplineLog?.boundary_kept || [];
    const weekly = disciplineLog?.weekly_reviews || [];

    return {
      checkedToday: checkins.includes(todayKey),
      boundaryToday: boundary.includes(todayKey),
      reviewedThisWeek: weekly.includes(currentWeekKey),
      checkinStreak: calcStreak(checkins, todayKey, 1),
      boundaryStreak: calcStreak(boundary, todayKey, 1),
      weeklyStreak: calcStreak(weekly, currentWeekKey, 7),
    };
  }, [disciplineLog, todayKey, currentWeekKey]);

  const discipline = useMemo(() => {
    const habit = engagementState?.habit_state;
    if (!habit) return localDiscipline;
    return {
      checkedToday: Boolean(habit.checkedToday),
      boundaryToday: Boolean(habit.boundaryToday),
      reviewedThisWeek: Boolean(habit.reviewedThisWeek),
      checkinStreak: Number(habit.checkinStreak || 0),
      boundaryStreak: Number(habit.boundaryStreak || 0),
      weeklyStreak: Number(habit.weeklyStreak || 0),
      wrapUpToday: Boolean(habit.wrapUpToday),
      wrapUpStreak: Number(habit.wrapUpStreak || 0),
      disciplineScore: Number(habit.discipline_score || 0),
      behaviorQuality: habit.behavior_quality || null,
      summary: habit.summary || null,
      noActionValueLine: habit.no_action_value_line || null,
    };
  }, [engagementState, localDiscipline]);

  const buildEngagementBody = useCallback(
    () => ({
      userId: effectiveUserId,
      market,
      assetClass,
      localDate: todayKey,
      localHour: nowRef.current.getHours(),
      locale: lang,
      holdings: effectiveHoldings,
    }),
    [assetClass, effectiveUserId, effectiveHoldings, lang, market, todayKey],
  ); // `now` accessed via nowRef to avoid 60s churn

  const markDailyCheckin = useCallback(async () => {
    syncLocalDisciplineLog((current) => ({
      ...current,
      checkins: addUniqueKey(current?.checkins || [], todayKey),
    }));
    if (isDemoRuntime) return;
    try {
      const payload = await fetchJson('/api/engagement/morning-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEngagementBody()),
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [
    buildEngagementBody,
    isDemoRuntime,
    loadEngagementState,
    syncLocalDisciplineLog,
    todayKey,
    fetchJson,
  ]);

  const markBoundaryKept = useCallback(async () => {
    syncLocalDisciplineLog((current) => ({
      ...current,
      boundary_kept: addUniqueKey(current?.boundary_kept || [], todayKey),
    }));
    if (isDemoRuntime) return;
    try {
      const payload = await fetchJson('/api/engagement/boundary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEngagementBody()),
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [
    buildEngagementBody,
    isDemoRuntime,
    loadEngagementState,
    syncLocalDisciplineLog,
    todayKey,
    fetchJson,
  ]);

  const markWrapUpComplete = useCallback(async () => {
    if (isDemoRuntime) return;
    try {
      const payload = await fetchJson('/api/engagement/wrap-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEngagementBody()),
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [buildEngagementBody, isDemoRuntime, loadEngagementState, fetchJson]);

  const markWeeklyReviewed = useCallback(async () => {
    syncLocalDisciplineLog((current) => ({
      ...current,
      weekly_reviews: addUniqueKey(current?.weekly_reviews || [], currentWeekKey),
    }));
    if (isDemoRuntime) return;
    try {
      const payload = await fetchJson('/api/engagement/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEngagementBody()),
      });
      setEngagementState(payload || null);
    } catch {
      void loadEngagementState();
    }
  }, [
    buildEngagementBody,
    currentWeekKey,
    isDemoRuntime,
    loadEngagementState,
    syncLocalDisciplineLog,
    fetchJson,
  ]);

  const recordExecution = useCallback(
    async ({ signal, mode, action }) => {
      const payload = {
        signal_id: signal.signal_id,
        signalId: signal.signal_id,
        market: signal.market,
        symbol: signal.symbol,
        side: signal.direction,
        direction: signal.direction,
        mode,
        action,
        created_at: new Date().toISOString(),
        entry: (signal.entry_zone?.low + signal.entry_zone?.high) / 2 || signal.entry_min,
        entry_price: (signal.entry_zone?.low + signal.entry_zone?.high) / 2 || signal.entry_min,
        tp_price: signal.take_profit_levels?.[0]?.price ?? signal.take_profit,
        pnl_pct: action === 'DONE' ? Number(signal.quick_pnl_pct ?? 0.6) : 0,
      };
      if (isDemoRuntime) {
        setExecutions((current) => [payload, ...current].slice(0, 200));
        return;
      }
      try {
        await fetchJson('/api/executions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: effectiveUserId,
            signalId: signal.signal_id,
            mode,
            action,
            note: 'Recorded from Today quick action',
          }),
        });
        setRefreshNonce((current) => current + 1);
      } catch {
        // Keep UI resilient; failed writes are surfaced by stale state.
      }
    },
    [effectiveUserId, isDemoRuntime, setExecutions, setRefreshNonce, fetchJson],
  );

  const refreshManualState = useCallback(async () => {
    if (isDemoRuntime) {
      setManualState(DEMO_MANUAL_STATE);
      return DEMO_MANUAL_STATE;
    }
    const payload = await fetchJson('/api/manual/state');
    setManualState(payload || null);
    return payload || null;
  }, [effectiveUserId, isDemoRuntime, fetchJson]);

  const redeemVipDay = useCallback(
    async (days = 1) => {
      if (isDemoRuntime) {
        setManualState((current) => {
          const base = current || DEMO_MANUAL_STATE;
          return {
            ...base,
            summary: {
              ...base.summary,
              balance: Math.max(0, Number(base.summary.balance || 0) - days * 1000),
              vipDays: Number(base.summary.vipDays || 0) + days,
              vipDaysRedeemed: Number(base.summary.vipDaysRedeemed || 0) + days,
            },
          };
        });
        return;
      }
      try {
        const payload = await fetchJson('/api/manual/rewards/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days }),
        });
        if (payload?.data) setManualState(payload.data);
        else await refreshManualState();
      } catch {
        await refreshManualState().catch(() => {});
      }
    },
    [effectiveUserId, isDemoRuntime, refreshManualState, fetchJson],
  );

  const claimManualReferral = useCallback(
    async (inviteCode) => {
      const raw = String(inviteCode || '').trim();
      if (isDemoRuntime) {
        setManualState((current) => {
          const base = current || DEMO_MANUAL_STATE;
          return {
            ...base,
            referrals: {
              ...base.referrals,
              referredByCode: raw.toUpperCase() || base.referrals?.referredByCode,
            },
            summary: {
              ...base.summary,
              balance: Number(base.summary?.balance || 0) + 500,
            },
          };
        });
        return { ok: true, error: null };
      }
      const result = await postManualJson('/api/manual/referrals/claim', { inviteCode: raw });
      if (result.ok && result.payload?.data) {
        setManualState(result.payload.data);
        return { ok: true, error: null };
      }
      await refreshManualState().catch(() => {});
      return { ok: false, error: result.error || 'REQUEST_FAILED' };
    },
    [isDemoRuntime, refreshManualState],
  );

  const submitManualPrediction = useCallback(
    async ({ marketId, selectedOption, pointsStaked }) => {
      if (isDemoRuntime) {
        setManualState((current) => {
          const base = current || DEMO_MANUAL_STATE;
          const list = Array.isArray(base.predictions) ? base.predictions : [];
          const next = list.map((m) =>
            String(m.id) === String(marketId)
              ? {
                  ...m,
                  entry: {
                    selectedOption: String(selectedOption || ''),
                    status: 'OPEN',
                    pointsStaked: Number(pointsStaked || 0),
                    pointsAwarded: 0,
                  },
                }
              : m,
          );
          return { ...base, predictions: next };
        });
        return { ok: true, error: null };
      }
      const result = await postManualJson('/api/manual/predictions/entry', {
        marketId: String(marketId || ''),
        selectedOption: String(selectedOption || ''),
        pointsStaked,
      });
      if (result.ok && result.payload?.data) {
        setManualState(result.payload.data);
        return { ok: true, error: null };
      }
      await refreshManualState().catch(() => {});
      return { ok: false, error: result.error || 'REQUEST_FAILED' };
    },
    [isDemoRuntime, refreshManualState],
  );

  const claimManualOnboardingBonus = useCallback(async () => {
    if (isDemoRuntime) {
      setManualState((current) => {
        const base = current || DEMO_MANUAL_STATE;
        return {
          ...base,
          summary: {
            ...base.summary,
            balance: Number(base.summary?.balance || 0) + 700,
          },
        };
      });
      return { ok: true, error: null };
    }
    const result = await postManualJson('/api/manual/bonuses/onboarding', {});
    if (result.ok && result.payload?.data) {
      setManualState(result.payload.data);
      return { ok: true, error: null, referralStage2: result.payload?.referralStage2 };
    }
    if (result.error === 'ONBOARDING_BONUS_ALREADY_CLAIMED') {
      await refreshManualState().catch(() => {});
      return { ok: true, error: null, skipped: true };
    }
    await refreshManualState().catch(() => {});
    return { ok: false, error: result.error || 'REQUEST_FAILED' };
  }, [isDemoRuntime, refreshManualState]);

  return {
    engagementState,
    setEngagementState,
    manualState,
    discipline,
    todayKey,
    currentWeekKey,
    loadEngagementState,
    markDailyCheckin,
    markBoundaryKept,
    markWrapUpComplete,
    markWeeklyReviewed,
    recordExecution,
    redeemVipDay,
    refreshManualState,
    claimManualReferral,
    submitManualPrediction,
    claimManualOnboardingBonus,
  };
}

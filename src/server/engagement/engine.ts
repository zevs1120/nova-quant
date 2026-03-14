import { createHash } from 'node:crypto';
import type {
  AssetClass,
  DecisionSnapshotRecord,
  Market,
  NotificationEventRecord,
  NotificationPreferenceRecord,
  UserRitualEventRecord
} from '../types.js';
import { RUNTIME_STATUS, normalizeRuntimeStatus } from '../runtimeStatus.js';

type JsonObject = Record<string, unknown>;

function parseJson(text: string | null | undefined): JsonObject {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as JsonObject;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function uniqueDays(rows: UserRitualEventRecord[], eventType: UserRitualEventRecord['event_type']) {
  return [...new Set(rows.filter((row) => row.event_type === eventType).map((row) => row.event_date))].sort();
}

function calcDayStreak(days: string[], anchorDay: string): number {
  const set = new Set(days);
  let streak = 0;
  let cursor = anchorDay;
  while (set.has(cursor)) {
    streak += 1;
    const current = new Date(`${cursor}T00:00:00`);
    current.setDate(current.getDate() - 1);
    cursor = current.toISOString().slice(0, 10);
  }
  return streak;
}

function calcWeekStreak(weeks: string[], anchorWeek: string): number {
  const set = new Set(weeks);
  let streak = 0;
  let cursor = anchorWeek;
  while (set.has(cursor)) {
    streak += 1;
    const current = new Date(`${cursor}T00:00:00`);
    current.setDate(current.getDate() - 7);
    cursor = current.toISOString().slice(0, 10);
  }
  return streak;
}

function weekStartKey(dateKey: string): string {
  const base = new Date(`${dateKey}T00:00:00`);
  if (!Number.isFinite(base.getTime())) return dateKey;
  const weekday = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - weekday);
  return base.toISOString().slice(0, 10);
}

function copyTone(posture: string) {
  const upper = String(posture || '').toUpperCase();
  if (upper === 'ATTACK') {
    return {
      tone: 'opportunity',
      accent: 'safe',
      user_label: '可行动',
      widget_label: '可试探进攻',
      completion: '今天的重点不是多做，而是只做最清楚的那一下。',
      noActionValue: '今天有机会，但依然不需要急。'
    };
  }
  if (upper === 'PROBE') {
    return {
      tone: 'watchful',
      accent: 'medium',
      user_label: '可试探',
      widget_label: '轻试探',
      completion: '今天更像校准判断，不像放大风险。',
      noActionValue: '今天真正值钱的，是保持选择性。'
    };
  }
  if (upper === 'DEFEND') {
    return {
      tone: 'defensive',
      accent: 'caution',
      user_label: '优先防守',
      widget_label: '偏防守',
      completion: '今天完成判断，比贸然动作更有价值。',
      noActionValue: '系统今天在保护你，而不是催你出手。'
    };
  }
  return {
    tone: 'quiet',
    accent: 'neutral',
    user_label: '先等待',
    widget_label: '先确认',
    completion: '今天先确认，不急着证明什么。',
    noActionValue: '无动作本身就是有效判断。'
  };
}

function summarizeRecommendationChange(current: JsonObject, previous: JsonObject | null) {
  const currentRisk = String(current.risk_posture || '');
  const currentSymbol = String(current.top_action_symbol || '');
  const currentLabel = String(current.top_action_label || '');
  if (!previous) {
    return {
      changed: false,
      change_type: 'initial_snapshot',
      summary: '今天的判断已更新，你只需要回来确认一次。',
      previous: null,
      current: {
        risk_posture: currentRisk,
        top_action_symbol: currentSymbol,
        top_action_label: currentLabel
      }
    };
  }

  const prevRisk = String(previous.risk_posture || '');
  const prevSymbol = String(previous.top_action_symbol || '');
  const prevLabel = String(previous.top_action_label || '');

  if (prevRisk !== currentRisk) {
    return {
      changed: true,
      change_type: 'risk_shift',
      summary: `判断从 ${prevRisk || '未知'} 切到了 ${currentRisk || '未知'}。`,
      previous: { risk_posture: prevRisk, top_action_symbol: prevSymbol, top_action_label: prevLabel },
      current: { risk_posture: currentRisk, top_action_symbol: currentSymbol, top_action_label: currentLabel }
    };
  }

  if (prevSymbol !== currentSymbol || prevLabel !== currentLabel) {
    return {
      changed: true,
      change_type: 'top_action_shift',
      summary: `最重要的卡片从 ${prevSymbol || '无'} 变成了 ${currentSymbol || '无'}。`,
      previous: { risk_posture: prevRisk, top_action_symbol: prevSymbol, top_action_label: prevLabel },
      current: { risk_posture: currentRisk, top_action_symbol: currentSymbol, top_action_label: currentLabel }
    };
  }

  return {
    changed: false,
    change_type: 'stable',
    summary: '核心判断没有明显变，今天更重要的是确认而不是频繁切换。',
    previous: { risk_posture: prevRisk, top_action_symbol: prevSymbol, top_action_label: prevLabel },
    current: { risk_posture: currentRisk, top_action_symbol: currentSymbol, top_action_label: currentLabel }
  };
}

export function defaultNotificationPreferences(userId: string): NotificationPreferenceRecord {
  return {
    user_id: userId,
    morning_enabled: 1,
    state_shift_enabled: 1,
    protective_enabled: 1,
    wrap_up_enabled: 1,
    frequency: 'NORMAL',
    quiet_start_hour: 22,
    quiet_end_hour: 8,
    updated_at_ms: Date.now()
  };
}

type EngagementInput = {
  userId: string;
  market: Market;
  assetClass: AssetClass | 'ALL';
  localDate: string;
  localHour: number;
  decisionRow: DecisionSnapshotRecord | null;
  previousDecisionRow: DecisionSnapshotRecord | null;
  ritualEvents: UserRitualEventRecord[];
  notificationPreferences: NotificationPreferenceRecord;
};

function buildDailyCheckState(args: {
  localDate: string;
  localHour: number;
  decisionSummary: JsonObject;
  recommendationChange: ReturnType<typeof summarizeRecommendationChange>;
  rituals: UserRitualEventRecord[];
  tone: ReturnType<typeof copyTone>;
}) {
  const todayEvent = args.rituals.find(
    (row) => row.event_type === 'MORNING_CHECK_COMPLETED' && row.event_date === args.localDate
  );
  const recorded = todayEvent ? parseJson(todayEvent.reason_json) : {};
  const todayCall = (args.decisionSummary.today_call as JsonObject | undefined) || {};
  const currentFingerprint = `${String(args.decisionSummary.risk_posture || '--')}:${String(args.decisionSummary.top_action_id || '--')}`;
  const recordedFingerprint = `${String(recorded.risk_posture || '--')}:${String(recorded.top_action_id || '--')}`;
  const refreshRequired = Boolean(todayEvent && currentFingerprint !== recordedFingerprint);
  const status = !todayEvent ? 'PENDING' : refreshRequired ? 'REFRESH_REQUIRED' : 'COMPLETED';

  return {
    status,
    title: 'Morning Check',
    short_label: status === 'COMPLETED' ? '已确认' : status === 'REFRESH_REQUIRED' ? '需重看' : '待确认',
    headline:
      status === 'COMPLETED'
        ? '今日判断已确认'
        : status === 'REFRESH_REQUIRED'
        ? '判断有变化，建议重看'
        : '今天先确认，再决定',
    prompt:
      args.localHour < 11
        ? '不用研究很久，只要确认今天该不该动。'
        : '今天还没完成判断确认，先看结论，再决定要不要动。 ',
    why_now: String(todayCall.subtitle || args.recommendationChange.summary || ''),
    completed_at_ms: todayEvent?.updated_at_ms || null,
    completion_feedback:
      status === 'COMPLETED'
        ? args.tone.completion
        : status === 'REFRESH_REQUIRED'
        ? '系统已经更新了判断，值得回来重新确认一次。'
        : '你今天最重要的动作，是先确认判断。'
  };
}

function buildHabitState(args: {
  localDate: string;
  rituals: UserRitualEventRecord[];
  tone: ReturnType<typeof copyTone>;
}) {
  const morningDays = uniqueDays(args.rituals, 'MORNING_CHECK_COMPLETED');
  const boundaryDays = uniqueDays(args.rituals, 'RISK_BOUNDARY_CONFIRMED');
  const wrapDays = uniqueDays(args.rituals, 'WRAP_UP_COMPLETED');
  const weeklyKeys = [
    ...new Set(
      args.rituals
        .filter((row) => row.event_type === 'WEEKLY_REVIEW_COMPLETED')
        .map((row) => row.week_key)
        .filter((value): value is string => Boolean(value))
    )
  ];
  const currentWeekKey = weekStartKey(args.localDate);
  const morningStreak = calcDayStreak(morningDays, args.localDate);
  const boundaryStreak = calcDayStreak(boundaryDays, args.localDate);
  const wrapStreak = calcDayStreak(wrapDays, args.localDate);
  const weeklyStreak = calcWeekStreak(weeklyKeys, currentWeekKey);
  const disciplineScore = Math.max(
    35,
    Math.min(96, 45 + morningStreak * 4 + boundaryStreak * 3 + wrapStreak * 2 + weeklyStreak * 2)
  );

  return {
    checkinStreak: morningStreak,
    boundaryStreak,
    wrapUpStreak: wrapStreak,
    weeklyStreak,
    checkedToday: morningDays.includes(args.localDate),
    boundaryToday: boundaryDays.includes(args.localDate),
    wrapUpToday: wrapDays.includes(args.localDate),
    reviewedThisWeek: weeklyKeys.includes(currentWeekKey),
    discipline_score: disciplineScore,
    behavior_quality:
      disciplineScore >= 82 ? 'STEADY' : disciplineScore >= 64 ? 'BUILDING' : 'EARLY',
    summary:
      disciplineScore >= 82
        ? '你在形成稳定的判断节奏。'
        : disciplineScore >= 64
          ? '习惯正在成形，重点是持续回来确认。'
          : '现在最重要的不是动作，而是建立确认节奏。',
    no_action_value_line: args.tone.noActionValue
  };
}

function buildWrapUp(args: {
  localDate: string;
  localHour: number;
  currentSummary: JsonObject;
  previousSummary: JsonObject | null;
  tone: ReturnType<typeof copyTone>;
  rituals: UserRitualEventRecord[];
}) {
  const ready = args.localHour >= 18;
  const completed = args.rituals.some(
    (row) => row.event_type === 'WRAP_UP_COMPLETED' && row.event_date === args.localDate
  );
  const previousRisk = String(args.previousSummary?.risk_posture || '');
  const currentRisk = String(args.currentSummary.risk_posture || '');
  const previousSymbol = String(args.previousSummary?.top_action_symbol || '');
  const currentSymbol = String(args.currentSummary.top_action_symbol || '');

  const mostImportant =
    previousRisk && previousRisk !== currentRisk
      ? `今天最重要的变化不是行情本身，而是判断从 ${previousRisk} 切到了 ${currentRisk}。`
      : currentSymbol
        ? `今天最重要的卡仍然是 ${currentSymbol}，但重点是理解它为什么排第一。`
        : '今天没有值得强行动作的卡，最有价值的是没有被迫表态。';

  return {
    ready,
    completed,
    title: 'Evening Wrap-Up',
    short_label: completed ? '已复盘' : ready ? '可复盘' : '稍后',
    headline: completed ? '今天的复盘已完成' : '今晚值得看一眼复盘',
    summary: mostImportant,
    lessons: [
      args.tone.noActionValue,
      currentSymbol
        ? `今天最值得理解的是 ${currentSymbol} 的前提和失效条件。`
        : '今天系统更重视风险姿态，而不是新机会。'
    ],
    tomorrow_watch:
      currentRisk === 'DEFEND'
        ? '明天优先观察风险是否真正回落，而不是寻找新刺激。'
        : '明天优先观察最重要的那张卡是否仍留在榜首。',
    completion_feedback: completed ? '复盘完成。你在强化的是判断，而不是冲动。' : '晚间复盘会告诉你今天最值得记住的是什么。'
  };
}

function inQuietHours(hour: number, prefs: NotificationPreferenceRecord) {
  if (prefs.quiet_start_hour === null || prefs.quiet_end_hour === null) return false;
  const start = prefs.quiet_start_hour;
  const end = prefs.quiet_end_hour;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function buildNotificationCandidate(args: {
  userId: string;
  market: Market;
  assetClass: AssetClass | 'ALL';
  category: NotificationEventRecord['category'];
  triggerType: string;
  title: string;
  body: string;
  tone: string;
  actionTarget: string | null;
  reason: JsonObject;
}) {
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass,
        category: args.category,
        triggerType: args.triggerType,
        title: args.title,
        body: args.body,
        actionTarget: args.actionTarget,
        reason: args.reason
      })
    )
    .digest('hex');
  const now = Date.now();
  return {
    id: `notif-${fingerprint.slice(0, 20)}`,
    user_id: args.userId,
    market: args.market,
    asset_class: args.assetClass,
    category: args.category,
    trigger_type: args.triggerType,
    fingerprint,
    title: args.title,
    body: args.body,
    tone: args.tone,
    status: 'ACTIVE' as const,
    action_target: args.actionTarget,
    reason_json: JSON.stringify(args.reason),
    created_at_ms: now,
    updated_at_ms: now
  };
}

function buildNotificationCandidates(args: {
  userId: string;
  market: Market;
  assetClass: AssetClass | 'ALL';
  localDate: string;
  localHour: number;
  dailyCheckState: ReturnType<typeof buildDailyCheckState>;
  wrapUp: ReturnType<typeof buildWrapUp>;
  recommendationChange: ReturnType<typeof summarizeRecommendationChange>;
  currentSummary: JsonObject;
  currentPortfolio: JsonObject;
  prefs: NotificationPreferenceRecord;
}) {
  const quiet = inQuietHours(args.localHour, args.prefs);
  const notifications: NotificationEventRecord[] = [];

  if (args.prefs.morning_enabled && args.dailyCheckState.status !== 'COMPLETED') {
    notifications.push(
      buildNotificationCandidate({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass,
        category: 'RHYTHM',
        triggerType: 'morning_check_due',
        title: '今早判断已更新',
        body: quiet ? '系统已更新今天的判断，安静时段后再回来确认也可以。' : '今天先回来确认一次，不急着动作。',
        tone: 'calm',
        actionTarget: 'today',
        reason: {
          daily_check_status: args.dailyCheckState.status,
          risk_posture: args.currentSummary.risk_posture,
          quiet_window: quiet
        }
      })
    );
  }

  if (args.recommendationChange.changed && args.prefs.state_shift_enabled) {
    notifications.push(
      buildNotificationCandidate({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass,
        category: 'STATE_SHIFT',
        triggerType: String(args.recommendationChange.change_type),
        title: '系统更新了判断',
        body: args.recommendationChange.summary,
        tone: 'measured',
        actionTarget: 'today',
        reason: args.recommendationChange as unknown as JsonObject
      })
    );
  }

  if (args.prefs.protective_enabled) {
    const posture = String(args.currentSummary.risk_posture || '').toUpperCase();
    const top1 = Number(args.currentPortfolio.top1_pct || 0);
    if (posture === 'DEFEND' || posture === 'WAIT' || top1 >= 25) {
      notifications.push(
        buildNotificationCandidate({
          userId: args.userId,
          market: args.market,
          assetClass: args.assetClass,
          category: 'PROTECTIVE',
          triggerType: posture === 'DEFEND' || posture === 'WAIT' ? 'protective_posture' : 'concentration_warning',
          title: '现在更值得做的是克制',
          body:
            posture === 'DEFEND' || posture === 'WAIT'
              ? '今天不是加大风险暴露的好时点。'
              : '你当前的曝险已经不轻，新增动作更应该谨慎。',
          tone: 'protective',
          actionTarget: 'ai',
          reason: {
            posture,
            top1_pct: top1,
            recommendation: args.currentPortfolio.recommendation || null
          }
        })
      );
    }
  }

  if (args.prefs.wrap_up_enabled && args.wrapUp.ready && !args.wrapUp.completed) {
    notifications.push(
      buildNotificationCandidate({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass,
        category: 'WRAP_UP',
        triggerType: 'daily_wrap_up_ready',
        title: '今晚的复盘已经准备好',
        body: '今天最有价值的，不一定是哪张卡，而是判断有没有变。',
        tone: 'reflective',
        actionTarget: 'more:weekly',
        reason: {
          ready: true,
          top_action_symbol: args.currentSummary.top_action_symbol || null,
          risk_posture: args.currentSummary.risk_posture || null
        }
      })
    );
  }

  return notifications;
}

function buildWidgetSummary(args: {
  dailyCheckState: ReturnType<typeof buildDailyCheckState>;
  recommendationChange: ReturnType<typeof summarizeRecommendationChange>;
  currentSummary: JsonObject;
  wrapUp: ReturnType<typeof buildWrapUp>;
  tone: ReturnType<typeof copyTone>;
}) {
  const todayCall = (args.currentSummary.today_call as JsonObject | undefined) || {};
  const topSymbol = String(args.currentSummary.top_action_symbol || '--');
  const topLabel = String(args.currentSummary.top_action_label || 'Wait');
  return {
    state_widget: {
      kind: 'STATE_MINIMAL',
      title: String(args.currentSummary.risk_summary || todayCall.headline || '先确认'),
      subtitle: args.dailyCheckState.headline,
      caption: args.tone.widget_label,
      deep_link: 'today'
    },
    action_widget: {
      kind: 'TOP_ACTION',
      title: topSymbol === '--' ? '今天没有高优先级动作' : `${topSymbol} · ${topLabel}`,
      subtitle: String(todayCall.subtitle || args.currentSummary.user_message || ''),
      caution: args.tone.noActionValue,
      deep_link: 'today'
    },
    change_widget: {
      kind: 'CHANGE_ALERT',
      title: args.recommendationChange.changed ? '判断有变化' : '判断保持稳定',
      subtitle: args.recommendationChange.summary,
      caption: args.wrapUp.ready ? '今晚可复盘' : '回来确认一次就够了',
      deep_link: args.recommendationChange.changed ? 'today' : 'ai'
    }
  };
}

export function buildEngagementSnapshot(input: EngagementInput) {
  const currentSummary = parseJson(input.decisionRow?.summary_json);
  const previousSummary = input.previousDecisionRow ? parseJson(input.previousDecisionRow.summary_json) : null;
  const currentPortfolio = parseJson(input.decisionRow?.portfolio_context_json);
  const tone = copyTone(String(currentSummary.risk_posture || 'WAIT'));
  const recommendationChange = summarizeRecommendationChange(currentSummary, previousSummary);
  const dailyCheckState = buildDailyCheckState({
    localDate: input.localDate,
    localHour: input.localHour,
    decisionSummary: currentSummary,
    recommendationChange,
    rituals: input.ritualEvents,
    tone
  });
  const habitState = buildHabitState({
    localDate: input.localDate,
    rituals: input.ritualEvents,
    tone
  });
  const dailyWrapUp = buildWrapUp({
    localDate: input.localDate,
    localHour: input.localHour,
    currentSummary,
    previousSummary,
    tone,
    rituals: input.ritualEvents
  });
  const notifications = buildNotificationCandidates({
    userId: input.userId,
    market: input.market,
    assetClass: input.assetClass,
    localDate: input.localDate,
    localHour: input.localHour,
    dailyCheckState,
    wrapUp: dailyWrapUp,
    recommendationChange,
    currentSummary,
    currentPortfolio,
    prefs: input.notificationPreferences
  });
  const widgetSummary = buildWidgetSummary({
    dailyCheckState,
    recommendationChange,
    currentSummary,
    wrapUp: dailyWrapUp,
    tone
  });

  return {
    as_of: new Date().toISOString(),
    source_status: normalizeRuntimeStatus(input.decisionRow?.source_status, RUNTIME_STATUS.INSUFFICIENT_DATA),
    data_status: normalizeRuntimeStatus(input.decisionRow?.data_status, RUNTIME_STATUS.INSUFFICIENT_DATA),
    daily_check_state: dailyCheckState,
    habit_state: habitState,
    daily_wrap_up: dailyWrapUp,
    widget_summary: widgetSummary,
    notification_center: {
      active_count: notifications.length,
      quiet_hours_active: inQuietHours(input.localHour, input.notificationPreferences),
      notifications
    },
    recommendation_change: recommendationChange,
    ui_regime_state: {
      tone: tone.tone,
      accent: tone.accent,
      label: tone.user_label,
      card_emphasis: tone.tone === 'opportunity' ? 'elevated' : tone.tone === 'defensive' ? 'guarded' : 'steady',
      motion_profile: tone.tone === 'opportunity' ? 'lift' : tone.tone === 'defensive' ? 'hold' : 'calm'
    },
    notification_preferences: input.notificationPreferences
  };
}

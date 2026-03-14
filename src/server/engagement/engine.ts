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
import {
  getDisciplineCopy,
  getMorningCheckCopy,
  getNoActionCopy,
  getNotificationCopy,
  getPerceptionLayerCopy,
  getUiRegimeTone,
  getWidgetCopy,
  getWrapUpCopy
} from '../../copy/novaCopySystem.js';

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

function copyTone(posture: string, locale?: string) {
  const uiTone = getUiRegimeTone({
    posture,
    locale
  });
  const noAction = getNoActionCopy({
    locale,
    posture,
    seed: `${posture}:engagement`
  });
  return {
    tone: uiTone.tone,
    accent: uiTone.accent,
    user_label: uiTone.label,
    widget_label: uiTone.widget_label,
    completion: uiTone.completion_line,
    noActionValue: noAction.completion,
    arrival: uiTone.arrival_line,
    ritual: uiTone.ritual_line,
    humor: uiTone.humor_line,
    protective: uiTone.protective_line,
    wrap: uiTone.wrap_line,
    motion: uiTone.motion
  };
}

function summarizeRecommendationChange(current: JsonObject, previous: JsonObject | null, locale?: string) {
  const isZh = locale === 'zh';
  const currentRisk = String(current.risk_posture || '');
  const currentSymbol = String(current.top_action_symbol || '');
  const currentLabel = String(current.top_action_label || '');
  if (!previous) {
    return {
      changed: false,
      change_type: 'initial_snapshot',
      summary: isZh ? '今天的判断已更新，你只需要回来确认一次。' : 'Today’s view is set. One clean check is enough.',
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
      summary: isZh
        ? `判断从 ${prevRisk || '未知'} 切到了 ${currentRisk || '未知'}。`
        : `The posture moved from ${prevRisk || 'unknown'} to ${currentRisk || 'unknown'}.`,
      previous: { risk_posture: prevRisk, top_action_symbol: prevSymbol, top_action_label: prevLabel },
      current: { risk_posture: currentRisk, top_action_symbol: currentSymbol, top_action_label: currentLabel }
    };
  }

  if (prevSymbol !== currentSymbol || prevLabel !== currentLabel) {
    return {
      changed: true,
      change_type: 'top_action_shift',
      summary: isZh
        ? `最重要的卡片从 ${prevSymbol || '无'} 变成了 ${currentSymbol || '无'}。`
        : `The lead card changed from ${prevSymbol || 'none'} to ${currentSymbol || 'none'}.`,
      previous: { risk_posture: prevRisk, top_action_symbol: prevSymbol, top_action_label: prevLabel },
      current: { risk_posture: currentRisk, top_action_symbol: currentSymbol, top_action_label: currentLabel }
    };
  }

  return {
    changed: false,
    change_type: 'stable',
    summary: isZh
      ? '核心判断没有明显变，今天更重要的是确认而不是频繁切换。'
      : 'The core view held. Today is more about confirmation than constant switching.',
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
  locale?: string;
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
  locale?: string;
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
  const noActionDay = ['WAIT', 'DEFEND'].includes(String(args.decisionSummary.risk_posture || '').toUpperCase());
  const copy = getMorningCheckCopy({
    posture: String(args.decisionSummary.risk_posture || 'WAIT'),
    status,
    locale: args.locale,
    seed: `${args.localDate}:${currentFingerprint}`,
    changed: args.recommendationChange.changed,
    noActionDay
  });

  return {
    status,
    title: copy.title,
    short_label: copy.short_label,
    headline: copy.headline,
    prompt: copy.prompt,
    why_now: String(todayCall.subtitle || args.recommendationChange.summary || ''),
    arrival_line: copy.arrival_line,
    ritual_line: copy.ritual_line,
    humor_line: status === 'COMPLETED' ? copy.completion_feedback : copy.humor_line,
    cta_label: copy.cta_label,
    ai_cta_label: copy.ai_cta_label,
    completed_at_ms: todayEvent?.updated_at_ms || null,
    completion_feedback: status === 'REFRESH_REQUIRED' ? copy.changed_line || copy.completion_feedback : copy.completion_feedback
  };
}

function buildHabitState(args: {
  localDate: string;
  rituals: UserRitualEventRecord[];
  tone: ReturnType<typeof copyTone>;
  locale?: string;
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
  const disciplineCopy = getDisciplineCopy({
    locale: args.locale,
    score: disciplineScore,
    noActionDay: true,
    seed: `${args.localDate}:${disciplineScore}`
  });

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
    behavior_quality: disciplineCopy.behavior_quality,
    summary: disciplineCopy.summary,
    no_action_value_line: disciplineCopy.no_action_value_line || args.tone.noActionValue
  };
}

function buildWrapUp(args: {
  localDate: string;
  localHour: number;
  currentSummary: JsonObject;
  previousSummary: JsonObject | null;
  tone: ReturnType<typeof copyTone>;
  rituals: UserRitualEventRecord[];
  locale?: string;
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
      ? args.locale === 'zh'
        ? `今天最重要的变化不是行情本身，而是判断从 ${previousRisk} 切到了 ${currentRisk}。`
        : `The main change today was not price alone, but the posture shifting from ${previousRisk} to ${currentRisk}.`
      : currentSymbol
        ? args.locale === 'zh'
          ? `今天最重要的卡仍然是 ${currentSymbol}，但重点是理解它为什么排第一。`
          : `${currentSymbol} remained the lead card today. The useful question is why it stayed there.`
        : args.locale === 'zh'
          ? '今天没有值得强行动作的卡，最有价值的是没有被迫表态。'
          : 'No card earned force today. The value was in not forcing an answer.';
  const noActionDay = !currentSymbol || currentRisk === 'DEFEND' || currentRisk === 'WAIT';
  const wrapCopy = getWrapUpCopy({
    locale: args.locale,
    posture: currentRisk || 'WAIT',
    ready,
    completed,
    seed: `${args.localDate}:${currentRisk}:${currentSymbol}`,
    noActionDay
  });

  return {
    ready,
    completed,
    title: wrapCopy.title,
    short_label: wrapCopy.short_label,
    headline: wrapCopy.headline,
    summary: noActionDay && wrapCopy.no_action_line ? wrapCopy.no_action_line : mostImportant,
    opening_line: wrapCopy.opening_line,
    lessons: [
      args.tone.noActionValue,
      currentSymbol
        ? `今天最值得理解的是 ${currentSymbol} 的前提和失效条件。`
        : '今天系统更重视风险姿态，而不是新机会。'
    ],
    tomorrow_watch:
      currentRisk === 'DEFEND'
        ? args.locale === 'zh'
          ? '明天优先观察风险是否真正回落，而不是寻找新刺激。'
          : 'Tomorrow, watch whether risk actually cools instead of hunting for fresh excitement.'
        : args.locale === 'zh'
          ? '明天优先观察最重要的那张卡是否仍留在榜首。'
          : 'Tomorrow, watch whether the lead card still deserves the top slot.',
    completion_feedback: wrapCopy.completion_feedback
  };
}

function buildPerceptionLayer(args: {
  currentSummary: JsonObject;
  dailyCheckState: ReturnType<typeof buildDailyCheckState>;
  recommendationChange: ReturnType<typeof summarizeRecommendationChange>;
  tone: ReturnType<typeof copyTone>;
  locale?: string;
}) {
  const posture = String(args.currentSummary.risk_posture || 'WAIT');
  const topSymbol = String(args.currentSummary.top_action_symbol || '');
  const noActionDay = !topSymbol || posture === 'DEFEND' || posture === 'WAIT';
  const status =
    args.dailyCheckState.status === 'COMPLETED'
      ? 'anchored'
      : args.recommendationChange.changed
        ? 'shifted'
        : 'arriving';
  const perceptionCopy = getPerceptionLayerCopy({
    locale: args.locale,
    posture,
    seed: `${posture}:${topSymbol || 'none'}:${args.recommendationChange.change_type}`,
    status,
    changed: args.recommendationChange.changed,
    noActionDay
  });

  return {
    status,
    badge: perceptionCopy.badge,
    ambient_label: perceptionCopy.ambient_label,
    headline: perceptionCopy.headline,
    focus_line: perceptionCopy.focus_line,
    confirmation_line: perceptionCopy.confirmation_line,
    top_action_symbol: topSymbol || null,
    no_action_day: noActionDay
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
  locale?: string;
}) {
  const quiet = inQuietHours(args.localHour, args.prefs);
  const notifications: NotificationEventRecord[] = [];
  const todayCall = (args.currentSummary.today_call as JsonObject | undefined) || {};

  if (args.prefs.morning_enabled && args.dailyCheckState.status !== 'COMPLETED') {
    const rhythmCopy = getNotificationCopy({
      category: 'RHYTHM',
      posture: String(args.currentSummary.risk_posture || 'WAIT'),
      locale: args.locale,
      seed: `${args.localDate}:rhythm`
    });
    notifications.push(
      buildNotificationCandidate({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass,
        category: 'RHYTHM',
        triggerType: 'morning_check_due',
        title: rhythmCopy.title,
        body:
          quiet
            ? args.locale === 'zh'
              ? '判断已经更新。安静时段后再回来确认，也完全来得及。'
              : 'The view is updated. A calm check after quiet hours is still perfectly on time.'
            : rhythmCopy.body,
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
    const stateShiftCopy = getNotificationCopy({
      category: 'STATE_SHIFT',
      posture: String(args.currentSummary.risk_posture || 'WAIT'),
      locale: args.locale,
      triggerType: String(args.recommendationChange.change_type),
      seed: `${args.localDate}:${args.recommendationChange.change_type}`
    });
    notifications.push(
      buildNotificationCandidate({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass,
        category: 'STATE_SHIFT',
        triggerType: String(args.recommendationChange.change_type),
        title: stateShiftCopy.title,
        body: `${args.recommendationChange.summary} ${stateShiftCopy.body}`,
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
      const protectiveCopy = getNotificationCopy({
        category: 'PROTECTIVE',
        posture,
        locale: args.locale,
        overlap: top1 >= 25,
        seed: `${args.localDate}:protective:${top1}`
      });
      notifications.push(
        buildNotificationCandidate({
          userId: args.userId,
          market: args.market,
          assetClass: args.assetClass,
          category: 'PROTECTIVE',
          triggerType: posture === 'DEFEND' || posture === 'WAIT' ? 'protective_posture' : 'concentration_warning',
          title: protectiveCopy.title,
          body: posture === 'DEFEND' || posture === 'WAIT' ? protectiveCopy.body : protectiveCopy.body,
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
    const wrapCopy = getNotificationCopy({
      category: 'WRAP_UP',
      posture: String(args.currentSummary.risk_posture || 'WAIT'),
      locale: args.locale,
      seed: `${args.localDate}:wrap`
    });
    notifications.push(
      buildNotificationCandidate({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass,
        category: 'WRAP_UP',
        triggerType: 'daily_wrap_up_ready',
        title: wrapCopy.title,
        body: `${args.wrapUp.opening_line} ${wrapCopy.body}`,
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
  locale?: string;
}) {
  const todayCall = (args.currentSummary.today_call as JsonObject | undefined) || {};
  const topSymbol = String(args.currentSummary.top_action_symbol || '--');
  const topLabel = String(args.currentSummary.top_action_label || 'Wait');
  const posture = String(args.currentSummary.risk_posture || 'WAIT');
  const stateCopy = getWidgetCopy({
    type: 'state',
    posture,
    locale: args.locale,
    seed: `${posture}:state:${topSymbol}`
  });
  const actionCopy = getWidgetCopy({
    type: 'action',
    posture,
    locale: args.locale,
    seed: `${posture}:action:${topSymbol}`
  });
  const changeCopy = getWidgetCopy({
    type: 'change',
    posture,
    locale: args.locale,
    triggerType: args.recommendationChange.change_type,
    seed: `${posture}:change:${topSymbol}`
  });
  return {
    state_widget: {
      kind: 'STATE_MINIMAL',
      title: stateCopy.title,
      subtitle: args.dailyCheckState.headline,
      caption: stateCopy.caption || args.tone.widget_label,
      spark: stateCopy.spark || args.dailyCheckState.ritual_line,
      deep_link: 'today'
    },
    action_widget: {
      kind: 'TOP_ACTION',
      title:
        topSymbol === '--'
          ? args.locale === 'zh'
            ? '今天没有高优先级动作'
            : 'No top-priority action today'
          : `${topSymbol} · ${topLabel}`,
      subtitle: String(todayCall.subtitle || args.currentSummary.user_message || ''),
      caution: args.tone.noActionValue,
      spark: actionCopy.spark || args.tone.humor,
      deep_link: 'today'
    },
    change_widget: {
      kind: 'CHANGE_ALERT',
      title: changeCopy.title,
      subtitle: args.recommendationChange.summary,
      caption: args.wrapUp.ready
        ? args.locale === 'zh'
          ? '今晚可复盘'
          : 'Wrap-up ready tonight'
        : args.locale === 'zh'
          ? '回来确认一次就够了'
          : 'One calm check is enough',
      spark: changeCopy.spark || (args.recommendationChange.changed ? args.tone.arrival : args.tone.noActionValue),
      deep_link: args.recommendationChange.changed ? 'today' : 'ai'
    }
  };
}

export function buildEngagementSnapshot(input: EngagementInput) {
  const currentSummary = parseJson(input.decisionRow?.summary_json);
  const previousSummary = input.previousDecisionRow ? parseJson(input.previousDecisionRow.summary_json) : null;
  const currentPortfolio = parseJson(input.decisionRow?.portfolio_context_json);
  const tone = copyTone(String(currentSummary.risk_posture || 'WAIT'), input.locale);
  const recommendationChange = summarizeRecommendationChange(currentSummary, previousSummary, input.locale);
  const dailyCheckState = buildDailyCheckState({
    localDate: input.localDate,
    localHour: input.localHour,
    decisionSummary: currentSummary,
    recommendationChange,
    rituals: input.ritualEvents,
    tone,
    locale: input.locale
  });
  const habitState = buildHabitState({
    localDate: input.localDate,
    rituals: input.ritualEvents,
    tone,
    locale: input.locale
  });
  const dailyWrapUp = buildWrapUp({
    localDate: input.localDate,
    localHour: input.localHour,
    currentSummary,
    previousSummary,
    tone,
    rituals: input.ritualEvents,
    locale: input.locale
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
    prefs: input.notificationPreferences,
    locale: input.locale
  });
  const widgetSummary = buildWidgetSummary({
    dailyCheckState,
    recommendationChange,
    currentSummary,
    wrapUp: dailyWrapUp,
    tone,
    locale: input.locale
  });
  const perceptionLayer = buildPerceptionLayer({
    currentSummary,
    dailyCheckState,
    recommendationChange,
    tone,
    locale: input.locale
  });

  return {
    as_of: new Date().toISOString(),
    source_status: normalizeRuntimeStatus(input.decisionRow?.source_status, RUNTIME_STATUS.INSUFFICIENT_DATA),
    data_status: normalizeRuntimeStatus(input.decisionRow?.data_status, RUNTIME_STATUS.INSUFFICIENT_DATA),
    daily_check_state: dailyCheckState,
    habit_state: habitState,
    daily_wrap_up: dailyWrapUp,
    perception_layer: perceptionLayer,
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
      arrival_line: tone.arrival,
      humor_line: tone.humor,
      ritual_line: tone.ritual,
      completion_line: tone.completion,
      protective_line: tone.protective,
      wrap_line: tone.wrap,
      card_emphasis: tone.tone === 'opportunity' ? 'elevated' : tone.tone === 'defensive' ? 'guarded' : 'steady',
      motion_profile: tone.tone === 'opportunity' ? 'lift' : tone.tone === 'defensive' ? 'hold' : tone.tone === 'watchful' ? 'drift' : 'calm',
      motion: tone.motion
    },
    notification_preferences: input.notificationPreferences
  };
}

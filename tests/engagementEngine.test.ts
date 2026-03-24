import { describe, expect, it } from 'vitest';
import {
  buildEngagementSnapshot,
  defaultNotificationPreferences,
} from '../src/server/engagement/engine.js';
import type {
  DecisionSnapshotRecord,
  NotificationPreferenceRecord,
  UserRitualEventRecord,
} from '../src/server/types.js';

function decisionRow(overrides: Partial<DecisionSnapshotRecord> = {}): DecisionSnapshotRecord {
  const now = Date.now();
  return {
    id: `decision-${now}`,
    user_id: 'engagement-user',
    market: 'US',
    asset_class: 'US_STOCK',
    snapshot_date: '2026-03-14',
    context_hash: 'ctx',
    evidence_mode: 'UNAVAILABLE',
    performance_mode: 'UNAVAILABLE',
    source_status: 'DB_BACKED',
    data_status: 'DB_BACKED',
    risk_state_json: JSON.stringify({
      posture: 'PROBE',
      user_message: 'Mixed conditions. Keep size selective.',
    }),
    portfolio_context_json: JSON.stringify({
      top1_pct: 18,
      recommendation: 'Keep new risk small.',
    }),
    actions_json: JSON.stringify([]),
    summary_json: JSON.stringify({
      today_call: {
        headline: '今天适合确认，不适合激进',
        subtitle: '风险回落了一些，但还不到可以放松的时候。',
      },
      risk_posture: 'PROBE',
      top_action_id: 'action-1',
      top_action_symbol: 'AAPL',
      top_action_label: 'Open new risk',
    }),
    top_action_id: 'action-1',
    created_at_ms: now,
    updated_at_ms: now,
    ...overrides,
  };
}

function ritualEvent(
  eventType: UserRitualEventRecord['event_type'],
  eventDate = '2026-03-14',
): UserRitualEventRecord {
  const now = Date.now();
  return {
    id: `${eventType}-${eventDate}`,
    user_id: 'engagement-user',
    market: 'US',
    asset_class: 'US_STOCK',
    event_date: eventDate,
    week_key: eventType === 'WEEKLY_REVIEW_COMPLETED' ? '2026-03-09' : null,
    event_type: eventType,
    snapshot_id: 'decision-1',
    reason_json: JSON.stringify({
      risk_posture: 'PROBE',
      top_action_id: 'action-1',
    }),
    created_at_ms: now,
    updated_at_ms: now,
  };
}

describe('engagement engine', () => {
  it('builds a pending morning check with calm widget summaries', () => {
    const snapshot = buildEngagementSnapshot({
      userId: 'engagement-user',
      market: 'US',
      assetClass: 'US_STOCK',
      localDate: '2026-03-14',
      localHour: 9,
      locale: 'zh',
      decisionRow: decisionRow(),
      previousDecisionRow: null,
      ritualEvents: [],
      notificationPreferences: defaultNotificationPreferences('engagement-user'),
    });

    expect(snapshot.daily_check_state.status).toBe('PENDING');
    expect(snapshot.daily_check_state.arrival_line).toContain('今天');
    expect(snapshot.daily_check_state.ritual_line).toBeTruthy();
    expect(snapshot.daily_check_state.cta_label).toBe('确认今天判断');
    expect(snapshot.habit_state.checkedToday).toBe(false);
    expect(snapshot.widget_summary.state_widget.title).toBe('轻试探');
    expect(snapshot.widget_summary.state_widget.spark).toBeTruthy();
    expect(snapshot.notification_center.notifications.length).toBeGreaterThan(0);
    expect(snapshot.perception_layer.badge).toBe('系统判断');
    expect(snapshot.perception_layer.headline).toBeTruthy();
    expect(snapshot.ui_regime_state.tone).toBe('watchful');
    expect(snapshot.ui_regime_state.motion).toHaveProperty('entry');
  });

  it('marks completed states and exposes wrap-up once the day is late enough', () => {
    const prefs: NotificationPreferenceRecord = {
      ...defaultNotificationPreferences('engagement-user'),
      quiet_start_hour: 23,
      quiet_end_hour: 7,
    };
    const snapshot = buildEngagementSnapshot({
      userId: 'engagement-user',
      market: 'US',
      assetClass: 'US_STOCK',
      localDate: '2026-03-14',
      localHour: 20,
      locale: 'zh',
      decisionRow: decisionRow(),
      previousDecisionRow: decisionRow({
        id: 'decision-prev',
        summary_json: JSON.stringify({
          today_call: { headline: '昨天偏防守', subtitle: '昨天更重视防守。' },
          risk_posture: 'DEFEND',
          top_action_id: 'action-prev',
          top_action_symbol: 'QQQ',
          top_action_label: 'Wait',
        }),
      }),
      ritualEvents: [
        ritualEvent('MORNING_CHECK_COMPLETED'),
        ritualEvent('RISK_BOUNDARY_CONFIRMED'),
        ritualEvent('WRAP_UP_COMPLETED'),
      ],
      notificationPreferences: prefs,
    });

    expect(snapshot.daily_check_state.status).toBe('COMPLETED');
    expect(snapshot.daily_check_state.humor_line).toBeTruthy();
    expect(snapshot.habit_state.checkedToday).toBe(true);
    expect(snapshot.daily_wrap_up.ready).toBe(true);
    expect(snapshot.daily_wrap_up.completed).toBe(true);
    expect(snapshot.daily_wrap_up.opening_line).toBeTruthy();
    expect(snapshot.perception_layer.status).toBe('anchored');
    expect(snapshot.recommendation_change.changed).toBe(true);
    expect(snapshot.recommendation_change.change_type).toBe('risk_shift');
  });
});

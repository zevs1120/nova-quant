import { createHash } from 'node:crypto';
import type { AssetClass, Market, UserHoldingInput } from '../../types.js';
import {
  buildEngagementSnapshot,
  defaultNotificationPreferences,
} from '../../engagement/engine.js';
import { applyLocalNovaWrapUpLanguage } from '../../nova/service.js';

type EngagementReadDeps = {
  getRepo: () => any;
  cachedFrontendRead: <T>(
    scope: string,
    keyParts: Record<string, unknown>,
    loader: () => Promise<T>,
    ttlMs?: number,
  ) => Promise<T>;
  tryPrimaryPostgresRead: <T>(scope: string, loader: () => Promise<T>) => Promise<T | null>;
  readPostgresDecisionSnapshots: (args: {
    userId: string;
    market?: Market;
    assetClass?: AssetClass;
    limit?: number;
  }) => Promise<any[] | null>;
  readPostgresNotificationPreferences: (userId: string) => Promise<any | null>;
  readPostgresUserRitualEvents: (args: {
    userId: string;
    market: Market;
    assetClass: AssetClass | 'ALL';
    limit?: number;
  }) => Promise<any[] | null>;
  readPostgresNotificationEvents: (args: {
    userId: string;
    market: Market;
    assetClass: AssetClass | 'ALL';
    status: string;
    limit?: number;
  }) => Promise<any[] | null>;
  listDecisionSnapshotsPrimary: (args: {
    userId: string;
    market?: Market;
    assetClass?: AssetClass;
    limit?: number;
  }) => Promise<any[] | null>;
  getDecisionSnapshot: (args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) => Promise<any>;
  parseJsonArray: (text: string | null | undefined) => Array<Record<string, unknown>>;
  invalidateFrontendReadCacheForUser: (userId: string) => void;
  wrapUpLanguageCache: Map<string, { ts: number; patch: Record<string, unknown> }>;
};

function todayDateKey(input = new Date()): string {
  return String(input.toISOString()).slice(0, 10);
}

function localHourOrNow(hour?: number): number {
  if (Number.isFinite(hour)) {
    return Math.max(0, Math.min(23, Number(hour)));
  }
  return new Date().getHours();
}

function localDateOrToday(date?: string): string {
  const value = String(date || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayDateKey();
}

function weekStartKey(dateKey: string): string {
  const base = new Date(`${dateKey}T00:00:00`);
  if (!Number.isFinite(base.getTime())) return dateKey;
  const weekday = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - weekday);
  return todayDateKey(base);
}

function parseOptionalJson(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function serializeNotificationRows(rows: any[]) {
  return rows.map((row) => ({
    ...row,
    reason: parseOptionalJson(row.reason_json),
  }));
}

function resolveNotificationPreferences(repo: any, userId: string) {
  const existing = repo.getUserNotificationPreferences(userId);
  if (existing) return existing;
  const defaults = defaultNotificationPreferences(userId);
  repo.upsertUserNotificationPreferences(defaults);
  return defaults;
}

function shouldEnrichWrapUpLanguage(args: {
  userId: string;
  snapshot: ReturnType<typeof buildEngagementSnapshot>;
  currentDecisionId: string | null;
  skipLanguage?: boolean;
}) {
  if (args.skipLanguage) return false;
  if (String(process.env.NOVA_ENABLE_WRAP_UP_LANGUAGE || '').trim() !== '1') return false;
  if (!args.userId || args.userId === 'guest-default') return false;
  if (!args.currentDecisionId) return false;
  const wrapUp =
    args.snapshot.daily_wrap_up && typeof args.snapshot.daily_wrap_up === 'object'
      ? (args.snapshot.daily_wrap_up as Record<string, unknown>)
      : null;
  if (!wrapUp) return false;
  if (!Boolean(wrapUp.ready)) return false;
  if (Boolean(wrapUp.completed)) return false;
  return true;
}

export function createEngagementReadApi(deps: EngagementReadDeps) {
  async function getDecisionRowsForEngagement(args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) {
    const repo = deps.getRepo();
    const userId = args.userId || 'guest-default';
    const assetClass = args.assetClass || undefined;
    const readRows = async (bypassCache = false) => {
      if (!bypassCache) {
        return (
          (await deps.listDecisionSnapshotsPrimary({
            userId,
            market: args.market,
            assetClass,
            limit: 2,
          })) ||
          repo.listDecisionSnapshots({
            userId,
            market: args.market,
            assetClass,
            limit: 2,
          })
        );
      }
      return (
        (await deps.tryPrimaryPostgresRead('decision_snapshots_engagement', async () =>
          deps.readPostgresDecisionSnapshots({
            userId,
            market: args.market,
            assetClass,
            limit: 2,
          }),
        )) ||
        repo.listDecisionSnapshots({
          userId,
          market: args.market,
          assetClass,
          limit: 2,
        })
      );
    };

    let rows = await readRows();
    const latest = rows[0] || null;
    const engagementDecisionReuseTtlMs = Math.max(
      60_000,
      Number(process.env.NOVA_ENRICHMENT_TTL_MS || 2 * 60 * 60 * 1000),
    );
    const canReuseLatest =
      !args.holdings?.length &&
      latest &&
      Date.now() - latest.updated_at_ms < engagementDecisionReuseTtlMs;
    if (!canReuseLatest) {
      await deps.getDecisionSnapshot(args);
      rows = await readRows(true);
    }
    const current = rows[0] || null;
    const previous = rows[1] || null;
    return { current, previous };
  }

  async function getEngagementState(args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    localDate?: string;
    localHour?: number;
    holdings?: UserHoldingInput[];
    locale?: string;
    skipLanguage?: boolean;
  }) {
    const repo = deps.getRepo();
    const userId = args.userId || 'guest-default';
    const market = args.market || 'US';
    const assetClass = args.assetClass || 'ALL';
    const { current, previous } = await getDecisionRowsForEngagement(args);
    const preferences =
      (await deps.tryPrimaryPostgresRead('engagement_preferences', async () =>
        deps.readPostgresNotificationPreferences(userId),
      )) || resolveNotificationPreferences(repo, userId);
    const rituals =
      (await deps.tryPrimaryPostgresRead('engagement_rituals', async () =>
        deps.readPostgresUserRitualEvents({
          userId,
          market,
          assetClass,
          limit: 120,
        }),
      )) ||
      repo.listUserRitualEvents({
        userId,
        market,
        assetClass,
        limit: 120,
      });

    const snapshot = buildEngagementSnapshot({
      userId,
      market,
      assetClass,
      localDate: localDateOrToday(args.localDate),
      localHour: localHourOrNow(args.localHour),
      locale: args.locale,
      decisionRow: current,
      previousDecisionRow: previous,
      ritualEvents: rituals,
      notificationPreferences: preferences,
    });

    let persistedNotifications = repo.listNotificationEvents({
      userId,
      market,
      assetClass,
      status: 'ACTIVE',
      limit: 12,
    });
    const primaryNotifications = await deps.cachedFrontendRead(
      'engagement_notifications',
      { userId, market, assetClass, status: 'ACTIVE', limit: 12 },
      async () =>
        await deps.tryPrimaryPostgresRead('engagement_notifications', async () =>
          deps.readPostgresNotificationEvents({
            userId,
            market,
            assetClass,
            status: 'ACTIVE',
            limit: 12,
          }),
        ),
      Math.max(15_000, Number(process.env.NOVA_ENGAGEMENT_NOTIFICATIONS_CACHE_TTL_MS || 60_000)),
    );
    const existingNotificationIds = new Set(
      (primaryNotifications || persistedNotifications).map((row: any) => row.id),
    );
    let insertedNotifications = false;
    for (const notification of snapshot.notification_center.notifications || []) {
      if (existingNotificationIds.has(notification.id)) continue;
      existingNotificationIds.add(notification.id);
      insertedNotifications = true;
      repo.upsertNotificationEvent(notification);
    }
    if (insertedNotifications) {
      persistedNotifications = repo.listNotificationEvents({
        userId,
        market,
        assetClass,
        status: 'ACTIVE',
        limit: 12,
      });
    }

    const wrapUpCacheKey = `wrap-${userId}:${market}:${assetClass}:${current?.snapshot_date || 'none'}`;
    const wrapUpCached = deps.wrapUpLanguageCache.get(wrapUpCacheKey);
    const wrapUpTtlMs = Math.max(
      60_000,
      Number(process.env.NOVA_ENRICHMENT_TTL_MS || 2 * 60 * 60 * 1000),
    );
    let enrichedSnapshot: typeof snapshot;
    if (
      !shouldEnrichWrapUpLanguage({
        userId,
        snapshot,
        currentDecisionId: current?.id || null,
        skipLanguage: args.skipLanguage,
      })
    ) {
      enrichedSnapshot = snapshot;
    } else if (wrapUpCached && Date.now() - wrapUpCached.ts < wrapUpTtlMs) {
      enrichedSnapshot = snapshot;
    } else {
      const result = await applyLocalNovaWrapUpLanguage({
        repo,
        userId,
        locale: args.locale,
        engagement: snapshot,
        decision: {
          today_call: parseOptionalJson(current?.summary_json)?.today_call || null,
          risk_state: parseOptionalJson(current?.risk_state_json) || {},
          ranked_action_cards: deps.parseJsonArray(current?.actions_json),
        },
      });
      deps.wrapUpLanguageCache.set(wrapUpCacheKey, { ts: Date.now(), patch: {} });
      if (deps.wrapUpLanguageCache.size > 200) {
        const oldest = deps.wrapUpLanguageCache.keys().next().value;
        if (oldest) deps.wrapUpLanguageCache.delete(oldest);
      }
      enrichedSnapshot = result;
    }

    return {
      ...enrichedSnapshot,
      notification_center: {
        ...((enrichedSnapshot.notification_center as Record<string, unknown>) || {}),
        active_count: (primaryNotifications || persistedNotifications).length,
        notifications: serializeNotificationRows(primaryNotifications || persistedNotifications),
      },
      decision_snapshot_id: current?.id || null,
    };
  }

  function buildRitualEventId(args: {
    userId: string;
    market: Market;
    assetClass: AssetClass | 'ALL';
    eventDate: string;
    eventType: string;
  }) {
    return `ritual-${createHash('sha256')
      .update(
        `${args.userId}:${args.market}:${args.assetClass}:${args.eventDate}:${args.eventType}`,
      )
      .digest('hex')
      .slice(0, 20)}`;
  }

  async function recordRitualEvent(args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    localDate?: string;
    localHour?: number;
    locale?: string;
    eventType:
      | 'MORNING_CHECK_COMPLETED'
      | 'RISK_BOUNDARY_CONFIRMED'
      | 'WRAP_UP_COMPLETED'
      | 'WEEKLY_REVIEW_COMPLETED';
    reason?: Record<string, unknown>;
    holdings?: UserHoldingInput[];
  }) {
    const repo = deps.getRepo();
    const userId = args.userId || 'guest-default';
    const market = args.market || 'US';
    const assetClass = args.assetClass || 'ALL';
    const eventDate = localDateOrToday(args.localDate);
    const { current } = await getDecisionRowsForEngagement(args);
    const summary = parseOptionalJson(current?.summary_json);
    const nowMs = Date.now();

    repo.upsertUserRitualEvent({
      id: buildRitualEventId({
        userId,
        market,
        assetClass,
        eventDate,
        eventType: args.eventType,
      }),
      user_id: userId,
      market,
      asset_class: assetClass,
      event_date: eventDate,
      week_key: args.eventType === 'WEEKLY_REVIEW_COMPLETED' ? weekStartKey(eventDate) : null,
      event_type: args.eventType,
      snapshot_id: current?.id || null,
      reason_json: JSON.stringify({
        risk_posture: summary?.risk_posture || null,
        top_action_id: current?.top_action_id || null,
        today_call: summary?.today_call || null,
        ...(args.reason || {}),
      }),
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });

    return getEngagementState({
      userId,
      market,
      assetClass: assetClass === 'ALL' ? undefined : assetClass,
      localDate: eventDate,
      localHour: args.localHour,
      holdings: args.holdings,
      locale: args.locale,
    });
  }

  async function completeMorningCheck(args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    localDate?: string;
    localHour?: number;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) {
    return recordRitualEvent({
      ...args,
      eventType: 'MORNING_CHECK_COMPLETED',
      reason: { source: 'today_check' },
    });
  }

  async function confirmRiskBoundary(args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    localDate?: string;
    localHour?: number;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) {
    return recordRitualEvent({
      ...args,
      eventType: 'RISK_BOUNDARY_CONFIRMED',
      reason: { source: 'user_boundary_confirmation' },
    });
  }

  async function completeWrapUp(args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    localDate?: string;
    localHour?: number;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) {
    return recordRitualEvent({
      ...args,
      eventType: 'WRAP_UP_COMPLETED',
      reason: { source: 'daily_wrap_up' },
    });
  }

  async function completeWeeklyReview(args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    localDate?: string;
    localHour?: number;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) {
    return recordRitualEvent({
      ...args,
      eventType: 'WEEKLY_REVIEW_COMPLETED',
      reason: { source: 'weekly_review' },
    });
  }

  async function getWidgetSummary(args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    localDate?: string;
    localHour?: number;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) {
    const snapshot = await getEngagementState({
      ...args,
      skipLanguage: true,
    });
    return {
      as_of: snapshot.as_of,
      source_status: snapshot.source_status,
      data_status: snapshot.data_status,
      perception_layer: snapshot.perception_layer,
      widget_summary: snapshot.widget_summary,
      ui_regime_state: snapshot.ui_regime_state,
      recommendation_change: snapshot.recommendation_change,
    };
  }

  async function getNotificationPreview(args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    localDate?: string;
    localHour?: number;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) {
    const snapshot = await getEngagementState({
      ...args,
      skipLanguage: true,
    });
    return {
      as_of: snapshot.as_of,
      source_status: snapshot.source_status,
      data_status: snapshot.data_status,
      notification_center: snapshot.notification_center,
    };
  }

  function getNotificationPreferencesState(userId = 'guest-default') {
    const repo = deps.getRepo();
    return resolveNotificationPreferences(repo, userId);
  }

  function setNotificationPreferencesState(args: {
    userId?: string;
    updates: Partial<{
      morning_enabled: number;
      state_shift_enabled: number;
      protective_enabled: number;
      wrap_up_enabled: number;
      frequency: 'LOW' | 'NORMAL';
      quiet_start_hour: number | null;
      quiet_end_hour: number | null;
    }>;
  }) {
    const repo = deps.getRepo();
    const userId = args.userId || 'guest-default';
    const current = resolveNotificationPreferences(repo, userId);
    const sanitizedUpdates = Object.fromEntries(
      Object.entries(args.updates || {}).filter(([, value]) => value !== undefined),
    ) as typeof args.updates;
    const next = {
      ...current,
      ...sanitizedUpdates,
      updated_at_ms: Date.now(),
    };
    repo.upsertUserNotificationPreferences(next);
    deps.invalidateFrontendReadCacheForUser(userId);
    return next;
  }

  return {
    getEngagementState,
    completeMorningCheck,
    confirmRiskBoundary,
    completeWrapUp,
    completeWeeklyReview,
    getWidgetSummary,
    getNotificationPreview,
    getNotificationPreferencesState,
    setNotificationPreferencesState,
  };
}

import { createHash } from 'node:crypto';
import type { AssetClass, DecisionSnapshotRecord, Market, UserHoldingInput } from '../../types.js';
import { buildDecisionSnapshot } from '../../decision/engine.js';
import {
  buildEngagementSnapshot,
  defaultNotificationPreferences,
} from '../../engagement/engine.js';
import { RUNTIME_STATUS } from '../../runtimeStatus.js';
import { createTraceId, recordAuditEvent } from '../../observability/spine.js';
import {
  applyLocalNovaDecisionLanguage,
  applyLocalNovaWrapUpLanguage,
} from '../../nova/service.js';
import { getPublicTodayDecision } from '../../public/todayDecisionService.js';
import { getConfig } from '../../config.js';
import { enrichWithQlibFeatures } from '../../../research/core/featureSignalLayer.js';
import { fetchQlibFactors } from '../../nova/qlibClient.js';
import { getTopSignalEvidence } from '../../evidence/engine.js';

type TodayReadDeps = {
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
  listExecutions: (args: { userId: string; market: Market; limit: number }) => any[];
  listExecutionsPrimary: (args: {
    userId: string;
    market: Market;
    limit: number;
  }) => Promise<any[]>;
  getLatestDecisionSnapshotPrimary: (args: {
    userId: string;
    market?: Market;
    assetClass?: AssetClass | 'ALL';
  }) => Promise<DecisionSnapshotRecord | null>;
  listDecisionSnapshotsPrimary: (args: {
    userId: string;
    market?: Market;
    assetClass?: AssetClass;
    limit?: number;
  }) => Promise<DecisionSnapshotRecord[] | null>;
  loadRuntimeStateCorePrimary: (args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    forceSync?: boolean;
  }) => Promise<any>;
  shouldUsePublicDecisionFallback: (args: {
    forceFallback?: boolean;
    sourceStatus?: string | null;
    signalCount?: number;
    decision?: Record<string, unknown> | null;
    holdings?: UserHoldingInput[];
    dbBackedStatus?: string;
  }) => boolean;
  shouldAvoidSyncHotPathFallback: () => boolean;
  parseJsonObject: (text: string | null | undefined) => Record<string, unknown> | null;
  parseJsonArray: (text: string | null | undefined) => Array<Record<string, unknown>>;
  buildRuntimeSignalEvidenceFromSignals: (
    signals: Array<Record<string, unknown>>,
    limit: number,
    sourceStatus: string,
  ) => {
    records: Array<Record<string, unknown>>;
  };
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

function snapshotDateKey(iso: string): string {
  return String(iso || '').slice(0, 10);
}

function decisionSnapshotFromRow(
  row: DecisionSnapshotRecord,
  parseJsonObject: TodayReadDeps['parseJsonObject'],
  parseJsonArray: TodayReadDeps['parseJsonArray'],
) {
  const summary = parseJsonObject(row.summary_json) || {};
  return {
    as_of: new Date(row.updated_at_ms).toISOString(),
    evidence_mode: row.evidence_mode,
    performance_mode: row.performance_mode,
    source_status: row.source_status,
    data_status: row.data_status,
    today_call: summary.today_call || null,
    risk_state: parseJsonObject(row.risk_state_json) || {},
    portfolio_context: parseJsonObject(row.portfolio_context_json) || {},
    ranked_action_cards: parseJsonArray(row.actions_json),
    top_action_id: row.top_action_id,
    summary,
    audit_snapshot_id: row.id,
    trace_id: null,
    from_cache: true,
  };
}

function buildDecisionContextHash(args: {
  userId: string;
  market: Market;
  assetClass?: AssetClass;
  riskProfileKey?: string | null;
  runtimeStatus: string;
  holdings?: UserHoldingInput[];
  topActions: Array<{ signal_id?: string; symbol?: string }>;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass || 'ALL',
        riskProfileKey: args.riskProfileKey || 'balanced',
        runtimeStatus: args.runtimeStatus,
        holdings: (args.holdings || []).map((row) => ({
          symbol: row.symbol,
          asset_class: row.asset_class,
          market: row.market,
          weight_pct: row.weight_pct,
          quantity: row.quantity,
          sector: row.sector,
        })),
        topActions: args.topActions,
      }),
    )
    .digest('hex');
}

export function createTodayReadApi(deps: TodayReadDeps) {
  function persistDecisionSnapshot(args: {
    core: any;
    decision: Record<string, unknown>;
    holdings?: UserHoldingInput[];
  }) {
    const snapshotDate = snapshotDateKey(String(args.core.runtimeTransparency.as_of));
    const contextHash = buildDecisionContextHash({
      userId: args.core.userId,
      market: args.core.market,
      assetClass: args.core.assetClass,
      riskProfileKey: args.core.risk?.profile_key,
      runtimeStatus: String(args.core.runtimeTransparency.source_status),
      holdings: args.holdings,
      topActions: (
        (args.decision.ranked_action_cards as Array<Record<string, unknown>> | undefined) || []
      ).map((row) => ({
        signal_id: String(row.signal_id || ''),
        symbol: String(row.symbol || ''),
      })),
    });
    const snapshotId = `decision-${createHash('sha256')
      .update(
        `${args.core.userId}:${args.core.market}:${args.core.assetClass || 'ALL'}:${snapshotDate}:${contextHash}`,
      )
      .digest('hex')
      .slice(0, 24)}`;
    const nowMs = Date.now();
    args.core.repo.upsertDecisionSnapshot({
      id: snapshotId,
      user_id: args.core.userId,
      market: args.core.market,
      asset_class: args.core.assetClass || 'ALL',
      snapshot_date: snapshotDate,
      context_hash: contextHash,
      evidence_mode: String(args.decision.evidence_mode || 'UNAVAILABLE'),
      performance_mode: String(args.decision.performance_mode || 'UNAVAILABLE'),
      source_status: String(args.decision.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
      data_status: String(args.decision.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
      risk_state_json: JSON.stringify(args.decision.risk_state || {}),
      portfolio_context_json: JSON.stringify(args.decision.portfolio_context || {}),
      actions_json: JSON.stringify(args.decision.ranked_action_cards || []),
      summary_json: JSON.stringify(args.decision.summary || {}),
      top_action_id: String(args.decision.top_action_id || '') || null,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
    const traceId = createTraceId('decision');
    recordAuditEvent(args.core.repo, {
      traceId,
      scope: 'decision_engine',
      eventType: 'decision_snapshot_generated',
      userId: args.core.userId,
      entityType: 'decision_snapshot',
      entityId: snapshotId,
      payload: {
        market: args.core.market,
        asset_class: args.core.assetClass || 'ALL',
        top_action_id: args.decision.top_action_id || null,
        ranked_action_count: Array.isArray(args.decision.ranked_action_cards)
          ? args.decision.ranked_action_cards.length
          : 0,
        evidence_mode: args.decision.evidence_mode || 'UNAVAILABLE',
        performance_mode: args.decision.performance_mode || 'UNAVAILABLE',
        source_status: args.decision.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA,
        data_status: args.decision.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA,
      },
    });
    return {
      snapshotId,
      traceId,
    };
  }

  function buildDecisionSnapshotFromCore(args: {
    core: any;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) {
    const evidenceTop = getTopSignalEvidence(args.core.repo, {
      userId: args.core.userId,
      market: args.core.market,
      assetClass: args.core.assetClass,
      limit: 6,
    });
    const previousRow = args.core.repo.getLatestDecisionSnapshot({
      userId: args.core.userId,
      market: args.core.market,
      assetClass: args.core.assetClass || 'ALL',
    });
    const previousDecision = previousRow?.summary_json
      ? { summary: deps.parseJsonObject(previousRow.summary_json) || {} }
      : null;
    return buildDecisionSnapshot({
      userId: args.core.userId,
      market: args.core.market,
      assetClass: args.core.assetClass,
      asOf: String(args.core.runtimeTransparency.as_of),
      locale: args.locale,
      runtimeSourceStatus: String(args.core.runtimeTransparency.source_status),
      performanceSourceStatus: String(
        args.core.performanceSource || RUNTIME_STATUS.INSUFFICIENT_DATA,
      ),
      riskProfile: args.core.risk,
      signals: args.core.signals,
      evidenceSignals: evidenceTop.records || [],
      marketState: args.core.marketState,
      executions: deps.listExecutions({
        userId: args.core.userId,
        market: args.core.market,
        limit: 60,
      }),
      holdings: args.holdings,
      previousDecision,
    });
  }

  async function buildDecisionSnapshotFromCorePrimary(args: {
    core: any;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) {
    const avoidSyncFallback = deps.shouldAvoidSyncHotPathFallback();
    const runtimeSignals = Array.isArray(args.core.signals)
      ? (args.core.signals as Array<Record<string, unknown>>)
      : [];
    const qlibEnabled = getConfig().qlibBridge?.enabled === true;
    const enrichedSignals = qlibEnabled
      ? ((await enrichWithQlibFeatures(runtimeSignals, fetchQlibFactors)) as Array<
          Record<string, unknown>
        >)
      : runtimeSignals;

    let evidenceSignals: Record<string, unknown>[] = [];
    if (avoidSyncFallback) {
      evidenceSignals = deps.buildRuntimeSignalEvidenceFromSignals(
        runtimeSignals,
        6,
        String(args.core.runtimeTransparency.source_status || RUNTIME_STATUS.MODEL_DERIVED),
      ).records;
    } else {
      try {
        evidenceSignals =
          deps.buildRuntimeSignalEvidenceFromSignals(
            runtimeSignals,
            6,
            String(args.core.runtimeTransparency.source_status || RUNTIME_STATUS.MODEL_DERIVED),
          ).records || [];
      } catch (error) {
        console.warn(
          '[todayReads] evidence read failed in primary path:',
          error instanceof Error ? error.message : String(error),
        );
        evidenceSignals = deps.buildRuntimeSignalEvidenceFromSignals(
          runtimeSignals,
          6,
          String(args.core.runtimeTransparency.source_status || RUNTIME_STATUS.MODEL_DERIVED),
        ).records;
      }
    }
    const previousRow =
      (await deps.getLatestDecisionSnapshotPrimary({
        userId: args.core.userId,
        market: args.core.market,
        assetClass: args.core.assetClass || 'ALL',
      })) ||
      (avoidSyncFallback
        ? null
        : args.core.repo.getLatestDecisionSnapshot({
            userId: args.core.userId,
            market: args.core.market,
            assetClass: args.core.assetClass || 'ALL',
          }));
    const previousDecision = previousRow?.summary_json
      ? { summary: deps.parseJsonObject(previousRow.summary_json) || {} }
      : null;
    const executions = await deps.listExecutionsPrimary({
      userId: args.core.userId,
      market: args.core.market,
      limit: 60,
    });

    return buildDecisionSnapshot({
      userId: args.core.userId,
      market: args.core.market,
      assetClass: args.core.assetClass,
      asOf: String(args.core.runtimeTransparency.as_of),
      locale: args.locale,
      runtimeSourceStatus: String(args.core.runtimeTransparency.source_status),
      performanceSourceStatus: String(
        args.core.performanceSource || RUNTIME_STATUS.INSUFFICIENT_DATA,
      ),
      riskProfile: args.core.risk,
      signals: enrichedSignals as unknown as typeof args.core.signals,
      evidenceSignals,
      marketState: args.core.marketState,
      executions,
      holdings: args.holdings,
      previousDecision,
    });
  }

  async function getDecisionSnapshot(args: {
    userId?: string;
    market?: Market;
    assetClass?: AssetClass;
    holdings?: UserHoldingInput[];
    locale?: string;
  }) {
    const avoidSyncFallback = deps.shouldAvoidSyncHotPathFallback();
    if (avoidSyncFallback && (!Array.isArray(args.holdings) || args.holdings.length === 0)) {
      return await getPublicTodayDecision({
        userId: args.userId,
        market: args.market,
        assetClass: args.assetClass,
        locale: args.locale,
      });
    }
    const core = await deps.loadRuntimeStateCorePrimary({
      ...args,
      forceSync: true,
    });
    const deterministic = await buildDecisionSnapshotFromCorePrimary({
      core,
      holdings: args.holdings,
      locale: args.locale,
    });
    if (
      deps.shouldUsePublicDecisionFallback({
        sourceStatus: String(core.runtimeTransparency.source_status || ''),
        signalCount: core.signals.length,
        decision: deterministic as Record<string, unknown>,
        holdings: args.holdings,
      })
    ) {
      return await getPublicTodayDecision({
        userId: core.userId,
        market: core.market,
        assetClass: core.assetClass,
        locale: args.locale,
      });
    }
    if (avoidSyncFallback) {
      const hotPathAuditHash = createHash('sha1')
        .update(
          JSON.stringify({
            userId: core.userId,
            market: core.market,
            assetClass: core.assetClass || 'ALL',
            asOf: core.runtimeTransparency.as_of,
            holdings: args.holdings || [],
            topActionIds: (
              (deterministic.ranked_action_cards as Array<Record<string, unknown>> | undefined) ||
              []
            ).map((row) => String(row.action_id || row.signal_id || '')),
          }),
        )
        .digest('hex')
        .slice(0, 24);
      return {
        ...deterministic,
        audit_snapshot_id: `decision-hot-${hotPathAuditHash}`,
        trace_id: null,
        from_cache: false,
      };
    }
    const snapshotDate = snapshotDateKey(String(core.runtimeTransparency.as_of));
    const contextHash = buildDecisionContextHash({
      userId: core.userId,
      market: core.market,
      assetClass: core.assetClass,
      riskProfileKey: core.risk?.profile_key,
      runtimeStatus: String(core.runtimeTransparency.source_status),
      holdings: args.holdings,
      topActions: (
        (deterministic.ranked_action_cards as Array<Record<string, unknown>> | undefined) || []
      ).map((row) => ({
        signal_id: String(row.signal_id || ''),
        symbol: String(row.symbol || ''),
      })),
    });
    const latest =
      (await deps.getLatestDecisionSnapshotPrimary({
        userId: core.userId,
        market: core.market,
        assetClass: core.assetClass || 'ALL',
      })) ||
      (avoidSyncFallback
        ? null
        : core.repo.getLatestDecisionSnapshot({
            userId: core.userId,
            market: core.market,
            assetClass: core.assetClass || 'ALL',
          }));
    const latestSummary = deps.parseJsonObject(latest?.summary_json);
    const latestNovaMeta =
      latestSummary?.nova_local && typeof latestSummary.nova_local === 'object'
        ? (latestSummary.nova_local as Record<string, unknown>)
        : null;
    const cachedNovaApplied = Boolean(latestNovaMeta?.applied);
    const cachedNovaAttempted = Boolean(latestNovaMeta?.attempted);
    const NOVA_ENRICHMENT_TTL_MS = Math.max(
      60_000,
      Number(process.env.NOVA_ENRICHMENT_TTL_MS || 2 * 60 * 60 * 1000),
    );
    const cachedNovaFreshFailure =
      cachedNovaAttempted && !cachedNovaApplied && latest
        ? Date.now() - latest.updated_at_ms < NOVA_ENRICHMENT_TTL_MS
        : false;
    const novaEnrichmentStillFresh =
      latest &&
      latest.snapshot_date === snapshotDate &&
      cachedNovaApplied &&
      Date.now() - latest.updated_at_ms < NOVA_ENRICHMENT_TTL_MS;
    if (
      novaEnrichmentStillFresh ||
      (latest &&
        latest.snapshot_date === snapshotDate &&
        latest.context_hash === contextHash &&
        (cachedNovaApplied ||
          cachedNovaFreshFailure ||
          String(process.env.NOVA_DISABLE_LOCAL_GENERATION || '') === '1'))
    ) {
      return decisionSnapshotFromRow(latest, deps.parseJsonObject, deps.parseJsonArray);
    }
    const enriched = await applyLocalNovaDecisionLanguage({
      repo: core.repo,
      userId: core.userId,
      locale: args.locale,
      decision: deterministic as Record<string, unknown>,
    });
    const persisted = persistDecisionSnapshot({
      core,
      decision: enriched,
      holdings: args.holdings,
    });
    return {
      ...enriched,
      audit_snapshot_id: persisted.snapshotId,
      trace_id: persisted.traceId,
    };
  }

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
    const ENGAGEMENT_DECISION_REUSE_TTL_MS = Math.max(
      60_000,
      Number(process.env.NOVA_ENRICHMENT_TTL_MS || 2 * 60 * 60 * 1000),
    );
    const canReuseLatest =
      !args.holdings?.length &&
      latest &&
      Date.now() - latest.updated_at_ms < ENGAGEMENT_DECISION_REUSE_TTL_MS;
    if (!canReuseLatest) {
      await getDecisionSnapshot(args);
      rows = await readRows(true);
    }
    const current = rows[0] || null;
    const previous = rows[1] || null;
    return { current, previous };
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
    const WRAP_UP_TTL_MS = Math.max(
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
    } else if (wrapUpCached && Date.now() - wrapUpCached.ts < WRAP_UP_TTL_MS) {
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
    buildDecisionSnapshotFromCore,
    buildDecisionSnapshotFromCorePrimary,
    getDecisionSnapshot,
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

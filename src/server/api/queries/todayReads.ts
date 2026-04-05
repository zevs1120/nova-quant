import { createHash } from 'node:crypto';
import type { AssetClass, DecisionSnapshotRecord, Market, UserHoldingInput } from '../../types.js';
import { buildDecisionSnapshot } from '../../decision/engine.js';
import { RUNTIME_STATUS } from '../../runtimeStatus.js';
import { createTraceId, recordAuditEvent } from '../../observability/spine.js';
import { applyLocalNovaDecisionLanguage } from '../../nova/service.js';
import { getPublicTodayDecision } from '../../public/todayDecisionService.js';
import { getConfig } from '../../config.js';
import { enrichWithQlibFeatures } from '../../../research/core/featureSignalLayer.js';
import { fetchQlibFactors } from '../../nova/qlibClient.js';
import { getTopSignalEvidence } from '../../evidence/engine.js';

type TodayReadDeps = {
  getRepo: () => any;
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
};

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

  return {
    buildDecisionSnapshotFromCore,
    buildDecisionSnapshotFromCorePrimary,
    getDecisionSnapshot,
  };
}

import { MarketRepository } from '../db/repository.js';
import { getRuntimeRepo, resetRuntimeRepoSingleton } from '../db/runtimeRepository.js';
import type {
  Asset,
  AssetClass,
  DecisionSnapshotRecord,
  ExecutionAction,
  ExecutionMode,
  Market,
  NovaTaskType,
  RiskProfileKey,
  SignalContract,
  Timeframe,
  UserHoldingInput,
  WorkflowRunRecord,
} from '../types.js';
import { createExecutionRecord, decodeSignalContract, ensureQuantData } from '../quant/service.js';
import { enrichWithQlibFeatures } from '../../research/core/featureSignalLayer.js';
import { fetchQlibFactors } from '../nova/qlibClient.js';
import {
  getBacktestEvidenceDetail,
  getChampionStrategies,
  getSignalEvidenceDetail,
  getTopSignalEvidence,
  listBacktestEvidence,
  listReconciliationEvidence,
  runEvidenceEngine,
} from '../evidence/engine.js';
import { runQlibNativeBacktestEvidence } from '../evidence/qlibNative.js';
import type { QlibNativeBacktestRequest } from '../nova/qlibClient.js';
import {
  runQlibResearchFactory as runQlibResearchFactoryService,
  type QlibResearchFactoryInput,
} from '../research/qlibFactory.js';
import { getConfig } from '../config.js';
import {
  RUNTIME_STATUS,
  derivePerformanceSourceStatus,
  normalizeRuntimeStatus,
  withComponentStatus,
} from '../runtimeStatus.js';
import { buildDecisionSnapshot } from '../decision/engine.js';
import { buildEngagementSnapshot, defaultNotificationPreferences } from '../engagement/engine.js';
import { buildBackendBackboneSummary } from '../backbone/service.js';
import { getOutcomeSummaryStats } from '../outcome/resolver.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';
import { applyLocalNovaDecisionLanguage, applyLocalNovaWrapUpLanguage } from '../nova/service.js';
import { resolveEffectiveTextRoute } from '../nova/client.js';
import { buildMlxLmTrainingDataset } from '../nova/training.js';
import {
  getNovaModelPlan,
  getNovaRoutingPolicies,
  getNovaRuntimeAvailabilityReason,
  getNovaRuntimeMode,
} from '../ai/llmOps.js';
import { inspectNovaHealth } from '../nova/health.js';
import { labelNovaRun } from '../nova/service.js';
import {
  MIN_AUTOMATIC_TRAINING_ROWS,
  runNovaTrainingFlywheel,
  type NovaTrainerKind,
} from '../nova/flywheel.js';
import { generateGovernedNovaStrategies } from '../nova/strategyLab.js';
import { generateNovaProductionStrategyPack } from '../nova/productionStrategyPack.js';
import { runNovaRobustnessTraining } from '../nova/robustnessTraining.js';
import { buildEvidenceLineage } from '../evidence/lineage.js';
import { getBrowseHomePayload, getReferenceSearchAssetCount } from './queries/browseReads.js';
import {
  applyPublicDecisionToRuntime,
  buildRuntimeStateSnapshot,
  shouldUsePublicDecisionFallback,
} from './queries/runtimeReads.js';
import { createEngagementReadApi } from './queries/engagementReads.js';
import { createPortfolioReadApi } from './queries/portfolioReads.js';
import { createTodayReadApi } from './queries/todayReads.js';
import {
  FRONTEND_READ_CACHE_TTL_MS,
  cachedFrontendRead,
  tryPrimaryPostgresRead,
  shouldPreferPostgresPrimaryReads,
  shouldAvoidSyncHotPathFallback,
  invalidateFrontendReadCacheForUser,
} from './queries/frontendReadCache.js';
import {
  resolveControlPlaneScope,
  runCachedControlPlaneRead,
} from './queries/controlPlaneStatusCache.js';
import {
  buildPerformanceSummaryFromRows,
  buildPerformanceSummaryFromRowsOrEmpty,
  buildMarketModulesFromRows,
} from './queries/marketPerformanceProjection.js';
import {
  toUiSignal,
  buildRuntimeSignalEvidenceFromContracts,
  buildRuntimeSignalEvidenceFromSignals,
} from './queries/runtimeSignalProjection.js';
import {
  deriveSignalNotional,
  inferExecutionProvider,
  parseLiveExecutionNote,
  signalEntryMid,
  signalExecutionSide,
  stringifyLiveExecutionNote,
  stringifyShadowExecutionNote,
} from './queries/executionLiveNotes.js';
import {
  buildExecutionGovernance as buildExecutionGovernanceCore,
  executionGovernanceThresholds,
  type LiveOrderStatusResult,
} from './queries/executionGovernanceCore.js';
import { createPublicSignalsApiKeyHandlers } from './queries/publicSignalsApiKey.js';

export {
  invalidateFrontendReadCacheForUser,
  __resetFrontendReadCacheForTesting,
  __resetPgPrimaryReadFailureCooldownForTesting,
} from './queries/frontendReadCache.js';

export { __resetControlPlaneStatusCacheForTesting } from './queries/controlPlaneStatusCache.js';

export {
  searchAssets,
  getSearchHealth,
  getBrowseHomePayload,
  getBrowseAssetChart,
  getBrowseNewsFeed,
  getBrowseAssetOverview,
  getBrowseAssetDetailBundle,
} from './queries/browseReads.js';
export { shouldUsePublicDecisionFallback } from './queries/runtimeReads.js';
import { getPublicTodayDecision } from '../public/todayDecisionService.js';
import {
  createBrokerAdapter,
  createExchangeAdapter,
  type OrderStatusSnapshot,
} from '../connect/adapters.js';
import { buildLocalAdminAlphaSnapshot } from '../admin/liveAlpha.js';
import { buildLocalAdminResearchOpsSnapshot } from '../admin/liveOps.js';
import { getManualDashboard } from '../manual/service.js';
import { getMembershipState } from '../membership/service.js';
import {
  readPostgresApiKeyByHash,
  readPostgresAssets,
  readPostgresDecisionSnapshots,
  readPostgresExecutionRecords,
  readPostgresExternalConnections,
  readPostgresLatestDecisionSnapshot,
  readPostgresMarketState,
  readPostgresNewsItems,
  readPostgresNotificationEvents,
  readPostgresNotificationPreferences,
  readPostgresPerformanceSnapshots,
  readPostgresRiskProfile,
  readPostgresSignalListItems,
  readPostgresSignalRecord,
  readPostgresSignalRecords,
  readPostgresRuntimeStateBundle,
  readPostgresUserRitualEvents,
  readPostgresWorkflowRuns,
} from '../admin/postgresBusinessRead.js';
import { isGuestScopedUserId } from './helpers.js';
import {
  buildSignalListItemFromContract,
  type SignalListItem,
} from '../quant/signalListProjection.js';

const RISK_PROFILE_PRESETS = {
  conservative: {
    max_loss_per_trade: 0.7,
    max_daily_loss: 1.8,
    max_drawdown: 8,
    exposure_cap: 35,
    leverage_cap: 1.5,
  },
  balanced: {
    max_loss_per_trade: 1.0,
    max_daily_loss: 3.0,
    max_drawdown: 12,
    exposure_cap: 55,
    leverage_cap: 2,
  },
  aggressive: {
    max_loss_per_trade: 1.4,
    max_daily_loss: 4.5,
    max_drawdown: 18,
    exposure_cap: 75,
    leverage_cap: 3,
  },
} as const;

const RECENT_OUTCOME_SUMMARY_CACHE_TTL_MS = Math.max(FRONTEND_READ_CACHE_TTL_MS, 60_000);
const RUNTIME_STATE_SIGNAL_LIMIT = Math.max(
  8,
  Number(process.env.NOVA_RUNTIME_STATE_SIGNAL_LIMIT || 24),
);
const RUNTIME_STATE_MARKET_STATE_LIMIT = Math.max(
  12,
  Number(process.env.NOVA_RUNTIME_STATE_MARKET_STATE_LIMIT || 24),
);
const RUNTIME_STATE_TRADE_LIMIT = Math.max(
  20,
  Number(process.env.NOVA_RUNTIME_STATE_TRADE_LIMIT || 60),
);
const wrapUpLanguageCache = new Map<string, { ts: number; patch: Record<string, unknown> }>();

function getRepo(): MarketRepository {
  return getRuntimeRepo();
}

/** Must be called alongside closeDb() to avoid stale-handle usage. */
export function resetRepoSingleton(): void {
  resetRuntimeRepoSingleton();
}

function createLazyMarketRepository(): MarketRepository {
  let resolved: MarketRepository | null = null;
  const ensure = () => {
    if (!resolved) {
      resolved = getRepo();
    }
    return resolved;
  };
  return new Proxy({} as MarketRepository, {
    get(_target, prop) {
      const value = ensure()[prop as keyof MarketRepository];
      return typeof value === 'function' ? value.bind(ensure()) : value;
    },
  });
}

const {
  ensureDefaultPublicSignalsApiKey,
  verifyPublicSignalsApiKey,
  verifyPublicSignalsApiKeyPrimary,
} = createPublicSignalsApiKeyHandlers({
  getRepo,
  tryPrimaryPostgresRead,
  readPostgresApiKeyByHash,
});

export {
  ensureDefaultPublicSignalsApiKey,
  verifyPublicSignalsApiKey,
  verifyPublicSignalsApiKeyPrimary,
};

export async function listSignalContractsPrimary(args: {
  userId?: string;
  assetClass?: AssetClass;
  market?: Market;
  symbol?: string;
  status?: 'ALL' | 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED';
  limit?: number;
}): Promise<SignalContract[]> {
  const rows = await tryPrimaryPostgresRead('signals', async () =>
    readPostgresSignalRecords({
      assetClass: args.assetClass,
      market: args.market,
      symbol: args.symbol,
      status: args.status,
      limit: args.limit,
    }),
  );
  if (!rows) {
    if (shouldAvoidSyncHotPathFallback()) {
      return [];
    }
    return listSignalContracts(args);
  }
  return rows
    .map((row) => decodeSignalContract(row))
    .filter((row): row is SignalContract => Boolean(row));
}

export async function listSignalContractSummariesPrimary(args: {
  userId?: string;
  assetClass?: AssetClass;
  market?: Market;
  symbol?: string;
  status?: 'ALL' | 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED';
  limit?: number;
}): Promise<SignalListItem[]> {
  return cachedFrontendRead(
    'signals_list',
    {
      userId: args.userId || 'guest-default',
      assetClass: args.assetClass || 'ALL',
      market: args.market || 'ALL',
      symbol: args.symbol || null,
      status: args.status || 'ALL',
      limit: Number(args.limit || 0),
    },
    async () => {
      const rows = await tryPrimaryPostgresRead('signals_list', async () =>
        readPostgresSignalListItems({
          assetClass: args.assetClass,
          market: args.market,
          symbol: args.symbol,
          status: args.status,
          limit: args.limit,
        }),
      );
      if (!rows) {
        if (shouldAvoidSyncHotPathFallback()) {
          return [];
        }
        return listSignalContractSummaries(args);
      }
      return rows;
    },
    15_000,
  );
}

export async function getSignalContractPrimary(
  signalId: string,
  userId = 'guest-default',
): Promise<SignalContract | null> {
  const row = await tryPrimaryPostgresRead('signal', async () =>
    readPostgresSignalRecord(signalId),
  );
  if (!row) {
    if (shouldAvoidSyncHotPathFallback()) {
      return null;
    }
    return getSignalContract(signalId, userId);
  }
  return decodeSignalContract(row);
}

export async function listExecutionsPrimary(args: {
  userId?: string;
  market?: Market;
  mode?: ExecutionMode;
  signalId?: string;
  limit?: number;
}) {
  return cachedFrontendRead(
    'executions',
    {
      userId: args.userId || 'guest-default',
      market: args.market || 'ALL',
      mode: args.mode || 'ALL',
      signalId: args.signalId || null,
      limit: Number(args.limit || 0),
    },
    async () => {
      const rows = await tryPrimaryPostgresRead('executions', async () =>
        readPostgresExecutionRecords(args),
      );
      if (rows) return rows;
      if (shouldAvoidSyncHotPathFallback()) return [];
      return listExecutions(args);
    },
    10_000,
  );
}

export async function getMarketStatePrimary(args: {
  userId?: string;
  market?: Market;
  symbol?: string;
  timeframe?: string;
  limit?: number;
}) {
  return cachedFrontendRead(
    'market_state',
    {
      userId: args.userId || 'guest-default',
      market: args.market || 'ALL',
      symbol: args.symbol || null,
      timeframe: args.timeframe || null,
      limit: Number(args.limit || 0),
    },
    async () => {
      const rows = await tryPrimaryPostgresRead('market_state', async () =>
        readPostgresMarketState({
          market: args.market,
          symbol: args.symbol,
          timeframe: args.timeframe,
          limit: args.limit,
        }),
      );
      if (rows) return rows;
      if (shouldAvoidSyncHotPathFallback()) return [];
      const fallback = getMarketState(args);
      return Number.isFinite(Number(args.limit))
        ? fallback.slice(0, Math.max(1, Number(args.limit || 1)))
        : fallback;
    },
    15_000,
  );
}

export async function getPerformanceSummaryPrimary(args: {
  userId?: string;
  market?: Market;
  range?: string;
  asofIso?: string;
  sourceStatus?: string;
}) {
  return cachedFrontendRead(
    'performance',
    {
      userId: args.userId || 'guest-default',
      market: args.market || 'ALL',
      range: args.range || 'ALL',
    },
    async () => {
      const rows = await tryPrimaryPostgresRead('performance', async () =>
        readPostgresPerformanceSnapshots({
          market: args.market,
          range: args.range,
        }),
      );
      if (!rows && !shouldAvoidSyncHotPathFallback()) {
        return getPerformanceSummary(args);
      }
      return buildPerformanceSummaryFromRowsOrEmpty({
        rows,
        asofIso: args.asofIso || new Date().toISOString(),
        sourceStatus:
          rows && rows.length
            ? args.sourceStatus || RUNTIME_STATUS.DB_BACKED
            : RUNTIME_STATUS.INSUFFICIENT_DATA,
      });
    },
    15_000,
  );
}

export async function getMarketModulesPrimary(args?: { market?: Market; assetClass?: AssetClass }) {
  return cachedFrontendRead(
    'market_modules',
    {
      market: args?.market || 'ALL',
      assetClass: args?.assetClass || 'ALL',
    },
    async () => {
      const rows = await tryPrimaryPostgresRead('market_modules', async () =>
        readPostgresMarketState({
          market: args?.market,
        }),
      );
      if (!rows && !shouldAvoidSyncHotPathFallback()) {
        return getMarketModules(args);
      }
      return buildMarketModulesFromRows(rows || [], args);
    },
    15_000,
  );
}

export async function listAssetsPrimary(market?: Market): Promise<Asset[]> {
  return cachedFrontendRead(
    'assets',
    {
      market: market || 'ALL',
    },
    async () => {
      const rows = await tryPrimaryPostgresRead('assets', async () =>
        readPostgresAssets({
          market,
        }),
      );
      if (rows) return rows;
      if (shouldAvoidSyncHotPathFallback()) return [];
      return listAssets(market);
    },
    60_000,
  );
}

export async function getNotificationPreferencesStatePrimary(userId = 'guest-default') {
  const row = await cachedFrontendRead(
    'notification_preferences',
    { userId },
    async () =>
      await tryPrimaryPostgresRead('notification_preferences', async () =>
        readPostgresNotificationPreferences(userId),
      ),
    Math.max(15_000, Number(process.env.NOVA_NOTIFICATION_PREFERENCES_CACHE_TTL_MS || 60_000)),
  );
  if (row) return row;
  return getNotificationPreferencesState(userId);
}

async function getLatestDecisionSnapshotPrimary(args: {
  userId: string;
  market?: Market | 'ALL';
  assetClass?: AssetClass | 'ALL';
}) {
  const row = await cachedFrontendRead(
    'decision_snapshot_latest',
    args,
    async () =>
      await tryPrimaryPostgresRead('decision_snapshot_latest', async () =>
        readPostgresLatestDecisionSnapshot(args),
      ),
    Math.max(15_000, Number(process.env.NOVA_DECISION_SNAPSHOT_CACHE_TTL_MS || 60_000)),
  );
  return row;
}

async function listDecisionSnapshotsPrimary(args: {
  userId: string;
  market?: Market | 'ALL';
  assetClass?: AssetClass | 'ALL';
  limit?: number;
}) {
  const rows = await cachedFrontendRead(
    'decision_snapshots',
    args,
    async () =>
      await tryPrimaryPostgresRead('decision_snapshots', async () =>
        readPostgresDecisionSnapshots(args),
      ),
    Math.max(15_000, Number(process.env.NOVA_DECISION_SNAPSHOT_CACHE_TTL_MS || 60_000)),
  );
  return rows;
}

type RuntimeSyncContext = {
  riskProfileKey?: RiskProfileKey;
  market?: Market;
  assetClass?: AssetClass;
  timeframe?: string;
  universeScope?: string;
  allowBackgroundStrategyRefresh?: boolean;
};

export function listAssets(market?: Market) {
  const repo = getRepo();
  return repo.listAssets(market);
}

async function getSearchHealthPrimary(args?: {
  market?: Market;
  query?: string;
  resultCount?: number;
}) {
  const liveAssets = (await listAssetsPrimary(args?.market)).length;
  const referenceAssets = getReferenceSearchAssetCount(args?.market);
  const query = String(args?.query || '').trim();
  const resultCount = Number(args?.resultCount || 0);
  const status =
    resultCount > 0 ? 'READY' : liveAssets > 0 || referenceAssets > 0 ? 'DEGRADED' : 'UNAVAILABLE';
  const reason =
    resultCount > 0
      ? null
      : !query
        ? 'QUERY_EMPTY'
        : liveAssets === 0 && referenceAssets === 0
          ? 'NO_ASSET_UNIVERSE'
          : 'NO_MATCHES';

  return {
    status,
    reason,
    market: args?.market || 'ALL',
    query: query || null,
    result_count: resultCount,
    live_asset_count: liveAssets,
    reference_asset_count: referenceAssets,
    remote_lookup_enabled: query.length >= 2,
  };
}

export function queryOhlcv(args: {
  market: Market;
  symbol: string;
  timeframe: Timeframe;
  start?: number;
  end?: number;
  limit?: number;
}) {
  const repo = getRepo();
  const asset = repo.getAssetBySymbol(args.market, args.symbol);
  if (!asset) {
    return { asset: null, rows: [] as ReturnType<typeof repo.getOhlcv> };
  }

  const rows = repo.getOhlcv({
    assetId: asset.asset_id,
    timeframe: args.timeframe,
    start: args.start,
    end: args.end,
    limit: args.limit,
  });

  return { asset, rows };
}

export function syncQuantState(
  userId = 'guest-default',
  force = false,
  context: RuntimeSyncContext = {},
) {
  const repo = getRepo();
  return ensureQuantData(repo, userId, force, {
    riskProfileKey: context.riskProfileKey,
    market: context.market,
    assetClass: context.assetClass,
    timeframe: context.timeframe,
    universeScope: context.universeScope,
    allowBackgroundStrategyRefresh: context.allowBackgroundStrategyRefresh,
  });
}

export function listSignalContracts(args: {
  userId?: string;
  assetClass?: AssetClass;
  market?: Market;
  symbol?: string;
  status?: 'ALL' | 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED';
  limit?: number;
}): SignalContract[] {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    assetClass: args.assetClass,
  });
  const rows = repo.listSignals({
    assetClass: args.assetClass,
    market: args.market,
    symbol: args.symbol,
    status: args.status,
    limit: args.limit,
  });
  return rows
    .map((row) => decodeSignalContract(row))
    .filter((row): row is SignalContract => Boolean(row));
}

export function listSignalContractSummaries(args: {
  userId?: string;
  assetClass?: AssetClass;
  market?: Market;
  symbol?: string;
  status?: 'ALL' | 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED';
  limit?: number;
}): SignalListItem[] {
  return listSignalContracts(args).map((row) =>
    buildSignalListItemFromContract(row as SignalContract & Record<string, unknown>),
  );
}

export function getSignalContract(
  signalId: string,
  userId = 'guest-default',
): SignalContract | null {
  const repo = getRepo();
  syncQuantState(userId);
  const row = repo.getSignal(signalId);
  if (!row) return null;
  return decodeSignalContract(row);
}

async function runExecutionGovernance(
  args: Omit<Parameters<typeof buildExecutionGovernanceCore>[0], 'getLiveOrderStatus'>,
) {
  return buildExecutionGovernanceCore({
    ...args,
    getLiveOrderStatus: (params) => getLiveOrderStatus(params) as Promise<LiveOrderStatusResult>,
  });
}

export function upsertExecution(args: {
  userId: string;
  signalId: string;
  mode: ExecutionMode;
  action: ExecutionAction;
  note?: string;
  pnlPct?: number | null;
}): { ok: boolean; executionId?: string; error?: string } {
  const repo = getRepo();
  syncQuantState(args.userId);
  const row = repo.getSignal(args.signalId);
  if (!row) return { ok: false, error: 'Signal not found' };
  const signal = decodeSignalContract(row);
  if (!signal) return { ok: false, error: 'Signal payload is invalid' };
  const execution = createExecutionRecord({
    signal,
    userId: args.userId,
    mode: args.mode,
    action: args.action,
    note: args.note,
    pnlPct: args.pnlPct,
  });
  repo.upsertExecution(execution);
  repo.appendSignalEvent(signal.id, `EXECUTION_${args.action}`, {
    mode: args.mode,
    execution_id: execution.execution_id,
  });
  syncQuantState(args.userId, true, {
    market: signal.market,
    assetClass: signal.asset_class,
  });
  return { ok: true, executionId: execution.execution_id };
}

export async function submitExecution(args: {
  userId: string;
  signalId: string;
  mode: ExecutionMode;
  action: ExecutionAction;
  note?: string;
  pnlPct?: number | null;
  provider?: string;
  qty?: number | null;
  notional?: number | null;
  orderType?: 'MARKET' | 'LIMIT';
  limitPrice?: number | null;
  timeInForce?: 'DAY' | 'GTC' | 'IOC' | 'FOK';
}) {
  if (args.mode !== 'LIVE') {
    return upsertExecution(args);
  }

  if (args.action !== 'EXECUTE') {
    return { ok: false, error: 'LIVE execution currently supports EXECUTE only.' };
  }

  const repo = getRepo();
  syncQuantState(args.userId);
  const row = repo.getSignal(args.signalId);
  if (!row) return { ok: false, error: 'Signal not found' };
  const signal = decodeSignalContract(row);
  if (!signal) return { ok: false, error: 'Signal payload is invalid' };

  try {
    const provider = inferExecutionProvider(signal, args.provider);
    const governance = await runExecutionGovernance({
      repo,
      userId: args.userId,
      provider,
      limit: 8,
      refreshOrders: true,
    });
    if (governance.kill_switch.active) {
      return {
        ok: false,
        error: `Execution kill switch is active. ${governance.kill_switch.reasons[0] || 'Live routing is temporarily blocked.'}`,
        governance,
      };
    }

    const side = signalExecutionSide(signal);
    const orderType =
      args.orderType ||
      (String(signal.entry_zone?.method || '')
        .toUpperCase()
        .includes('MARKET')
        ? 'MARKET'
        : 'LIMIT');
    const limitPrice = args.limitPrice ?? signalEntryMid(signal);
    const notional =
      args.notional ??
      (Number.isFinite(Number(args.qty)) && Number(args.qty) > 0
        ? null
        : await deriveSignalNotional(signal, provider));

    const orderRequest = {
      symbol: signal.symbol,
      side,
      type: orderType,
      qty: args.qty ?? null,
      notional,
      limit_price: limitPrice,
      time_in_force: args.timeInForce || (provider === 'BINANCE' ? 'GTC' : 'DAY'),
      client_order_id: `${args.userId.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 12)}_${Date.now()}`,
    } as const;

    const order =
      provider === 'ALPACA'
        ? await createBrokerAdapter(provider).submitOrder?.(orderRequest)
        : await createExchangeAdapter(provider).submitOrder?.(orderRequest);

    if (!order) {
      return {
        ok: false,
        error: `Provider ${provider} does not support live order routing in this build.`,
      };
    }

    const execution = createExecutionRecord({
      signal,
      userId: args.userId,
      mode: args.mode,
      action: args.action,
      note: stringifyLiveExecutionNote({
        provider,
        order,
        signal,
        expectedEntryPrice: signalEntryMid(signal),
        expectedNotional: notional,
        executionGuard: governance.kill_switch,
        userNote: args.note,
      }),
      pnlPct: args.pnlPct,
    });
    repo.upsertExecution(execution);

    let shadowExecutionId: string | null = null;
    try {
      const shadowExecution = createExecutionRecord({
        signal,
        userId: args.userId,
        mode: 'PAPER',
        action: 'EXECUTE',
        note: stringifyShadowExecutionNote({
          provider,
          signal,
          order,
          liveExecutionId: execution.execution_id,
          userNote: args.note,
        }),
        pnlPct: null,
      });
      repo.upsertExecution(shadowExecution);
      shadowExecutionId = shadowExecution.execution_id;
      execution.note = stringifyLiveExecutionNote({
        provider,
        order,
        signal,
        expectedEntryPrice: signalEntryMid(signal),
        expectedNotional: notional,
        shadowExecutionId,
        executionGuard: governance.kill_switch,
        userNote: args.note,
      });
      repo.upsertExecution(execution);
    } catch (shadowError) {
      execution.note = stringifyLiveExecutionNote({
        provider,
        order,
        signal,
        expectedEntryPrice: signalEntryMid(signal),
        expectedNotional: notional,
        executionGuard: {
          ...governance.kill_switch,
          shadow_error: shadowError instanceof Error ? shadowError.message : String(shadowError),
        },
        userNote: args.note,
      });
      repo.upsertExecution(execution);
    }

    repo.appendSignalEvent(signal.id, `EXECUTION_${args.action}`, {
      mode: args.mode,
      execution_id: execution.execution_id,
      provider,
      order_id: order.order_id,
      client_order_id: order.client_order_id,
      order_status: order.status,
      shadow_execution_id: shadowExecutionId,
      route_key: 'live_champion_paper_challenger',
    });
    syncQuantState(args.userId, true, {
      market: signal.market,
      assetClass: signal.asset_class,
    });
    return {
      ok: true,
      executionId: execution.execution_id,
      shadowExecutionId,
      order,
      governance,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getExecutionGovernance(args?: {
  userId?: string;
  provider?: string;
  limit?: number;
  refreshOrders?: boolean;
}) {
  const repo = getRepo();
  return runExecutionGovernance({
    repo,
    userId: args?.userId || 'guest-default',
    provider: args?.provider,
    limit: args?.limit,
    refreshOrders: args?.refreshOrders,
  });
}

export async function setExecutionKillSwitch(args: {
  userId?: string;
  enabled: boolean;
  reason?: string;
  provider?: string;
}) {
  const repo = getRepo();
  const now = Date.now();
  const userId = args.userId || 'guest-default';
  const provider = args.provider ? String(args.provider).trim().toUpperCase() : null;
  const id = `workflow-execution-kill-${now}-${Math.random().toString(36).slice(2, 8)}`;

  repo.upsertWorkflowRun({
    id,
    workflow_key: 'execution_kill_switch',
    workflow_version: 'execution-kill-switch.v1',
    trigger_type: 'manual',
    status: args.enabled ? 'PAUSED' : 'SUCCEEDED',
    trace_id: null,
    input_json: JSON.stringify({
      user_id: userId,
      provider,
    }),
    output_json: JSON.stringify({
      enabled: Boolean(args.enabled),
      reason: args.reason || null,
      provider,
    }),
    attempt_count: 1,
    started_at_ms: now,
    updated_at_ms: now,
    completed_at_ms: now,
  });

  return getExecutionGovernance({
    userId,
    provider: provider || undefined,
    limit: 12,
    refreshOrders: false,
  });
}

export async function getLiveOrderStatus(args: {
  provider: string;
  orderId?: string;
  clientOrderId?: string;
  symbol?: string;
}) {
  const provider = String(args.provider || '')
    .trim()
    .toUpperCase();
  if (!provider) return { ok: false, error: 'provider is required' };
  try {
    const order =
      provider === 'ALPACA'
        ? await createBrokerAdapter(provider).getOrder?.({
            orderId: args.orderId,
            clientOrderId: args.clientOrderId,
          })
        : await createExchangeAdapter(provider).getOrder?.({
            orderId: args.orderId,
            clientOrderId: args.clientOrderId,
            symbol: args.symbol,
          });
    if (!order) {
      return {
        ok: false,
        error: `Provider ${provider} does not support order lookup in this build.`,
      };
    }
    return { ok: true, order };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function cancelLiveOrder(args: {
  provider: string;
  orderId?: string;
  clientOrderId?: string;
  symbol?: string;
}) {
  const provider = String(args.provider || '')
    .trim()
    .toUpperCase();
  if (!provider) return { ok: false, error: 'provider is required' };
  try {
    const order =
      provider === 'ALPACA'
        ? await createBrokerAdapter(provider).cancelOrder?.({
            orderId: args.orderId,
            clientOrderId: args.clientOrderId,
          })
        : await createExchangeAdapter(provider).cancelOrder?.({
            orderId: args.orderId,
            clientOrderId: args.clientOrderId,
            symbol: args.symbol,
          });
    if (!order) {
      return {
        ok: false,
        error: `Provider ${provider} does not support order cancellation in this build.`,
      };
    }
    return { ok: true, order };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function findUserLiveExecutionOrder(args: {
  userId: string;
  provider: string;
  orderId?: string;
  clientOrderId?: string;
}) {
  const provider = String(args.provider || '')
    .trim()
    .toUpperCase();
  const orderId = String(args.orderId || '').trim();
  const clientOrderId = String(args.clientOrderId || '').trim();
  if (!args.userId || !provider || (!orderId && !clientOrderId)) return null;

  const executions = listExecutions({
    userId: args.userId,
    mode: 'LIVE',
    limit: 1000,
  });
  for (const row of executions) {
    const note = parseLiveExecutionNote(row.note);
    if (!note || note.provider !== provider) continue;
    if (orderId && note.order_id === orderId) {
      return {
        executionId: row.execution_id,
        orderId: note.order_id,
        clientOrderId: note.client_order_id,
        provider: note.provider,
      };
    }
    if (clientOrderId && note.client_order_id === clientOrderId) {
      return {
        executionId: row.execution_id,
        orderId: note.order_id,
        clientOrderId: note.client_order_id,
        provider: note.provider,
      };
    }
  }
  return null;
}

export function listExecutions(args: {
  userId?: string;
  market?: Market;
  mode?: ExecutionMode;
  signalId?: string;
  limit?: number;
}) {
  const repo = getRepo();
  return repo.listExecutions({
    userId: args.userId,
    market: args.market,
    mode: args.mode,
    signalId: args.signalId,
    limit: args.limit,
  });
}

export function getMarketState(args: {
  userId?: string;
  market?: Market;
  symbol?: string;
  timeframe?: string;
}) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    timeframe: args.timeframe,
  });
  return repo.listMarketState({
    market: args.market,
    symbol: args.symbol,
    timeframe: args.timeframe,
  });
}

export function getPerformanceSummary(args: { userId?: string; market?: Market; range?: string }) {
  const repo = getRepo();
  const state = syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    timeframe: args.range,
  });
  const rows = repo.listPerformanceSnapshots({
    market: args.market,
    range: args.range,
  });
  const grouped = rows.reduce<Record<string, Record<string, unknown>>>((acc, row) => {
    const key = `${row.market}:${row.range}`;
    if (!acc[key]) {
      acc[key] = {
        market: row.market,
        range: row.range,
        overall: null,
        by_strategy: [],
        by_regime: [],
        deviation: null,
      };
    }
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    if (row.segment_type === 'OVERALL') acc[key].overall = payload;
    if (row.segment_type === 'STRATEGY')
      (acc[key].by_strategy as Record<string, unknown>[]).push(payload);
    if (row.segment_type === 'REGIME')
      (acc[key].by_regime as Record<string, unknown>[]).push(payload);
    if (row.segment_type === 'DEVIATION') acc[key].deviation = payload;
    return acc;
  }, {});

  return {
    asof: new Date(state.asofMs).toISOString(),
    source_status: normalizeRuntimeStatus(state.sourceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA),
    records: Object.values(grouped),
  };
}

export function getMarketModules(args?: { market?: Market; assetClass?: AssetClass }) {
  const repo = getRepo();
  const rows = repo.listMarketState({
    market: args?.market,
  });
  return buildMarketModulesFromRows(rows, args);
}

export function upsertExternalConnection(args: {
  userId: string;
  connectionType: 'BROKER' | 'EXCHANGE';
  provider: string;
  mode: 'READ_ONLY' | 'TRADING';
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
  meta?: Record<string, unknown>;
}) {
  const repo = getRepo();
  const id = `${args.connectionType}-${args.provider}-${args.userId}`;
  repo.upsertExternalConnection({
    connection_id: id,
    user_id: args.userId,
    connection_type: args.connectionType,
    provider: args.provider,
    mode: args.mode,
    status: args.status,
    meta_json: args.meta ? JSON.stringify(args.meta) : null,
  });
  return { connection_id: id };
}

function modeFromRiskProfile(profile?: { profile_key?: string | null }): string {
  const key = String(profile?.profile_key || 'balanced').toLowerCase();
  if (key === 'conservative') return 'do not trade';
  if (key === 'aggressive') return 'normal risk';
  return 'trade light';
}

type RuntimeStateCore = {
  repo: MarketRepository;
  userId: string;
  market: Market;
  assetClass?: AssetClass;
  state: ReturnType<typeof syncQuantState>;
  risk: ReturnType<typeof getRiskProfile>;
  signals: Record<string, unknown>[];
  marketState: ReturnType<typeof getMarketState>;
  modules: ReturnType<typeof getMarketModules>;
  performance: ReturnType<typeof getPerformanceSummary>;
  performanceSource: ReturnType<typeof derivePerformanceSourceStatus>;
  hasPerformanceSample: boolean;
  active: Record<string, unknown>[];
  topSignal: Record<string, unknown> | null;
  avgVol: number | null;
  avgTemp: number | null;
  avgRiskOff: number | null;
  mode: string;
  suggestedGross: number;
  suggestedNet: number;
  today: Record<string, unknown>;
  safety: Record<string, unknown>;
  insights: Record<string, unknown>;
  runtimeStateStatus: string;
  runtimeTransparency: Record<string, unknown>;
};

function buildRuntimeStateCoreRecord(args: {
  repo: MarketRepository;
  userId: string;
  market: Market;
  assetClass?: AssetClass;
  state: ReturnType<typeof syncQuantState>;
  risk: ReturnType<typeof getRiskProfile>;
  signals: Record<string, unknown>[];
  marketState: ReturnType<typeof getMarketState>;
  modules: ReturnType<typeof getMarketModules>;
  performance: ReturnType<typeof getPerformanceSummary>;
}): RuntimeStateCore {
  const performanceRecords = Array.isArray(args.performance?.records)
    ? args.performance.records
    : [];
  const hasPerformanceSample = performanceRecords.some((record) => {
    const overall = record?.overall as Record<string, unknown> | null;
    const sampleSize = Number(overall?.sample_size || 0);
    return Number.isFinite(sampleSize) && sampleSize > 0;
  });
  const sourceLabels = performanceRecords
    .map((record) => (record?.overall as Record<string, unknown> | null)?.source_label)
    .filter(Boolean) as string[];
  const performanceSource = derivePerformanceSourceStatus(sourceLabels);

  const active = args.signals
    .filter((row) => ['NEW', 'TRIGGERED'].includes(String(row.status)))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const topSignal = active[0] || null;

  const avgVol = args.marketState.length
    ? args.marketState.reduce((acc, row) => acc + Number(row.volatility_percentile || 0), 0) /
      args.marketState.length
    : null;
  const avgTemp = args.marketState.length
    ? args.marketState.reduce((acc, row) => acc + Number(row.temperature_percentile || 0), 0) /
      args.marketState.length
    : null;
  const avgRiskOff = args.marketState.length
    ? args.marketState.reduce((acc, row) => acc + Number(row.risk_off_score || 0), 0) /
      args.marketState.length
    : null;

  const mode = modeFromRiskProfile(args.risk || undefined);
  const suggestedGross = mode === 'do not trade' ? 18 : mode === 'trade light' ? 35 : 55;
  const suggestedNet = mode === 'do not trade' ? 8 : mode === 'trade light' ? 20 : 35;

  const today = {
    is_trading_day: true,
    trading_day_message:
      args.market === 'CRYPTO'
        ? 'Crypto market runs 24/7.'
        : 'US market session inferred from bar updates.',
    suggested_gross_exposure_pct: suggestedGross,
    suggested_net_exposure_pct: suggestedNet,
    style_hint:
      topSignal &&
      String(topSignal.strategy_family || '')
        .toLowerCase()
        .includes('mean')
        ? 'mean reversion'
        : topSignal &&
            String(topSignal.strategy_family || '')
              .toLowerCase()
              .includes('trend')
          ? 'trend'
          : 'watchful',
    why_today: [
      topSignal
        ? `Top setup ${String(topSignal.symbol)} from ${String(topSignal.strategy_id)} under ${String(topSignal.regime_id)}.`
        : 'No high-quality setup passed rule filters today.',
      topSignal && typeof topSignal.news_context === 'object'
        ? `News tone: ${String((topSignal.news_context as Record<string, unknown>).tone || 'NONE').toLowerCase()}.`
        : 'No fresh news context is attached to the current top setup.',
      avgVol === null
        ? 'Volatility percentile unavailable due to insufficient bars.'
        : `Average volatility percentile: ${avgVol.toFixed(1)}.`,
      avgRiskOff === null
        ? 'Risk-off score unavailable.'
        : `Average risk-off score: ${avgRiskOff.toFixed(2)}.`,
    ],
  };

  const safety = {
    mode,
    safety_score:
      avgRiskOff === null ? 50 : Math.max(0, Math.min(100, Math.round((1 - avgRiskOff) * 100))),
    suggested_gross_exposure_pct: suggestedGross,
    suggested_net_exposure_pct: suggestedNet,
    conclusion:
      mode === 'do not trade'
        ? 'Risk-off pressure is high; preserve capital and avoid forced entries.'
        : mode === 'trade light'
          ? 'Mixed regime signals; keep size selective and controlled.'
          : 'Risk posture allows normal sizing within profile caps.',
    primary_risks: [
      avgVol !== null && avgVol > 75
        ? 'Volatility percentile is elevated.'
        : 'Volatility is not at panic level.',
      avgTemp !== null && avgTemp > 82
        ? 'Temperature is stretched; avoid chasing.'
        : 'Temperature is within normal range.',
      args.state.sourceStatus !== RUNTIME_STATUS.DB_BACKED
        ? 'Data coverage is insufficient for high-confidence actions.'
        : 'Signals are DB-backed from derived OHLCV state.',
    ],
    cards: {
      market: {
        title: 'Market',
        score: avgRiskOff === null ? 50 : Number(((1 - avgRiskOff) * 100).toFixed(1)),
        lines: ['Derived from OHLCV trend/volatility/risk-off features.'],
      },
      portfolio: {
        title: 'Portfolio',
        score: mode === 'do not trade' ? 35 : mode === 'trade light' ? 55 : 70,
        lines: ['Exposure caps follow user risk profile.'],
      },
      instrument: {
        title: 'Instrument',
        score: topSignal ? Number(topSignal.score || 50) : 45,
        lines: [
          topSignal
            ? `Top candidate: ${String(topSignal.symbol)}`
            : 'No active candidate in NEW/TRIGGERED state.',
        ],
      },
    },
    rules: [
      {
        id: 'size-cap',
        title: 'Size cap',
        rule: `Gross exposure cap ${args.risk?.exposure_cap ?? '--'}%`,
      },
      {
        id: 'hard-stop',
        title: 'Hard stop',
        rule: 'Every trade requires invalidation placement before entry.',
      },
      {
        id: 'skip-on-data-gap',
        title: 'Data guard',
        rule: 'If bars are stale or missing, strategy should skip.',
      },
    ],
  };

  const insights = {
    regime: {
      tag: args.marketState[0]?.regime_id || RUNTIME_STATUS.INSUFFICIENT_DATA,
      description: args.marketState[0]?.stance || 'No reliable market-state record available.',
    },
    short_commentary: topSignal
      ? `Current best opportunity: ${String(topSignal.symbol)} (${String(topSignal.strategy_id)}).`
      : 'No high-quality opportunity currently passed filters.',
    breadth: {
      ratio: args.marketState.length
        ? Number(
            (
              args.marketState.filter((row) => Number(row.trend_strength || 0) >= 0.55).length /
              args.marketState.length
            ).toFixed(4),
          )
        : null,
    },
    volatility: {
      label:
        avgVol === null
          ? 'insufficient_data'
          : avgVol >= 80
            ? 'elevated'
            : avgVol >= 60
              ? 'moderate'
              : 'calm',
    },
    risk_on_off: {
      state:
        avgRiskOff === null
          ? 'insufficient_data'
          : avgRiskOff >= 0.7
            ? 'risk_off'
            : avgRiskOff >= 0.55
              ? 'neutral'
              : 'risk_on',
    },
    style: {
      preference: today.style_hint,
    },
    leadership: {
      leaders: active
        .slice(0, 3)
        .map((row) => ({ sector: String(row.symbol), score: Number(row.score || 0) / 100 })),
      laggards: active
        .slice(-3)
        .map((row) => ({ sector: String(row.symbol), score: Number(row.score || 0) / 100 })),
    },
    why_signals_today: today.why_today,
  };

  const runtimeStateStatus = normalizeRuntimeStatus(
    args.state.sourceStatus,
    RUNTIME_STATUS.INSUFFICIENT_DATA,
  );
  const runtimeLineage = buildEvidenceLineage({
    runtimeStatus: runtimeStateStatus,
    performanceStatus: performanceSource,
    sourceStatus: runtimeStateStatus,
    dataStatus: runtimeStateStatus,
  });
  const runtimeTransparency = {
    as_of: new Date(args.state.asofMs).toISOString(),
    source_status: runtimeStateStatus,
    data_status: runtimeStateStatus,
    evidence_mode: runtimeLineage.display_mode,
    performance_mode: runtimeLineage.performance_mode,
    validation_mode: runtimeLineage.validation_mode,
    freshness_summary: args.state.freshnessSummary,
    coverage_summary: args.state.coverageSummary,
    db_backed: runtimeStateStatus === RUNTIME_STATUS.DB_BACKED,
    paper_only: performanceSource === RUNTIME_STATUS.PAPER_ONLY,
    realized: performanceSource === RUNTIME_STATUS.REALIZED,
    backtest_only: performanceSource === RUNTIME_STATUS.BACKTEST_ONLY,
    model_derived: args.signals.length > 0,
    experimental: runtimeStateStatus === RUNTIME_STATUS.EXPERIMENTAL,
    disconnected: false,
    performance_source: performanceSource,
  };

  return {
    repo: args.repo,
    userId: args.userId,
    market: args.market,
    assetClass: args.assetClass,
    state: args.state,
    risk: args.risk,
    signals: args.signals,
    marketState: args.marketState,
    modules: args.modules,
    performance: args.performance,
    performanceSource,
    hasPerformanceSample,
    active,
    topSignal,
    avgVol,
    avgTemp,
    avgRiskOff,
    mode,
    suggestedGross,
    suggestedNet,
    today,
    safety,
    insights,
    runtimeStateStatus,
    runtimeTransparency,
  };
}

function buildRuntimeEvidencePreview(args: {
  signals: Array<Record<string, unknown>>;
  limit?: number;
  sourceStatus?: string;
}) {
  const preview = buildRuntimeSignalEvidenceFromSignals(
    args.signals,
    Math.max(3, Number(args.limit || 6)),
    String(args.sourceStatus || RUNTIME_STATUS.MODEL_DERIVED),
  );
  return {
    top_signals: preview.records,
    source_status: preview.source_status,
    data_status: preview.data_status,
    asof: preview.asof,
    supporting_run_id: preview.supporting_run_id,
    dataset_version_id: preview.dataset_version_id,
    strategy_version_id: preview.strategy_version_id,
  };
}

function buildRuntimeApiChecks(core: RuntimeStateCore) {
  return {
    signal_count: Array.isArray(core.signals) ? core.signals.length : 0,
    market_state_count: Array.isArray(core.marketState) ? core.marketState.length : 0,
    modules_count: Array.isArray(core.modules) ? core.modules.length : 0,
    performance_records: Array.isArray(core.performance?.records)
      ? core.performance.records.length
      : 0,
  };
}

function loadRuntimeStateCore(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  forceSync?: boolean;
}): RuntimeStateCore {
  const repo = getRepo();
  const userId = args.userId || 'guest-default';
  const market = args.market || (args.assetClass === 'CRYPTO' ? 'CRYPTO' : 'US');
  const state = syncQuantState(userId, Boolean(args.forceSync), {
    market: args.market,
    assetClass: args.assetClass,
  });
  const risk = getRiskProfile(userId, { skipSync: true });

  const signals = listSignalContracts({
    userId,
    market: args.market,
    assetClass: args.assetClass,
    status: 'ALL',
    limit: 60,
  }).map(toUiSignal);

  const marketState = getMarketState({ userId, market });
  const modules = getMarketModules({ market, assetClass: args.assetClass });
  const performance = getPerformanceSummary({ userId, market });
  return buildRuntimeStateCoreRecord({
    repo,
    userId,
    market,
    assetClass: args.assetClass,
    state,
    risk,
    signals,
    marketState,
    modules,
    performance,
  });
}

export async function loadRuntimeStateCorePrimary(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  forceSync?: boolean;
}): Promise<RuntimeStateCore> {
  if (!shouldPreferPostgresPrimaryReads()) {
    return loadRuntimeStateCore(args);
  }

  const repo = createLazyMarketRepository();
  const userId = args.userId || 'guest-default';
  const market = args.market || (args.assetClass === 'CRYPTO' ? 'CRYPTO' : 'US');

  const bundlePrimary = await tryPrimaryPostgresRead('runtime_bundle', async () =>
    readPostgresRuntimeStateBundle({
      userId,
      market,
      assetClass: args.assetClass,
      signalLimit: RUNTIME_STATE_SIGNAL_LIMIT,
      marketStateLimit: RUNTIME_STATE_MARKET_STATE_LIMIT,
    }),
  );
  const riskPrimary = bundlePrimary?.risk || null;
  const signalRowsPrimary = bundlePrimary?.signals || null;
  const marketStatePrimary = bundlePrimary?.marketState || null;
  const performanceRowsPrimary = bundlePrimary?.performance || null;

  const avoidSyncFallback = shouldAvoidSyncHotPathFallback();

  if (
    !avoidSyncFallback &&
    !riskPrimary &&
    !signalRowsPrimary &&
    !marketStatePrimary &&
    !performanceRowsPrimary
  ) {
    return loadRuntimeStateCore(args);
  }

  // ISSUE-4: warn when a primary Postgres read mixes with the shared runtime fallback.
  const pgSources = [
    riskPrimary ? 'risk' : null,
    signalRowsPrimary ? 'signals' : null,
    marketStatePrimary ? 'market_state' : null,
    performanceRowsPrimary ? 'performance' : null,
  ].filter(Boolean) as string[];
  if (pgSources.length < 4) {
    console.warn(
      '[queries] mixed-source runtime read: Postgres served',
      pgSources.join(', '),
      '— remaining served by the shared runtime fallback',
    );
  }

  const needsLocalFallback =
    !riskPrimary || !signalRowsPrimary || !marketStatePrimary || !performanceRowsPrimary;
  if (needsLocalFallback && !avoidSyncFallback) {
    syncQuantState(userId, false, { market: args.market, assetClass: args.assetClass });
  }
  const risk = avoidSyncFallback
    ? riskPrimary
    : riskPrimary || repo.getUserRiskProfile(userId) || getRiskProfile(userId, { skipSync: true });
  const signalRows = avoidSyncFallback
    ? signalRowsPrimary || []
    : signalRowsPrimary ||
      listSignalContractSummaries({
        userId,
        assetClass: args.assetClass,
        market: args.market,
        limit: RUNTIME_STATE_SIGNAL_LIMIT,
      });
  const marketState = avoidSyncFallback
    ? marketStatePrimary || []
    : marketStatePrimary ||
      repo
        .listMarketState({
          market,
        })
        .slice(0, RUNTIME_STATE_MARKET_STATE_LIMIT);
  const performanceRows = avoidSyncFallback
    ? performanceRowsPrimary || []
    : performanceRowsPrimary || repo.listPerformanceSnapshots({ market });
  const latestTs = Math.max(
    0,
    risk?.updated_at_ms || 0,
    ...signalRows.map((row) =>
      Math.max(
        0,
        Date.parse(String((row as Record<string, unknown>).generated_at || '')) || 0,
        Date.parse(String((row as Record<string, unknown>).created_at || '')) || 0,
      ),
    ),
    ...marketState.map((row) => Number(row.updated_at_ms || row.snapshot_ts_ms || 0)),
    ...performanceRows.map((row) => Number(row.updated_at_ms || row.asof_ms || 0)),
  );
  const asofMs = latestTs > 0 ? latestTs : Date.now();
  const sourceStatus =
    signalRows.length || marketState.length || performanceRows.length
      ? RUNTIME_STATUS.DB_BACKED
      : RUNTIME_STATUS.INSUFFICIENT_DATA;
  const state = {
    asofMs,
    signals: [] as ReturnType<typeof syncQuantState>['signals'],
    marketState,
    performanceApi: {},
    sourceStatus,
    freshnessSummary: {
      source_status: sourceStatus,
      asof: new Date(asofMs).toISOString(),
      signal_count: signalRows.length,
      market_state_count: marketState.length,
      performance_snapshot_count: performanceRows.length,
      data_source: pgSources.length === 4 ? 'postgres-primary' : 'postgres-bridge',
    },
    coverageSummary: {
      generated_signals: signalRows.length,
      market_state_count: marketState.length,
      performance_snapshot_count: performanceRows.length,
      data_source: pgSources.length === 4 ? 'postgres-primary' : 'postgres-bridge',
    },
  };
  const performance = buildPerformanceSummaryFromRows({
    rows: performanceRows,
    asofIso: new Date(asofMs).toISOString(),
    sourceStatus,
  });
  const modules = buildMarketModulesFromRows(marketState, {
    market,
    assetClass: args.assetClass,
  });

  return buildRuntimeStateCoreRecord({
    repo,
    userId,
    market,
    assetClass: args.assetClass,
    state,
    risk,
    signals: signalRows as Record<string, unknown>[],
    marketState,
    modules,
    performance,
  });
}

function parseJsonObject(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function parseJsonArray(text: string | null | undefined): Array<Record<string, unknown>> {
  if (!text) return [];
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

function snapshotDateKey(iso: string): string {
  return String(iso || '').slice(0, 10);
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

const { buildDecisionSnapshotFromCore, buildDecisionSnapshotFromCorePrimary, getDecisionSnapshot } =
  createTodayReadApi({
    getRepo,
    listExecutions,
    listExecutionsPrimary,
    getLatestDecisionSnapshotPrimary,
    loadRuntimeStateCorePrimary,
    shouldUsePublicDecisionFallback,
    shouldAvoidSyncHotPathFallback,
    parseJsonObject,
    parseJsonArray,
    buildRuntimeSignalEvidenceFromSignals,
  });

const {
  getRiskProfile,
  getRiskProfilePrimary,
  setRiskProfile,
  listExternalConnections,
  listExternalConnectionsPrimary,
} = createPortfolioReadApi({
  getRepo,
  syncQuantState,
  cachedFrontendRead,
  tryPrimaryPostgresRead,
  readPostgresRiskProfile: (userId) => readPostgresRiskProfile(userId),
  readPostgresExternalConnections: (args) => readPostgresExternalConnections(args),
  invalidateFrontendReadCacheForUser,
  riskProfilePresets: RISK_PROFILE_PRESETS,
});

const {
  getEngagementState,
  completeMorningCheck,
  confirmRiskBoundary,
  completeWrapUp,
  completeWeeklyReview,
  getWidgetSummary,
  getNotificationPreview,
  getNotificationPreferencesState,
  setNotificationPreferencesState,
} = createEngagementReadApi({
  getRepo,
  cachedFrontendRead,
  tryPrimaryPostgresRead,
  readPostgresDecisionSnapshots,
  readPostgresNotificationPreferences,
  readPostgresUserRitualEvents,
  readPostgresNotificationEvents,
  listDecisionSnapshotsPrimary,
  parseJsonArray,
  invalidateFrontendReadCacheForUser,
  wrapUpLanguageCache,
  getDecisionSnapshot,
});

export {
  getDecisionSnapshot,
  getRiskProfile,
  getRiskProfilePrimary,
  setRiskProfile,
  listExternalConnections,
  listExternalConnectionsPrimary,
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

export function getNovaRuntimeState() {
  const plan = getNovaModelPlan();
  const mode = getNovaRuntimeMode();
  const baseRouting = getNovaRoutingPolicies();
  const effectiveRouting = baseRouting.map((row) => {
    const effective = resolveEffectiveTextRoute(row.task);
    return {
      ...row,
      effective_provider: effective.provider,
      effective_model: effective.model,
    };
  });
  const primaryEffective = resolveEffectiveTextRoute('decision_reasoning');
  return {
    endpoint: plan.endpoint,
    plan,
    routing: effectiveRouting,
    provider: primaryEffective.provider,
    model: primaryEffective.model,
    base_provider: plan.provider,
    local_only: plan.local_only,
    mode,
    availability_reason: getNovaRuntimeAvailabilityReason(mode),
  };
}

export async function getResearchOpsStatus(args?: { timeZone?: string; localDate?: string }) {
  return await buildLocalAdminResearchOpsSnapshot(args);
}

export async function getAlphaOpsStatus(args?: { timeZone?: string; localDate?: string }) {
  return await buildLocalAdminAlphaSnapshot(args);
}

export async function getNovaHealthState() {
  return await inspectNovaHealth();
}

export function listNovaRuns(args?: {
  userId?: string;
  threadId?: string;
  taskType?: string;
  status?: string;
  limit?: number;
}) {
  const repo = getRepo();
  const rows = repo.listNovaTaskRuns({
    userId: args?.userId,
    threadId: args?.threadId,
    taskType: args?.taskType,
    status: args?.status,
    limit: args?.limit || 60,
  });
  return {
    count: rows.length,
    records: rows.map((row) => ({
      ...row,
      input: parseOptionalJson(row.input_json),
      context: parseOptionalJson(row.context_json),
      output: parseOptionalJson(row.output_json),
    })),
  };
}

export function createNovaReviewLabel(args: {
  runId: string;
  reviewerId?: string;
  label: string;
  score?: number | null;
  notes?: string | null;
  includeInTraining?: boolean;
}) {
  const repo = getRepo();
  return labelNovaRun({
    repo,
    runId: args.runId,
    reviewerId: args.reviewerId || 'manual-review',
    label: args.label,
    score: args.score,
    notes: args.notes,
    includeInTraining: args.includeInTraining,
  });
}

export function exportNovaTrainingDataset(args?: { onlyIncluded?: boolean; limit?: number }) {
  const repo = getRepo();
  return buildMlxLmTrainingDataset(repo, args);
}

export async function runNovaTrainingFlywheelNow(args?: {
  userId?: string;
  trainer?: NovaTrainerKind;
  onlyIncluded?: boolean;
  limit?: number;
  taskTypes?: NovaTaskType[];
}) {
  const repo = getRepo();
  return await runNovaTrainingFlywheel({
    repo,
    userId: args?.userId || null,
    trainer: args?.trainer,
    onlyIncluded: args?.onlyIncluded,
    limit: args?.limit,
    taskTypes: args?.taskTypes,
  });
}

export async function runNovaStrategyGeneration(args: {
  userId?: string;
  prompt: string;
  locale?: string;
  market?: Market;
  riskProfile?: string;
  maxCandidates?: number;
}) {
  const repo = getRepo();
  return await generateGovernedNovaStrategies({
    repo,
    userId: args.userId || null,
    prompt: args.prompt,
    locale: args.locale || 'en',
    market: args.market || null,
    riskProfile: args.riskProfile || null,
    maxCandidates: args.maxCandidates,
  });
}

export async function runNovaProductionStrategy(args: {
  userId?: string;
  locale?: string;
  market?: Market | 'ALL';
  symbols?: string[];
  start?: string;
  end?: string;
  riskProfile?: RiskProfileKey;
}) {
  const repo = getRepo();
  return await generateNovaProductionStrategyPack({
    repo,
    userId: args.userId || null,
    locale: args.locale || 'en',
    market: args.market || 'ALL',
    symbols: args.symbols,
    start: args.start,
    end: args.end,
    riskProfile: args.riskProfile || 'balanced',
  });
}

export async function runNovaRobustnessTrainingNow(args: {
  userId?: string;
  locale?: string;
  market?: Market | 'ALL';
  start?: string;
  end?: string;
  taskLimit?: number;
  seed?: number;
  riskProfiles?: RiskProfileKey[];
}) {
  const repo = getRepo();
  return await runNovaRobustnessTraining({
    repo,
    userId: args.userId || null,
    locale: args.locale || 'zh-CN',
    market: args.market || 'ALL',
    start: args.start,
    end: args.end,
    taskLimit: args.taskLimit,
    seed: args.seed,
    riskProfiles: args.riskProfiles,
  });
}

export function listDecisionAudit(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  limit?: number;
}) {
  const repo = getRepo();
  const rows = repo.listDecisionSnapshots({
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass || undefined,
    limit: args.limit || 20,
  });
  return {
    count: rows.length,
    records: rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      market: row.market,
      asset_class: row.asset_class,
      snapshot_date: row.snapshot_date,
      source_status: row.source_status,
      data_status: row.data_status,
      top_action_id: row.top_action_id,
      summary: parseJsonObject(row.summary_json),
      risk_state: parseJsonObject(row.risk_state_json),
      portfolio_context: parseJsonObject(row.portfolio_context_json),
      actions: (() => {
        try {
          return JSON.parse(row.actions_json || '[]');
        } catch {
          return [];
        }
      })(),
      updated_at_ms: row.updated_at_ms,
    })),
  };
}

export function getRuntimeState(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
}) {
  const core = loadRuntimeStateCore(args);
  const membership = getMembershipState({ userId: core.userId });
  const decision = buildDecisionSnapshotFromCore({
    core,
  });
  const apiChecks = buildRuntimeApiChecks(core);
  const evidence = buildRuntimeEvidencePreview({
    signals: core.signals,
    sourceStatus: String(core.runtimeTransparency.source_status || RUNTIME_STATUS.MODEL_DERIVED),
  });
  const componentStatus = withComponentStatus({
    overallDataStatus: normalizeRuntimeStatus(
      core.runtimeTransparency.data_status,
      RUNTIME_STATUS.INSUFFICIENT_DATA,
    ),
    componentSourceStatus: RUNTIME_STATUS.MODEL_DERIVED,
  });
  let manual = null;
  try {
    manual = getManualDashboard(core.userId);
  } catch {
    manual = null;
  }

  return buildRuntimeStateSnapshot({
    core,
    decision,
    evidence,
    apiChecks,
    trades: listExecutions({ userId: core.userId, market: core.market, limit: 200 }),
    componentStatus,
    membership,
    manual,
    connectivityIncluded: false,
  });
}

async function getRuntimeStatePrimary(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
}) {
  const core = await loadRuntimeStateCorePrimary(args);
  const membership = getMembershipState({ userId: core.userId });
  let decision:
    | Awaited<ReturnType<typeof buildDecisionSnapshotFromCorePrimary>>
    | Awaited<ReturnType<typeof getPublicTodayDecision>>;
  try {
    decision = await buildDecisionSnapshotFromCorePrimary({
      core,
    });
  } catch (error) {
    if (!shouldAvoidSyncHotPathFallback()) {
      throw error;
    }
    console.warn(
      '[queries] runtime decision fell back to public scan:',
      error instanceof Error ? error.message : String(error),
    );
    decision = await getPublicTodayDecision({
      userId: core.userId,
      market: core.market,
      assetClass: core.assetClass,
    });
  }
  const apiChecks = buildRuntimeApiChecks(core);
  const evidence = buildRuntimeEvidencePreview({
    signals: core.signals,
    sourceStatus: String(core.runtimeTransparency.source_status || RUNTIME_STATUS.MODEL_DERIVED),
  });
  const trades = await listExecutionsPrimary({
    userId: core.userId,
    market: core.market,
    limit: RUNTIME_STATE_TRADE_LIMIT,
  });
  const componentStatus = withComponentStatus({
    overallDataStatus: normalizeRuntimeStatus(
      core.runtimeTransparency.data_status,
      RUNTIME_STATUS.INSUFFICIENT_DATA,
    ),
    componentSourceStatus: RUNTIME_STATUS.MODEL_DERIVED,
  });
  let manual = null;
  try {
    manual = getManualDashboard(core.userId);
  } catch {
    manual = null;
  }

  return buildRuntimeStateSnapshot({
    core,
    decision,
    evidence,
    apiChecks,
    trades,
    componentStatus,
    membership,
    manual,
    connectivityIncluded: false,
  });
}

export async function getRuntimeStateResponse(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
}) {
  return cachedFrontendRead(
    'runtime_state',
    {
      userId: args.userId || 'guest-default',
      market: args.market || 'ALL',
      assetClass: args.assetClass || 'ALL',
    },
    async () => {
      const runtime = await getRuntimeStatePrimary(args);
      if (
        !shouldUsePublicDecisionFallback({
          forceFallback: String(process.env.NOVA_FORCE_PUBLIC_RUNTIME_FALLBACK || '') === '1',
          sourceStatus: String(runtime.source_status || ''),
          signalCount: Array.isArray(runtime?.data?.signals) ? runtime.data.signals.length : 0,
          decision: asObject(runtime?.data?.decision),
          dbBackedStatus: RUNTIME_STATUS.DB_BACKED,
        })
      ) {
        return runtime;
      }

      try {
        const publicDecision = await getPublicTodayDecision({
          userId: args.userId,
          market: args.market,
          assetClass: args.assetClass,
        });
        return applyPublicDecisionToRuntime({
          runtime,
          publicDecision: publicDecision as Record<string, unknown>,
          modelDerivedStatus: RUNTIME_STATUS.MODEL_DERIVED,
          buildRuntimeEvidencePreview,
        });
      } catch {
        return runtime;
      }
    },
    30_000,
  );
}

function parseJsonValue(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toIso(value: unknown): string | null {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return new Date(ts).toISOString();
}

function toCount(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function workflowRunBase(run: WorkflowRunRecord) {
  return {
    id: run.id,
    status: run.status,
    trigger_type: run.trigger_type,
    started_at: toIso(run.started_at_ms),
    updated_at: toIso(run.updated_at_ms),
    completed_at: toIso(run.completed_at_ms),
  };
}

function summarizeFreeDataRun(run: WorkflowRunRecord) {
  const output = asObject(parseJsonValue(run.output_json));
  const referenceData = asObject(output.reference_data);
  const targetPlan = asObject(referenceData.target_plan);
  const news = asObject(output.news);
  const fundamentals = asObject(output.fundamentals);
  const fundamentalsCoverage = asObject(fundamentals.coverage);
  const options = asObject(output.options);
  const optionsCoverage = asObject(options.coverage);
  const crypto = asObject(output.crypto_structure);
  const highlights = asArray(crypto.symbols)
    .map((row) => asObject(row))
    .slice(0, 6)
    .map((row) => ({
      symbol: String(row.symbol || ''),
      funding_inserted: toCount(row.funding_inserted),
      basis_inserted: toCount(row.basis_inserted),
      latest_funding_rate: Number.isFinite(Number(row.latest_funding_rate))
        ? Number(row.latest_funding_rate)
        : null,
      latest_basis_bps: Number.isFinite(Number(row.latest_basis_bps))
        ? Number(row.latest_basis_bps)
        : null,
    }))
    .filter((row) => row.symbol);
  const detailParts = [
    `${toCount(news.refreshed_symbols)} news refreshes`,
    Number.isFinite(Number(fundamentalsCoverage.fresh_coverage_pct))
      ? `fund ${toCount(fundamentalsCoverage.fresh_coverage_pct)}% fresh`
      : '',
    Number.isFinite(Number(optionsCoverage.fresh_coverage_pct))
      ? `opt ${toCount(optionsCoverage.fresh_coverage_pct)}% fresh`
      : '',
    toCount(crypto.symbols_processed) ? `${toCount(crypto.symbols_processed)} crypto symbols` : '',
  ].filter(Boolean);

  return {
    ...workflowRunBase(run),
    workflow_key: run.workflow_key,
    market: typeof output.market === 'string' ? output.market : 'ALL',
    reference_data: {
      target_symbol_budget: toCount(targetPlan.target_symbol_budget),
      target_symbol_count: toCount(
        targetPlan.target_symbols && asArray(targetPlan.target_symbols).length,
      ),
      configured_seed_count: toCount(targetPlan.configured_seed_count),
      runtime_active_count: toCount(targetPlan.runtime_active_count),
      universe_fill_count: toCount(targetPlan.universe_fill_count),
    },
    news: {
      targets: toCount(news.targets),
      refreshed_symbols: toCount(news.refreshed_symbols),
      skipped_symbols: toCount(news.skipped_symbols),
      rows_upserted: toCount(news.rows_upserted),
      error_count: asArray(news.errors).length,
    },
    fundamentals: {
      targets: toCount(fundamentals.targets),
      refreshed_symbols: toCount(fundamentals.refreshed_symbols),
      skipped_symbols: toCount(fundamentals.skipped_symbols),
      rows_upserted: toCount(fundamentals.rows_upserted),
      error_count: asArray(fundamentals.errors).length,
      target_count: toCount(fundamentalsCoverage.target_count),
      fresh_count: toCount(fundamentalsCoverage.fresh_count),
      stale_count: toCount(fundamentalsCoverage.stale_count),
      missing_count: toCount(fundamentalsCoverage.missing_count),
      fresh_coverage_pct: toCount(fundamentalsCoverage.fresh_coverage_pct),
    },
    options: {
      targets: toCount(options.targets),
      refreshed_symbols: toCount(options.refreshed_symbols),
      skipped_symbols: toCount(options.skipped_symbols),
      rows_upserted: toCount(options.rows_upserted),
      error_count: asArray(options.errors).length,
      target_count: toCount(optionsCoverage.target_count),
      fresh_count: toCount(optionsCoverage.fresh_count),
      stale_count: toCount(optionsCoverage.stale_count),
      missing_count: toCount(optionsCoverage.missing_count),
      fresh_coverage_pct: toCount(optionsCoverage.fresh_coverage_pct),
    },
    crypto_structure: {
      symbols_processed: toCount(crypto.symbols_processed),
      funding_points: toCount(crypto.funding_points),
      basis_points: toCount(crypto.basis_points),
      latest_funding_symbols: toCount(crypto.latest_funding_symbols),
      latest_basis_symbols: toCount(crypto.latest_basis_symbols),
      highlights,
    },
    detail: detailParts.join(' · '),
  };
}

function summarizeEvolutionRun(run: WorkflowRunRecord) {
  const markets = asArray(parseJsonValue(run.output_json))
    .map((row) => asObject(row))
    .map((row) => ({
      market: typeof row.market === 'string' ? row.market : 'UNKNOWN',
      factor_eval_count: toCount(row.factorEvalCount),
      promoted: Boolean(row.promoted),
      rolled_back: Boolean(row.rolledBack),
      safe_mode: Boolean(row.safeMode),
      active_model_id: typeof row.activeModelId === 'string' ? row.activeModelId : null,
      challenger_model_id: typeof row.challengerModelId === 'string' ? row.challengerModelId : null,
      summary: typeof row.summary === 'string' ? row.summary : '',
    }));

  return {
    ...workflowRunBase(run),
    workflow_key: run.workflow_key,
    promoted_count: markets.filter((row) => row.promoted).length,
    rollback_count: markets.filter((row) => row.rolled_back).length,
    safe_mode_count: markets.filter((row) => row.safe_mode).length,
    markets,
  };
}

function summarizeTrainingRun(run: WorkflowRunRecord) {
  const output = asObject(parseJsonValue(run.output_json));
  const execution = asObject(output.execution);
  return {
    ...workflowRunBase(run),
    workflow_key: run.workflow_key,
    trainer: typeof output.trainer === 'string' ? output.trainer : null,
    dataset_count: toCount(output.dataset_count),
    ready_for_training: Boolean(output.ready_for_training),
    manifest_path: typeof output.manifest_path === 'string' ? output.manifest_path : null,
    task_types: asArray(output.task_types)
      .map((row) => String(row || ''))
      .filter(Boolean),
    execution: {
      attempted: Boolean(execution.attempted),
      executed: Boolean(execution.executed),
      success: Boolean(execution.success),
      reason: typeof execution.reason === 'string' ? execution.reason : null,
      exit_code: Number.isFinite(Number(execution.exit_code)) ? Number(execution.exit_code) : null,
    },
  };
}

function summarizeRecentNewsRows(
  rows: Array<{
    id: string;
    market: Market | 'ALL';
    symbol: string;
    headline: string;
    source: string;
    published_at_ms: number;
    updated_at_ms: number;
    sentiment_label: string;
  }>,
) {
  return rows.map((row) => ({
    id: row.id,
    market: row.market,
    symbol: row.symbol,
    headline: row.headline,
    source: row.source,
    sentiment: row.sentiment_label,
    published_at: toIso(row.published_at_ms),
    updated_at: toIso(row.updated_at_ms),
  }));
}

function summarizeRecentNews(repo: MarketRepository) {
  return summarizeRecentNewsRows(repo.listNewsItems({ limit: 8 }));
}

function filterWorkflowRuns(
  rows: WorkflowRunRecord[],
  workflowKey: string,
  limit = 6,
): WorkflowRunRecord[] {
  return rows.filter((row) => row.workflow_key === workflowKey).slice(0, limit);
}

function buildFlywheelStatusFromSources(args: {
  freeDataRuns: WorkflowRunRecord[];
  evolutionRuns: WorkflowRunRecord[];
  trainingRuns: WorkflowRunRecord[];
  recentNews: ReturnType<typeof summarizeRecentNewsRows>;
  currentDatasetCount: number;
  currentDatasetSource: string;
}) {
  const latestTrainingSummary = args.trainingRuns[0]
    ? summarizeTrainingRun(args.trainingRuns[0])
    : null;
  const recentActivity = [
    ...args.freeDataRuns.slice(0, 2).map((run) => {
      const summary = summarizeFreeDataRun(run);
      return {
        workflow_key: run.workflow_key,
        label: 'Free Data Refresh',
        status: summary.status,
        updated_at: summary.updated_at,
        detail: summary.detail,
      };
    }),
    ...args.evolutionRuns.slice(0, 2).map((run) => {
      const summary = summarizeEvolutionRun(run);
      return {
        workflow_key: run.workflow_key,
        label: 'Quant Evolution',
        status: summary.status,
        updated_at: summary.updated_at,
        detail: `${summary.promoted_count} promoted · ${summary.rollback_count} rolled back · ${summary.safe_mode_count} safe mode`,
      };
    }),
    ...args.trainingRuns.slice(0, 2).map((run) => {
      const summary = summarizeTrainingRun(run);
      return {
        workflow_key: run.workflow_key,
        label: 'Nova Training',
        status: summary.status,
        updated_at: summary.updated_at,
        detail: `${summary.dataset_count} samples · ${summary.execution.reason || 'no execution detail'}`,
      };
    }),
  ]
    .filter((row) => row.updated_at)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  return {
    as_of: new Date().toISOString(),
    last_activity_at: recentActivity[0]?.updated_at || null,
    recent_activity: recentActivity,
    free_data: {
      latest_status: args.freeDataRuns[0]?.status || 'IDLE',
      latest_run_at: toIso(args.freeDataRuns[0]?.updated_at_ms),
      latest_trigger_type: args.freeDataRuns[0]?.trigger_type || null,
      recent_runs: args.freeDataRuns.map(summarizeFreeDataRun),
      recent_news: args.recentNews,
    },
    evolution: {
      latest_status: args.evolutionRuns[0]?.status || 'IDLE',
      latest_run_at: toIso(args.evolutionRuns[0]?.updated_at_ms),
      latest_trigger_type: args.evolutionRuns[0]?.trigger_type || null,
      recent_runs: args.evolutionRuns.map(summarizeEvolutionRun),
    },
    training: {
      latest_status: args.trainingRuns[0]?.status || 'IDLE',
      latest_run_at: toIso(args.trainingRuns[0]?.updated_at_ms),
      latest_trigger_type: args.trainingRuns[0]?.trigger_type || null,
      current_dataset_count: args.currentDatasetCount,
      current_dataset_source: args.currentDatasetSource,
      minimum_training_rows: MIN_AUTOMATIC_TRAINING_ROWS,
      ready_for_training: args.currentDatasetCount >= MIN_AUTOMATIC_TRAINING_ROWS,
      latest_execution_reason: latestTrainingSummary?.execution.reason || null,
      latest_execution_success: latestTrainingSummary
        ? latestTrainingSummary.execution.success
        : null,
      task_types: latestTrainingSummary?.task_types?.length ? latestTrainingSummary.task_types : [],
      recent_runs: args.trainingRuns.map(summarizeTrainingRun),
    },
  };
}

function buildFlywheelStatus(repo: MarketRepository) {
  const freeDataRuns = repo.listWorkflowRuns({
    workflowKey: 'free_data_flywheel',
    limit: 6,
  });
  const evolutionRuns = repo.listWorkflowRuns({
    workflowKey: 'quant_evolution_cycle',
    limit: 6,
  });
  const trainingRuns = repo.listWorkflowRuns({
    workflowKey: 'nova_training_flywheel',
    limit: 6,
  });
  const latestTrainingSummary = trainingRuns[0] ? summarizeTrainingRun(trainingRuns[0]) : null;
  const liveTrainingDataset = buildMlxLmTrainingDataset(repo, {
    onlyIncluded: true,
    limit: 500,
  });
  const currentDatasetCount = latestTrainingSummary?.dataset_count ?? liveTrainingDataset.count;
  const currentDatasetSource =
    latestTrainingSummary?.dataset_count !== undefined ? 'latest_training_run' : 'live_scan';

  return buildFlywheelStatusFromSources({
    freeDataRuns,
    evolutionRuns,
    trainingRuns,
    recentNews: summarizeRecentNews(repo),
    currentDatasetCount,
    currentDatasetSource,
  });
}

async function buildFlywheelStatusPrimary() {
  const repo = getRepo();
  const avoidSyncFallback = shouldAvoidSyncHotPathFallback();
  const workflowRunsPrimary = await tryPrimaryPostgresRead(
    'control_plane_flywheel_runs',
    async () =>
      readPostgresWorkflowRuns({
        workflowKeys: ['free_data_flywheel', 'quant_evolution_cycle', 'nova_training_flywheel'],
        limit: 24,
      }),
  );
  const recentNewsPrimary = await tryPrimaryPostgresRead('control_plane_news', async () =>
    readPostgresNewsItems({
      limit: 8,
    }),
  );

  if (!workflowRunsPrimary && !recentNewsPrimary && !avoidSyncFallback) {
    return buildFlywheelStatus(repo);
  }

  const workflowRuns =
    workflowRunsPrimary ||
    (avoidSyncFallback
      ? []
      : repo.listWorkflowRuns({
          limit: 24,
        }));
  const freeDataRuns = filterWorkflowRuns(workflowRuns, 'free_data_flywheel');
  const evolutionRuns = filterWorkflowRuns(workflowRuns, 'quant_evolution_cycle');
  const trainingRuns = filterWorkflowRuns(workflowRuns, 'nova_training_flywheel');
  const latestTrainingSummary = trainingRuns[0] ? summarizeTrainingRun(trainingRuns[0]) : null;

  let currentDatasetCount = latestTrainingSummary?.dataset_count ?? 0;
  let currentDatasetSource =
    latestTrainingSummary?.dataset_count !== undefined ? 'latest_training_run' : 'unavailable';
  if (latestTrainingSummary?.dataset_count === undefined && !avoidSyncFallback) {
    const liveTrainingDataset = buildMlxLmTrainingDataset(repo, {
      onlyIncluded: true,
      limit: 500,
    });
    currentDatasetCount = liveTrainingDataset.count;
    currentDatasetSource = 'live_scan';
  }

  return buildFlywheelStatusFromSources({
    freeDataRuns,
    evolutionRuns,
    trainingRuns,
    recentNews: recentNewsPrimary
      ? summarizeRecentNewsRows(recentNewsPrimary)
      : avoidSyncFallback
        ? summarizeRecentNewsRows([])
        : summarizeRecentNews(repo),
    currentDatasetCount,
    currentDatasetSource,
  });
}

function buildDefaultExecutionGovernance(provider?: string) {
  const thresholds = executionGovernanceThresholds();
  return {
    as_of: new Date().toISOString(),
    provider_filter: provider ? String(provider).toUpperCase() : 'ALL',
    champion_challenger: {
      route_key: 'live_champion_paper_challenger',
      champion_mode: 'LIVE',
      challenger_mode: 'PAPER',
      live_count: 0,
      shadow_count: 0,
      paired_count: 0,
      recent_pairs: [],
    },
    reconciliation: {
      refreshed: false,
      rows: [],
      shadow_count: 0,
      paired_count: 0,
      summary: {
        total: 0,
        reconciled: 0,
        pending: 0,
        drift: 0,
        lookup_failed: 0,
        no_challenger: 0,
        cancelled: 0,
        avg_entry_gap_bps: null,
        avg_challenger_gap_bps: null,
      },
    },
    kill_switch: {
      active: false,
      mode: 'OFF',
      manual_enabled: false,
      automatic_enabled: false,
      reasons: [],
      thresholds,
      last_manual_update_at: null,
      last_manual_reason: null,
      provider_scope: provider ? String(provider).toUpperCase() : null,
    },
  };
}

function summarizeControlPlaneDecision(core: RuntimeStateCore) {
  const actionable = (core.active[0] as Record<string, unknown> | undefined) || null;
  const fallback = actionable || (core.signals[0] as Record<string, unknown> | undefined) || null;
  return {
    decision_code: actionable ? 'TRADE' : core.signals.length ? 'WAIT' : 'WAIT',
    top_action_symbol: fallback ? String(fallback.symbol || '') || null : null,
    top_action_label: actionable ? 'Open new risk' : fallback ? 'Watch only' : null,
  };
}

function summarizeRuntimeQuality(runtimeRows: Array<Record<string, any>>) {
  const freshnessRows = runtimeRows.flatMap((row) =>
    Array.isArray(row?.freshness?.rows) ? row.freshness.rows : [],
  );
  const suspectRows = freshnessRows.filter(
    (row) => String(row?.quality_state_status || '') === 'SUSPECT',
  );
  const adjustmentDriftRows = freshnessRows.filter(
    (row) => String(row?.quality_state_reason || '') === 'PROVIDER_ADJUSTMENT_DRIFT',
  );
  const corporateConflictRows = freshnessRows.filter(
    (row) => String(row?.quality_state_reason || '') === 'CORPORATE_ACTION_SOURCE_CONFLICT',
  );
  const repairedRows = freshnessRows.filter(
    (row) => String(row?.quality_state_status || '') === 'REPAIRED',
  );
  const quarantinedRows = freshnessRows.filter(
    (row) => String(row?.quality_state_status || '') === 'QUARANTINED',
  );

  return {
    total_rows: freshnessRows.length,
    suspect_count: suspectRows.length,
    repaired_count: repairedRows.length,
    quarantined_count: quarantinedRows.length,
    adjustment_drift_count: adjustmentDriftRows.length,
    corporate_action_conflict_count: corporateConflictRows.length,
    suspect_symbols_top: suspectRows.slice(0, 8).map((row) => ({
      market: row.market,
      symbol: row.symbol,
      reason: row.quality_state_reason || row.quality_gate_reason || null,
      status: row.quality_state_status || null,
    })),
  };
}

export async function getFlywheelStatus(_args?: { userId?: string }) {
  if (!shouldPreferPostgresPrimaryReads()) {
    return buildFlywheelStatus(getRepo());
  }
  return await buildFlywheelStatusPrimary();
}

async function getControlPlaneStatusUncached(args?: { userId?: string }) {
  const repo = getRepo();
  const avoidSyncFallback = shouldAvoidSyncHotPathFallback();
  const { effectiveUserId: userId } = resolveControlPlaneScope(args?.userId);
  const markets: Market[] = ['US', 'CRYPTO'];
  const runtime = await Promise.all(
    markets.map(async (market) => {
      const core = await loadRuntimeStateCorePrimary({
        userId,
        market,
      });
      let decisionCode = 'WAIT';
      let topActionSymbol: string | null = null;
      let topActionLabel: string | null = null;

      if (avoidSyncFallback) {
        const decisionSummary = summarizeControlPlaneDecision(core);
        decisionCode = decisionSummary.decision_code;
        topActionSymbol = decisionSummary.top_action_symbol;
        topActionLabel = decisionSummary.top_action_label;
      } else {
        const decision = await buildDecisionSnapshotFromCorePrimary({
          core,
        });
        const topAction =
          ((decision.ranked_action_cards as Array<Record<string, unknown>> | undefined) || [])[0] ||
          null;
        decisionCode = String(
          (decision.today_call as Record<string, unknown> | undefined)?.code || 'WAIT',
        );
        topActionSymbol = topAction ? String(topAction.symbol || '') || null : null;
        topActionLabel = topAction ? String(topAction.action_label || '') || null : null;
      }
      return {
        userId,
        market,
        as_of: core.runtimeTransparency.as_of,
        source_status: core.runtimeTransparency.source_status,
        data_status: core.runtimeTransparency.data_status,
        signal_count: core.signals.length,
        active_signal_count: core.active.length,
        decision_code: decisionCode,
        top_action_symbol: topActionSymbol,
        top_action_label: topActionLabel,
        coverage: core.runtimeTransparency.coverage_summary || null,
        freshness: core.runtimeTransparency.freshness_summary || null,
      };
    }),
  );

  const activeNotifications =
    (await tryPrimaryPostgresRead('control_plane_notifications', async () =>
      readPostgresNotificationEvents({
        userId,
        status: 'ACTIVE',
        limit: 50,
      }),
    )) ||
    (avoidSyncFallback
      ? []
      : repo.listNotificationEvents({
          userId,
          status: 'ACTIVE',
          limit: 50,
        }));
  const workflowRuns =
    (await tryPrimaryPostgresRead('control_plane_strategy_lab', async () =>
      readPostgresWorkflowRuns({
        workflowKeys: ['nova_strategy_lab'],
        limit: 10,
      }),
    )) ||
    (avoidSyncFallback
      ? []
      : repo.listWorkflowRuns({
          workflowKey: 'nova_strategy_lab',
          status: 'SUCCEEDED',
          limit: 10,
        }));
  const successfulWorkflowRuns = workflowRuns.filter((row) => row.status === 'SUCCEEDED');
  const latestStrategyLabRun = successfulWorkflowRuns[0] || null;
  const browseHome = await getBrowseHomePayload({
    view: 'NOW',
  }).catch(() => null);
  const [search, flywheel, executionGovernance] = await Promise.all([
    getSearchHealthPrimary(),
    getFlywheelStatus({ userId }),
    avoidSyncFallback
      ? Promise.resolve(buildDefaultExecutionGovernance())
      : runExecutionGovernance({
          repo,
          userId,
          limit: 8,
          refreshOrders: false,
        }),
  ]);

  return {
    as_of: new Date().toISOString(),
    search: {
      ...search,
      query_path: '/api/assets/search',
      browse_home_status: browseHome ? 'READY' : 'UNAVAILABLE',
      browse_home_featured_count: browseHome?.futuresMarkets?.length || 0,
      browse_home_movers_count: browseHome?.topMovers?.length || 0,
    },
    runtime,
    quality_summary: summarizeRuntimeQuality(runtime as Array<Record<string, any>>),
    strategy_factory: {
      latest_run_at: latestStrategyLabRun
        ? new Date(latestStrategyLabRun.updated_at_ms).toISOString()
        : null,
      latest_status: latestStrategyLabRun?.status || 'IDLE',
      recent_run_count: successfulWorkflowRuns.length,
    },
    execution_governance: {
      kill_switch: executionGovernance.kill_switch,
      champion_challenger: executionGovernance.champion_challenger,
      reconciliation_summary: executionGovernance.reconciliation.summary,
    },
    flywheel,
    delivery: {
      active_notification_count: activeNotifications.length,
      latest_notification_at: activeNotifications[0]
        ? new Date(activeNotifications[0].updated_at_ms).toISOString()
        : null,
    },
  };
}

export async function getControlPlaneStatus(args?: { userId?: string }) {
  const { cacheKey, effectiveUserId } = resolveControlPlaneScope(args?.userId);
  return runCachedControlPlaneRead(cacheKey, () =>
    getControlPlaneStatusUncached({ userId: effectiveUserId }),
  );
}

export async function getRecentOutcomeSummary(args?: { userId?: string; limit?: number }) {
  const requestedUserId = args?.userId || 'guest-default';
  const effectiveUserId = isGuestScopedUserId(requestedUserId) ? 'guest-default' : requestedUserId;
  const limit = Math.min(Math.max(1, Number(args?.limit) || 100), 200);
  return await cachedFrontendRead(
    'outcomes.recent',
    {
      userId: effectiveUserId,
      limit,
    },
    async () => getOutcomeSummaryStats(getRepo(), effectiveUserId, limit),
    RECENT_OUTCOME_SUMMARY_CACHE_TTL_MS,
  );
}

export function getBackendBackbone(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
}) {
  return buildBackendBackboneSummary(args);
}

export function runEvidence(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  timeframe?: string;
  maxSignals?: number;
  force?: boolean;
}) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    assetClass: args.assetClass,
    timeframe: args.timeframe,
  });
  return runEvidenceEngine(repo, {
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass,
    timeframe: args.timeframe,
    maxSignals: args.maxSignals,
    force: args.force,
  });
}

export function getEvidenceTopSignals(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  limit?: number;
}) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false, {
    market: args.market,
    assetClass: args.assetClass,
  });
  return getTopSignalEvidence(repo, {
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass,
    limit: args.limit,
  });
}

export async function getEvidenceTopSignalsPrimary(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
  limit?: number;
}) {
  const contracts = await listSignalContractsPrimary({
    userId: args.userId || 'guest-default',
    market: args.market,
    assetClass: args.assetClass,
    status: 'ALL',
    limit: Math.max(3, Number(args.limit || 3) * 3),
  });
  if (shouldAvoidSyncHotPathFallback()) {
    return buildRuntimeSignalEvidenceFromContracts(contracts, args.limit);
  }
  return getEvidenceTopSignals(args);
}

export function getEvidenceSignalDetail(args: { signalId: string; userId?: string }) {
  const repo = getRepo();
  syncQuantState(args.userId || 'guest-default', false);
  return getSignalEvidenceDetail(repo, {
    signalId: args.signalId,
    userId: args.userId || 'guest-default',
  });
}

export function listEvidenceBacktests(args?: {
  runType?: string;
  status?: string;
  strategyVersionId?: string;
  limit?: number;
}) {
  const repo = getRepo();
  return listBacktestEvidence(repo, {
    runType: args?.runType,
    status: args?.status,
    strategyVersionId: args?.strategyVersionId,
    limit: args?.limit,
  });
}

export function getEvidenceBacktestDetail(runId: string) {
  const repo = getRepo();
  return getBacktestEvidenceDetail(repo, runId);
}

export function listEvidenceReconciliation(args?: {
  replayRunId?: string;
  symbol?: string;
  strategyVersionId?: string;
  status?: 'RECONCILED' | 'PAPER_DATA_UNAVAILABLE' | 'REPLAY_DATA_UNAVAILABLE' | 'PARTIAL';
  limit?: number;
}) {
  const repo = getRepo();
  return listReconciliationEvidence(repo, {
    replayRunId: args?.replayRunId,
    symbol: args?.symbol,
    strategyVersionId: args?.strategyVersionId,
    status: args?.status,
    limit: args?.limit,
  });
}

export function getEvidenceChampionStrategies() {
  const repo = getRepo();
  return getChampionStrategies(repo);
}

export async function runQlibNativeEvidence(args: {
  request: QlibNativeBacktestRequest;
  market?: Market | 'ALL';
  assetClass?: AssetClass | 'ALL';
}) {
  const repo = getRepo();
  return runQlibNativeBacktestEvidence({
    repo,
    request: args.request,
    market: args.market,
    assetClass: args.assetClass,
  });
}

export async function runQlibResearchFactory(input: QlibResearchFactoryInput) {
  const repo = getRepo();
  return runQlibResearchFactoryService(repo, input);
}

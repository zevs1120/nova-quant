import express from 'express';
import { isoToMs } from '../utils/time.js';
import type { AssetClass, Market, NovaTaskType, Timeframe } from '../types.js';
import {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthSession,
  handleAuthSignup,
  handleForgotPassword,
  handleGetAuthProfile,
  handlePostAuthProfile,
  handleResetPassword
} from './authHandlers.js';
import {
  completeMorningCheck,
  completeWeeklyReview,
  completeWrapUp,
  confirmRiskBoundary,
  ensureDefaultPublicSignalsApiKey,
  getBackendBackbone,
  getBrowseHomePayload,
  getControlPlaneStatus,
  getFlywheelStatus,
  createNovaReviewLabel,
  getEngagementState,
  getDecisionSnapshot,
  exportNovaTrainingDataset,
  getNovaHealthState,
  getPrivateMarvixOps,
  getNovaRuntimeState,
  getRuntimeState,
  getEvidenceBacktestDetail,
  getEvidenceChampionStrategies,
  getEvidenceSignalDetail,
  getEvidenceTopSignals,
  getMarketState,
  getMarketModules,
  getNotificationPreferencesState,
  getNotificationPreview,
  listEvidenceBacktests,
  listNovaRuns,
  listDecisionAudit,
  listEvidenceReconciliation,
  listExternalConnections,
  getPerformanceSummary,
  getRiskProfile,
  setRiskProfile,
  getSignalContract,
  getBrowseAssetOverview,
  getBrowseAssetChart,
  getBrowseNewsFeed,
  getSearchHealth,
  listAssets,
  searchAssets,
  listExecutions,
  listSignalContracts,
  queryOhlcv,
  recordNovaAssistantRun,
  runEvidence,
  runNovaStrategyGeneration,
  runNovaTrainingFlywheelNow,
  setNotificationPreferencesState,
  getWidgetSummary,
  syncQuantState,
  upsertExecution,
  upsertExternalConnection,
  verifyPublicSignalsApiKey
} from './queries.js';
import { claimManualReferral, getManualDashboard, redeemManualVipDay, submitManualPredictionEntry } from '../manual/service.js';
import { checkRateLimit } from '../chat/rateLimit.js';
import { getChatThreadMessages, listChatThreads, streamChat } from '../chat/service.js';
import { logChatAudit } from '../chat/audit.js';
import { createBrokerAdapter, createExchangeAdapter } from '../connect/adapters.js';
import {
  compareFactorPerformanceByRegimeTool,
  explainWhyNoSignalTool,
  explainWhySignalExistsTool,
  getBacktestIntegrityReportTool,
  getResearchDoctrineTool,
  getExperimentRegistryTool,
  getFactorCatalogTool,
  getFactorDefinitionTool,
  getFactorInteractionsTool,
  getFactorMeasuredReportTool,
  getFactorResearchSnapshotTool,
  getRegimeDiagnosticsTool,
  getRegimeTaxonomyTool,
  getResearchMemoryTool,
  getResearchWorkflowPlanTool,
  getStrategyEvaluationReportTool,
  getStrategyRegistryTool,
  getTurnoverCostReportTool,
  getValidationReportTool,
  listFailedExperimentsTool,
  runFactorDiagnosticsTool,
  summarizeResearchOnTopicTool
} from '../research/tools.js';
import { isLoopbackAddress } from '../ops/privateMarvixOps.js';

function parseMarket(value?: string): Market | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper;
  return undefined;
}

function parseTimeframe(value?: string): Timeframe | undefined {
  if (!value) return undefined;
  const tf = value as Timeframe;
  if (['1m', '5m', '15m', '1h', '1d'].includes(tf)) return tf;
  return undefined;
}

function parseAssetClass(value?: string): AssetClass | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === 'OPTIONS' || upper === 'US_STOCK' || upper === 'CRYPTO') return upper;
  return undefined;
}

function parseSignalStatus(value?: string): 'ALL' | 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED' | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (
    upper === 'ALL' ||
    upper === 'NEW' ||
    upper === 'TRIGGERED' ||
    upper === 'EXPIRED' ||
    upper === 'INVALIDATED' ||
    upper === 'CLOSED'
  ) {
    return upper;
  }
  return undefined;
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const requireLoopbackOnly = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const remote = req.socket.remoteAddress || req.ip || null;
    if (!isLoopbackAddress(remote)) {
      res.status(403).json({ error: 'Private Marvix ops endpoint is loopback-only.' });
      return;
    }
    next();
  };
  app.use((req, res, next) => {
    const allowCrossOriginRead =
      req.path === '/api/auth/session' ||
      req.path === '/api/manual/state' ||
      req.path === '/api/assets' ||
      req.path === '/api/assets/search' ||
      req.path === '/api/browse/chart' ||
      req.path === '/api/browse/home' ||
      req.path === '/api/browse/news' ||
      req.path === '/api/browse/overview' ||
      req.path === '/api/ohlcv' ||
      req.path === '/api/runtime-state' ||
      req.path === '/api/signals' ||
      req.path === '/api/evidence/signals/top' ||
      req.path === '/api/market-state' ||
      req.path === '/api/performance' ||
      req.path === '/api/market/modules' ||
      req.path === '/api/risk-profile' ||
      req.path === '/api/control-plane/status' ||
      req.path === '/api/control-plane/flywheel' ||
      req.path === '/api/connect/broker' ||
      req.path === '/api/connect/exchange';
    if (!(allowCrossOriginRead && (req.method === 'GET' || req.method === 'OPTIONS'))) {
      next();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', req.header('origin') || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  ensureDefaultPublicSignalsApiKey();

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.get('/api/internal/marvix/ops', requireLoopbackOnly, (_req, res) => {
    res.json(getPrivateMarvixOps());
  });

  app.get('/api/auth/session', handleAuthSession);
  app.post('/api/auth/signup', handleAuthSignup);
  app.post('/api/auth/login', handleAuthLogin);
  app.post('/api/auth/logout', handleAuthLogout);
  app.post('/api/auth/forgot-password', handleForgotPassword);
  app.post('/api/auth/reset-password', handleResetPassword);
  app.get('/api/auth/profile', handleGetAuthProfile);
  app.post('/api/auth/profile', handlePostAuthProfile);

  app.get('/api/assets', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    if (req.query.market && !market) {
      res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
      return;
    }

    const assets = listAssets(market);
    res.json({ market: market ?? 'ALL', count: assets.length, data: assets });
  });

  app.get('/api/assets/search', async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    if (req.query.market && !market) {
      res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
      return;
    }
    const query = String(req.query.q || '');
    const limit = req.query.limit ? Number(req.query.limit) : 24;
    const results = await searchAssets({
      query,
      limit,
      market
    });
    res.json({
      query,
      market: market ?? 'ALL',
      count: results.length,
      data: results,
      health: getSearchHealth({
        market,
        query,
        resultCount: results.length
      })
    });
  });

  app.get('/api/manual/state', (req, res) => {
    const userId = (req.query.userId as string | undefined) || '';
    res.json(getManualDashboard(userId));
  });

  app.post('/api/manual/rewards/redeem', (req, res) => {
    const body = req.body as { userId?: string; days?: number };
    const result = redeemManualVipDay({
      userId: String(body.userId || ''),
      days: body.days
    });
    if (!result.ok) {
      res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/manual/referrals/claim', (req, res) => {
    const body = req.body as { userId?: string; inviteCode?: string };
    const result = claimManualReferral({
      userId: String(body.userId || ''),
      inviteCode: String(body.inviteCode || '')
    });
    if (!result.ok) {
      res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/manual/predictions/entry', (req, res) => {
    const body = req.body as { userId?: string; marketId?: string; selectedOption?: string; pointsStaked?: number };
    const result = submitManualPredictionEntry({
      userId: String(body.userId || ''),
      marketId: String(body.marketId || ''),
      selectedOption: String(body.selectedOption || ''),
      pointsStaked: body.pointsStaked
    });
    if (!result.ok) {
      res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
      return;
    }
    res.json(result);
  });

  app.get('/api/browse/home', async (req, res) => {
    const view = req.query.view as string | undefined;
    res.json(
      await getBrowseHomePayload({
        view
      })
    );
  });

  app.get('/api/browse/chart', async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();

    if (!market || !symbol) {
      res.status(400).json({ error: 'Required query params: market, symbol' });
      return;
    }

    const data = await getBrowseAssetChart({
      market,
      symbol
    });

    if (!data) {
      res.status(404).json({ error: 'Browse chart unavailable' });
      return;
    }

    res.json({
      market,
      symbol,
      count: data.points.length,
      data
    });
  });

  app.get('/api/browse/news', async (req, res) => {
    const market = req.query.market ? parseMarket(req.query.market as string | undefined) : 'ALL';
    if (req.query.market && !market) {
      res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
      return;
    }
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    const data = await getBrowseNewsFeed({
      market,
      symbol,
      limit
    });
    res.json({
      market,
      symbol: symbol || null,
      count: data.length,
      data
    });
  });

  app.get('/api/browse/overview', async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    if (!market || !symbol) {
      res.status(400).json({ error: 'Required query params: market, symbol' });
      return;
    }
    const data = await getBrowseAssetOverview({
      market,
      symbol
    });
    if (!data) {
      res.status(404).json({ error: 'Browse overview unavailable' });
      return;
    }
    res.json({
      market,
      symbol,
      data
    });
  });

  app.get('/api/signals', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const status = parseSignalStatus(req.query.status as string | undefined) || 'ALL';
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const limit = req.query.limit ? Number(req.query.limit) : 40;
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    if (req.query.assetClass && !assetClass) {
      res.status(400).json({ error: 'Invalid assetClass, use OPTIONS | US_STOCK | CRYPTO' });
      return;
    }
    syncQuantState(userId, false, { market, assetClass });
    const data = listSignalContracts({
      userId,
      assetClass,
      market,
      symbol,
      status,
      limit
    });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data
    });
  });

  app.get('/api/public/signals', (req, res) => {
    const key = (req.header('x-api-key') || req.query.apikey || req.query.apiKey || '').toString();
    if (!verifyPublicSignalsApiKey(key)) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const status = parseSignalStatus(req.query.status as string | undefined) || 'ALL';
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const data = listSignalContracts({
      userId: 'public-api',
      assetClass,
      market,
      symbol,
      status,
      limit
    });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data
    });
  });

  app.get('/api/market/modules', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const modules = getMarketModules({
      market,
      assetClass
    });
    res.json({
      asof: new Date().toISOString(),
      count: modules.length,
      data: modules
    });
  });

  app.get('/api/runtime-state', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const runtime = getRuntimeState({
      userId,
      market,
      assetClass
    });
    res.json(runtime);
  });

  app.get('/api/control-plane/status', async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    res.json(
      await getControlPlaneStatus({
        userId
      })
    );
  });

  app.get('/api/control-plane/flywheel', async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    res.json(
      await getFlywheelStatus({
        userId
      })
    );
  });

  app.get('/api/backbone/summary', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    res.json(
      getBackendBackbone({
        userId,
        market,
        assetClass
      })
    );
  });

  app.get('/api/nova/runtime', (_req, res) => {
    res.json(getNovaRuntimeState());
  });

  app.get('/api/nova/health', async (_req, res) => {
    res.json(await getNovaHealthState());
  });

  app.get('/api/nova/runs', (req, res) => {
    const userId = (req.query.userId as string | undefined) || undefined;
    const threadId = (req.query.threadId as string | undefined) || undefined;
    const taskType = (req.query.taskType as string | undefined) || undefined;
    const status = (req.query.status as string | undefined) || undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 60;
    res.json(
      listNovaRuns({
        userId,
        threadId,
        taskType,
        status,
        limit
      })
    );
  });

  app.post('/api/nova/review-label', (req, res) => {
    const body = (req.body || {}) as {
      runId?: string;
      reviewerId?: string;
      label?: string;
      score?: number;
      notes?: string;
      includeInTraining?: boolean;
    };
    const runId = String(body.runId || '').trim();
    const label = String(body.label || '').trim();
    if (!runId || !label) {
      res.status(400).json({ error: 'runId and label are required' });
      return;
    }
    res.json(
      createNovaReviewLabel({
        runId,
        reviewerId: body.reviewerId,
        label,
        score: body.score,
        notes: body.notes,
        includeInTraining: Boolean(body.includeInTraining)
      })
    );
  });

  app.get('/api/nova/training/export', (req, res) => {
    const onlyIncluded = String(req.query.onlyIncluded || '').toLowerCase() === 'true';
    const limit = req.query.limit ? Number(req.query.limit) : 500;
    res.json(
      exportNovaTrainingDataset({
        onlyIncluded,
        limit
      })
    );
  });

  app.post('/api/nova/training/flywheel', async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      trainer?: string;
      onlyIncluded?: boolean;
      limit?: number;
      taskTypes?: string[];
    };
    const trainer = String(body.trainer || 'unsloth-lora').trim();
    if (!['mlx-lora', 'unsloth-lora', 'axolotl-qlora'].includes(trainer)) {
      res.status(400).json({ error: 'trainer must be mlx-lora, unsloth-lora, or axolotl-qlora' });
      return;
    }
    const taskTypes = Array.isArray(body.taskTypes)
      ? body.taskTypes.map((value) => String(value).trim()).filter(Boolean)
      : undefined;
    res.json(
      await runNovaTrainingFlywheelNow({
        userId: String(body.userId || '').trim() || undefined,
        trainer: trainer as 'mlx-lora' | 'unsloth-lora' | 'axolotl-qlora',
        onlyIncluded: body.onlyIncluded !== false,
        limit: Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined,
        taskTypes: taskTypes as NovaTaskType[] | undefined
      })
    );
  });

  app.post('/api/nova/strategy/generate', async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      prompt?: string;
      locale?: string;
      market?: string;
      riskProfile?: string;
      maxCandidates?: number;
    };
    const prompt = String(body.prompt || '').trim();
    const market = parseMarket(body.market);
    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }
    if (body.market && !market) {
      res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
      return;
    }
    res.json(
      await runNovaStrategyGeneration({
        userId: String(body.userId || '').trim() || undefined,
        prompt,
        locale: String(body.locale || '').trim() || undefined,
        market,
        riskProfile: String(body.riskProfile || '').trim() || undefined,
        maxCandidates: Number.isFinite(Number(body.maxCandidates)) ? Number(body.maxCandidates) : undefined
      })
    );
  });

  app.post('/api/decision/today', async (req, res) => {
    const body = req.body as {
      userId?: string;
      market?: string;
      assetClass?: string;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    const market = parseMarket(body.market);
    const assetClass = parseAssetClass(body.assetClass);
    const userId = (body.userId as string | undefined) || 'guest-default';
    const decision = await getDecisionSnapshot({
      userId,
      market,
      assetClass,
      holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
      locale: body.locale
    });
    res.json(decision);
  });

  app.get('/api/decision/audit', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    res.json(
      listDecisionAudit({
        userId,
        market,
        assetClass,
        limit
      })
    );
  });

  app.post('/api/engagement/state', async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      localDate?: string;
      localHour?: number;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    const market = parseMarket(body.market);
    const assetClass = parseAssetClass(body.assetClass);
    const userId = body.userId || 'guest-default';
    res.json(
      await getEngagementState({
        userId,
        market,
        assetClass,
        localDate: body.localDate,
        localHour: Number(body.localHour),
        holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
        locale: body.locale
      })
    );
  });

  app.post('/api/engagement/morning-check', async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      localDate?: string;
      localHour?: number;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    res.json(
      await completeMorningCheck({
        userId: body.userId,
        market: parseMarket(body.market),
        assetClass: parseAssetClass(body.assetClass),
        localDate: body.localDate,
        localHour: Number(body.localHour),
        holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
        locale: body.locale
      })
    );
  });

  app.post('/api/engagement/boundary', async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      localDate?: string;
      localHour?: number;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    res.json(
      await confirmRiskBoundary({
        userId: body.userId,
        market: parseMarket(body.market),
        assetClass: parseAssetClass(body.assetClass),
        localDate: body.localDate,
        localHour: Number(body.localHour),
        holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
        locale: body.locale
      })
    );
  });

  app.post('/api/engagement/wrap-up', async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      localDate?: string;
      localHour?: number;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    res.json(
      await completeWrapUp({
        userId: body.userId,
        market: parseMarket(body.market),
        assetClass: parseAssetClass(body.assetClass),
        localDate: body.localDate,
        localHour: Number(body.localHour),
        holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
        locale: body.locale
      })
    );
  });

  app.post('/api/engagement/weekly-review', async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      localDate?: string;
      localHour?: number;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    res.json(
      await completeWeeklyReview({
        userId: body.userId,
        market: parseMarket(body.market),
        assetClass: parseAssetClass(body.assetClass),
        localDate: body.localDate,
        localHour: Number(body.localHour),
        holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
        locale: body.locale
      })
    );
  });

  app.get('/api/widgets/summary', async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const localDate = req.query.localDate as string | undefined;
    const localHour = req.query.localHour ? Number(req.query.localHour) : undefined;
    const locale = req.query.locale as string | undefined;
    res.json(
      await getWidgetSummary({
        userId,
        market,
        assetClass,
        localDate,
        localHour,
        locale
      })
    );
  });

  app.get('/api/notifications/preview', async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const localDate = req.query.localDate as string | undefined;
    const localHour = req.query.localHour ? Number(req.query.localHour) : undefined;
    const locale = req.query.locale as string | undefined;
    res.json(
      await getNotificationPreview({
        userId,
        market,
        assetClass,
        localDate,
        localHour,
        locale
      })
    );
  });

  app.get('/api/notification-preferences', (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    res.json(getNotificationPreferencesState(userId));
  });

  app.post('/api/notification-preferences', (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      morning_enabled?: number | boolean;
      state_shift_enabled?: number | boolean;
      protective_enabled?: number | boolean;
      wrap_up_enabled?: number | boolean;
      frequency?: 'LOW' | 'NORMAL';
      quiet_start_hour?: number | null;
      quiet_end_hour?: number | null;
    };
    res.json(
      setNotificationPreferencesState({
        userId: body.userId,
        updates: {
          morning_enabled:
            body.morning_enabled === undefined ? undefined : Number(Boolean(body.morning_enabled)),
          state_shift_enabled:
            body.state_shift_enabled === undefined ? undefined : Number(Boolean(body.state_shift_enabled)),
          protective_enabled:
            body.protective_enabled === undefined ? undefined : Number(Boolean(body.protective_enabled)),
          wrap_up_enabled:
            body.wrap_up_enabled === undefined ? undefined : Number(Boolean(body.wrap_up_enabled)),
          frequency: body.frequency,
          quiet_start_hour:
            body.quiet_start_hour === undefined ? undefined : body.quiet_start_hour === null ? null : Number(body.quiet_start_hour),
          quiet_end_hour:
            body.quiet_end_hour === undefined ? undefined : body.quiet_end_hour === null ? null : Number(body.quiet_end_hour)
        }
      })
    );
  });

  app.get('/api/research/factors', (_req, res) => {
    res.json(getFactorCatalogTool());
  });

  app.get('/api/research/doctrine', (_req, res) => {
    res.json(getResearchDoctrineTool());
  });

  app.get('/api/research/factors/:id', (req, res) => {
    res.json(getFactorDefinitionTool(String(req.params.id || '')));
  });

  app.get('/api/research/factors/:id/interactions', (req, res) => {
    res.json(getFactorInteractionsTool(String(req.params.id || '')));
  });

  app.get('/api/research/factors/:id/measured', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    res.json(
      getFactorMeasuredReportTool({
        factorId: String(req.params.id || ''),
        market,
        assetClass
      })
    );
  });

  app.get('/api/research/strategies', (_req, res) => {
    res.json(getStrategyRegistryTool());
  });

  app.get('/api/research/regimes', (_req, res) => {
    res.json(getRegimeTaxonomyTool());
  });

  app.get('/api/research/diagnostics/regime', (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    res.json(getRegimeDiagnosticsTool({ userId, market, assetClass, symbol }));
  });

  app.get('/api/research/diagnostics/factor', (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const signalId = (req.query.signalId as string | undefined) || undefined;
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase() || undefined;
    const factorId = (req.query.factorId as string | undefined) || undefined;
    res.json(
      runFactorDiagnosticsTool({
        userId,
        market,
        assetClass,
        signalId,
        symbol,
        factorId
      })
    );
  });

  app.get('/api/research/backtest-integrity', (req, res) => {
    const runId = (req.query.runId as string | undefined) || undefined;
    res.json(getBacktestIntegrityReportTool({ runId }));
  });

  app.get('/api/research/evaluation/strategy', (req, res) => {
    const runId = (req.query.runId as string | undefined) || undefined;
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    res.json(getStrategyEvaluationReportTool({ runId, market, assetClass }));
  });

  app.get('/api/research/validation-report', (req, res) => {
    const runId = (req.query.runId as string | undefined) || undefined;
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    res.json(getValidationReportTool({ runId, market, assetClass }));
  });

  app.get('/api/research/turnover-cost', (req, res) => {
    const runId = (req.query.runId as string | undefined) || undefined;
    res.json(getTurnoverCostReportTool({ runId }));
  });

  app.get('/api/research/failed-experiments', (_req, res) => {
    res.json(listFailedExperimentsTool());
  });

  app.get('/api/research/experiments', (_req, res) => {
    res.json(getExperimentRegistryTool());
  });

  app.get('/api/research/memory', (_req, res) => {
    res.json(getResearchMemoryTool());
  });

  app.get('/api/research/workflow', (req, res) => {
    const topic = String((req.query.topic as string | undefined) || '');
    const factorId = (req.query.factorId as string | undefined) || undefined;
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    res.json(getResearchWorkflowPlanTool({ topic, factorId, market, assetClass }));
  });

  app.get('/api/research/topic', (req, res) => {
    const topic = String((req.query.topic as string | undefined) || '');
    res.json(summarizeResearchOnTopicTool({ topic }));
  });

  app.get('/api/research/explain-signal', (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const signalId = (req.query.signalId as string | undefined) || undefined;
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase() || undefined;
    res.json(
      explainWhySignalExistsTool({
        userId,
        market,
        assetClass,
        signalId,
        symbol
      })
    );
  });

  app.get('/api/research/explain-no-signal', (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    res.json(explainWhyNoSignalTool({ userId, market, assetClass }));
  });

  app.get('/api/research/factors/:id/by-regime', (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const runId = (req.query.runId as string | undefined) || undefined;
    res.json(
      compareFactorPerformanceByRegimeTool({
        userId,
        market,
        assetClass,
        runId,
        factorId: String(req.params.id || '')
      })
    );
  });

  app.get('/api/research/factors/:id/snapshot', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const runId = (req.query.runId as string | undefined) || undefined;
    res.json(
      getFactorResearchSnapshotTool({
        runId,
        factorId: String(req.params.id || ''),
        market,
        assetClass
      })
    );
  });

  app.post('/api/evidence/run', (req, res) => {
    const body = req.body as {
      userId?: string;
      market?: string;
      assetClass?: string;
      timeframe?: string;
      maxSignals?: number;
      force?: boolean;
    };
    const market = parseMarket(body.market);
    const assetClass = parseAssetClass(body.assetClass);
    const out = runEvidence({
      userId: body.userId || 'guest-default',
      market,
      assetClass,
      timeframe: body.timeframe,
      maxSignals: body.maxSignals,
      force: body.force
    });
    res.json(out);
  });

  app.get('/api/evidence/signals/top', (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const limit = req.query.limit ? Number(req.query.limit) : 3;
    const out = getEvidenceTopSignals({
      userId,
      market,
      assetClass,
      limit
    });
    res.json(out);
  });

  app.get('/api/evidence/signals/:id', (req, res) => {
    const signalId = String(req.params.id || '');
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const out = getEvidenceSignalDetail({
      signalId,
      userId
    });
    if (!out.detail) {
      res.status(404).json({ error: 'Signal evidence not found' });
      return;
    }
    res.json(out);
  });

  app.get('/api/evidence/backtests', (req, res) => {
    const runType = (req.query.runType as string | undefined) || undefined;
    const status = (req.query.status as string | undefined) || undefined;
    const strategyVersionId = (req.query.strategyVersionId as string | undefined) || undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const out = listEvidenceBacktests({
      runType,
      status,
      strategyVersionId,
      limit
    });
    res.json(out);
  });

  app.get('/api/evidence/backtests/:id', (req, res) => {
    const runId = String(req.params.id || '');
    const out = getEvidenceBacktestDetail(runId);
    if (!out.detail) {
      res.status(404).json({ error: 'Backtest run not found' });
      return;
    }
    res.json(out);
  });

  app.get('/api/evidence/reconciliation', (req, res) => {
    const replayRunId = (req.query.replayRunId as string | undefined) || undefined;
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase() || undefined;
    const strategyVersionId = (req.query.strategyVersionId as string | undefined) || undefined;
    const status =
      (req.query.status as 'RECONCILED' | 'PAPER_DATA_UNAVAILABLE' | 'REPLAY_DATA_UNAVAILABLE' | 'PARTIAL' | undefined) || undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const out = listEvidenceReconciliation({
      replayRunId,
      symbol,
      strategyVersionId,
      status,
      limit
    });
    res.json(out);
  });

  app.get('/api/evidence/strategies/champion', (_req, res) => {
    const out = getEvidenceChampionStrategies();
    res.json(out);
  });

  app.get('/api/signals/:id', (req, res) => {
    const signalId = String(req.params.id || '');
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    syncQuantState(userId);
    const data = getSignalContract(signalId, userId);
    if (!data) {
      res.status(404).json({ error: 'Signal not found' });
      return;
    }
    const executions = listExecutions({ userId, signalId, limit: 20 });
    res.json({ data, executions });
  });

  app.post('/api/executions', (req, res) => {
    const body = req.body as {
      userId?: string;
      signalId?: string;
      mode?: 'PAPER' | 'LIVE';
      action?: 'EXECUTE' | 'DONE' | 'CLOSE';
      note?: string;
      pnlPct?: number | null;
    };
    const userId = String(body.userId || '').trim() || 'guest-default';
    const signalId = String(body.signalId || '').trim();
    const mode = body.mode || 'PAPER';
    const action = body.action || 'EXECUTE';
    if (!signalId) {
      res.status(400).json({ error: 'signalId is required' });
      return;
    }
    if (!['PAPER'].includes(mode) || !['EXECUTE', 'DONE', 'CLOSE'].includes(action)) {
      res.status(400).json({ error: 'Invalid mode/action' });
      return;
    }

    const result = upsertExecution({
      userId,
      signalId,
      mode,
      action,
      note: body.note,
      pnlPct: body.pnlPct
    });
    if (!result.ok) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({ ok: true, executionId: result.executionId });
  });

  app.get('/api/executions', (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const market = parseMarket(req.query.market as string | undefined);
    const mode = req.query.mode === 'LIVE' ? 'LIVE' : req.query.mode === 'PAPER' ? 'PAPER' : undefined;
    const signalId = (req.query.signalId as string | undefined) || undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const data = listExecutions({ userId, market, mode, signalId, limit });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data
    });
  });

  app.get('/api/market-state', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const timeframe = req.query.tf as string | undefined;
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const data = getMarketState({
      userId,
      market,
      symbol,
      timeframe
    });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data
    });
  });

  app.get('/api/performance', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const range = (req.query.range as string | undefined) || undefined;
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const data = getPerformanceSummary({ userId, market, range });
    res.json(data);
  });

  app.get('/api/risk-profile', (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const data = getRiskProfile(userId, { skipSync: true });
    res.json({ data });
  });

  app.post('/api/risk-profile', (req, res) => {
    const body = req.body as { userId?: string; profileKey?: 'conservative' | 'balanced' | 'aggressive' };
    const userId = String(body.userId || '').trim() || 'guest-default';
    const profileKey = body.profileKey;
    if (!profileKey || !['conservative', 'balanced', 'aggressive'].includes(profileKey)) {
      res.status(400).json({ error: 'profileKey must be conservative|balanced|aggressive' });
      return;
    }
    const data = setRiskProfile(userId, profileKey);
    res.json({ ok: true, data });
  });

  app.get('/api/connect/broker', async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const provider = String((req.query.provider as string | undefined) || 'ALPACA').toUpperCase();
    const adapter = createBrokerAdapter(provider);
    const snapshot = await adapter.fetchSnapshot();
    upsertExternalConnection({
      userId,
      connectionType: 'BROKER',
      provider,
      mode: snapshot.mode,
      status: snapshot.status,
      meta: {
        source_status: snapshot.source_status,
        data_status: snapshot.data_status,
        source_label: snapshot.source_label,
        reason_code: snapshot.reason_code,
        message: snapshot.message,
        last_checked_at: snapshot.last_checked_at,
        can_read_positions: snapshot.can_read_positions,
        can_trade: snapshot.can_trade
      }
    });
    const connections = listExternalConnections({ userId, connectionType: 'BROKER' });
    res.json({
      provider,
      mode: snapshot.mode,
      snapshot,
      connections
    });
  });

  app.post('/api/connect/broker', (req, res) => {
    const body = req.body as { userId?: string; provider?: string; mode?: 'READ_ONLY' | 'TRADING' };
    const userId = body.userId || 'guest-default';
    const provider = String(body.provider || 'ALPACA').toUpperCase();
    const mode = body.mode || 'READ_ONLY';
    const saved = upsertExternalConnection({
      userId,
      connectionType: 'BROKER',
      provider,
      mode,
      status: 'PENDING',
      meta: {
        requested_at: new Date().toISOString(),
        note: 'Connection request saved. Actual status determined by adapter checks.',
        can_read_positions: false,
        can_trade: false
      }
    });
    res.json({ ok: true, ...saved });
  });

  app.get('/api/connect/exchange', async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const provider = String((req.query.provider as string | undefined) || 'BINANCE').toUpperCase();
    const adapter = createExchangeAdapter(provider);
    const snapshot = await adapter.fetchSnapshot();
    upsertExternalConnection({
      userId,
      connectionType: 'EXCHANGE',
      provider,
      mode: snapshot.mode,
      status: snapshot.status,
      meta: {
        source_status: snapshot.source_status,
        data_status: snapshot.data_status,
        source_label: snapshot.source_label,
        reason_code: snapshot.reason_code,
        message: snapshot.message,
        last_checked_at: snapshot.last_checked_at,
        can_read_positions: snapshot.can_read_positions,
        can_trade: snapshot.can_trade
      }
    });
    const connections = listExternalConnections({ userId, connectionType: 'EXCHANGE' });
    res.json({
      provider,
      mode: snapshot.mode,
      snapshot,
      connections
    });
  });

  app.post('/api/connect/exchange', (req, res) => {
    const body = req.body as { userId?: string; provider?: string; mode?: 'READ_ONLY' | 'TRADING' };
    const userId = body.userId || 'guest-default';
    const provider = String(body.provider || 'BINANCE').toUpperCase();
    const mode = body.mode || 'READ_ONLY';
    const saved = upsertExternalConnection({
      userId,
      connectionType: 'EXCHANGE',
      provider,
      mode,
      status: 'PENDING',
      meta: {
        requested_at: new Date().toISOString(),
        note: 'Connection request saved. Actual status determined by adapter checks.',
        can_read_positions: false,
        can_trade: false
      }
    });
    res.json({ ok: true, ...saved });
  });

  app.get('/api/ohlcv', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const timeframe = parseTimeframe(req.query.tf as string | undefined);
    const start = isoToMs(req.query.start as string | undefined);
    const end = isoToMs(req.query.end as string | undefined);
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    if (!market || !symbol || !timeframe) {
      res.status(400).json({ error: 'Required query params: market, symbol, tf' });
      return;
    }

    const { asset, rows } = queryOhlcv({
      market,
      symbol,
      timeframe,
      start,
      end,
      limit
    });

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    res.json({
      asset,
      timeframe,
      start,
      end,
      count: rows.length,
      data: rows
    });
  });

  async function handleChat(req: express.Request, res: express.Response) {
    const startedAt = Date.now();
    const body = req.body as {
      userId?: string;
      threadId?: string;
      message?: string;
      context?: {
        signalId?: string;
        symbol?: string;
        market?: Market;
        assetClass?: AssetClass;
        timeframe?: string;
        page?: 'today' | 'ai' | 'holdings' | 'more' | 'signal-detail' | 'unknown';
        riskProfileKey?: string;
        uiMode?: string;
        decisionSummary?: {
          today_call?: string;
          risk_posture?: string;
          top_action_id?: string | null;
          top_action_symbol?: string | null;
          top_action_label?: string | null;
          source_status?: string;
          data_status?: string;
        };
        holdingsSummary?: {
          holdings_count?: number;
          total_weight_pct?: number;
          aligned_weight_pct?: number;
          unsupported_weight_pct?: number;
          top1_pct?: number;
          risk_level?: string;
          recommendation?: string;
        };
      };
    };
    const userId = String(body?.userId || '').trim();
    const message = String(body?.message || '').trim();
    const threadId = String(body?.threadId || '').trim() || undefined;
    const context = body?.context;

    if (!userId || !message) {
      res.status(400).json({ error: 'userId and message are required' });
      return;
    }

    const rate = checkRateLimit(userId);
    if (!rate.allowed) {
      logChatAudit({
        userId,
        mode: context ? 'context-aware' : 'general-coach',
        provider: 'none',
        message,
        contextJson: JSON.stringify(context ?? {}),
        status: 'rate_limited',
        durationMs: Date.now() - startedAt
      });
      res.status(429).json({
        error: 'Rate limit exceeded',
        resetAt: rate.resetAt
      });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    let mode: 'general-coach' | 'context-aware' | 'research-assistant' = context ? 'context-aware' : 'general-coach';
    let provider = 'unknown';
    let resolvedThreadId = threadId;
    let responseText = '';
    let status: 'ok' | 'error' = 'ok';
    let errorText = '';

    try {
      for await (const event of streamChat({
        userId,
        threadId,
        message,
        context
      })) {
        if (event.type === 'meta') {
          mode = event.mode;
          provider = event.provider;
          resolvedThreadId = event.threadId || resolvedThreadId;
        } else if (event.type === 'chunk') {
          responseText += event.delta;
        } else if (event.type === 'error') {
          status = 'error';
          errorText = event.error;
        }

        res.write(`${JSON.stringify(event)}\n`);
      }
    } catch (error) {
      status = 'error';
      errorText = error instanceof Error ? error.message : String(error);
      res.write(`${JSON.stringify({ type: 'error', error: errorText })}\n`);
    } finally {
      logChatAudit({
        userId,
        mode,
        provider,
        threadId: resolvedThreadId,
        message,
        contextJson: JSON.stringify(context ?? {}),
        status,
        error: errorText || undefined,
        responsePreview: responseText.slice(0, 1200),
        durationMs: Date.now() - startedAt
      });
      await recordNovaAssistantRun({
        userId,
        threadId: resolvedThreadId,
        context: (context || {}) as Record<string, unknown>,
        message,
        responseText,
        provider,
        status: status === 'ok' ? 'SUCCEEDED' : 'FAILED',
        error: errorText || undefined
      });
      res.end();
    }
  }

  app.post('/api/chat', handleChat);
  app.post('/api/ai-chat', handleChat);

  app.get('/api/chat/threads', (req, res) => {
    const userId = String((req.query.userId as string | undefined) || '').trim() || 'guest-default';
    const limit = req.query.limit ? Number(req.query.limit) : 12;
    const data = listChatThreads(userId, limit);
    res.json({
      userId,
      count: data.length,
      data
    });
  });

  app.get('/api/chat/threads/:id', (req, res) => {
    const userId = String((req.query.userId as string | undefined) || '').trim() || 'guest-default';
    const threadId = String(req.params.id || '').trim();
    const limit = req.query.limit ? Number(req.query.limit) : 40;
    const payload = getChatThreadMessages(userId, threadId, limit);
    if (!payload.thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }
    res.json(payload);
  });

  return app;
}

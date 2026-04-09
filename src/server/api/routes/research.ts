import { Router } from 'express';
import { parseMarket, parseAssetClass, asyncRoute } from '../helpers.js';
import { runQlibResearchFactory } from '../queries.js';
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
  getPublicAlphaSupplyTool,
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
  summarizeResearchOnTopicTool,
} from '../../research/tools.js';

const router = Router();

function parseQlibFactorSet(value: unknown): 'Alpha158' | 'Alpha360' | undefined {
  if (value === 'Alpha158' || value === 'Alpha360') return value;
  return undefined;
}

function parsePositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.floor(num);
}

router.get('/api/research/factors', (_req, res) => {
  res.json(getFactorCatalogTool());
});

router.get('/api/research/public-alpha-supply', (req, res) => {
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  res.json(getPublicAlphaSupplyTool({ market, assetClass }));
});

router.post(
  '/api/research/qlib-factory/run',
  asyncRoute(async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const symbols = Array.isArray(body.symbols)
      ? body.symbols.map((symbol: unknown) => String(symbol || ''))
      : [];
    const startDate = String(body.startDate || body.start_date || '');
    const endDate = String(body.endDate || body.end_date || '');
    if (!symbols.length || !startDate || !endDate) {
      res.status(400).json({
        error: 'symbols, startDate and endDate are required',
      });
      return;
    }

    const market = parseMarket(String(body.market || ''));
    const assetClass = parseAssetClass(String(body.assetClass || body.asset_class || ''));
    const result = await runQlibResearchFactory({
      symbols,
      startDate,
      endDate,
      predictDate: body.predictDate
        ? String(body.predictDate)
        : body.predict_date
          ? String(body.predict_date)
          : undefined,
      factorSet: parseQlibFactorSet(body.factorSet || body.factor_set),
      modelName: body.modelName
        ? String(body.modelName)
        : body.model_name
          ? String(body.model_name)
          : null,
      market,
      assetClass,
      benchmark: body.benchmark ? String(body.benchmark) : null,
      topk: parsePositiveInt(body.topk),
      nDrop: parsePositiveInt(body.nDrop || body.n_drop),
      runNativeBacktest:
        body.runNativeBacktest === false ? false : body.run_native_backtest !== false,
      evaluateCandidates:
        body.evaluateCandidates === false ? false : body.evaluate_candidates !== false,
      triggerType: 'manual',
      userId: body.userId ? String(body.userId) : null,
    });
    res.json(result);
  }),
);

router.get('/api/research/doctrine', (_req, res) => {
  res.json(getResearchDoctrineTool());
});

router.get('/api/research/factors/:id', (req, res) => {
  res.json(getFactorDefinitionTool(String(req.params.id || '')));
});

router.get('/api/research/factors/:id/interactions', (req, res) => {
  res.json(getFactorInteractionsTool(String(req.params.id || '')));
});

router.get('/api/research/factors/:id/measured', (req, res) => {
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  res.json(
    getFactorMeasuredReportTool({
      factorId: String(req.params.id || ''),
      market,
      assetClass,
    }),
  );
});

router.get('/api/research/strategies', (_req, res) => {
  res.json(getStrategyRegistryTool());
});

router.get('/api/research/regimes', (_req, res) => {
  res.json(getRegimeTaxonomyTool());
});

router.get('/api/research/diagnostics/regime', (req, res) => {
  const userId = (req.query.userId as string | undefined) || 'guest-default';
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
  res.json(getRegimeDiagnosticsTool({ userId, market, assetClass, symbol }));
});

router.get('/api/research/diagnostics/factor', (req, res) => {
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
      factorId,
    }),
  );
});

router.get('/api/research/backtest-integrity', (req, res) => {
  const runId = (req.query.runId as string | undefined) || undefined;
  res.json(getBacktestIntegrityReportTool({ runId }));
});

router.get('/api/research/evaluation/strategy', (req, res) => {
  const runId = (req.query.runId as string | undefined) || undefined;
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  res.json(getStrategyEvaluationReportTool({ runId, market, assetClass }));
});

router.get('/api/research/validation-report', (req, res) => {
  const runId = (req.query.runId as string | undefined) || undefined;
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  res.json(getValidationReportTool({ runId, market, assetClass }));
});

router.get('/api/research/turnover-cost', (req, res) => {
  const runId = (req.query.runId as string | undefined) || undefined;
  res.json(getTurnoverCostReportTool({ runId }));
});

router.get('/api/research/failed-experiments', (_req, res) => {
  res.json(listFailedExperimentsTool());
});

router.get('/api/research/experiments', (_req, res) => {
  res.json(getExperimentRegistryTool());
});

router.get('/api/research/memory', (_req, res) => {
  res.json(getResearchMemoryTool());
});

router.get('/api/research/workflow', (req, res) => {
  const topic = String((req.query.topic as string | undefined) || '');
  const factorId = (req.query.factorId as string | undefined) || undefined;
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  res.json(getResearchWorkflowPlanTool({ topic, factorId, market, assetClass }));
});

router.get('/api/research/topic', (req, res) => {
  const topic = String((req.query.topic as string | undefined) || '');
  res.json(summarizeResearchOnTopicTool({ topic }));
});

router.get('/api/research/explain-signal', (req, res) => {
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
      symbol,
    }),
  );
});

router.get('/api/research/explain-no-signal', (req, res) => {
  const userId = (req.query.userId as string | undefined) || 'guest-default';
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  res.json(explainWhyNoSignalTool({ userId, market, assetClass }));
});

router.get('/api/research/factors/:id/by-regime', (req, res) => {
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
      factorId: String(req.params.id || ''),
    }),
  );
});

router.get('/api/research/factors/:id/snapshot', (req, res) => {
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  const runId = (req.query.runId as string | undefined) || undefined;
  res.json(
    getFactorResearchSnapshotTool({
      runId,
      factorId: String(req.params.id || ''),
      market,
      assetClass,
    }),
  );
});

export default router;

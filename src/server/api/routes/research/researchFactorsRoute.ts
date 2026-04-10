import { Router } from 'express';
import {
  parseMarket,
  parseAssetClass,
  asyncRoute,
  parseMarketAndAssetFromQuery,
  queryUserIdOrGuest,
} from '../../helpers.js';
import { runQlibResearchFactory } from '../../queries.js';
import {
  compareFactorPerformanceByRegimeTool,
  getFactorCatalogTool,
  getFactorDefinitionTool,
  getFactorInteractionsTool,
  getFactorMeasuredReportTool,
  getFactorResearchSnapshotTool,
  getPublicAlphaSupplyTool,
} from '../../../research/tools.js';
import { parsePositiveInt, parseQlibFactorSet } from './researchParsers.js';

const router = Router();

router.get('/api/research/factors', (_req, res) => {
  res.json(getFactorCatalogTool());
});

router.get('/api/research/public-alpha-supply', (req, res) => {
  const { market, assetClass } = parseMarketAndAssetFromQuery(req);
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

router.get('/api/research/factors/:id', (req, res) => {
  res.json(getFactorDefinitionTool(String(req.params.id || '')));
});

router.get('/api/research/factors/:id/interactions', (req, res) => {
  res.json(getFactorInteractionsTool(String(req.params.id || '')));
});

router.get('/api/research/factors/:id/measured', (req, res) => {
  const { market, assetClass } = parseMarketAndAssetFromQuery(req);
  res.json(
    getFactorMeasuredReportTool({
      factorId: String(req.params.id || ''),
      market,
      assetClass,
    }),
  );
});

router.get('/api/research/factors/:id/by-regime', (req, res) => {
  const userId = queryUserIdOrGuest(req);
  const { market, assetClass } = parseMarketAndAssetFromQuery(req);
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
  const { market, assetClass } = parseMarketAndAssetFromQuery(req);
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

import { Router } from 'express';
import { parseMarket, parseAssetClass } from '../helpers.js';
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

router.get('/api/research/factors', (_req, res) => {
  res.json(getFactorCatalogTool());
});

router.get('/api/research/public-alpha-supply', (req, res) => {
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  res.json(getPublicAlphaSupplyTool({ market, assetClass }));
});

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

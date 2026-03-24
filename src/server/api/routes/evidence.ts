import { Router } from 'express';
import { parseMarket, parseAssetClass } from '../helpers.js';
import {
  runEvidence,
  getEvidenceTopSignals,
  getEvidenceSignalDetail,
  listEvidenceBacktests,
  getEvidenceBacktestDetail,
  listEvidenceReconciliation,
  getEvidenceChampionStrategies,
} from '../queries.js';

const router = Router();

router.post('/api/evidence/run', (req, res) => {
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
    force: body.force,
  });
  res.json(out);
});

router.get('/api/evidence/signals/top', (req, res) => {
  const userId = (req.query.userId as string | undefined) || 'guest-default';
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  const limit = req.query.limit ? Number(req.query.limit) : 3;
  const out = getEvidenceTopSignals({
    userId,
    market,
    assetClass,
    limit,
  });
  res.json(out);
});

router.get('/api/evidence/signals/:id', (req, res) => {
  const signalId = String(req.params.id || '');
  const userId = (req.query.userId as string | undefined) || 'guest-default';
  const out = getEvidenceSignalDetail({
    signalId,
    userId,
  });
  if (!out.detail) {
    res.status(404).json({ error: 'Signal evidence not found' });
    return;
  }
  res.json(out);
});

router.get('/api/evidence/backtests', (req, res) => {
  const runType = (req.query.runType as string | undefined) || undefined;
  const status = (req.query.status as string | undefined) || undefined;
  const strategyVersionId = (req.query.strategyVersionId as string | undefined) || undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const out = listEvidenceBacktests({
    runType,
    status,
    strategyVersionId,
    limit,
  });
  res.json(out);
});

router.get('/api/evidence/backtests/:id', (req, res) => {
  const runId = String(req.params.id || '');
  const out = getEvidenceBacktestDetail(runId);
  if (!out.detail) {
    res.status(404).json({ error: 'Backtest run not found' });
    return;
  }
  res.json(out);
});

router.get('/api/evidence/reconciliation', (req, res) => {
  const replayRunId = (req.query.replayRunId as string | undefined) || undefined;
  const symbol = (req.query.symbol as string | undefined)?.toUpperCase() || undefined;
  const strategyVersionId = (req.query.strategyVersionId as string | undefined) || undefined;
  const status =
    (req.query.status as
      | 'RECONCILED'
      | 'PAPER_DATA_UNAVAILABLE'
      | 'REPLAY_DATA_UNAVAILABLE'
      | 'PARTIAL'
      | undefined) || undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 200;
  const out = listEvidenceReconciliation({
    replayRunId,
    symbol,
    strategyVersionId,
    status,
    limit,
  });
  res.json(out);
});

router.get('/api/evidence/strategies/champion', (_req, res) => {
  const out = getEvidenceChampionStrategies();
  res.json(out);
});

export default router;

import { Router } from 'express';
import { parseMarket, parseAssetClass, parseSignalStatus, asyncRoute } from '../helpers.js';
import {
  listSignalContractsPrimary,
  getSignalContractPrimary,
  listExecutionsPrimary,
  verifyPublicSignalsApiKeyPrimary,
} from '../queries.js';

const router = Router();

router.get(
  '/api/signals',
  asyncRoute(async (req, res) => {
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
    const data = await listSignalContractsPrimary({
      userId,
      assetClass,
      market,
      symbol,
      status,
      limit,
    });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data,
    });
  }),
);

router.get(
  '/api/public/signals',
  asyncRoute(async (req, res) => {
    const key = (req.header('x-api-key') || req.query.apikey || req.query.apiKey || '').toString();
    if (!(await verifyPublicSignalsApiKeyPrimary(key))) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const status = parseSignalStatus(req.query.status as string | undefined) || 'ALL';
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const data = await listSignalContractsPrimary({
      userId: 'public-api',
      assetClass,
      market,
      symbol,
      status,
      limit,
    });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data,
    });
  }),
);

router.get(
  '/api/signals/:id',
  asyncRoute(async (req, res) => {
    const signalId = String(req.params.id || '');
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const data = await getSignalContractPrimary(signalId, userId);
    if (!data) {
      res.status(404).json({ error: 'Signal not found' });
      return;
    }
    const executions = await listExecutionsPrimary({ userId, signalId, limit: 20 });
    res.json({ data, executions });
  }),
);

export default router;

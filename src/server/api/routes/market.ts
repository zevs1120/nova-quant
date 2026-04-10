import { Router } from 'express';
import {
  parseMarket,
  parseAssetClass,
  parseTimeframe,
  asyncRoute,
  queryUserIdOrGuest,
} from '../helpers.js';
import { isoToMs } from '../../utils/time.js';
import {
  getMarketModulesPrimary,
  getMarketStatePrimary,
  queryOhlcv,
  getPerformanceSummaryPrimary,
  getRiskProfilePrimary,
  setRiskProfile,
} from '../queries.js';

const router = Router();

router.get(
  '/api/market/modules',
  asyncRoute(async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const modules = await getMarketModulesPrimary({
      market,
      assetClass,
    });
    res.json({
      asof: new Date().toISOString(),
      count: modules.length,
      data: modules,
    });
  }),
);

router.get(
  '/api/market-state',
  asyncRoute(async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const timeframe = req.query.tf as string | undefined;
    const userId = queryUserIdOrGuest(req);
    const data = await getMarketStatePrimary({
      userId,
      market,
      symbol,
      timeframe,
    });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data,
    });
  }),
);

router.get('/api/ohlcv', (req, res) => {
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
    limit,
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
    data: rows,
  });
});

router.get(
  '/api/performance',
  asyncRoute(async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const range = (req.query.range as string | undefined) || undefined;
    const userId = queryUserIdOrGuest(req);
    const data = await getPerformanceSummaryPrimary({ userId, market, range });
    res.json(data);
  }),
);

router.get(
  '/api/risk-profile',
  asyncRoute(async (req, res) => {
    const userId = queryUserIdOrGuest(req);
    const data = await getRiskProfilePrimary(userId, { skipSync: true });
    res.json({ data });
  }),
);

router.post('/api/risk-profile', (req, res) => {
  const body = req.body as {
    userId?: string;
    profileKey?: 'conservative' | 'balanced' | 'aggressive';
  };
  const userId = String(body.userId || '').trim() || 'guest-default';
  const profileKey = body.profileKey;
  if (!profileKey || !['conservative', 'balanced', 'aggressive'].includes(profileKey)) {
    res.status(400).json({ error: 'profileKey must be conservative|balanced|aggressive' });
    return;
  }
  const data = setRiskProfile(userId, profileKey);
  res.json({ ok: true, data });
});

export default router;

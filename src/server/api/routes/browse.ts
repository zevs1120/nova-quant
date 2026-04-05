import { Router } from 'express';
import { parseMarket, asyncRoute } from '../helpers.js';
import {
  listAssetsPrimary,
  searchAssets,
  getSearchHealth,
  getBrowseHomePayload,
  getBrowseAssetChart,
  getBrowseNewsFeed,
  getBrowseAssetOverview,
  getBrowseAssetDetailBundle,
} from '../queries.js';
import { recordFrontendRouteLatency } from '../../observability/spine.js';

const router = Router();

async function measureFrontendRead<T>(scope: string, read: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await read();
  } finally {
    recordFrontendRouteLatency(scope, Date.now() - startedAt);
  }
}

router.get(
  '/api/assets',
  asyncRoute(async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    if (req.query.market && !market) {
      res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
      return;
    }

    const assets = await listAssetsPrimary(market);
    res.json({ market: market ?? 'ALL', count: assets.length, data: assets });
  }),
);

router.get(
  '/api/assets/search',
  asyncRoute(async (req, res) => {
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
      market,
    });
    res.json({
      query,
      market: market ?? 'ALL',
      count: results.length,
      data: results,
      health: getSearchHealth({
        market,
        query,
        resultCount: results.length,
      }),
    });
  }),
);

router.get(
  '/api/browse/detail-bundle',
  asyncRoute(async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const limit = req.query.limit ? Number(req.query.limit) : 6;

    if (!market || !symbol) {
      res.status(400).json({ error: 'Required query params: market, symbol' });
      return;
    }

    const data = await measureFrontendRead('browse_detail_bundle', () =>
      getBrowseAssetDetailBundle({
        market,
        symbol,
        limit,
      }),
    );

    if (!data.chart && !data.overview && !data.news.length) {
      res.status(404).json({ error: 'Browse detail bundle unavailable' });
      return;
    }

    res.json({
      market,
      symbol,
      chart: data.chart,
      overview: data.overview,
      news: data.news,
    });
  }),
);

router.get(
  '/api/browse/home',
  asyncRoute(async (req, res) => {
    const view = req.query.view as string | undefined;
    res.json(
      await measureFrontendRead('browse_home', () =>
        getBrowseHomePayload({
          view,
        }),
      ),
    );
  }),
);

router.get(
  '/api/browse/chart',
  asyncRoute(async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();

    if (!market || !symbol) {
      res.status(400).json({ error: 'Required query params: market, symbol' });
      return;
    }

    const data = await measureFrontendRead('browse_chart', () =>
      getBrowseAssetChart({
        market,
        symbol,
      }),
    );

    if (!data) {
      res.status(404).json({ error: 'Browse chart unavailable' });
      return;
    }

    res.json({
      market,
      symbol,
      count: data.points.length,
      data,
    });
  }),
);

router.get(
  '/api/browse/news',
  asyncRoute(async (req, res) => {
    const market = req.query.market ? parseMarket(req.query.market as string | undefined) : 'ALL';
    if (req.query.market && !market) {
      res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
      return;
    }
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    const data = await measureFrontendRead('browse_news', () =>
      getBrowseNewsFeed({
        market,
        symbol,
        limit,
      }),
    );
    res.json({
      market,
      symbol: symbol || null,
      count: data.length,
      data,
    });
  }),
);

router.get(
  '/api/browse/overview',
  asyncRoute(async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    if (!market || !symbol) {
      res.status(400).json({ error: 'Required query params: market, symbol' });
      return;
    }
    const data = await measureFrontendRead('browse_overview', () =>
      getBrowseAssetOverview({
        market,
        symbol,
      }),
    );
    if (!data) {
      res.status(404).json({ error: 'Browse overview unavailable' });
      return;
    }
    res.json({
      market,
      symbol,
      data,
    });
  }),
);

export default router;

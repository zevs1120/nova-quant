import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getPublicBrowseAssetChart,
  getPublicBrowseHome,
  getPublicBrowseAssetOverview,
  getPublicBrowseNewsFeed,
  listPublicAssets,
  queryPublicOhlcv,
  searchPublicAssets
} from '../src/server/public/browseService.js';

function applyPublicCors(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

function handlePublicOptions(req: VercelRequest, res: VercelResponse) {
  applyPublicCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

function parseMarket(value?: string) {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper as 'US' | 'CRYPTO';
  return undefined;
}

function parseTimeframe(value?: string) {
  const tf = String(value || '').trim();
  if (tf === '1m' || tf === '5m' || tf === '15m' || tf === '1h' || tf === '1d') return tf;
  return undefined;
}

function resolveApiPath(req: VercelRequest) {
  const dynamic = req.query.route;
  if (Array.isArray(dynamic) && dynamic.length) {
    return `/api/${dynamic.join('/')}`;
  }
  if (typeof dynamic === 'string' && dynamic) {
    return `/api/${dynamic}`;
  }
  const url = String(req.url || '');
  const [pathname = ''] = url.split('?');
  return pathname;
}

async function handlePublicBrowseRoute(req: VercelRequest, res: VercelResponse, path: string) {
  if (handlePublicOptions(req, res)) return true;
  applyPublicCors(req, res);

  if (path === '/api/assets' && req.method === 'GET') {
    const market = parseMarket(req.query.market as string | undefined);
    if (req.query.market && !market) {
      res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
      return true;
    }
    const data = listPublicAssets(market);
    res.status(200).json({ market: market ?? 'ALL', count: data.length, data });
    return true;
  }

  if (path === '/api/assets/search' && req.method === 'GET') {
    const market = parseMarket(req.query.market as string | undefined);
    if (req.query.market && !market) {
      res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
      return true;
    }
    const query = String(req.query.q || '');
    const limit = req.query.limit ? Number(req.query.limit) : 24;
    const results = await searchPublicAssets({ query, limit, market });
    res.status(200).json({ query, market: market ?? 'ALL', count: results.length, data: results });
    return true;
  }

  if (path === '/api/browse/chart' && req.method === 'GET') {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    if (!market || !symbol) {
      res.status(400).json({ error: 'Required query params: market, symbol' });
      return true;
    }
    const data = await getPublicBrowseAssetChart({ market, symbol });
    res.status(200).json(data);
    return true;
  }

  if (path === '/api/browse/home' && req.method === 'GET') {
    const view = String(req.query.view || 'NOW');
    const data = await getPublicBrowseHome({ view });
    res.status(200).json(data);
    return true;
  }

  if (path === '/api/browse/news' && req.method === 'GET') {
    const market = parseMarket(req.query.market as string | undefined);
    if (!market) {
      res.status(400).json({ error: 'Required query param: market' });
      return true;
    }
    const symbol = String(req.query.symbol || '').trim().toUpperCase() || undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    const data = await getPublicBrowseNewsFeed({ market, symbol, limit });
    res.status(200).json({ market, symbol: symbol ?? null, count: data.length, data });
    return true;
  }

  if (path === '/api/browse/overview' && req.method === 'GET') {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    if (!market || !symbol) {
      res.status(400).json({ error: 'Required query params: market, symbol' });
      return true;
    }
    const data = await getPublicBrowseAssetOverview({ market, symbol });
    if (!data) {
      res.status(404).json({ error: 'Asset not found' });
      return true;
    }
    res.status(200).json(data);
    return true;
  }

  if (path === '/api/ohlcv' && req.method === 'GET') {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    const timeframe = parseTimeframe((req.query.tf || req.query.timeframe) as string | undefined);
    if (!market || !symbol || !timeframe) {
      res.status(400).json({ error: 'Required query params: market, symbol, tf' });
      return true;
    }
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const result = await queryPublicOhlcv({ market, symbol, timeframe, limit });
    if (!result.asset) {
      res.status(404).json({ error: 'Asset not found' });
      return true;
    }
    res.status(200).json({
      market,
      symbol,
      timeframe,
      count: result.rows.length,
      asset: result.asset,
      data: result.rows
    });
    return true;
  }

  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = resolveApiPath(req);
  if (await handlePublicBrowseRoute(req, res, path)) {
    return;
  }
  const { createApiApp } = await import('../src/server/api/app.js');
  const app = createApiApp();
  return app(req as any, res as any);
}

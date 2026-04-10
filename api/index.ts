import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getPublicBrowseAssetChart,
  getPublicBrowseAssetOverview,
  getPublicBrowseNewsFeed,
  getPublicBrowseHome,
  listPublicAssets,
  queryPublicOhlcv,
  searchPublicAssets,
} from '../src/server/public/browseService.js';
import { getPublicTodayDecision } from '../src/server/public/todayDecisionService.js';
import { PUBLIC_CACHE_POLICIES } from '../src/server/public/cachePolicy.js';
import type { AssetClass, Market } from '../src/server/types.js';
import { VERCEL_PUBLIC_BROWSER_PATH_SET } from '../src/server/api/httpAllowlists.js';

let cachedApiAppPromise: Promise<any> | null = null;

function applyPublicCors(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}

function applyPublicCache(
  res: VercelResponse,
  options: { sMaxAge: number; staleWhileRevalidate: number },
) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=0, s-maxage=${Math.max(1, Math.floor(options.sMaxAge))}, stale-while-revalidate=${Math.max(1, Math.floor(options.staleWhileRevalidate))}`,
  );
}

async function getCachedApiApp() {
  if (!cachedApiAppPromise) {
    cachedApiAppPromise = import('../src/server/api/app.js')
      .then(({ createApiApp }) => createApiApp())
      .catch((error) => {
        cachedApiAppPromise = null;
        throw error;
      });
  }
  return cachedApiAppPromise;
}

function handlePublicOptions(req: VercelRequest, res: VercelResponse) {
  applyPublicCors(req, res);
  res.status(204).end();
  return true;
}

function parseMarket(value?: string) {
  const upper = String(value || '')
    .trim()
    .toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper as 'US' | 'CRYPTO';
  return undefined;
}

function parseAssetClass(value?: string) {
  const upper = String(value || '')
    .trim()
    .toUpperCase();
  if (upper === 'US_STOCK' || upper === 'CRYPTO' || upper === 'ALL') return upper as AssetClass;
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
  return pathname === '/api' ? '/api' : pathname;
}

function buildForwardUrl(req: VercelRequest, path: string) {
  const params = new URLSearchParams();
  Object.entries(req.query || {}).forEach(([key, value]) => {
    if (key === 'route' || value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item != null) params.append(key, String(item));
      });
      return;
    }
    params.append(key, String(value));
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function parseJsonBody(req: VercelRequest) {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function signalPayloadsFromDecision(decision: Record<string, unknown>) {
  const cards = Array.isArray(decision.ranked_action_cards) ? decision.ranked_action_cards : [];
  return cards
    .map((row) =>
      row && typeof row === 'object' ? (row as Record<string, unknown>).signal_payload : null,
    )
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
}

async function handlePublicBrowseRoute(req: VercelRequest, res: VercelResponse, path: string) {
  const publicOptionEligible = VERCEL_PUBLIC_BROWSER_PATH_SET.has(path);

  if (req.method === 'OPTIONS') {
    if (!publicOptionEligible) return false;
    return handlePublicOptions(req, res);
  }

  if (publicOptionEligible) {
    applyPublicCors(req, res);
  }

  if ((path === '/api' || path === '/api/healthz') && req.method === 'GET') {
    applyPublicCache(res, PUBLIC_CACHE_POLICIES.apiHealth);
    res.status(200).json({
      ok: true,
      service: 'novaquant-api',
      surface: 'backend',
      entrypoint: 'api-only',
      homepage: false,
      ts: Date.now(),
    });
    return true;
  }

  if (path === '/api/assets' && req.method === 'GET') {
    applyPublicCache(res, PUBLIC_CACHE_POLICIES.assets);
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
    applyPublicCache(res, PUBLIC_CACHE_POLICIES.browseSearch);
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
    applyPublicCache(res, PUBLIC_CACHE_POLICIES.browseDetail);
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = String(req.query.symbol || '')
      .trim()
      .toUpperCase();
    if (!market || !symbol) {
      res.status(400).json({ error: 'Required query params: market, symbol' });
      return true;
    }
    const data = await getPublicBrowseAssetChart({ market, symbol });
    res.status(200).json(data);
    return true;
  }

  if (path === '/api/browse/home' && req.method === 'GET') {
    applyPublicCache(res, PUBLIC_CACHE_POLICIES.browseHome);
    const view = String(req.query.view || 'NOW');
    const data = await getPublicBrowseHome({ view });
    res.status(200).json(data);
    return true;
  }

  if (path === '/api/browse/detail-bundle' && req.method === 'GET') {
    applyPublicCache(res, PUBLIC_CACHE_POLICIES.browseDetail);
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = String(req.query.symbol || '')
      .trim()
      .toUpperCase();
    if (!market || !symbol) {
      res.status(400).json({ error: 'Required query params: market, symbol' });
      return true;
    }
    const limit = req.query.limit ? Number(req.query.limit) : 6;
    const [chart, overview, news] = await Promise.all([
      getPublicBrowseAssetChart({ market, symbol }),
      getPublicBrowseAssetOverview({ market, symbol }),
      getPublicBrowseNewsFeed({ market, symbol, limit }),
    ]);
    if (!chart && !overview && !news.length) {
      res.status(404).json({ error: 'Browse detail bundle unavailable' });
      return true;
    }
    res.status(200).json({
      market,
      symbol,
      chart,
      overview,
      news,
    });
    return true;
  }

  if (path === '/api/browse/news' && req.method === 'GET') {
    applyPublicCache(res, PUBLIC_CACHE_POLICIES.browseNews);
    const market = parseMarket(req.query.market as string | undefined);
    if (!market) {
      res.status(400).json({ error: 'Required query param: market' });
      return true;
    }
    const symbol =
      String(req.query.symbol || '')
        .trim()
        .toUpperCase() || undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    const data = await getPublicBrowseNewsFeed({ market, symbol, limit });
    res.status(200).json({ market, symbol: symbol ?? null, count: data.length, data });
    return true;
  }

  if (path === '/api/browse/overview' && req.method === 'GET') {
    applyPublicCache(res, PUBLIC_CACHE_POLICIES.browseOverview);
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = String(req.query.symbol || '')
      .trim()
      .toUpperCase();
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
    applyPublicCache(res, PUBLIC_CACHE_POLICIES.publicOhlcv);
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = String(req.query.symbol || '')
      .trim()
      .toUpperCase();
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
      data: result.rows,
    });
    return true;
  }

  if (path === '/api/signals' && req.method === 'GET') {
    applyPublicCache(res, PUBLIC_CACHE_POLICIES.publicToday);
    const market = parseMarket(req.query.market as string | undefined) || 'US';
    const assetClass =
      parseAssetClass(req.query.assetClass as string | undefined) ||
      (market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
    const userId = String(req.query.userId || 'guest-default');
    const decision = await getPublicTodayDecision({ market, assetClass, userId });
    const data = signalPayloadsFromDecision(decision as Record<string, unknown>);
    res.status(200).json({
      asof: decision.as_of,
      count: data.length,
      data,
    });
    return true;
  }

  if (path === '/api/decision/today' && req.method === 'POST') {
    const body = parseJsonBody(req);
    const holdings = Array.isArray(body.holdings) ? body.holdings : [];
    const market = parseMarket(String(body.market || req.query.market || '')) || 'US';
    const assetClass =
      parseAssetClass(String(body.assetClass || req.query.assetClass || '')) ||
      (market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
    const userId = String(body.userId || req.query.userId || 'guest-default');
    const locale = typeof body.locale === 'string' ? body.locale : undefined;
    if (!holdings.length) {
      applyPublicCache(res, PUBLIC_CACHE_POLICIES.publicToday);
      const decision = await getPublicTodayDecision({ market, assetClass, userId, locale });
      res.status(200).json(decision);
      return true;
    }
    // Holdings provided — let the full Express app handle personalized decision
    return false;
  }

  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const path = resolveApiPath(req);
    if (await handlePublicBrowseRoute(req, res, path)) {
      return;
    }
    req.url = buildForwardUrl(req, path);
    const app = await getCachedApiApp();
    return app(req as any, res as any);
  } catch (error) {
    console.error('[api-entry] Global handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : String(error),
        path: req.url,
      });
    }
  }
}

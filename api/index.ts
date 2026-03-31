import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getPublicBrowseAssetChart,
  getPublicBrowseHome,
  getPublicBrowseAssetOverview,
  getPublicBrowseNewsFeed,
  listPublicAssets,
  queryPublicOhlcv,
  searchPublicAssets,
} from '../src/server/public/browseService.js';
import { getPublicTodayDecision } from '../src/server/public/todayDecisionService.js';
import type { AssetClass, Market } from '../src/server/types.js';

let cachedApiAppPromise: Promise<any> | null = null;

function applyPublicCors(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

function publicRuntimeTransparency(args: { asOf: string; signalCount: number }) {
  return {
    as_of: args.asOf,
    source_status: 'MODEL_DERIVED',
    data_status: 'MODEL_DERIVED',
    evidence_mode: 'LIVE_PUBLIC_SCAN',
    performance_mode: 'UNAVAILABLE',
    validation_mode: 'PUBLIC_MARKET_DATA',
    freshness_summary: {
      source_status: 'MODEL_DERIVED',
      rows: [],
      stale_count: 0,
    },
    coverage_summary: {
      assets_checked: args.signalCount,
      assets_with_bars: args.signalCount,
      generated_signals: args.signalCount,
      market_state_rows: args.signalCount,
      coverage_ratio: args.signalCount > 0 ? 1 : 0,
    },
    db_backed: false,
    paper_only: false,
    realized: false,
    backtest_only: false,
    model_derived: true,
    experimental: false,
    disconnected: false,
    performance_source: 'UNAVAILABLE',
  };
}

function postureMode(posture: string) {
  if (posture === 'ATTACK') return { mode: 'normal', gross: 55, net: 35, score: 72 };
  if (posture === 'PROBE') return { mode: 'trade light', gross: 35, net: 20, score: 56 };
  return { mode: 'do not trade', gross: 18, net: 8, score: 38 };
}

function buildPublicRuntimeState(args: {
  market: Market;
  assetClass: AssetClass;
  decision: Record<string, unknown>;
}) {
  const asOf = String(args.decision.as_of || new Date().toISOString());
  const posture = String(
    (args.decision.risk_state as Record<string, unknown> | undefined)?.posture || 'PROBE',
  ).toUpperCase();
  const topAction =
    ((args.decision.ranked_action_cards as Array<Record<string, unknown>> | undefined) || [])[0] ||
    null;
  const signals = signalPayloadsFromDecision(args.decision);
  const runtime = publicRuntimeTransparency({ asOf, signalCount: signals.length });
  const mode = postureMode(posture);
  const topSymbol = String(
    (topAction?.symbol as string | undefined) || (signals[0]?.symbol as string | undefined) || '',
  );
  const topSubtitle = String(
    (args.decision.today_call as Record<string, unknown> | undefined)?.subtitle ||
      'Public live market scan is active.',
  );

  return {
    asof: asOf,
    source_status: 'MODEL_DERIVED',
    data_status: 'MODEL_DERIVED',
    data_transparency: runtime,
    data: {
      signals,
      performance: {
        asof: asOf,
        source_status: 'UNAVAILABLE',
        records: [],
      },
      decision: args.decision,
      trades: [],
      velocity: {
        as_of: asOf,
        market: args.market,
        volatility_percentile: null,
        temperature_percentile: null,
        risk_off_score: null,
        source_status: 'MODEL_DERIVED',
        data_status: 'MODEL_DERIVED',
        source_label: 'MODEL_DERIVED',
      },
      config: {
        last_updated: asOf,
        source_status: 'MODEL_DERIVED',
        data_status: 'MODEL_DERIVED',
        source_label: 'MODEL_DERIVED',
        risk_rules: {
          per_trade_risk_pct: 1,
          daily_loss_pct: 3,
          max_dd_pct: 12,
          exposure_cap_pct: 55,
          vol_switch: true,
        },
        risk_status: {
          current_risk_bucket: mode.mode.toUpperCase(),
          bucket_state: mode.mode.toUpperCase(),
          diagnostics: {
            daily_pnl_pct: null,
            max_dd_pct: null,
          },
        },
        runtime,
      },
      market_modules: [],
      analytics: {
        source_status: 'MODEL_DERIVED',
        runtime,
        status_flags: {
          runtime_source: 'MODEL_DERIVED',
          performance_source: 'UNAVAILABLE',
          has_performance_sample: false,
        },
      },
      research: {
        source_status: 'MODEL_DERIVED',
        data_status: 'MODEL_DERIVED',
        source_label: 'MODEL_DERIVED',
        notes: ['Hosted public runtime is using live market scan fallback.'],
      },
      today: {
        is_trading_day: true,
        trading_day_message:
          args.market === 'CRYPTO'
            ? 'Crypto market runs 24/7.'
            : 'Hosted public market scan is live.',
        suggested_gross_exposure_pct: mode.gross,
        suggested_net_exposure_pct: mode.net,
        style_hint: posture === 'ATTACK' ? 'trend' : 'watchful',
        why_today: [
          topSubtitle,
          topSymbol
            ? `Top public setup: ${topSymbol}.`
            : 'No publishable public setup is active right now.',
        ],
      },
      safety: {
        mode: mode.mode,
        safety_score: mode.score,
        suggested_gross_exposure_pct: mode.gross,
        suggested_net_exposure_pct: mode.net,
        conclusion: String(
          (args.decision.risk_state as Record<string, unknown> | undefined)?.user_message ||
            topSubtitle,
        ),
        primary_risks: [topSubtitle],
        cards: {
          market: {
            title: 'Market',
            score: mode.score,
            lines: ['Derived from live public market scan.'],
          },
          portfolio: {
            title: 'Portfolio',
            score: 55,
            lines: ['Hosted fallback is universal, not portfolio-personalized.'],
          },
          instrument: {
            title: 'Instrument',
            score: topAction ? Number(topAction.ranking_score || 70) : 45,
            lines: [topSymbol ? `Top candidate: ${topSymbol}` : 'No active candidate.'],
          },
        },
        rules: [
          { id: 'size-cap', title: 'Size cap', rule: `Gross exposure cap ${mode.gross}%` },
          {
            id: 'hard-stop',
            title: 'Hard stop',
            rule: 'Every trade requires invalidation placement before entry.',
          },
        ],
      },
      insights: {
        regime: {
          tag: posture,
          description: topSubtitle,
        },
        short_commentary: topSubtitle,
        breadth: { ratio: null },
        volatility: { label: 'live_public_scan' },
        risk_on_off: {
          state: posture === 'ATTACK' ? 'risk_on' : posture === 'PROBE' ? 'neutral' : 'risk_off',
        },
        style: { preference: posture === 'ATTACK' ? 'trend' : 'watchful' },
        leadership: {
          leaders: signals.slice(0, 3).map((row) => ({
            sector: String(row.symbol || ''),
            score: Number(row.score || row.confidence || 0),
          })),
          laggards: [],
        },
        why_signals_today: [topSubtitle],
      },
      ai: {
        source_transparency: runtime,
      },
      layers: {
        data_layer: {
          instruments: signals.map((row) => ({
            ticker: row.symbol,
            market: row.market,
            latest_close: null,
            sector: row.market === 'CRYPTO' ? 'Crypto' : 'US',
          })),
        },
        portfolio_layer: {
          candidates: signals.slice(0, 12).map((row) => ({
            ticker: row.symbol,
            direction: row.direction,
            grade: row.grade || null,
            confidence: row.confidence,
            risk_score: null,
            entry_plan: {
              entry_zone: row.entry_zone || null,
            },
          })),
          filtered_out: [],
        },
      },
    },
  };
}

async function handlePublicBrowseRoute(req: VercelRequest, res: VercelResponse, path: string) {
  const publicOptionEligible =
    path === '/api' ||
    path === '/api/healthz' ||
    path === '/api/assets' ||
    path === '/api/assets/search' ||
    path === '/api/signals' ||
    path === '/api/runtime-state' ||
    path === '/api/decision/today' ||
    path === '/api/browse/chart' ||
    path === '/api/browse/home' ||
    path === '/api/browse/news' ||
    path === '/api/browse/overview' ||
    path === '/api/ohlcv';

  if (req.method === 'OPTIONS') {
    if (!publicOptionEligible) return false;
    return handlePublicOptions(req, res);
  }

  if (publicOptionEligible) {
    applyPublicCors(req, res);
  }

  if ((path === '/api' || path === '/api/healthz') && req.method === 'GET') {
    applyPublicCache(res, { sMaxAge: 5, staleWhileRevalidate: 30 });
    res.status(200).json({
      ok: true,
      service: 'novaquant-api',
      ts: Date.now(),
    });
    return true;
  }

  if (path === '/api/assets' && req.method === 'GET') {
    applyPublicCache(res, { sMaxAge: 3600, staleWhileRevalidate: 86400 });
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
    applyPublicCache(res, { sMaxAge: 300, staleWhileRevalidate: 1800 });
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
    applyPublicCache(res, { sMaxAge: 15, staleWhileRevalidate: 60 });
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
    applyPublicCache(res, { sMaxAge: 30, staleWhileRevalidate: 180 });
    const view = String(req.query.view || 'NOW');
    const data = await getPublicBrowseHome({ view });
    res.status(200).json(data);
    return true;
  }

  if (path === '/api/browse/news' && req.method === 'GET') {
    applyPublicCache(res, { sMaxAge: 120, staleWhileRevalidate: 600 });
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
    applyPublicCache(res, { sMaxAge: 300, staleWhileRevalidate: 900 });
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
    applyPublicCache(res, { sMaxAge: 300, staleWhileRevalidate: 900 });
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
    applyPublicCache(res, { sMaxAge: 15, staleWhileRevalidate: 45 });
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

  if (path === '/api/runtime-state' && req.method === 'GET') {
    applyPublicCache(res, { sMaxAge: 15, staleWhileRevalidate: 45 });
    const market = parseMarket(req.query.market as string | undefined) || 'US';
    const assetClass =
      parseAssetClass(req.query.assetClass as string | undefined) ||
      (market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
    const userId = String(req.query.userId || 'guest-default');
    const decision = await getPublicTodayDecision({ market, assetClass, userId });
    res.status(200).json(
      buildPublicRuntimeState({
        market,
        assetClass,
        decision: decision as Record<string, unknown>,
      }),
    );
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
      applyPublicCache(res, { sMaxAge: 15, staleWhileRevalidate: 45 });
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
  const path = resolveApiPath(req);
  if (await handlePublicBrowseRoute(req, res, path)) {
    return;
  }
  req.url = buildForwardUrl(req, path);
  const app = await getCachedApiApp();
  return app(req as any, res as any);
}

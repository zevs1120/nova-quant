import express from 'express';
import { getAuthSession } from '../auth/service.js';
import { ensureDefaultPublicSignalsApiKey, getPrivateMarvixOps } from './queries.js';
import { isLoopbackAddress } from '../ops/privateMarvixOps.js';
import {
  asyncRoute,
  resolveApiRequestPath,
  parseCookiesFromHeader,
  isGuestScopedUserId,
  readRequestedUserId,
  writeResolvedUserId,
  strictUserScopeEnabled,
  sendUserScopeAuthError,
  type RequestWithNovaScope,
} from './helpers.js';

import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import billingRouter from './routes/billing.js';
import browseRouter from './routes/browse.js';
import chatRouter from './routes/chat.js';
import connectRouter from './routes/connect.js';
import decisionRouter from './routes/decision.js';
import engagementRouter from './routes/engagement.js';
import evidenceRouter from './routes/evidence.js';
import executionRouter from './routes/execution.js';
import manualRouter from './routes/manual.js';
import marketRouter from './routes/market.js';
import novaRouter from './routes/nova.js';
import outcomeRouter from './routes/outcome.js';
import researchRouter from './routes/research.js';
import runtimeRouter from './routes/runtime.js';
import signalsRouter from './routes/signals.js';

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  // ---------------------------------------------------------------------------
  // CORS origins
  // ---------------------------------------------------------------------------
  const appAllowedOrigins = new Set(
    String(
      process.env.NOVA_APP_ALLOWED_ORIGINS ||
        'https://app.novaquant.cloud,https://novaquant.cloud,http://localhost:4173,http://127.0.0.1:4173,http://localhost:5173,http://127.0.0.1:5173',
    )
      .split(',')
      .map((row) => String(row || '').trim())
      .filter(Boolean),
  );
  const adminAllowedOrigins = new Set(
    String(
      process.env.NOVA_ADMIN_ALLOWED_ORIGINS ||
        'https://admin.novaquant.cloud,http://localhost:4174,http://127.0.0.1:4174,http://localhost:5174,http://127.0.0.1:5174',
    )
      .split(',')
      .map((row) => String(row || '').trim())
      .filter(Boolean),
  );
  const firstPartyOrigins = new Set([...appAllowedOrigins, ...adminAllowedOrigins]);
  const crossOriginReadPaths = new Set([
    '/api/auth/session',
    '/api/manual/state',
    '/api/assets',
    '/api/assets/search',
    '/api/browse/chart',
    '/api/browse/home',
    '/api/browse/news',
    '/api/browse/overview',
    '/api/ohlcv',
    '/api/runtime-state',
    '/api/signals',
    '/api/evidence/signals/top',
    '/api/market-state',
    '/api/performance',
    '/api/market/modules',
    '/api/risk-profile',
    '/api/control-plane/status',
    '/api/control-plane/flywheel',
    '/api/control-plane/research-ops',
    '/api/control-plane/alphas',
    '/api/outcomes/recent',
    '/api/connect/broker',
    '/api/connect/exchange',
  ]);

  // ---------------------------------------------------------------------------
  // CORS middleware
  // ---------------------------------------------------------------------------
  app.use((req, res, next) => {
    const origin = req.header('origin') || '';
    const apiPath = resolveApiRequestPath(req);
    const isFirstPartyApi = apiPath.startsWith('/api/') && origin && firstPartyOrigins.has(origin);
    if (isFirstPartyApi) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
      return;
    }
    const allowCrossOriginRead = crossOriginReadPaths.has(apiPath);
    if (!(allowCrossOriginRead && (req.method === 'GET' || req.method === 'OPTIONS'))) {
      next();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', req.header('origin') || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // Cache-Control for API GET responses
  // ---------------------------------------------------------------------------
  // User-scoped endpoints (session-bound userId): MUST be private, no-store to
  // prevent shared caches from leaking one user's data to another.
  // Only truly public (no-session) read paths could safely use public caching,
  // but the current architecture binds all /api/* through session middleware,
  // so we default to private.
  const userScopedPaths = new Set([
    '/api/assets',
    '/api/billing/state',
    '/api/market-state',
    '/api/market/modules',
    '/api/performance',
    '/api/risk-profile',
    '/api/runtime-state',
    '/api/signals',
    '/api/outcomes/recent',
  ]);
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }
    const apiPath = resolveApiRequestPath(req);
    if (userScopedPaths.has(apiPath)) {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    next();
  });

  ensureDefaultPublicSignalsApiKey();

  // ---------------------------------------------------------------------------
  // Session / user-scope middleware
  // ---------------------------------------------------------------------------
  app.use(
    asyncRoute(async (req, res, next) => {
      const apiPath = resolveApiRequestPath(req);
      if (!apiPath.startsWith('/api/')) {
        next();
        return;
      }

      try {
        const cookies = parseCookiesFromHeader(req.header('cookie') || '');
        const session = await getAuthSession(cookies.novaquant_session);
        const requestedUserId = readRequestedUserId(req);

        if (session) {
          if (
            requestedUserId &&
            requestedUserId !== session.user.userId &&
            !isGuestScopedUserId(requestedUserId)
          ) {
            res.status(403).json({ error: 'USER_SCOPE_MISMATCH' });
            return;
          }
          (req as RequestWithNovaScope).novaScope = {
            authenticated: true,
            userId: session.user.userId,
            authUserId: session.user.userId,
          };
          writeResolvedUserId(req, session.user.userId);
          next();
          return;
        }

        const resolvedGuestUserId = requestedUserId || 'guest-default';
        if (strictUserScopeEnabled() && !isGuestScopedUserId(resolvedGuestUserId)) {
          res.status(401).json({ error: 'AUTH_REQUIRED' });
          return;
        }
        (req as RequestWithNovaScope).novaScope = {
          authenticated: false,
          userId: resolvedGuestUserId,
          authUserId: null,
        };
        writeResolvedUserId(req, resolvedGuestUserId);
        next();
      } catch (error) {
        sendUserScopeAuthError(res, error);
      }
    }),
  );

  // ---------------------------------------------------------------------------
  // Routes that stay in app.ts (no /api prefix or special middleware)
  // ---------------------------------------------------------------------------
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  const requireLoopbackOnly = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const remote = req.socket.remoteAddress || req.ip || null;
    if (!isLoopbackAddress(remote)) {
      res.status(403).json({ error: 'Private Marvix ops endpoint is loopback-only.' });
      return;
    }
    next();
  };
  app.get('/api/internal/marvix/ops', requireLoopbackOnly, (_req, res) => {
    res.json(getPrivateMarvixOps());
  });

  // ---------------------------------------------------------------------------
  // Domain routers
  // ---------------------------------------------------------------------------
  app.use(adminRouter);
  app.use(authRouter);
  app.use(billingRouter);
  app.use(browseRouter);
  app.use(chatRouter);
  app.use(connectRouter);
  app.use(decisionRouter);
  app.use(engagementRouter);
  app.use(evidenceRouter);
  app.use(executionRouter);
  app.use(manualRouter);
  app.use(marketRouter);
  app.use(novaRouter);
  app.use(outcomeRouter);
  app.use(researchRouter);
  app.use(runtimeRouter);
  app.use(signalsRouter);

  // ---------------------------------------------------------------------------
  // Global error handler
  // ---------------------------------------------------------------------------
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const message = err?.message || 'Internal server error';
      const status = (err as Error & { status?: number }).status || 500;
      if (status >= 500) {
        console.error('[api] unhandled route error:', message);
      }
      if (!res.headersSent) {
        res.status(status).json({ error: message });
      }
    },
  );

  return app;
}

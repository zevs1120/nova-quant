import express from 'express';
import type { AssetClass, Market, Timeframe } from '../types.js';

export function parseMarket(value?: string): Market | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper;
  return undefined;
}

export function parseTimeframe(value?: string): Timeframe | undefined {
  if (!value) return undefined;
  const tf = value as Timeframe;
  if (['1m', '5m', '15m', '1h', '1d'].includes(tf)) return tf;
  return undefined;
}

export function parseAssetClass(value?: string): AssetClass | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === 'OPTIONS' || upper === 'US_STOCK' || upper === 'CRYPTO') return upper;
  return undefined;
}

export function parseSignalStatus(
  value?: string,
): 'ALL' | 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED' | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (
    upper === 'ALL' ||
    upper === 'NEW' ||
    upper === 'TRIGGERED' ||
    upper === 'EXPIRED' ||
    upper === 'INVALIDATED' ||
    upper === 'CLOSED'
  ) {
    return upper;
  }
  return undefined;
}

export type RequestWithNovaScope = express.Request & {
  novaScope?: {
    authenticated: boolean;
    userId: string;
    authUserId: string | null;
  };
};

export type AsyncRouteHandler = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<unknown> | unknown;

export function asyncRoute(handler: AsyncRouteHandler): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function resolveApiRequestPath(req: express.Request) {
  if (req.path && req.path !== '/api') {
    return req.path;
  }
  const route = req.query?.route;
  if (Array.isArray(route) && route.length) {
    return `/api/${route
      .map((value) => String(value || ''))
      .filter(Boolean)
      .join('/')}`;
  }
  if (typeof route === 'string' && route) {
    return `/api/${route}`;
  }
  return req.path || '/';
}

export function parseCookiesFromHeader(header: string) {
  return String(header || '')
    .split(';')
    .reduce<Record<string, string>>((acc, item) => {
      const [key, ...rest] = item.trim().split('=');
      if (!key) return acc;
      try {
        acc[key] = decodeURIComponent(rest.join('=') || '');
      } catch {
        acc[key] = rest.join('=') || '';
      }
      return acc;
    }, {});
}

export function normalizeUserId(value: unknown) {
  return String(value || '').trim();
}

export function isGuestScopedUserId(value: string | null | undefined) {
  const normalized = normalizeUserId(value).toLowerCase();
  return !normalized || normalized === 'guest-default' || normalized.startsWith('guest-');
}

export function readRequestedUserId(req: express.Request) {
  const queryValue = Array.isArray(req.query?.userId) ? req.query.userId[0] : req.query?.userId;
  const bodyValue =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>).userId
      : undefined;
  return normalizeUserId(bodyValue || queryValue);
}

export function writeResolvedUserId(req: express.Request, userId: string) {
  if (req.query && typeof req.query === 'object') {
    (req.query as Record<string, unknown>).userId = userId;
  }
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    (req.body as Record<string, unknown>).userId = userId;
  }
}

export function strictUserScopeEnabled() {
  return process.env.NOVA_DISABLE_SESSION_USER_SCOPE !== '1' && process.env.NODE_ENV !== 'test';
}

export function getRequestScope(req: express.Request) {
  const scope = (req as RequestWithNovaScope).novaScope;
  return (
    scope || {
      authenticated: false,
      userId: 'guest-default',
      authUserId: null,
    }
  );
}

export function sendUserScopeAuthError(res: express.Response, error: unknown) {
  const message = String((error as Error)?.message || error || '');
  if (
    message.includes('REMOTE_AUTH_STORE_NOT_CONFIGURED') ||
    message.includes('SUPABASE_AUTH_NOT_CONFIGURED')
  ) {
    res.status(503).json({ error: 'AUTH_STORE_NOT_CONFIGURED' });
    return;
  }
  if (
    message.includes('REMOTE_AUTH_STORE_TIMEOUT') ||
    message.includes('REMOTE_AUTH_STORE_UNREACHABLE')
  ) {
    res.status(503).json({ error: 'AUTH_STORE_UNREACHABLE' });
    return;
  }
  res.status(500).json({ error: 'AUTH_SCOPE_RESOLUTION_FAILED' });
}

export function requireAuthenticatedScope(req: express.Request, res: express.Response) {
  const scope = getRequestScope(req);
  if (!scope.authenticated || isGuestScopedUserId(scope.userId)) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return null;
  }
  return scope;
}

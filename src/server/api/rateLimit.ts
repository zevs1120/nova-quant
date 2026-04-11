import type express from 'express';
import { resolveApiRequestPath } from './helpers.js';

type ApiRateBucket =
  | 'public_read'
  | 'auth'
  | 'billing'
  | 'admin'
  | 'model_ingest'
  | 'api_write'
  | 'api_read';

type ApiRatePolicy = {
  bucket: ApiRateBucket;
  windowMs: number;
  max: number;
};

type ApiRateResult = {
  allowed: boolean;
  bucket: ApiRateBucket;
  limit: number;
  remaining: number;
  resetAt: number;
};

const bucketHits = new Map<string, number[]>();

function numEnv(name: string, fallback: number, min: number) {
  const next = Number(process.env[name]);
  return Number.isFinite(next) ? Math.max(min, Math.floor(next)) : fallback;
}

function policyFor(bucket: ApiRateBucket): ApiRatePolicy {
  if (bucket === 'auth') {
    return {
      bucket,
      windowMs: numEnv('API_AUTH_RATE_LIMIT_WINDOW_MS', 10 * 60_000, 1_000),
      max: numEnv('API_AUTH_RATE_LIMIT_MAX', 60, 1),
    };
  }
  if (bucket === 'billing') {
    return {
      bucket,
      windowMs: numEnv('API_BILLING_RATE_LIMIT_WINDOW_MS', 10 * 60_000, 1_000),
      max: numEnv('API_BILLING_RATE_LIMIT_MAX', 30, 1),
    };
  }
  if (bucket === 'model_ingest') {
    return {
      bucket,
      windowMs: numEnv('API_MODEL_INGEST_RATE_LIMIT_WINDOW_MS', 60_000, 1_000),
      max: numEnv('API_MODEL_INGEST_RATE_LIMIT_MAX', 120, 1),
    };
  }
  if (bucket === 'admin') {
    return {
      bucket,
      windowMs: numEnv('API_ADMIN_RATE_LIMIT_WINDOW_MS', 60_000, 1_000),
      max: numEnv('API_ADMIN_RATE_LIMIT_MAX', 180, 1),
    };
  }
  if (bucket === 'public_read') {
    return {
      bucket,
      windowMs: numEnv('API_PUBLIC_READ_RATE_LIMIT_WINDOW_MS', 60_000, 1_000),
      max: numEnv('API_PUBLIC_READ_RATE_LIMIT_MAX', 180, 1),
    };
  }
  if (bucket === 'api_write') {
    return {
      bucket,
      windowMs: numEnv('API_WRITE_RATE_LIMIT_WINDOW_MS', 60_000, 1_000),
      max: numEnv('API_WRITE_RATE_LIMIT_MAX', 240, 1),
    };
  }
  return {
    bucket,
    windowMs: numEnv('API_READ_RATE_LIMIT_WINDOW_MS', 60_000, 1_000),
    max: numEnv('API_READ_RATE_LIMIT_MAX', 360, 1),
  };
}

const publicReadPaths = new Set([
  '/api/auth/provider-config',
  '/api/auth/session',
  '/api/assets',
  '/api/assets/search',
  '/api/browse/chart',
  '/api/browse/detail-bundle',
  '/api/browse/home',
  '/api/browse/news',
  '/api/browse/overview',
  '/api/ohlcv',
]);

function bucketFor(req: express.Request): ApiRateBucket | null {
  if (req.method === 'OPTIONS') return null;
  const apiPath = resolveApiRequestPath(req);
  if (!apiPath.startsWith('/api/')) return null;
  if (apiPath === '/api/billing/webhook') return null;
  if (apiPath.startsWith('/api/internal/')) return null;
  if (apiPath.startsWith('/api/auth/')) return 'auth';
  if (apiPath.startsWith('/api/billing/')) return 'billing';
  if (apiPath.startsWith('/api/admin/')) return 'admin';
  if (apiPath.startsWith('/api/model/')) return 'model_ingest';
  if (req.method === 'GET' && publicReadPaths.has(apiPath)) return 'public_read';
  if (req.method !== 'GET' && req.method !== 'HEAD') return 'api_write';
  return 'api_read';
}

function requestIp(req: express.Request) {
  const forwarded = String(req.header('x-forwarded-for') || '')
    .split(',')[0]
    ?.trim();
  return forwarded || req.ip || req.socket.remoteAddress || 'unknown';
}

function requestKey(req: express.Request, bucket: ApiRateBucket) {
  const scopeUserId = String(
    (req as express.Request & { novaScope?: { userId?: string } }).novaScope?.userId || '',
  );
  const actor =
    scopeUserId && !scopeUserId.startsWith('guest-')
      ? `user:${scopeUserId}`
      : `ip:${requestIp(req)}`;
  return `${bucket}:${actor}`;
}

export function checkApiRateLimit(req: express.Request): ApiRateResult | null {
  const bucket = bucketFor(req);
  if (!bucket) return null;

  const policy = policyFor(bucket);
  const key = requestKey(req, bucket);
  const now = Date.now();
  const previous = bucketHits.get(key) || [];
  const valid = previous.filter((ts) => now - ts <= policy.windowMs);

  if (valid.length >= policy.max) {
    const resetAt = valid[0] + policy.windowMs;
    bucketHits.set(key, valid);
    return {
      allowed: false,
      bucket,
      limit: policy.max,
      remaining: 0,
      resetAt,
    };
  }

  valid.push(now);
  bucketHits.set(key, valid);
  return {
    allowed: true,
    bucket,
    limit: policy.max,
    remaining: Math.max(0, policy.max - valid.length),
    resetAt: valid[0] + policy.windowMs,
  };
}

export function apiRateLimitMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const result = checkApiRateLimit(req);
  if (!result || result.allowed) {
    if (result) {
      res.setHeader('X-RateLimit-Limit', String(result.limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      res.setHeader('X-RateLimit-Bucket', result.bucket);
    }
    next();
    return;
  }

  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfter));
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', '0');
  res.setHeader('X-RateLimit-Bucket', result.bucket);
  res.status(429).json({
    error: 'API_RATE_LIMITED',
    bucket: result.bucket,
    resetAt: result.resetAt,
  });
}

export function resetApiRateLimitForTests() {
  bucketHits.clear();
}

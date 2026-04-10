/**
 * Single source of truth for path sets used by Express CORS/cache headers
 * and by the Vercel `api/index.ts` public inline handler (OPTIONS + CORS preflight).
 *
 * `/api/runtime-state` stays in cross-origin reads for Express CORS, but is omitted
 * from Vercel inline paths so GET/OPTIONS go through Express (session + membership).
 */
const RUNTIME_STATE_PATH = '/api/runtime-state';

export const CROSS_ORIGIN_READ_PATHS = [
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
  RUNTIME_STATE_PATH,
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
] as const;

/** GET responses that must not be stored in shared caches (session-scoped reads). */
export const USER_SCOPED_CACHE_PATHS = [
  '/api/billing/state',
  '/api/manual/state',
  '/api/market-state',
  '/api/market/modules',
  '/api/membership/state',
  '/api/performance',
  '/api/risk-profile',
  RUNTIME_STATE_PATH,
  '/api/signals',
  '/api/outcomes/recent',
] as const;

/**
 * Paths handled by Vercel `handlePublicBrowseRoute` for OPTIONS + applyPublicCors
 * before inline GET handlers. Must stay in sync with cross-origin policy intent.
 */
export const VERCEL_PUBLIC_BROWSER_PATH_SET: ReadonlySet<string> = new Set<string>([
  '/api',
  '/api/healthz',
  '/api/decision/today',
  ...CROSS_ORIGIN_READ_PATHS.filter((p) => p !== RUNTIME_STATE_PATH),
]);

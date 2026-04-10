import { isGuestScopedUserId } from '../helpers.js';

const CONTROL_PLANE_STATUS_CACHE_TTL_MS = 60_000;

const controlPlaneStatusCache = new Map<string, { expiresAt: number; value: unknown }>();
const controlPlaneStatusInflight = new Map<string, Promise<unknown>>();

export function resolveControlPlaneScope(userId?: string) {
  const requestedUserId = userId || 'guest-default';
  if (isGuestScopedUserId(requestedUserId)) {
    return {
      cacheKey: 'guest-public',
      effectiveUserId: 'guest-default',
    };
  }
  return {
    cacheKey: requestedUserId,
    effectiveUserId: requestedUserId,
  };
}

export async function runCachedControlPlaneRead<T>(
  cacheKey: string,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = controlPlaneStatusCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }
  const inflight = controlPlaneStatusInflight.get(cacheKey);
  if (inflight) {
    return (await inflight) as T;
  }
  const next = loader()
    .then((value) => {
      controlPlaneStatusCache.set(cacheKey, {
        expiresAt: Date.now() + CONTROL_PLANE_STATUS_CACHE_TTL_MS,
        value,
      });
      return value;
    })
    .finally(() => {
      controlPlaneStatusInflight.delete(cacheKey);
    });
  controlPlaneStatusInflight.set(cacheKey, next as Promise<unknown>);
  return await next;
}

export function __resetControlPlaneStatusCacheForTesting() {
  controlPlaneStatusCache.clear();
  controlPlaneStatusInflight.clear();
}

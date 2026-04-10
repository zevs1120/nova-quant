import { flushRuntimeRepoMirror } from '../../db/runtimeRepository.js';
import { hasPostgresBusinessMirror } from '../../admin/postgresBusinessRead.js';
import { recordFrontendCacheOutcome } from '../../observability/spine.js';

export const FRONTEND_READ_CACHE_TTL_MS = Math.max(
  5_000,
  Number(process.env.NOVA_FRONTEND_READ_CACHE_TTL_MS || 20_000),
);

const PG_PRIMARY_READ_FAILURE_COOLDOWN_MS = Math.max(
  5_000,
  Number(process.env.NOVA_PG_PRIMARY_READ_FAILURE_COOLDOWN_MS || 60_000),
);

const frontendReadCache = new Map<string, { expiresAt: number; value: unknown }>();
const frontendReadInflight = new Map<string, Promise<unknown>>();

let pgPrimaryReadCooldownUntilMs = 0;

export function shouldPreferPostgresPrimaryReads() {
  if (
    process.env.NODE_ENV === 'test' &&
    String(process.env.NOVA_ENABLE_PG_PRIMARY_READS_TEST || '') !== '1'
  ) {
    return false;
  }
  if (String(process.env.NOVA_DISABLE_PG_PRIMARY_READS || '') === '1') {
    return false;
  }
  return hasPostgresBusinessMirror();
}

export function shouldAvoidSyncHotPathFallback() {
  const allowSyncFallback = String(process.env.NOVA_ALLOW_SYNC_HOT_PATH_FALLBACK || '').trim();
  if (process.env.NODE_ENV === 'test' && !allowSyncFallback) {
    return false;
  }
  return shouldPreferPostgresPrimaryReads() && allowSyncFallback !== '1';
}

export function __resetPgPrimaryReadFailureCooldownForTesting() {
  pgPrimaryReadCooldownUntilMs = 0;
}

export function __resetFrontendReadCacheForTesting() {
  frontendReadCache.clear();
  frontendReadInflight.clear();
}

/**
 * Evict all cached frontend-read entries that are scoped to a specific user.
 * Must be called after any write operation that alters per-user data so that
 * the next read reflects the update without waiting for the TTL to expire.
 */
export function invalidateFrontendReadCacheForUser(userId: string) {
  if (!userId) return;
  const userMarker = JSON.stringify(userId);
  for (const key of frontendReadCache.keys()) {
    if (key.includes(userMarker)) {
      frontendReadCache.delete(key);
      frontendReadInflight.delete(key);
    }
  }
}

function stableCacheValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableCacheValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableCacheValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function buildFrontendReadCacheKey(scope: string, args: unknown) {
  return `${scope}:${JSON.stringify(stableCacheValue(args))}`;
}

export async function cachedFrontendRead<T>(
  scope: string,
  args: unknown,
  read: () => Promise<T>,
  ttlMs = FRONTEND_READ_CACHE_TTL_MS,
): Promise<T> {
  const key = buildFrontendReadCacheKey(scope, args);
  const now = Date.now();
  const cached = frontendReadCache.get(key);
  if (cached && cached.expiresAt > now) {
    recordFrontendCacheOutcome(scope, 'hit');
    return cached.value as T;
  }

  const inflight = frontendReadInflight.get(key);
  if (inflight) {
    recordFrontendCacheOutcome(scope, 'inflight');
    return (await inflight) as T;
  }

  recordFrontendCacheOutcome(scope, 'miss');
  const next = read()
    .then((value) => {
      frontendReadCache.set(key, {
        value,
        expiresAt: Date.now() + Math.max(1_000, ttlMs),
      });
      return value;
    })
    .finally(() => {
      frontendReadInflight.delete(key);
    });
  frontendReadInflight.set(key, next as Promise<unknown>);
  return await next;
}

export async function tryPrimaryPostgresRead<T>(
  label: string,
  read: () => Promise<T>,
): Promise<T | null> {
  if (!shouldPreferPostgresPrimaryReads()) return null;
  if (Date.now() < pgPrimaryReadCooldownUntilMs) {
    return null;
  }
  try {
    await flushRuntimeRepoMirror();
    return await read();
  } catch (error) {
    pgPrimaryReadCooldownUntilMs = Date.now() + PG_PRIMARY_READ_FAILURE_COOLDOWN_MS;
    console.warn('[pg-primary-read] primary read unavailable, keeping sync bridge path', {
      label,
      error: String((error as Error)?.message || error || 'unknown_error'),
      cooldown_ms: PG_PRIMARY_READ_FAILURE_COOLDOWN_MS,
    });
    return null;
  }
}

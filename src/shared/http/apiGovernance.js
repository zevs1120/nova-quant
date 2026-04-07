/**
 * Client-side API request governance: spacing, in-flight dedupe, failure backoff,
 * half-open circuit breaker, and Vercel deployment-disabled handling.
 * Keeps Edge/function invocations bounded.
 */

const globalPauseUntil = { ms: 0 };

/** @type {Map<string, number>} */
const bucketFailStreak = new Map();
/** @type {Map<string, number>} */
const bucketBackoffUntil = new Map();
/** @type {Map<string, boolean>} half-open circuit breaker probe flag */
const bucketHalfOpen = new Map();
/** @type {Map<string, number>} */
const lastRequestStart = new Map();
/** @type {Map<string, Promise<void>>} serialised spacing chains */
const spacingQueue = new Map();
/** @type {Map<string, Promise<Response>>} */
const inFlight = new Map();

const SHARED_STATE_PREFIX = 'nova-quant:api-governance';
const SHARED_GLOBAL_PAUSE_KEY = `${SHARED_STATE_PREFIX}:global-pause`;
const SHARED_BUCKET_STATE_PREFIX = `${SHARED_STATE_PREFIX}:bucket:`;
const SHARED_LOCK_PREFIX = `${SHARED_STATE_PREFIX}:lock:`;
const SHARED_LOCK_OWNER = `governance-${Math.random().toString(36).slice(2, 10)}`;
const SHARED_LOCK_POLL_MS = 25;
const SHARED_LOCK_WAIT_MS = 5_000;

const MIN_GAP_MS = {
  'post:engagement-state': 4_000,
  'get:auth-session': 2_000,
  billing: 3_000,
  membership: 3_000,
};

const GLOBAL_PAUSE_ON_VERCEL_MS = 120_000;
const FAILURE_STREAK_BEFORE_BACKOFF = 3;
const BACKOFF_CAP_MS = 120_000;

function isTestEnv() {
  return process.env.NODE_ENV === 'test';
}

function minGapForBucket(bucket) {
  if (isTestEnv()) return 0;
  return MIN_GAP_MS[bucket] ?? 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storageApi() {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage || null : null;
  } catch {
    return null;
  }
}

function bucketStorageKey(bucket) {
  return `${SHARED_BUCKET_STATE_PREFIX}${bucket}`;
}

function lockStorageKey(name) {
  return `${SHARED_LOCK_PREFIX}${name}`;
}

function readStoredJson(key) {
  const storage = storageApi();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredJson(key, value) {
  const storage = storageApi();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or restricted-mode failures.
  }
}

function removeStoredKey(key) {
  const storage = storageApi();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore restricted storage failures.
  }
}

function readSharedBucketState(bucket) {
  const stored = readStoredJson(bucketStorageKey(bucket));
  if (!stored || typeof stored !== 'object') return null;
  return {
    failStreak: Math.max(0, Number(stored.failStreak || 0)),
    backoffUntil: Math.max(0, Number(stored.backoffUntil || 0)),
    lastRequestStart: Math.max(0, Number(stored.lastRequestStart || 0)),
  };
}

function syncBucketStateFromShared(bucket) {
  const shared = readSharedBucketState(bucket);
  if (!shared) return;
  if (shared.failStreak > (bucketFailStreak.get(bucket) || 0)) {
    bucketFailStreak.set(bucket, shared.failStreak);
  }
  if (shared.backoffUntil > (bucketBackoffUntil.get(bucket) || 0)) {
    bucketBackoffUntil.set(bucket, shared.backoffUntil);
  }
  if (shared.lastRequestStart > (lastRequestStart.get(bucket) || 0)) {
    lastRequestStart.set(bucket, shared.lastRequestStart);
  }
}

function writeSharedBucketState(bucket, partial) {
  const shared = readSharedBucketState(bucket) || {};
  writeStoredJson(bucketStorageKey(bucket), {
    failStreak:
      partial.failStreak === undefined
        ? shared.failStreak || 0
        : Math.max(shared.failStreak || 0, Number(partial.failStreak || 0)),
    backoffUntil:
      partial.backoffUntil === undefined
        ? shared.backoffUntil || 0
        : Math.max(shared.backoffUntil || 0, Number(partial.backoffUntil || 0)),
    lastRequestStart:
      partial.lastRequestStart === undefined
        ? shared.lastRequestStart || 0
        : Math.max(shared.lastRequestStart || 0, Number(partial.lastRequestStart || 0)),
  });
}

function clearSharedBucketState(bucket) {
  removeStoredKey(bucketStorageKey(bucket));
}

function readSharedGlobalPauseUntil() {
  const stored = readStoredJson(SHARED_GLOBAL_PAUSE_KEY);
  return Math.max(0, Number(stored?.ms || 0));
}

function syncGlobalPauseFromShared() {
  const shared = readSharedGlobalPauseUntil();
  if (shared > globalPauseUntil.ms) {
    globalPauseUntil.ms = shared;
  }
}

function writeSharedGlobalPauseUntil(ms) {
  const next = Math.max(ms, readSharedGlobalPauseUntil());
  globalPauseUntil.ms = next;
  writeStoredJson(SHARED_GLOBAL_PAUSE_KEY, { ms: next });
}

function readStoredLock(name) {
  const stored = readStoredJson(lockStorageKey(name));
  if (!stored || typeof stored !== 'object') return null;
  return {
    ownerId: String(stored.ownerId || ''),
    expiresAt: Math.max(0, Number(stored.expiresAt || 0)),
  };
}

function tryAcquireAdvisoryLock(name, ttlMs) {
  const storage = storageApi();
  if (!storage) return true;
  const now = Date.now();
  const existing = readStoredLock(name);
  if (existing && existing.expiresAt > now && existing.ownerId !== SHARED_LOCK_OWNER) {
    return false;
  }
  writeStoredJson(lockStorageKey(name), {
    ownerId: SHARED_LOCK_OWNER,
    expiresAt: now + Math.max(1, ttlMs),
  });
  const confirmed = readStoredLock(name);
  return confirmed?.ownerId === SHARED_LOCK_OWNER;
}

async function acquireAdvisoryLock(name, ttlMs) {
  const storage = storageApi();
  if (!storage) return true;
  const deadline = Date.now() + SHARED_LOCK_WAIT_MS;
  while (Date.now() <= deadline) {
    if (tryAcquireAdvisoryLock(name, ttlMs)) return true;
    await sleep(SHARED_LOCK_POLL_MS);
  }
  return false;
}

function releaseAdvisoryLock(name) {
  const current = readStoredLock(name);
  if (current?.ownerId === SHARED_LOCK_OWNER) {
    removeStoredKey(lockStorageKey(name));
  }
}

async function withAdvisoryLock(name, ttlMs, fn) {
  const acquired = await acquireAdvisoryLock(name, ttlMs);
  if (!acquired) return fn();
  try {
    return await fn();
  } finally {
    releaseAdvisoryLock(name);
  }
}

function clearSharedGovernanceStorage() {
  const storage = storageApi();
  if (!storage) return;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(SHARED_STATE_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch {
    // Ignore restricted storage failures.
  }
}

export function resetApiGovernanceForTests() {
  globalPauseUntil.ms = 0;
  bucketFailStreak.clear();
  bucketBackoffUntil.clear();
  bucketHalfOpen.clear();
  lastRequestStart.clear();
  spacingQueue.clear();
  inFlight.clear();
  clearSharedGovernanceStorage();
}

/**
 * @param {string} path
 * @param {string} method
 */
export function governanceBucket(path, method) {
  const m = String(method || 'GET').toUpperCase();
  const p = String(path || '');
  if (p === '/api/engagement/state' && m === 'POST') return 'post:engagement-state';
  if (p.startsWith('/api/auth/session') && m === 'GET') return 'get:auth-session';
  if (p.startsWith('/api/billing/')) return 'billing';
  if (p.startsWith('/api/membership/')) return 'membership';
  return `any:${m}:${p.split('?')[0]}`;
}

/**
 * Request coalescing is intentionally narrower than other governance steps.
 * Only safe reads and explicitly idempotent POST reads should share in-flight
 * responses; mutations must preserve one-request-per-user-action semantics.
 * @param {string} path
 * @param {string} method
 */
export function shouldCoalesceRequest(path, method) {
  const m = String(method || 'GET').toUpperCase();
  const normalizedPath = String(path || '').split('?')[0];
  if (m === 'GET' || m === 'HEAD') return true;
  return m === 'POST' && normalizedPath === '/api/engagement/state';
}

export function syntheticIfGlobalPaused() {
  syncGlobalPauseFromShared();
  if (Date.now() < globalPauseUntil.ms) {
    return new Response(
      JSON.stringify({
        error: 'API_PAUSED_CLIENT',
        reason: 'global_cooldown',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }
  return null;
}

/**
 * Circuit breaker with half-open probe.
 * - Closed (healthy): returns null → request proceeds.
 * - Open (backoff active): returns synthetic 503.
 * - Half-open (backoff expired, fail streak still high): allows exactly ONE
 *   probe request; concurrent callers are blocked until the probe finalises.
 * @param {string} bucket
 */
export function syntheticIfBucketBackoff(bucket) {
  syncBucketStateFromShared(bucket);
  const until = bucketBackoffUntil.get(bucket) || 0;
  if (Date.now() < until) {
    return new Response(
      JSON.stringify({
        error: 'API_BUCKET_BACKOFF',
        reason: 'recent_failures',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }

  // Backoff window expired but fail streak still high → half-open
  if ((bucketFailStreak.get(bucket) || 0) >= FAILURE_STREAK_BEFORE_BACKOFF) {
    if (
      bucketHalfOpen.get(bucket) ||
      !tryAcquireAdvisoryLock(`probe:${bucket}`, BACKOFF_CAP_MS + 1_000)
    ) {
      // Probe already in-flight — block concurrent callers
      return new Response(
        JSON.stringify({
          error: 'API_BUCKET_BACKOFF',
          reason: 'half_open_probe_pending',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        },
      );
    }
    // Allow this one request as a probe
    bucketHalfOpen.set(bucket, true);
  }

  return null;
}

/**
 * Serialised per-bucket spacing — chains behind previous waiters to prevent
 * concurrent callers from reading the same `lastRequestStart` timestamp.
 * @param {string} bucket
 */
export function waitRequestSpacing(bucket) {
  const min = minGapForBucket(bucket);
  if (min <= 0) return Promise.resolve();

  const prev = spacingQueue.get(bucket) || Promise.resolve();
  const next = prev.then(() =>
    withAdvisoryLock(`spacing:${bucket}`, min + SHARED_LOCK_WAIT_MS, async () => {
      syncBucketStateFromShared(bucket);
      const last = lastRequestStart.get(bucket) || 0;
      const wait = last + min - Date.now();
      if (wait > 0) await sleep(wait);
      const startedAt = Date.now();
      lastRequestStart.set(bucket, startedAt);
      writeSharedBucketState(bucket, { lastRequestStart: startedAt });
    }),
  );
  // Swallow errors so a single failure doesn't block the entire chain.
  spacingQueue.set(
    bucket,
    next.catch(() => {}),
  );
  return next;
}

/**
 * Build a deduplication key from method, path, and body.
 * Handles JSON strings/objects, URLSearchParams, FormData, Blob, and
 * ArrayBuffer/TypedArray bodies; normalises query-param order.
 * @param {string} method
 * @param {string} path
 * @param {BodyInit | null | undefined} body
 */
export function makeDedupeKey(method, path, body) {
  const m = String(method || 'GET').toUpperCase();
  const sortedPath = sortQueryParams(path);
  let b = '';
  if (body instanceof URLSearchParams) {
    b = body.toString();
  } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
    // Serialise entries deterministically — Blob values keyed by size/type.
    const entries = [];
    body.forEach((v, k) => {
      entries.push(`${k}=${v instanceof Blob ? `blob:${v.size}:${v.type}` : String(v)}`);
    });
    b = entries.sort().join('&');
  } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
    b = `blob:${body.size}:${body.type}`;
  } else if (
    typeof ArrayBuffer !== 'undefined' &&
    (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
  ) {
    b = `buffer:${body.byteLength}`;
  } else if (typeof body === 'object' && body !== null) {
    try {
      b = JSON.stringify(body);
    } catch {
      b = String(body);
    }
  } else if (body != null) {
    b = String(body);
  }
  return `${m} ${sortedPath} ${b}`;
}

/**
 * @param {string} path
 */
function sortQueryParams(path) {
  const qIdx = path.indexOf('?');
  if (qIdx < 0) return path;
  const base = path.slice(0, qIdx);
  const params = new URLSearchParams(path.slice(qIdx + 1));
  params.sort();
  return `${base}?${params.toString()}`;
}

/**
 * @param {string} dedupeKey
 * @param {() => Promise<Response>} fn
 */
export function runCoalescedFetch(dedupeKey, fn) {
  const existing = inFlight.get(dedupeKey);
  if (existing) {
    // Return a clone to avoid "body stream is locked" when multiple callers read .json()
    return existing.then((r) => r.clone());
  }

  const p = fn()
    .then((r) => {
      // The first caller gets the original (or a clone), others get clones.
      // We keep the promise in flight until it settles.
      return r;
    })
    .finally(() => {
      if (inFlight.get(dedupeKey) === p) inFlight.delete(dedupeKey);
    });

  inFlight.set(dedupeKey, p);
  // Return a clone so the first caller doesn't lock the one stored in 'p'
  return p.then((r) => r.clone());
}

function jitter(baseMs) {
  return baseMs * (0.5 + Math.random() * 0.5);
}

function bumpFailure(bucket) {
  syncBucketStateFromShared(bucket);
  const n = (bucketFailStreak.get(bucket) || 0) + 1;
  bucketFailStreak.set(bucket, n);
  const nextState = { failStreak: n };
  if (n >= FAILURE_STREAK_BEFORE_BACKOFF) {
    const exp = Math.min(BACKOFF_CAP_MS, 1000 * 2 ** Math.min(n, 8));
    const until = Date.now() + jitter(exp);
    bucketBackoffUntil.set(bucket, until);
    nextState.backoffUntil = until;
  }
  writeSharedBucketState(bucket, nextState);
}

function clearBucketHealth(bucket) {
  bucketFailStreak.delete(bucket);
  bucketBackoffUntil.delete(bucket);
  bucketHalfOpen.delete(bucket);
  clearSharedBucketState(bucket);
  releaseAdvisoryLock(`probe:${bucket}`);
}

/**
 * @param {string} bucket
 * @param {Response | null} response
 * @param {unknown} fetchError
 */
export function finalizeGovernedRequest(bucket, response, fetchError) {
  // Always clear the half-open probe flag so the next caller can proceed.
  bucketHalfOpen.delete(bucket);
  releaseAdvisoryLock(`probe:${bucket}`);

  if (fetchError) {
    bumpFailure(bucket);
    return;
  }
  if (!response) {
    bumpFailure(bucket);
    return;
  }

  const vercelErr = response.headers?.get?.('x-vercel-error') || '';
  if (response.status === 402 && vercelErr === 'DEPLOYMENT_DISABLED') {
    writeSharedGlobalPauseUntil(Date.now() + GLOBAL_PAUSE_ON_VERCEL_MS);
    bumpFailure(bucket);
    return;
  }

  if (response.status === 429 || response.status >= 500) {
    bumpFailure(bucket);
    return;
  }

  if (response.ok || (response.status >= 400 && response.status < 500)) {
    clearBucketHealth(bucket);
  }
}

/* c8 ignore start */
if (import.meta.hot) {
  import.meta.hot.dispose(() => resetApiGovernanceForTests());
}
/* c8 ignore stop */

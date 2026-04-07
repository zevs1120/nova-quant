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

export function resetApiGovernanceForTests() {
  globalPauseUntil.ms = 0;
  bucketFailStreak.clear();
  bucketBackoffUntil.clear();
  bucketHalfOpen.clear();
  lastRequestStart.clear();
  spacingQueue.clear();
  inFlight.clear();
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

export function syntheticIfGlobalPaused() {
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
    if (bucketHalfOpen.get(bucket)) {
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
  const next = prev.then(async () => {
    const last = lastRequestStart.get(bucket) || 0;
    const wait = last + min - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestStart.set(bucket, Date.now());
  });
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
  const n = (bucketFailStreak.get(bucket) || 0) + 1;
  bucketFailStreak.set(bucket, n);
  if (n >= FAILURE_STREAK_BEFORE_BACKOFF) {
    const exp = Math.min(BACKOFF_CAP_MS, 1000 * 2 ** Math.min(n, 8));
    bucketBackoffUntil.set(bucket, Date.now() + jitter(exp));
  }
}

function clearBucketHealth(bucket) {
  bucketFailStreak.delete(bucket);
  bucketBackoffUntil.delete(bucket);
  bucketHalfOpen.delete(bucket);
}

/**
 * @param {string} bucket
 * @param {Response | null} response
 * @param {unknown} fetchError
 */
export function finalizeGovernedRequest(bucket, response, fetchError) {
  // Always clear the half-open probe flag so the next caller can proceed.
  bucketHalfOpen.delete(bucket);

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
    globalPauseUntil.ms = Date.now() + GLOBAL_PAUSE_ON_VERCEL_MS;
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

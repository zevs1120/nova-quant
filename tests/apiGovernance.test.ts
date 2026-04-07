import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeGovernedRequest,
  governanceBucket,
  makeDedupeKey,
  resetApiGovernanceForTests,
  runCoalescedFetch,
  shouldCoalesceRequest,
  syntheticIfBucketBackoff,
  syntheticIfGlobalPaused,
  waitRequestSpacing,
} from '../src/shared/http/apiGovernance.js';

const originalLocalStorage = globalThis.localStorage;

class MemoryStorage {
  store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key) || null : null;
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] || null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(String(key), String(value));
  }
}

afterEach(() => {
  resetApiGovernanceForTests();
  vi.useRealTimers();
  if (originalLocalStorage === undefined) {
    // @ts-expect-error test cleanup for environments without localStorage
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = originalLocalStorage;
  }
});

describe('apiGovernance', () => {
  it('classifies hot paths into stable buckets', () => {
    expect(governanceBucket('/api/engagement/state', 'POST')).toBe('post:engagement-state');
    expect(governanceBucket('/api/auth/session', 'GET')).toBe('get:auth-session');
    expect(governanceBucket('/api/billing/state', 'GET')).toBe('billing');
    expect(governanceBucket('/api/membership/state', 'GET')).toBe('membership');
  });

  it('only coalesces safe reads and explicit idempotent post reads', () => {
    expect(shouldCoalesceRequest('/api/auth/session', 'GET')).toBe(true);
    expect(shouldCoalesceRequest('/api/engagement/state', 'POST')).toBe(true);
    expect(shouldCoalesceRequest('/api/chat', 'POST')).toBe(false);
    expect(shouldCoalesceRequest('/api/manual/predictions/entry', 'POST')).toBe(false);
  });

  it('builds dedupe keys from method, path, and body (including objects)', () => {
    expect(makeDedupeKey('POST', '/api/x', '{"a":1}')).toBe('POST /api/x {"a":1}');
    expect(makeDedupeKey('POST', '/api/x', { a: 1 })).toBe('POST /api/x {"a":1}');
    expect(makeDedupeKey('GET', '/api/y', undefined)).toBe('GET /api/y ');
  });

  it('normalises query param order in dedupe keys', () => {
    const a = makeDedupeKey('GET', '/api/x?b=2&a=1', undefined);
    const b = makeDedupeKey('GET', '/api/x?a=1&b=2', undefined);
    expect(a).toBe(b);
    expect(a).toBe('GET /api/x?a=1&b=2 ');
  });

  it('coalesces concurrent identical logical requests and clones responses', async () => {
    let calls = 0;
    const makeReq = () =>
      runCoalescedFetch('k1', async () => {
        calls += 1;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

    const [p1, p2] = await Promise.all([makeReq(), makeReq()]);

    expect(calls).toBe(1);
    // Verify both can read .json() without "body stream is locked" error
    const [data1, data2] = await Promise.all([p1.json(), p2.json()]);
    expect(data1.ok).toBe(true);
    expect(data2.ok).toBe(true);
    expect(data1).not.toBe(data2); // Different objects due to separate .json() calls
  });

  it('sets global synthetic pause after Vercel deployment disabled', () => {
    const bucket = 'post:engagement-state';
    const res = new Response('no', {
      status: 402,
      headers: { 'X-Vercel-Error': 'DEPLOYMENT_DISABLED' },
    });
    finalizeGovernedRequest(bucket, res, null);
    const syn = syntheticIfGlobalPaused();
    expect(syn).not.toBeNull();
    expect(syn?.status).toBe(503);
  });

  it('reads shared global pause state from localStorage for other tabs', () => {
    globalThis.localStorage = new MemoryStorage() as unknown as Storage;
    globalThis.localStorage.setItem(
      'nova-quant:api-governance:global-pause',
      JSON.stringify({ ms: Date.now() + 30_000 }),
    );
    const syn = syntheticIfGlobalPaused();
    expect(syn).not.toBeNull();
    expect(syn?.status).toBe(503);
  });

  it('applies bucket backoff after repeated 5xx', () => {
    const bucket = 'billing';
    finalizeGovernedRequest(bucket, new Response('e', { status: 503 }), null);
    finalizeGovernedRequest(bucket, new Response('e', { status: 503 }), null);
    finalizeGovernedRequest(bucket, new Response('e', { status: 503 }), null);
    const syn = syntheticIfBucketBackoff(bucket);
    expect(syn).not.toBeNull();
    expect(syn?.status).toBe(503);
  });

  it('reads shared bucket backoff state from localStorage for other tabs', () => {
    globalThis.localStorage = new MemoryStorage() as unknown as Storage;
    globalThis.localStorage.setItem(
      'nova-quant:api-governance:bucket:billing',
      JSON.stringify({
        failStreak: 3,
        backoffUntil: Date.now() + 30_000,
        lastRequestStart: 0,
      }),
    );
    const syn = syntheticIfBucketBackoff('billing');
    expect(syn).not.toBeNull();
    expect(syn?.status).toBe(503);
  });

  it('backoff jitter stays within 50%-100% of base exponential', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const bucket = 'membership';
    // 3 failures triggers first backoff: base = 1000 * 2^3 = 8000ms
    finalizeGovernedRequest(bucket, new Response('e', { status: 500 }), null);
    finalizeGovernedRequest(bucket, new Response('e', { status: 500 }), null);
    finalizeGovernedRequest(bucket, new Response('e', { status: 500 }), null);
    // After 3 failures, backoff should be in [4000, 8000] ms from now
    const now = Date.now();
    const until = syntheticIfBucketBackoff(bucket);
    expect(until).not.toBeNull();
    // The backoff is checked via: if Date.now() < until -> return synthetic
    // We need to peek at the map indirectly. Advance time by 3999ms -> still backoff
    vi.setSystemTime(now + 3999);
    expect(syntheticIfBucketBackoff(bucket)).not.toBeNull();
    // Advance time past max jitter (8000ms) -> no backoff
    vi.setSystemTime(now + 8001);
    expect(syntheticIfBucketBackoff(bucket)).toBeNull();
  });

  it('waitRequestSpacing returns immediately in test env', async () => {
    const t0 = Date.now();
    await waitRequestSpacing('post:engagement-state');
    expect(Date.now() - t0).toBeLessThan(50);
  });

  // ── Half-open circuit breaker ─────────────────────────────────

  it('half-open: allows one probe after backoff expires, blocks others', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const bucket = 'billing';

    // Trigger backoff (3 consecutive 503s)
    finalizeGovernedRequest(bucket, new Response('e', { status: 503 }), null);
    finalizeGovernedRequest(bucket, new Response('e', { status: 503 }), null);
    finalizeGovernedRequest(bucket, new Response('e', { status: 503 }), null);

    expect(syntheticIfBucketBackoff(bucket)).not.toBeNull();

    // Advance past max backoff window (8000ms for n=3)
    vi.setSystemTime(Date.now() + 8001);

    // First call: half-open probe — allowed
    expect(syntheticIfBucketBackoff(bucket)).toBeNull();

    // Second concurrent call: blocked (probe in-flight)
    const blocked = syntheticIfBucketBackoff(bucket);
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(503);

    // Probe succeeds → circuit fully closes
    finalizeGovernedRequest(bucket, new Response('ok', { status: 200 }), null);

    // Fully open now — both calls should pass
    expect(syntheticIfBucketBackoff(bucket)).toBeNull();
    expect(syntheticIfBucketBackoff(bucket)).toBeNull();
  });

  it('half-open: probe failure re-arms backoff immediately', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const bucket = 'membership';

    // Trigger backoff
    finalizeGovernedRequest(bucket, new Response('e', { status: 500 }), null);
    finalizeGovernedRequest(bucket, new Response('e', { status: 500 }), null);
    finalizeGovernedRequest(bucket, new Response('e', { status: 500 }), null);

    // Advance past backoff
    vi.setSystemTime(Date.now() + 8001);

    // Probe allowed
    expect(syntheticIfBucketBackoff(bucket)).toBeNull();

    // Probe fails
    finalizeGovernedRequest(bucket, new Response('e', { status: 500 }), null);

    // Should be back in backoff
    expect(syntheticIfBucketBackoff(bucket)).not.toBeNull();
  });

  // ── Body type dedupe keys ─────────────────────────────────────

  it('makeDedupeKey handles Blob bodies by size and type', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const key = makeDedupeKey('POST', '/api/upload', blob);
    expect(key).toContain('blob:');
    expect(key).toContain('text/plain');
    expect(key).not.toContain('[object');
  });

  it('makeDedupeKey handles FormData bodies deterministically', () => {
    const fd1 = new FormData();
    fd1.append('b', '2');
    fd1.append('a', '1');

    const fd2 = new FormData();
    fd2.append('a', '1');
    fd2.append('b', '2');

    // Same entries in different append order → same key (entries are sorted)
    expect(makeDedupeKey('POST', '/api/form', fd1)).toBe(makeDedupeKey('POST', '/api/form', fd2));
  });

  it('makeDedupeKey handles ArrayBuffer bodies', () => {
    const buf = new ArrayBuffer(16);
    const key = makeDedupeKey('POST', '/api/binary', buf);
    expect(key).toContain('buffer:16');
    expect(key).not.toContain('[object');
  });

  it('makeDedupeKey handles TypedArray (Uint8Array) bodies', () => {
    const arr = new Uint8Array(32);
    const key = makeDedupeKey('POST', '/api/binary', arr);
    expect(key).toContain('buffer:32');
    expect(key).not.toContain('[object');
  });
});

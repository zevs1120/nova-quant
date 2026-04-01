const WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000);
const MAX_ATTEMPTS = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);

const bucket = new Map<string, number[]>();

setInterval(
  () => {
    const now = Date.now();
    for (const [key, timestamps] of bucket.entries()) {
      const valid = timestamps.filter((ts) => now - ts <= WINDOW_MS);
      if (valid.length === 0) {
        bucket.delete(key);
      } else {
        bucket.set(key, valid);
      }
    }
  },
  2 * 60 * 1000,
).unref();

export interface AuthRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkAuthRateLimit(ip: string): AuthRateLimitResult {
  const now = Date.now();
  const arr = bucket.get(ip) ?? [];
  const valid = arr.filter((ts) => now - ts <= WINDOW_MS);

  if (valid.length >= MAX_ATTEMPTS) {
    const retryAfterMs = valid[0] + WINDOW_MS - now;
    bucket.set(ip, valid);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  valid.push(now);
  bucket.set(ip, valid);

  return {
    allowed: true,
    remaining: Math.max(0, MAX_ATTEMPTS - valid.length),
    retryAfterMs: 0,
  };
}

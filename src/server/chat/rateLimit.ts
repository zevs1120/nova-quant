const WINDOW_MS = Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS || 60_000);
const MAX_REQUESTS = Number(process.env.CHAT_RATE_LIMIT_MAX || 18);

const bucket = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  const arr = bucket.get(userId) ?? [];
  const valid = arr.filter((ts) => now - ts <= WINDOW_MS);

  if (valid.length >= MAX_REQUESTS) {
    const resetAt = valid[0] + WINDOW_MS;
    bucket.set(userId, valid);
    return {
      allowed: false,
      remaining: 0,
      resetAt
    };
  }

  valid.push(now);
  bucket.set(userId, valid);

  return {
    allowed: true,
    remaining: Math.max(0, MAX_REQUESTS - valid.length),
    resetAt: now + WINDOW_MS
  };
}

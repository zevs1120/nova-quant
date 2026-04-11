import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkApiRateLimit, resetApiRateLimitForTests } from '../src/server/api/rateLimit.js';

function mockRequest(path: string, method = 'GET', ip = '203.0.113.10') {
  return {
    method,
    path,
    ip,
    socket: { remoteAddress: ip },
    header(name: string) {
      if (name.toLowerCase() === 'x-forwarded-for') return ip;
      return '';
    },
  } as any;
}

describe('api rate limit middleware', () => {
  beforeEach(() => {
    resetApiRateLimitForTests();
    vi.stubEnv('API_PUBLIC_READ_RATE_LIMIT_WINDOW_MS', '60000');
    vi.stubEnv('API_PUBLIC_READ_RATE_LIMIT_MAX', '2');
    vi.stubEnv('API_BILLING_RATE_LIMIT_WINDOW_MS', '60000');
    vi.stubEnv('API_BILLING_RATE_LIMIT_MAX', '2');
  });

  afterEach(() => {
    resetApiRateLimitForTests();
    vi.unstubAllEnvs();
  });

  it('rate-limits public read endpoints by bucket and reports retry metadata', async () => {
    const first = checkApiRateLimit(mockRequest('/api/assets/search'));
    const second = checkApiRateLimit(mockRequest('/api/assets/search'));
    const third = checkApiRateLimit(mockRequest('/api/assets/search'));

    expect(first).toMatchObject({ allowed: true, bucket: 'public_read' });
    expect(second).toMatchObject({ allowed: true, bucket: 'public_read' });
    expect(third).toMatchObject({ allowed: false, bucket: 'public_read', remaining: 0 });
  });

  it('keeps billing checkout creation in a separate, tighter bucket', () => {
    const first = checkApiRateLimit(mockRequest('/api/billing/checkout', 'POST', '203.0.113.20'));
    const second = checkApiRateLimit(mockRequest('/api/billing/checkout', 'POST', '203.0.113.20'));
    const third = checkApiRateLimit(mockRequest('/api/billing/checkout', 'POST', '203.0.113.20'));

    expect(first).toMatchObject({ allowed: true, bucket: 'billing' });
    expect(second).toMatchObject({ allowed: true, bucket: 'billing' });
    expect(third).toMatchObject({ allowed: false, bucket: 'billing', remaining: 0 });
    expect((third?.resetAt || 0) > Date.now()).toBe(true);
  });
});

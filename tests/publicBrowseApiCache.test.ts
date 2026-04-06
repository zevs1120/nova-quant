import { describe, expect, it } from 'vitest';
import handler from '../api/index.js';

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

describe('public browse api cache surface', () => {
  it('serves detail bundle from the api-only entrypoint with public cache headers', async () => {
    const res = createMockResponse();
    await handler(
      {
        query: {
          route: ['browse', 'detail-bundle'],
          market: 'US',
          symbol: 'SPY',
          limit: '6',
        },
        url: '/api/browse/detail-bundle?market=US&symbol=SPY&limit=6',
        method: 'GET',
        headers: {},
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control'] || res.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=180',
    );
    expect(res.payload).toMatchObject({
      market: 'US',
      symbol: 'SPY',
    });
  });
});

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

describe('vercel healthz route', () => {
  it('returns a 200 json payload', async () => {
    const res = createMockResponse();
    await handler(
      {
        query: {
          route: ['healthz'],
        },
        url: '/api/healthz',
        method: 'GET',
        headers: {},
      } as any,
      res as any,
    );
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      ok: true,
      service: 'novaquant-api',
    });
  });
});

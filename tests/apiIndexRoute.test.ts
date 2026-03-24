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
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe('api index route', () => {
  it('lets auth login preflight reach first-party cors handler', async () => {
    const res = createMockResponse();
    await handler(
      {
        query: {
          route: ['auth', 'login'],
        },
        url: '/api?route=auth&route=login',
        method: 'OPTIONS',
        headers: {
          origin: 'https://novaquant.cloud',
        },
        header(name: string) {
          return this.headers?.[name.toLowerCase()];
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://novaquant.cloud');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('keeps public assets preflight on read-only cors policy', async () => {
    const res = createMockResponse();
    await handler(
      {
        query: {
          route: ['assets'],
        },
        url: '/api?route=assets',
        method: 'OPTIONS',
        headers: {
          origin: 'https://novaquant.cloud',
        },
        header(name: string) {
          return this.headers?.[name.toLowerCase()];
        },
      } as any,
      res as any,
    );

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://novaquant.cloud');
    expect(res.headers['access-control-allow-methods']).toBe('GET,POST,OPTIONS');
  });
});

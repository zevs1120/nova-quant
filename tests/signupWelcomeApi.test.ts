import { describe, expect, it } from 'vitest';
import { handleAuthSignup } from '../src/server/api/authHandlers.js';

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (body: unknown) => void;
  setHeader: (_name: string, _value: string) => void;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
    setHeader() {},
  };
}

describe('signup welcome email', () => {
  it('returns a Supabase-managed response for signup requests', async () => {
    const res = createMockResponse();

    await handleAuthSignup(
      {
        body: {
          email: 'signup-welcome@example.com',
          password: 'StrongPass123',
          name: 'Welcome User',
          tradeMode: 'active',
          broker: 'Other',
        },
      },
      res,
    );

    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'AUTH_MANAGED_BY_SUPABASE',
    });
  });
});

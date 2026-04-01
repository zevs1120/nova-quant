import { describe, expect, it } from 'vitest';
import { handleForgotPassword } from '../src/server/api/authHandlers.js';

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

describe('password reset api', () => {
  it('returns a Supabase-managed response for password reset requests', async () => {
    const res = createMockResponse();

    await handleForgotPassword(
      {
        body: {
          email: 'reset-flow@example.com',
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

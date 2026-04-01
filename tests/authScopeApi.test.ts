import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requireAuthenticatedScope,
  resolveRequestNovaScope,
  type RequestWithNovaScope,
} from '../src/server/api/helpers.js';

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (body: unknown) => void;
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
  };
}

function createRequest(args: {
  userId?: string;
  authorization?: string;
  cookie?: string;
  scope?: RequestWithNovaScope['novaScope'];
}) {
  return {
    query: args.userId ? { userId: args.userId } : {},
    body: {},
    header(name: string) {
      if (name.toLowerCase() === 'authorization') {
        return args.authorization || '';
      }
      if (name.toLowerCase() === 'cookie') {
        return args.cookie || '';
      }
      return '';
    },
    novaScope: args.scope,
  } as unknown as RequestWithNovaScope;
}

describe('api user scope enforcement', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NOVA_DISABLE_SESSION_USER_SCOPE', '0');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('binds authenticated requests to the bearer-token user and blocks spoofed userIds', async () => {
    const spoofed = await resolveRequestNovaScope(
      createRequest({
        userId: 'usr_secondary',
        authorization: 'Bearer token-123',
      }),
      async () => ({
        user: {
          userId: 'usr_primary',
        },
      }),
    );
    expect(spoofed).toEqual({
      ok: false,
      status: 403,
      body: { error: 'USER_SCOPE_MISMATCH' },
    });

    const sameUser = await resolveRequestNovaScope(
      createRequest({
        authorization: 'Bearer token-123',
      }),
      async () => ({
        user: {
          userId: 'usr_primary',
        },
      }),
    );
    expect(sameUser).toEqual({
      ok: true,
      scope: {
        authenticated: true,
        userId: 'usr_primary',
        authUserId: 'usr_primary',
      },
    });
  });

  it('accepts a first-party session cookie when no bearer token is present', async () => {
    const result = await resolveRequestNovaScope(
      createRequest({
        cookie: 'novaquant_session=session-123',
      }),
      async () => null,
      async () => ({
        user: {
          userId: 'usr_cookie',
        },
      }),
    );

    expect(result).toEqual({
      ok: true,
      scope: {
        authenticated: true,
        userId: 'usr_cookie',
        authUserId: 'usr_cookie',
      },
    });
  });

  it('rejects non-guest user scopes when no authenticated session exists', async () => {
    const result = await resolveRequestNovaScope(
      createRequest({
        userId: 'usr_not_allowed',
      }),
      async () => null,
    );

    expect(result).toEqual({
      ok: false,
      status: 401,
      body: { error: 'AUTH_REQUIRED' },
    });
  });

  it('requires an authenticated scope before exposing broker snapshots', () => {
    const res = createMockResponse();
    const scope = requireAuthenticatedScope(
      createRequest({
        scope: {
          authenticated: false,
          userId: 'guest-abc123',
          authUserId: null,
        },
      }),
      res as never,
    );

    expect(scope).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'AUTH_REQUIRED' });
  });
});

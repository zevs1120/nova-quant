import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAuthLogin, handleAuthSession } from '../src/server/api/authHandlers.js';
import { signupAuthUser } from '../src/server/auth/service.js';

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

async function callHandler(
  handler: (req: Record<string, unknown>, res: MockResponse) => Promise<void>,
  args: { body?: unknown; cookie?: string },
) {
  const res = createMockResponse();
  await handler(
    {
      body: args.body,
      headers: args.cookie ? { cookie: args.cookie } : {},
      header(name: string) {
        if (name.toLowerCase() === 'cookie') return args.cookie || '';
        return '';
      },
    },
    res,
  );
  return res;
}

describe('auth login api', () => {
  const email = 'cookie-login-test@example.com';

  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', 'postgres');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', 'postgres://supabase-test-host/db');
    vi.stubEnv('NOVA_AUTH_PG_SSL', '');
    vi.stubEnv('NOVA_AUTH_PG_POOL_MAX', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NOVA_ADMIN_EMAILS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates a first-party cookie session for standard user login', async () => {
    const signup = await signupAuthUser({
      email,
      password: 'StrongPass123',
      name: 'Cookie Login Tester',
      tradeMode: 'active',
      broker: 'Robinhood',
    });
    expect(signup.ok).toBe(true);

    const login = await callHandler(handleAuthLogin, {
      body: {
        email,
        password: 'StrongPass123',
      },
    });
    expect(login.statusCode).toBe(200);
    expect((login.body as { authenticated?: boolean }).authenticated).toBe(true);
    expect((login.body as { user?: { email?: string } }).user?.email).toBe(email);

    const cookie = login.headers['Set-Cookie'];
    expect(typeof cookie).toBe('string');
    expect(cookie).toContain('novaquant_session=');

    const session = await callHandler(handleAuthSession, { cookie });
    expect(session.statusCode).toBe(200);
    expect((session.body as { authenticated?: boolean }).authenticated).toBe(true);
    expect((session.body as { user?: { email?: string } }).user?.email).toBe(email);
    expect((session.body as { isAdmin?: boolean }).isAdmin).toBe(false);
    expect((session.body as { roles?: string[] }).roles).toEqual([]);
  });

  it('marks configured admin emails as admin in auth session payloads', async () => {
    const adminEmail = 'cookie-admin-test@example.com';
    vi.stubEnv('NOVA_ADMIN_EMAILS', adminEmail);

    const signup = await signupAuthUser({
      email: adminEmail,
      password: 'StrongPass123',
      name: 'Cookie Admin Tester',
      tradeMode: 'active',
      broker: 'Robinhood',
    });
    expect(signup.ok).toBe(true);

    const login = await callHandler(handleAuthLogin, {
      body: {
        email: adminEmail,
        password: 'StrongPass123',
      },
    });
    expect(login.statusCode).toBe(200);

    const cookie = login.headers['Set-Cookie'];
    expect(typeof cookie).toBe('string');
    expect(cookie).toContain('novaquant_session=');

    const session = await callHandler(handleAuthSession, { cookie });
    expect(session.statusCode).toBe(200);
    expect((session.body as { authenticated?: boolean }).authenticated).toBe(true);
    expect((session.body as { user?: { email?: string } }).user?.email).toBe(adminEmail);
    expect((session.body as { isAdmin?: boolean }).isAdmin).toBe(true);
    expect((session.body as { roles?: string[] }).roles).toContain('ADMIN');
  });
});

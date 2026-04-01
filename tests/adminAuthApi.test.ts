import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAdminLogin, handleAdminSession } from '../src/server/api/authHandlers.js';
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

async function seedAuthUser(email: string, name: string) {
  const result = await signupAuthUser({
    email,
    password: 'StrongPass123',
    name,
    tradeMode: 'active',
    broker: 'Other',
  });
  expect(result.ok).toBe(true);
}

describe('admin auth api', () => {
  const email = 'admin-api-test@example.com';

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
  });

  afterEach(() => {
    process.env.NOVA_ADMIN_EMAILS = '';
    vi.unstubAllEnvs();
  });

  it('creates an admin session for configured admin emails', async () => {
    process.env.NOVA_ADMIN_EMAILS = email;
    await seedAuthUser(email, 'Admin Tester');

    const login = await callHandler(handleAdminLogin, {
      body: {
        email,
        password: 'StrongPass123',
      },
    });
    expect(login.statusCode).toBe(200);
    expect((login.body as { authorized?: boolean }).authorized).toBe(true);
    expect((login.body as { roles?: string[] }).roles).toContain('ADMIN');

    const cookie = login.headers['Set-Cookie'];
    expect(typeof cookie).toBe('string');
    const session = await callHandler(handleAdminSession, { cookie });
    expect(session.statusCode).toBe(200);
    expect((session.body as { authorized?: boolean }).authorized).toBe(true);
    expect((session.body as { user?: { email?: string } }).user?.email).toBe(email);
  });

  it('rejects non-admin users from admin login', async () => {
    await seedAuthUser(email, 'Plain User');

    const login = await callHandler(handleAdminLogin, {
      body: {
        email,
        password: 'StrongPass123',
      },
    });
    expect(login.statusCode).toBe(403);
    expect((login.body as { error?: string }).error).toBe('ADMIN_ACCESS_DENIED');
  });
});

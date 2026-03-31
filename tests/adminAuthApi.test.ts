import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import {
  handleAdminLogin,
  handleAdminSession,
  handleAuthSignup,
} from '../src/server/api/authHandlers.js';

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

function resetAuthTables(email: string) {
  const db = getDb();
  ensureSchema(db);
  const row = db.prepare('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1').get(email) as
    | { user_id?: string }
    | undefined;
  if (!row?.user_id) return;
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_user_roles WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_user_state_sync WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_users WHERE user_id = ?').run(row.user_id);
}

describe('admin auth api', () => {
  const email = 'admin-api-test@example.com';

  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', 'sqlite');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', '');
    vi.stubEnv('NOVA_AUTH_PG_SSL', '');
    vi.stubEnv('NOVA_AUTH_PG_POOL_MAX', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  });

  afterEach(() => {
    process.env.NOVA_ADMIN_EMAILS = '';
    resetAuthTables(email);
    vi.unstubAllEnvs();
  });

  it('creates an admin session for configured admin emails', async () => {
    process.env.NOVA_ADMIN_EMAILS = email;
    const signup = await callHandler(handleAuthSignup, {
      body: {
        email,
        password: 'StrongPass123',
        name: 'Admin Tester',
        tradeMode: 'active',
        broker: 'Other',
      },
    });
    expect(signup.statusCode).toBe(200);

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
    const signup = await callHandler(handleAuthSignup, {
      body: {
        email,
        password: 'StrongPass123',
        name: 'Plain User',
        tradeMode: 'active',
        broker: 'Other',
      },
    });
    expect(signup.statusCode).toBe(200);

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

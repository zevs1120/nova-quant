import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../src/server/api/app.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { getDb } from '../src/server/db/database.js';

function resetAuthUser(email: string) {
  const db = getDb();
  ensureSchema(db);
  const row = db.prepare('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1').get(email) as
    | { user_id?: string }
    | undefined;
  if (!row?.user_id) return;
  db.prepare('DELETE FROM auth_password_resets WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_user_roles WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_user_state_sync WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_users WHERE user_id = ?').run(row.user_id);
}

describe('password reset api', () => {
  const email = 'reset-flow@example.com';

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'sqlite');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', '');
    vi.stubEnv('NOVA_AUTH_PG_SSL', '');
    vi.stubEnv('NOVA_AUTH_PG_POOL_MAX', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('NOVA_AUTH_EMAIL_FROM', '');
    vi.stubEnv('NOVA_AUTH_REPLY_TO', '');
    vi.stubEnv('NOVA_APP_URL', 'https://novaquant.cloud');
  });

  afterEach(() => {
    resetAuthUser(email);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns a delivery configuration error instead of pretending reset email was sent', async () => {
    const app = createApiApp();
    const signup = await request(app).post('/api/auth/signup').send({
      email,
      password: 'StrongPass123',
      name: 'Reset User',
      tradeMode: 'active',
      broker: 'Other',
    });
    expect(signup.status).toBe(200);

    const reset = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(reset.status).toBe(503);
    expect(reset.body.error).toBe('RESET_DELIVERY_NOT_CONFIGURED');
  });

  it('sends reset emails through Resend when configured', async () => {
    const app = createApiApp();
    const signup = await request(app).post('/api/auth/signup').send({
      email,
      password: 'StrongPass123',
      name: 'Reset User',
      tradeMode: 'active',
      broker: 'Other',
    });
    expect(signup.status).toBe(200);

    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('NOVA_AUTH_EMAIL_FROM', 'NovaQuant <reset@novaquant.cloud>');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const reset = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(reset.status).toBe(200);
    expect(reset.body.ok).toBe(true);
    expect(reset.body.codeHint).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
  });
});

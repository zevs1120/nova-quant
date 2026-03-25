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

describe('signup welcome email', () => {
  const email = 'signup-welcome@example.com';

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
    vi.stubEnv('NOVA_APP_URL', 'https://app.novaquant.cloud');
  });

  afterEach(() => {
    resetAuthUser(email);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends a welcome email after signup when Resend is configured', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('NOVA_AUTH_EMAIL_FROM', 'NovaQuant <welcome@novaquant.cloud>');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = createApiApp();
    const signup = await request(app).post('/api/auth/signup').send({
      email,
      password: 'StrongPass123',
      name: 'Welcome User',
      tradeMode: 'active',
      broker: 'Other',
    });

    expect(signup.status).toBe(200);
    expect(signup.body.ok).toBe(true);
    expect(signup.body.emailDelivery?.signupWelcome?.status).toBe('sent');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'User-Agent': 'nova-quant-auth/1.0',
    });
    expect(String(fetchMock.mock.calls[0]?.[1]?.body || '')).toContain('Welcome to NovaQuant');
  });

  it('does not fail signup when the welcome email provider is down', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('NOVA_AUTH_EMAIL_FROM', 'NovaQuant <welcome@novaquant.cloud>');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('upstream error', {
        status: 500,
      }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchMock);

    const app = createApiApp();
    const signup = await request(app).post('/api/auth/signup').send({
      email,
      password: 'StrongPass123',
      name: 'Welcome User',
      tradeMode: 'active',
      broker: 'Other',
    });

    expect(signup.status).toBe(200);
    expect(signup.body.ok).toBe(true);
    expect(signup.body.emailDelivery?.signupWelcome?.status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('surfaces when signup welcome email is skipped because Resend is not configured', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const app = createApiApp();
    const signup = await request(app).post('/api/auth/signup').send({
      email,
      password: 'StrongPass123',
      name: 'Welcome User',
      tradeMode: 'active',
      broker: 'Other',
    });

    expect(signup.status).toBe(200);
    expect(signup.body.ok).toBe(true);
    expect(signup.body.emailDelivery?.signupWelcome?.status).toBe('skipped');
    expect(signup.body.emailDelivery?.signupWelcome?.reason).toBe('not_configured');
    expect(signup.body.emailDelivery?.signupWelcome?.missing).toEqual([
      'RESEND_API_KEY',
      'NOVA_AUTH_EMAIL_FROM',
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });
});

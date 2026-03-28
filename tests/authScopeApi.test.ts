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
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_user_roles WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_user_state_sync WHERE user_id = ?').run(row.user_id);
  db.prepare('DELETE FROM auth_users WHERE user_id = ?').run(row.user_id);
}

describe('api user scope enforcement', () => {
  const primaryEmail = 'scope-primary@example.com';
  const secondaryEmail = 'scope-secondary@example.com';

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NOVA_AUTH_DRIVER', 'sqlite');
    vi.stubEnv('NOVA_AUTH_DATABASE_URL', '');
    vi.stubEnv('NOVA_AUTH_PG_SSL', '');
    vi.stubEnv('NOVA_AUTH_PG_POOL_MAX', '');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('NOVA_AUTH_EMAIL_FROM', '');
    vi.stubEnv('RESEND_FROM_EMAIL', '');
    vi.stubEnv('NOVA_AUTH_REPLY_TO', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NOVA_DISABLE_SESSION_USER_SCOPE', '0');
  });

  afterEach(() => {
    resetAuthUser(primaryEmail);
    resetAuthUser(secondaryEmail);
    vi.unstubAllEnvs();
  });

  it('binds authenticated requests to the session user and blocks spoofed userIds', async () => {
    const app = createApiApp();
    const signupPrimary = await request(app).post('/api/auth/signup').send({
      email: primaryEmail,
      password: 'StrongPass123',
      name: 'Primary User',
      tradeMode: 'active',
      broker: 'Other',
    });
    expect(signupPrimary.status).toBe(200);
    const primaryUserId = String(signupPrimary.body?.user?.userId || '');
    expect(primaryUserId).toBeTruthy();
    const authCookie = signupPrimary.headers['set-cookie']?.[0];
    expect(authCookie).toBeTruthy();

    const signupSecondary = await request(app).post('/api/auth/signup').send({
      email: secondaryEmail,
      password: 'StrongPass123',
      name: 'Secondary User',
      tradeMode: 'active',
      broker: 'Other',
    });
    expect(signupSecondary.status).toBe(200);
    const secondaryUserId = String(signupSecondary.body?.user?.userId || '');
    expect(secondaryUserId).toBeTruthy();

    const spoofed = await request(app)
      .get('/api/risk-profile')
      .set('Cookie', authCookie)
      .query({ userId: secondaryUserId });
    expect(spoofed.status).toBe(403);
    expect(spoofed.body.error).toBe('USER_SCOPE_MISMATCH');

    const sameUser = await request(app).get('/api/risk-profile').set('Cookie', authCookie);
    expect(sameUser.status).toBe(200);
    expect(sameUser.body?.data).toBeTruthy();
  });

  it('rejects non-guest user scopes when no authenticated session exists', async () => {
    const app = createApiApp();
    const unauthenticated = await request(app)
      .get('/api/risk-profile')
      .query({ userId: 'usr_not_allowed' });
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error).toBe('AUTH_REQUIRED');
  });

  it('requires an authenticated session before exposing broker snapshots', async () => {
    const app = createApiApp();
    const response = await request(app)
      .get('/api/connect/broker')
      .query({ userId: 'guest-abc123', provider: 'ALPACA' });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_REQUIRED');
  });
});

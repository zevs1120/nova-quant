import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/api/app.js';

describe('api cors policy', () => {
  it('allows credentialed requests from app and admin origins', async () => {
    const app = createApiApp();

    const appOrigin = await request(app)
      .options('/api/auth/session')
      .set('Origin', 'https://novaquant.cloud');
    expect(appOrigin.status).toBe(204);
    expect(appOrigin.headers['access-control-allow-origin']).toBe('https://novaquant.cloud');
    expect(appOrigin.headers['access-control-allow-credentials']).toBe('true');

    const adminOrigin = await request(app)
      .options('/api/admin/session')
      .set('Origin', 'https://admin.novaquant.cloud');
    expect(adminOrigin.status).toBe(204);
    expect(adminOrigin.headers['access-control-allow-origin']).toBe('https://admin.novaquant.cloud');
    expect(adminOrigin.headers['access-control-allow-credentials']).toBe('true');
  });
});

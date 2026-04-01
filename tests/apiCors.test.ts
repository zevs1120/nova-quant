import { describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/api/app.js';
import { requestLocalHttp } from './helpers/httpTestClient.js';

describe('api cors policy', () => {
  it('allows credentialed requests from app and admin origins', async () => {
    const app = createApiApp();

    const appOrigin = await requestLocalHttp(app, {
      method: 'OPTIONS',
      path: '/api/auth/session',
      headers: { Origin: 'https://app.novaquant.cloud' },
    });
    expect(appOrigin.status).toBe(204);
    expect(appOrigin.headers['access-control-allow-origin']).toBe('https://app.novaquant.cloud');
    expect(appOrigin.headers['access-control-allow-credentials']).toBe('true');

    const adminOrigin = await requestLocalHttp(app, {
      method: 'OPTIONS',
      path: '/api/admin/session',
      headers: { Origin: 'https://admin.novaquant.cloud' },
    });
    expect(adminOrigin.status).toBe(204);
    expect(adminOrigin.headers['access-control-allow-origin']).toBe(
      'https://admin.novaquant.cloud',
    );
    expect(adminOrigin.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows first-party POST auth requests after api rewrite path normalization', async () => {
    const app = createApiApp();

    const loginOrigin = await requestLocalHttp(app, {
      method: 'OPTIONS',
      path: '/api',
      query: { route: ['auth', 'login'] },
      headers: { Origin: 'https://app.novaquant.cloud' },
    });

    expect(loginOrigin.status).toBe(204);
    expect(loginOrigin.headers['access-control-allow-origin']).toBe('https://app.novaquant.cloud');
    expect(loginOrigin.headers['access-control-allow-credentials']).toBe('true');
    expect(loginOrigin.headers['access-control-allow-methods']).toContain('POST');
  });
});

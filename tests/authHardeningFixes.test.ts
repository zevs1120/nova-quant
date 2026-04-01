import { describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/api/app.js';
import { requestLocalHttp } from './helpers/httpTestClient.js';

describe('auth hardening fixes', () => {
  describe('CORS Authorization header (Issue 1)', () => {
    it('includes Authorization in Access-Control-Allow-Headers for first-party origins', async () => {
      const app = createApiApp();

      const res = await requestLocalHttp(app, {
        method: 'OPTIONS',
        path: '/api/auth/session',
        headers: { Origin: 'https://app.novaquant.cloud' },
      });

      expect(res.status).toBe(204);
      const allowedHeaders = String(res.headers['access-control-allow-headers'] || '');
      expect(allowedHeaders).toContain('Authorization');
      expect(allowedHeaders).toContain('Content-Type');
    });

    it('includes Authorization in Access-Control-Allow-Headers for cross-origin read paths', async () => {
      const app = createApiApp();

      const res = await requestLocalHttp(app, {
        method: 'OPTIONS',
        path: '/api/auth/provider-config',
        headers: { Origin: 'https://example.com' },
      });

      expect(res.status).toBe(204);
      const allowedHeaders = String(res.headers['access-control-allow-headers'] || '');
      expect(allowedHeaders).toContain('Authorization');
    });

    it('includes Authorization for admin origin preflight', async () => {
      const app = createApiApp();

      const res = await requestLocalHttp(app, {
        method: 'OPTIONS',
        path: '/api/admin/session',
        headers: { Origin: 'https://admin.novaquant.cloud' },
      });

      expect(res.status).toBe(204);
      const allowedHeaders = String(res.headers['access-control-allow-headers'] || '');
      expect(allowedHeaders).toContain('Authorization');
    });
  });

  describe('API base utilities DRY refactor (Issue 4)', () => {
    it('exports all required utilities from the shared apiBase module', async () => {
      const apiBase = await import('../src/utils/apiBase.js');
      expect(typeof apiBase.trim).toBe('function');
      expect(typeof apiBase.readDefinedGlobal).toBe('function');
      expect(typeof apiBase.trimTrailingSlash).toBe('function');
      expect(typeof apiBase.unique).toBe('function');
      expect(typeof apiBase.isLocalHost).toBe('function');
      expect(typeof apiBase.runtimeApiBases).toBe('function');
      expect(typeof apiBase.buildApiUrl).toBe('function');
    });

    it('trimTrailingSlash removes trailing slashes', async () => {
      const { trimTrailingSlash } = await import('../src/utils/apiBase.js');
      expect(trimTrailingSlash('https://api.test.com/')).toBe('https://api.test.com');
      expect(trimTrailingSlash('https://api.test.com///')).toBe('https://api.test.com');
      expect(trimTrailingSlash('https://api.test.com')).toBe('https://api.test.com');
      expect(trimTrailingSlash('')).toBe('');
      expect(trimTrailingSlash(null)).toBe('');
    });

    it('unique deduplicates and preserves order', async () => {
      const { unique } = await import('../src/utils/apiBase.js');
      expect(unique(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
      expect(unique([null, 'x', undefined, 'x'])).toEqual(['x']);
      expect(unique([])).toEqual([]);
    });

    it('isLocalHost identifies localhost variants', async () => {
      const { isLocalHost } = await import('../src/utils/apiBase.js');
      expect(isLocalHost('localhost')).toBe(true);
      expect(isLocalHost('127.0.0.1')).toBe(true);
      expect(isLocalHost('example.com')).toBe(false);
    });

    it('buildApiUrl constructs proper URLs', async () => {
      const { buildApiUrl } = await import('../src/utils/apiBase.js');
      expect(buildApiUrl('/api/test', 'https://api.test.com')).toBe(
        'https://api.test.com/api/test',
      );
      expect(buildApiUrl('/api/test', '')).toBe('/api/test');
      expect(buildApiUrl('api/test', 'https://api.test.com')).toBe('https://api.test.com/api/test');
      expect(buildApiUrl('/api/test', 'https://api.test.com/')).toBe(
        'https://api.test.com/api/test',
      );
    });
  });

  describe('supabaseAuth sessionStorage config cache (Issue 5)', () => {
    it('exports loadSupabaseBrowserConfig and related functions', async () => {
      const supabaseAuth = await import('../src/utils/supabaseAuth.js');
      expect(typeof supabaseAuth.loadSupabaseBrowserConfig).toBe('function');
      expect(typeof supabaseAuth.hasSupabaseAuthBrowserConfig).toBe('function');
      expect(typeof supabaseAuth.resolveSupabaseBrowserUrl).toBe('function');
      expect(typeof supabaseAuth.resolveSupabaseBrowserAnonKey).toBe('function');
    });
  });

  describe('signup / forgot-password API deprecation guard (Issue 3)', () => {
    it('POST /api/auth/signup returns 410 AUTH_MANAGED_BY_SUPABASE', async () => {
      const app = createApiApp();
      const res = await requestLocalHttp(app, {
        method: 'POST',
        path: '/api/auth/signup',
        body: { email: 'test@test.com', password: 'test1234' },
      });
      expect(res.status).toBe(410);
      expect(res.body.error).toBe('AUTH_MANAGED_BY_SUPABASE');
    });

    it('POST /api/auth/forgot-password returns 410 AUTH_MANAGED_BY_SUPABASE', async () => {
      const app = createApiApp();
      const res = await requestLocalHttp(app, {
        method: 'POST',
        path: '/api/auth/forgot-password',
        body: { email: 'test@test.com' },
      });
      expect(res.status).toBe(410);
      expect(res.body.error).toBe('AUTH_MANAGED_BY_SUPABASE');
    });

    it('POST /api/auth/reset-password returns 410 AUTH_MANAGED_BY_SUPABASE', async () => {
      const app = createApiApp();
      const res = await requestLocalHttp(app, {
        method: 'POST',
        path: '/api/auth/reset-password',
        body: { password: 'newpass123' },
      });
      expect(res.status).toBe(410);
      expect(res.body.error).toBe('AUTH_MANAGED_BY_SUPABASE');
    });
  });
});

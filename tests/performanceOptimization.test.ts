import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../src/server/api/app.js';
import { getDb } from '../src/server/db/database.js';
import { resetRepoSingleton } from '../src/server/api/queries.js';
import { requestLocalHttp } from './helpers/httpTestClient.js';

describe('performance optimization regression', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // 1. Cache-Control: user-scoped endpoints MUST be private, no-store
  // -------------------------------------------------------------------------
  describe('Cache-Control headers', () => {
    beforeEach(() => {
      // Local `.env` may define GEMINI_API_KEY; browse news refresh would otherwise call
      // `runNovaChatCompletion` and hang CI on network. Cache-Control assertions do not need LLM.
      vi.stubEnv('GEMINI_API_KEY', '');
    });

    const privateEndpoints = [
      '/api/market-state',
      '/api/market/modules',
      '/api/outcomes/recent',
      '/api/performance',
      '/api/risk-profile',
      '/api/runtime-state',
      '/api/signals',
    ];

    it('sets private, no-store on user-scoped GET endpoints', async () => {
      const app = createApiApp();

      for (const endpoint of privateEndpoints) {
        const res = await requestLocalHttp(app, {
          path: endpoint,
          query: { userId: 'usr_private_scope' },
        });
        expect(res.status, `${endpoint} should be blocked before route work runs`).toBe(401);
        expect(res.headers['cache-control'], `${endpoint} should have private, no-store`).toBe(
          'private, no-store',
        );
      }
    });

    it('does not set cache-control on non-listed endpoints', async () => {
      const app = createApiApp();
      const res = await requestLocalHttp(app, { path: '/healthz' });
      expect(res.headers['cache-control']).toBeUndefined();
    });

    it('sets public cache-control on browse public GET endpoints', async () => {
      const app = createApiApp();

      const assets = await requestLocalHttp(app, {
        path: '/api/assets',
        query: { market: 'US' },
      });
      expect(assets.status).toBe(200);
      expect(assets.headers['cache-control']).toBe(
        'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      );

      const home = await requestLocalHttp(app, {
        path: '/api/browse/home',
        query: { view: 'STOCK' },
      });
      expect(home.status).toBe(200);
      expect(home.headers['cache-control']).toBe(
        'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
      );

      const detailBundle = await requestLocalHttp(app, {
        path: '/api/browse/detail-bundle',
        query: { market: 'US', symbol: 'SPY', limit: 6 },
      });
      expect(detailBundle.status).toBe(200);
      expect(detailBundle.headers['cache-control']).toBe(
        'public, max-age=15, s-maxage=60, stale-while-revalidate=180',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. Runtime repo lifecycle guards
  // -------------------------------------------------------------------------
  describe('runtime repo lifecycle', () => {
    it('getDb rejects legacy local-db access outside tests', () => {
      expect(() => getDb()).toThrow(
        'BUSINESS_RUNTIME_POSTGRES_ONLY: local SQL runtimes have been removed.',
      );
    });

    it('resetRepoSingleton is callable and idempotent', () => {
      // Should not throw even without a prior getRepo call
      expect(() => resetRepoSingleton()).not.toThrow();
      expect(() => resetRepoSingleton()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Build output chunk shape — vendor separated, charts not first-paint
  // -------------------------------------------------------------------------
  describe('build output chunk assertions', () => {
    const distAssetsDir = path.resolve(__dirname, '..', 'dist', 'assets');

    it('vendor chunk exists separately from index', () => {
      if (!fs.existsSync(distAssetsDir)) return; // skip if no build
      const files = fs.readdirSync(distAssetsDir);
      const hasVendor = files.some((f) => f.startsWith('vendor-') && f.endsWith('.js'));
      const hasIndex = files.some((f) => f.startsWith('index-') && f.endsWith('.js'));
      expect(hasVendor).toBe(true);
      expect(hasIndex).toBe(true);
    });

    it('TodayTab is a separate lazy chunk, not in index', () => {
      if (!fs.existsSync(distAssetsDir)) return; // skip if no build
      const files = fs.readdirSync(distAssetsDir);
      const hasTodayTab = files.some((f) => f.startsWith('TodayTab-') && f.endsWith('.js'));
      expect(hasTodayTab).toBe(true);
    });

    it('index.html does not modulepreload a charts chunk', () => {
      const indexHtml = path.resolve(__dirname, '..', 'dist', 'index.html');
      if (!fs.existsSync(indexHtml)) return; // skip if no build
      const html = fs.readFileSync(indexHtml, 'utf8');
      const preloads = html.match(/modulepreload.*?href="([^"]+)"/g) || [];
      const chartsPreload = preloads.find((p) => p.includes('charts-'));
      expect(chartsPreload).toBeUndefined();
    });
  });
});

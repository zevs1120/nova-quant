import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../src/server/api/app.js';
import { getDb, closeDb } from '../src/server/db/database.js';
import { resetRepoSingleton } from '../src/server/api/queries.js';

vi.stubEnv('NOVA_AUTH_DRIVER', 'sqlite');
vi.stubEnv('KV_REST_API_URL', '');
vi.stubEnv('KV_REST_API_TOKEN', '');
vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
vi.stubEnv('NOVA_DISABLE_SQLITE_PROCESS_LOCK', '1');

describe('performance optimization regression', () => {
  // -------------------------------------------------------------------------
  // 1. Cache-Control: user-scoped endpoints MUST be private, no-store
  // -------------------------------------------------------------------------
  describe('Cache-Control headers', () => {
    const privateEndpoints = [
      '/api/assets',
      '/api/market-state',
      '/api/market/modules',
      '/api/performance',
      '/api/risk-profile',
      '/api/runtime-state',
      '/api/signals',
    ];

    it('sets private, no-store on user-scoped GET endpoints', async () => {
      const app = createApiApp();

      for (const endpoint of privateEndpoints) {
        const res = await request(app).get(endpoint);
        expect(res.headers['cache-control'], `${endpoint} should have private, no-store`).toBe(
          'private, no-store',
        );
      }
    });

    it('does not set cache-control on non-listed endpoints', async () => {
      const app = createApiApp();
      const res = await request(app).get('/healthz');
      expect(res.headers['cache-control']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 2. closeDb() clears the repo singleton so re-open works
  // -------------------------------------------------------------------------
  describe('closeDb repo singleton lifecycle', () => {
    afterEach(() => {
      // Ensure we don't leave a broken state for other tests
      try {
        closeDb();
      } catch {
        /* already closed */
      }
    });

    it('getDb works after closeDb + reopen cycle', () => {
      // First access — creates the singleton
      const db1 = getDb();
      expect(db1).toBeDefined();
      expect(db1.open).toBe(true);

      // Close — should clear both db and repo singletons
      closeDb();

      // Re-open — must get a fresh, open handle
      const db2 = getDb();
      expect(db2).toBeDefined();
      expect(db2.open).toBe(true);
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

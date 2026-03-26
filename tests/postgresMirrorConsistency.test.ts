import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRiskProfilePrimary,
  loadRuntimeStateCorePrimary,
  resetRepoSingleton,
  setRiskProfile,
} from '../src/server/api/queries.js';
import { closeDb } from '../src/server/db/database.js';
import { createMirroringMarketRepository } from '../src/server/db/postgresBusinessMirror.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { ensureSchema } from '../src/server/db/schema.js';

describe('postgres mirror consistency', () => {
  const originalQuery = Pool.prototype.query;
  const tempDirs = new Set<string>();

  function pgRowsResult<T>(rows: T[]) {
    return {
      command: 'SELECT',
      rowCount: rows.length,
      oid: 0,
      fields: [],
      rows,
    } as unknown;
  }

  afterEach(() => {
    Pool.prototype.query = originalQuery;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetRepoSingleton();
    try {
      closeDb();
    } catch {
      // ignore already-closed handles
    }
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.clear();
  });

  it('rejects flush when a mirrored Postgres write fails', async () => {
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://fake-host/db');
    vi.stubEnv('NOVA_DATA_PG_SSL', 'disable');
    vi.stubEnv('NOVA_ENABLE_PG_MIRROR_WRITES_TEST', '1');

    Pool.prototype.query = async function query() {
      throw new Error('PG_WRITE_FAILED');
    } as unknown as typeof Pool.prototype.query;

    const db = new Database(':memory:');
    ensureSchema(db);

    try {
      const { repo, flush } = createMirroringMarketRepository(db);
      repo.upsertUserRiskProfile({
        user_id: 'mirror-flush-user',
        profile_key: 'balanced',
        max_loss_per_trade: 1,
        max_daily_loss: 2,
        max_drawdown: 3,
        exposure_cap: 50,
        leverage_cap: 1,
        updated_at_ms: Date.now(),
      });
      await expect(flush()).rejects.toThrow('PG_WRITE_FAILED');
    } finally {
      db.close();
    }
  });

  it('waits for pending mirror writes before issuing primary Postgres reads', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-quant-pg-read-'));
    tempDirs.add(tempDir);

    vi.stubEnv('DB_PATH', path.join(tempDir, 'quant.db'));
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://fake-host/db');
    vi.stubEnv('NOVA_DATA_PG_SSL', 'disable');
    vi.stubEnv('NOVA_ENABLE_PG_PRIMARY_READS_TEST', '1');
    vi.stubEnv('NOVA_ENABLE_PG_MIRROR_WRITES_TEST', '1');

    const store = new Map<
      string,
      {
        user_id: string;
        profile_key: string;
        max_loss_per_trade: number;
        max_daily_loss: number;
        max_drawdown: number;
        exposure_cap: number;
        leverage_cap: number;
        updated_at_ms: number;
      }
    >();
    let earlyRead = false;

    Pool.prototype.query = async function query(sql: unknown, params?: unknown[]) {
      const text = String(sql);
      if (text.includes('INSERT INTO') && text.includes('user_risk_profiles')) {
        const [
          user_id,
          profile_key,
          max_loss_per_trade,
          max_daily_loss,
          max_drawdown,
          exposure_cap,
          leverage_cap,
          updated_at_ms,
        ] = params as [string, string, number, number, number, number, number, number];
        await new Promise((resolve) => setTimeout(resolve, 20));
        store.set(user_id, {
          user_id,
          profile_key,
          max_loss_per_trade,
          max_daily_loss,
          max_drawdown,
          exposure_cap,
          leverage_cap,
          updated_at_ms,
        });
        return pgRowsResult([]);
      }

      if (text.includes('FROM') && text.includes('user_risk_profiles')) {
        const userId = String(params?.[0] || '');
        const row = store.get(userId);
        if (!row) earlyRead = true;
        return pgRowsResult(row ? [row] : []);
      }

      return pgRowsResult([]);
    } as unknown as typeof Pool.prototype.query;

    try {
      closeDb();
    } catch {
      // ignore already-closed handles
    }
    resetRepoSingleton();

    setRiskProfile('mirror-read-user', 'aggressive');
    const row = await getRiskProfilePrimary('mirror-read-user', { skipSync: true });

    expect(earlyRead).toBe(false);
    expect(row?.profile_key).toBe('aggressive');
  });

  it('syncs SQLite fallback data before reading mixed-source runtime signals', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-quant-runtime-fallback-'));
    tempDirs.add(tempDir);

    vi.stubEnv('DB_PATH', path.join(tempDir, 'quant.db'));
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://fake-host/db');
    vi.stubEnv('NOVA_DATA_PG_SSL', 'disable');
    vi.stubEnv('NOVA_ENABLE_PG_PRIMARY_READS_TEST', '1');
    vi.stubEnv('NOVA_DISABLE_PG_MIRROR_WRITES', '1');

    Pool.prototype.query = async function query(sql: unknown) {
      const text = String(sql);
      if (text.includes('FROM') && text.includes('user_risk_profiles')) {
        return pgRowsResult([
          {
            user_id: 'runtime-fallback-user',
            profile_key: 'balanced',
            max_loss_per_trade: 1,
            max_daily_loss: 2,
            max_drawdown: 3,
            exposure_cap: 50,
            leverage_cap: 1,
            updated_at_ms: Date.now(),
          },
        ]);
      }
      if (
        text.includes('FROM') &&
        (text.includes('signals') ||
          text.includes('market_state') ||
          text.includes('performance_snapshots'))
      ) {
        throw new Error('PG_PRIMARY_READ_FAILED');
      }
      return pgRowsResult([]);
    } as unknown as typeof Pool.prototype.query;

    try {
      closeDb();
    } catch {
      // ignore already-closed handles
    }
    resetRepoSingleton();

    const originalUpsertUserRiskProfile = MarketRepository.prototype.upsertUserRiskProfile;
    const originalListSignals = MarketRepository.prototype.listSignals;
    let syncStarted = false;
    let fallbackSignalReadSawSync: boolean | null = null;

    vi.spyOn(MarketRepository.prototype, 'upsertUserRiskProfile').mockImplementation(function mock(
      this: MarketRepository,
      input,
    ) {
      syncStarted = true;
      return originalUpsertUserRiskProfile.call(this, input);
    });

    vi.spyOn(MarketRepository.prototype, 'listSignals').mockImplementation(function mock(
      this: MarketRepository,
      params,
    ) {
      if (params?.limit === 60 && params?.market === 'US') {
        fallbackSignalReadSawSync = syncStarted;
      }
      return originalListSignals.call(this, params);
    });

    await loadRuntimeStateCorePrimary({
      userId: 'runtime-fallback-user',
      market: 'US',
      assetClass: 'US_STOCK',
    });

    expect(fallbackSignalReadSawSync).toBe(true);
  });
});

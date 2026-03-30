import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDb } from '../src/server/db/database.js';
import {
  flushRuntimeRepoMirror,
  getRuntimeRepo,
  getRuntimeRepoStatus,
  resetRuntimeRepoSingleton,
} from '../src/server/db/runtimeRepository.js';
import { __buildSequenceResetSqlForTesting } from '../src/server/db/postgresRuntimeRepository.js';

describe('runtime repository', () => {
  const tempDirs = new Set<string>();

  afterEach(() => {
    resetRuntimeRepoSingleton();
    try {
      closeDb();
    } catch {
      // ignore already closed handles
    }
    vi.unstubAllEnvs();
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.clear();
  });

  it('reuses a single runtime repository instance and reports mirror status', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-runtime-repo-'));
    tempDirs.add(tempDir);
    vi.stubEnv('DB_PATH', path.join(tempDir, 'quant.db'));
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'sqlite');

    const first = getRuntimeRepo();
    const second = getRuntimeRepo();

    expect(first).toBe(second);
    expect(getRuntimeRepoStatus()).toEqual({
      initialized: true,
      mirrorEnabled: false,
    });
    await expect(flushRuntimeRepoMirror()).resolves.toBeUndefined();
  });

  it('builds a fresh repository after reset and db close', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-runtime-repo-reset-'));
    tempDirs.add(tempDir);
    vi.stubEnv('DB_PATH', path.join(tempDir, 'quant.db'));
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'sqlite');

    const first = getRuntimeRepo();
    resetRuntimeRepoSingleton();
    closeDb();
    const second = getRuntimeRepo();

    expect(second).not.toBe(first);
  });

  it('resets postgres auto-id sequences without setting empty tables to zero', () => {
    const sql = __buildSequenceResetSqlForTesting('signal_deliveries');

    expect(sql).toContain('setval');
    expect(sql).toContain(
      'CASE WHEN seq.max_id IS NULL OR seq.max_id < 1 THEN 1 ELSE seq.max_id END',
    );
    expect(sql).toContain('COALESCE(seq.max_id, 0) > 0');
    expect(sql).toContain('"novaquant_data"."signal_deliveries"');
    expect(sql).toContain('"novaquant_data"."signal_deliveries_id_seq"');
  });
});

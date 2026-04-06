import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockClosePostgresSyncBridge = vi.fn();
const constructorCalls: unknown[][] = [];

vi.mock('../src/server/db/postgresSyncBridge.js', () => ({
  closePostgresSyncBridge: mockClosePostgresSyncBridge,
}));

vi.mock('../src/server/db/postgresRuntimeRepository.js', () => ({
  __buildSequenceResetSqlForTesting: (table: string) => {
    const idCol = table === 'assets' ? '"asset_id"' : '"id"';
    return `
        SELECT setval(
          '"novaquant_data"."${table}_id_seq"'::regclass,
          CASE WHEN seq.max_id IS NULL OR seq.max_id < 1 THEN 1 ELSE seq.max_id END,
          COALESCE(seq.max_id, 0) > 0
        )
        FROM (SELECT MAX(${idCol}) AS max_id FROM "novaquant_data"."${table}") AS seq;
      `;
  },
  PostgresRuntimeRepository: class MockPostgresRuntimeRepository {
    constructor(...args: unknown[]) {
      constructorCalls.push(args);
    }
  },
}));

describe('runtime repository', () => {
  beforeEach(() => {
    constructorCalls.length = 0;
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const { resetRuntimeRepoSingleton } = await import('../src/server/db/runtimeRepository.js');
    resetRuntimeRepoSingleton();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reuses a single runtime repository instance and reports postgres-only status', async () => {
    const { flushRuntimeRepoMirror, getRuntimeRepo, getRuntimeRepoStatus } =
      await import('../src/server/db/runtimeRepository.js');

    const first = getRuntimeRepo();
    const second = getRuntimeRepo();

    expect(first).toBe(second);
    expect(constructorCalls).toHaveLength(1);
    expect(getRuntimeRepoStatus()).toEqual({
      initialized: true,
      mirrorEnabled: false,
    });
    await expect(flushRuntimeRepoMirror()).resolves.toBeUndefined();
  });

  it('builds a fresh repository after reset', async () => {
    const { getRuntimeRepo, resetRuntimeRepoSingleton } =
      await import('../src/server/db/runtimeRepository.js');

    const first = getRuntimeRepo();
    resetRuntimeRepoSingleton();
    const second = getRuntimeRepo();

    expect(second).not.toBe(first);
    expect(constructorCalls).toHaveLength(2);
  });

  it('resets postgres auto-id sequences without setting empty tables to zero', async () => {
    const { __buildSequenceResetSqlForTesting } =
      await import('../src/server/db/postgresRuntimeRepository.js');
    const sql = __buildSequenceResetSqlForTesting('signal_deliveries');

    expect(sql).toContain('setval');
    expect(sql).toContain(
      'CASE WHEN seq.max_id IS NULL OR seq.max_id < 1 THEN 1 ELSE seq.max_id END',
    );
    expect(sql).toContain('COALESCE(seq.max_id, 0) > 0');
    expect(sql).toContain('"novaquant_data"."signal_deliveries"');
    expect(sql).toContain('"novaquant_data"."signal_deliveries_id_seq"');
    expect(sql).toMatch(/MAX\("id"\)/);
  });

  it('uses asset_id for assets sequence reset SQL', async () => {
    const { __buildSequenceResetSqlForTesting } =
      await import('../src/server/db/postgresRuntimeRepository.js');
    const sql = __buildSequenceResetSqlForTesting('assets');
    expect(sql).toContain('MAX("asset_id")');
    expect(sql).toContain('"novaquant_data"."assets_id_seq"');
  });
});

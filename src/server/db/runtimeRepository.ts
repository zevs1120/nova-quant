import type { MarketRepository } from './repository.js';
import { getConfig } from '../config.js';
import { getDb } from './database.js';
import { createMirroringMarketRepository } from './postgresBusinessMirror.js';
import { PostgresRuntimeRepository } from './postgresRuntimeRepository.js';
import { closePostgresSyncBridge } from './postgresSyncBridge.js';

type RuntimeRepoHandle = ReturnType<typeof createMirroringMarketRepository>;

let repoHandleSingleton: RuntimeRepoHandle | null = null;
let repoSingleton: MarketRepository | null = null;

export function getRuntimeRepo(): MarketRepository {
  if (repoSingleton) return repoSingleton;
  const config = getConfig();
  if (config.database.driver === 'postgres') {
    repoHandleSingleton = null;
    repoSingleton = new PostgresRuntimeRepository();
    return repoSingleton;
  }

  const db = getDb();
  repoHandleSingleton = createMirroringMarketRepository(db);
  repoSingleton = repoHandleSingleton.repo;
  return repoSingleton;
}

export function resetRuntimeRepoSingleton(): void {
  repoHandleSingleton = null;
  repoSingleton = null;
  try {
    closePostgresSyncBridge();
  } catch {
    // ignore best-effort teardown failures
  }
}

export async function flushRuntimeRepoMirror(): Promise<void> {
  if (!repoHandleSingleton?.mirrorEnabled) return;
  await repoHandleSingleton.flush();
}

export function getRuntimeRepoStatus(): {
  initialized: boolean;
  mirrorEnabled: boolean;
} {
  return {
    initialized: Boolean(repoSingleton),
    mirrorEnabled: Boolean(repoHandleSingleton?.mirrorEnabled),
  };
}

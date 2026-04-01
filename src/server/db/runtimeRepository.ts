import type { MarketRepository } from './repository.js';
import { PostgresRuntimeRepository } from './postgresRuntimeRepository.js';
import { closePostgresSyncBridge } from './postgresSyncBridge.js';
let repoSingleton: MarketRepository | null = null;

export function getRuntimeRepo(): MarketRepository {
  if (repoSingleton) return repoSingleton;
  repoSingleton = new PostgresRuntimeRepository();
  return repoSingleton;
}

export function resetRuntimeRepoSingleton(): void {
  repoSingleton = null;
  try {
    closePostgresSyncBridge();
  } catch {
    // ignore best-effort teardown failures
  }
}

export async function flushRuntimeRepoMirror(): Promise<void> {
  return Promise.resolve();
}

export function getRuntimeRepoStatus(): {
  initialized: boolean;
  mirrorEnabled: boolean;
} {
  return {
    initialized: Boolean(repoSingleton),
    mirrorEnabled: false,
  };
}

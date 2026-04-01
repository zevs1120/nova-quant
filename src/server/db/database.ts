import { InMemorySyncDb } from './inMemorySyncDb.js';
import type { SyncDb } from './syncDb.js';

let testDbSingleton: SyncDb | null = null;

export function getDb(): SyncDb {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('BUSINESS_RUNTIME_POSTGRES_ONLY: local SQL runtimes have been removed.');
  }
  if (testDbSingleton) return testDbSingleton;
  testDbSingleton = new InMemorySyncDb();
  return testDbSingleton;
}

export function closeDb(): void {
  if (!testDbSingleton) return;
  testDbSingleton.close();
  testDbSingleton = null;
}

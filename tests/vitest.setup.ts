import { afterEach } from 'vitest';
import { resetConfigCache } from '../src/server/config.js';
import { closePostgresAuthStore } from '../src/server/auth/postgresStore.js';
import { closePostgresBusinessReadPoolForTesting } from '../src/server/admin/postgresBusinessRead.js';
import { closePostgresBusinessMirrorPoolForTesting } from '../src/server/db/postgresBusinessMirror.js';
import { resetRuntimeRepoSingleton } from '../src/server/db/runtimeRepository.js';
import { closePostgresSyncBridge } from '../src/server/db/postgresSyncBridge.js';
import { resetInMemoryPostgresForTesting } from '../src/server/db/inMemoryPostgres.js';

process.env.NOVA_DATA_RUNTIME_DRIVER = 'postgres';
process.env.NOVA_AUTH_DRIVER = 'postgres';
process.env.NOVA_DATA_DATABASE_URL = 'postgres://supabase-test-host/db';
process.env.NOVA_AUTH_DATABASE_URL = 'postgres://supabase-test-host/db';
process.env.NOVA_DISABLE_PG_MIRROR_WRITES = '1';

afterEach(async () => {
  resetRuntimeRepoSingleton();
  resetConfigCache();
  closePostgresSyncBridge();
  await closePostgresAuthStore();
  await closePostgresBusinessReadPoolForTesting();
  await closePostgresBusinessMirrorPoolForTesting();
  resetInMemoryPostgresForTesting();
});

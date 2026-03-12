import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';

try {
  const db = getDb();
  ensureSchema(db);
  console.log('Database initialized');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

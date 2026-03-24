import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';

try {
  const db = getDb();
  ensureSchema(db);
  console.log('Migration applied: schema up-to-date');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

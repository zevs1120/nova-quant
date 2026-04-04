import { queryRowSync } from '../src/server/db/postgresSyncBridge.js';

try {
  console.log('Testing sync bridge...');
  // This will fail if DB is not configured, but we want to see IF it throws a ReferenceError or similar
  const result = queryRowSync('SELECT 1 as one');
  console.log('Result:', result);
} catch (error) {
  console.error('Caught error:', error);
  if (error instanceof ReferenceError) {
    console.error('ReferenceError detected! This might be the cause of 500 errors.');
  }
}

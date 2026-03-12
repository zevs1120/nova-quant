import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { resolveDbPath } from '../config.js';
import { ensureSchema } from './schema.js';

let dbSingleton: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbSingleton) return dbSingleton;

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  ensureSchema(db);

  dbSingleton = db;
  return db;
}

export function closeDb(): void {
  if (!dbSingleton) return;
  dbSingleton.close();
  dbSingleton = null;
}

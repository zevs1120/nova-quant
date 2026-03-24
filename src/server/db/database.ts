import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { resolveDbPath } from '../config.js';
import { ensureSchema } from './schema.js';

let dbSingleton: Database.Database | null = null;
let dbLockFd: number | null = null;
let dbLockPath: string | null = null;

function sqliteProcessLockEnabled() {
  return process.env.NODE_ENV !== 'test' && process.env.NOVA_DISABLE_SQLITE_PROCESS_LOCK !== '1';
}

function isLivePid(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function tryAcquireSqliteProcessLock(dbPath: string) {
  if (!sqliteProcessLockEnabled() || dbLockFd !== null) return;
  const lockPath = `${dbPath}.instance.lock`;
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(
        fd,
        JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), db_path: dbPath }),
      );
      dbLockFd = fd;
      dbLockPath = lockPath;
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') throw error;

      try {
        const raw = fs.readFileSync(lockPath, 'utf8');
        const payload = JSON.parse(raw) as { pid?: number };
        if (!isLivePid(Number(payload?.pid))) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        fs.rmSync(lockPath, { force: true });
        continue;
      }

      throw new Error(`SQLITE_SINGLE_INSTANCE_LOCKED:${lockPath}`);
    }
  }
}

function releaseSqliteProcessLock() {
  if (dbLockFd !== null) {
    fs.closeSync(dbLockFd);
    dbLockFd = null;
  }
  if (dbLockPath) {
    fs.rmSync(dbLockPath, { force: true });
    dbLockPath = null;
  }
}

export function getDb(): Database.Database {
  if (dbSingleton) return dbSingleton;

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  tryAcquireSqliteProcessLock(dbPath);
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
  releaseSqliteProcessLock();
}

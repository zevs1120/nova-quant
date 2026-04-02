import { newDb } from 'pg-mem';
import { buildBusinessBootstrapSql } from './inMemoryPostgres.js';
import { manualGamificationSchemaPatchStatements } from './schema.js';
import type { SyncDb, SyncPreparedStatement, SyncQueryArgs, SyncRunResult } from './syncDb.js';

function quoteLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (Buffer.isBuffer(value)) return `decode('${value.toString('hex')}', 'hex')`;
  if (Array.isArray(value)) {
    return `ARRAY[${value.map((item) => quoteLiteral(item)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toQueryArgs(args: unknown[]): SyncQueryArgs {
  if (!args.length) return undefined;
  if (args.length === 1) {
    const [first] = args;
    if (Array.isArray(first)) return first;
    if (first && typeof first === 'object') return first as Record<string, unknown>;
  }
  return args;
}

function interpolateNamedParams(sql: string, params: Record<string, unknown>) {
  return sql.replace(/([@:])([A-Za-z_][A-Za-z0-9_]*)/g, (match, _prefix, key) => {
    if (!(key in params)) return match;
    return quoteLiteral(params[key]);
  });
}

function interpolatePositionalParams(sql: string, params: unknown[]) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    const value = params[index];
    index += 1;
    return quoteLiteral(value);
  });
}

function interpolateStatement(sql: string, args: SyncQueryArgs) {
  if (!args) return sql;
  if (Array.isArray(args)) return interpolatePositionalParams(sql, args);
  return interpolateNamedParams(sql, args);
}

function splitStatements(sql: string) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function normalizeSql(sql: string) {
  const trimmed = String(sql || '').trim();
  if (!trimmed) return trimmed;
  if (/^PRAGMA\b/i.test(trimmed)) return '';
  return trimmed
    .replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/gi, 'BIGSERIAL PRIMARY KEY')
    .replace(/\bINTEGER PRIMARY KEY\b/gi, 'BIGINT PRIMARY KEY')
    .replace(/\bINTEGER\b/gi, 'BIGINT')
    .replace(/\bREAL\b/gi, 'DOUBLE PRECISION')
    .replace(/\bBLOB\b/gi, 'BYTEA')
    .replace(
      /FROM\s*\(([\s\S]+?)\)\s*(ORDER BY|WHERE|LIMIT|GROUP BY)/gi,
      'FROM ($1) AS __subquery $2',
    );
}

export class InMemorySyncDb implements SyncDb {
  private readonly db = newDb({ autoCreateForeignKeyIndices: true });
  private transactionBackup: ReturnType<ReturnType<typeof newDb>['backup']> | null = null;

  constructor(_connectionString?: string) {
    for (const statement of buildBusinessBootstrapSql()) {
      this.db.public.none(statement);
    }
    const qualifyShort = (name: string) => `"${String(name).replace(/"/g, '""')}"`;
    for (const stmt of manualGamificationSchemaPatchStatements(qualifyShort)) {
      if (/^CREATE\s+(TABLE|INDEX)/i.test(stmt)) continue;
      this.db.public.none(stmt);
    }
  }

  ensureBootstrapped() {}

  private execute(sql: string) {
    const normalized = normalizeSql(sql);
    if (!normalized) {
      return {
        rows: [],
        rowCount: 0,
        command: '',
      };
    }
    if (/^BEGIN\b/i.test(normalized)) {
      if (this.transactionBackup) {
        throw new Error('IN_MEMORY_SYNC_TRANSACTION_ALREADY_OPEN');
      }
      this.transactionBackup = this.db.backup();
      return {
        rows: [],
        rowCount: 0,
        command: 'BEGIN',
      };
    }
    if (/^COMMIT\b/i.test(normalized)) {
      this.transactionBackup = null;
      return {
        rows: [],
        rowCount: 0,
        command: 'COMMIT',
      };
    }
    if (/^ROLLBACK\b/i.test(normalized)) {
      this.transactionBackup?.restore();
      this.transactionBackup = null;
      return {
        rows: [],
        rowCount: 0,
        command: 'ROLLBACK',
      };
    }
    const result = this.db.public.query(normalized);
    return {
      rows: result.rows as any[],
      rowCount: Number(result.rowCount || 0),
      command: String(result.command || ''),
    };
  }

  exec(sql: string) {
    for (const statement of splitStatements(sql)) {
      this.execute(statement);
    }
  }

  prepare(sql: string): SyncPreparedStatement {
    const execute = (...args: unknown[]) => {
      const interpolated = interpolateStatement(sql, toQueryArgs(args));
      return this.execute(interpolated);
    };

    return {
      run: (...args: unknown[]): SyncRunResult => {
        const result = execute(...args);
        return {
          changes: Number(result.rowCount || 0),
          lastInsertRowid: null,
        };
      },
      get: (...args: unknown[]) => {
        const result = execute(...args);
        return result.rows[0] ?? undefined;
      },
      all: (...args: unknown[]) => {
        const result = execute(...args);
        return result.rows;
      },
      iterate: (...args: unknown[]) => {
        const rows = execute(...args).rows || [];
        return rows.values();
      },
    };
  }

  transaction<Args extends unknown[], Result>(fn: (...args: Args) => Result) {
    return (...args: Args) => {
      if (this.transactionBackup) {
        throw new Error('IN_MEMORY_SYNC_TRANSACTION_ALREADY_OPEN');
      }
      this.transactionBackup = this.db.backup();
      try {
        const result = fn(...args);
        this.transactionBackup = null;
        return result;
      } catch (error) {
        this.transactionBackup?.restore();
        this.transactionBackup = null;
        throw error;
      }
    };
  }

  pragma(_value: string) {}

  close() {}
}

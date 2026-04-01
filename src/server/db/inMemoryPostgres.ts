import { newDb } from 'pg-mem';
import type { PoolConfig } from 'pg';
import { Pool as NodePgPool } from 'pg';
import { BUSINESS_BOOTSTRAP_SQL } from './schema.js';

type InMemoryPgState = {
  db: ReturnType<typeof newDb>;
  adapter: ReturnType<ReturnType<typeof newDb>['adapters']['createPg']>;
  transactionBackup: ReturnType<ReturnType<typeof newDb>['backup']> | null;
  authSchemaReady: boolean;
  businessSchemaReady: Set<string>;
};

const stateByConnectionString = new Map<string, InMemoryPgState>();

function quoteIdentifier(identifier: string) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

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

function interpolatePgParams(sql: string, params: unknown[]) {
  return sql.replace(/\$(\d+)/g, (_match, rawIndex) => {
    const index = Number(rawIndex) - 1;
    return quoteLiteral(params[index]);
  });
}

function stripInMemoryCreateTableConstraints(sql: string) {
  return sql
    .replace(/\s+NOT NULL\b/gi, '')
    .replace(/\s+NULL\b/gi, '')
    .replace(/\s+UNIQUE\b/gi, '')
    .replace(/\s+DEFAULT\s+('[^']*'::[a-z_]+|'[^']*'|TRUE|FALSE|NULL|-?\d+(?:\.\d+)?)/gi, '')
    .replace(/\s+CHECK\s*\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/gi, '')
    .replace(/\s+REFERENCES\s+[^\s(]+(?:\([^)]+\))?(?:\s+ON DELETE\s+\w+)?/gi, '')
    .replace(/,\s*PRIMARY KEY\s*\([^)]+\)/gi, '')
    .replace(/\s+PRIMARY KEY\b/gi, '')
    .replace(/,\s*\)/g, '\n)')
    .replace(/\(\s*,/g, '(');
}

function normalizeInMemoryQuery(sql: string) {
  const trimmed = sql.trim();
  if (/^ALTER TABLE .* (DROP|ADD) CONSTRAINT /i.test(trimmed)) {
    return null;
  }
  if (/^CREATE TABLE /i.test(trimmed)) {
    return stripInMemoryCreateTableConstraints(trimmed);
  }
  return trimmed;
}

export function buildBusinessBootstrapSql() {
  const transformed = BUSINESS_BOOTSTRAP_SQL.replace(
    /\bINTEGER PRIMARY KEY AUTOINCREMENT\b/g,
    'BIGSERIAL PRIMARY KEY',
  )
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'BIGINT PRIMARY KEY')
    .replace(/\bINTEGER\b/g, 'BIGINT')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
    .replace(/\bBLOB\b/g, 'BYTEA');

  return transformed
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function buildInMemoryAuthBootstrapSql() {
  return [
    `CREATE TABLE IF NOT EXISTS auth_users (
      user_id TEXT,
      email TEXT,
      password_hash TEXT,
      name TEXT,
      trade_mode TEXT,
      broker TEXT,
      locale TEXT,
      created_at_ms BIGINT,
      updated_at_ms BIGINT,
      last_login_at_ms BIGINT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_user_id ON auth_users(user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email)`,
    `CREATE TABLE IF NOT EXISTS auth_user_roles (
      user_id TEXT,
      role TEXT,
      granted_at_ms BIGINT,
      granted_by_user_id TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_user_roles_user_role ON auth_user_roles(user_id, role)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_user_roles_role ON auth_user_roles(role, granted_at_ms DESC)`,
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      session_id TEXT,
      user_id TEXT,
      session_token_hash TEXT,
      user_agent TEXT,
      ip_address TEXT,
      expires_at_ms BIGINT,
      revoked_at_ms BIGINT,
      created_at_ms BIGINT,
      updated_at_ms BIGINT,
      last_seen_at_ms BIGINT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_session_id ON auth_sessions(session_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(session_token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, updated_at_ms DESC)`,
    `CREATE TABLE IF NOT EXISTS auth_password_resets (
      reset_id TEXT,
      user_id TEXT,
      email TEXT,
      code_hash TEXT,
      expires_at_ms BIGINT,
      used_at_ms BIGINT,
      created_at_ms BIGINT,
      updated_at_ms BIGINT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_password_resets_reset_id ON auth_password_resets(reset_id)`,
    `CREATE INDEX IF NOT EXISTS idx_auth_password_resets_user ON auth_password_resets(user_id, created_at_ms DESC)`,
    `CREATE TABLE IF NOT EXISTS auth_user_state_sync (
      user_id TEXT,
      asset_class TEXT,
      market TEXT,
      ui_mode TEXT,
      risk_profile_key TEXT,
      watchlist_json JSONB,
      holdings_json JSONB,
      executions_json JSONB,
      discipline_log_json JSONB,
      updated_at_ms BIGINT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_user_state_sync_user_id ON auth_user_state_sync(user_id)`,
  ];
}

function getOrCreateState(connectionString: string) {
  const existing = stateByConnectionString.get(connectionString);
  if (existing) return existing;
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const state: InMemoryPgState = {
    db,
    adapter: db.adapters.createPg(),
    transactionBackup: null,
    authSchemaReady: false,
    businessSchemaReady: new Set<string>(),
  };
  stateByConnectionString.set(connectionString, state);
  return state;
}

export function isInMemoryPostgresUrl(connectionString: string | null | undefined) {
  const normalized = String(connectionString || '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  if (
    normalized.includes('supabase-test-host') ||
    normalized.includes('sync-test-host') ||
    normalized.includes('runtime-test-host') ||
    normalized.includes('auth-test-host') ||
    normalized.includes('fake-host')
  ) {
    return true;
  }
  if (String(process.env.NOVA_USE_IN_MEMORY_POSTGRES || '') === '1') return true;
  if (process.env.NODE_ENV !== 'test') return false;
  return false;
}

export function createPgPool(connectionString: string, config: PoolConfig) {
  if (!isInMemoryPostgresUrl(connectionString)) {
    return new NodePgPool(config);
  }
  const state = getOrCreateState(connectionString);
  const PoolCtor = state.adapter.Pool;
  return new PoolCtor();
}

export function ensureInMemoryBusinessSchema(connectionString: string, schema: string) {
  if (!isInMemoryPostgresUrl(connectionString)) return;
  const state = getOrCreateState(connectionString);
  if (!state.authSchemaReady) {
    for (const statement of buildInMemoryAuthBootstrapSql()) {
      state.db.public.none(statement);
    }
    state.authSchemaReady = true;
  }
  if (state.businessSchemaReady.has(schema)) return;
  const usePublicSchema = schema === 'public';
  if (!usePublicSchema) {
    state.db.public.none(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)}`);
  }
  const qualifyTable = (table: string) =>
    table.startsWith('auth_') || usePublicSchema
      ? quoteIdentifier(table)
      : `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  for (const statement of buildBusinessBootstrapSql().map((sql) =>
    sql
      .replace(
        /CREATE TABLE IF NOT EXISTS ([a-zA-Z_][a-zA-Z0-9_]*)/g,
        (_match, table) => `CREATE TABLE IF NOT EXISTS ${qualifyTable(table)}`,
      )
      .replace(
        /CREATE\s+(UNIQUE\s+)?INDEX IF NOT EXISTS ([a-zA-Z_][a-zA-Z0-9_]*)\s+ON\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
        (_match, uniquePrefix = '', indexName, table) =>
          `CREATE ${uniquePrefix || ''}INDEX IF NOT EXISTS ${quoteIdentifier(indexName)} ON ${qualifyTable(table)}`,
      )
      .replace(
        /REFERENCES ([a-zA-Z_][a-zA-Z0-9_]*)\(/g,
        (_match, table) => `REFERENCES ${qualifyTable(table)}(`,
      ),
  )) {
    if (/^CREATE TABLE IF NOT EXISTS "?auth_/i.test(statement)) continue;
    if (/^CREATE (UNIQUE )?INDEX IF NOT EXISTS "?idx_auth_/i.test(statement)) continue;
    state.db.public.none(statement);
  }
  state.businessSchemaReady.add(schema);
}

export function queryInMemoryPostgresSync(
  connectionString: string,
  sql: string,
  params: unknown[] = [],
) {
  const state = getOrCreateState(connectionString);
  const normalizedSql = normalizeInMemoryQuery(interpolatePgParams(sql, params));
  if (!normalizedSql) {
    return {
      rows: [],
      rowCount: 0,
      command: 'ALTER',
    };
  }
  const result = state.db.public.query(normalizedSql);
  return {
    rows: result.rows as Record<string, unknown>[],
    rowCount: Number(result.rowCount || 0),
    command: String(result.command || ''),
  };
}

export function beginInMemoryPostgresTransaction(connectionString: string) {
  const state = getOrCreateState(connectionString);
  if (state.transactionBackup) {
    throw new Error('POSTGRES_SYNC_TRANSACTION_ALREADY_OPEN');
  }
  state.transactionBackup = state.db.backup();
  return {
    rows: [],
    rowCount: 0,
    command: 'BEGIN',
  };
}

export function commitInMemoryPostgresTransaction(connectionString: string) {
  const state = getOrCreateState(connectionString);
  if (!state.transactionBackup) {
    throw new Error('POSTGRES_SYNC_TRANSACTION_NOT_OPEN');
  }
  state.transactionBackup = null;
  return {
    rows: [],
    rowCount: 0,
    command: 'COMMIT',
  };
}

export function rollbackInMemoryPostgresTransaction(connectionString: string) {
  const state = getOrCreateState(connectionString);
  if (!state.transactionBackup) {
    throw new Error('POSTGRES_SYNC_TRANSACTION_NOT_OPEN');
  }
  state.transactionBackup.restore();
  state.transactionBackup = null;
  return {
    rows: [],
    rowCount: 0,
    command: 'ROLLBACK',
  };
}

export function resetInMemoryPostgresForTesting(connectionString?: string) {
  if (connectionString) {
    stateByConnectionString.delete(connectionString);
    return;
  }
  stateByConnectionString.clear();
}

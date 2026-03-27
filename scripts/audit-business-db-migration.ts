import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getConfig } from '../src/server/config.js';
import { closeDb, getDb } from '../src/server/db/database.js';
import {
  listSqliteTableSpecs,
  resolvePostgresBusinessUrl,
} from '../src/server/db/postgresMigration.js';

dotenv.config();
process.env.NOVA_DISABLE_SQLITE_PROCESS_LOCK = process.env.NOVA_DISABLE_SQLITE_PROCESS_LOCK || '1';

function parseArgs(argv: string[]) {
  return {
    includeAuth: argv.includes('--include-auth'),
  };
}

function resolveBusinessUrlSource() {
  if (process.env.NOVA_DATA_DATABASE_URL) return 'NOVA_DATA_DATABASE_URL';
  if (process.env.SUPABASE_DB_URL) return 'SUPABASE_DB_URL';
  if (process.env.DATABASE_URL) return 'DATABASE_URL';
  if (process.env.NOVA_AUTH_DATABASE_URL) return 'NOVA_AUTH_DATABASE_URL (auth fallback)';
  return null;
}

function shouldUseSsl(connectionString: string) {
  return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
}

function quoteIdentifier(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  const tables = listSqliteTableSpecs(db, {
    includeAuth: args.includeAuth,
  });
  const businessUrl = resolvePostgresBusinessUrl();
  const businessUrlSource = resolveBusinessUrlSource();
  const businessSchema = String(process.env.NOVA_DATA_PG_SCHEMA || 'novaquant_data').trim();
  const config = getConfig();
  const largestTables = [...tables]
    .sort((left, right) => right.rowCount - left.rowCount)
    .slice(0, 12)
    .map((table) => ({
      name: table.name,
      rowCount: table.rowCount,
      columnCount: table.columns.length,
      primaryKey: table.primaryKey,
    }));

  const blockers: string[] = [];
  if (!process.env.NOVA_DATA_DATABASE_URL) {
    blockers.push(
      'NOVA_DATA_DATABASE_URL is not explicitly configured; business Postgres falls back to auth/database URL resolution.',
    );
  }
  if (config.database.driver === 'sqlite') {
    blockers.push('Business AppConfig still boots with database.driver = sqlite.');
  }
  blockers.push(
    'Business runtime still uses synchronous better-sqlite3 MarketRepository for core reads/writes.',
  );
  blockers.push(
    'Schema and repository still contain SQLite-specific DDL/query logic that must be ported before a true Supabase-only cutover.',
  );

  let postgresAudit: Record<string, unknown> = {
    configured: Boolean(businessUrl),
    url_source: businessUrlSource,
    schema: businessSchema,
  };

  if (businessUrl) {
    const pool = new Pool({
      connectionString: businessUrl,
      max: Math.max(1, Number(process.env.NOVA_DATA_PG_POOL_MAX || 3)),
      ssl: shouldUseSsl(businessUrl) ? { rejectUnauthorized: false } : undefined,
    });

    try {
      const schemaResult = await pool.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [businessSchema],
      );
      const remoteTableRows = await pool.query(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `,
        [businessSchema],
      );
      const remoteTableNames = new Set(
        remoteTableRows.rows.map((row) => String(row.table_name || '')).filter(Boolean),
      );
      const mismatches: Array<{
        table: string;
        sqlite_row_count: number;
        postgres_row_count: number | null;
        delta: number | null;
        status: 'match' | 'missing_in_postgres' | 'postgres_ahead' | 'postgres_behind';
      }> = [];

      for (const table of tables) {
        if (!remoteTableNames.has(table.name)) {
          mismatches.push({
            table: table.name,
            sqlite_row_count: table.rowCount,
            postgres_row_count: null,
            delta: null,
            status: 'missing_in_postgres',
          });
          continue;
        }

        const countResult = await pool.query(
          `SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier(businessSchema)}.${quoteIdentifier(
            table.name,
          )}`,
        );
        const postgresRowCount = Number(countResult.rows[0]?.count || 0);
        const delta = postgresRowCount - table.rowCount;
        if (delta !== 0) {
          mismatches.push({
            table: table.name,
            sqlite_row_count: table.rowCount,
            postgres_row_count: postgresRowCount,
            delta,
            status: delta > 0 ? 'postgres_ahead' : 'postgres_behind',
          });
        }
      }

      const extraRemoteTables = [...remoteTableNames].filter(
        (tableName) => !tables.some((table) => table.name === tableName),
      );

      postgresAudit = {
        ...postgresAudit,
        schema_exists: Number(schemaResult.rowCount || 0) > 0,
        remote_table_count: remoteTableNames.size,
        remote_extra_tables: extraRemoteTables,
        exact_match: mismatches.length === 0,
        mismatched_tables: mismatches.length,
        mismatch_summary: {
          missing_in_postgres: mismatches.filter((row) => row.status === 'missing_in_postgres')
            .length,
          postgres_ahead: mismatches.filter((row) => row.status === 'postgres_ahead').length,
          postgres_behind: mismatches.filter((row) => row.status === 'postgres_behind').length,
        },
        mismatch_samples: mismatches
          .sort((left, right) => Math.abs((right.delta || 0) as number) - Math.abs(left.delta || 0))
          .slice(0, 20),
      };
    } finally {
      await pool.end();
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        runtimeDriver: config.database.driver,
        tableCount: tables.length,
        totalRows: tables.reduce((sum, table) => sum + table.rowCount, 0),
        largestTables,
        postgresAudit,
        blockers,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (error) {
  console.error(String((error as Error)?.stack || error));
  process.exitCode = 1;
} finally {
  closeDb();
}

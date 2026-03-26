import dotenv from 'dotenv';
import { Pool } from 'pg';
import { closeDb, getDb } from '../src/server/db/database.js';
import {
  buildCreateIndexSql,
  buildCreateTableSql,
  buildInsertSql,
  listSqliteTableSpecs,
  qualifyPgTable,
  recommendedBatchSize,
  resolvePostgresBusinessUrl,
} from '../src/server/db/postgresMigration.js';

dotenv.config();
process.env.NOVA_DISABLE_SQLITE_PROCESS_LOCK = process.env.NOVA_DISABLE_SQLITE_PROCESS_LOCK || '1';

type MigrationOptions = {
  schema: string;
  includeAuth: boolean;
  replace: boolean;
  skipIndexes: boolean;
  batchSize: number;
  tables: Set<string> | null;
};

function parseArgs(argv: string[]): MigrationOptions {
  const inline = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--') || !token.includes('=')) continue;
    const [key, value] = token.slice(2).split('=');
    inline.set(key, value);
  }
  const tableList = inline.get('tables')
    ? new Set(
        String(inline.get('tables') || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      )
    : null;

  return {
    schema: String(inline.get('schema') || process.env.NOVA_DATA_PG_SCHEMA || 'novaquant_data').trim(),
    includeAuth: argv.includes('--include-auth'),
    replace: argv.includes('--replace'),
    skipIndexes: argv.includes('--skip-indexes'),
    batchSize: Math.max(1, Number(inline.get('batch') || process.env.NOVA_DATA_MIGRATION_BATCH_SIZE || 1000)),
    tables: tableList,
  };
}

function flattenBatch(rows: Array<Record<string, unknown>>, columns: string[]) {
  return rows.flatMap((row) => columns.map((column) => row[column] ?? null));
}

async function ensureSchema(pool: Pool, schema: string) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema.replace(/"/g, '""')}"`);
}

async function migrateTable(
  pool: Pool,
  db: ReturnType<typeof getDb>,
  schema: string,
  table: ReturnType<typeof listSqliteTableSpecs>[number],
  options: MigrationOptions,
) {
  const qualifiedTable = qualifyPgTable(schema, table.name);
  console.log(
    JSON.stringify({
      step: 'table_start',
      table: table.name,
      rowCount: table.rowCount,
    }),
  );

  if (options.replace) {
    await pool.query(`DROP TABLE IF EXISTS ${qualifiedTable} CASCADE`);
  }

  await pool.query(buildCreateTableSql(schema, table));
  await pool.query(`TRUNCATE TABLE ${qualifiedTable}`);

  const columns = table.columns.map((column) => column.name);
  const preferredBatch = recommendedBatchSize(columns.length, options.batchSize);
  const iterator = db.prepare(`SELECT * FROM "${table.name.replace(/"/g, '""')}"`).iterate() as Iterable<
    Record<string, unknown>
  >;
  let batch: Array<Record<string, unknown>> = [];
  let inserted = 0;

  for (const row of iterator) {
    batch.push(row);
    if (batch.length < preferredBatch) continue;
    const insertSql = buildInsertSql(schema, table.name, columns, batch.length);
    await pool.query(insertSql, flattenBatch(batch, columns));
    inserted += batch.length;
    console.log(JSON.stringify({ step: 'table_progress', table: table.name, inserted, rowCount: table.rowCount }));
    batch = [];
  }

  if (batch.length) {
    const insertSql = buildInsertSql(schema, table.name, columns, batch.length);
    await pool.query(insertSql, flattenBatch(batch, columns));
    inserted += batch.length;
  }

  if (!options.skipIndexes) {
    for (const index of table.indexes) {
      if (index.origin === 'pk') continue;
      const indexSql = buildCreateIndexSql(schema, table, index);
      if (!indexSql) continue;
      await pool.query(indexSql);
    }
  }

  console.log(
    JSON.stringify({
      step: 'table_done',
      table: table.name,
      inserted,
      rowCount: table.rowCount,
    }),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const connectionString = resolvePostgresBusinessUrl();
  if (!connectionString) {
    throw new Error('POSTGRES_BUSINESS_STORE_NOT_CONFIGURED');
  }

  const db = getDb();
  const tables = listSqliteTableSpecs(db, {
    includeAuth: options.includeAuth,
    tables: options.tables,
  });
  const pool = new Pool({
    connectionString,
    max: Math.max(1, Number(process.env.NOVA_DATA_PG_POOL_MAX || 3)),
    ssl: /(localhost|127\.0\.0\.1)/i.test(connectionString)
      ? undefined
      : {
          rejectUnauthorized: false,
        },
  });

  try {
    await pool.query('SET statement_timeout TO 0');
    await ensureSchema(pool, options.schema);
    for (const table of tables) {
      await migrateTable(pool, db, options.schema, table, options);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          schema: options.schema,
          tables: tables.length,
          totalRows: tables.reduce((sum, table) => sum + table.rowCount, 0),
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main()
  .catch((error) => {
    console.error(String((error as Error)?.stack || error));
    process.exitCode = 1;
  })
  .finally(() => {
    closeDb();
  });

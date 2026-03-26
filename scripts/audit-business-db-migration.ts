import dotenv from 'dotenv';
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  const tables = listSqliteTableSpecs(db, {
    includeAuth: args.includeAuth,
  });
  const largestTables = [...tables]
    .sort((left, right) => right.rowCount - left.rowCount)
    .slice(0, 12)
    .map((table) => ({
      name: table.name,
      rowCount: table.rowCount,
      columnCount: table.columns.length,
      primaryKey: table.primaryKey,
    }));

  console.log(
    JSON.stringify(
      {
        ok: true,
        postgresTargetConfigured: Boolean(resolvePostgresBusinessUrl()),
        tableCount: tables.length,
        totalRows: tables.reduce((sum, table) => sum + table.rowCount, 0),
        largestTables,
        blockers: [
          'Business runtime still uses synchronous better-sqlite3 MarketRepository.',
          'Business AppConfig currently hardcodes database.driver = sqlite.',
          'Schema and repository still contain SQLite-specific DDL/query logic that needs a runtime port.',
        ],
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(String((error as Error)?.stack || error));
  process.exitCode = 1;
} finally {
  closeDb();
}

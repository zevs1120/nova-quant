import type Database from 'better-sqlite3';

export type SqliteColumnSpec = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

export type SqliteIndexSpec = {
  name: string;
  unique: boolean;
  origin: string;
  partial: boolean;
  columns: string[];
};

export type SqliteTableSpec = {
  name: string;
  rowCount: number;
  columns: SqliteColumnSpec[];
  primaryKey: string[];
  indexes: SqliteIndexSpec[];
};

type TableFilterOptions = {
  includeAuth?: boolean;
  tables?: Set<string> | null;
};

function quoteSqliteIdentifier(identifier: string) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

export function quotePgIdentifier(identifier: string) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

export function qualifyPgTable(schema: string, table: string) {
  return `${quotePgIdentifier(schema)}.${quotePgIdentifier(table)}`;
}

export function resolvePostgresBusinessUrl() {
  return String(
    process.env.NOVA_DATA_DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.DATABASE_URL ||
      process.env.NOVA_AUTH_DATABASE_URL ||
      '',
  ).trim();
}

export function shouldIncludeBusinessTable(tableName: string, options: TableFilterOptions = {}) {
  if (!tableName || tableName.startsWith('sqlite_')) return false;
  if (!options.includeAuth && tableName.startsWith('auth_')) return false;
  if (options.tables && !options.tables.has(tableName)) return false;
  return true;
}

export function mapSqliteTypeToPostgres(type: string) {
  const normalized = String(type || '')
    .trim()
    .toUpperCase();
  if (normalized.includes('INT')) return 'BIGINT';
  if (normalized.includes('REAL') || normalized.includes('FLOA') || normalized.includes('DOUB')) {
    return 'DOUBLE PRECISION';
  }
  if (normalized.includes('BLOB')) return 'BYTEA';
  return 'TEXT';
}

export function listSqliteTableSpecs(
  db: Database.Database,
  options: TableFilterOptions = {},
): SqliteTableSpec[] {
  const tables = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `,
    )
    .all() as Array<{ name: string }>;

  return tables
    .map((row) => row.name)
    .filter((name) => shouldIncludeBusinessTable(name, options))
    .map((name) => {
      const columns = db
        .prepare(`PRAGMA table_info(${quoteSqliteIdentifier(name)})`)
        .all() as SqliteColumnSpec[];
      const indexRows = db
        .prepare(`PRAGMA index_list(${quoteSqliteIdentifier(name)})`)
        .all() as Array<{
        name: string;
        unique: number;
        origin: string;
        partial: number;
      }>;

      const indexes = indexRows.map((indexRow) => {
        const columnsForIndex = db
          .prepare(`PRAGMA index_info(${quoteSqliteIdentifier(indexRow.name)})`)
          .all() as Array<{ name: string | null }>;
        return {
          name: indexRow.name,
          unique: Boolean(indexRow.unique),
          origin: String(indexRow.origin || ''),
          partial: Boolean(indexRow.partial),
          columns: columnsForIndex.map((column) => String(column.name || '')).filter(Boolean),
        };
      });

      const rowCount = Number(
        (
          db.prepare(`SELECT COUNT(*) AS count FROM ${quoteSqliteIdentifier(name)}`).get() as {
            count: number;
          }
        )?.count || 0,
      );

      return {
        name,
        rowCount,
        columns,
        primaryKey: [...columns]
          .filter((column) => Number(column.pk) > 0)
          .sort((left, right) => Number(left.pk) - Number(right.pk))
          .map((column) => column.name),
        indexes: indexes.filter((index) => !index.partial && index.columns.length > 0),
      };
    });
}

export function buildCreateTableSql(schema: string, table: SqliteTableSpec) {
  const columnSql = table.columns.map((column) => {
    const fragments = [
      `${quotePgIdentifier(column.name)} ${mapSqliteTypeToPostgres(column.type)}`,
      column.notnull ? 'NOT NULL' : '',
    ].filter(Boolean);
    return fragments.join(' ');
  });
  const constraints = table.primaryKey.length
    ? [`PRIMARY KEY (${table.primaryKey.map(quotePgIdentifier).join(', ')})`]
    : [];
  const body = [...columnSql, ...constraints].join(',\n  ');
  return `CREATE TABLE IF NOT EXISTS ${qualifyPgTable(schema, table.name)} (\n  ${body}\n);`;
}

export function buildCreateIndexSql(schema: string, table: SqliteTableSpec, index: SqliteIndexSpec) {
  if (!index.columns.length) return null;
  const indexName = `${table.name}_${index.name}`;
  const uniqueSql = index.unique ? 'UNIQUE ' : '';
  return `CREATE ${uniqueSql}INDEX IF NOT EXISTS ${quotePgIdentifier(indexName)} ON ${qualifyPgTable(
    schema,
    table.name,
  )} (${index.columns.map(quotePgIdentifier).join(', ')});`;
}

export function buildInsertSql(schema: string, tableName: string, columns: string[], rowCount: number) {
  const qualifiedTable = qualifyPgTable(schema, tableName);
  const columnSql = columns.map(quotePgIdentifier).join(', ');
  const values: string[] = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const placeholders = columns.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`);
    values.push(`(${placeholders.join(', ')})`);
  }
  return `INSERT INTO ${qualifiedTable} (${columnSql}) VALUES ${values.join(', ')}`;
}

export function recommendedBatchSize(columnCount: number, preferred = 1000) {
  const safeParameterBudget = 60000;
  const boundedColumnCount = Math.max(1, columnCount);
  return Math.max(1, Math.min(preferred, Math.floor(safeParameterBudget / boundedColumnCount)));
}

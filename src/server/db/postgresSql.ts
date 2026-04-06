export function quotePgIdentifier(identifier: string) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

export function qualifyPgTable(schema: string, table: string) {
  return `${quotePgIdentifier(schema)}.${quotePgIdentifier(table)}`;
}

export function resolvePostgresBusinessUrl() {
  const url = String(
    process.env.NOVA_DATA_DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.DATABASE_URL ||
      process.env.NOVA_AUTH_DATABASE_URL ||
      '',
  ).trim();

  if (url) return url;

  const isVitestRuntime =
    Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID) ||
    process.env.NODE_ENV === 'test' ||
    process.argv.some((arg) => arg.toLowerCase().includes('vitest'));

  if (isVitestRuntime) return 'postgres://supabase-test-host/db';

  // In production, we must have at least one of these defined
  if (process.env.NODE_ENV === 'production') {
    const missing = [
      'NOVA_DATA_DATABASE_URL',
      'SUPABASE_DB_URL',
      'DATABASE_URL',
      'NOVA_AUTH_DATABASE_URL',
    ].join(', ');
    throw new Error(
      `CRITICAL_ENV_MISSING: At least one of the following business database variables is required: [${missing}]. Local database runtimes are removed in this architecture.`,
    );
  }

  return '';
}

export function buildInsertSql(
  schema: string,
  tableName: string,
  columns: string[],
  rowCount: number,
) {
  const qualifiedTable = qualifyPgTable(schema, tableName);
  const columnSql = columns.map(quotePgIdentifier).join(', ');
  const values: string[] = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const placeholders = columns.map(
      (_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`,
    );
    values.push(`(${placeholders.join(', ')})`);
  }
  return `INSERT INTO ${qualifiedTable} (${columnSql}) VALUES ${values.join(', ')}`;
}

export function recommendedBatchSize(columnCount: number, preferred = 1000) {
  const safeParameterBudget = 60000;
  const boundedColumnCount = Math.max(1, columnCount);
  return Math.max(1, Math.min(preferred, Math.floor(safeParameterBudget / boundedColumnCount)));
}

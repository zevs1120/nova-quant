import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .reduce((acc, line) => {
      const eqIndex = line.indexOf('=');
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

function resolveConnectionString(env) {
  const raw =
    process.env.NOVA_DATA_DATABASE_URL ||
    env.NOVA_DATA_DATABASE_URL ||
    process.env.NOVA_AUTH_DATABASE_URL ||
    env.NOVA_AUTH_DATABASE_URL ||
    '';
  if (!raw) {
    throw new Error('NOVA_DATA_DATABASE_URL is not configured.');
  }
  const url = new URL(raw);
  if (url.port === '6543') {
    url.port = '5432';
  }
  return url.toString();
}

async function queryJson(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function logTopTableSizes(client, label) {
  const rows = await queryJson(
    client,
    `
      select
        c.relname as table_name,
        pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
        pg_total_relation_size(c.oid) as total_bytes
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'novaquant_data' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc
      limit 10
    `,
  );
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(rows, null, 2));
}

async function main() {
  const env = loadEnvFile(ENV_PATH);
  const connectionString = resolveConnectionString(env);
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 0,
    query_timeout: 0,
  });

  const now = Date.now();
  const cutoffs = {
    ohlcv5m: now - 180 * DAY_MS,
    ohlcv1h: now - 365 * DAY_MS,
    ohlcv1d: now - 3650 * DAY_MS,
    taskRunsSuccess: now - 14 * DAY_MS,
    taskRunsFailure: now - 3 * DAY_MS,
    ingestAnomalies: now - 30 * DAY_MS,
  };

  await client.connect();
  await client.query('SET statement_timeout TO 0');
  await client.query('SET lock_timeout TO 0');

  await logTopTableSizes(client, 'Before cleanup');

  console.log('\nDeleting noisy Nova wrap-up task runs...');
  const deletedWrapUps = await client.query(
    `
      DELETE FROM novaquant_data.nova_task_runs
      WHERE task_type = 'daily_wrap_up_generation'
    `,
  );
  console.log(`Deleted ${deletedWrapUps.rowCount || 0} daily_wrap_up_generation rows.`);

  console.log('\nDeleting old non-wrap-up Nova task runs...');
  const deletedOldRuns = await client.query(
    `
      DELETE FROM novaquant_data.nova_task_runs
      WHERE task_type <> 'daily_wrap_up_generation'
        AND (
          (status IN ('FAILED', 'SKIPPED') AND created_at_ms < $1)
          OR created_at_ms < $2
        )
    `,
    [cutoffs.taskRunsFailure, cutoffs.taskRunsSuccess],
  );
  console.log(`Deleted ${deletedOldRuns.rowCount || 0} older Nova task run rows.`);

  console.log('\nDeleting old OHLCV mirror history...');
  const deleted5m = await client.query(
    `
      DELETE FROM novaquant_data.ohlcv
      WHERE timeframe = '5m' AND ts_open < $1
    `,
    [cutoffs.ohlcv5m],
  );
  const deleted1h = await client.query(
    `
      DELETE FROM novaquant_data.ohlcv
      WHERE timeframe = '1h' AND ts_open < $1
    `,
    [cutoffs.ohlcv1h],
  );
  const deleted1d = await client.query(
    `
      DELETE FROM novaquant_data.ohlcv
      WHERE timeframe = '1d' AND ts_open < $1
    `,
    [cutoffs.ohlcv1d],
  );
  console.log(
    `Deleted ${deleted5m.rowCount || 0} 5m rows, ${deleted1h.rowCount || 0} 1h rows, ${deleted1d.rowCount || 0} 1d rows.`,
  );

  console.log('\nDeleting old ingest anomalies...');
  const deletedAnomalies = await client.query(
    `
      DELETE FROM novaquant_data.ingest_anomalies
      WHERE created_at < $1
    `,
    [cutoffs.ingestAnomalies],
  );
  console.log(`Deleted ${deletedAnomalies.rowCount || 0} ingest anomaly rows.`);

  console.log('\nRunning VACUUM FULL ANALYZE on reclaimed tables...');
  for (const table of [
    'novaquant_data.nova_task_runs',
    'novaquant_data.ohlcv',
    'novaquant_data.ingest_anomalies',
  ]) {
    console.log(`Vacuuming ${table} ...`);
    await client.query(`VACUUM FULL ANALYZE ${table}`);
  }

  await logTopTableSizes(client, 'After cleanup');
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

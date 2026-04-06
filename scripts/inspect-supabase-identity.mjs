/**
 * Read-only diagnostics for identity/serial columns before fix_postgres_identity.sql
 * Usage: NOVA_DATA_DATABASE_URL=... node scripts/inspect-supabase-identity.mjs
 */
import pkg from 'pg';

const { Client } = pkg;

const dbUrl = process.env.NOVA_DATA_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Set NOVA_DATA_DATABASE_URL or DATABASE_URL');
  process.exit(1);
}

const targets = [
  ['assets', 'asset_id'],
  ['ingest_anomalies', 'id'],
  ['chat_audit_logs', 'id'],
  ['chat_messages', 'id'],
  ['signal_events', 'id'],
  ['signal_deliveries', 'id'],
  ['backtest_metrics', 'id'],
  ['backtest_artifacts', 'id'],
  ['audit_events', 'id'],
];

async function run() {
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connected. Read-only inspection.\n');

  const { rows: ver } = await client.query(`SELECT version(), current_database() AS db`);
  console.log('Database:', ver[0].db);
  console.log('Version:', ver[0].version.split(' ').slice(0, 2).join(' '));

  const { rows: paths } = await client.query(`SHOW search_path`);
  console.log('Session search_path (before set):', paths[0].search_path);

  const { rows: schemas } = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_name IN (${targets.map((t) => `'${t[0]}'`).join(', ')})
    ORDER BY table_schema, table_name;
  `);
  console.log('\n--- Tables matching names (any schema) ---');
  console.table(schemas);

  const { rows: cols } = await client.query(
    `
    SELECT table_schema, table_name, column_name, data_type,
      is_identity, identity_generation,
      column_default
    FROM information_schema.columns
    WHERE table_name = ANY($1::text[])
      AND column_name = ANY($2::text[])
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name, column_name;
  `,
    [[...new Set(targets.map((t) => t[0]))], [...new Set(targets.map((t) => t[1]))]],
  );
  console.log('\n--- Column metadata ---');
  for (const r of cols) {
    console.log(
      `${r.table_schema}.${r.table_name}.${r.column_name} | ${r.data_type} | identity=${r.is_identity} ${r.identity_generation || ''} | default=${r.column_default ? 'yes' : 'no'}`,
    );
  }

  await client.query(`SET search_path TO novaquant_data, public`);
  console.log('\n--- After SET search_path TO novaquant_data, public ---');

  for (const [t, c] of targets) {
    const fq = `novaquant_data.${t}`;
    const exists = await client.query(`SELECT to_regclass($1) AS reg`, [`${fq}`]);
    const reg = exists.rows[0].reg;
    if (!reg) {
      console.log(`${fq}: MISSING`);
      continue;
    }
    const seq = await client.query(`SELECT pg_get_serial_sequence($1, $2) AS seq`, [fq, c]);
    const maxQ = await client.query(`SELECT COALESCE(MAX("${c}"::bigint), 0) AS m FROM ${fq}`);
    console.log(
      `${fq}.${c} | max=${maxQ.rows[0].m} | serial_sequence=${seq.rows[0].seq || '(none)'}`,
    );
  }

  await client.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

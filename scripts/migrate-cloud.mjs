import pkg from 'pg';
const { Client } = pkg;
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';

// Load environment variables
dotenv.config();

const dbUrl = process.env.NOVA_DATA_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('Error: NOVA_DATA_DATABASE_URL or DATABASE_URL not found in .env');
  process.exit(1);
}

async function run() {
  console.log('Connecting to cloud database...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false, // Common for Supabase/Heroku/AWS
    },
  });

  try {
    await client.connect();
    console.log('Connected successfully.');

    const sqlPath = path.join(process.cwd(), 'docs/sql/fix_postgres_identity.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing migration script...');
    await client.query(sql);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    if (err.message.includes('ENOTFOUND')) {
      console.error(
        'Hint: The database hostname could not be resolved. Please check your internet connection or the DB URL.',
      );
    }
  } finally {
    await client.end();
  }
}

run();

import { workerData } from 'node:worker_threads';
import { Pool, types } from 'pg';

const INT8_OID = 20;
const NUMERIC_OID = 1700;

types.setTypeParser(INT8_OID, (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
});

types.setTypeParser(NUMERIC_OID, (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
});

function shouldUseSsl(connectionString) {
  if (
    String(process.env.NOVA_DATA_PG_SSL || '')
      .trim()
      .toLowerCase() === 'disable'
  ) {
    return false;
  }
  return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
}

const channel = workerData?.channel;
const connectionString = String(
  process.env.NOVA_DATA_DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.NOVA_AUTH_DATABASE_URL ||
    '',
).trim();

if (!channel) {
  throw new Error('POSTGRES_SYNC_WORKER_MISSING_CHANNEL');
}

if (!connectionString) {
  throw new Error('POSTGRES_SYNC_WORKER_MISSING_DATABASE_URL');
}

const pool = new Pool({
  connectionString,
  max: Math.max(1, Number(process.env.NOVA_DATA_PG_POOL_MAX || 3)),
  connectionTimeoutMillis: Math.max(
    500,
    Number(process.env.NOVA_DATA_PG_CONNECT_TIMEOUT_MS || 1_200),
  ),
  idleTimeoutMillis: Math.max(1_000, Number(process.env.NOVA_DATA_PG_IDLE_TIMEOUT_MS || 10_000)),
  // Supabase poolers can spuriously trip pg's client-side query_timeout on pooled reads.
  statement_timeout: Math.max(1_000, Number(process.env.NOVA_DATA_PG_QUERY_TIMEOUT_MS || 8_000)),
  ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
});

let transactionClient = null;

async function withQueryTarget(callback) {
  if (transactionClient) {
    return await callback(transactionClient);
  }
  return await callback(pool);
}

channel.on('message', async (message) => {
  if (!message || typeof message !== 'object') return;
  const { id, kind, sql, params } = message;
  if (!id) return;

  if (kind === 'close') {
    try {
      if (transactionClient) {
        try {
          await transactionClient.query('ROLLBACK');
        } finally {
          transactionClient.release();
          transactionClient = null;
        }
      }
      await pool.end();
      channel.postMessage({ id, ok: true, result: { rows: [], rowCount: 0, command: 'CLOSE' } });
    } catch (error) {
      channel.postMessage({
        id,
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    return;
  }

  if (kind === 'tx_begin') {
    try {
      if (transactionClient) {
        throw new Error('POSTGRES_SYNC_TRANSACTION_ALREADY_OPEN');
      }
      transactionClient = await pool.connect();
      await transactionClient.query('BEGIN');
      channel.postMessage({ id, ok: true, result: { rows: [], rowCount: 0, command: 'BEGIN' } });
    } catch (error) {
      if (transactionClient) {
        try {
          transactionClient.release();
        } catch {
          // ignore best-effort release failures
        }
        transactionClient = null;
      }
      channel.postMessage({
        id,
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code:
            error && typeof error === 'object' && 'code' in error
              ? String(error.code || '')
              : undefined,
        },
      });
    }
    return;
  }

  if (kind === 'tx_commit' || kind === 'tx_rollback') {
    try {
      if (!transactionClient) {
        throw new Error('POSTGRES_SYNC_TRANSACTION_NOT_OPEN');
      }
      await transactionClient.query(kind === 'tx_commit' ? 'COMMIT' : 'ROLLBACK');
      transactionClient.release();
      transactionClient = null;
      channel.postMessage({
        id,
        ok: true,
        result: { rows: [], rowCount: 0, command: kind === 'tx_commit' ? 'COMMIT' : 'ROLLBACK' },
      });
    } catch (error) {
      if (transactionClient) {
        try {
          transactionClient.release();
        } catch {
          // ignore best-effort release failures
        }
        transactionClient = null;
      }
      channel.postMessage({
        id,
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code:
            error && typeof error === 'object' && 'code' in error
              ? String(error.code || '')
              : undefined,
        },
      });
    }
    return;
  }

  if (kind !== 'query') {
    channel.postMessage({
      id,
      ok: false,
      error: {
        message: `POSTGRES_SYNC_WORKER_UNSUPPORTED_KIND:${String(kind)}`,
      },
    });
    return;
  }

  try {
    const result = await withQueryTarget((client) =>
      client.query(String(sql || ''), Array.isArray(params) ? params : []),
    );
    channel.postMessage({
      id,
      ok: true,
      result: {
        rows: result.rows,
        rowCount: Number(result.rowCount || 0),
        command: String(result.command || ''),
      },
    });
  } catch (error) {
    channel.postMessage({
      id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        code:
          error && typeof error === 'object' && 'code' in error
            ? String(error.code || '')
            : undefined,
      },
    });
  }
});

channel.start();

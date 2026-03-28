import { MessageChannel, MessagePort, Worker, receiveMessageOnPort } from 'node:worker_threads';
import {
  buildInsertSql,
  qualifyPgTable,
  quotePgIdentifier,
  recommendedBatchSize,
} from './postgresMigration.js';

type WorkerSuccess = {
  id: number;
  ok: true;
  result: {
    rows: Record<string, unknown>[];
    rowCount: number;
    command: string;
  };
};

type WorkerFailure = {
  id: number;
  ok: false;
  error: {
    message: string;
    code?: string;
  };
};

type WorkerResponse = WorkerSuccess | WorkerFailure;

const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
const DEFAULT_TIMEOUT_MS = Math.max(
  2_000,
  Number(process.env.NOVA_DATA_PG_SYNC_TIMEOUT_MS || 20_000),
);

let workerSingleton: Worker | null = null;
let channelSingleton: MessagePort | null = null;
let nextMessageId = 1;
const pendingMessages = new Map<number, WorkerResponse>();

function resolvePostgresBusinessUrl() {
  return String(
    process.env.NOVA_DATA_DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.DATABASE_URL ||
      process.env.NOVA_AUTH_DATABASE_URL ||
      '',
  ).trim();
}

function ensureBridge() {
  if (workerSingleton && channelSingleton) return;
  if (!resolvePostgresBusinessUrl()) {
    throw new Error('POSTGRES_BUSINESS_STORE_NOT_CONFIGURED');
  }

  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL('./postgresSyncWorker.mjs', import.meta.url), {
    workerData: { channel: port2 },
    transferList: [port2],
  });

  worker.on('exit', () => {
    workerSingleton = null;
    channelSingleton = null;
    pendingMessages.clear();
  });

  worker.on('error', (error) => {
    pendingMessages.clear();
    workerSingleton = null;
    channelSingleton = null;
    throw error;
  });

  workerSingleton = worker;
  channelSingleton = port1;
  channelSingleton.start();
}

function waitForResponse(id: number, timeoutMs: number): WorkerResponse {
  const existing = pendingMessages.get(id);
  if (existing) {
    pendingMessages.delete(id);
    return existing;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const message = receiveMessageOnPort(channelSingleton as MessagePort)?.message as
      | WorkerResponse
      | undefined;
    if (!message) {
      Atomics.wait(WAIT_BUFFER, 0, 0, 10);
      continue;
    }
    if (message.id === id) return message;
    pendingMessages.set(message.id, message);
  }

  throw new Error(`POSTGRES_SYNC_QUERY_TIMEOUT:${timeoutMs}`);
}

function dispatchQuery(sql: string, params: unknown[] = [], timeoutMs = DEFAULT_TIMEOUT_MS) {
  ensureBridge();
  const id = nextMessageId++;
  (channelSingleton as MessagePort).postMessage({
    id,
    kind: 'query',
    sql,
    params,
  });
  const response = waitForResponse(id, timeoutMs);
  if (!response.ok) {
    const error = new Error(response.error.message || 'POSTGRES_SYNC_QUERY_FAILED');
    if (response.error.code) {
      (error as Error & { code?: string }).code = response.error.code;
    }
    throw error;
  }
  return response.result;
}

function dispatchCommand(
  kind: 'tx_begin' | 'tx_commit' | 'tx_rollback',
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  ensureBridge();
  const id = nextMessageId++;
  (channelSingleton as MessagePort).postMessage({ id, kind });
  const response = waitForResponse(id, timeoutMs);
  if (!response.ok) {
    const error = new Error(response.error.message || 'POSTGRES_SYNC_COMMAND_FAILED');
    if (response.error.code) {
      (error as Error & { code?: string }).code = response.error.code;
    }
    throw error;
  }
  return response.result;
}

export function queryRowsSync<T>(sql: string, params: unknown[] = [], timeoutMs?: number) {
  return dispatchQuery(sql, params, timeoutMs).rows as T[];
}

export function queryRowSync<T>(sql: string, params: unknown[] = [], timeoutMs?: number) {
  return queryRowsSync<T>(sql, params, timeoutMs)[0] || null;
}

export function executeSync(sql: string, params: unknown[] = [], timeoutMs?: number) {
  return dispatchQuery(sql, params, timeoutMs);
}

export function beginTransactionSync(timeoutMs?: number) {
  return dispatchCommand('tx_begin', timeoutMs);
}

export function commitTransactionSync(timeoutMs?: number) {
  return dispatchCommand('tx_commit', timeoutMs);
}

export function rollbackTransactionSync(timeoutMs?: number) {
  return dispatchCommand('tx_rollback', timeoutMs);
}

export function getPostgresBusinessSchema() {
  return String(process.env.NOVA_DATA_PG_SCHEMA || 'novaquant_data').trim() || 'novaquant_data';
}

export function qualifyBusinessTable(tableName: string) {
  return qualifyPgTable(getPostgresBusinessSchema(), tableName);
}

export function upsertRowsSync<T>(args: {
  table: string;
  columns: string[];
  rows: T[];
  conflictColumns: string[];
  updateColumns?: string[];
}) {
  if (!args.rows.length) return;
  const updates = (args.updateColumns || args.columns).filter(
    (column) => !args.conflictColumns.includes(column),
  );
  const updateSql = updates.length
    ? ` DO UPDATE SET ${updates
        .map((column) => `${quotePgIdentifier(column)} = EXCLUDED.${quotePgIdentifier(column)}`)
        .join(', ')}`
    : ' DO NOTHING';
  const batchSize = recommendedBatchSize(args.columns.length, 200);

  for (let index = 0; index < args.rows.length; index += batchSize) {
    const batch = args.rows.slice(index, index + batchSize);
    const sql =
      `${buildInsertSql(getPostgresBusinessSchema(), args.table, args.columns, batch.length)}` +
      ` ON CONFLICT (${args.conflictColumns.map(quotePgIdentifier).join(', ')})${updateSql}`;
    const params = batch.flatMap((row) =>
      args.columns.map((column) => (row as Record<string, unknown>)[column] ?? null),
    );
    executeSync(sql, params);
  }
}

export function insertRowsSync<T>(args: { table: string; columns: string[]; rows: T[] }) {
  if (!args.rows.length) return;
  const batchSize = recommendedBatchSize(args.columns.length, 200);
  for (let index = 0; index < args.rows.length; index += batchSize) {
    const batch = args.rows.slice(index, index + batchSize);
    const sql = buildInsertSql(getPostgresBusinessSchema(), args.table, args.columns, batch.length);
    const params = batch.flatMap((row) =>
      args.columns.map((column) => (row as Record<string, unknown>)[column] ?? null),
    );
    executeSync(sql, params);
  }
}

export function closePostgresSyncBridge() {
  if (!workerSingleton || !channelSingleton) return;
  const id = nextMessageId++;
  channelSingleton.postMessage({ id, kind: 'close' });
  waitForResponse(id, DEFAULT_TIMEOUT_MS);
  workerSingleton.terminate();
  workerSingleton = null;
  channelSingleton = null;
  pendingMessages.clear();
}

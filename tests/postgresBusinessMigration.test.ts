import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  buildCreateIndexSql,
  buildCreateTableSql,
  listSqliteTableSpecs,
  mapSqliteTypeToPostgres,
  recommendedBatchSize,
} from '../src/server/db/postgresMigration.js';

describe('postgresBusinessMigration', () => {
  it('maps SQLite column types to Postgres types', () => {
    expect(mapSqliteTypeToPostgres('INTEGER')).toBe('BIGINT');
    expect(mapSqliteTypeToPostgres('REAL')).toBe('DOUBLE PRECISION');
    expect(mapSqliteTypeToPostgres('TEXT')).toBe('TEXT');
    expect(mapSqliteTypeToPostgres('BLOB')).toBe('BYTEA');
  });

  it('introspects business tables and excludes auth tables by default', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE assets (
        asset_id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        market TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_assets_symbol_market ON assets(symbol, market);
      CREATE TABLE auth_users (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL
      );
      INSERT INTO assets(symbol, market) VALUES ('BTCUSDT', 'CRYPTO');
    `);

    const tables = listSqliteTableSpecs(db);
    expect(tables.map((table) => table.name)).toEqual(['assets']);
    expect(tables[0]?.rowCount).toBe(1);
    expect(tables[0]?.primaryKey).toEqual(['asset_id']);
    expect(tables[0]?.indexes[0]?.columns).toEqual(['symbol', 'market']);
  });

  it('builds create table and index SQL', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE market_state (
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        snapshot_ts_ms INTEGER NOT NULL,
        payload_json TEXT,
        PRIMARY KEY(market, symbol)
      );
      CREATE INDEX idx_market_state_snapshot ON market_state(snapshot_ts_ms);
    `);

    const table = listSqliteTableSpecs(db, {
      tables: new Set(['market_state']),
    })[0];
    expect(table).toBeTruthy();
    expect(buildCreateTableSql('novaquant_data', table!)).toContain(
      'PRIMARY KEY ("market", "symbol")',
    );
    expect(buildCreateIndexSql('novaquant_data', table!, table!.indexes[0]!)).toContain(
      'CREATE INDEX IF NOT EXISTS',
    );
  });

  it('caps batch size below postgres parameter limits', () => {
    expect(recommendedBatchSize(10, 1000)).toBe(1000);
    expect(recommendedBatchSize(40, 5000)).toBe(1500);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manualGamificationSchemaPatchStatements } from '../src/server/db/schema.js';

describe('manualGamificationSchemaPatchStatements', () => {
  it('emits idempotent ALTERs for legacy manual columns and CREATE TABLEs for new tables', () => {
    const q = (name: string) => `"biz"."${name}"`;
    const stmts = manualGamificationSchemaPatchStatements(q);
    // 7 original + 2 new: singleton unique index + FREE_DAILY slot table
    expect(stmts.length).toBe(9);
    expect(stmts[0]).toBe(
      'ALTER TABLE "biz"."manual_user_state" ADD COLUMN IF NOT EXISTS last_checkin_day TEXT',
    );
    expect(stmts[1]).toBe(
      'ALTER TABLE "biz"."manual_user_state" ADD COLUMN IF NOT EXISTS checkin_streak BIGINT NOT NULL DEFAULT 0',
    );
    expect(stmts[2]).toBe(
      `ALTER TABLE "biz"."manual_prediction_markets" ADD COLUMN IF NOT EXISTS market_kind TEXT NOT NULL DEFAULT 'STANDARD'`,
    );
    expect(stmts[3]).toContain('CREATE TABLE IF NOT EXISTS "biz"."manual_checkins"');
    expect(stmts[3]).toContain('PRIMARY KEY (user_id, day_key)');
    expect(stmts[4]).toContain('CREATE INDEX IF NOT EXISTS idx_manual_checkins_user_recent');
    expect(stmts[5]).toContain('CREATE TABLE IF NOT EXISTS "biz"."manual_main_prediction_daily"');
    expect(stmts[5]).toContain('used_count BIGINT');
    expect(stmts[6]).toContain('CREATE TABLE IF NOT EXISTS "biz"."manual_engagement_daily"');
    // New: singleton unique index for SIGNUP_BONUS / ONBOARDING_BONUS.
    expect(stmts[7]).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_points_ledger_singleton',
    );
    expect(stmts[7]).toContain("event_type IN ('SIGNUP_BONUS', 'ONBOARDING_BONUS')");
    // New: FREE_DAILY slot table for atomic one-per-day enforcement.
    expect(stmts[8]).toContain('CREATE TABLE IF NOT EXISTS "biz"."manual_free_daily_entries"');
    expect(stmts[8]).toContain('PRIMARY KEY (user_id, day_key)');
  });

  it('migration SQL deduplicates singleton bonus rows before rebalancing and indexing', () => {
    const sql = readFileSync(
      new URL('../docs/sql/manual_gamification_existing_db.sql', import.meta.url),
      'utf8',
    );
    const deleteIndex = sql.indexOf('DELETE FROM novaquant_data.manual_points_ledger');
    const rebalanceIndex = sql.indexOf('SUM(points_delta) OVER');
    const uniqueIndex = sql.indexOf(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_points_ledger_singleton',
    );
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(rebalanceIndex).toBeGreaterThan(deleteIndex);
    expect(uniqueIndex).toBeGreaterThan(rebalanceIndex);
    expect(sql).toContain('SET balance_after = recomputed.next_balance_after');
    expect(sql).toContain('ORDER BY created_at_ms ASC, entry_id ASC');
  });
});

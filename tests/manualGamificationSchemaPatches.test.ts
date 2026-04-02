import { describe, expect, it } from 'vitest';
import { manualGamificationSchemaPatchStatements } from '../src/server/db/schema.js';

describe('manualGamificationSchemaPatchStatements', () => {
  it('emits idempotent ALTERs for legacy manual columns', () => {
    const q = (name: string) => `"biz"."${name}"`;
    const stmts = manualGamificationSchemaPatchStatements(q);
    expect(stmts).toEqual([
      'ALTER TABLE "biz"."manual_user_state" ADD COLUMN IF NOT EXISTS last_checkin_day TEXT',
      'ALTER TABLE "biz"."manual_user_state" ADD COLUMN IF NOT EXISTS checkin_streak BIGINT NOT NULL DEFAULT 0',
      `ALTER TABLE "biz"."manual_prediction_markets" ADD COLUMN IF NOT EXISTS market_kind TEXT NOT NULL DEFAULT 'STANDARD'`,
    ]);
  });
});

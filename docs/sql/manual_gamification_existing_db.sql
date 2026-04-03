-- -----------------------------------------------------------------------------
-- Manual points / prediction gamification — patches for **existing** business DBs
-- -----------------------------------------------------------------------------
-- Run in Supabase SQL editor (or psql) against the **business** database.
-- Replace `novaquant_data` if your schema name differs (`NOVA_DATA_PG_SCHEMA`).
--
-- Why: `CREATE TABLE IF NOT EXISTS` in repo bootstrap does not add new columns to
-- old tables. `manual_referrals.status` CHECK may need replacing if an older
-- constraint only allowed legacy values.
-- -----------------------------------------------------------------------------

-- === 1) Columns on existing manual tables ====================================

ALTER TABLE novaquant_data.manual_user_state
  ADD COLUMN IF NOT EXISTS last_checkin_day TEXT;

ALTER TABLE novaquant_data.manual_user_state
  ADD COLUMN IF NOT EXISTS checkin_streak BIGINT NOT NULL DEFAULT 0;

ALTER TABLE novaquant_data.manual_prediction_markets
  ADD COLUMN IF NOT EXISTS market_kind TEXT NOT NULL DEFAULT 'STANDARD';

-- === 2) New tables (safe if already present) ================================

CREATE TABLE IF NOT EXISTS novaquant_data.manual_checkins (
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  PRIMARY KEY (user_id, day_key),
  FOREIGN KEY(user_id) REFERENCES public.auth_users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manual_checkins_user_recent
  ON novaquant_data.manual_checkins(user_id, day_key DESC);

CREATE TABLE IF NOT EXISTS novaquant_data.manual_main_prediction_daily (
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  used_count BIGINT NOT NULL DEFAULT 0,
  updated_at_ms BIGINT NOT NULL,
  PRIMARY KEY (user_id, day_key),
  FOREIGN KEY(user_id) REFERENCES public.auth_users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS novaquant_data.manual_engagement_daily (
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  PRIMARY KEY (user_id, day_key),
  FOREIGN KEY(user_id) REFERENCES public.auth_users(user_id) ON DELETE CASCADE
);

-- === 3) manual_referrals.status CHECK (replace legacy constraint) ============
-- If creation failed with a conflicting constraint name, list checks first:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'novaquant_data.manual_referrals'::regclass AND contype = 'c';

ALTER TABLE novaquant_data.manual_referrals
  DROP CONSTRAINT IF EXISTS manual_referrals_status_check;

ALTER TABLE novaquant_data.manual_referrals
  ADD CONSTRAINT manual_referrals_status_check
  CHECK (status IN ('PARTIAL', 'COMPLETED', 'CANCELLED', 'REWARDED'));

-- === 4) Singleton-event unique index on manual_points_ledger ================
-- STEP 4a: Deduplicate — keep the EARLIEST row per (user_id, event_type) for
-- singleton bonus events.  This handles dirty data written before this patch
-- (when there was no unique constraint).  Must run BEFORE the index creation;
-- any surviving duplicate would cause CREATE UNIQUE INDEX to fail.
-- Safe to run even when no duplicates exist: DELETE affects 0 rows.
DELETE FROM novaquant_data.manual_points_ledger
WHERE event_type IN ('SIGNUP_BONUS', 'ONBOARDING_BONUS')
  AND entry_id NOT IN (
    SELECT DISTINCT ON (user_id, event_type) entry_id
    FROM novaquant_data.manual_points_ledger
    WHERE event_type IN ('SIGNUP_BONUS', 'ONBOARDING_BONUS')
    ORDER BY user_id, event_type, created_at_ms ASC
  );

-- STEP 4b: Recompute running balances after deduplication.
-- `balance_after` is persisted as an audited running balance, not derived at
-- read time. Deleting duplicate singleton bonus rows without rebalancing would
-- leave later ledger rows with stale inflated values.
WITH recomputed AS (
  SELECT
    entry_id,
    SUM(points_delta) OVER (
      PARTITION BY user_id
      ORDER BY created_at_ms ASC, entry_id ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS next_balance_after
  FROM novaquant_data.manual_points_ledger
)
UPDATE novaquant_data.manual_points_ledger AS ledger
SET balance_after = recomputed.next_balance_after
FROM recomputed
WHERE recomputed.entry_id = ledger.entry_id
  AND ledger.balance_after IS DISTINCT FROM recomputed.next_balance_after;

-- STEP 4c: Create the singleton guard index (idempotent).
-- Prevents SIGNUP_BONUS and ONBOARDING_BONUS from being written more than once
-- per user even under concurrent requests (final DB-level atomic barrier).
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_points_ledger_singleton
  ON novaquant_data.manual_points_ledger(user_id, event_type)
  WHERE event_type IN ('SIGNUP_BONUS', 'ONBOARDING_BONUS');

-- === 5) FREE_DAILY prediction slot table ====================================
-- Mirrors the MAIN daily slot pattern to make FREE_DAILY one-per-day atomic.
-- A PK violation on (user_id, day_key) means the user already played today.
CREATE TABLE IF NOT EXISTS novaquant_data.manual_free_daily_entries (
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  PRIMARY KEY (user_id, day_key),
  FOREIGN KEY(user_id) REFERENCES public.auth_users(user_id) ON DELETE CASCADE
);

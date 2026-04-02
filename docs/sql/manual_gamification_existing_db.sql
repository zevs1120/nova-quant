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

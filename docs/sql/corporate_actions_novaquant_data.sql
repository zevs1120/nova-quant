-- Idempotent: corporate_actions for governance / Yahoo sync (free_data_flywheel).
-- Default business schema matches NOVA_DATA_PG_SCHEMA (usually novaquant_data).
-- Note: server also runs CREATE IF NOT EXISTS on PostgresRuntimeRepository startup when
-- NOVA_DATA_DATABASE_URL points at a non–in-memory Postgres.

CREATE SCHEMA IF NOT EXISTS novaquant_data;

CREATE TABLE IF NOT EXISTS novaquant_data.corporate_actions (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  effective_ts BIGINT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('SPLIT', 'DIVIDEND', 'HALT', 'RESUME')),
  split_ratio DOUBLE PRECISION,
  cash_amount DOUBLE PRECISION,
  source TEXT NOT NULL,
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (asset_id, effective_ts, action_type, source),
  FOREIGN KEY (asset_id) REFERENCES novaquant_data.assets (asset_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_corporate_actions_lookup
  ON novaquant_data.corporate_actions (asset_id, effective_ts DESC);

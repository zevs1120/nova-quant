import type Database from 'better-sqlite3';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS assets (
  asset_id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  venue TEXT NOT NULL,
  base TEXT,
  quote TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(symbol, market, venue)
);

CREATE TABLE IF NOT EXISTS ohlcv (
  asset_id INTEGER NOT NULL,
  timeframe TEXT NOT NULL,
  ts_open INTEGER NOT NULL,
  open TEXT NOT NULL,
  high TEXT NOT NULL,
  low TEXT NOT NULL,
  close TEXT NOT NULL,
  volume TEXT NOT NULL,
  source TEXT NOT NULL,
  ingest_at INTEGER NOT NULL,
  PRIMARY KEY(asset_id, timeframe, ts_open),
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_lookup ON ohlcv(asset_id, timeframe, ts_open);

CREATE TABLE IF NOT EXISTS ingest_cursors (
  asset_id INTEGER NOT NULL,
  timeframe TEXT NOT NULL,
  last_ts_open INTEGER NOT NULL,
  source TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(asset_id, timeframe),
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ingest_anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER,
  timeframe TEXT NOT NULL,
  ts_open INTEGER,
  anomaly_type TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS funding_rates (
  asset_id INTEGER NOT NULL,
  ts_open INTEGER NOT NULL,
  funding_rate TEXT NOT NULL,
  source TEXT NOT NULL,
  ingest_at INTEGER NOT NULL,
  PRIMARY KEY(asset_id, ts_open),
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS basis_snapshots (
  asset_id INTEGER NOT NULL,
  ts_open INTEGER NOT NULL,
  basis_bps TEXT NOT NULL,
  source TEXT NOT NULL,
  ingest_at INTEGER NOT NULL,
  PRIMARY KEY(asset_id, ts_open),
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  provider TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT,
  status TEXT NOT NULL,
  error TEXT,
  response_preview TEXT,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signals (
  signal_id TEXT PRIMARY KEY,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO')) DEFAULT 'CRYPTO',
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  strategy_family TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  regime_id TEXT NOT NULL,
  temperature_percentile REAL NOT NULL,
  volatility_percentile REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'FLAT')),
  strength REAL NOT NULL,
  confidence REAL NOT NULL,
  entry_low REAL NOT NULL,
  entry_high REAL NOT NULL,
  entry_method TEXT NOT NULL,
  invalidation_level REAL NOT NULL,
  stop_type TEXT NOT NULL,
  stop_price REAL NOT NULL,
  tp1_price REAL,
  tp1_size_pct REAL,
  tp2_price REAL,
  tp2_size_pct REAL,
  trailing_type TEXT NOT NULL,
  trailing_params_json TEXT NOT NULL,
  position_pct REAL NOT NULL,
  leverage_cap REAL NOT NULL,
  risk_bucket_applied TEXT NOT NULL,
  fee_bps REAL NOT NULL,
  spread_bps REAL NOT NULL,
  slippage_bps REAL NOT NULL,
  funding_est_bps REAL,
  basis_est REAL,
  expected_r REAL NOT NULL,
  hit_rate_est REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  expected_max_dd_est REAL,
  status TEXT NOT NULL CHECK (status IN ('NEW', 'TRIGGERED', 'EXPIRED', 'INVALIDATED', 'CLOSED')),
  score REAL NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signals_lookup ON signals(market, status, score DESC, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_signals_asset_class ON signals(asset_class, market, status, score DESC, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_signals_symbol_tf ON signals(symbol, timeframe, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS signal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signal_events_signal ON signal_events(signal_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS executions (
  execution_id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('PAPER', 'LIVE')),
  action TEXT NOT NULL CHECK (action IN ('EXECUTE', 'DONE', 'CLOSE')),
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  symbol TEXT NOT NULL,
  entry_price REAL,
  stop_price REAL,
  tp_price REAL,
  size_pct REAL,
  pnl_pct REAL,
  note TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_executions_signal ON executions(signal_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_executions_user ON executions(user_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS user_risk_profiles (
  user_id TEXT PRIMARY KEY,
  profile_key TEXT NOT NULL CHECK (profile_key IN ('conservative', 'balanced', 'aggressive')),
  max_loss_per_trade REAL NOT NULL,
  max_daily_loss REAL NOT NULL,
  max_drawdown REAL NOT NULL,
  exposure_cap REAL NOT NULL,
  leverage_cap REAL NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS market_state (
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  snapshot_ts_ms INTEGER NOT NULL,
  regime_id TEXT NOT NULL,
  trend_strength REAL NOT NULL,
  temperature_percentile REAL NOT NULL,
  volatility_percentile REAL NOT NULL,
  risk_off_score REAL NOT NULL,
  stance TEXT NOT NULL,
  event_stats_json TEXT NOT NULL,
  assumptions_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(market, symbol, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_market_state_market ON market_state(market, temperature_percentile DESC);

CREATE TABLE IF NOT EXISTS performance_snapshots (
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  range TEXT NOT NULL,
  segment_type TEXT NOT NULL CHECK (segment_type IN ('OVERALL', 'STRATEGY', 'REGIME', 'DEVIATION')),
  segment_key TEXT NOT NULL,
  source_label TEXT NOT NULL CHECK (source_label IN ('BACKTEST', 'PAPER', 'LIVE', 'MIXED')),
  sample_size INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  asof_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(market, range, segment_type, segment_key)
);

CREATE INDEX IF NOT EXISTS idx_performance_snapshots ON performance_snapshots(market, range, segment_type, sample_size DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  key_id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signal_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  endpoint TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED', 'SKIPPED')),
  detail TEXT,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signal_deliveries_signal ON signal_deliveries(signal_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS external_connections (
  connection_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('BROKER', 'EXCHANGE')),
  provider TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('READ_ONLY', 'TRADING')),
  status TEXT NOT NULL CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'PENDING')),
  meta_json TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_external_connections_user ON external_connections(user_id, connection_type, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS strategy_versions (
  id TEXT PRIMARY KEY,
  strategy_key TEXT NOT NULL,
  family TEXT NOT NULL,
  version TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived', 'challenger', 'champion', 'deprecated', 'retired')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_strategy_versions_key ON strategy_versions(strategy_key, version, status, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  timeframe TEXT NOT NULL,
  source_bundle_hash TEXT NOT NULL,
  coverage_summary_json TEXT NOT NULL,
  freshness_summary_json TEXT NOT NULL,
  notes TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dataset_versions_lookup ON dataset_versions(market, asset_class, timeframe, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_dataset_versions_hash ON dataset_versions(source_bundle_hash, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS universe_snapshots (
  id TEXT PRIMARY KEY,
  dataset_version_id TEXT NOT NULL,
  snapshot_ts_ms INTEGER NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  members_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_universe_snapshots_dataset ON universe_snapshots(dataset_version_id, snapshot_ts_ms DESC);

CREATE TABLE IF NOT EXISTS feature_snapshots (
  id TEXT PRIMARY KEY,
  dataset_version_id TEXT NOT NULL,
  feature_version TEXT NOT NULL,
  snapshot_ts_ms INTEGER NOT NULL,
  feature_hash TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feature_snapshots_dataset ON feature_snapshots(dataset_version_id, snapshot_ts_ms DESC);

CREATE TABLE IF NOT EXISTS execution_profiles (
  id TEXT PRIMARY KEY,
  profile_name TEXT NOT NULL,
  spread_model_json TEXT NOT NULL,
  slippage_model_json TEXT NOT NULL,
  fee_model_json TEXT NOT NULL,
  fill_policy_json TEXT NOT NULL,
  latency_assumption_json TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_execution_profiles_lookup ON execution_profiles(profile_name, version, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL CHECK (run_type IN ('signal_replay', 'portfolio_replay', 'walk_forward', 'paper_reconciliation')),
  strategy_version_id TEXT,
  dataset_version_id TEXT NOT NULL,
  universe_version_id TEXT NOT NULL,
  execution_profile_id TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'WITHHELD', 'FAILED')),
  train_window TEXT,
  validation_window TEXT,
  test_window TEXT,
  notes TEXT,
  FOREIGN KEY(strategy_version_id) REFERENCES strategy_versions(id) ON DELETE SET NULL,
  FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(universe_version_id) REFERENCES universe_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY(execution_profile_id) REFERENCES execution_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_lookup ON backtest_runs(run_type, status, completed_at_ms DESC, started_at_ms DESC);

CREATE TABLE IF NOT EXISTS signal_snapshots (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  strategy_version_id TEXT NOT NULL,
  dataset_version_id TEXT NOT NULL,
  backtest_run_id TEXT NOT NULL,
  snapshot_ts_ms INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO')),
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'FLAT')),
  conviction REAL NOT NULL,
  regime_context_json TEXT NOT NULL,
  entry_logic_json TEXT NOT NULL,
  invalidation_logic_json TEXT NOT NULL,
  source_transparency_json TEXT NOT NULL,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('REPLAY_READY', 'WITHHELD', 'INSUFFICIENT_DATA', 'PARTIAL_DATA', 'EXPERIMENTAL')),
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE,
  FOREIGN KEY(strategy_version_id) REFERENCES strategy_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(backtest_run_id) REFERENCES backtest_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signal_snapshots_lookup ON signal_snapshots(signal_id, backtest_run_id, snapshot_ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_signal_snapshots_symbol ON signal_snapshots(symbol, market, snapshot_ts_ms DESC);

CREATE TABLE IF NOT EXISTS backtest_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_run_id TEXT NOT NULL,
  gross_return REAL,
  net_return REAL,
  sharpe REAL,
  sortino REAL,
  max_drawdown REAL,
  turnover REAL,
  win_rate REAL,
  hit_rate REAL,
  cost_drag REAL,
  sample_size INTEGER NOT NULL,
  withheld_reason TEXT,
  realism_grade TEXT NOT NULL CHECK (realism_grade IN ('A', 'B', 'C', 'D', 'WITHHELD')),
  robustness_grade TEXT NOT NULL CHECK (robustness_grade IN ('A', 'B', 'C', 'D', 'WITHHELD')),
  status TEXT NOT NULL CHECK (status IN ('READY', 'WITHHELD', 'FAILED')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(backtest_run_id) REFERENCES backtest_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_metrics_run ON backtest_metrics(backtest_run_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS backtest_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_run_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  path_or_payload TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(backtest_run_id) REFERENCES backtest_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_artifacts_run ON backtest_artifacts(backtest_run_id, artifact_type, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS replay_paper_reconciliation (
  id TEXT PRIMARY KEY,
  signal_snapshot_id TEXT NOT NULL,
  trade_group_id TEXT NOT NULL,
  replay_run_id TEXT NOT NULL,
  paper_execution_group_id TEXT,
  expected_fill_price REAL,
  paper_fill_price REAL,
  expected_pnl REAL,
  paper_pnl REAL,
  expected_hold_period REAL,
  actual_hold_period REAL,
  slippage_gap REAL,
  attribution_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECONCILED', 'PAPER_DATA_UNAVAILABLE', 'REPLAY_DATA_UNAVAILABLE', 'PARTIAL')),
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(signal_snapshot_id) REFERENCES signal_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY(replay_run_id) REFERENCES backtest_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_run ON replay_paper_reconciliation(replay_run_id, status, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_trade ON replay_paper_reconciliation(trade_group_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS experiment_registry (
  id TEXT PRIMARY KEY,
  backtest_run_id TEXT NOT NULL,
  strategy_version_id TEXT,
  decision_status TEXT NOT NULL CHECK (decision_status IN ('candidate', 'challenger', 'champion', 'hold', 'deprecated', 'retired')),
  promotion_reason TEXT,
  demotion_reason TEXT,
  approved_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(backtest_run_id) REFERENCES backtest_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(strategy_version_id) REFERENCES strategy_versions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_experiment_registry_lookup ON experiment_registry(decision_status, created_at_ms DESC);
`;

export function ensureSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
  try {
    db.prepare('SELECT asset_class FROM signals LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE signals ADD COLUMN asset_class TEXT NOT NULL DEFAULT 'CRYPTO';");
    db.exec(`
      UPDATE signals
      SET asset_class = CASE
        WHEN market = 'CRYPTO' THEN 'CRYPTO'
        ELSE 'US_STOCK'
      END
    `);
  }
}

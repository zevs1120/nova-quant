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
  thread_id TEXT,
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

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  last_context_json TEXT,
  last_message_preview TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_user ON chat_threads(user_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  context_json TEXT,
  provider TEXT,
  status TEXT NOT NULL CHECK (status IN ('READY', 'ERROR')),
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at_ms DESC);

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

CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  symbol TEXT NOT NULL,
  headline TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT,
  published_at_ms INTEGER NOT NULL,
  sentiment_label TEXT NOT NULL CHECK (sentiment_label IN ('POSITIVE', 'NEGATIVE', 'MIXED', 'NEUTRAL')),
  relevance_score REAL NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_news_items_lookup ON news_items(market, symbol, published_at_ms DESC);

CREATE TABLE IF NOT EXISTS fundamental_snapshots (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  symbol TEXT NOT NULL,
  source TEXT NOT NULL,
  asof_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fundamental_snapshots_lookup
  ON fundamental_snapshots(market, symbol, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS option_chain_snapshots (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  symbol TEXT NOT NULL,
  expiration_date TEXT,
  snapshot_ts_ms INTEGER NOT NULL,
  source TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_option_chain_snapshots_lookup
  ON option_chain_snapshots(market, symbol, snapshot_ts_ms DESC);

CREATE TABLE IF NOT EXISTS alpha_candidates (
  id TEXT PRIMARY KEY,
  thesis TEXT NOT NULL,
  family TEXT NOT NULL,
  formula_json TEXT NOT NULL,
  params_json TEXT NOT NULL,
  feature_dependencies_json TEXT NOT NULL,
  regime_constraints_json TEXT NOT NULL,
  compatible_markets_json TEXT NOT NULL,
  holding_period TEXT NOT NULL,
  entry_logic_json TEXT NOT NULL,
  exit_logic_json TEXT NOT NULL,
  sizing_hint_json TEXT NOT NULL,
  integration_path TEXT NOT NULL CHECK (
    integration_path IN ('signal_input', 'confidence_modifier', 'regime_activation_hint', 'portfolio_weight_suggestion')
  ),
  complexity_score REAL NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'BACKTEST_PASS', 'SHADOW', 'CANARY', 'PROD', 'RETIRED', 'REJECTED')),
  parent_alpha_id TEXT,
  acceptance_score REAL,
  last_evaluation_id TEXT,
  last_rejection_reason TEXT,
  last_promotion_reason TEXT,
  metadata_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alpha_candidates_lookup
  ON alpha_candidates(status, acceptance_score DESC, updated_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_alpha_candidates_family
  ON alpha_candidates(family, status, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS alpha_evaluations (
  id TEXT PRIMARY KEY,
  alpha_candidate_id TEXT NOT NULL,
  workflow_run_id TEXT,
  backtest_run_id TEXT,
  evaluation_status TEXT NOT NULL CHECK (evaluation_status IN ('PASS', 'WATCH', 'REJECT')),
  acceptance_score REAL NOT NULL,
  metrics_json TEXT NOT NULL,
  rejection_reasons_json TEXT NOT NULL,
  notes TEXT,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(alpha_candidate_id) REFERENCES alpha_candidates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alpha_evaluations_lookup
  ON alpha_evaluations(alpha_candidate_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS alpha_shadow_observations (
  id TEXT PRIMARY KEY,
  alpha_candidate_id TEXT NOT NULL,
  workflow_run_id TEXT,
  signal_id TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  symbol TEXT NOT NULL,
  shadow_action TEXT NOT NULL CHECK (shadow_action IN ('APPROVE', 'BLOCK', 'BOOST', 'CUT', 'WATCH')),
  alignment_score REAL NOT NULL,
  adjusted_confidence REAL,
  suggested_weight_multiplier REAL,
  realized_pnl_pct REAL,
  realized_source TEXT,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(alpha_candidate_id) REFERENCES alpha_candidates(id) ON DELETE CASCADE,
  FOREIGN KEY(signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE,
  UNIQUE(alpha_candidate_id, signal_id)
);

CREATE INDEX IF NOT EXISTS idx_alpha_shadow_lookup
  ON alpha_shadow_observations(alpha_candidate_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS alpha_lifecycle_events (
  id TEXT PRIMARY KEY,
  alpha_candidate_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('DRAFT', 'BACKTEST_PASS', 'SHADOW', 'CANARY', 'PROD', 'RETIRED', 'REJECTED')),
  reason TEXT,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(alpha_candidate_id) REFERENCES alpha_candidates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alpha_lifecycle_events_lookup
  ON alpha_lifecycle_events(alpha_candidate_id, created_at_ms DESC);

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

CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  model_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  endpoint TEXT,
  task_scope TEXT NOT NULL,
  semantic_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'challenger', 'deprecated')),
  config_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_versions_lookup ON model_versions(model_key, status, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  task_key TEXT NOT NULL,
  semantic_version TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'challenger', 'archived')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_lookup ON prompt_versions(task_key, status, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS eval_registry (
  id TEXT PRIMARY KEY,
  eval_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  subject_version TEXT,
  score_json TEXT NOT NULL,
  notes TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eval_registry_lookup ON eval_registry(subject_type, eval_type, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_key TEXT NOT NULL,
  workflow_version TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual', 'shadow', 'replay')),
  status TEXT NOT NULL CHECK (status IN ('PLANNED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PAUSED')),
  trace_id TEXT,
  input_json TEXT NOT NULL,
  output_json TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  started_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_lookup ON workflow_runs(workflow_key, status, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  event_type TEXT NOT NULL,
  user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_trace ON audit_events(trace_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS decision_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  snapshot_date TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  evidence_mode TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  performance_mode TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  source_status TEXT NOT NULL,
  data_status TEXT NOT NULL,
  risk_state_json TEXT NOT NULL,
  portfolio_context_json TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  top_action_id TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_snapshots_unique
  ON decision_snapshots(user_id, market, asset_class, snapshot_date, context_hash);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_lookup
  ON decision_snapshots(user_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS recommendation_reviews (
  id TEXT PRIMARY KEY,
  decision_snapshot_id TEXT NOT NULL,
  action_id TEXT,
  review_type TEXT NOT NULL CHECK (review_type IN ('OUTCOME', 'NO_ACTION_VALUE', 'EXPLANATION')),
  score REAL,
  notes TEXT,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(decision_snapshot_id) REFERENCES decision_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendation_reviews_lookup ON recommendation_reviews(decision_snapshot_id, review_type, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS user_ritual_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  event_date TEXT NOT NULL,
  week_key TEXT,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('MORNING_CHECK_COMPLETED', 'RISK_BOUNDARY_CONFIRMED', 'WRAP_UP_COMPLETED', 'WEEKLY_REVIEW_COMPLETED')
  ),
  snapshot_id TEXT,
  reason_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ritual_events_unique
  ON user_ritual_events(user_id, market, asset_class, event_date, event_type);

CREATE INDEX IF NOT EXISTS idx_user_ritual_events_lookup
  ON user_ritual_events(user_id, event_date DESC, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  category TEXT NOT NULL CHECK (category IN ('RHYTHM', 'STATE_SHIFT', 'PROTECTIVE', 'WRAP_UP')),
  trigger_type TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SEEN', 'DISMISSED')),
  action_target TEXT,
  reason_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_events_lookup
  ON notification_events(user_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id TEXT PRIMARY KEY,
  morning_enabled INTEGER NOT NULL DEFAULT 1,
  state_shift_enabled INTEGER NOT NULL DEFAULT 1,
  protective_enabled INTEGER NOT NULL DEFAULT 1,
  wrap_up_enabled INTEGER NOT NULL DEFAULT 1,
  frequency TEXT NOT NULL DEFAULT 'NORMAL' CHECK (frequency IN ('LOW', 'NORMAL')),
  quiet_start_hour INTEGER,
  quiet_end_hour INTEGER,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nova_task_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  thread_id TEXT,
  task_type TEXT NOT NULL CHECK (
    task_type IN (
      'risk_regime_explanation',
      'daily_stance_generation',
      'action_card_generation',
      'daily_wrap_up_generation',
      'assistant_grounded_answer',
      'fast_classification',
      'retrieval_embedding',
      'strategy_candidate_generation'
    )
  ),
  route_alias TEXT NOT NULL,
  model_name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  trace_id TEXT,
  prompt_version_id TEXT,
  parent_run_id TEXT,
  input_json TEXT NOT NULL,
  context_json TEXT NOT NULL,
  output_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('SUCCEEDED', 'FAILED', 'SKIPPED')),
  error TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nova_task_runs_lookup
  ON nova_task_runs(task_type, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_nova_task_runs_user
  ON nova_task_runs(user_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_nova_task_runs_thread
  ON nova_task_runs(thread_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS nova_review_labels (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  label TEXT NOT NULL,
  score REAL,
  notes TEXT,
  include_in_training INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(run_id) REFERENCES nova_task_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_nova_review_labels_run
  ON nova_review_labels(run_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS market_state_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  snapshot_date TEXT NOT NULL,
  decision_snapshot_id TEXT,
  regime_id TEXT,
  risk_posture TEXT,
  style_climate TEXT,
  event_context_json TEXT NOT NULL,
  drivers_json TEXT NOT NULL,
  source_status TEXT NOT NULL,
  data_status TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(decision_snapshot_id) REFERENCES decision_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_market_state_snapshots_lookup
  ON market_state_snapshots(user_id, market, asset_class, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS evidence_snapshots (
  id TEXT PRIMARY KEY,
  decision_snapshot_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  thesis TEXT,
  supporting_factors_json TEXT NOT NULL,
  opposing_factors_json TEXT NOT NULL,
  regime_context_json TEXT NOT NULL,
  ranking_reason TEXT,
  invalidation_conditions_json TEXT NOT NULL,
  similar_case_json TEXT NOT NULL,
  change_summary_json TEXT NOT NULL,
  horizon TEXT,
  source_status TEXT NOT NULL,
  data_status TEXT NOT NULL,
  model_version_id TEXT,
  prompt_version_id TEXT,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(decision_snapshot_id) REFERENCES decision_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evidence_snapshots_lookup
  ON evidence_snapshots(decision_snapshot_id, action_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS action_snapshots (
  id TEXT PRIMARY KEY,
  decision_snapshot_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  signal_id TEXT,
  symbol TEXT,
  rank INTEGER NOT NULL,
  action_label TEXT NOT NULL,
  action_state TEXT NOT NULL,
  portfolio_intent TEXT,
  conviction REAL,
  why_now TEXT,
  caution TEXT,
  invalidation TEXT,
  horizon TEXT,
  evidence_snapshot_id TEXT,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(decision_snapshot_id) REFERENCES decision_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY(evidence_snapshot_id) REFERENCES evidence_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_action_snapshots_lookup
  ON action_snapshots(decision_snapshot_id, rank, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS user_response_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  decision_snapshot_id TEXT,
  action_id TEXT,
  thread_id TEXT,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'APP_OPEN',
      'MORNING_CHECK_COMPLETED',
      'ACTION_VIEWED',
      'ACTION_CONFIRMED',
      'AI_FOLLOW_UP',
      'RECOMMENDATION_ACCEPTED',
      'RECOMMENDATION_IGNORED',
      'HIGH_RISK_OVERRIDE',
      'WRAP_UP_COMPLETED',
      'NOTIFICATION_OPENED'
    )
  ),
  event_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(decision_snapshot_id) REFERENCES decision_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_response_events_lookup
  ON user_response_events(user_id, event_date DESC, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS outcome_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  decision_snapshot_id TEXT NOT NULL,
  action_id TEXT,
  review_kind TEXT NOT NULL CHECK (review_kind IN ('OUTCOME', 'FAILURE', 'NO_ACTION_VALUE', 'EXPLANATION_EFFECTIVENESS')),
  score REAL,
  verdict TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(decision_snapshot_id) REFERENCES decision_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_outcome_reviews_lookup
  ON outcome_reviews(decision_snapshot_id, review_kind, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS user_state_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  snapshot_date TEXT NOT NULL,
  portfolio_state_json TEXT NOT NULL,
  discipline_state_json TEXT NOT NULL,
  behavioral_pattern_json TEXT NOT NULL,
  impulse_risk_json TEXT NOT NULL,
  trust_state_json TEXT NOT NULL,
  decision_profile_json TEXT NOT NULL,
  personalization_context_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_state_snapshots_unique
  ON user_state_snapshots(user_id, market, asset_class, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_user_state_snapshots_lookup
  ON user_state_snapshots(user_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS decision_intelligence_dataset (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  decision_snapshot_id TEXT NOT NULL,
  market_state_snapshot_id TEXT,
  user_state_snapshot_id TEXT,
  label_state TEXT NOT NULL CHECK (label_state IN ('PENDING', 'REVIEWED', 'TRAINING_READY', 'WITHHELD')),
  export_ready INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(decision_snapshot_id) REFERENCES decision_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY(market_state_snapshot_id) REFERENCES market_state_snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY(user_state_snapshot_id) REFERENCES user_state_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_intelligence_dataset_lookup
  ON decision_intelligence_dataset(user_id, market, asset_class, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS sandbox_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  decision_snapshot_id TEXT NOT NULL,
  action_id TEXT,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN ('ACCEPT_ACTION', 'WAIT', 'ADVERSE_MOVE', 'FAVORABLE_MOVE', 'OVERLAP_CHECK')),
  input_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(decision_snapshot_id) REFERENCES decision_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sandbox_runs_lookup
  ON sandbox_runs(user_id, decision_snapshot_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS external_surfaces (
  id TEXT PRIMARY KEY,
  surface_type TEXT NOT NULL CHECK (surface_type IN ('PUBLIC_DECISION', 'SHARE_CARD', 'DEMO_SURFACE', 'BETA_GATE')),
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO', 'ALL')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('OPTIONS', 'US_STOCK', 'CRYPTO', 'ALL')),
  source_decision_snapshot_id TEXT,
  share_key TEXT,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(source_decision_snapshot_id) REFERENCES decision_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_external_surfaces_lookup
  ON external_surfaces(surface_type, market, asset_class, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS compliance_logs (
  id TEXT PRIMARY KEY,
  log_type TEXT NOT NULL CHECK (log_type IN ('RECOMMENDATION', 'EVIDENCE', 'PROMPT_EXECUTION', 'POLICY_DECISION')),
  user_id TEXT,
  decision_snapshot_id TEXT,
  action_id TEXT,
  evidence_snapshot_id TEXT,
  model_version_id TEXT,
  prompt_version_id TEXT,
  policy_version TEXT,
  trace_id TEXT,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(decision_snapshot_id) REFERENCES decision_snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY(evidence_snapshot_id) REFERENCES evidence_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_logs_lookup
  ON compliance_logs(log_type, user_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS auth_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  trade_mode TEXT NOT NULL CHECK (trade_mode IN ('starter', 'active', 'deep')),
  broker TEXT NOT NULL,
  locale TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  last_login_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);

CREATE TABLE IF NOT EXISTS auth_user_roles (
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'SUPPORT')),
  granted_at_ms INTEGER NOT NULL,
  granted_by_user_id TEXT,
  PRIMARY KEY(user_id, role),
  FOREIGN KEY(user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE,
  FOREIGN KEY(granted_by_user_id) REFERENCES auth_users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_user_roles_role ON auth_user_roles(role, granted_at_ms DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address TEXT,
  expires_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, updated_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(session_token_hash);

CREATE TABLE IF NOT EXISTS auth_password_resets (
  reset_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  used_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_password_resets_user ON auth_password_resets(user_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS auth_user_state_sync (
  user_id TEXT PRIMARY KEY,
  asset_class TEXT NOT NULL DEFAULT 'US_STOCK',
  market TEXT NOT NULL DEFAULT 'US',
  ui_mode TEXT NOT NULL DEFAULT 'standard',
  risk_profile_key TEXT NOT NULL DEFAULT 'balanced',
  watchlist_json TEXT NOT NULL DEFAULT '[]',
  holdings_json TEXT NOT NULL DEFAULT '[]',
  executions_json TEXT NOT NULL DEFAULT '[]',
  discipline_log_json TEXT NOT NULL DEFAULT '{"checkins":[],"boundary_kept":[],"weekly_reviews":[]}',
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS manual_user_state (
  user_id TEXT PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  referred_by_code TEXT,
  vip_days_balance INTEGER NOT NULL DEFAULT 0,
  vip_days_redeemed_total INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS manual_points_ledger (
  entry_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  points_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manual_points_ledger_user ON manual_points_ledger(user_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS manual_referrals (
  referral_id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL,
  invite_code TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('REWARDED', 'CANCELLED')),
  reward_points INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE(inviter_user_id, referred_user_id),
  FOREIGN KEY(inviter_user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE,
  FOREIGN KEY(referred_user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manual_referrals_inviter ON manual_referrals(inviter_user_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_manual_referrals_referred ON manual_referrals(referred_user_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS manual_prediction_markets (
  market_id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  market TEXT,
  symbol TEXT,
  options_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'LOCKED', 'RESOLVED', 'CANCELLED')),
  correct_option TEXT,
  closes_at_ms INTEGER NOT NULL,
  resolves_at_ms INTEGER,
  settled_at_ms INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_manual_prediction_markets_status ON manual_prediction_markets(status, closes_at_ms DESC);

CREATE TABLE IF NOT EXISTS manual_prediction_entries (
  entry_id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  selected_option TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'WON', 'LOST', 'CANCELLED')),
  points_staked INTEGER NOT NULL DEFAULT 0,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE(market_id, user_id),
  FOREIGN KEY(market_id) REFERENCES manual_prediction_markets(market_id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manual_prediction_entries_user ON manual_prediction_entries(user_id, created_at_ms DESC);
`;

export function ensureSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
  try {
    const novaTaskRunsRow = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'nova_task_runs'")
      .get() as { sql?: string } | undefined;
    const novaTaskRunsSql = String(novaTaskRunsRow?.sql || '');
    if (!novaTaskRunsSql.includes("'strategy_candidate_generation'")) {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec('BEGIN;');
      db.exec('ALTER TABLE nova_review_labels RENAME TO nova_review_labels_old;');
      db.exec('ALTER TABLE nova_task_runs RENAME TO nova_task_runs_old;');
      db.exec(`
        CREATE TABLE nova_task_runs (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          thread_id TEXT,
          task_type TEXT NOT NULL CHECK (
            task_type IN (
              'risk_regime_explanation',
              'daily_stance_generation',
              'action_card_generation',
              'daily_wrap_up_generation',
              'assistant_grounded_answer',
              'fast_classification',
              'retrieval_embedding',
              'strategy_candidate_generation'
            )
          ),
          route_alias TEXT NOT NULL,
          model_name TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          trace_id TEXT,
          prompt_version_id TEXT,
          parent_run_id TEXT,
          input_json TEXT NOT NULL,
          context_json TEXT NOT NULL,
          output_json TEXT,
          status TEXT NOT NULL CHECK (status IN ('SUCCEEDED', 'FAILED', 'SKIPPED')),
          error TEXT,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
      `);
      db.exec(`
        INSERT INTO nova_task_runs(
          id, user_id, thread_id, task_type, route_alias, model_name, endpoint, trace_id, prompt_version_id,
          parent_run_id, input_json, context_json, output_json, status, error, created_at_ms, updated_at_ms
        )
        SELECT
          id, user_id, thread_id, task_type, route_alias, model_name, endpoint, trace_id, prompt_version_id,
          parent_run_id, input_json, context_json, output_json, status, error, created_at_ms, updated_at_ms
        FROM nova_task_runs_old;
      `);
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_nova_task_runs_lookup ON nova_task_runs(task_type, created_at_ms DESC);',
      );
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_nova_task_runs_user ON nova_task_runs(user_id, created_at_ms DESC);',
      );
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_nova_task_runs_thread ON nova_task_runs(thread_id, created_at_ms DESC);',
      );
      db.exec(`
        CREATE TABLE nova_review_labels (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          reviewer_id TEXT NOT NULL,
          label TEXT NOT NULL,
          score REAL,
          notes TEXT,
          include_in_training INTEGER NOT NULL DEFAULT 0,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          FOREIGN KEY(run_id) REFERENCES nova_task_runs(id) ON DELETE CASCADE
        );
      `);
      db.exec(`
        INSERT INTO nova_review_labels(
          id, run_id, reviewer_id, label, score, notes, include_in_training, created_at_ms, updated_at_ms
        )
        SELECT
          id, run_id, reviewer_id, label, score, notes, include_in_training, created_at_ms, updated_at_ms
        FROM nova_review_labels_old;
      `);
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_nova_review_labels_run ON nova_review_labels(run_id, updated_at_ms DESC);',
      );
      db.exec('DROP TABLE nova_review_labels_old;');
      db.exec('DROP TABLE nova_task_runs_old;');
      db.exec('COMMIT;');
      db.exec('PRAGMA foreign_keys = ON;');
    }
  } catch {
    try {
      db.exec('ROLLBACK;');
    } catch {}
    db.exec('PRAGMA foreign_keys = ON;');
    throw new Error('Failed to migrate nova_task_runs for strategy candidate support.');
  }
  try {
    db.prepare('SELECT thread_id FROM chat_audit_logs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE chat_audit_logs ADD COLUMN thread_id TEXT;');
  }
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
  try {
    db.prepare('SELECT evidence_mode FROM decision_snapshots LIMIT 1').get();
  } catch {
    db.exec(
      "ALTER TABLE decision_snapshots ADD COLUMN evidence_mode TEXT NOT NULL DEFAULT 'UNAVAILABLE';",
    );
  }
  try {
    db.prepare('SELECT performance_mode FROM decision_snapshots LIMIT 1').get();
  } catch {
    db.exec(
      "ALTER TABLE decision_snapshots ADD COLUMN performance_mode TEXT NOT NULL DEFAULT 'UNAVAILABLE';",
    );
  }
}

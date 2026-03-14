export type Market = 'US' | 'CRYPTO';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d';
export type AssetClass = 'OPTIONS' | 'US_STOCK' | 'CRYPTO';
export type SignalDirection = 'LONG' | 'SHORT' | 'FLAT';
export type SignalStatus = 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED';
export type RiskProfileKey = 'conservative' | 'balanced' | 'aggressive';
export type ExecutionMode = 'PAPER' | 'LIVE';
export type ExecutionAction = 'EXECUTE' | 'DONE' | 'CLOSE';

export interface Asset {
  asset_id: number;
  symbol: string;
  market: Market;
  venue: string;
  base: string | null;
  quote: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface AssetInput {
  symbol: string;
  market: Market;
  venue: string;
  base?: string | null;
  quote?: string | null;
  status?: string;
}

export interface NormalizedBar {
  ts_open: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface OhlcvRow extends NormalizedBar {
  asset_id: number;
  timeframe: Timeframe;
  source: string;
  ingest_at: number;
}

export interface OhlcvQuery {
  market: Market;
  symbol: string;
  timeframe: Timeframe;
  start?: number;
  end?: number;
  limit?: number;
}

export interface RetryConfig {
  attempts: number;
  baseDelayMs: number;
}

export interface OptionsIntradayPayload {
  underlying: {
    symbol: string;
    spot_price: number;
    session: 'PRE' | 'REG' | 'POST';
  };
  option_contract: {
    side: 'CALL' | 'PUT';
    expiry: string;
    strike: number;
    dte: number;
    contract_symbol: string;
  };
  time_stop: {
    eod_flatten: boolean;
    latest_exit_utc: string;
  };
  greeks_iv: {
    delta: number;
    iv_percentile?: number;
    expected_move?: number;
  };
}

export interface StockSwingPayload {
  horizon: 'SHORT' | 'MEDIUM' | 'LONG';
  catalysts?: string[];
}

export interface CryptoPayload {
  venue: 'BINANCE' | 'COINBASE' | 'OKX' | 'BYBIT' | 'KRAKEN';
  instrument_type: 'SPOT' | 'PERP';
  perp_metrics: {
    funding_rate_current: number;
    funding_rate_8h: number;
    funding_rate_24h: number;
    basis_bps: number;
    basis_percentile: number;
    open_interest?: number;
    premium_index?: number;
  };
  flow_state: {
    spot_led_breakout: boolean;
    perp_led_breakout: boolean;
    funding_state: 'NEUTRAL' | 'EXTREME';
  };
  leverage_suggestion: {
    suggested_leverage: number;
    capped_by_profile: boolean;
  };
}

export type SignalPayload =
  | { kind: 'OPTIONS_INTRADAY'; data: OptionsIntradayPayload }
  | { kind: 'STOCK_SWING'; data: StockSwingPayload }
  | { kind: 'CRYPTO'; data: CryptoPayload };

export interface SignalContract {
  id: string;
  created_at: string;
  expires_at: string;
  asset_class: AssetClass;
  market: Market;
  symbol: string;
  timeframe: string;
  strategy_id: string;
  strategy_family: string;
  strategy_version: string;
  regime_id: string;
  temperature_percentile: number;
  volatility_percentile: number;
  direction: SignalDirection;
  strength: number;
  confidence: number;
  entry_zone: {
    low: number;
    high: number;
    method: 'MARKET' | 'LIMIT' | 'SPLIT_LIMIT';
    notes?: string;
  };
  invalidation_level: number;
  stop_loss: {
    type: 'STRUCTURE' | 'ATR' | 'HYBRID';
    price: number;
    rationale: string;
  };
  take_profit_levels: Array<{
    price: number;
    size_pct: number;
    rationale: string;
  }>;
  trailing_rule: {
    type: 'EMA' | 'CHAND_EXIT' | 'NONE';
    params: Record<string, unknown>;
  };
  position_advice: {
    position_pct: number;
    leverage_cap: number;
    risk_bucket_applied: string;
    rationale: string;
  };
  cost_model: {
    fee_bps: number;
    spread_bps: number;
    slippage_bps: number;
    funding_est_bps?: number;
    basis_est?: number;
  };
  expected_metrics: {
    expected_R: number;
    hit_rate_est: number;
    sample_size: number;
    expected_max_dd_est?: number;
  };
  explain_bullets: string[];
  execution_checklist: string[];
  tags: string[];
  status: SignalStatus;
  payload: SignalPayload;
  references?: {
    chart_url?: string;
    docs_url?: string;
  };
  score: number;
  payload_version: string;
}

export interface SignalRecord {
  signal_id: string;
  created_at_ms: number;
  expires_at_ms: number;
  asset_class: AssetClass;
  market: Market;
  symbol: string;
  timeframe: string;
  strategy_id: string;
  strategy_family: string;
  strategy_version: string;
  regime_id: string;
  temperature_percentile: number;
  volatility_percentile: number;
  direction: SignalDirection;
  strength: number;
  confidence: number;
  entry_low: number;
  entry_high: number;
  entry_method: string;
  invalidation_level: number;
  stop_type: string;
  stop_price: number;
  tp1_price: number | null;
  tp1_size_pct: number | null;
  tp2_price: number | null;
  tp2_size_pct: number | null;
  trailing_type: string;
  trailing_params_json: string;
  position_pct: number;
  leverage_cap: number;
  risk_bucket_applied: string;
  fee_bps: number;
  spread_bps: number;
  slippage_bps: number;
  funding_est_bps: number | null;
  basis_est: number | null;
  expected_r: number;
  hit_rate_est: number;
  sample_size: number;
  expected_max_dd_est: number | null;
  status: SignalStatus;
  score: number;
  payload_json: string;
  updated_at_ms: number;
}

export interface SignalEventRecord {
  id?: number;
  signal_id: string;
  event_type: string;
  payload_json?: string;
  created_at_ms: number;
}

export interface ExecutionRecord {
  execution_id: string;
  signal_id: string;
  user_id: string;
  mode: ExecutionMode;
  action: ExecutionAction;
  market: Market;
  symbol: string;
  entry_price?: number | null;
  stop_price?: number | null;
  tp_price?: number | null;
  size_pct?: number | null;
  pnl_pct?: number | null;
  note?: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface UserRiskProfileRecord {
  user_id: string;
  profile_key: RiskProfileKey;
  max_loss_per_trade: number;
  max_daily_loss: number;
  max_drawdown: number;
  exposure_cap: number;
  leverage_cap: number;
  updated_at_ms: number;
}

export interface MarketStateRecord {
  market: Market;
  symbol: string;
  timeframe: string;
  snapshot_ts_ms: number;
  regime_id: string;
  trend_strength: number;
  temperature_percentile: number;
  volatility_percentile: number;
  risk_off_score: number;
  stance: string;
  event_stats_json: string;
  assumptions_json: string;
  updated_at_ms: number;
}

export interface PerformanceSnapshotRecord {
  market: Market;
  range: string;
  segment_type: 'OVERALL' | 'STRATEGY' | 'REGIME' | 'DEVIATION';
  segment_key: string;
  source_label: 'BACKTEST' | 'PAPER' | 'LIVE' | 'MIXED';
  sample_size: number;
  payload_json: string;
  asof_ms: number;
  updated_at_ms: number;
}

export interface AppConfig {
  database: {
    driver: 'sqlite';
    path: string;
  };
  markets: {
    US: {
      venue: string;
      symbols: string[];
    };
    CRYPTO: {
      venue: string;
      symbols: string[];
    };
  };
  timeframes: Timeframe[];
  stooq: {
    baseUrl: string;
    bulkPackCodes: Partial<Record<Timeframe, string>>;
    timeoutMs: number;
    batchSize: number;
  };
  binancePublic: {
    baseUrl: string;
    pathPrefix: string;
    startDate: string;
    lookbackDailyDays: number;
    concurrency: number;
  };
  binanceRest: {
    baseUrl: string;
    limit: number;
    requestDelayMs: number;
    retry: RetryConfig;
  };
}

export type StrategyLifecycleStatus = 'active' | 'archived' | 'challenger' | 'champion' | 'deprecated' | 'retired';
export type BacktestRunType = 'signal_replay' | 'portfolio_replay' | 'walk_forward' | 'paper_reconciliation';
export type BacktestRunStatus = 'RUNNING' | 'SUCCESS' | 'WITHHELD' | 'FAILED';
export type EvidenceStatus = 'REPLAY_READY' | 'WITHHELD' | 'INSUFFICIENT_DATA' | 'PARTIAL_DATA' | 'EXPERIMENTAL';
export type ReconciliationStatus = 'RECONCILED' | 'PAPER_DATA_UNAVAILABLE' | 'REPLAY_DATA_UNAVAILABLE' | 'PARTIAL';
export type BacktestMetricStatus = 'READY' | 'WITHHELD' | 'FAILED';
export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'WITHHELD';

export interface StrategyVersionRecord {
  id: string;
  strategy_key: string;
  family: string;
  version: string;
  config_hash: string;
  config_json: string;
  status: StrategyLifecycleStatus;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface DatasetVersionRecord {
  id: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  timeframe: string;
  source_bundle_hash: string;
  coverage_summary_json: string;
  freshness_summary_json: string;
  notes: string | null;
  created_at_ms: number;
}

export interface UniverseSnapshotRecord {
  id: string;
  dataset_version_id: string;
  snapshot_ts_ms: number;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  members_json: string;
  created_at_ms: number;
}

export interface FeatureSnapshotRecord {
  id: string;
  dataset_version_id: string;
  feature_version: string;
  snapshot_ts_ms: number;
  feature_hash: string;
  metadata_json: string;
  created_at_ms: number;
}

export interface ExecutionProfileRecord {
  id: string;
  profile_name: string;
  spread_model_json: string;
  slippage_model_json: string;
  fee_model_json: string;
  fill_policy_json: string;
  latency_assumption_json: string;
  version: string;
  created_at_ms: number;
}

export interface BacktestRunRecord {
  id: string;
  run_type: BacktestRunType;
  strategy_version_id: string | null;
  dataset_version_id: string;
  universe_version_id: string;
  execution_profile_id: string;
  config_hash: string;
  started_at_ms: number;
  completed_at_ms: number | null;
  status: BacktestRunStatus;
  train_window: string | null;
  validation_window: string | null;
  test_window: string | null;
  notes: string | null;
}

export interface SignalSnapshotRecord {
  id: string;
  signal_id: string;
  strategy_version_id: string;
  dataset_version_id: string;
  backtest_run_id: string;
  snapshot_ts_ms: number;
  symbol: string;
  market: Market;
  asset_class: AssetClass;
  timeframe: string;
  direction: SignalDirection;
  conviction: number;
  regime_context_json: string;
  entry_logic_json: string;
  invalidation_logic_json: string;
  source_transparency_json: string;
  evidence_status: EvidenceStatus;
  created_at_ms: number;
}

export interface BacktestMetricRecord {
  id?: number;
  backtest_run_id: string;
  gross_return: number | null;
  net_return: number | null;
  sharpe: number | null;
  sortino: number | null;
  max_drawdown: number | null;
  turnover: number | null;
  win_rate: number | null;
  hit_rate: number | null;
  cost_drag: number | null;
  sample_size: number;
  withheld_reason: string | null;
  realism_grade: GradeLetter;
  robustness_grade: GradeLetter;
  status: BacktestMetricStatus;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface BacktestArtifactRecord {
  id?: number;
  backtest_run_id: string;
  artifact_type: string;
  path_or_payload: string;
  created_at_ms: number;
}

export interface ReplayPaperReconciliationRecord {
  id: string;
  signal_snapshot_id: string;
  trade_group_id: string;
  replay_run_id: string;
  paper_execution_group_id: string | null;
  expected_fill_price: number | null;
  paper_fill_price: number | null;
  expected_pnl: number | null;
  paper_pnl: number | null;
  expected_hold_period: number | null;
  actual_hold_period: number | null;
  slippage_gap: number | null;
  attribution_json: string;
  status: ReconciliationStatus;
  created_at_ms: number;
}

export interface ExperimentRegistryRecord {
  id: string;
  backtest_run_id: string;
  strategy_version_id: string | null;
  decision_status: 'candidate' | 'challenger' | 'champion' | 'hold' | 'deprecated' | 'retired';
  promotion_reason: string | null;
  demotion_reason: string | null;
  approved_at_ms: number | null;
  created_at_ms: number;
}

export interface ChatThreadRecord {
  id: string;
  user_id: string;
  title: string;
  last_context_json: string | null;
  last_message_preview: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface ChatMessageRecord {
  id?: number;
  thread_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  context_json: string | null;
  provider: string | null;
  status: 'READY' | 'ERROR';
  created_at_ms: number;
}

export interface UserHoldingInput {
  id?: string;
  symbol: string;
  asset_class?: AssetClass | null;
  market?: Market | null;
  weight_pct?: number | null;
  quantity?: number | null;
  cost_basis?: number | null;
  current_price?: number | null;
  sector?: string | null;
  note?: string | null;
}

export interface DecisionSnapshotRecord {
  id: string;
  user_id: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  snapshot_date: string;
  context_hash: string;
  source_status: string;
  data_status: string;
  risk_state_json: string;
  portfolio_context_json: string;
  actions_json: string;
  summary_json: string;
  top_action_id: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

export type UserRitualEventType =
  | 'MORNING_CHECK_COMPLETED'
  | 'RISK_BOUNDARY_CONFIRMED'
  | 'WRAP_UP_COMPLETED'
  | 'WEEKLY_REVIEW_COMPLETED';

export interface UserRitualEventRecord {
  id: string;
  user_id: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  event_date: string;
  week_key: string | null;
  event_type: UserRitualEventType;
  snapshot_id: string | null;
  reason_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export type NotificationCategory = 'RHYTHM' | 'STATE_SHIFT' | 'PROTECTIVE' | 'WRAP_UP';
export type NotificationStatus = 'ACTIVE' | 'SEEN' | 'DISMISSED';

export interface NotificationEventRecord {
  id: string;
  user_id: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  category: NotificationCategory;
  trigger_type: string;
  fingerprint: string;
  title: string;
  body: string;
  tone: string;
  status: NotificationStatus;
  action_target: string | null;
  reason_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface NotificationPreferenceRecord {
  user_id: string;
  morning_enabled: number;
  state_shift_enabled: number;
  protective_enabled: number;
  wrap_up_enabled: number;
  frequency: 'LOW' | 'NORMAL';
  quiet_start_hour: number | null;
  quiet_end_hour: number | null;
  updated_at_ms: number;
}

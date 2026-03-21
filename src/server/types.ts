export type Market = 'US' | 'CRYPTO';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d';
export type AssetClass = 'OPTIONS' | 'US_STOCK' | 'CRYPTO';
export type SignalDirection = 'LONG' | 'SHORT' | 'FLAT';
export type SignalStatus = 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED';
export type RiskProfileKey = 'conservative' | 'balanced' | 'aggressive';
export type ExecutionMode = 'PAPER' | 'LIVE';
export type EvidenceMode = 'LIVE' | 'PAPER' | 'REPLAY' | 'BACKTEST' | 'DEMO' | 'MIXED' | 'UNAVAILABLE';
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

export interface FundingRateRow {
  asset_id: number;
  ts_open: number;
  funding_rate: string;
  source: string;
  ingest_at: number;
}

export interface BasisSnapshotRow {
  asset_id: number;
  ts_open: number;
  basis_bps: string;
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
  confidence_details?: {
    raw_confidence: number;
    calibrated_confidence: number;
    direction_confidence: number;
    return_confidence: number;
    execution_confidence: number;
    risk_confidence: number;
    calibration_bucket: string;
    calibration_sample_size: number;
    bucket_win_rate: number;
    bucket_avg_pnl_pct: number;
    bucket_avg_loss_pct: number;
    brier_score: number;
    ece: number;
    sizing_multiplier: number;
    sizing_band: 'tiny' | 'light' | 'base' | 'press';
  };
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
    governor_mode?: 'NORMAL' | 'CAUTION' | 'DERISK' | 'BLOCKED';
    governor_reason?: string | null;
    governor_overlays?: string[];
    governor_size_multiplier?: number;
    risk_budget_remaining?: number;
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
  lineage?: {
    market_data_mode: EvidenceMode;
    performance_mode: EvidenceMode;
    validation_mode: EvidenceMode;
    display_mode: EvidenceMode;
    source_status: string;
    data_status: string;
    demo: boolean;
  };
  news_context?: {
    symbol: string;
    headline_count: number;
    tone: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL' | 'NONE';
    top_headlines: string[];
    updated_at: string | null;
    source: string;
    factor_score?: number | null;
    event_risk_score?: number | null;
    macro_policy_score?: number | null;
    earnings_impact_score?: number | null;
    factor_tags?: string[];
    factor_summary?: string | null;
    analysis_provider?: string | null;
    trading_bias?: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL' | null;
  };
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

export interface NewsItemRecord {
  id: string;
  market: Market | 'ALL';
  symbol: string;
  headline: string;
  source: string;
  url: string | null;
  published_at_ms: number;
  sentiment_label: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL';
  relevance_score: number;
  payload_json: string;
  updated_at_ms: number;
}

export interface FundamentalSnapshotRecord {
  id: string;
  market: Market;
  symbol: string;
  source: string;
  asof_date: string;
  payload_json: string;
  updated_at_ms: number;
}

export interface OptionChainSnapshotRecord {
  id: string;
  market: Market;
  symbol: string;
  expiration_date: string | null;
  snapshot_ts_ms: number;
  source: string;
  payload_json: string;
  updated_at_ms: number;
}

export type AlphaIntegrationPath =
  | 'signal_input'
  | 'confidence_modifier'
  | 'regime_activation_hint'
  | 'portfolio_weight_suggestion';

export type AlphaLifecycleState = 'DRAFT' | 'BACKTEST_PASS' | 'SHADOW' | 'CANARY' | 'PROD' | 'RETIRED' | 'REJECTED';

export interface AlphaCandidateRecord {
  id: string;
  thesis: string;
  family: string;
  formula_json: string;
  params_json: string;
  feature_dependencies_json: string;
  regime_constraints_json: string;
  compatible_markets_json: string;
  holding_period: string;
  entry_logic_json: string;
  exit_logic_json: string;
  sizing_hint_json: string;
  integration_path: AlphaIntegrationPath;
  complexity_score: number;
  source: string;
  status: AlphaLifecycleState;
  parent_alpha_id: string | null;
  acceptance_score: number | null;
  last_evaluation_id: string | null;
  last_rejection_reason: string | null;
  last_promotion_reason: string | null;
  metadata_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface AlphaEvaluationRecord {
  id: string;
  alpha_candidate_id: string;
  workflow_run_id: string | null;
  backtest_run_id: string | null;
  evaluation_status: 'PASS' | 'WATCH' | 'REJECT';
  acceptance_score: number;
  metrics_json: string;
  rejection_reasons_json: string;
  notes: string | null;
  created_at_ms: number;
}

export interface AlphaShadowObservationRecord {
  id: string;
  alpha_candidate_id: string;
  workflow_run_id: string | null;
  signal_id: string;
  market: Market;
  symbol: string;
  shadow_action: 'APPROVE' | 'BLOCK' | 'BOOST' | 'CUT' | 'WATCH';
  alignment_score: number;
  adjusted_confidence: number | null;
  suggested_weight_multiplier: number | null;
  realized_pnl_pct: number | null;
  realized_source: string | null;
  payload_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface AlphaLifecycleEventRecord {
  id: string;
  alpha_candidate_id: string;
  from_status: AlphaLifecycleState | null;
  to_status: AlphaLifecycleState;
  reason: string | null;
  payload_json: string;
  created_at_ms: number;
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
  yahoo: {
    baseUrl: string;
    range: string;
    intervals: Partial<Record<Timeframe, string>>;
    timeoutMs: number;
    concurrency: number;
  };
  nasdaq: {
    baseUrl: string;
    limit: number;
    timeoutMs: number;
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
  binanceDerivatives?: {
    historyLimit: number;
    requestDelayMs: number;
    timeoutMs: number;
  };
  alphaDiscovery?: {
    enabled?: boolean;
    schedule?: string;
    maxCandidatesPerCycle?: number;
    searchBudget?: number;
    minAcceptanceScore?: number;
    shadowPromotionThresholds?: {
      minSampleSize?: number;
      minSharpe?: number;
      minExpectancy?: number;
      maxDrawdown?: number;
      maxCorrelation?: number;
      minApprovalRate?: number;
    };
    retirementThresholds?: {
      minExpectancy?: number;
      maxDrawdown?: number;
      decayStreakLimit?: number;
    };
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

export interface ModelVersionRecord {
  id: string;
  model_key: string;
  provider: string;
  endpoint: string | null;
  task_scope: string;
  semantic_version: string;
  status: 'active' | 'challenger' | 'deprecated';
  config_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface PromptVersionRecord {
  id: string;
  task_key: string;
  semantic_version: string;
  prompt_hash: string;
  prompt_text: string;
  status: 'active' | 'challenger' | 'archived';
  created_at_ms: number;
  updated_at_ms: number;
}

export interface EvalRegistryRecord {
  id: string;
  eval_type: string;
  subject_type: string;
  subject_id: string;
  subject_version: string | null;
  score_json: string;
  notes: string | null;
  created_at_ms: number;
}

export interface WorkflowRunRecord {
  id: string;
  workflow_key: string;
  workflow_version: string;
  trigger_type: 'scheduled' | 'manual' | 'shadow' | 'replay';
  status: 'PLANNED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'PAUSED';
  trace_id: string | null;
  input_json: string;
  output_json: string | null;
  attempt_count: number;
  started_at_ms: number;
  updated_at_ms: number;
  completed_at_ms: number | null;
}

export interface AuditEventRecord {
  id?: number;
  trace_id: string;
  scope: string;
  event_type: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  payload_json: string;
  created_at_ms: number;
}

export interface RecommendationReviewRecord {
  id: string;
  decision_snapshot_id: string;
  action_id: string | null;
  review_type: 'OUTCOME' | 'NO_ACTION_VALUE' | 'EXPLANATION';
  score: number | null;
  notes: string | null;
  payload_json: string;
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
  evidence_mode: EvidenceMode;
  performance_mode: EvidenceMode;
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

export type NovaTaskType =
  | 'risk_regime_explanation'
  | 'daily_stance_generation'
  | 'action_card_generation'
  | 'daily_wrap_up_generation'
  | 'assistant_grounded_answer'
  | 'strategy_candidate_generation'
  | 'fast_classification'
  | 'retrieval_embedding';

export type NovaTaskRunStatus = 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export interface NovaTaskRunRecord {
  id: string;
  user_id: string | null;
  thread_id: string | null;
  task_type: NovaTaskType;
  route_alias: string;
  model_name: string;
  endpoint: string;
  trace_id: string | null;
  prompt_version_id: string | null;
  parent_run_id: string | null;
  input_json: string;
  context_json: string;
  output_json: string | null;
  status: NovaTaskRunStatus;
  error: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface NovaReviewLabelRecord {
  id: string;
  run_id: string;
  reviewer_id: string;
  label: string;
  score: number | null;
  notes: string | null;
  include_in_training: number;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface MarketStateSnapshotRecord {
  id: string;
  user_id: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  snapshot_date: string;
  decision_snapshot_id: string | null;
  regime_id: string | null;
  risk_posture: string | null;
  style_climate: string | null;
  event_context_json: string;
  drivers_json: string;
  source_status: string;
  data_status: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface ActionSnapshotRecord {
  id: string;
  decision_snapshot_id: string;
  user_id: string;
  action_id: string;
  signal_id: string | null;
  symbol: string | null;
  rank: number;
  action_label: string;
  action_state: string;
  portfolio_intent: string | null;
  conviction: number | null;
  why_now: string | null;
  caution: string | null;
  invalidation: string | null;
  horizon: string | null;
  evidence_snapshot_id: string | null;
  payload_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface EvidenceSnapshotRecord {
  id: string;
  decision_snapshot_id: string;
  user_id: string;
  action_id: string;
  thesis: string | null;
  supporting_factors_json: string;
  opposing_factors_json: string;
  regime_context_json: string;
  ranking_reason: string | null;
  invalidation_conditions_json: string;
  similar_case_json: string;
  change_summary_json: string;
  horizon: string | null;
  source_status: string;
  data_status: string;
  model_version_id: string | null;
  prompt_version_id: string | null;
  payload_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export type UserResponseEventType =
  | 'APP_OPEN'
  | 'MORNING_CHECK_COMPLETED'
  | 'ACTION_VIEWED'
  | 'ACTION_CONFIRMED'
  | 'AI_FOLLOW_UP'
  | 'RECOMMENDATION_ACCEPTED'
  | 'RECOMMENDATION_IGNORED'
  | 'HIGH_RISK_OVERRIDE'
  | 'WRAP_UP_COMPLETED'
  | 'NOTIFICATION_OPENED';

export interface UserResponseEventRecord {
  id: string;
  user_id: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  decision_snapshot_id: string | null;
  action_id: string | null;
  thread_id: string | null;
  event_type: UserResponseEventType;
  event_date: string;
  payload_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export type OutcomeReviewKind = 'OUTCOME' | 'FAILURE' | 'NO_ACTION_VALUE' | 'EXPLANATION_EFFECTIVENESS';

export interface OutcomeReviewRecord {
  id: string;
  user_id: string | null;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  decision_snapshot_id: string;
  action_id: string | null;
  review_kind: OutcomeReviewKind;
  score: number | null;
  verdict: string;
  summary: string;
  payload_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface UserStateSnapshotRecord {
  id: string;
  user_id: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  snapshot_date: string;
  portfolio_state_json: string;
  discipline_state_json: string;
  behavioral_pattern_json: string;
  impulse_risk_json: string;
  trust_state_json: string;
  decision_profile_json: string;
  personalization_context_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface DecisionIntelligenceDatasetRecord {
  id: string;
  user_id: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  decision_snapshot_id: string;
  market_state_snapshot_id: string | null;
  user_state_snapshot_id: string | null;
  label_state: 'PENDING' | 'REVIEWED' | 'TRAINING_READY' | 'WITHHELD';
  export_ready: number;
  payload_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface SandboxRunRecord {
  id: string;
  user_id: string;
  decision_snapshot_id: string;
  action_id: string | null;
  scenario_type: 'ACCEPT_ACTION' | 'WAIT' | 'ADVERSE_MOVE' | 'FAVORABLE_MOVE' | 'OVERLAP_CHECK';
  input_json: string;
  result_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export type ExternalSurfaceType = 'PUBLIC_DECISION' | 'SHARE_CARD' | 'DEMO_SURFACE' | 'BETA_GATE';

export interface ExternalSurfaceRecord {
  id: string;
  surface_type: ExternalSurfaceType;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  source_decision_snapshot_id: string | null;
  share_key: string | null;
  status: string;
  payload_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export type ComplianceLogType = 'RECOMMENDATION' | 'EVIDENCE' | 'PROMPT_EXECUTION' | 'POLICY_DECISION';

export interface ComplianceLogRecord {
  id: string;
  log_type: ComplianceLogType;
  user_id: string | null;
  decision_snapshot_id: string | null;
  action_id: string | null;
  evidence_snapshot_id: string | null;
  model_version_id: string | null;
  prompt_version_id: string | null;
  policy_version: string | null;
  trace_id: string | null;
  payload_json: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export type AccessScope = 'PUBLIC' | 'USER' | 'INTERNAL' | 'ADMIN';

export interface ComplianceBoundaryNote {
  boundary: string;
  scope: AccessScope;
  note: string;
}

export interface UserIsolationBoundary {
  access_scope: AccessScope;
  user_scoped: boolean;
  retrieval_scoped: boolean;
  cache_scoped: boolean;
  audit_scope: string;
}

export interface PortfolioState {
  holdings_count: number;
  total_weight_pct: number;
  concentration_pct: number | null;
  overlap_risk: 'low' | 'medium' | 'high';
  beta_exposure: number | null;
  sector_concentration: Array<{ sector: string; weight_pct: number }>;
  style_bias: string[];
}

export interface DisciplineState {
  discipline_score: number;
  discipline_stability: number;
  morning_check_streak: number;
  wrap_up_completion_rate: number;
  restraint_rate: number;
}

export interface BehavioralPattern {
  viewing_style: 'confirm_then_leave' | 'high_frequency_observer' | 'deliberate_reviewer' | 'unclear';
  action_preference: 'watch_first' | 'act_on_conviction' | 'event_sensitive' | 'unclear';
  preferred_horizon: 'short' | 'medium' | 'mixed';
  notification_responsiveness: 'low' | 'medium' | 'high';
}

export interface ImpulseRiskState {
  level: 'low' | 'medium' | 'high';
  override_events: number;
  chase_risk: 'low' | 'medium' | 'high';
  note: string;
}

export interface TrustState {
  level: 'fragile' | 'steady' | 'strong';
  ai_follow_up_rate: number;
  explanation_acceptance: number | null;
  note: string;
}

export interface PersonalizationContext {
  caution_intensity: 'soft' | 'firm' | 'protective';
  explanation_style: 'concise' | 'measured' | 'more_context';
  recall_tone: 'quiet' | 'standard' | 'protective';
  no_action_framing: 'completion' | 'discipline' | 'protection';
  action_language_bias: 'neutral' | 'guarded' | 'probing';
}

export interface UserDecisionProfile {
  style: 'conservative' | 'balanced' | 'opportunistic' | 'watchful';
  decision_edge: 'risk_control' | 'confirmation' | 'event_timing' | 'unclear';
  recommendation_boundary: 'tight' | 'moderate' | 'wide';
}

export interface UserState {
  user_id: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  snapshot_date: string;
  portfolio_state: PortfolioState;
  discipline_state: DisciplineState;
  behavioral_pattern: BehavioralPattern;
  impulse_risk_state: ImpulseRiskState;
  trust_state: TrustState;
  personalization_context: PersonalizationContext;
  decision_profile: UserDecisionProfile;
}

export interface ScenarioConstraint {
  max_additional_risk_pct?: number | null;
  max_sector_overlap_pct?: number | null;
  forbid_same_symbol_add?: boolean;
}

export interface ScenarioInput {
  scenario_type: 'ACCEPT_ACTION' | 'WAIT' | 'ADVERSE_MOVE' | 'FAVORABLE_MOVE' | 'OVERLAP_CHECK';
  decision_snapshot_id: string;
  action_id?: string | null;
  constraints?: ScenarioConstraint;
}

export interface PortfolioImpactProjection {
  overlap_delta_pct: number | null;
  beta_delta: number | null;
  concentration_delta_pct: number | null;
  resulting_posture: string;
  note: string;
}

export interface InvalidationPath {
  first_trigger: string | null;
  first_break_reason: string;
  risk_escalation: string;
}

export interface UpgradeCondition {
  label: string;
  threshold: string;
  why_it_matters: string;
}

export interface WaitValueProjection {
  wait_value: 'high' | 'medium' | 'low';
  reason: string;
  next_triggers: string[];
}

export interface ScenarioProjection {
  verdict: string;
  summary: string;
  upside_path: string[];
  downside_path: string[];
}

export interface DecisionSandboxResult {
  scenario_input: ScenarioInput;
  projection: ScenarioProjection;
  portfolio_impact: PortfolioImpactProjection;
  invalidation_path: InvalidationPath;
  upgrade_conditions: UpgradeCondition[];
  wait_value_projection: WaitValueProjection | null;
}

export interface PublicDecisionSnapshot {
  snapshot_date: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  today_risk: string;
  daily_stance: string;
  top_action: {
    action_label: string;
    symbol: string | null;
    confidence: number | null;
    caution: string | null;
  } | null;
  public_note: string;
}

export interface ShareableCardPayload {
  card_type: 'TODAY_RISK' | 'DAILY_WRAP' | 'NO_ACTION_VALUE' | 'TOP_ACTION';
  title: string;
  subtitle: string;
  body: string[];
  footer: string;
}

export interface DemoSurfacePayload {
  headline: string;
  system_state: Record<string, unknown>;
  risk: Record<string, unknown>;
  action_card: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  category_note: string;
}

export interface ExternalSummaryObject {
  public_surface: PublicDecisionSnapshot;
  shareable_cards: ShareableCardPayload[];
  demo_surface: DemoSurfacePayload;
}

export interface ShareLinkState {
  share_key: string;
  share_type: 'TODAY_RISK' | 'DAILY_WRAP' | 'TOP_ACTION';
  active: boolean;
}

export interface BetaGateState {
  state: 'CLOSED' | 'WAITLIST' | 'INVITE_ONLY' | 'OPEN';
  note: string;
}

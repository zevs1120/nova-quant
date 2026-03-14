import type {
  AssetClass,
  BacktestMetricRecord,
  BacktestRunRecord,
  DecisionSnapshotRecord,
  ExperimentRegistryRecord,
  Market,
  ModelVersionRecord,
  PromptVersionRecord,
  RecommendationReviewRecord,
  WorkflowRunRecord
} from '../types.js';

export type AvailabilityStatus =
  | 'DB_BACKED'
  | 'MODEL_DERIVED'
  | 'PAPER_ONLY'
  | 'BACKTEST_ONLY'
  | 'WITHHELD'
  | 'INSUFFICIENT_DATA'
  | 'EXPERIMENTAL'
  | 'UNKNOWN';

export interface ResearchTask {
  id: string;
  task_type: 'hypothesis' | 'rolling_backtest' | 'replay' | 'validation' | 'promotion_review';
  topic: string;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  status: 'planned' | 'running' | 'completed' | 'withheld';
  candidate_ids: string[];
  lineage: {
    experiment_ids: string[];
    strategy_version_ids: string[];
    workflow_ids: string[];
  };
}

export interface StrategyCandidate {
  id: string;
  strategy_version_id: string | null;
  family: string;
  status: string;
  benchmark_role: 'benchmark' | 'candidate' | 'challenger' | 'champion';
  evidence_quality: 'high' | 'medium' | 'low' | 'withheld';
  notes: string | null;
}

export interface RiskState {
  posture: string;
  label: string;
  summary: string;
  source_status: AvailabilityStatus;
  data_status: AvailabilityStatus;
  regime_id: string | null;
  market_climate: string | null;
  risk_budget_state: string | null;
}

export interface PortfolioIntent {
  intent: string;
  universal_signal: boolean;
  personalized: boolean;
  overlap_pct: number | null;
  concentration_warning: string | null;
  action_bias: 'open' | 'add' | 'trim' | 'rotate' | 'hedge' | 'wait';
}

export interface ActionCard {
  action_id: string;
  signal_id: string | null;
  symbol: string | null;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  action_label: string;
  rank: number;
  ranking_score: number;
  conviction: number | null;
  horizon: string | null;
  why_now: string | null;
  caution: string | null;
  invalidation: string | null;
  portfolio_intent: PortfolioIntent;
  source_status: AvailabilityStatus;
  data_status: AvailabilityStatus;
}

export interface EvidenceBundle {
  action_id: string;
  thesis: string;
  supporting_factors: string[];
  opposing_factors: string[];
  regime_context: Record<string, unknown>;
  ranking_reason: string | null;
  invalidation_conditions: string[];
  horizon: string | null;
  previous_change: Record<string, unknown> | null;
  similar_case_summary: string | null;
  generated_at: string | null;
  source_status: AvailabilityStatus;
  data_status: AvailabilityStatus;
}

export interface FeatureSpec {
  key: string;
  category: 'market_state' | 'signal_quality' | 'portfolio' | 'execution' | 'data_quality';
  description: string;
  point_in_time_safe: boolean;
  online_serving_ready: boolean;
  serving_keys: string[];
}

export interface ValidationResult {
  id: string;
  subject_id: string;
  validation_type: string;
  status: 'pass' | 'warn' | 'withheld';
  metrics: Record<string, unknown>;
  notes: string[];
}

export interface ExperimentRun {
  id: string;
  strategy_version_id: string | null;
  run_type: string;
  lifecycle_status: string;
  metric_snapshot: {
    sharpe: number | null;
    max_drawdown: number | null;
    turnover: number | null;
    cost_drag: number | null;
    sample_size: number | null;
  };
  dataset_lineage: {
    dataset_version_id: string;
    universe_version_id: string;
    execution_profile_id: string;
  };
}

export interface ModelVersion {
  id: string;
  model_key: string;
  route_alias: string;
  provider: string;
  semantic_version: string;
  status: string;
  endpoint: string | null;
}

export interface PromptVersion {
  id: string;
  task_key: string;
  semantic_version: string;
  status: string;
  hash: string;
}

export interface WorkflowRun {
  id: string;
  workflow_key: string;
  workflow_version: string;
  trigger_type: string;
  status: string;
  trace_id: string | null;
  attempt_count: number;
}

export interface RecommendationReview {
  id: string;
  decision_snapshot_id: string;
  action_id: string | null;
  review_type: string;
  score: number | null;
  notes: string | null;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function availability(value: unknown): AvailabilityStatus {
  const normalized = String(value || 'UNKNOWN').toUpperCase();
  if (
    normalized === 'DB_BACKED' ||
    normalized === 'MODEL_DERIVED' ||
    normalized === 'PAPER_ONLY' ||
    normalized === 'BACKTEST_ONLY' ||
    normalized === 'WITHHELD' ||
    normalized === 'INSUFFICIENT_DATA' ||
    normalized === 'EXPERIMENTAL'
  ) {
    return normalized;
  }
  return 'UNKNOWN';
}

function toPortfolioIntent(raw: Record<string, unknown>, actionLabel: string): PortfolioIntent {
  const posture = String(raw.exposure_posture || '').toLowerCase();
  const overlap = Number(raw.same_symbol_weight_pct ?? NaN);
  const intent = String(raw.recommendation || raw.focus_symbol || actionLabel || 'wait');
  const actionBias =
    actionLabel.toLowerCase().includes('hedge') || actionLabel.toLowerCase().includes('de-risk')
      ? 'hedge'
      : actionLabel.toLowerCase().includes('trim')
        ? 'trim'
        : actionLabel.toLowerCase().includes('rotate')
          ? 'rotate'
          : actionLabel.toLowerCase().includes('add')
            ? 'add'
            : actionLabel.toLowerCase().includes('wait')
              ? 'wait'
              : 'open';

  return {
    intent,
    universal_signal: raw.availability === 'UNPERSONALIZED',
    personalized: raw.availability !== 'UNPERSONALIZED',
    overlap_pct: Number.isFinite(overlap) ? overlap : null,
    concentration_warning: String(raw.concentration_note || '').trim() || null,
    action_bias: actionBias
  };
}

export function toRiskStateContract(row: DecisionSnapshotRecord): RiskState {
  const risk = parseJson<Record<string, unknown>>(row.risk_state_json, {});
  return {
    posture: String(risk.posture || risk.risk_posture || 'WAIT'),
    label: String(risk.label || risk.user_message || 'No clear posture'),
    summary: String(risk.user_message || risk.summary || 'No risk summary available.'),
    source_status: availability(row.source_status),
    data_status: availability(row.data_status),
    regime_id: String(risk.regime_id || '').trim() || null,
    market_climate: String(risk.market_climate || '').trim() || null,
    risk_budget_state: String(risk.risk_budget_state || '').trim() || null
  };
}

export function toActionCardContracts(row: DecisionSnapshotRecord): ActionCard[] {
  const actions = parseJson<Array<Record<string, unknown>>>(row.actions_json, []);
  const portfolioContext = parseJson<Record<string, unknown>>(row.portfolio_context_json, {});
  return actions.map((action, index) => {
    const evidenceBundle = ((action.evidence_bundle as Record<string, unknown> | undefined) || {});
    return {
      action_id: String(action.action_id || `action-${index + 1}`),
      signal_id: String(action.signal_id || '').trim() || null,
      symbol: String(action.symbol || '').trim() || null,
      market: (String(action.market || row.market || 'ALL').toUpperCase() as Market | 'ALL'),
      asset_class: (String(action.asset_class || row.asset_class || 'ALL').toUpperCase() as AssetClass | 'ALL'),
      action_label: String(action.action_label || action.action || 'Wait'),
      rank: index + 1,
      ranking_score: Number(action.ranking_score || 0),
      conviction: Number.isFinite(Number(action.confidence)) ? Number(action.confidence) : null,
      horizon: String(action.time_horizon || '').trim() || null,
      why_now: String(action.brief_why_now || '').trim() || null,
      caution: String(action.brief_caution || action.risk_note || '').trim() || null,
      invalidation: String(evidenceBundle.invalidation || '').trim() || null,
      portfolio_intent: toPortfolioIntent(portfolioContext, String(action.action_label || action.action || 'Wait')),
      source_status: availability(action.source_status || row.source_status),
      data_status: availability(action.data_status || row.data_status)
    };
  });
}

export function toEvidenceBundleContracts(row: DecisionSnapshotRecord): EvidenceBundle[] {
  const actions = parseJson<Array<Record<string, unknown>>>(row.actions_json, []);
  return actions.map((action) => {
    const evidence = (action.evidence_bundle || {}) as Record<string, unknown>;
    const evidenceInvalidation = String((evidence as Record<string, unknown>).invalidation || '').trim();
    return {
      action_id: String(action.action_id || ''),
      thesis: String(evidence.thesis || action.brief_why_now || 'No thesis recorded.'),
      supporting_factors: Array.isArray(evidence.supporting_factors) ? evidence.supporting_factors.map(String) : [],
      opposing_factors: Array.isArray(evidence.opposing_factors) ? evidence.opposing_factors.map(String) : [],
      regime_context: typeof evidence.regime_context === 'object' && evidence.regime_context ? (evidence.regime_context as Record<string, unknown>) : {},
      ranking_reason: String(evidence.ranking_reason || '').trim() || null,
      invalidation_conditions: Array.isArray(evidence.invalidation_conditions)
        ? evidence.invalidation_conditions.map(String)
        : evidenceInvalidation
          ? [evidenceInvalidation]
          : String(action.brief_caution || '').trim()
            ? [String(action.brief_caution)]
          : [],
      horizon: String(action.time_horizon || '').trim() || null,
      previous_change: typeof evidence.previous_change === 'object' && evidence.previous_change ? (evidence.previous_change as Record<string, unknown>) : null,
      similar_case_summary: String(evidence.similar_case_summary || '').trim() || null,
      generated_at: String(evidence.generated_at || '').trim() || null,
      source_status: availability(action.source_status || row.source_status),
      data_status: availability(action.data_status || row.data_status)
    };
  });
}

export function toExperimentRunContract(
  experiment: ExperimentRegistryRecord,
  run: BacktestRunRecord | null,
  metric: BacktestMetricRecord | null
): ExperimentRun {
  return {
    id: experiment.id,
    strategy_version_id: experiment.strategy_version_id,
    run_type: run?.run_type || 'unknown',
    lifecycle_status: experiment.decision_status,
    metric_snapshot: {
      sharpe: metric?.sharpe ?? null,
      max_drawdown: metric?.max_drawdown ?? null,
      turnover: metric?.turnover ?? null,
      cost_drag: metric?.cost_drag ?? null,
      sample_size: metric?.sample_size ?? null
    },
    dataset_lineage: {
      dataset_version_id: run?.dataset_version_id || 'unknown',
      universe_version_id: run?.universe_version_id || 'unknown',
      execution_profile_id: run?.execution_profile_id || 'unknown'
    }
  };
}

export function toStrategyCandidateContract(
  experiment: ExperimentRegistryRecord,
  run: BacktestRunRecord | null,
  metric: BacktestMetricRecord | null
): StrategyCandidate {
  const status = experiment.decision_status;
  const benchmarkRole =
    status === 'champion'
      ? 'champion'
      : status === 'challenger'
        ? 'challenger'
        : status === 'candidate'
          ? 'candidate'
          : 'benchmark';
  const evidenceQuality =
    metric?.status === 'READY'
      ? metric.sample_size >= 20
        ? 'high'
        : 'medium'
      : metric?.status === 'WITHHELD'
        ? 'withheld'
        : 'low';
  return {
    id: experiment.id,
    strategy_version_id: experiment.strategy_version_id,
    family: run?.strategy_version_id || 'unknown',
    status,
    benchmark_role: benchmarkRole,
    evidence_quality: evidenceQuality,
    notes: experiment.promotion_reason || experiment.demotion_reason || run?.notes || null
  };
}

export function toModelVersionContract(row: ModelVersionRecord): ModelVersion {
  return {
    id: row.id,
    model_key: row.model_key,
    route_alias: row.model_key,
    provider: row.provider,
    semantic_version: row.semantic_version,
    status: row.status,
    endpoint: row.endpoint
  };
}

export function toPromptVersionContract(row: PromptVersionRecord): PromptVersion {
  return {
    id: row.id,
    task_key: row.task_key,
    semantic_version: row.semantic_version,
    status: row.status,
    hash: row.prompt_hash
  };
}

export function toWorkflowRunContract(row: WorkflowRunRecord): WorkflowRun {
  return {
    id: row.id,
    workflow_key: row.workflow_key,
    workflow_version: row.workflow_version,
    trigger_type: row.trigger_type,
    status: row.status,
    trace_id: row.trace_id,
    attempt_count: row.attempt_count
  };
}

export function toRecommendationReviewContract(row: RecommendationReviewRecord): RecommendationReview {
  return {
    id: row.id,
    decision_snapshot_id: row.decision_snapshot_id,
    action_id: row.action_id,
    review_type: row.review_type,
    score: row.score,
    notes: row.notes
  };
}

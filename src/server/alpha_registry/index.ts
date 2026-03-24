import { createHash, randomUUID } from 'node:crypto';
import type {
  AlphaCandidateRecord,
  AlphaEvaluationRecord,
  AlphaIntegrationPath,
  AlphaLifecycleEventRecord,
  AlphaLifecycleState,
  Market,
} from '../types.js';
import type { MarketRepository } from '../db/repository.js';

type JsonObject = Record<string, unknown>;
type JsonValue = JsonObject | unknown[] | string | number | boolean | null;

export type AutonomousAlphaCandidate = {
  id: string;
  thesis: string;
  family: string;
  formula: JsonObject;
  params: Record<string, number | string | boolean | null>;
  feature_dependencies: string[];
  regime_constraints: string[];
  compatible_markets: Market[];
  intended_holding_period: string;
  entry_logic: JsonObject;
  exit_logic: JsonObject;
  sizing_hint: JsonObject;
  required_inputs: string[];
  complexity_score: number;
  integration_path: AlphaIntegrationPath;
  created_at: string;
  source: 'autonomous_discovery';
  strategy_candidate: Record<string, unknown> | null;
  notes?: string[];
  parent_alpha_id?: string | null;
};

export type AlphaEvaluationMetrics = {
  net_pnl: number | null;
  sharpe: number | null;
  sortino: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  payoff_ratio: number | null;
  turnover: number | null;
  cost_sensitivity: {
    plus_25pct_cost: number | null;
    plus_50pct_cost: number | null;
    strict_fill: number | null;
  };
  performance_by_subperiod: Array<{ window_id: string; test_return: number; drawdown: number }>;
  performance_by_regime: Array<{ regime: string; return: number; drawdown: number }>;
  stability_score: number;
  correlation_to_active: number;
  complexity_score: number;
  concentration_score: number;
  backtest_proxy: {
    gross_return: number | null;
    net_return: number | null;
    note: string;
  };
  proxy_only: boolean;
};

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseJson<T extends JsonValue>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function buildStableAlphaId(seed: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(seed)).digest('hex').slice(0, 16);
  return `alpha-${digest}`;
}

export function parseAlphaCandidateRecord(record: AlphaCandidateRecord): AutonomousAlphaCandidate {
  const metadata = parseJson<{
    required_inputs?: string[];
    notes?: string[];
    strategy_candidate?: Record<string, unknown> | null;
    created_at?: string;
  }>(record.metadata_json, {});
  return {
    id: record.id,
    thesis: record.thesis,
    family: record.family,
    formula: parseJson(record.formula_json, {}),
    params: parseJson(record.params_json, {}),
    feature_dependencies: parseJson<string[]>(record.feature_dependencies_json, []),
    regime_constraints: parseJson<string[]>(record.regime_constraints_json, []),
    compatible_markets: parseJson<Market[]>(record.compatible_markets_json, []),
    intended_holding_period: record.holding_period,
    entry_logic: parseJson(record.entry_logic_json, {}),
    exit_logic: parseJson(record.exit_logic_json, {}),
    sizing_hint: parseJson(record.sizing_hint_json, {}),
    required_inputs: metadata.required_inputs || [],
    complexity_score: record.complexity_score,
    integration_path: record.integration_path,
    created_at: metadata.created_at || new Date(record.created_at_ms).toISOString(),
    source: 'autonomous_discovery',
    strategy_candidate: metadata.strategy_candidate || null,
    notes: metadata.notes || [],
    parent_alpha_id: record.parent_alpha_id,
  };
}

export function buildAlphaCandidateRecord(args: {
  candidate: AutonomousAlphaCandidate;
  status?: AlphaLifecycleState;
  acceptanceScore?: number | null;
  evaluationId?: string | null;
  rejectionReason?: string | null;
  promotionReason?: string | null;
  createdAtMs?: number;
  updatedAtMs?: number;
}): AlphaCandidateRecord {
  const createdAtMs =
    args.createdAtMs ??
    (() => {
      const parsed = Date.parse(args.candidate.created_at);
      return Number.isFinite(parsed) ? parsed : Date.now();
    })();
  const updatedAtMs = args.updatedAtMs ?? Date.now();

  return {
    id: args.candidate.id,
    thesis: args.candidate.thesis,
    family: args.candidate.family,
    formula_json: JSON.stringify(args.candidate.formula),
    params_json: JSON.stringify(args.candidate.params),
    feature_dependencies_json: JSON.stringify(args.candidate.feature_dependencies),
    regime_constraints_json: JSON.stringify(args.candidate.regime_constraints),
    compatible_markets_json: JSON.stringify(args.candidate.compatible_markets),
    holding_period: args.candidate.intended_holding_period,
    entry_logic_json: JSON.stringify(args.candidate.entry_logic),
    exit_logic_json: JSON.stringify(args.candidate.exit_logic),
    sizing_hint_json: JSON.stringify(args.candidate.sizing_hint),
    integration_path: args.candidate.integration_path,
    complexity_score: round(args.candidate.complexity_score, 4),
    source: args.candidate.source,
    status: args.status ?? 'DRAFT',
    parent_alpha_id: args.candidate.parent_alpha_id ?? null,
    acceptance_score: args.acceptanceScore ?? null,
    last_evaluation_id: args.evaluationId ?? null,
    last_rejection_reason: args.rejectionReason ?? null,
    last_promotion_reason: args.promotionReason ?? null,
    metadata_json: JSON.stringify({
      required_inputs: args.candidate.required_inputs,
      notes: args.candidate.notes || [],
      strategy_candidate: args.candidate.strategy_candidate,
      created_at: args.candidate.created_at,
    }),
    created_at_ms: createdAtMs,
    updated_at_ms: updatedAtMs,
  };
}

export function persistAlphaCandidate(
  repo: MarketRepository,
  args: {
    candidate: AutonomousAlphaCandidate;
    status?: AlphaLifecycleState;
    acceptanceScore?: number | null;
    evaluationId?: string | null;
    rejectionReason?: string | null;
    promotionReason?: string | null;
  },
): AlphaCandidateRecord {
  const existing = repo.getAlphaCandidate(args.candidate.id);
  const record = buildAlphaCandidateRecord({
    candidate: args.candidate,
    status: args.status ?? existing?.status ?? 'DRAFT',
    acceptanceScore: args.acceptanceScore ?? existing?.acceptance_score ?? null,
    evaluationId: args.evaluationId ?? existing?.last_evaluation_id ?? null,
    rejectionReason: args.rejectionReason ?? existing?.last_rejection_reason ?? null,
    promotionReason: args.promotionReason ?? existing?.last_promotion_reason ?? null,
    createdAtMs: existing?.created_at_ms,
    updatedAtMs: Date.now(),
  });
  repo.upsertAlphaCandidate(record);
  if (!existing) {
    repo.insertAlphaLifecycleEvent({
      id: `alpha-life-${randomUUID()}`,
      alpha_candidate_id: record.id,
      from_status: null,
      to_status: record.status,
      reason: 'registered',
      payload_json: JSON.stringify({
        source: record.source,
        family: record.family,
      }),
      created_at_ms: record.updated_at_ms,
    });
  }
  return record;
}

export function transitionAlphaCandidate(
  repo: MarketRepository,
  args: {
    alphaCandidateId: string;
    toStatus: AlphaLifecycleState;
    reason?: string | null;
    payload?: JsonObject;
    acceptanceScore?: number | null;
    evaluationId?: string | null;
  },
): AlphaCandidateRecord | null {
  const existing = repo.getAlphaCandidate(args.alphaCandidateId);
  if (!existing) return null;
  if (
    existing.status === args.toStatus &&
    !args.reason &&
    args.acceptanceScore === undefined &&
    args.evaluationId === undefined
  ) {
    return existing;
  }

  const updated: AlphaCandidateRecord = {
    ...existing,
    status: args.toStatus,
    acceptance_score: args.acceptanceScore ?? existing.acceptance_score,
    last_evaluation_id: args.evaluationId ?? existing.last_evaluation_id,
    last_rejection_reason:
      args.toStatus === 'REJECTED'
        ? (args.reason ?? existing.last_rejection_reason)
        : existing.last_rejection_reason,
    last_promotion_reason:
      args.toStatus === 'BACKTEST_PASS' ||
      args.toStatus === 'SHADOW' ||
      args.toStatus === 'CANARY' ||
      args.toStatus === 'PROD'
        ? (args.reason ?? existing.last_promotion_reason)
        : existing.last_promotion_reason,
    updated_at_ms: Date.now(),
  };

  repo.upsertAlphaCandidate(updated);
  const event: AlphaLifecycleEventRecord = {
    id: `alpha-life-${randomUUID()}`,
    alpha_candidate_id: updated.id,
    from_status: existing.status,
    to_status: updated.status,
    reason: args.reason ?? null,
    payload_json: JSON.stringify(args.payload || {}),
    created_at_ms: updated.updated_at_ms,
  };
  repo.insertAlphaLifecycleEvent(event);
  return updated;
}

function shadowStatsForCandidate(repo: MarketRepository, alphaCandidateId: string) {
  const rows = repo.listAlphaShadowObservations({ alphaCandidateId, limit: 400 });
  const realized = rows.filter((row) => Number.isFinite(row.realized_pnl_pct));
  const pnlSeries = realized.map((row) => Number(row.realized_pnl_pct || 0));
  const expectancy = pnlSeries.length
    ? pnlSeries.reduce((sum, value) => sum + value, 0) / pnlSeries.length
    : null;
  const wins = pnlSeries.filter((value) => value > 0).length;
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of pnlSeries) {
    equity *= 1 + value / 100;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, (equity - peak) / peak);
  }
  const mean = pnlSeries.length
    ? pnlSeries.reduce((sum, value) => sum + value, 0) / pnlSeries.length
    : 0;
  const variance =
    pnlSeries.length > 1
      ? pnlSeries.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (pnlSeries.length - 1)
      : 0;
  const sigma = Math.sqrt(Math.max(variance, 0));
  const sharpe =
    pnlSeries.length > 1 && sigma > 0
      ? round((mean / sigma) * Math.sqrt(Math.min(pnlSeries.length, 252)), 4)
      : null;

  return {
    total_observations: rows.length,
    realized_sample_size: realized.length,
    expectancy: expectancy === null ? null : round(expectancy, 4),
    win_rate: realized.length ? round(wins / realized.length, 4) : null,
    max_drawdown: realized.length ? round(Math.abs(maxDrawdown), 4) : null,
    sharpe,
  };
}

export function buildAlphaRegistrySummary(repo: MarketRepository) {
  const candidates = repo.listAlphaCandidates({ limit: 200 });
  const evaluations = candidates
    .map((candidate) => repo.getLatestAlphaEvaluation(candidate.id))
    .filter((row): row is AlphaEvaluationRecord => Boolean(row));
  const lifecycleEvents = repo.listAlphaLifecycleEvents({ limit: 120 });

  const records = candidates.map((candidate) => {
    const latestEval = evaluations.find((row) => row.alpha_candidate_id === candidate.id) || null;
    const metrics = latestEval
      ? parseJson<AlphaEvaluationMetrics & JsonObject>(
          latestEval.metrics_json,
          {} as AlphaEvaluationMetrics & JsonObject,
        )
      : null;
    const shadow = shadowStatsForCandidate(repo, candidate.id);
    return {
      id: candidate.id,
      thesis: candidate.thesis,
      family: candidate.family,
      status: candidate.status,
      integration_path: candidate.integration_path,
      acceptance_score: candidate.acceptance_score,
      latest_evaluation_status: latestEval?.evaluation_status || null,
      correlation_to_active: metrics?.correlation_to_active ?? null,
      stability_score: metrics?.stability_score ?? null,
      shadow,
    };
  });

  const topCandidates = [...records]
    .filter((row) => ['BACKTEST_PASS', 'SHADOW', 'CANARY'].includes(row.status))
    .sort((a, b) => Number(b.acceptance_score || 0) - Number(a.acceptance_score || 0))
    .slice(0, 10);

  const decayingCandidates = records
    .filter((row) => ['SHADOW', 'CANARY', 'PROD'].includes(row.status))
    .filter(
      (row) =>
        Number(row.shadow.expectancy || 0) < 0 || Number(row.shadow.max_drawdown || 0) > 0.18,
    )
    .slice(0, 10);

  const correlationMap = topCandidates.map((row) => ({
    alpha_id: row.id,
    family: row.family,
    correlation_to_active: row.correlation_to_active,
  }));

  const statusCounts = candidates.reduce<Record<string, number>>((acc, candidate) => {
    acc[candidate.status] = (acc[candidate.status] || 0) + 1;
    return acc;
  }, {});

  return {
    counts: statusCounts,
    records,
    top_candidates: topCandidates,
    decaying_candidates: decayingCandidates,
    correlation_map: correlationMap,
    state_transitions: lifecycleEvents.slice(0, 20).map((row) => ({
      alpha_id: row.alpha_candidate_id,
      from_status: row.from_status,
      to_status: row.to_status,
      reason: row.reason,
      created_at: new Date(row.created_at_ms).toISOString(),
    })),
  };
}

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
  bar_replay: {
    source: string | null;
    closed_trades: number;
    symbols_with_trades: number;
    sample_trades: Array<Record<string, unknown>>;
  };
  research_evidence?: {
    hypothesis_id: string;
    template_id: string;
    public_reference_ids: string[];
    public_reference_urls: string[];
    hypothesis_title: string | null;
    template_name: string | null;
    evidence_path: string;
  };
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

function alphaLineage(record: AlphaCandidateRecord) {
  const formula = parseJson<JsonObject>(record.formula_json, {});
  const metadata = parseJson<{
    strategy_candidate?: Record<string, unknown> | null;
  }>(record.metadata_json, {});
  const strategyCandidate = metadata.strategy_candidate || {};
  return {
    hypothesis_id:
      String(formula.hypothesis_id || strategyCandidate.hypothesis_id || '').trim() || 'unknown',
    template_id:
      String(formula.template_id || strategyCandidate.template_id || '').trim() || 'unknown',
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

function shadowStatsFromPnl(pnlSeries: number[]) {
  const expectancy = pnlSeries.length
    ? pnlSeries.reduce((sum, v) => sum + v, 0) / pnlSeries.length
    : null;
  const wins = pnlSeries.filter((v) => v > 0).length;
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const v of pnlSeries) {
    equity *= 1 + v / 100;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, (equity - peak) / peak);
  }
  const mean = pnlSeries.length ? pnlSeries.reduce((sum, v) => sum + v, 0) / pnlSeries.length : 0;
  const variance =
    pnlSeries.length > 1
      ? pnlSeries.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (pnlSeries.length - 1)
      : 0;
  const sigma = Math.sqrt(Math.max(variance, 0));
  const sharpe =
    pnlSeries.length > 1 && sigma > 0
      ? round((mean / sigma) * Math.sqrt(Math.min(pnlSeries.length, 252)), 4)
      : null;
  return {
    expectancy: expectancy === null ? null : round(expectancy, 4),
    win_rate: pnlSeries.length ? round(wins / pnlSeries.length, 4) : null,
    max_drawdown: pnlSeries.length ? round(Math.abs(maxDrawdown), 4) : null,
    sharpe,
  };
}

function buildHypothesisYieldBoard(args: {
  candidates: AlphaCandidateRecord[];
  evalMap: Map<string, AlphaEvaluationRecord>;
  shadowMap: Map<
    string,
    {
      total_observations: number;
      realized_sample_size: number;
      pnl_values: number[];
    }
  >;
}) {
  type Bucket = {
    hypothesis_id: string;
    template_id: string;
    family: string;
    candidates_generated: number;
    evaluated: number;
    pass: number;
    watch: number;
    reject: number;
    promoted_or_live: number;
    replay_evaluated: number;
    shadow_observations: number;
    realized_sample_size: number;
    alpha_ids: string[];
    acceptance_scores: number[];
    shadow_pnl: number[];
  };

  const buckets = new Map<string, Bucket>();

  for (const candidate of args.candidates) {
    const lineage = alphaLineage(candidate);
    const key = `${lineage.hypothesis_id}::${lineage.template_id}::${candidate.family}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        hypothesis_id: lineage.hypothesis_id,
        template_id: lineage.template_id,
        family: candidate.family,
        candidates_generated: 0,
        evaluated: 0,
        pass: 0,
        watch: 0,
        reject: 0,
        promoted_or_live: 0,
        replay_evaluated: 0,
        shadow_observations: 0,
        realized_sample_size: 0,
        alpha_ids: [],
        acceptance_scores: [],
        shadow_pnl: [],
      };
      buckets.set(key, bucket);
    }

    bucket.candidates_generated += 1;
    bucket.alpha_ids.push(candidate.id);
    if (['BACKTEST_PASS', 'SHADOW', 'CANARY', 'PROD'].includes(candidate.status)) {
      bucket.promoted_or_live += 1;
    }
    if (candidate.acceptance_score !== null)
      bucket.acceptance_scores.push(candidate.acceptance_score);

    const latestEval = args.evalMap.get(candidate.id);
    if (latestEval) {
      bucket.evaluated += 1;
      bucket.acceptance_scores.push(latestEval.acceptance_score);
      if (latestEval.evaluation_status === 'PASS') bucket.pass += 1;
      if (latestEval.evaluation_status === 'WATCH') bucket.watch += 1;
      if (latestEval.evaluation_status === 'REJECT') bucket.reject += 1;
      const metrics = parseJson<AlphaEvaluationMetrics & JsonObject>(
        latestEval.metrics_json,
        {} as AlphaEvaluationMetrics & JsonObject,
      );
      if (metrics.proxy_only === false) bucket.replay_evaluated += 1;
    }

    const shadow = args.shadowMap.get(candidate.id);
    if (shadow) {
      bucket.shadow_observations += shadow.total_observations;
      bucket.realized_sample_size += shadow.realized_sample_size;
      bucket.shadow_pnl.push(...shadow.pnl_values);
    }
  }

  return [...buckets.values()]
    .map((bucket) => {
      const acceptance = bucket.acceptance_scores.length
        ? bucket.acceptance_scores.reduce((sum, value) => sum + value, 0) /
          bucket.acceptance_scores.length
        : null;
      const shadow = shadowStatsFromPnl(bucket.shadow_pnl);
      const passRate = bucket.evaluated ? bucket.pass / bucket.evaluated : 0;
      const promotionRate = bucket.candidates_generated
        ? bucket.promoted_or_live / bucket.candidates_generated
        : 0;
      const replayRate = bucket.evaluated ? bucket.replay_evaluated / bucket.evaluated : 0;
      const shadowEdge = Math.max(-0.25, Math.min(0.25, Number(shadow.expectancy || 0) / 8));
      const yieldScore =
        passRate * 0.32 +
        promotionRate * 0.24 +
        replayRate * 0.12 +
        Math.max(0, Number(acceptance || 0)) * 0.2 +
        (0.12 + shadowEdge);

      return {
        hypothesis_id: bucket.hypothesis_id,
        template_id: bucket.template_id,
        family: bucket.family,
        candidates_generated: bucket.candidates_generated,
        evaluated: bucket.evaluated,
        pass: bucket.pass,
        watch: bucket.watch,
        reject: bucket.reject,
        promoted_or_live: bucket.promoted_or_live,
        replay_evaluated: bucket.replay_evaluated,
        shadow_observations: bucket.shadow_observations,
        realized_sample_size: bucket.realized_sample_size,
        mean_acceptance_score: acceptance === null ? null : round(acceptance, 4),
        shadow_expectancy_pct: shadow.expectancy,
        shadow_sharpe: shadow.sharpe,
        pass_rate: round(passRate, 4),
        promotion_rate: round(promotionRate, 4),
        replay_evaluation_rate: round(replayRate, 4),
        yield_score: round(Math.max(0, yieldScore), 4),
        top_alpha_ids: bucket.alpha_ids.slice(0, 6),
      };
    })
    .sort((a, b) => b.yield_score - a.yield_score)
    .slice(0, 40);
}

export function buildAlphaRegistrySummary(repo: MarketRepository) {
  const candidates = repo.listAlphaCandidates({ limit: 200 });
  const candidateIds = candidates.map((c) => c.id);

  // Batch queries instead of N+1
  const evalMap = repo.getLatestAlphaEvaluationsBatch(candidateIds);
  const shadowMap = repo.getAlphaShadowStatsBatch(candidateIds);
  const lifecycleEvents = repo.listAlphaLifecycleEvents({ limit: 120 });

  const records = candidates.map((candidate) => {
    const latestEval = evalMap.get(candidate.id) || null;
    const metrics = latestEval
      ? parseJson<AlphaEvaluationMetrics & JsonObject>(
          latestEval.metrics_json,
          {} as AlphaEvaluationMetrics & JsonObject,
        )
      : null;
    const raw = shadowMap.get(candidate.id);
    const shadow = raw
      ? {
          total_observations: raw.total_observations,
          realized_sample_size: raw.realized_sample_size,
          ...shadowStatsFromPnl(raw.pnl_values),
        }
      : {
          total_observations: 0,
          realized_sample_size: 0,
          expectancy: null,
          win_rate: null,
          max_drawdown: null,
          sharpe: null,
        };
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
  const hypothesisYieldBoard = buildHypothesisYieldBoard({
    candidates,
    evalMap,
    shadowMap,
  });

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
    hypothesis_yield_board: hypothesisYieldBoard,
  };
}

import { randomUUID } from 'node:crypto';
import type { AlphaEvaluationRecord, AlphaLifecycleState } from '../types.js';
import type { MarketRepository } from '../db/repository.js';
import { transitionAlphaCandidate } from '../alpha_registry/index.js';
import { summarizeAlphaShadowPerformance, runAlphaShadowCycle } from '../alpha_shadow_runner/index.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';

type GuardThresholds = {
  minAcceptanceScore: number;
  maxCorrelationToActive: number;
  shadowAdmission: {
    minAcceptanceScore: number;
    maxDrawdown: number;
  };
  shadowPromotion: {
    minSampleSize: number;
    minSharpe: number;
    minExpectancy: number;
    maxDrawdown: number;
    minApprovalRate: number;
    maxBacktestDegradation: number;
  };
  retirement: {
    minExpectancy: number;
    maxDrawdown: number;
    decayStreakLimit: number;
  };
  allowProdPromotion: boolean;
};

type EvaluatedCandidateLike = {
  candidate: {
    id: string;
    integration_path: string;
  };
  evaluation: AlphaEvaluationRecord;
  metrics: {
    correlation_to_active: number;
    max_drawdown: number | null;
    sharpe: number | null;
    net_pnl: number | null;
  };
  rejectionReasons: string[];
  recommendedState: 'REJECTED' | 'BACKTEST_PASS' | 'DRAFT';
};

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseJson<T = Record<string, unknown>>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function max(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

function buildPromotionReason(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('; ');
}

function shadowGatePass(args: {
  backtestSharpe: number | null;
  backtestNetPnl: number | null;
  shadow: ReturnType<typeof summarizeAlphaShadowPerformance>;
  correlationToActive: number;
  thresholds: GuardThresholds['shadowPromotion'];
  maxCorrelationToActive: number;
}) {
  const degradationFloor =
    args.backtestSharpe && Number.isFinite(args.backtestSharpe)
      ? args.backtestSharpe * (1 - args.thresholds.maxBacktestDegradation)
      : null;
  const sharpePass =
    args.shadow.sharpe !== null &&
    args.shadow.sharpe >= args.thresholds.minSharpe &&
    (degradationFloor === null || args.shadow.sharpe >= degradationFloor);
  const expectancyPass =
    args.shadow.expectancy !== null &&
    args.shadow.expectancy >= args.thresholds.minExpectancy &&
    (args.backtestNetPnl === null || args.backtestNetPnl <= 0 || args.shadow.expectancy > 0);
  const ddPass =
    args.shadow.max_drawdown !== null &&
    args.shadow.max_drawdown <= args.thresholds.maxDrawdown;
  const approvalPass = args.shadow.approval_rate >= args.thresholds.minApprovalRate;
  const corrPass = args.correlationToActive <= args.maxCorrelationToActive;
  const samplePass = args.shadow.sample_size >= args.thresholds.minSampleSize;

  return {
    pass: samplePass && sharpePass && expectancyPass && ddPass && approvalPass && corrPass,
    checks: {
      samplePass,
      sharpePass,
      expectancyPass,
      ddPass,
      approvalPass,
      corrPass
    }
  };
}

function retirementReason(args: {
  shadow: ReturnType<typeof summarizeAlphaShadowPerformance>;
  thresholds: GuardThresholds['retirement'];
  staleNegativeStreak: number;
}): string | null {
  if (args.shadow.sample_size <= 0) return null;
  if (args.shadow.expectancy !== null && args.shadow.expectancy <= args.thresholds.minExpectancy) {
    return 'shadow_expectancy_below_retirement_threshold';
  }
  if (args.shadow.max_drawdown !== null && args.shadow.max_drawdown >= args.thresholds.maxDrawdown) {
    return 'shadow_drawdown_breached_retirement_threshold';
  }
  if (args.staleNegativeStreak >= args.thresholds.decayStreakLimit) {
    return 'shadow_decay_streak_exceeded';
  }
  return null;
}

function negativeShadowStreak(repo: MarketRepository, alphaCandidateId: string) {
  const rows = repo.listAlphaShadowObservations({ alphaCandidateId, limit: 120 });
  let streak = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.realized_pnl_pct)) continue;
    if (Number(row.realized_pnl_pct || 0) >= 0) break;
    streak += 1;
  }
  return streak;
}

export function reviewAlphaBacktestOutcomes(args: {
  repo: MarketRepository;
  evaluated: EvaluatedCandidateLike[];
  thresholds: GuardThresholds;
}) {
  const accepted: string[] = [];
  const rejected: string[] = [];
  const watchlist: string[] = [];

  for (const item of args.evaluated) {
    const correlationHit = item.metrics.correlation_to_active > args.thresholds.maxCorrelationToActive;
    const drawdownHit =
      item.metrics.max_drawdown !== null && item.metrics.max_drawdown > args.thresholds.shadowAdmission.maxDrawdown;

    if (
      item.evaluation.evaluation_status === 'REJECT' ||
      correlationHit ||
      drawdownHit
    ) {
      transitionAlphaCandidate(args.repo, {
        alphaCandidateId: item.candidate.id,
        toStatus: 'REJECTED',
        reason: buildPromotionReason([
          'alpha_evaluator_rejected_candidate',
          item.rejectionReasons.join(', ') || null,
          correlationHit ? 'correlation_limit_breached' : null,
          drawdownHit ? 'drawdown_limit_breached' : null
        ]),
        payload: {
          evaluation_id: item.evaluation.id,
          acceptance_score: item.evaluation.acceptance_score,
          rejection_reasons: item.rejectionReasons
        },
        acceptanceScore: item.evaluation.acceptance_score,
        evaluationId: item.evaluation.id
      });
      rejected.push(item.candidate.id);
      continue;
    }

    if (
      item.evaluation.acceptance_score >= args.thresholds.shadowAdmission.minAcceptanceScore &&
      (item.recommendedState === 'BACKTEST_PASS' || item.evaluation.evaluation_status === 'WATCH')
    ) {
      transitionAlphaCandidate(args.repo, {
        alphaCandidateId: item.candidate.id,
        toStatus: 'BACKTEST_PASS',
        reason: buildPromotionReason([
          item.evaluation.evaluation_status === 'PASS' ? 'passed_proxy_backtest_acceptance_gate' : 'admitted_to_shadow_via_relaxed_shadow_admission_gate',
          `acceptance_score=${round(item.evaluation.acceptance_score, 4)}`,
          `integration_path=${item.candidate.integration_path}`
        ]),
        payload: {
          evaluation_id: item.evaluation.id,
          acceptance_score: item.evaluation.acceptance_score
        },
        acceptanceScore: item.evaluation.acceptance_score,
        evaluationId: item.evaluation.id
      });
      transitionAlphaCandidate(args.repo, {
        alphaCandidateId: item.candidate.id,
        toStatus: 'SHADOW',
        reason: 'accepted_candidates_must_enter_shadow_first',
        payload: {
          evaluation_id: item.evaluation.id,
          acceptance_score: item.evaluation.acceptance_score
        },
        acceptanceScore: item.evaluation.acceptance_score,
        evaluationId: item.evaluation.id
      });
      accepted.push(item.candidate.id);
      continue;
    }

    transitionAlphaCandidate(args.repo, {
      alphaCandidateId: item.candidate.id,
      toStatus: 'DRAFT',
      reason: 'candidate_held_for_retest',
      payload: {
        evaluation_id: item.evaluation.id,
        acceptance_score: item.evaluation.acceptance_score
      },
      acceptanceScore: item.evaluation.acceptance_score,
      evaluationId: item.evaluation.id
    });
    watchlist.push(item.candidate.id);
  }

  return {
    accepted,
    rejected,
    watchlist
  };
}

export function reviewAlphaShadowCandidates(args: {
  repo: MarketRepository;
  thresholds: GuardThresholds;
}) {
  const rows = args.repo.listAlphaCandidates({ limit: 200 }).filter((row) =>
    ['SHADOW', 'CANARY', 'PROD'].includes(row.status)
  );

  const promotedToCanary: string[] = [];
  const promotedToProd: string[] = [];
  const retired: string[] = [];
  const held: string[] = [];

  for (const row of rows) {
    const latestEval = args.repo.getLatestAlphaEvaluation(row.id);
    const metrics = latestEval
      ? parseJson<{
          correlation_to_active?: number;
          sharpe?: number | null;
          net_pnl?: number | null;
        }>(latestEval.metrics_json, {})
      : {};
    const shadow = summarizeAlphaShadowPerformance(args.repo, row.id);
    const streak = negativeShadowStreak(args.repo, row.id);
    const retireBecause = retirementReason({
      shadow,
      thresholds: args.thresholds.retirement,
      staleNegativeStreak: streak
    });

    if (retireBecause) {
      transitionAlphaCandidate(args.repo, {
        alphaCandidateId: row.id,
        toStatus: 'RETIRED',
        reason: retireBecause,
        payload: {
          shadow,
          streak,
          latest_evaluation_id: latestEval?.id || null
        }
      });
      retired.push(row.id);
      continue;
    }

    if (row.status === 'SHADOW') {
      const gate = shadowGatePass({
        backtestSharpe: typeof metrics.sharpe === 'number' ? metrics.sharpe : null,
        backtestNetPnl: typeof metrics.net_pnl === 'number' ? metrics.net_pnl : null,
        shadow,
        correlationToActive: Number(metrics.correlation_to_active || 0),
        thresholds: args.thresholds.shadowPromotion,
        maxCorrelationToActive: args.thresholds.maxCorrelationToActive
      });
      if (gate.pass) {
        transitionAlphaCandidate(args.repo, {
          alphaCandidateId: row.id,
          toStatus: 'CANARY',
          reason: buildPromotionReason([
            'shadow_thresholds_passed',
            `sample_size=${shadow.sample_size}`,
            `sharpe=${shadow.sharpe ?? 'na'}`,
            `expectancy=${shadow.expectancy ?? 'na'}`
          ]),
          payload: {
            gate_checks: gate.checks,
            shadow,
            latest_evaluation_id: latestEval?.id || null
          }
        });
        promotedToCanary.push(row.id);
        continue;
      }
    }

    if (row.status === 'CANARY' && args.thresholds.allowProdPromotion) {
      const gate = shadowGatePass({
        backtestSharpe: typeof metrics.sharpe === 'number' ? metrics.sharpe : null,
        backtestNetPnl: typeof metrics.net_pnl === 'number' ? metrics.net_pnl : null,
        shadow,
        correlationToActive: Number(metrics.correlation_to_active || 0),
        thresholds: {
          ...args.thresholds.shadowPromotion,
          minSampleSize: Math.max(args.thresholds.shadowPromotion.minSampleSize * 2, 24),
          minSharpe: Math.max(args.thresholds.shadowPromotion.minSharpe, 0.65),
          minApprovalRate: Math.max(args.thresholds.shadowPromotion.minApprovalRate, 0.5)
        },
        maxCorrelationToActive: args.thresholds.maxCorrelationToActive
      });
      if (gate.pass) {
        transitionAlphaCandidate(args.repo, {
          alphaCandidateId: row.id,
          toStatus: 'PROD',
          reason: 'explicit_prod_gate_enabled_and_canary_thresholds_passed',
          payload: {
            gate_checks: gate.checks,
            shadow,
            latest_evaluation_id: latestEval?.id || null
          }
        });
        promotedToProd.push(row.id);
        continue;
      }
    }

    held.push(row.id);
  }

  return {
    promoted_to_canary: promotedToCanary,
    promoted_to_prod: promotedToProd,
    retired,
    held
  };
}

export async function runAlphaShadowMonitoringCycle(args: {
  repo: MarketRepository;
  userId: string;
  triggerType?: 'scheduled' | 'manual' | 'shadow';
  thresholds: GuardThresholds;
}) {
  const workflowId = `workflow-alpha-shadow-${randomUUID().slice(0, 12)}`;
  const traceId = createTraceId('alpha-shadow');
  const now = Date.now();
  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'alpha_shadow_runner',
    workflow_version: 'alpha-shadow-runner.v1',
    trigger_type: args.triggerType || 'shadow',
    status: 'RUNNING',
    trace_id: traceId,
    input_json: JSON.stringify({
      user_id: args.userId
    }),
    output_json: null,
    attempt_count: 1,
    started_at_ms: now,
    updated_at_ms: now,
    completed_at_ms: null
  });

  try {
    const shadow = runAlphaShadowCycle({
      repo: args.repo,
      workflowRunId: workflowId,
      userId: args.userId
    });
    const promotion = reviewAlphaShadowCandidates({
      repo: args.repo,
      thresholds: args.thresholds
    });
    const output = {
      workflow_id: workflowId,
      trace_id: traceId,
      shadow,
      promotion
    };
    args.repo.upsertWorkflowRun({
      id: workflowId,
      workflow_key: 'alpha_shadow_runner',
      workflow_version: 'alpha-shadow-runner.v1',
      trigger_type: args.triggerType || 'shadow',
      status: 'SUCCEEDED',
      trace_id: traceId,
      input_json: JSON.stringify({
        user_id: args.userId
      }),
      output_json: JSON.stringify(output),
      attempt_count: 1,
      started_at_ms: now,
      updated_at_ms: Date.now(),
      completed_at_ms: Date.now()
    });
    recordAuditEvent(args.repo, {
      traceId,
      scope: 'alpha_shadow_runner',
      eventType: 'ALPHA_SHADOW_MONITORING_COMPLETED',
      userId: args.userId,
      entityType: 'workflow_run',
      entityId: workflowId,
      payload: output
    });
    return output;
  } catch (error) {
    args.repo.upsertWorkflowRun({
      id: workflowId,
      workflow_key: 'alpha_shadow_runner',
      workflow_version: 'alpha-shadow-runner.v1',
      trigger_type: args.triggerType || 'shadow',
      status: 'FAILED',
      trace_id: traceId,
      input_json: JSON.stringify({
        user_id: args.userId
      }),
      output_json: JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }),
      attempt_count: 1,
      started_at_ms: now,
      updated_at_ms: Date.now(),
      completed_at_ms: Date.now()
    });
    throw error;
  }
}

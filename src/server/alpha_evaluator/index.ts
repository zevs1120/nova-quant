import { createHash } from 'node:crypto';
import { buildCandidateScoring } from '../../research/discovery/candidateScoring.js';
import { buildCandidateValidationPipeline } from '../../research/discovery/candidateValidation.js';
import { getConfig } from '../config.js';
import type {
  AlphaEvaluationRecord,
  AssetClass,
  BacktestMetricRecord,
  BacktestRunRecord,
  DatasetVersionRecord,
  ExecutionProfileRecord,
  Market,
  UniverseSnapshotRecord
} from '../types.js';
import type { MarketRepository } from '../db/repository.js';
import { buildStableAlphaId, type AlphaEvaluationMetrics, type AutonomousAlphaCandidate } from '../alpha_registry/index.js';

type EvaluationConfig = {
  minAcceptanceScore: number;
  correlationRejectThreshold: number;
  maxComplexityScore: number;
};

type EvaluatedAlphaCandidate = {
  candidate: AutonomousAlphaCandidate;
  evaluation: AlphaEvaluationRecord;
  metrics: AlphaEvaluationMetrics;
  rejectionReasons: string[];
  recommendedState: 'REJECTED' | 'BACKTEST_PASS' | 'DRAFT';
};

type ValidationRow = {
  candidate_id: string;
  strategy_id: string;
  validation_stage_results: Array<{
    stage: string;
    pass: boolean;
    rejection_reasons?: string[];
    metrics?: Record<string, unknown>;
  }>;
  final_status: string;
  rejection_reasons: string[];
  metrics: Record<string, unknown>;
};

type ScoringRow = {
  candidate_id: string;
  candidate_quality_score: number;
  recommendation: string;
  metrics_snapshot: Record<string, unknown>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseJson<T = Record<string, unknown>>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function sourceHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function marketToAssetClass(markets: Market[]): AssetClass | 'ALL' {
  if (markets.length > 1) return 'ALL';
  return markets[0] === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK';
}

function holdingPeriodToTimeframe(holdingPeriod: string): string {
  const text = String(holdingPeriod || '').toLowerCase();
  if (text.includes('1-') || text.includes('2-') || text.includes('bars')) return '1d';
  if (text.includes('hour')) return '1h';
  return '1d';
}

function toLegacyDiscoveryCandidate(candidate: AutonomousAlphaCandidate) {
  const primaryMarket = candidate.compatible_markets[0] || 'US';
  const supportedAssetClasses = candidate.compatible_markets.includes('CRYPTO')
    ? candidate.compatible_markets.includes('US')
      ? ['US_STOCK', 'CRYPTO']
      : ['CRYPTO']
    : ['US_STOCK'];
  return {
    candidate_id: candidate.id,
    strategy_id: `auto-${candidate.id}`,
    hypothesis_id: `${candidate.family}-autonomous`,
    template_id: `${candidate.family}-template`,
    template_name: candidate.family,
    strategy_family: candidate.family,
    supported_asset_classes: supportedAssetClasses,
    compatible_regimes: candidate.regime_constraints,
    supporting_features: candidate.feature_dependencies,
    required_features: candidate.required_inputs,
    parameter_set: candidate.params,
    parameter_space_reference: Object.fromEntries(
      Object.entries(candidate.params).map(([key, value]) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          return [key, { min: round(value * 0.8, 4), max: round(value * 1.2, 4), step: Math.max(0.01, Math.abs(value) * 0.05) }];
        }
        return [key, { min: 0, max: 1, step: 1 }];
      })
    ),
    expected_holding_horizon: candidate.intended_holding_period,
    generation_mode: candidate.parent_alpha_id ? 'regime_tuned' : 'base',
    cost_sensitivity_assumption:
      primaryMarket === 'CRYPTO'
        ? 'Medium-to-high due to funding / basis and spread shocks.'
        : 'Medium; execution costs must survive baseline plus stress.',
    risk_profile: 'balanced',
    quality_prior_score: clamp(0.82 - candidate.complexity_score * 0.07, 0.25, 0.88),
    candidate_source_metadata: {
      source_type: candidate.source,
      integration_path: candidate.integration_path,
      parent_alpha_id: candidate.parent_alpha_id || null
    },
    traceability: {
      generated_at: candidate.created_at,
      generated_by: 'alpha-discovery-loop.v1'
    }
  };
}

function buildReplayBenchmarks(repo: MarketRepository) {
  return repo
    .listPerformanceSnapshots({ segmentType: 'OVERALL' })
    .map((row) => {
      const payload = parseJson<Record<string, unknown>>(row.payload_json, {});
      const kpis = parseJson<Record<string, unknown>>(
        typeof payload.kpis === 'object' && payload.kpis ? JSON.stringify(payload.kpis) : null,
        {}
      );
      return {
        market: row.market,
        avg_trade_return_post_cost: safeNumber(kpis.total_return, 0),
        avg_drawdown_abs: safeNumber(kpis.max_dd, 0),
        win_rate: safeNumber(kpis.win_rate, 0),
        closed_trades: safeNumber(kpis.sample_size, 0)
      };
    })
    .filter((row) => row.closed_trades > 0);
}

function buildValidationContext(repo: MarketRepository) {
  const activeStrategies = repo
    .listStrategyVersions({ limit: 60 })
    .map((row) => ({
      family: row.family,
      current_stage: row.status === 'champion' || row.status === 'active' ? 'PROD' : row.status === 'challenger' ? 'SHADOW' : 'DRAFT'
    }));

  return {
    research: {
      research_core: {
        strategy_governance: {
          strategies: activeStrategies
        }
      }
    },
    walkForward: {
      replay_validation: {
        market_replay_benchmarks: buildReplayBenchmarks(repo)
      }
    }
  };
}

function stageByName(validationRow: ValidationRow, stageName: string) {
  return validationRow.validation_stage_results.find((row) => row.stage === stageName) || null;
}

function correlationToActive(repo: MarketRepository, candidate: AutonomousAlphaCandidate) {
  const activeSignals = repo.listSignals({ status: 'NEW', limit: 120 });
  const liveFamilies = new Set(activeSignals.map((row) => String(row.strategy_family || '').toLowerCase()).filter(Boolean));
  const liveSymbols = new Set(activeSignals.map((row) => `${row.market}:${row.symbol}`));
  const activeCandidates = repo
    .listAlphaCandidates({ limit: 120 })
    .filter((row) => ['SHADOW', 'CANARY', 'PROD'].includes(row.status));

  const featureOverlapScores = activeCandidates.map((row) => {
    const features = parseJson<string[]>(row.feature_dependencies_json, []);
    const left = new Set(features);
    const right = new Set(candidate.feature_dependencies);
    const overlap = [...left].filter((item) => right.has(item)).length;
    return Math.max(left.size, right.size) ? overlap / Math.max(left.size, right.size) : 0;
  });

  const familyOverlap = liveFamilies.has(candidate.family.toLowerCase()) ? 0.72 : 0.28;
  const symbolPressure = [...candidate.compatible_markets].some((market) =>
    [...liveSymbols].some((key) => key.startsWith(`${market}:`))
  )
    ? 0.58
    : 0.22;
  const featureOverlap = featureOverlapScores.length ? Math.max(...featureOverlapScores) : 0.18;
  return round(clamp(familyOverlap * 0.45 + symbolPressure * 0.2 + featureOverlap * 0.35, 0, 1), 4);
}

function concentrationScore(validationRow: ValidationRow) {
  const walkForward = stageByName(validationRow, 'stage_4_walkforward');
  const windows = Array.isArray(walkForward?.metrics?.windows)
    ? (walkForward?.metrics?.windows as Array<Record<string, unknown>>)
    : [];
  const positive = windows.map((row) => safeNumber(row.test_return, 0)).filter((value) => value > 0);
  if (!positive.length) return 1;
  const total = positive.reduce((sum, value) => sum + value, 0);
  const maxShare = Math.max(...positive) / Math.max(total, 1e-9);
  return round(clamp(maxShare, 0, 1), 4);
}

function derivePayoffRatio(winRate: number | null, netReturn: number | null, maxDrawdown: number | null) {
  if (winRate === null || netReturn === null) return null;
  const avgWin = Math.max(0.0005, Math.abs(netReturn) * (0.65 + winRate));
  const avgLoss = Math.max(0.0005, (maxDrawdown ?? 0.12) * (1.1 - winRate));
  return round(avgWin / avgLoss, 4);
}

function buildAlphaMetrics(
  repo: MarketRepository,
  candidate: AutonomousAlphaCandidate,
  validationRow: ValidationRow,
  scoringRow: ScoringRow
): AlphaEvaluationMetrics {
  const quick = stageByName(validationRow, 'stage_2_quick_backtest');
  const robust = stageByName(validationRow, 'stage_3_robustness_tests');
  const walkForward = stageByName(validationRow, 'stage_4_walkforward');

  const netReturn = safeNumber(quick?.metrics?.return, 0);
  const grossReturn = safeNumber(quick?.metrics?.gross_return, netReturn);
  const winRate = Number.isFinite(Number(quick?.metrics?.win_rate)) ? round(safeNumber(quick?.metrics?.win_rate, 0), 4) : null;
  const maxDrawdown = Number.isFinite(Number(quick?.metrics?.drawdown)) ? round(safeNumber(quick?.metrics?.drawdown, 0), 4) : null;
  const sharpe = Number.isFinite(Number(quick?.metrics?.sharpe_proxy)) ? round(safeNumber(quick?.metrics?.sharpe_proxy, 0), 4) : null;
  const plus25 = robust?.metrics?.cost_stress ? safeNumber((robust.metrics.cost_stress as Record<string, unknown>).plus_25pct_cost, 0) : null;
  const plus50 = robust?.metrics?.cost_stress ? safeNumber((robust.metrics.cost_stress as Record<string, unknown>).plus_50pct_cost, 0) : null;
  const strictFill = robust?.metrics?.cost_stress ? safeNumber((robust.metrics.cost_stress as Record<string, unknown>).strict_fill, 0) : null;
  const regimes = Array.isArray(robust?.metrics?.regime_segmentation)
    ? (robust?.metrics?.regime_segmentation as Array<Record<string, unknown>>).map((row) => ({
        regime: String(row.regime || 'unknown'),
        return: safeNumber(row.return, 0),
        drawdown: safeNumber(row.drawdown, 0)
      }))
    : [];
  const windows = Array.isArray(walkForward?.metrics?.windows)
    ? (walkForward?.metrics?.windows as Array<Record<string, unknown>>).map((row) => ({
        window_id: String(row.window_id || 'wf'),
        test_return: safeNumber(row.test_return, 0),
        drawdown: safeNumber(row.drawdown, 0)
      }))
    : [];

  return {
    net_pnl: round(netReturn, 6),
    sharpe,
    sortino: null,
    max_drawdown: maxDrawdown,
    win_rate: winRate,
    payoff_ratio: derivePayoffRatio(winRate, netReturn, maxDrawdown),
    turnover: Number.isFinite(Number(quick?.metrics?.turnover)) ? round(safeNumber(quick?.metrics?.turnover, 0), 4) : null,
    cost_sensitivity: {
      plus_25pct_cost: plus25 === null ? null : round(plus25, 6),
      plus_50pct_cost: plus50 === null ? null : round(plus50, 6),
      strict_fill: strictFill === null ? null : round(strictFill, 6)
    },
    performance_by_subperiod: windows,
    performance_by_regime: regimes,
    stability_score: round(
      clamp(
        safeNumber(robust?.metrics?.parameter_stability_score, 0) * 0.4 +
          safeNumber(robust?.metrics?.regime_stability_score, 0) * 0.35 +
          safeNumber(walkForward?.metrics?.positive_window_ratio, 0) * 0.25,
        0,
        1
      ),
      4
    ),
    correlation_to_active: correlationToActive(repo, candidate),
    complexity_score: round(candidate.complexity_score, 4),
    concentration_score: concentrationScore(validationRow),
    backtest_proxy: {
      gross_return: round(grossReturn, 6),
      net_return: round(netReturn, 6),
      note: 'Discovery candidate validation proxy, not a broker-grade event simulation.'
    },
    proxy_only: true
  };
}

function buildRejectionReasons(
  candidate: AutonomousAlphaCandidate,
  validationRow: ValidationRow,
  metrics: AlphaEvaluationMetrics,
  config: EvaluationConfig
) {
  const reasons = [...(validationRow.rejection_reasons || [])];
  if (metrics.correlation_to_active >= config.correlationRejectThreshold) reasons.push('too_correlated_with_active_alpha');
  if ((metrics.cost_sensitivity.plus_50pct_cost ?? 0) <= 0 || (metrics.cost_sensitivity.strict_fill ?? 0) <= 0) {
    reasons.push('performance_disappears_after_cost_assumptions');
  }
  if (metrics.concentration_score >= 0.68) reasons.push('performance_concentrated_in_one_short_subperiod');
  if (candidate.complexity_score >= config.maxComplexityScore && (metrics.net_pnl ?? 0) < 0.015) {
    reasons.push('candidate_too_complex_relative_to_edge');
  }
  if (metrics.stability_score < 0.56) reasons.push('robustness_checks_failed');
  return [...new Set(reasons)];
}

function acceptanceScore(baseScore: number, metrics: AlphaEvaluationMetrics, rejectionReasons: string[]) {
  const costPenalty =
    (metrics.cost_sensitivity.plus_50pct_cost ?? 0) < 0 ? 0.18 : (metrics.cost_sensitivity.plus_50pct_cost ?? 0) < 0.01 ? 0.08 : 0;
  const correlationPenalty = metrics.correlation_to_active * 0.28;
  const complexityPenalty = Math.max(0, metrics.complexity_score - 1.45) * 0.08;
  const concentrationPenalty = Math.max(0, metrics.concentration_score - 0.45) * 0.24;
  const rejectionPenalty = rejectionReasons.length ? 0.16 + rejectionReasons.length * 0.04 : 0;
  const score =
    baseScore * 0.62 +
    metrics.stability_score * 0.18 +
    (metrics.net_pnl ?? 0) * 0.45 +
    ((metrics.sharpe ?? 0) / 2) * 0.08 -
    costPenalty -
    correlationPenalty -
    complexityPenalty -
    concentrationPenalty -
    rejectionPenalty;
  return round(clamp(score, 0, 1), 4);
}

function buildDefaultDatasetVersion(repo: MarketRepository, candidate: AutonomousAlphaCandidate): DatasetVersionRecord {
  const config = getConfig();
  const market = candidate.compatible_markets.length > 1 ? 'ALL' : candidate.compatible_markets[0];
  const assetClass = marketToAssetClass(candidate.compatible_markets);
  const timeframe = holdingPeriodToTimeframe(candidate.intended_holding_period);
  const members = {
    US: config.markets.US.symbols.length,
    CRYPTO: config.markets.CRYPTO.symbols.length
  };
  const sourceBundleHash = sourceHash({
    market,
    assetClass,
    timeframe,
    members,
    newsRows: repo.listNewsItems({ limit: 40 }).length,
    fundamentals: repo.listFundamentalSnapshots({ limit: 40 }).length,
    options: repo.listOptionChainSnapshots({ limit: 40 }).length
  });
  const existing = repo.findDatasetVersionByHash({
    market,
    assetClass,
    timeframe,
    sourceBundleHash
  });
  if (existing) return existing;
  const record: DatasetVersionRecord = {
    id: `alpha-dataset-${sourceBundleHash.slice(0, 16)}`,
    market,
    asset_class: assetClass,
    timeframe,
    source_bundle_hash: sourceBundleHash,
    coverage_summary_json: JSON.stringify(members),
    freshness_summary_json: JSON.stringify({
      generated_at: new Date().toISOString(),
      proxy: true
    }),
    notes: 'Autonomous alpha discovery dataset snapshot.',
    created_at_ms: Date.now()
  };
  repo.createDatasetVersion(record);
  return record;
}

function buildDefaultUniverseSnapshot(repo: MarketRepository, dataset: DatasetVersionRecord): UniverseSnapshotRecord {
  const config = getConfig();
  const members =
    dataset.market === 'CRYPTO'
      ? config.markets.CRYPTO.symbols
      : dataset.market === 'US'
        ? config.markets.US.symbols
        : [...config.markets.US.symbols, ...config.markets.CRYPTO.symbols];
  const existing = repo.listUniverseSnapshots({ datasetVersionId: dataset.id, limit: 1 })[0];
  if (existing) return existing;
  const record: UniverseSnapshotRecord = {
    id: `alpha-universe-${dataset.id}`,
    dataset_version_id: dataset.id,
    snapshot_ts_ms: Date.now(),
    market: dataset.market,
    asset_class: dataset.asset_class,
    members_json: JSON.stringify(members),
    created_at_ms: Date.now()
  };
  repo.upsertUniverseSnapshot(record);
  return record;
}

function buildDefaultExecutionProfile(repo: MarketRepository): ExecutionProfileRecord {
  const existing = repo.listExecutionProfiles(1)[0];
  if (existing) return existing;
  const record: ExecutionProfileRecord = {
    id: 'exec-alpha-discovery-baseline-v1',
    profile_name: 'alpha-discovery-baseline',
    spread_model_json: JSON.stringify({ bps: 4 }),
    slippage_model_json: JSON.stringify({ entry_bps: 5, exit_bps: 6 }),
    fee_model_json: JSON.stringify({ bps_per_side: 2, funding_bps_per_day: 0 }),
    fill_policy_json: JSON.stringify({ mode: 'conservative' }),
    latency_assumption_json: JSON.stringify({ latency_ms: 400 }),
    version: '1.0.0',
    created_at_ms: Date.now()
  };
  repo.upsertExecutionProfile(record);
  return record;
}

function persistBacktestProxy(
  repo: MarketRepository,
  candidate: AutonomousAlphaCandidate,
  metrics: AlphaEvaluationMetrics,
  evaluationStatus: AlphaEvaluationRecord['evaluation_status'],
  rejectionReasons: string[]
) {
  const dataset = buildDefaultDatasetVersion(repo, candidate);
  const universe = buildDefaultUniverseSnapshot(repo, dataset);
  const executionProfile = buildDefaultExecutionProfile(repo);
  const runId = `alpha-backtest-${candidate.id}`;
  const now = Date.now();
  const run: BacktestRunRecord = {
    id: runId,
    run_type: 'walk_forward',
    strategy_version_id: null,
    dataset_version_id: dataset.id,
    universe_version_id: universe.id,
    execution_profile_id: executionProfile.id,
    config_hash: sourceHash({
      candidate: candidate.id,
      params: candidate.params,
      features: candidate.feature_dependencies
    }),
    started_at_ms: now,
    completed_at_ms: now,
    status: evaluationStatus === 'REJECT' ? 'WITHHELD' : 'SUCCESS',
    train_window: null,
    validation_window: null,
    test_window: candidate.intended_holding_period,
    notes: 'Autonomous alpha discovery proxy evaluation. Metrics are discovery-validation proxies.'
  };
  if (!repo.getBacktestRun(runId)) {
    repo.createBacktestRun(run);
  } else {
    repo.updateBacktestRunStatus({
      id: runId,
      status: run.status,
      completedAtMs: now,
      notes: run.notes
    });
  }

  const metric: BacktestMetricRecord = {
    backtest_run_id: runId,
    gross_return: metrics.backtest_proxy.gross_return,
    net_return: metrics.backtest_proxy.net_return,
    sharpe: metrics.sharpe,
    sortino: metrics.sortino,
    max_drawdown: metrics.max_drawdown,
    turnover: metrics.turnover,
    win_rate: metrics.win_rate,
    hit_rate: metrics.win_rate,
    cost_drag:
      metrics.backtest_proxy.gross_return !== null && metrics.backtest_proxy.net_return !== null
        ? round(metrics.backtest_proxy.gross_return - metrics.backtest_proxy.net_return, 6)
        : null,
    sample_size: Math.max(5, stageSampleSizeCandidate(metrics)),
    withheld_reason: evaluationStatus === 'REJECT' ? rejectionReasons.join(', ') : null,
    realism_grade: evaluationStatus === 'PASS' ? 'B' : evaluationStatus === 'WATCH' ? 'C' : 'WITHHELD',
    robustness_grade: metrics.stability_score >= 0.72 ? 'A' : metrics.stability_score >= 0.6 ? 'B' : metrics.stability_score >= 0.5 ? 'C' : 'D',
    status: evaluationStatus === 'REJECT' ? 'WITHHELD' : 'READY',
    created_at_ms: now,
    updated_at_ms: now
  };
  repo.upsertBacktestMetric(metric);
  repo.insertBacktestArtifacts([
    {
      backtest_run_id: runId,
      artifact_type: 'alpha_discovery_proxy_metrics',
      path_or_payload: JSON.stringify(metrics),
      created_at_ms: now
    },
    {
      backtest_run_id: runId,
      artifact_type: 'alpha_discovery_rejection_reasons',
      path_or_payload: JSON.stringify(rejectionReasons),
      created_at_ms: now
    }
  ]);
  return runId;
}

function stageSampleSizeCandidate(metrics: AlphaEvaluationMetrics) {
  return Math.max(
    metrics.performance_by_subperiod.length * 5,
    metrics.performance_by_regime.length * 4,
    Math.round((metrics.turnover ?? 0.3) * 20)
  );
}

export function evaluateAlphaCandidates(args: {
  repo: MarketRepository;
  candidates: AutonomousAlphaCandidate[];
  workflowRunId: string;
  config: EvaluationConfig;
}) {
  const legacyCandidates = args.candidates.map(toLegacyDiscoveryCandidate);
  const validation = buildCandidateValidationPipeline({
    candidates: legacyCandidates,
    context: buildValidationContext(args.repo),
    config: {
      stage_2: {
        execution_realism_profile: {
          mode: 'backtest'
        }
      }
    }
  });
  const scoring = buildCandidateScoring({
    candidates: legacyCandidates,
    validation
  });

  const validationById = new Map((validation.candidates as ValidationRow[]).map((row) => [row.candidate_id, row]));
  const scoringById = new Map((scoring.candidates as ScoringRow[]).map((row) => [row.candidate_id, row]));

  const evaluated: EvaluatedAlphaCandidate[] = [];

  for (const candidate of args.candidates) {
    const validationRow = validationById.get(candidate.id);
    const scoringRow = scoringById.get(candidate.id);
    if (!validationRow || !scoringRow) continue;

    const metrics = buildAlphaMetrics(args.repo, candidate, validationRow, scoringRow);
    const rejectionReasons = buildRejectionReasons(candidate, validationRow, metrics, args.config);
    const acceptedScore = acceptanceScore(scoringRow.candidate_quality_score, metrics, rejectionReasons);
    const evaluationStatus: AlphaEvaluationRecord['evaluation_status'] =
      rejectionReasons.length > 0 ? 'REJECT' : acceptedScore >= args.config.minAcceptanceScore ? 'PASS' : 'WATCH';
    const backtestRunId = persistBacktestProxy(args.repo, candidate, metrics, evaluationStatus, rejectionReasons);

    const evaluation: AlphaEvaluationRecord = {
      id: `alpha-eval-${candidate.id}-${Date.now()}`,
      alpha_candidate_id: candidate.id,
      workflow_run_id: args.workflowRunId,
      backtest_run_id: backtestRunId,
      evaluation_status: evaluationStatus,
      acceptance_score: acceptedScore,
      metrics_json: JSON.stringify(metrics),
      rejection_reasons_json: JSON.stringify(rejectionReasons),
      notes:
        evaluationStatus === 'REJECT'
          ? 'Rejected by autonomous alpha evaluator hard gates.'
          : evaluationStatus === 'WATCH'
            ? 'Kept in watchlist pending stronger acceptance score or cleaner shadow fit.'
            : 'Passed backtest proxy gates and is ready for SHADOW staging.',
      created_at_ms: Date.now()
    };
    args.repo.insertAlphaEvaluation(evaluation);

    evaluated.push({
      candidate,
      evaluation,
      metrics,
      rejectionReasons,
      recommendedState: evaluationStatus === 'PASS' ? 'BACKTEST_PASS' : evaluationStatus === 'WATCH' ? 'DRAFT' : 'REJECTED'
    });
  }

  return {
    validation,
    scoring,
    evaluated
  };
}

import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';
import type { AlphaLifecycleState, Market } from '../types.js';
import type { MarketRepository } from '../db/repository.js';
import {
  buildStableAlphaId,
  buildAlphaRegistrySummary,
  parseAlphaCandidateRecord,
  persistAlphaCandidate,
  type AutonomousAlphaCandidate,
} from '../alpha_registry/index.js';
import { evaluateAlphaCandidates } from '../alpha_evaluator/index.js';
import { buildAlphaMutations, buildShadowFeedbackMutations } from '../alpha_mutation/index.js';
import {
  reviewAlphaBacktestOutcomes,
  runAlphaShadowMonitoringCycle,
} from '../alpha_promotion_guard/index.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';
import { buildCandidateGenerator } from '../../research/discovery/candidateGenerator.js';
import { buildHypothesisRegistry } from '../../research/discovery/hypothesisRegistry.js';
import { loadDiscoverySeedRuntime } from '../../research/discovery/seedRuntime.js';
import { buildTemplateRegistry } from '../../research/discovery/templateRegistry.js';

type JsonObject = Record<string, unknown>;

export type AlphaDiscoveryConfig = {
  enabled: boolean;
  schedule: string;
  intervalHours: number;
  maxCandidatesPerCycle: number;
  searchBudget: number;
  minAcceptanceScore: number;
  familyCoverageTargets: Record<string, number>;
  maxCorrelationToActive: number;
  simplicityBias: number;
  allowProdPromotion: boolean;
  shadowAdmissionThresholds: {
    minAcceptanceScore: number;
    maxDrawdown: number;
  };
  shadowPromotionThresholds: {
    minSampleSize: number;
    minSharpe: number;
    minExpectancy: number;
    maxDrawdown: number;
    maxCorrelation: number;
    minApprovalRate: number;
    maxBacktestDegradation: number;
  };
  retirementThresholds: {
    minExpectancy: number;
    maxDrawdown: number;
    decayStreakLimit: number;
  };
};

type LegacyGeneratedCandidate = {
  candidate_id: string;
  hypothesis_id: string;
  hypothesis_description: string;
  hypothesis_economic_intuition: string;
  template_id: string;
  template_name: string;
  strategy_family: string;
  supported_asset_classes: string[];
  compatible_regimes: string[];
  expected_holding_horizon: string;
  supporting_features: string[];
  required_features: string[];
  parameter_set: Record<string, number | string | boolean | null>;
  parameter_space_reference?: Record<string, unknown>;
  generation_mode: string;
  quality_prior_score: number;
  candidate_source_metadata?: Record<string, unknown>;
};

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumberEnv(
  value: string | undefined,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function marketFromAssetClasses(classes: string[]): Market[] {
  const set = new Set(classes.map((item) => String(item).toUpperCase()));
  const markets: Market[] = [];
  if (set.has('US_STOCK')) markets.push('US');
  if (set.has('CRYPTO')) markets.push('CRYPTO');
  return markets.length ? markets : ['US'];
}

function parseScheduleHours(schedule: string): number {
  const text = String(schedule || '')
    .trim()
    .toLowerCase();
  const match = text.match(/(\d+)\s*hour/);
  if (match) return Math.max(1, Number(match[1]));
  const matchEvery = text.match(/every[-_]?(\d+)/);
  if (matchEvery) return Math.max(1, Number(matchEvery[1]));
  return 12;
}

function mapLegacyFamily(candidate: LegacyGeneratedCandidate): string {
  const family = String(candidate.strategy_family || '').toLowerCase();
  const features = new Set(
    (candidate.supporting_features || []).map((item) => String(item).toLowerCase()),
  );
  if (family.includes('relative')) return 'cross_asset_lead_lag';
  if (family.includes('crypto')) return 'funding_basis_perp_structure';
  if (family.includes('mean')) return 'mean_reversion_refinement';
  if (family.includes('regime')) {
    if (
      features.has('volume_expansion') ||
      features.has('liquidity_score') ||
      features.has('turnover_cost_proxy') ||
      features.has('spread_bps')
    ) {
      return 'liquidity_volume_regime_filter';
    }
    return 'volatility_expansion_compression';
  }
  if (
    features.has('volume_expansion') ||
    features.has('liquidity_score') ||
    features.has('turnover_cost_proxy') ||
    features.has('spread_bps')
  ) {
    return 'liquidity_volume_regime_filter';
  }
  return 'trend_continuation_refinement';
}

function integrationPathForFamily(family: string): AutonomousAlphaCandidate['integration_path'] {
  if (family === 'confidence_calibration_overlay') return 'confidence_modifier';
  if (family === 'liquidity_volume_regime_filter') return 'regime_activation_hint';
  if (family === 'cross_asset_lead_lag') return 'portfolio_weight_suggestion';
  return 'signal_input';
}

function complexityScore(candidate: LegacyGeneratedCandidate) {
  const featureCount = (candidate.supporting_features || []).length;
  const paramCount = Object.keys(candidate.parameter_set || {}).length;
  const regimeCount = (candidate.compatible_regimes || []).length;
  return round(
    Math.max(0.8, 0.85 + featureCount * 0.08 + paramCount * 0.05 + regimeCount * 0.03),
    4,
  );
}

function buildCandidateFormula(candidate: LegacyGeneratedCandidate): JsonObject {
  return {
    hypothesis_id: candidate.hypothesis_id,
    template_id: candidate.template_id,
    template_name: candidate.template_name,
    generation_mode: candidate.generation_mode,
    params: candidate.parameter_set,
    parameter_space_reference: candidate.parameter_space_reference || {},
  };
}

function buildEntryLogic(candidate: LegacyGeneratedCandidate): JsonObject {
  return {
    trigger_family: mapLegacyFamily(candidate),
    supporting_features: candidate.supporting_features,
    required_features: candidate.required_features,
    regime_constraints: candidate.compatible_regimes,
  };
}

function buildExitLogic(candidate: LegacyGeneratedCandidate): JsonObject {
  return {
    holding_period: candidate.expected_holding_horizon,
    thesis: candidate.hypothesis_economic_intuition,
    mode: candidate.generation_mode,
  };
}

function buildSizingHint(candidate: LegacyGeneratedCandidate, family: string): JsonObject {
  return {
    path: integrationPathForFamily(family),
    quality_prior_score: candidate.quality_prior_score,
    simplicity_bias: family === 'confidence_calibration_overlay' ? 'high' : 'medium',
    source_mode: candidate.generation_mode,
  };
}

function buildAutonomousCandidate(candidate: LegacyGeneratedCandidate): AutonomousAlphaCandidate {
  const family = mapLegacyFamily(candidate);
  const compatibleMarkets = marketFromAssetClasses(candidate.supported_asset_classes || []);
  const requiredInputs = [
    ...new Set([...(candidate.required_features || []), ...(candidate.supporting_features || [])]),
  ];
  return {
    id: buildStableAlphaId({
      template_id: candidate.template_id,
      hypothesis_id: candidate.hypothesis_id,
      family,
      params: candidate.parameter_set,
      features: candidate.supporting_features,
    }),
    thesis: `${candidate.hypothesis_description} via ${candidate.template_name}`,
    family,
    formula: buildCandidateFormula(candidate),
    params: candidate.parameter_set || {},
    feature_dependencies: [...new Set(candidate.supporting_features || [])],
    regime_constraints: [...new Set(candidate.compatible_regimes || [])],
    compatible_markets: compatibleMarkets,
    intended_holding_period: candidate.expected_holding_horizon || '1-5 bars',
    entry_logic: buildEntryLogic(candidate),
    exit_logic: buildExitLogic(candidate),
    sizing_hint: buildSizingHint(candidate, family),
    required_inputs: requiredInputs,
    complexity_score: complexityScore(candidate),
    integration_path: integrationPathForFamily(family),
    created_at: new Date().toISOString(),
    source: 'autonomous_discovery',
    strategy_candidate: candidate,
    notes: [
      `generation_mode:${candidate.generation_mode}`,
      `quality_prior:${round(Number(candidate.quality_prior_score || 0), 4)}`,
    ],
  };
}

function buildConfidenceOverlayCandidate(
  candidate: AutonomousAlphaCandidate,
): AutonomousAlphaCandidate {
  return {
    ...candidate,
    id: buildStableAlphaId({
      parent: candidate.id,
      overlay: 'confidence_calibration',
    }),
    thesis: `${candidate.thesis} with confidence calibration overlay`,
    family: 'confidence_calibration_overlay',
    formula: {
      ...candidate.formula,
      overlay_type: 'confidence_calibration',
    },
    integration_path: 'confidence_modifier',
    complexity_score: round(Math.max(0.78, candidate.complexity_score - 0.12), 4),
    parent_alpha_id: candidate.id,
    notes: [...(candidate.notes || []), 'confidence_overlay'],
  };
}

function dedupeCandidates(candidates: AutonomousAlphaCandidate[]) {
  const byId = new Map<string, AutonomousAlphaCandidate>();
  for (const candidate of candidates) {
    if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
  }
  return [...byId.values()];
}

function rebalanceCandidateFamilies(
  candidates: AutonomousAlphaCandidate[],
  targets: Record<string, number>,
  limit: number,
) {
  const grouped = new Map<string, AutonomousAlphaCandidate[]>();
  for (const candidate of candidates) {
    const family = String(candidate.family || 'unknown');
    if (!grouped.has(family)) grouped.set(family, []);
    grouped.get(family)!.push(candidate);
  }

  const selected: AutonomousAlphaCandidate[] = [];
  const seen = new Set<string>();

  for (const [family, desired] of Object.entries(targets || {})) {
    const bucket = grouped.get(family) || [];
    for (const candidate of bucket.slice(0, Math.max(0, Number(desired || 0)))) {
      if (seen.has(candidate.id)) continue;
      selected.push(candidate);
      seen.add(candidate.id);
      if (selected.length >= limit) return selected;
    }
  }

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    selected.push(candidate);
    seen.add(candidate.id);
    if (selected.length >= limit) break;
  }

  return selected;
}

function dominantRegime(repo: MarketRepository) {
  const rows = repo.listMarketState();
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(row.regime_id || 'range').toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'range';
}

function decayingFamilies(repo: MarketRepository) {
  const summary = buildAlphaRegistrySummary(repo);
  return [...new Set(summary.decaying_candidates.map((row) => row.family))];
}

function buildDiscoveryUniverse(repo: MarketRepository, config: AlphaDiscoveryConfig) {
  const seedRuntime = loadDiscoverySeedRuntime();
  const context = {
    currentRegime: dominantRegime(repo),
    starvation: repo.listAlphaCandidates({ status: 'SHADOW', limit: 20 }).length === 0,
    decayingFamilies: decayingFamilies(repo),
  };
  const hypothesisRegistry = buildHypothesisRegistry({
    seedRuntime,
    context,
    config: {
      constraints: {
        market: ['US', 'CRYPTO'],
        risk_profile: 'balanced',
      },
    },
  });
  const templateRegistry = buildTemplateRegistry({
    seedRuntime,
    config: {
      constraints: {
        market: ['US', 'CRYPTO'],
        risk_profile: 'balanced',
      },
    },
  });
  const generated = buildCandidateGenerator({
    seedRuntime,
    hypothesisRegistry,
    templateRegistry,
    context,
    config: {
      max_candidates: Math.max(config.maxCandidatesPerCycle, 6),
      max_hypotheses: 8,
      max_templates_per_hypothesis: 4,
      min_feature_overlap: 1,
      market: ['US', 'CRYPTO'],
      risk_profile: 'balanced',
    },
  });

  const baseCandidates = (generated.candidates as LegacyGeneratedCandidate[])
    .map(buildAutonomousCandidate)
    .slice(0, config.maxCandidatesPerCycle);

  const overlaySeeds = baseCandidates
    .slice(0, Math.min(4, baseCandidates.length))
    .map(buildConfidenceOverlayCandidate);
  const mutations: AutonomousAlphaCandidate[] = [];
  let remainingBudget = config.searchBudget;
  for (const candidate of baseCandidates) {
    if (remainingBudget <= 0) break;
    const next = buildAlphaMutations(candidate, {
      maxMutations: Math.min(remainingBudget, 2),
      simplicityBias: config.simplicityBias,
    });
    mutations.push(...next);
    remainingBudget -= next.length;
  }

  const candidateLimit = config.maxCandidatesPerCycle + config.searchBudget + overlaySeeds.length;
  const deduped = dedupeCandidates([...baseCandidates, ...overlaySeeds, ...mutations]);

  return {
    context,
    seedRuntime,
    hypothesisRegistry,
    templateRegistry,
    generated,
    candidates: rebalanceCandidateFamilies(deduped, config.familyCoverageTargets, candidateLimit),
  };
}

function activeLifecycleState(status: AlphaLifecycleState) {
  return status === 'DRAFT' || status === 'BACKTEST_PASS';
}

function summarizeShadowActions(repo: MarketRepository, alphaCandidateId: string) {
  const rows = repo.listAlphaShadowObservations({
    alphaCandidateId,
    limit: 120,
  });
  const actionable = rows.filter((row) => row.shadow_action !== 'WATCH');
  const approvals = actionable.filter(
    (row) => row.shadow_action === 'APPROVE' || row.shadow_action === 'BOOST',
  );
  return {
    total: rows.length,
    actionable: actionable.length,
    approval_rate: actionable.length ? round(approvals.length / actionable.length, 4) : null,
  };
}

function shadowFeedbackReason(
  row: ReturnType<typeof buildAlphaRegistrySummary>['records'][number],
) {
  const shadow = row.shadow;
  if (Number(shadow.max_drawdown || 0) >= 0.14) return 'drawdown' as const;
  if (Number(shadow.expectancy || 0) < 0) return 'negative_expectancy' as const;
  return 'mixed_decay' as const;
}

function runShadowFeedbackRetestCycle(args: {
  repo: MarketRepository;
  workflowId: string;
  config: AlphaDiscoveryConfig;
  thresholds: Parameters<typeof reviewAlphaBacktestOutcomes>[0]['thresholds'];
}) {
  const registry = buildAlphaRegistrySummary(args.repo);
  const candidatesForFeedback = registry.records
    .filter((row) => ['SHADOW', 'CANARY', 'RETIRED'].includes(row.status))
    .filter((row) => Number(row.shadow.realized_sample_size || 0) >= 4)
    .filter(
      (row) =>
        Number(row.shadow.expectancy || 0) < args.config.retirementThresholds.minExpectancy ||
        Number(row.shadow.max_drawdown || 0) >= args.config.retirementThresholds.maxDrawdown * 0.6,
    )
    .sort((a, b) => Number(a.shadow.expectancy || 0) - Number(b.shadow.expectancy || 0))
    .slice(0, 4);

  const retestCandidates: AutonomousAlphaCandidate[] = [];
  for (const row of candidatesForFeedback) {
    const record = args.repo.getAlphaCandidate(row.id);
    if (!record) continue;
    const parent = parseAlphaCandidateRecord(record);
    const actionSummary = summarizeShadowActions(args.repo, row.id);
    const feedback = {
      expectancy: row.shadow.expectancy,
      maxDrawdown: row.shadow.max_drawdown,
      approvalRate: actionSummary.approval_rate,
      sampleSize: Number(row.shadow.realized_sample_size || 0),
      reason:
        actionSummary.approval_rate !== null && actionSummary.approval_rate < 0.35
          ? ('low_approval' as const)
          : shadowFeedbackReason(row),
    };
    retestCandidates.push(
      ...buildShadowFeedbackMutations(parent, feedback, {
        maxMutations: 2,
        simplicityBias: args.config.simplicityBias,
      }),
    );
  }

  const registered: string[] = [];
  for (const candidate of retestCandidates) {
    if (args.repo.getAlphaCandidate(candidate.id)) continue;
    const persisted = persistAlphaCandidate(args.repo, {
      candidate,
      status: 'DRAFT',
      promotionReason: 'queued for retest from shadow feedback',
    });
    registered.push(persisted.id);
  }

  const freshRetests = retestCandidates.filter((candidate) => registered.includes(candidate.id));
  if (!freshRetests.length) {
    return {
      parents_reviewed: candidatesForFeedback.map((row) => row.id),
      registered: [],
      evaluated: 0,
      accepted: [],
      rejected: [],
      watchlist: [],
    };
  }

  const evaluation = evaluateAlphaCandidates({
    repo: args.repo,
    candidates: freshRetests,
    workflowRunId: args.workflowId,
    config: {
      minAcceptanceScore: Math.max(0.5, args.config.minAcceptanceScore - 0.06),
      correlationRejectThreshold: args.config.maxCorrelationToActive,
      maxComplexityScore: 1.8,
    },
  });
  const review = reviewAlphaBacktestOutcomes({
    repo: args.repo,
    evaluated: evaluation.evaluated,
    thresholds: args.thresholds,
  });

  return {
    parents_reviewed: candidatesForFeedback.map((row) => row.id),
    registered,
    evaluated: evaluation.evaluated.length,
    accepted: review.accepted,
    rejected: review.rejected,
    watchlist: review.watchlist,
  };
}

export function readAlphaDiscoveryConfig(config = getConfig()): AlphaDiscoveryConfig {
  const fileConfig = config.alphaDiscovery || {};
  const admissionConfig = fileConfig.shadowAdmissionThresholds || {};
  const shadowConfig = fileConfig.shadowPromotionThresholds || {};
  const retirementConfig = fileConfig.retirementThresholds || {};
  const schedule =
    String(process.env.NOVA_ALPHA_DISCOVERY_SCHEDULE || '').trim() ||
    String(fileConfig.schedule || '').trim() ||
    'every-12-hours';
  return {
    enabled: parseBooleanEnv(
      process.env.NOVA_ALPHA_DISCOVERY_ENABLED,
      fileConfig.enabled !== false,
    ),
    schedule,
    intervalHours: parseNumberEnv(
      process.env.NOVA_ALPHA_DISCOVERY_INTERVAL_HOURS,
      parseScheduleHours(schedule),
      1,
      168,
    ),
    maxCandidatesPerCycle: parseNumberEnv(
      process.env.NOVA_ALPHA_DISCOVERY_MAX_CANDIDATES,
      Number(fileConfig.maxCandidatesPerCycle || 18),
      4,
      64,
    ),
    searchBudget: parseNumberEnv(
      process.env.NOVA_ALPHA_DISCOVERY_SEARCH_BUDGET,
      Number(fileConfig.searchBudget || 8),
      0,
      64,
    ),
    minAcceptanceScore: parseNumberEnv(
      process.env.NOVA_ALPHA_DISCOVERY_MIN_ACCEPTANCE_SCORE,
      Number(fileConfig.minAcceptanceScore || 0.64),
      0.3,
      1,
    ),
    familyCoverageTargets: Object.keys(fileConfig.familyCoverageTargets || {}).length
      ? Object.fromEntries(
          Object.entries(fileConfig.familyCoverageTargets || {}).map(([family, value]) => [
            family,
            parseNumberEnv(undefined, Number(value || 0), 0, 64),
          ]),
        )
      : {
          trend_continuation_refinement: 18,
          mean_reversion_refinement: 8,
          volatility_expansion_compression: 8,
          liquidity_volume_regime_filter: 12,
          cross_asset_lead_lag: 6,
          funding_basis_perp_structure: 6,
          confidence_calibration_overlay: 6,
        },
    maxCorrelationToActive: parseNumberEnv(
      process.env.NOVA_ALPHA_DISCOVERY_MAX_CORRELATION,
      Number(shadowConfig.maxCorrelation || 0.72),
      0.2,
      0.98,
    ),
    simplicityBias: parseNumberEnv(process.env.NOVA_ALPHA_DISCOVERY_SIMPLICITY_BIAS, 1.15, 0.4, 2),
    allowProdPromotion: parseBooleanEnv(process.env.NOVA_ALPHA_ALLOW_PROD_PROMOTION, false),
    shadowAdmissionThresholds: {
      minAcceptanceScore: parseNumberEnv(
        process.env.NOVA_ALPHA_SHADOW_ADMISSION_MIN_ACCEPTANCE_SCORE,
        Number(
          admissionConfig.minAcceptanceScore ||
            Math.max(0.54, Number(fileConfig.minAcceptanceScore || 0.66) - 0.08),
        ),
        0.3,
        1,
      ),
      maxDrawdown: parseNumberEnv(
        process.env.NOVA_ALPHA_SHADOW_ADMISSION_MAX_DRAWDOWN,
        Number(admissionConfig.maxDrawdown || 0.28),
        0.05,
        1,
      ),
    },
    shadowPromotionThresholds: {
      minSampleSize: parseNumberEnv(
        process.env.NOVA_ALPHA_SHADOW_MIN_SAMPLE_SIZE,
        Number(shadowConfig.minSampleSize || 16),
        4,
        500,
      ),
      minSharpe: parseNumberEnv(
        process.env.NOVA_ALPHA_SHADOW_MIN_SHARPE,
        Number(shadowConfig.minSharpe || 0.45),
        -5,
        10,
      ),
      minExpectancy: parseNumberEnv(
        process.env.NOVA_ALPHA_SHADOW_MIN_EXPECTANCY,
        Number(shadowConfig.minExpectancy || 0.0015),
        -1,
        1,
      ),
      maxDrawdown: parseNumberEnv(
        process.env.NOVA_ALPHA_SHADOW_MAX_DRAWDOWN,
        Number(shadowConfig.maxDrawdown || 0.18),
        0.01,
        1,
      ),
      maxCorrelation: parseNumberEnv(
        process.env.NOVA_ALPHA_SHADOW_MAX_CORRELATION,
        Number(shadowConfig.maxCorrelation || 0.72),
        0.2,
        0.99,
      ),
      minApprovalRate: parseNumberEnv(
        process.env.NOVA_ALPHA_SHADOW_MIN_APPROVAL_RATE,
        Number(shadowConfig.minApprovalRate || 0.45),
        0,
        1,
      ),
      maxBacktestDegradation: parseNumberEnv(
        process.env.NOVA_ALPHA_SHADOW_MAX_DEGRADATION,
        0.45,
        0.1,
        0.95,
      ),
    },
    retirementThresholds: {
      minExpectancy: parseNumberEnv(
        process.env.NOVA_ALPHA_RETIRE_MIN_EXPECTANCY,
        Number(retirementConfig.minExpectancy || -0.002),
        -1,
        1,
      ),
      maxDrawdown: parseNumberEnv(
        process.env.NOVA_ALPHA_RETIRE_MAX_DRAWDOWN,
        Number(retirementConfig.maxDrawdown || 0.22),
        0.01,
        1,
      ),
      decayStreakLimit: parseNumberEnv(
        process.env.NOVA_ALPHA_RETIRE_DECAY_STREAK_LIMIT,
        Number(retirementConfig.decayStreakLimit || 3),
        1,
        20,
      ),
    },
  };
}

export async function runAlphaDiscoveryCycle(args: {
  repo: MarketRepository;
  userId: string;
  triggerType?: 'scheduled' | 'manual' | 'shadow';
  force?: boolean;
}) {
  const config = readAlphaDiscoveryConfig();
  const workflowId = `workflow-alpha-discovery-${randomUUID().slice(0, 12)}`;
  const traceId = createTraceId('alpha-discovery');
  const now = Date.now();

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'alpha_discovery_loop',
    workflow_version: 'alpha-discovery-loop.v1',
    trigger_type: args.triggerType || 'manual',
    status: 'RUNNING',
    trace_id: traceId,
    input_json: JSON.stringify({
      user_id: args.userId,
      config,
    }),
    output_json: null,
    attempt_count: 1,
    started_at_ms: now,
    updated_at_ms: now,
    completed_at_ms: null,
  });

  try {
    if (!config.enabled && !args.force) {
      const skipped = {
        workflow_id: workflowId,
        trace_id: traceId,
        skipped: true,
        reason: 'discovery_disabled',
      };
      args.repo.upsertWorkflowRun({
        id: workflowId,
        workflow_key: 'alpha_discovery_loop',
        workflow_version: 'alpha-discovery-loop.v1',
        trigger_type: args.triggerType || 'manual',
        status: 'SUCCEEDED',
        trace_id: traceId,
        input_json: JSON.stringify({
          user_id: args.userId,
          config,
        }),
        output_json: JSON.stringify(skipped),
        attempt_count: 1,
        started_at_ms: now,
        updated_at_ms: Date.now(),
        completed_at_ms: Date.now(),
      });
      return skipped;
    }

    console.log('[alpha-discovery] discovery cycle starting', {
      max_candidates: config.maxCandidatesPerCycle,
      search_budget: config.searchBudget,
      ts: new Date().toISOString(),
    });

    const universe = buildDiscoveryUniverse(args.repo, config);
    for (const candidate of universe.candidates) {
      const existing = args.repo.getAlphaCandidate(candidate.id);
      const persisted = persistAlphaCandidate(args.repo, {
        candidate,
        status: existing?.status || 'DRAFT',
      });
      void persisted;
    }

    const evaluationQueue = universe.candidates.filter((candidate) => {
      const existing = args.repo.getAlphaCandidate(candidate.id);
      if (!existing) return true;
      return activeLifecycleState(existing.status);
    });

    const evaluation = evaluateAlphaCandidates({
      repo: args.repo,
      candidates: evaluationQueue,
      workflowRunId: workflowId,
      config: {
        minAcceptanceScore: config.minAcceptanceScore,
        correlationRejectThreshold: config.maxCorrelationToActive,
        maxComplexityScore: 1.8,
      },
    });
    const thresholds = {
      minAcceptanceScore: config.minAcceptanceScore,
      maxCorrelationToActive: config.maxCorrelationToActive,
      shadowAdmission: config.shadowAdmissionThresholds,
      shadowPromotion: config.shadowPromotionThresholds,
      retirement: config.retirementThresholds,
      allowProdPromotion: config.allowProdPromotion,
    };
    const review = reviewAlphaBacktestOutcomes({
      repo: args.repo,
      evaluated: evaluation.evaluated,
      thresholds,
    });
    const feedbackRetest = runShadowFeedbackRetestCycle({
      repo: args.repo,
      workflowId,
      config,
      thresholds,
    });
    const shadowMonitoring = await runAlphaShadowMonitoringCycle({
      repo: args.repo,
      userId: args.userId,
      triggerType: 'shadow',
      thresholds,
    });
    const registry = buildAlphaRegistrySummary(args.repo);
    const acceptedSummaries = evaluation.evaluated
      .filter((item) => review.accepted.includes(item.candidate.id))
      .map((item) => ({
        alpha_id: item.candidate.id,
        family: item.candidate.family,
        acceptance_score: item.evaluation.acceptance_score,
        integration_path: item.candidate.integration_path,
      }));
    const rejectedSummaries = evaluation.evaluated
      .filter((item) => review.rejected.includes(item.candidate.id))
      .map((item) => ({
        alpha_id: item.candidate.id,
        family: item.candidate.family,
        rejection_reasons: item.rejectionReasons,
      }));

    const output = {
      workflow_id: workflowId,
      trace_id: traceId,
      config: {
        schedule: config.schedule,
        interval_hours: config.intervalHours,
        max_candidates_per_cycle: config.maxCandidatesPerCycle,
        search_budget: config.searchBudget,
        min_acceptance_score: config.minAcceptanceScore,
        shadow_admission_min_acceptance_score: config.shadowAdmissionThresholds.minAcceptanceScore,
        shadow_admission_max_drawdown: config.shadowAdmissionThresholds.maxDrawdown,
      },
      discovery_context: universe.context,
      generation_summary: {
        generated_base_candidates: (universe.generated.candidates || []).length,
        candidates_registered: universe.candidates.length,
        evaluation_queue: evaluationQueue.length,
      },
      evaluation_summary: {
        evaluated: evaluation.evaluated.length,
        accepted: review.accepted.length,
        rejected: review.rejected.length,
        watchlist: review.watchlist.length,
      },
      accepted_candidates: acceptedSummaries,
      rejected_candidates: rejectedSummaries.slice(0, 10),
      shadow_monitoring: shadowMonitoring,
      shadow_feedback_retest: feedbackRetest,
      alpha_registry: {
        counts: registry.counts,
        top_candidates: registry.top_candidates.slice(0, 5),
        decaying_candidates: registry.decaying_candidates.slice(0, 5),
        correlation_map: registry.correlation_map.slice(0, 8),
        hypothesis_yield_board: registry.hypothesis_yield_board.slice(0, 8),
      },
    };

    args.repo.upsertWorkflowRun({
      id: workflowId,
      workflow_key: 'alpha_discovery_loop',
      workflow_version: 'alpha-discovery-loop.v1',
      trigger_type: args.triggerType || 'manual',
      status: 'SUCCEEDED',
      trace_id: traceId,
      input_json: JSON.stringify({
        user_id: args.userId,
        config,
      }),
      output_json: JSON.stringify(output),
      attempt_count: 1,
      started_at_ms: now,
      updated_at_ms: Date.now(),
      completed_at_ms: Date.now(),
    });
    recordAuditEvent(args.repo, {
      traceId,
      scope: 'alpha_discovery_loop',
      eventType: 'ALPHA_DISCOVERY_COMPLETED',
      userId: args.userId,
      entityType: 'workflow_run',
      entityId: workflowId,
      payload: output,
    });
    console.log('[alpha-discovery] discovery cycle finished', {
      accepted: review.accepted.length,
      rejected: review.rejected.length,
      shadow_promoted_to_canary: shadowMonitoring.promotion.promoted_to_canary.length,
      ts: new Date().toISOString(),
    });
    return output;
  } catch (error) {
    args.repo.upsertWorkflowRun({
      id: workflowId,
      workflow_key: 'alpha_discovery_loop',
      workflow_version: 'alpha-discovery-loop.v1',
      trigger_type: args.triggerType || 'manual',
      status: 'FAILED',
      trace_id: traceId,
      input_json: JSON.stringify({
        user_id: args.userId,
        config,
      }),
      output_json: JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      attempt_count: 1,
      started_at_ms: now,
      updated_at_ms: Date.now(),
      completed_at_ms: Date.now(),
    });
    throw error;
  }
}

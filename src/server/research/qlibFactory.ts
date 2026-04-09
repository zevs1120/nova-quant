import { createHash } from 'node:crypto';
import {
  buildStableAlphaId,
  persistAlphaCandidate,
  type AutonomousAlphaCandidate,
} from '../alpha_registry/index.js';
import { evaluateAlphaCandidates } from '../alpha_evaluator/index.js';
import type { MarketRepository } from '../db/repository.js';
import { runQlibNativeBacktestEvidence } from '../evidence/qlibNative.js';
import {
  fetchQlibFactors,
  predictQlibModel,
  type QlibFactorRequest,
  type QlibFactorResult,
  type QlibFactorResultRow,
  type QlibModelRequest,
  type QlibModelResult,
  type QlibNativeBacktestRequest,
} from '../nova/qlibClient.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';
import { readAlphaDiscoveryConfig } from '../alpha_discovery/index.js';
import { reviewAlphaBacktestOutcomes } from '../alpha_promotion_guard/index.js';
import type { AssetClass, Market } from '../types.js';

type JsonObject = Record<string, unknown>;

export type QlibResearchFactoryInput = {
  symbols: string[];
  startDate: string;
  endDate: string;
  predictDate?: string;
  factorSet?: 'Alpha158' | 'Alpha360';
  modelName?: string | null;
  market?: Market | 'ALL';
  assetClass?: AssetClass | 'ALL';
  benchmark?: string | null;
  topk?: number;
  nDrop?: number;
  runNativeBacktest?: boolean;
  evaluateCandidates?: boolean;
  reviewPromotion?: boolean;
  triggerType?: 'scheduled' | 'manual';
  userId?: string | null;
};

type QlibResearchFactoryDeps = {
  fetchFactors?: (req: QlibFactorRequest) => Promise<QlibFactorResult>;
  predictModel?: (req: QlibModelRequest) => Promise<QlibModelResult>;
  runNativeBacktestEvidence?: typeof runQlibNativeBacktestEvidence;
};

type FactorSnapshot = {
  symbol: string;
  date: string;
  factors: Record<string, number>;
};

const QLIB_PUBLIC_REFERENCE_URLS = [
  'https://github.com/microsoft/qlib',
  'https://www.microsoft.com/en-us/research/project/qlib/',
];

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeSymbols(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
}

function compactNumber(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(8));
}

function compactFactorRow(row: QlibFactorResultRow): FactorSnapshot {
  const factors: Record<string, number> = {};
  for (const [key, value] of Object.entries(row.factors || {})) {
    const num = compactNumber(value);
    if (num === null) continue;
    factors[key] = num;
  }
  return {
    symbol: row.symbol,
    date: row.date,
    factors,
  };
}

function latestFactorSnapshot(result: QlibFactorResult, maxRows = 24): FactorSnapshot[] {
  const latestBySymbol = new Map<string, QlibFactorResultRow>();
  for (const row of result.rows || []) {
    const key = row.symbol.toUpperCase();
    const existing = latestBySymbol.get(key);
    if (!existing || String(row.date) >= String(existing.date)) {
      latestBySymbol.set(key, row);
    }
  }
  return [...latestBySymbol.values()]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .slice(0, maxRows)
    .map(compactFactorRow);
}

function availableFactorKeys(snapshot: FactorSnapshot[]) {
  const keys = new Set<string>();
  for (const row of snapshot) {
    for (const key of Object.keys(row.factors)) keys.add(key);
  }
  return keys;
}

function firstAvailableFactor(keys: Set<string>, candidates: string[], fallback: string) {
  for (const candidate of candidates) {
    if (keys.has(candidate)) return candidate;
    const dollar = `$${candidate}`;
    if (keys.has(dollar)) return dollar;
  }
  return fallback;
}

function marketsFromInput(input: QlibResearchFactoryInput): Market[] {
  if (input.market === 'US' || input.assetClass === 'US_STOCK') return ['US'];
  if (input.market === 'CRYPTO' || input.assetClass === 'CRYPTO') return ['CRYPTO'];
  if (input.market === 'ALL' || input.assetClass === 'ALL') return ['US', 'CRYPTO'];
  return input.symbols.some((symbol) => /USDT$|USD$|PERP$/i.test(symbol)) ? ['CRYPTO'] : ['US'];
}

function buildNotes(inputHash: string, extras: string[] = []) {
  return [
    'source:qlib-research-factory',
    `qlib_request_hash:${inputHash}`,
    ...QLIB_PUBLIC_REFERENCE_URLS.map((url) => `public_reference_url:${url}`),
    ...extras,
  ];
}

function baseStrategyMetadata(args: {
  input: QlibResearchFactoryInput;
  inputHash: string;
  qlibSource: JsonObject;
  hypothesisDescription: string;
  templateId: string;
  templateName: string;
}) {
  return {
    hypothesis_id: `qlib-${args.inputHash.slice(0, 12)}`,
    hypothesis_description: args.hypothesisDescription,
    template_id: args.templateId,
    template_name: args.templateName,
    candidate_source_metadata: {
      source_type: 'qlib_research_factory',
      factor_set: args.input.factorSet || 'Alpha158',
      model_name: args.input.modelName || null,
      qlib_source: args.qlibSource,
      public_reference_urls: QLIB_PUBLIC_REFERENCE_URLS,
    },
  };
}

function buildCandidate(args: {
  input: QlibResearchFactoryInput;
  inputHash: string;
  family: string;
  thesis: string;
  formula: JsonObject;
  params: Record<string, number | string | boolean | null>;
  featureDependencies: string[];
  requiredInputs: string[];
  entryLogic: JsonObject;
  qlibSource: JsonObject;
  templateId: string;
  templateName: string;
  modelName?: string | null;
  notes?: string[];
}): AutonomousAlphaCandidate {
  const createdAt = nowIso();
  const compatibleMarkets = marketsFromInput(args.input);
  const candidateSeed = {
    factory: 'qlib-research-factory.v1',
    input_hash: args.inputHash,
    family: args.family,
    template_id: args.templateId,
    formula: args.formula,
    model_name: args.modelName || null,
  };
  return {
    id: buildStableAlphaId(candidateSeed),
    thesis: args.thesis,
    family: args.family,
    formula: {
      ...args.formula,
      hypothesis_id: `qlib-${args.inputHash.slice(0, 12)}`,
      template_id: args.templateId,
      qlib_lineage: args.qlibSource,
    },
    params: args.params,
    feature_dependencies: args.featureDependencies,
    regime_constraints: ['normal_liquidity', 'tradable_spread', 'non_extreme_gap'],
    compatible_markets: compatibleMarkets,
    intended_holding_period: '3-10 trading days',
    entry_logic: args.entryLogic,
    exit_logic: {
      exit_on_rank_decay: true,
      stop_if_realized_volatility_spikes: true,
      max_holding_days: 10,
      qlib_rebalance_frequency: 'daily',
    },
    sizing_hint: {
      portfolio_fraction: 0.08,
      max_symbol_weight: 0.06,
      rank_weighted: true,
    },
    required_inputs: args.requiredInputs,
    complexity_score: 1.08,
    integration_path: 'signal_input',
    created_at: createdAt,
    source: 'autonomous_discovery',
    strategy_candidate: baseStrategyMetadata({
      input: args.input,
      inputHash: args.inputHash,
      qlibSource: args.qlibSource,
      hypothesisDescription: args.thesis,
      templateId: args.templateId,
      templateName: args.templateName,
    }),
    notes: buildNotes(args.inputHash, args.notes || []),
  };
}

function buildCandidatesFromQlib(args: {
  input: QlibResearchFactoryInput;
  factorResult: QlibFactorResult;
  modelResult: QlibModelResult | null;
  snapshot: FactorSnapshot[];
  inputHash: string;
}) {
  const keys = availableFactorKeys(args.snapshot);
  const momentumFactor = firstAvailableFactor(keys, ['ROCP5', 'ROC5', 'ROCP10', 'ROC10'], 'ROCP5');
  const residualFactor = firstAvailableFactor(keys, ['RESI5', 'RESI10', 'BETA5'], 'RESI5');
  const volumeFactor = firstAvailableFactor(keys, ['WVMA5', 'VMA5', 'VOLUME0'], 'WVMA5');
  const qlibSource = {
    factor_request_hash: args.inputHash,
    factor_set: args.factorResult.factor_set,
    factor_row_count: args.factorResult.row_count,
    factor_count: args.factorResult.factor_count,
    symbols_used: args.factorResult.symbols_used,
    date_range: args.factorResult.date_range,
    snapshot: args.snapshot,
  };

  const candidates: AutonomousAlphaCandidate[] = [
    buildCandidate({
      input: args.input,
      inputHash: args.inputHash,
      family: 'cross_asset_lead_lag',
      thesis:
        'Use Qlib Alpha158 cross-sectional momentum ranks as the primary selector, but gate entries with Nova relative-strength and volatility context.',
      formula: {
        signal:
          'rank(qlib_factor_momentum) + rank(relative_strength) - penalty(realized_volatility_rank)',
        qlib_factor_momentum: momentumFactor,
        qlib_factor_volume_confirmation: volumeFactor,
      },
      params: {
        qlib_factor_weight: 0.55,
        relative_strength_weight: 0.3,
        volatility_penalty_weight: 0.15,
        rebalance_days: 1,
      },
      featureDependencies: [
        'ret_20d',
        'ret_5d',
        'relative_strength',
        'realized_volatility_rank',
        'liquidity_score',
      ],
      requiredInputs: ['ret_20d', 'relative_strength', 'realized_volatility'],
      entryLogic: {
        long_when:
          'symbol is in top qlib_factor_momentum bucket and Nova relative_strength is positive',
        reject_when: 'realized_volatility_rank is extreme or liquidity_score is weak',
      },
      qlibSource,
      templateId: 'qlib-alpha158-factor-rank',
      templateName: 'Qlib Alpha158 factor-rank adapter',
      notes: [`qlib_primary_factor:${momentumFactor}`, `qlib_volume_factor:${volumeFactor}`],
    }),
    buildCandidate({
      input: args.input,
      inputHash: args.inputHash,
      family: 'mean_reversion_refinement',
      thesis:
        'Use Qlib residual/price-location factors to find short-horizon overextension, then require Nova liquidity and drawdown controls before entry.',
      formula: {
        signal: '-zscore(qlib_factor_residual) + confirmation(liquidity_score)',
        qlib_factor_residual: residualFactor,
        qlib_factor_momentum_guard: momentumFactor,
      },
      params: {
        residual_reversion_weight: 0.6,
        momentum_guard_weight: 0.2,
        liquidity_weight: 0.2,
        max_holding_days: 5,
      },
      featureDependencies: [
        'ret_5d',
        'realized_volatility',
        'drawdown_rank',
        'liquidity_score',
        'zscore_lookback',
      ],
      requiredInputs: ['ret_5d', 'realized_volatility', 'liquidity_score'],
      entryLogic: {
        long_when: 'qlib_factor_residual is oversold and the symbol remains liquid',
        reject_when: 'drawdown_rank is extreme or qlib momentum guard is sharply negative',
      },
      qlibSource,
      templateId: 'qlib-alpha158-residual-reversion',
      templateName: 'Qlib residual mean-reversion adapter',
      notes: [`qlib_primary_factor:${residualFactor}`],
    }),
  ];

  if (args.modelResult?.predictions?.length) {
    candidates.unshift(
      buildCandidate({
        input: args.input,
        inputHash: args.inputHash,
        family: 'trend_continuation_refinement',
        thesis:
          'Treat the deployed Qlib model score as a research-grade cross-sectional forecast and only allow entries that Nova trend/liquidity filters can explain.',
        formula: {
          signal: 'rank(qlib_model_score) + trend_confirmation(ret_20d, relative_strength)',
          model_name: args.modelResult.model_name,
          predict_date: args.modelResult.predict_date,
        },
        params: {
          qlib_model_weight: 0.65,
          nova_trend_weight: 0.25,
          liquidity_weight: 0.1,
          prediction_top_quantile: 0.2,
        },
        featureDependencies: [
          'ret_20d',
          'ret_60d',
          'relative_strength',
          'trend_strength',
          'liquidity_score',
        ],
        requiredInputs: ['ret_20d', 'relative_strength', 'liquidity_score'],
        entryLogic: {
          long_when: 'symbol is in the top Qlib model-score bucket and Nova trend features agree',
          reject_when: 'Qlib score rank and Nova relative_strength disagree',
        },
        qlibSource: {
          ...qlibSource,
          model_name: args.modelResult.model_name,
          predict_date: args.modelResult.predict_date,
          predictions: args.modelResult.predictions.slice(0, 40),
        },
        templateId: 'qlib-model-score-rank',
        templateName: 'Qlib deployed model-score adapter',
        modelName: args.modelResult.model_name,
        notes: [`qlib_model_name:${args.modelResult.model_name}`],
      }),
    );
  }

  return candidates;
}

function persistFactoryArtifacts(args: {
  repo: MarketRepository;
  evaluated: ReturnType<typeof evaluateAlphaCandidates>['evaluated'];
  factorRequest: QlibFactorRequest;
  factorResult: QlibFactorResult;
  modelResult: QlibModelResult | null;
  snapshot: FactorSnapshot[];
  workflowId: string;
  inputHash: string;
}) {
  const createdAtMs = nowMs();
  for (const item of args.evaluated) {
    const backtestRunId = item.evaluation.backtest_run_id;
    if (!backtestRunId) continue;
    args.repo.insertBacktestArtifacts([
      {
        backtest_run_id: backtestRunId,
        artifact_type: 'qlib_factory_factor_request',
        path_or_payload: JSON.stringify(args.factorRequest),
        created_at_ms: createdAtMs,
      },
      {
        backtest_run_id: backtestRunId,
        artifact_type: 'qlib_factory_factor_snapshot',
        path_or_payload: JSON.stringify({
          factor_set: args.factorResult.factor_set,
          factor_count: args.factorResult.factor_count,
          row_count: args.factorResult.row_count,
          snapshot: args.snapshot,
        }),
        created_at_ms: createdAtMs,
      },
      {
        backtest_run_id: backtestRunId,
        artifact_type: 'qlib_factory_candidate_lineage',
        path_or_payload: JSON.stringify({
          workflow_id: args.workflowId,
          input_hash: args.inputHash,
          alpha_candidate_id: item.candidate.id,
          evaluation_id: item.evaluation.id,
          model_name: args.modelResult?.model_name || null,
          model_prediction_count: args.modelResult?.prediction_count || 0,
        }),
        created_at_ms: createdAtMs,
      },
    ]);
    if (args.modelResult) {
      args.repo.insertBacktestArtifacts([
        {
          backtest_run_id: backtestRunId,
          artifact_type: 'qlib_factory_model_predictions',
          path_or_payload: JSON.stringify({
            model_name: args.modelResult.model_name,
            predict_date: args.modelResult.predict_date,
            predictions: args.modelResult.predictions,
          }),
          created_at_ms: createdAtMs,
        },
      ]);
    }
  }
}

export async function runQlibResearchFactory(
  repo: MarketRepository,
  input: QlibResearchFactoryInput,
  deps: QlibResearchFactoryDeps = {},
) {
  const symbols = normalizeSymbols(input.symbols);
  const normalizedInput: QlibResearchFactoryInput = {
    ...input,
    symbols,
    predictDate: input.predictDate || input.endDate,
    factorSet: input.factorSet || 'Alpha158',
    runNativeBacktest: input.runNativeBacktest ?? true,
    evaluateCandidates: input.evaluateCandidates ?? true,
    reviewPromotion: input.reviewPromotion ?? true,
    userId: input.userId || null,
  };
  const workflowId = `workflow-qlib-factory-${hashJson({ normalizedInput, ts: nowMs() }).slice(
    0,
    16,
  )}`;
  const traceId = createTraceId('qlib-factory');
  const startedAtMs = nowMs();
  const inputHash = hashJson(normalizedInput).slice(0, 24);
  const workflowInput = {
    ...normalizedInput,
    input_hash: inputHash,
  };

  repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'qlib_research_factory',
    workflow_version: 'qlib-research-factory.v1',
    trigger_type: normalizedInput.triggerType || 'manual',
    status: 'RUNNING',
    trace_id: traceId,
    input_json: JSON.stringify(workflowInput),
    output_json: null,
    attempt_count: 1,
    started_at_ms: startedAtMs,
    updated_at_ms: startedAtMs,
    completed_at_ms: null,
  });

  const warnings: string[] = [];
  try {
    const factorRequest: QlibFactorRequest = {
      symbols,
      factor_set: normalizedInput.factorSet,
      start_date: normalizedInput.startDate,
      end_date: normalizedInput.endDate,
    };
    const factorResult = await (deps.fetchFactors || fetchQlibFactors)(factorRequest);
    const snapshot = latestFactorSnapshot(factorResult);

    let modelResult: QlibModelResult | null = null;
    if (normalizedInput.modelName) {
      try {
        modelResult = await (deps.predictModel || predictQlibModel)({
          model_name: normalizedInput.modelName,
          symbols,
          predict_date: normalizedInput.predictDate || normalizedInput.endDate,
          factor_set: normalizedInput.factorSet,
        });
      } catch (error) {
        warnings.push(
          `qlib_model_prediction_failed:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const candidates = buildCandidatesFromQlib({
      input: normalizedInput,
      factorResult,
      modelResult,
      snapshot,
      inputHash,
    });

    for (const candidate of candidates) {
      const existing = repo.getAlphaCandidate(candidate.id);
      persistAlphaCandidate(repo, {
        candidate,
        status: existing?.status || 'DRAFT',
      });
    }

    let evaluation: ReturnType<typeof evaluateAlphaCandidates> | null = null;
    let promotionReview: ReturnType<typeof reviewAlphaBacktestOutcomes> | null = null;
    if (normalizedInput.evaluateCandidates && candidates.length) {
      evaluation = evaluateAlphaCandidates({
        repo,
        candidates,
        workflowRunId: workflowId,
        config: {
          minAcceptanceScore: 0.58,
          correlationRejectThreshold: 0.9,
          maxComplexityScore: 1.8,
        },
      });
      persistFactoryArtifacts({
        repo,
        evaluated: evaluation.evaluated,
        factorRequest,
        factorResult,
        modelResult,
        snapshot,
        workflowId,
        inputHash,
      });
      if (normalizedInput.reviewPromotion) {
        const discoveryConfig = readAlphaDiscoveryConfig();
        promotionReview = reviewAlphaBacktestOutcomes({
          repo,
          evaluated: evaluation.evaluated,
          thresholds: {
            minAcceptanceScore: discoveryConfig.minAcceptanceScore,
            maxCorrelationToActive: discoveryConfig.maxCorrelationToActive,
            shadowAdmission: discoveryConfig.shadowAdmissionThresholds,
            shadowPromotion: discoveryConfig.shadowPromotionThresholds,
            retirement: discoveryConfig.retirementThresholds,
            allowProdPromotion: discoveryConfig.allowProdPromotion,
          },
        });
      }
    }

    let nativeBacktest: Awaited<ReturnType<typeof runQlibNativeBacktestEvidence>> | null = null;
    if (normalizedInput.runNativeBacktest) {
      const request: QlibNativeBacktestRequest = {
        symbols,
        start_date: normalizedInput.startDate,
        end_date: normalizedInput.endDate,
        factor_set: normalizedInput.factorSet,
        benchmark: normalizedInput.benchmark ?? null,
        topk: normalizedInput.topk,
        n_drop: normalizedInput.nDrop,
      };
      try {
        nativeBacktest = await (deps.runNativeBacktestEvidence || runQlibNativeBacktestEvidence)({
          repo,
          request,
          market: normalizedInput.market,
          assetClass: normalizedInput.assetClass,
        });
      } catch (error) {
        warnings.push(
          `qlib_native_backtest_failed:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const output = {
      workflow_id: workflowId,
      trace_id: traceId,
      input_hash: inputHash,
      factor_pull: {
        status: factorResult.status,
        factor_set: factorResult.factor_set,
        factor_count: factorResult.factor_count,
        row_count: factorResult.row_count,
        symbols_used: factorResult.symbols_used,
      },
      model_pull: modelResult
        ? {
            status: modelResult.status,
            model_name: modelResult.model_name,
            prediction_count: modelResult.prediction_count,
            predict_date: modelResult.predict_date,
          }
        : null,
      generation_summary: {
        candidates_registered: candidates.length,
        candidate_ids: candidates.map((candidate) => candidate.id),
      },
      evaluation_summary: {
        evaluated: evaluation?.evaluated.length || 0,
        pass: evaluation?.evaluated.filter((item) => item.evaluation.evaluation_status === 'PASS')
          .length,
        watch: evaluation?.evaluated.filter((item) => item.evaluation.evaluation_status === 'WATCH')
          .length,
        reject: evaluation?.evaluated.filter(
          (item) => item.evaluation.evaluation_status === 'REJECT',
        ).length,
      },
      promotion_review: promotionReview,
      native_backtest: nativeBacktest
        ? {
            run_id: nativeBacktest.run_id,
            status: nativeBacktest.status,
            native_status: nativeBacktest.native_status,
            metric_status: nativeBacktest.metric.status,
            sharpe: nativeBacktest.metric.sharpe,
            net_return: nativeBacktest.metric.net_return,
          }
        : null,
      candidates: candidates.map((candidate) => ({
        alpha_candidate_id: candidate.id,
        family: candidate.family,
        thesis: candidate.thesis,
        qlib_template_id: candidate.formula.template_id,
      })),
      evaluations:
        evaluation?.evaluated.map((item) => ({
          alpha_candidate_id: item.candidate.id,
          evaluation_id: item.evaluation.id,
          backtest_run_id: item.evaluation.backtest_run_id,
          evaluation_status: item.evaluation.evaluation_status,
          acceptance_score: item.evaluation.acceptance_score,
          rejection_reasons: item.rejectionReasons,
        })) || [],
      warnings,
    };

    const completedAtMs = nowMs();
    repo.upsertWorkflowRun({
      id: workflowId,
      workflow_key: 'qlib_research_factory',
      workflow_version: 'qlib-research-factory.v1',
      trigger_type: normalizedInput.triggerType || 'manual',
      status: 'SUCCEEDED',
      trace_id: traceId,
      input_json: JSON.stringify(workflowInput),
      output_json: JSON.stringify(output),
      attempt_count: 1,
      started_at_ms: startedAtMs,
      updated_at_ms: completedAtMs,
      completed_at_ms: completedAtMs,
    });
    recordAuditEvent(repo, {
      traceId,
      scope: 'qlib_research_factory',
      eventType: 'QLIB_RESEARCH_FACTORY_COMPLETED',
      userId: normalizedInput.userId,
      entityType: 'workflow_run',
      entityId: workflowId,
      payload: output,
    });
    return output;
  } catch (error) {
    const completedAtMs = nowMs();
    const failure = {
      workflow_id: workflowId,
      trace_id: traceId,
      input_hash: inputHash,
      error: error instanceof Error ? error.message : String(error),
      warnings,
    };
    repo.upsertWorkflowRun({
      id: workflowId,
      workflow_key: 'qlib_research_factory',
      workflow_version: 'qlib-research-factory.v1',
      trigger_type: normalizedInput.triggerType || 'manual',
      status: 'FAILED',
      trace_id: traceId,
      input_json: JSON.stringify(workflowInput),
      output_json: JSON.stringify(failure),
      attempt_count: 1,
      started_at_ms: startedAtMs,
      updated_at_ms: completedAtMs,
      completed_at_ms: completedAtMs,
    });
    throw error;
  }
}

import { createHash } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';
import { buildFactorMeasurementReport } from '../research/factorMeasurements.js';
import type {
  AssetClass,
  BacktestMetricRecord,
  BacktestRunRecord,
  Market,
  ModelVersionRecord,
  NotificationEventRecord,
  StrategyLifecycleStatus,
  StrategyVersionRecord
} from '../types.js';
import {
  PANDA_FACTOR_NAMES,
  buildPandaAdaptiveDecision,
  buildPandaFactorFrame,
  rankPandaFactors,
  resolvePandaModelConfig,
  type NumericBar,
  type PandaFactorName,
  type PandaModelRuntimeConfig
} from './pandaEngine.js';

const EVOLUTION_WORKFLOW_KEY = 'quant_evolution_cycle';
const EVOLUTION_WORKFLOW_VERSION = 'quant-evolution.v1';
const EXECUTION_PROFILE_ID = 'exec-profile-panda-evolution-v1';
const MEASURED_FACTORS = ['momentum', 'low_vol', 'reversal', 'seasonality'] as const;

type RuntimeSnapshotLike = {
  sourceStatus: string;
  freshnessSummary: Record<string, unknown>;
  coverageSummary: Record<string, unknown>;
};

type CandidateTemplate = {
  label: string;
  seed: Partial<PandaModelRuntimeConfig>;
};

type WalkForwardMetrics = {
  grossReturn: number;
  netReturn: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  turnover: number;
  winRate: number;
  hitRate: number;
  costDrag: number;
  sampleSize: number;
  status: 'READY' | 'WITHHELD' | 'FAILED';
  withheldReason: string | null;
  realismGrade: 'A' | 'B' | 'C' | 'D' | 'WITHHELD';
  robustnessGrade: 'A' | 'B' | 'C' | 'D' | 'WITHHELD';
  folds: Array<{
    symbol: string;
    trainStartTs: number;
    trainEndTs: number;
    testStartTs: number;
    testEndTs: number;
    trades: number;
    netReturn: number;
  }>;
};

type EvaluatedModel = {
  label: string;
  model: ModelVersionRecord;
  strategy: StrategyVersionRecord;
  metrics: WalkForwardMetrics;
  backtestRunId: string;
};

export interface EvolutionCycleResult {
  workflowId: string;
  traceId: string;
  markets: Array<{
    market: Market;
    factorEvalCount: number;
    promoted: boolean;
    rolledBack: boolean;
    safeMode: boolean;
    activeModelId: string | null;
    challengerModelId: string | null;
    summary: string;
  }>;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value: number, digits = 6): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function maxDrawdown(returns: number[]): number {
  let equity = 1;
  let peak = 1;
  let worst = 0;
  for (const ret of returns) {
    equity *= 1 + ret;
    peak = Math.max(peak, equity);
    worst = Math.min(worst, peak > 0 ? equity / peak - 1 : 0);
  }
  return Math.abs(worst);
}

function sortino(values: number[]): number {
  const mean = average(values);
  const downside = values.filter((value) => value < 0);
  const downsideDev = std(downside);
  if (!downsideDev) return mean > 0 ? mean * Math.sqrt(Math.max(1, values.length)) : 0;
  return (mean / downsideDev) * Math.sqrt(Math.max(1, values.length));
}

function gradeFromMetrics(metrics: WalkForwardMetrics): 'A' | 'B' | 'C' | 'D' | 'WITHHELD' {
  if (metrics.status !== 'READY') return 'WITHHELD';
  if (metrics.sharpe >= 1.4 && metrics.maxDrawdown <= 0.1 && metrics.winRate >= 0.55) return 'A';
  if (metrics.sharpe >= 0.9 && metrics.maxDrawdown <= 0.14 && metrics.winRate >= 0.5) return 'B';
  if (metrics.sharpe >= 0.3 && metrics.maxDrawdown <= 0.2) return 'C';
  return 'D';
}

function dateKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function timeframeForMarket(market: Market): '1d' | '1h' {
  return market === 'US' ? '1d' : '1h';
}

function assetClassForMarket(market: Market): AssetClass {
  return market === 'US' ? 'US_STOCK' : 'CRYPTO';
}

function marketModelKey(market: Market): string {
  return `panda-runtime-${market.toLowerCase()}`;
}

function marketStrategyKey(market: Market): string {
  return `panda-strategy-${market.toLowerCase()}`;
}

function parseBarsForMarket(
  repo: MarketRepository,
  market: Market,
  symbol: string,
  limit = 360
): NumericBar[] {
  const asset = repo.getAssetBySymbol(market, symbol);
  if (!asset) return [];
  const rows = repo.getOhlcv({
    assetId: asset.asset_id,
    timeframe: timeframeForMarket(market),
    limit
  });
  return rows
    .map((row) => ({
      ts_open: row.ts_open,
      open: safeNumber(row.open, Number.NaN),
      high: safeNumber(row.high, Number.NaN),
      low: safeNumber(row.low, Number.NaN),
      close: safeNumber(row.close, Number.NaN),
      volume: safeNumber(row.volume, 0)
    }))
    .filter(
      (row) =>
        Number.isFinite(row.ts_open) &&
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
    );
}

function listMarketBarSets(repo: MarketRepository, market: Market) {
  return repo
    .listAssets(market)
    .filter((asset) => asset.status === 'ACTIVE')
    .map((asset) => ({
      asset,
      bars: parseBarsForMarket(repo, market, asset.symbol)
    }))
    .filter((entry) => entry.bars.length >= 140);
}

function safeParseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function normalizeWeights(factorScores: Partial<Record<PandaFactorName, number>>) {
  const total = Object.values(factorScores).reduce((acc, value) => acc + Math.max(0, safeNumber(value, 0)), 0);
  if (total <= 0) return factorScores;
  return Object.fromEntries(
    Object.entries(factorScores).map(([key, value]) => [key, round(Math.max(0, safeNumber(value, 0)) / total, 6)])
  ) as Partial<Record<PandaFactorName, number>>;
}

function loadActiveModel(repo: MarketRepository, market: Market): ModelVersionRecord | null {
  const models = repo.listModelVersions({
    modelKey: marketModelKey(market),
    limit: 20
  });
  return models.find((row) => row.status === 'active') || null;
}

function loadDeprecatedModel(repo: MarketRepository, market: Market, excludeId?: string | null): ModelVersionRecord | null {
  return (
    repo
      .listModelVersions({
        modelKey: marketModelKey(market),
        status: 'deprecated',
        limit: 20
      })
      .find((row) => row.id !== excludeId) || null
  );
}

function ensureExecutionProfile(repo: MarketRepository, asofMs: number): void {
  repo.upsertExecutionProfile({
    id: EXECUTION_PROFILE_ID,
    profile_name: 'Panda Evolution Default',
    spread_model_json: JSON.stringify({ type: 'fixed_bps', value: 2.5 }),
    slippage_model_json: JSON.stringify({ type: 'fixed_bps', value: 3.5 }),
    fee_model_json: JSON.stringify({ type: 'fixed_bps', value: 1.5 }),
    fill_policy_json: JSON.stringify({ type: 'close_plus_costs' }),
    latency_assumption_json: JSON.stringify({ bars: 1 }),
    version: '1',
    created_at_ms: asofMs
  });
}

function ensureDefaultActiveModel(repo: MarketRepository, market: Market, asofMs: number): ModelVersionRecord {
  const existing = loadActiveModel(repo, market);
  if (existing) return existing;

  const config = resolvePandaModelConfig({
    modelKey: marketModelKey(market)
  });
  const semanticVersion = `bootstrap-${dateKey(asofMs)}-1`;
  const configHash = hashJson(config).slice(0, 12);
  const modelId = `model-${market.toLowerCase()}-${configHash}`;
  const strategyId = `strategy-${market.toLowerCase()}-${configHash}`;
  repo.upsertModelVersion({
    id: modelId,
    model_key: marketModelKey(market),
    provider: 'nova-quant',
    endpoint: null,
    task_scope: `${market}:runtime`,
    semantic_version: semanticVersion,
    status: 'active',
    config_json: JSON.stringify(config),
    created_at_ms: asofMs,
    updated_at_ms: asofMs
  });
  repo.upsertStrategyVersion({
    id: strategyId,
    strategy_key: marketStrategyKey(market),
    family: 'Panda Runtime',
    version: semanticVersion,
    config_hash: configHash,
    config_json: JSON.stringify({ model_id: modelId, config }),
    status: 'champion',
    created_at_ms: asofMs,
    updated_at_ms: asofMs
  });
  return repo.listModelVersions({ modelKey: marketModelKey(market), limit: 5 }).find((row) => row.id === modelId)!;
}

function strategyRecordFromModel(model: ModelVersionRecord): StrategyVersionRecord {
  const configHash = hashText(model.config_json).slice(0, 12);
  const strategyId = `strategy-${model.model_key}-${model.semantic_version}`.replace(/[^a-zA-Z0-9._-]/g, '-');
  return {
    id: strategyId,
    strategy_key: marketStrategyKey(model.model_key.includes('crypto') ? 'CRYPTO' : 'US'),
    family: 'Panda Runtime',
    version: model.semantic_version,
    config_hash: configHash,
    config_json: JSON.stringify({
      model_id: model.id,
      model_key: model.model_key,
      semantic_version: model.semantic_version,
      config: safeParseJson(model.config_json, {})
    }),
    status: model.status === 'active' ? 'champion' : model.status === 'challenger' ? 'challenger' : 'deprecated',
    created_at_ms: model.created_at_ms,
    updated_at_ms: model.updated_at_ms
  };
}

function ensureStrategyRecord(repo: MarketRepository, model: ModelVersionRecord): StrategyVersionRecord {
  const record = strategyRecordFromModel(model);
  repo.upsertStrategyVersion(record);
  return record;
}

function ensureDatasetArtifacts(args: {
  repo: MarketRepository;
  market: Market;
  runtimeSnapshot: RuntimeSnapshotLike;
  members: string[];
  asofMs: number;
}) {
  const timeframe = timeframeForMarket(args.market);
  const assetClass = assetClassForMarket(args.market);
  const sourceBundleHash = hashJson({
    market: args.market,
    timeframe,
    coverage: args.runtimeSnapshot.coverageSummary,
    freshness: args.runtimeSnapshot.freshnessSummary,
    members: args.members
  });
  const datasetId = `dataset-${args.market.toLowerCase()}-${sourceBundleHash.slice(0, 12)}`;
  args.repo.createDatasetVersion({
    id: datasetId,
    market: args.market,
    asset_class: assetClass,
    timeframe,
    source_bundle_hash: sourceBundleHash,
    coverage_summary_json: JSON.stringify(args.runtimeSnapshot.coverageSummary),
    freshness_summary_json: JSON.stringify(args.runtimeSnapshot.freshnessSummary),
    notes: `Evolution cycle dataset snapshot for ${args.market}`,
    created_at_ms: args.asofMs
  });
  const universeId = `universe-${args.market.toLowerCase()}-${sourceBundleHash.slice(0, 12)}`;
  args.repo.upsertUniverseSnapshot({
    id: universeId,
    dataset_version_id: datasetId,
    snapshot_ts_ms: args.asofMs,
    market: args.market,
    asset_class: assetClass,
    members_json: JSON.stringify(args.members),
    created_at_ms: args.asofMs
  });
  ensureExecutionProfile(args.repo, args.asofMs);
  return {
    datasetId,
    universeId,
    executionProfileId: EXECUTION_PROFILE_ID,
    assetClass,
    timeframe
  };
}

function persistFactorEval(
  repo: MarketRepository,
  args: {
    market: Market;
    timeframe: string;
    evalType: string;
    factorId: string;
    score: Record<string, unknown>;
    notes?: string | null;
    asofMs: number;
  }
): void {
  const subjectId = `${args.market}:${args.timeframe}:${args.factorId}:${dateKey(args.asofMs)}`;
  repo.upsertEvalRecord({
    id: `eval-${args.evalType}-${hashText(subjectId).slice(0, 20)}`,
    eval_type: args.evalType,
    subject_type: 'factor',
    subject_id: subjectId,
    subject_version: dateKey(args.asofMs),
    score_json: JSON.stringify(args.score),
    notes: args.notes ?? null,
    created_at_ms: args.asofMs
  });
}

function storeMeasuredFactorEffects(repo: MarketRepository, market: Market, asofMs: number): number {
  const assetClass = assetClassForMarket(market);
  const timeframe = timeframeForMarket(market);
  let count = 0;
  for (const factorId of MEASURED_FACTORS) {
    const result = buildFactorMeasurementReport(repo, {
      factorId,
      market,
      assetClass,
      timeframe,
      lookbackBars: market === 'US' ? 320 : 260
    });
    persistFactorEval(repo, {
      market,
      timeframe,
      evalType: 'daily_factor_effect',
      factorId,
      score: {
        source_status: result.source_status,
        data_status: result.data_status,
        report: result.report
      },
      notes: 'Measured factor daily persistence',
      asofMs
    });
    count += 1;
  }
  return count;
}

function runtimeFactorDirection(factorName: PandaFactorName): 1 | -1 {
  if (factorName === 'volatility_score') return -1;
  return 1;
}

function storeRuntimeFactorEffects(repo: MarketRepository, market: Market, barSets: ReturnType<typeof listMarketBarSets>, asofMs: number): number {
  const timeframe = timeframeForMarket(market);
  let count = 0;
  for (const factorName of PANDA_FACTOR_NAMES) {
    const xs: number[] = [];
    const ys: number[] = [];
    let observations = 0;
    for (const entry of barSets) {
      const frame = buildPandaFactorFrame(entry.bars, [factorName]);
      const factorSeries = frame[factorName] || [];
      const closes = frame.close || [];
      const horizon = timeframe === '1d' ? 5 : 6;
      for (let index = 0; index < factorSeries.length - horizon; index += 1) {
        const feature = safeNumber(factorSeries[index], Number.NaN);
        const base = safeNumber(closes[index], Number.NaN);
        const future = safeNumber(closes[index + horizon], Number.NaN);
        if (!Number.isFinite(feature) || !Number.isFinite(base) || !Number.isFinite(future) || base <= 0) continue;
        xs.push(feature * runtimeFactorDirection(factorName));
        ys.push(future / base - 1);
        observations += 1;
      }
    }
    const ic =
      xs.length >= 5
        ? xs
            .map((value, index) => ({ value, ret: ys[index] }))
            .reduce(
              (acc, row) => {
                acc.x.push(row.value);
                acc.y.push(row.ret);
                return acc;
              },
              { x: [] as number[], y: [] as number[] }
            )
        : null;
    const correlationScore =
      ic && ic.x.length >= 5
        ? round(
            (() => {
              const meanX = average(ic.x);
              const meanY = average(ic.y);
              let cov = 0;
              let varX = 0;
              let varY = 0;
              for (let i = 0; i < ic.x.length; i += 1) {
                const dx = ic.x[i] - meanX;
                const dy = ic.y[i] - meanY;
                cov += dx * dy;
                varX += dx * dx;
                varY += dy * dy;
              }
              if (varX <= 1e-12 || varY <= 1e-12) return 0;
              return cov / Math.sqrt(varX * varY);
            })(),
            6
          )
        : 0;
    const hitRate =
      xs.length >= 5
        ? round(
            xs.filter((value, index) => Math.sign(value || 0) === Math.sign(ys[index] || 0) && Math.abs(value) > 0).length /
              Math.max(1, xs.length),
            6
          )
        : 0;
    persistFactorEval(repo, {
      market,
      timeframe,
      evalType: 'daily_runtime_factor_effect',
      factorId: factorName,
      score: {
        ic: correlationScore,
        hit_rate: hitRate,
        sample_size: observations
      },
      notes: 'Runtime panda-factor daily persistence',
      asofMs
    });
    count += 1;
  }
  return count;
}

function candidateTemplates(): CandidateTemplate[] {
  return [
    {
      label: 'trend-heavy',
      seed: {
        regimeBias: 'trend',
        longSignalThreshold: 0.74,
        shortSignalThreshold: 0.9,
        factorWeights: {
          trend_strength: 1.35,
          momentum_5: 1.15,
          volume_impulse: 1.05,
          reversal_score: 0.6
        }
      }
    },
    {
      label: 'balanced-adaptive',
      seed: {
        regimeBias: 'balanced',
        longSignalThreshold: 0.8,
        shortSignalThreshold: 0.82
      }
    },
    {
      label: 'defensive',
      seed: {
        regimeBias: 'meanreversion',
        riskBase: 0.012,
        positionBase: 0.22,
        stopLossBasePct: 0.04,
        longSignalThreshold: 0.84,
        shortSignalThreshold: 0.86,
        factorWeights: {
          volatility_score: 1.25,
          reversal_score: 1.1,
          trend_strength: 0.82
        }
      }
    }
  ];
}

function fitCandidateConfig(
  barSets: ReturnType<typeof listMarketBarSets>,
  market: Market,
  template: CandidateTemplate,
  baseConfig?: Partial<PandaModelRuntimeConfig> | null
): PandaModelRuntimeConfig {
  const mergedBase = resolvePandaModelConfig({
    modelKey: marketModelKey(market),
    ...baseConfig,
    ...template.seed
  });
  const aggregateScores = new Map<PandaFactorName, number>();
  for (const factorName of PANDA_FACTOR_NAMES) {
    aggregateScores.set(factorName, 0);
  }

  let assetCount = 0;
  for (const entry of barSets) {
    if (entry.bars.length < mergedBase.minSampleBars) continue;
    const frame = buildPandaFactorFrame(entry.bars, [...PANDA_FACTOR_NAMES]);
    const ranked = rankPandaFactors({
      frame,
      factorNames: [...PANDA_FACTOR_NAMES],
      lookaheadBars: mergedBase.factorLookaheadBars,
      topFactorCount: mergedBase.topFactorCount
    });
    for (const factorName of PANDA_FACTOR_NAMES) {
      aggregateScores.set(factorName, aggregateScores.get(factorName)! + safeNumber(ranked.factorScores[factorName], 0));
    }
    assetCount += 1;
  }

  const averagedScores = Object.fromEntries(
    Array.from(aggregateScores.entries()).map(([factorName, score]) => [
      factorName,
      assetCount ? score / assetCount : 0
    ])
  ) as Partial<Record<PandaFactorName, number>>;
  const rankedFactors = Object.entries(averagedScores)
    .sort((a, b) => safeNumber(b[1], 0) - safeNumber(a[1], 0))
    .map(([name]) => name as PandaFactorName);
  const enabledFactors = rankedFactors.slice(0, Math.max(3, mergedBase.topFactorCount));
  const topScore = safeNumber(averagedScores[enabledFactors[0]] || 0, 0);
  return resolvePandaModelConfig({
    ...mergedBase,
    enabledFactors,
    topFactorCount: Math.max(3, mergedBase.topFactorCount),
    factorWeights: normalizeWeights(averagedScores),
    longSignalThreshold: round(Math.max(0.58, mergedBase.longSignalThreshold - topScore * 0.12), 6),
    shortSignalThreshold: round(Math.max(0.6, mergedBase.shortSignalThreshold - topScore * 0.1), 6),
    notes: `Fitted from walk-forward train windows (${template.label})`
  });
}

function buildWalkForwardWindows(total: number, minTrainBars: number, foldCount: number, testBars: number) {
  if (total < minTrainBars + testBars) return [];
  const available = total - minTrainBars - testBars;
  const step = Math.max(1, Math.floor(available / Math.max(1, foldCount - 1)));
  const windows: Array<{ trainEnd: number; testStart: number; testEnd: number }> = [];
  let trainEnd = minTrainBars;
  while (trainEnd + testBars <= total && windows.length < foldCount) {
    windows.push({
      trainEnd,
      testStart: trainEnd,
      testEnd: Math.min(total - 1, trainEnd + testBars - 1)
    });
    trainEnd += step;
  }
  return windows;
}

function evaluateModelOnBars(args: {
  market: Market;
  bars: NumericBar[];
  config: PandaModelRuntimeConfig;
}): WalkForwardMetrics {
  const foldCount = 4;
  const testBars = args.market === 'US' ? 28 : 36;
  const horizon = args.market === 'US' ? 5 : 6;
  const windows = buildWalkForwardWindows(args.bars.length, Math.max(args.config.minSampleBars, 90), foldCount, testBars);
  const returns: number[] = [];
  const folds: WalkForwardMetrics['folds'] = [];

  for (const window of windows) {
    const trainBars = args.bars.slice(0, window.trainEnd);
    const fittedConfig = fitCandidateConfig(
      [
        {
          asset: { symbol: 'TRAIN' } as never,
          bars: trainBars
        }
      ],
      args.market,
      { label: 'wf-fit', seed: args.config },
      args.config
    );
    const foldReturns: number[] = [];
    const realizedHistory: number[] = [];

    for (let index = Math.max(window.testStart, fittedConfig.minSampleBars); index <= window.testEnd - horizon; index += 1) {
      const context = args.bars.slice(Math.max(0, index - 320 + 1), index + 1);
      const decision = buildPandaAdaptiveDecision({
        market: args.market,
        bars: context,
        performanceHistory: realizedHistory,
        riskProfile: {
          user_id: 'evolution-system',
          profile_key: 'balanced',
          max_loss_per_trade: 1,
          max_daily_loss: 3,
          max_drawdown: 12,
          exposure_cap: 55,
          leverage_cap: 2,
          updated_at_ms: 0
        },
        modelConfig: fittedConfig
      });
      if (!decision.risk.allowed || decision.signal === 0 || decision.confidence < 0.46) continue;
      const entry = args.bars[index].close;
      const exit = args.bars[index + horizon].close;
      if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0) continue;
      const gross = decision.signal > 0 ? exit / entry - 1 : (entry - exit) / entry;
      const scaled = gross * Math.max(0.45, decision.confidence);
      const cost = args.market === 'US' ? 0.0012 : 0.0018;
      const net = scaled - cost;
      foldReturns.push(net);
      realizedHistory.push(net);
      returns.push(net);
    }

    if (foldReturns.length) {
      folds.push({
        symbol: 'MULTI',
        trainStartTs: trainBars[0]?.ts_open ?? 0,
        trainEndTs: trainBars[trainBars.length - 1]?.ts_open ?? 0,
        testStartTs: args.bars[window.testStart]?.ts_open ?? 0,
        testEndTs: args.bars[window.testEnd]?.ts_open ?? 0,
        trades: foldReturns.length,
        netReturn: round(foldReturns.reduce((acc, value) => acc + value, 0), 6)
      });
    }
  }

  if (returns.length < 10) {
    return {
      grossReturn: 0,
      netReturn: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      turnover: 0,
      winRate: 0,
      hitRate: 0,
      costDrag: 0,
      sampleSize: returns.length,
      status: 'WITHHELD',
      withheldReason: 'insufficient_walk_forward_samples',
      realismGrade: 'WITHHELD',
      robustnessGrade: 'WITHHELD',
      folds
    };
  }

  const grossReturn = returns.reduce((acc, value) => acc + Math.max(value, -0.95), 0);
  const netReturn = grossReturn;
  const avgReturn = average(returns);
  const returnStd = std(returns);
  const sharpe = returnStd > 0 ? (avgReturn / returnStd) * Math.sqrt(returns.length) : 0;
  const metric: WalkForwardMetrics = {
    grossReturn: round(grossReturn, 6),
    netReturn: round(netReturn, 6),
    sharpe: round(sharpe, 6),
    sortino: round(sortino(returns), 6),
    maxDrawdown: round(maxDrawdown(returns), 6),
    turnover: round(returns.length / Math.max(1, folds.length), 6),
    winRate: round(returns.filter((value) => value > 0).length / returns.length, 6),
    hitRate: round(returns.filter((value) => value > 0).length / returns.length, 6),
    costDrag: round(returns.length * (args.market === 'US' ? 0.0012 : 0.0018), 6),
    sampleSize: returns.length,
    status: 'READY',
    withheldReason: null,
    realismGrade: 'C',
    robustnessGrade: 'C',
    folds
  };
  metric.realismGrade = gradeFromMetrics(metric);
  metric.robustnessGrade = gradeFromMetrics({
    ...metric,
    sharpe: metric.sharpe - metric.maxDrawdown
  });
  return metric;
}

function aggregateEvaluations(args: {
  market: Market;
  config: PandaModelRuntimeConfig;
  barSets: ReturnType<typeof listMarketBarSets>;
}): WalkForwardMetrics {
  const allReturns: number[] = [];
  const allFolds: WalkForwardMetrics['folds'] = [];
  for (const entry of args.barSets) {
    const metrics = evaluateModelOnBars({
      market: args.market,
      bars: entry.bars,
      config: args.config
    });
    if (metrics.sampleSize) {
      const foldRows = metrics.folds.map((row) => ({ ...row, symbol: entry.asset.symbol }));
      allFolds.push(...foldRows);
    }
    if (metrics.status === 'READY') {
      allReturns.push(metrics.netReturn);
    }
  }

  if (!allFolds.length) {
    return {
      grossReturn: 0,
      netReturn: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      turnover: 0,
      winRate: 0,
      hitRate: 0,
      costDrag: 0,
      sampleSize: 0,
      status: 'WITHHELD',
      withheldReason: 'no_eligible_assets',
      realismGrade: 'WITHHELD',
      robustnessGrade: 'WITHHELD',
      folds: []
    };
  }

  const grossReturn = allFolds.reduce((acc, row) => acc + row.netReturn, 0);
  const returns = allFolds.map((row) => row.netReturn);
  const metrics: WalkForwardMetrics = {
    grossReturn: round(grossReturn, 6),
    netReturn: round(grossReturn, 6),
    sharpe: round(std(returns) > 0 ? (average(returns) / std(returns)) * Math.sqrt(returns.length) : 0, 6),
    sortino: round(sortino(returns), 6),
    maxDrawdown: round(maxDrawdown(returns), 6),
    turnover: round(average(allFolds.map((row) => row.trades)), 6),
    winRate: round(allFolds.filter((row) => row.netReturn > 0).length / allFolds.length, 6),
    hitRate: round(allFolds.filter((row) => row.netReturn > 0).length / allFolds.length, 6),
    costDrag: round(allFolds.reduce((acc, row) => acc + row.trades * (args.market === 'US' ? 0.0012 : 0.0018), 0), 6),
    sampleSize: allFolds.reduce((acc, row) => acc + row.trades, 0),
    status: allFolds.reduce((acc, row) => acc + row.trades, 0) >= 12 ? 'READY' : 'WITHHELD',
    withheldReason: allFolds.reduce((acc, row) => acc + row.trades, 0) >= 12 ? null : 'insufficient_walk_forward_samples',
    realismGrade: 'C',
    robustnessGrade: 'C',
    folds: allFolds
  };
  metrics.realismGrade = gradeFromMetrics(metrics);
  metrics.robustnessGrade = gradeFromMetrics({
    ...metrics,
    sharpe: metrics.sharpe - metrics.maxDrawdown
  });
  return metrics;
}

function shouldPromote(challenger: WalkForwardMetrics, champion: WalkForwardMetrics): boolean {
  if (challenger.status !== 'READY') return false;
  if (champion.status !== 'READY') return challenger.netReturn > 0 && challenger.sampleSize >= 12;
  return (
    challenger.netReturn >= champion.netReturn + 0.02 &&
    challenger.sharpe >= champion.sharpe - 0.05 &&
    challenger.maxDrawdown <= champion.maxDrawdown + 0.03 &&
    challenger.sampleSize >= Math.max(12, Math.floor(champion.sampleSize * 0.6))
  );
}

function shouldRollback(active: WalkForwardMetrics, runtimeSnapshot: RuntimeSnapshotLike): boolean {
  const coverage = safeParseJson<{ coverage_ratio?: number }>(
    JSON.stringify(runtimeSnapshot.coverageSummary),
    {}
  );
  const coverageRatio = safeNumber((coverage as Record<string, unknown>).coverage_ratio, 0);
  if (runtimeSnapshot.sourceStatus !== 'DB_BACKED' || coverageRatio < 0.2) return true;
  if (active.status === 'FAILED') return true;
  if (active.status === 'WITHHELD') return false;
  return active.maxDrawdown >= 0.2 || active.netReturn <= -0.08;
}

async function sendDiscordAlert(args: {
  title: string;
  description: string;
  severity: 'INFO' | 'WARN' | 'ERROR';
  fields?: Array<{ name: string; value: string }>;
}) {
  const webhook = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!webhook) return;
  const color = args.severity === 'ERROR' ? 0xe34f4f : args.severity === 'WARN' ? 0xffc145 : 0x6aa6ff;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Nova Quant Ops',
        embeds: [
          {
            title: args.title,
            description: args.description,
            color,
            fields: args.fields || [],
            timestamp: new Date().toISOString()
          }
        ]
      })
    });
  } catch {
    // Discord delivery is best-effort; notification_events remain the durable record.
  }
}

async function recordProtectiveAlert(args: {
  repo: MarketRepository;
  userId: string;
  market: Market;
  title: string;
  body: string;
  triggerType: string;
  reason: Record<string, unknown>;
  asofMs: number;
  traceId: string;
}) {
  const assetClass = assetClassForMarket(args.market);
  const fingerprint = hashText(`${dateKey(args.asofMs)}|${args.market}|${args.triggerType}|${args.title}`);
  const event: NotificationEventRecord = {
    id: `notif-${fingerprint.slice(0, 20)}`,
    user_id: args.userId,
    market: args.market,
    asset_class: assetClass,
    category: 'PROTECTIVE',
    trigger_type: args.triggerType,
    fingerprint,
    title: args.title,
    body: args.body,
    tone: 'calm-operational',
    status: 'ACTIVE',
    action_target: null,
    reason_json: JSON.stringify(args.reason),
    created_at_ms: args.asofMs,
    updated_at_ms: args.asofMs
  };
  args.repo.upsertNotificationEvent(event);
  recordAuditEvent(args.repo, {
    traceId: args.traceId,
    scope: 'evolution',
    eventType: args.triggerType,
    userId: args.userId,
    entityType: 'notification_event',
    entityId: event.id,
    payload: args.reason
  });
  await sendDiscordAlert({
    title: args.title,
    description: args.body,
    severity: args.triggerType.includes('ROLLBACK') ? 'ERROR' : 'WARN',
    fields: [
      { name: 'Market', value: args.market },
      { name: 'Date', value: dateKey(args.asofMs) }
    ]
  });
}

function createModelVersionRecord(args: {
  market: Market;
  config: PandaModelRuntimeConfig;
  status: ModelVersionRecord['status'];
  label: string;
  asofMs: number;
}): ModelVersionRecord {
  const configHash = hashJson(args.config).slice(0, 12);
  const semanticVersion = `${args.label}-${dateKey(args.asofMs)}-${configHash.slice(0, 6)}`;
  return {
    id: `model-${args.market.toLowerCase()}-${semanticVersion}`.replace(/[^a-zA-Z0-9._-]/g, '-'),
    model_key: marketModelKey(args.market),
    provider: 'nova-quant',
    endpoint: null,
    task_scope: `${args.market}:runtime`,
    semantic_version: semanticVersion,
    status: args.status,
    config_json: JSON.stringify(args.config),
    created_at_ms: args.asofMs,
    updated_at_ms: args.asofMs
  };
}

function persistBacktestEvaluation(args: {
  repo: MarketRepository;
  market: Market;
  runtimeSnapshot: RuntimeSnapshotLike;
  model: ModelVersionRecord;
  strategy: StrategyVersionRecord;
  metrics: WalkForwardMetrics;
  asofMs: number;
}): string {
  const barSets = listMarketBarSets(args.repo, args.market);
  const datasetArtifacts = ensureDatasetArtifacts({
    repo: args.repo,
    market: args.market,
    runtimeSnapshot: args.runtimeSnapshot,
    members: barSets.map((entry) => entry.asset.symbol),
    asofMs: args.asofMs
  });
  const runId = `wf-${args.market.toLowerCase()}-${hashText(`${args.model.id}|${args.asofMs}`).slice(0, 16)}`;
  const firstFold = args.metrics.folds[0] || null;
  const lastFold = args.metrics.folds[args.metrics.folds.length - 1] || null;
  const status: BacktestRunRecord['status'] =
    args.metrics.status === 'READY' ? 'SUCCESS' : args.metrics.status === 'FAILED' ? 'FAILED' : 'WITHHELD';
  args.repo.createBacktestRun({
    id: runId,
    run_type: 'walk_forward',
    strategy_version_id: args.strategy.id,
    dataset_version_id: datasetArtifacts.datasetId,
    universe_version_id: datasetArtifacts.universeId,
    execution_profile_id: datasetArtifacts.executionProfileId,
    config_hash: hashJson({
      strategy_id: args.strategy.id,
      model_id: args.model.id,
      metrics: args.metrics
    }),
    started_at_ms: args.asofMs,
    completed_at_ms: args.asofMs,
    status,
    train_window: firstFold ? `${firstFold.trainStartTs}:${firstFold.trainEndTs}` : null,
    validation_window: null,
    test_window: firstFold && lastFold ? `${firstFold.testStartTs}:${lastFold.testEndTs}` : null,
    notes: `Walk-forward evaluation for ${args.model.id}`
  });
  const backtestMetric: BacktestMetricRecord = {
    backtest_run_id: runId,
    gross_return: args.metrics.grossReturn,
    net_return: args.metrics.netReturn,
    sharpe: args.metrics.sharpe,
    sortino: args.metrics.sortino,
    max_drawdown: args.metrics.maxDrawdown,
    turnover: args.metrics.turnover,
    win_rate: args.metrics.winRate,
    hit_rate: args.metrics.hitRate,
    cost_drag: args.metrics.costDrag,
    sample_size: args.metrics.sampleSize,
    withheld_reason: args.metrics.withheldReason,
    realism_grade: args.metrics.realismGrade,
    robustness_grade: args.metrics.robustnessGrade,
    status: args.metrics.status,
    created_at_ms: args.asofMs,
    updated_at_ms: args.asofMs
  };
  args.repo.upsertBacktestMetric(backtestMetric);
  args.repo.insertBacktestArtifacts([
    {
      backtest_run_id: runId,
      artifact_type: 'walk_forward_folds',
      path_or_payload: JSON.stringify(args.metrics.folds),
      created_at_ms: args.asofMs
    },
    {
      backtest_run_id: runId,
      artifact_type: 'model_config',
      path_or_payload: args.model.config_json,
      created_at_ms: args.asofMs
    }
  ]);
  args.repo.upsertEvalRecord({
    id: `eval-model-${hashText(`${args.model.id}|${runId}`).slice(0, 20)}`,
    eval_type: 'walk_forward_monitor',
    subject_type: 'model',
    subject_id: args.model.id,
    subject_version: args.model.semantic_version,
    score_json: JSON.stringify(args.metrics),
    notes: `Walk-forward evaluation run ${runId}`,
    created_at_ms: args.asofMs
  });
  return runId;
}

function setCompetitionStatuses(args: {
  repo: MarketRepository;
  market: Market;
  activeModelId: string;
  challengerModelId?: string | null;
  asofMs: number;
}) {
  const modelKey = marketModelKey(args.market);
  const models = args.repo.listModelVersions({
    modelKey,
    limit: 50
  });
  for (const model of models) {
    let nextStatus: ModelVersionRecord['status'] = 'deprecated';
    if (model.id === args.activeModelId) nextStatus = 'active';
    else if (args.challengerModelId && model.id === args.challengerModelId) nextStatus = 'challenger';
    if (model.status !== nextStatus) {
      args.repo.upsertModelVersion({
        ...model,
        status: nextStatus,
        updated_at_ms: args.asofMs
      });
    }
  }

  const strategies = args.repo.listStrategyVersions({
    strategyKey: marketStrategyKey(args.market),
    limit: 50
  });
  for (const strategy of strategies) {
    const linkedModelId = safeParseJson<{ model_id?: string }>(strategy.config_json, {}).model_id || null;
    let nextStatus: StrategyLifecycleStatus = 'deprecated';
    if (linkedModelId === args.activeModelId) nextStatus = 'champion';
    else if (args.challengerModelId && linkedModelId === args.challengerModelId) nextStatus = 'challenger';
    if (strategy.status !== nextStatus) {
      args.repo.upsertStrategyVersion({
        ...strategy,
        status: nextStatus,
        updated_at_ms: args.asofMs
      });
    }
  }
}

async function runMarketEvolution(args: {
  repo: MarketRepository;
  userId: string;
  market: Market;
  runtimeSnapshot: RuntimeSnapshotLike;
  asofMs: number;
  traceId: string;
}) {
  const activeModel = ensureDefaultActiveModel(args.repo, args.market, args.asofMs);
  const activeConfig = resolvePandaModelConfig(safeParseJson(activeModel.config_json, {}));
  const barSets = listMarketBarSets(args.repo, args.market);
  const factorEvalCount =
    storeMeasuredFactorEffects(args.repo, args.market, args.asofMs) +
    storeRuntimeFactorEffects(args.repo, args.market, barSets, args.asofMs);

  const activeStrategy = ensureStrategyRecord(args.repo, activeModel);
  const activeMetrics = aggregateEvaluations({
    market: args.market,
    config: activeConfig,
    barSets
  });
  const activeBacktestRunId = persistBacktestEvaluation({
    repo: args.repo,
    market: args.market,
    runtimeSnapshot: args.runtimeSnapshot,
    model: activeModel,
    strategy: activeStrategy,
    metrics: activeMetrics,
    asofMs: args.asofMs
  });
  args.repo.upsertExperimentRecord({
    id: `exp-${activeBacktestRunId}`,
    backtest_run_id: activeBacktestRunId,
    strategy_version_id: activeStrategy.id,
    decision_status: 'hold',
    promotion_reason: null,
    demotion_reason: null,
    approved_at_ms: null,
    created_at_ms: args.asofMs
  });

  const challengers: EvaluatedModel[] = [];
  for (const template of candidateTemplates()) {
    const config = fitCandidateConfig(barSets, args.market, template, activeConfig);
    const model = createModelVersionRecord({
      market: args.market,
      config,
      status: 'challenger',
      label: template.label,
      asofMs: args.asofMs
    });
    args.repo.upsertModelVersion(model);
    const strategy = ensureStrategyRecord(args.repo, model);
    const metrics = aggregateEvaluations({
      market: args.market,
      config,
      barSets
    });
    const backtestRunId = persistBacktestEvaluation({
      repo: args.repo,
      market: args.market,
      runtimeSnapshot: args.runtimeSnapshot,
      model,
      strategy,
      metrics,
      asofMs: args.asofMs
    });
    args.repo.upsertExperimentRecord({
      id: `exp-${backtestRunId}`,
      backtest_run_id: backtestRunId,
      strategy_version_id: strategy.id,
      decision_status: metrics.status === 'READY' ? 'challenger' : 'hold',
      promotion_reason: null,
      demotion_reason: metrics.status === 'READY' ? null : metrics.withheldReason,
      approved_at_ms: null,
      created_at_ms: args.asofMs
    });
    challengers.push({
      label: template.label,
      model,
      strategy,
      metrics,
      backtestRunId
    });
  }

  const bestChallenger =
    challengers
      .filter((row) => row.metrics.status === 'READY')
      .sort((a, b) => (b.metrics.netReturn - a.metrics.maxDrawdown) - (a.metrics.netReturn - a.metrics.maxDrawdown))[0] ||
    null;

  let promoted = false;
  let rolledBack = false;
  let safeMode = activeConfig.safeMode;
  let activeModelId = activeModel.id;
  let challengerModelId = bestChallenger?.model.id || null;

  if (shouldRollback(activeMetrics, args.runtimeSnapshot)) {
    const fallbackModel = loadDeprecatedModel(args.repo, args.market, activeModel.id);
    if (fallbackModel) {
      setCompetitionStatuses({
        repo: args.repo,
        market: args.market,
        activeModelId: fallbackModel.id,
        challengerModelId,
        asofMs: args.asofMs
      });
      activeModelId = fallbackModel.id;
      rolledBack = true;
      safeMode = resolvePandaModelConfig(safeParseJson(fallbackModel.config_json, {})).safeMode;
      await recordProtectiveAlert({
        repo: args.repo,
        userId: args.userId,
        market: args.market,
        title: `${args.market} runtime rolled back`,
        body: 'Active model failed health checks, so the runtime switched back to the previous stable champion.',
        triggerType: 'EVOLUTION_ROLLBACK',
        reason: {
          previous_active_model_id: activeModel.id,
          rollback_to_model_id: fallbackModel.id,
          active_metrics: activeMetrics
        },
        asofMs: args.asofMs,
        traceId: args.traceId
      });
    } else {
      const patchedConfig = resolvePandaModelConfig({
        ...activeConfig,
        safeMode: true,
        rollbackTargetId: activeModel.id
      });
      args.repo.upsertModelVersion({
        ...activeModel,
        config_json: JSON.stringify(patchedConfig),
        updated_at_ms: args.asofMs
      });
      safeMode = true;
      await recordProtectiveAlert({
        repo: args.repo,
        userId: args.userId,
        market: args.market,
        title: `${args.market} runtime entered safe mode`,
        body: 'No healthy fallback champion was available, so the active panda model was forced into safe mode.',
        triggerType: 'EVOLUTION_SAFE_MODE',
        reason: {
          active_model_id: activeModel.id,
          active_metrics: activeMetrics
        },
        asofMs: args.asofMs,
        traceId: args.traceId
      });
    }
  } else if (bestChallenger && shouldPromote(bestChallenger.metrics, activeMetrics)) {
    setCompetitionStatuses({
      repo: args.repo,
      market: args.market,
      activeModelId: bestChallenger.model.id,
      challengerModelId: activeModel.id,
      asofMs: args.asofMs
    });
    args.repo.upsertExperimentRecord({
      id: `promotion-${bestChallenger.backtestRunId}`,
      backtest_run_id: bestChallenger.backtestRunId,
      strategy_version_id: bestChallenger.strategy.id,
      decision_status: 'champion',
      promotion_reason: `Promoted over ${activeModel.id} on net_return=${round(bestChallenger.metrics.netReturn, 4)} sharpe=${round(bestChallenger.metrics.sharpe, 4)}`,
      demotion_reason: null,
      approved_at_ms: args.asofMs,
      created_at_ms: args.asofMs
    });
    promoted = true;
    activeModelId = bestChallenger.model.id;
    challengerModelId = activeModel.id;
    safeMode = resolvePandaModelConfig(safeParseJson(bestChallenger.model.config_json, {})).safeMode;
    await recordProtectiveAlert({
      repo: args.repo,
      userId: args.userId,
      market: args.market,
      title: `${args.market} challenger promoted`,
      body: 'A challenger beat the current champion on walk-forward checks and has been promoted into the live runtime slot.',
      triggerType: 'EVOLUTION_PROMOTION',
      reason: {
        previous_active_model_id: activeModel.id,
        promoted_model_id: bestChallenger.model.id,
        champion_metrics: activeMetrics,
        challenger_metrics: bestChallenger.metrics
      },
      asofMs: args.asofMs,
      traceId: args.traceId
    });
  } else {
    if (activeConfig.safeMode && args.runtimeSnapshot.sourceStatus === 'DB_BACKED') {
      const patchedConfig = resolvePandaModelConfig({
        ...activeConfig,
        safeMode: false
      });
      args.repo.upsertModelVersion({
        ...activeModel,
        config_json: JSON.stringify(patchedConfig),
        updated_at_ms: args.asofMs
      });
      safeMode = false;
    }
    setCompetitionStatuses({
      repo: args.repo,
      market: args.market,
      activeModelId: activeModel.id,
      challengerModelId,
      asofMs: args.asofMs
    });
  }

  recordAuditEvent(args.repo, {
    traceId: args.traceId,
    scope: 'evolution',
    eventType: 'MARKET_EVOLUTION_COMPLETED',
    userId: args.userId,
    entityType: 'market',
    entityId: args.market,
    payload: {
      factor_eval_count: factorEvalCount,
      promoted,
      rolledBack,
      safeMode,
      active_model_id: activeModelId,
      challenger_model_id: challengerModelId,
      active_metrics: activeMetrics,
      best_challenger_metrics: bestChallenger?.metrics || null
    }
  });

  return {
    market: args.market,
    factorEvalCount,
    promoted,
    rolledBack,
    safeMode,
    activeModelId,
    challengerModelId,
    summary: promoted
      ? `Promoted ${activeModelId} after walk-forward improvement.`
      : rolledBack
        ? `Rolled back ${args.market} runtime after health degradation.`
        : safeMode
          ? `Kept ${args.market} runtime in safe mode.`
          : `Held current ${args.market} champion; challengers remain in shadow.`
  };
}

export async function runEvolutionCycle(args: {
  repo: MarketRepository;
  userId: string;
  runtimeSnapshot: RuntimeSnapshotLike;
  markets?: Market[];
}): Promise<EvolutionCycleResult> {
  const asofMs = Date.now();
  const traceId = createTraceId('evo');
  const workflowId = `workflow-${traceId}`;
  const markets: Market[] = args.markets?.length ? args.markets : ['US', 'CRYPTO'];

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: EVOLUTION_WORKFLOW_KEY,
    workflow_version: EVOLUTION_WORKFLOW_VERSION,
    trigger_type: 'scheduled',
    status: 'RUNNING',
    trace_id: traceId,
    input_json: JSON.stringify({
      markets,
      asof: new Date(asofMs).toISOString()
    }),
    output_json: null,
    attempt_count: 1,
    started_at_ms: asofMs,
    updated_at_ms: asofMs,
    completed_at_ms: null
  });

  recordAuditEvent(args.repo, {
    traceId,
    scope: 'evolution',
    eventType: 'EVOLUTION_STARTED',
    userId: args.userId,
    entityType: 'workflow_run',
    entityId: workflowId,
    payload: { markets }
  });

  try {
    const results = [];
    for (const market of markets) {
      results.push(
        await runMarketEvolution({
          repo: args.repo,
          userId: args.userId,
          market,
          runtimeSnapshot: args.runtimeSnapshot,
          asofMs,
          traceId
        })
      );
    }

    args.repo.upsertWorkflowRun({
      id: workflowId,
      workflow_key: EVOLUTION_WORKFLOW_KEY,
      workflow_version: EVOLUTION_WORKFLOW_VERSION,
      trigger_type: 'scheduled',
      status: 'SUCCEEDED',
      trace_id: traceId,
      input_json: JSON.stringify({ markets }),
      output_json: JSON.stringify(results),
      attempt_count: 1,
      started_at_ms: asofMs,
      updated_at_ms: Date.now(),
      completed_at_ms: Date.now()
    });

    recordAuditEvent(args.repo, {
      traceId,
      scope: 'evolution',
      eventType: 'EVOLUTION_COMPLETED',
      userId: args.userId,
      entityType: 'workflow_run',
      entityId: workflowId,
      payload: { results }
    });

    return {
      workflowId,
      traceId,
      markets: results
    };
  } catch (error) {
    args.repo.upsertWorkflowRun({
      id: workflowId,
      workflow_key: EVOLUTION_WORKFLOW_KEY,
      workflow_version: EVOLUTION_WORKFLOW_VERSION,
      trigger_type: 'scheduled',
      status: 'FAILED',
      trace_id: traceId,
      input_json: JSON.stringify({ markets }),
      output_json: JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }),
      attempt_count: 1,
      started_at_ms: asofMs,
      updated_at_ms: Date.now(),
      completed_at_ms: Date.now()
    });

    recordAuditEvent(args.repo, {
      traceId,
      scope: 'evolution',
      eventType: 'EVOLUTION_FAILED',
      userId: args.userId,
      entityType: 'workflow_run',
      entityId: workflowId,
      payload: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}

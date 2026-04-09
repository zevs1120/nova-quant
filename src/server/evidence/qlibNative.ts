import { createHash } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import type {
  AssetClass,
  BacktestMetricRecord,
  BacktestRunRecord,
  DatasetVersionRecord,
  ExecutionProfileRecord,
  GradeLetter,
  Market,
  UniverseSnapshotRecord,
} from '../types.js';
import {
  runQlibNativeBacktest,
  type QlibNativeBacktestRequest,
  type QlibNativeBacktestResult,
} from '../nova/qlibClient.js';

type QlibNativeEvidenceArgs = {
  repo: MarketRepository;
  request: QlibNativeBacktestRequest;
  market?: Market | 'ALL';
  assetClass?: AssetClass | 'ALL';
  benchmark?: string | null;
  bridgeResult?: QlibNativeBacktestResult;
};

function nowMs() {
  return Date.now();
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeSymbols(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
}

function resolveMarket(args: QlibNativeEvidenceArgs): Market | 'ALL' {
  if (args.market) return args.market;
  return args.request.symbols.some((symbol) => /USDT$|USD$|PERP$/i.test(symbol)) ? 'CRYPTO' : 'US';
}

function resolveAssetClass(market: Market | 'ALL', input?: AssetClass | 'ALL'): AssetClass | 'ALL' {
  if (input) return input;
  if (market === 'CRYPTO') return 'CRYPTO';
  if (market === 'US') return 'US_STOCK';
  return 'ALL';
}

function ensureQlibDataset(args: {
  repo: MarketRepository;
  request: QlibNativeBacktestRequest;
  market: Market | 'ALL';
  assetClass: AssetClass | 'ALL';
  asOf: number;
}) {
  const sourceBundleHash = hashJson({
    source: 'qlib-native',
    symbols: normalizeSymbols(args.request.symbols),
    start_date: args.request.start_date,
    end_date: args.request.end_date,
    factor_set: args.request.factor_set || 'Alpha158',
    benchmark: args.request.benchmark || null,
  });
  const existing = args.repo.findDatasetVersionByHash({
    market: args.market,
    assetClass: args.assetClass,
    timeframe: '1d',
    sourceBundleHash,
  });
  if (existing) return existing;

  const row: DatasetVersionRecord = {
    id: `qlib-dataset-${sourceBundleHash.slice(0, 16)}`,
    market: args.market,
    asset_class: args.assetClass,
    timeframe: '1d',
    source_bundle_hash: sourceBundleHash,
    coverage_summary_json: JSON.stringify({
      source: 'qlib-provider',
      symbols: normalizeSymbols(args.request.symbols),
      factor_set: args.request.factor_set || 'Alpha158',
      requested_start_date: args.request.start_date,
      requested_end_date: args.request.end_date,
    }),
    freshness_summary_json: JSON.stringify({
      source: 'qlib-native-backtest-request',
      generated_at_ms: args.asOf,
    }),
    notes:
      'Qlib native provider dataset request. Source bars/features live in the Python Qlib sidecar.',
    created_at_ms: args.asOf,
  };
  args.repo.createDatasetVersion(row);
  return row;
}

function ensureQlibUniverse(args: {
  repo: MarketRepository;
  dataset: DatasetVersionRecord;
  request: QlibNativeBacktestRequest;
  market: Market | 'ALL';
  assetClass: AssetClass | 'ALL';
  asOf: number;
}) {
  const id = `qlib-universe-${hashJson({
    dataset: args.dataset.id,
    symbols: normalizeSymbols(args.request.symbols),
  }).slice(0, 16)}`;
  const row: UniverseSnapshotRecord = {
    id,
    dataset_version_id: args.dataset.id,
    snapshot_ts_ms: args.asOf,
    market: args.market,
    asset_class: args.assetClass,
    members_json: JSON.stringify(
      normalizeSymbols(args.request.symbols).map((symbol) => ({
        symbol,
        source: 'qlib-native-request',
      })),
    ),
    created_at_ms: args.asOf,
  };
  args.repo.upsertUniverseSnapshot(row);
  return row;
}

function ensureQlibExecutionProfile(repo: MarketRepository, asOf: number) {
  const row: ExecutionProfileRecord = {
    id: 'exec-qlib-native-v1',
    profile_name: 'qlib_native_simulator',
    spread_model_json: JSON.stringify({ source: 'qlib_simulator_executor' }),
    slippage_model_json: JSON.stringify({ source: 'qlib_simulator_executor' }),
    fee_model_json: JSON.stringify({ source: 'qlib_simulator_executor' }),
    fill_policy_json: JSON.stringify({ mode: 'qlib_topk_dropout_native' }),
    latency_assumption_json: JSON.stringify({ latency_ms: null, source: 'offline_backtest' }),
    version: 'v1',
    created_at_ms: asOf,
  };
  repo.upsertExecutionProfile(row);
  return row;
}

function totalReturnProxy(result: QlibNativeBacktestResult) {
  const avgDaily = result.metrics?.avg_daily_return;
  const tradingDays = result.metrics?.trading_days || 0;
  return typeof avgDaily === 'number' && Number.isFinite(avgDaily)
    ? round(avgDaily * tradingDays, 6)
    : null;
}

function gradeFromSharpe(sharpe: number | null | undefined): GradeLetter {
  if (typeof sharpe !== 'number' || !Number.isFinite(sharpe)) return 'WITHHELD';
  if (sharpe >= 1.2) return 'A';
  if (sharpe >= 0.7) return 'B';
  if (sharpe >= 0.2) return 'C';
  return 'D';
}

function metricStatus(result: QlibNativeBacktestResult): BacktestMetricRecord['status'] {
  return result.status === 'ok' && result.metrics ? 'READY' : 'WITHHELD';
}

function runStatus(result: QlibNativeBacktestResult): BacktestRunRecord['status'] {
  if (result.status === 'ok' && result.metrics) return 'SUCCESS';
  if (['no_data', 'parse_error'].includes(result.status)) return 'WITHHELD';
  return 'FAILED';
}

function buildMetric(args: {
  runId: string;
  result: QlibNativeBacktestResult;
  asOf: number;
}): BacktestMetricRecord {
  const netReturn = totalReturnProxy(args.result);
  const sharpe = args.result.metrics?.sharpe ?? null;
  const status = metricStatus(args.result);
  return {
    backtest_run_id: args.runId,
    gross_return: netReturn,
    net_return: netReturn,
    sharpe,
    sortino: null,
    max_drawdown: args.result.metrics?.max_drawdown ?? null,
    turnover: null,
    win_rate: null,
    hit_rate: null,
    cost_drag: null,
    sample_size: Math.max(0, args.result.metrics?.trading_days || 0),
    withheld_reason: status === 'READY' ? null : `qlib_native_status:${args.result.status}`,
    realism_grade: status === 'READY' ? 'B' : 'WITHHELD',
    robustness_grade: gradeFromSharpe(sharpe),
    status,
    created_at_ms: args.asOf,
    updated_at_ms: args.asOf,
  };
}

export async function runQlibNativeBacktestEvidence(args: QlibNativeEvidenceArgs) {
  const asOf = nowMs();
  const request: QlibNativeBacktestRequest = {
    ...args.request,
    symbols: normalizeSymbols(args.request.symbols),
    factor_set: args.request.factor_set || 'Alpha158',
    benchmark: args.request.benchmark ?? args.benchmark ?? null,
  };
  const market = resolveMarket(args);
  const assetClass = resolveAssetClass(market, args.assetClass);
  const dataset = ensureQlibDataset({
    repo: args.repo,
    request,
    market,
    assetClass,
    asOf,
  });
  const universe = ensureQlibUniverse({
    repo: args.repo,
    dataset,
    request,
    market,
    assetClass,
    asOf,
  });
  const executionProfile = ensureQlibExecutionProfile(args.repo, asOf);
  const configHash = hashJson({
    engine: 'qlib-native-v1',
    request,
    market,
    assetClass,
  });
  const runId = `qlib-native-${configHash.slice(0, 16)}-${asOf}`;
  const started = nowMs();
  const result = args.bridgeResult ?? (await runQlibNativeBacktest(request));
  const completed = nowMs();
  const status = runStatus(result);
  const run: BacktestRunRecord = {
    id: runId,
    run_type: 'portfolio_replay',
    strategy_version_id: null,
    dataset_version_id: dataset.id,
    universe_version_id: universe.id,
    execution_profile_id: executionProfile.id,
    config_hash: configHash,
    started_at_ms: started,
    completed_at_ms: completed,
    status,
    train_window: null,
    validation_window: null,
    test_window: `${request.start_date}:${request.end_date}`,
    notes: `Qlib native backtest (${request.factor_set}) via Python sidecar. Native status: ${result.status}.`,
  };
  args.repo.createBacktestRun(run);
  const metric = buildMetric({ runId, result, asOf: completed });
  args.repo.upsertBacktestMetric(metric);
  args.repo.insertBacktestArtifacts([
    {
      backtest_run_id: runId,
      artifact_type: 'qlib_native_request',
      path_or_payload: JSON.stringify(request),
      created_at_ms: completed,
    },
    {
      backtest_run_id: runId,
      artifact_type: 'qlib_native_response',
      path_or_payload: JSON.stringify(result),
      created_at_ms: completed,
    },
    {
      backtest_run_id: runId,
      artifact_type: 'qlib_native_metrics',
      path_or_payload: JSON.stringify({
        native_metrics: result.metrics,
        persisted_metric: metric,
        elapsed_ms: result.elapsed_ms,
        notes: result.notes || [],
      }),
      created_at_ms: completed,
    },
  ]);

  return {
    run_id: runId,
    status,
    native_status: result.status,
    dataset_version_id: dataset.id,
    universe_version_id: universe.id,
    execution_profile_id: executionProfile.id,
    metric,
    result,
  };
}

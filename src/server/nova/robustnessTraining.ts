import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import type { Market, RiskProfileKey } from '../types.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';
import {
  generateNovaProductionStrategyPack,
  type NumericBar,
  type ProductionStrategyPack,
} from './productionStrategyPack.js';

type TaskMarketScope = Market | 'ALL';

export type NovaRobustnessTrainingTaskSpec = {
  task_id: string;
  label: string;
  market_scope: TaskMarketScope;
  risk_profile: RiskProfileKey;
  symbols?: string[];
  start: string;
  end: string;
  duration_days: number;
  offset_days: number;
};

type NovaRobustnessTaskResult = {
  task: NovaRobustnessTrainingTaskSpec;
  status: 'SUCCEEDED' | 'FAILED';
  pass: boolean;
  metrics: {
    sharpe: number;
    annual_return: number;
    max_drawdown: number;
  } | null;
  target_status: {
    sharpe_pass: boolean;
    annual_pass: boolean;
    drawdown_pass: boolean;
  };
  markets: Array<{
    market: Market;
    selected_bundle_id: string;
    annual_return: number;
    sharpe: number;
    max_drawdown: number;
    rolling_oos_pass_rate: number;
    perturbation_pass_rate: number;
    robust_parameter_intervals: Array<{
      parameter: string;
      min: number;
      max: number;
    }>;
    risk_flags: string[];
  }>;
  failure_reasons: string[];
  error?: string | null;
};

type RobustnessTrainingSummary = {
  task_count: number;
  completed_task_count: number;
  failed_task_count: number;
  target_pass_count: number;
  target_pass_rate: number;
  sharpe_pass_rate: number;
  annual_pass_rate: number;
  drawdown_pass_rate: number;
  average_sharpe: number;
  average_annual_return: number;
  average_max_drawdown: number;
  average_rolling_oos_pass_rate: number;
  average_perturbation_pass_rate: number;
  pass_rate_by_market_scope: Record<string, number>;
  pass_rate_by_risk_profile: Record<string, number>;
  top_failure_reasons: Array<{ reason: string; count: number }>;
};

type RobustnessPromotionGate = {
  ready: boolean;
  reason: string;
  thresholds: {
    target_pass_rate_min: number;
    annual_pass_rate_min: number;
    sharpe_pass_rate_min: number;
    drawdown_pass_rate_min: number;
    rolling_oos_pass_rate_min: number;
    perturbation_pass_rate_min: number;
  };
  current: {
    target_pass_rate: number;
    annual_pass_rate: number;
    sharpe_pass_rate: number;
    drawdown_pass_rate: number;
    rolling_oos_pass_rate: number;
    perturbation_pass_rate: number;
  };
};

export interface NovaRobustnessTrainingReport {
  generated_at: string;
  workflow_id: string;
  trace_id: string;
  market_scope: TaskMarketScope;
  task_limit: number;
  seed: number;
  tasks: NovaRobustnessTaskResult[];
  summary: RobustnessTrainingSummary;
  promotion_gate: RobustnessPromotionGate;
  learning_objectives: string[];
  deployment: {
    api_route: string;
    aws_command: string;
    artifact_json_path: string | null;
    artifact_md_path: string | null;
  };
  markdown_report: string;
}

export interface NovaRobustnessTrainingArgs {
  repo: MarketRepository;
  userId?: string | null;
  locale?: string | null;
  market?: TaskMarketScope | null;
  start?: string | null;
  end?: string | null;
  taskLimit?: number | null;
  riskProfiles?: RiskProfileKey[] | null;
  seed?: number | null;
  writeArtifacts?: boolean;
  symbolBarsByMarket?: Partial<Record<Market, Record<string, NumericBar[]>>>;
  taskSpecs?: NovaRobustnessTrainingTaskSpec[] | null;
}

const TARGET_THRESHOLDS = Object.freeze({
  sharpe: 1.2,
  annual_return: 0.15,
  max_drawdown: 0.1,
});

const PROMOTION_GATE_THRESHOLDS = Object.freeze({
  target_pass_rate_min: 0.55,
  annual_pass_rate_min: 0.5,
  sharpe_pass_rate_min: 0.65,
  drawdown_pass_rate_min: 0.8,
  rolling_oos_pass_rate_min: 0.45,
  perturbation_pass_rate_min: 0.75,
  // RT-1 fix: Require average Sharpe to stay within this delta of the target threshold.
  // If target Sharpe is 1.2, the average across tasks must be >= 1.2 - 0.15 = 1.05.
  // Previous implicit tolerance of 0.3 was too lenient for production deployment.
  max_sharpe_delta_from_target: 0.15,
});

const DEFAULT_SYMBOLS: Record<Market, string[]> = {
  US: ['SPY', 'QQQ', 'IWM', 'XLK', 'XLF', 'XLE', 'AAPL', 'MSFT'],
  CRYPTO: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
};

function safeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round((safeNumber(value, 0) + Number.EPSILON) * factor) / factor;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + safeNumber(value, 0), 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toIsoDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function makeSeededRandom(seed = 7): () => number {
  let state = Math.max(1, Math.floor(seed));
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function pickUnique<T>(items: T[], count: number, rand: () => number): T[] {
  if (count >= items.length) return [...items];
  const pool = [...items];
  const out: T[] = [];
  while (pool.length && out.length < count) {
    const index = Math.floor(rand() * pool.length);
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

function resolveActiveSymbols(repo: MarketRepository, market: Market): string[] {
  const live = repo
    .listAssets(market)
    .filter((row) => String(row.status || '').toUpperCase() === 'ACTIVE')
    .map((row) =>
      String(row.symbol || '')
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
  if (live.length) return [...new Set(live)];
  return DEFAULT_SYMBOLS[market];
}

function sampleTaskSpecs(args: {
  repo: MarketRepository;
  marketScope: TaskMarketScope;
  start?: string | null;
  end?: string | null;
  riskProfiles: RiskProfileKey[];
  taskLimit: number;
  seed: number;
}): NovaRobustnessTrainingTaskSpec[] {
  const rand = makeSeededRandom(args.seed);
  const endTs = args.end ? Date.parse(args.end) : Date.now();
  const startFloorTs = args.start ? Date.parse(args.start) : endTs - 760 * 24 * 60 * 60 * 1000;
  const scopes: TaskMarketScope[] =
    args.marketScope === 'ALL' ? ['ALL', 'US', 'CRYPTO'] : [args.marketScope];
  const durationsByScope: Record<TaskMarketScope, number[]> = {
    ALL: [180, 270, 365, 540],
    US: [180, 270, 365, 540],
    CRYPTO: [120, 180, 270, 365],
  };
  const offsets = [0, 30, 60, 90, 120, 180];
  const baseTasks: NovaRobustnessTrainingTaskSpec[] = [];

  for (const scope of scopes) {
    for (const riskProfile of args.riskProfiles) {
      const durationDays =
        durationsByScope[scope][Math.floor(rand() * durationsByScope[scope].length)];
      const offsetDays = offsets[Math.floor(rand() * 2)];
      const taskEndTs = endTs - offsetDays * 24 * 60 * 60 * 1000;
      const taskStartTs = Math.max(startFloorTs, taskEndTs - durationDays * 24 * 60 * 60 * 1000);
      const symbols =
        scope === 'ALL'
          ? undefined
          : pickUnique(resolveActiveSymbols(args.repo, scope), scope === 'US' ? 4 : 3, rand);
      baseTasks.push({
        task_id: `robust-task-${baseTasks.length + 1}`,
        label: `${scope}-${riskProfile}-${durationDays}d`,
        market_scope: scope,
        risk_profile: riskProfile,
        symbols,
        start: toIsoDay(taskStartTs),
        end: toIsoDay(taskEndTs),
        duration_days: Math.max(1, Math.round((taskEndTs - taskStartTs) / (24 * 60 * 60 * 1000))),
        offset_days: offsetDays,
      });
    }
  }

  const tasks = [...baseTasks];
  while (tasks.length < args.taskLimit) {
    const scope = scopes[Math.floor(rand() * scopes.length)];
    const riskProfile = args.riskProfiles[Math.floor(rand() * args.riskProfiles.length)];
    const durationDays =
      durationsByScope[scope][Math.floor(rand() * durationsByScope[scope].length)];
    const offsetDays = offsets[Math.floor(rand() * offsets.length)];
    const taskEndTs = endTs - offsetDays * 24 * 60 * 60 * 1000;
    const taskStartTs = Math.max(startFloorTs, taskEndTs - durationDays * 24 * 60 * 60 * 1000);
    const symbols =
      scope === 'ALL'
        ? undefined
        : pickUnique(resolveActiveSymbols(args.repo, scope), scope === 'US' ? 4 : 3, rand);
    tasks.push({
      task_id: `robust-task-${tasks.length + 1}`,
      label: `${scope}-${riskProfile}-${durationDays}d-off${offsetDays}`,
      market_scope: scope,
      risk_profile: riskProfile,
      symbols,
      start: toIsoDay(taskStartTs),
      end: toIsoDay(taskEndTs),
      duration_days: Math.max(1, Math.round((taskEndTs - taskStartTs) / (24 * 60 * 60 * 1000))),
      offset_days: offsetDays,
    });
  }

  const selected = tasks.slice(0, args.taskLimit);

  // RT-2 fix: Validate task diversity — ensure tasks span at least 2 distinct risk
  // profiles AND 2 distinct duration buckets. Without this, the seeded random could
  // produce highly similar tasks that reduce the value of robustness evaluation.
  const uniqueProfiles = new Set(selected.map((t) => t.risk_profile));
  const uniqueDurations = new Set(selected.map((t) => t.duration_days));
  const diversityOk =
    uniqueProfiles.size >= Math.min(2, args.riskProfiles.length) && uniqueDurations.size >= 2;

  if (!diversityOk && selected.length >= 4) {
    // If diversity is insufficient, inject variety by cycling through available
    // risk profiles and durations for the second half of the task list.
    const allDurations = [...new Set(Object.values(durationsByScope).flat())];
    const halfPoint = Math.floor(selected.length / 2);
    for (let i = halfPoint; i < selected.length; i += 1) {
      const task = selected[i];
      task.risk_profile = args.riskProfiles[i % args.riskProfiles.length];
      task.duration_days = allDurations[i % allDurations.length];
      task.label = `${task.market_scope}-${task.risk_profile}-${task.duration_days}d-diversified`;
    }
  }

  return selected;
}

function summarizeTaskResult(
  task: NovaRobustnessTrainingTaskSpec,
  pack: ProductionStrategyPack,
): NovaRobustnessTaskResult {
  const metrics = pack.combined_portfolio.metrics;
  const sharpePass = safeNumber(metrics?.sharpe, 0) >= TARGET_THRESHOLDS.sharpe;
  const annualPass = safeNumber(metrics?.annual_return, 0) >= TARGET_THRESHOLDS.annual_return;
  const drawdownPass =
    safeNumber(metrics?.max_drawdown, Number.POSITIVE_INFINITY) <= TARGET_THRESHOLDS.max_drawdown;
  const failureReasons: string[] = [];

  if (!sharpePass) failureReasons.push('combined_sharpe_below_threshold');
  if (!annualPass) failureReasons.push('combined_annual_return_below_threshold');
  if (!drawdownPass) failureReasons.push('combined_drawdown_above_threshold');
  for (const marketPack of pack.markets) {
    for (const risk of marketPack.overfit_audit.risk_flags) {
      failureReasons.push(`${marketPack.market}:${risk}`);
    }
  }

  return {
    task,
    status: 'SUCCEEDED',
    pass: sharpePass && annualPass && drawdownPass,
    metrics: metrics
      ? {
          sharpe: metrics.sharpe,
          annual_return: metrics.annual_return,
          max_drawdown: metrics.max_drawdown,
        }
      : null,
    target_status: {
      sharpe_pass: sharpePass,
      annual_pass: annualPass,
      drawdown_pass: drawdownPass,
    },
    markets: pack.markets.map((marketPack) => ({
      market: marketPack.market,
      selected_bundle_id: marketPack.selected_bundle.bundle_id,
      annual_return: marketPack.backtest.metrics.annual_return,
      sharpe: marketPack.backtest.metrics.sharpe,
      max_drawdown: marketPack.backtest.metrics.max_drawdown,
      rolling_oos_pass_rate: marketPack.overfit_audit.rolling_oos_pass_rate,
      perturbation_pass_rate: marketPack.overfit_audit.perturbation_pass_rate,
      robust_parameter_intervals: marketPack.overfit_audit.robust_parameter_intervals.map(
        (row) => ({
          parameter: row.parameter,
          min: row.min,
          max: row.max,
        }),
      ),
      risk_flags: marketPack.overfit_audit.risk_flags,
    })),
    failure_reasons: [...new Set(failureReasons)],
  };
}

function summarizeResults(tasks: NovaRobustnessTaskResult[]): RobustnessTrainingSummary {
  const completed = tasks.filter((row) => row.status === 'SUCCEEDED');
  const completedCount = completed.length;
  const metricsRows = completed.filter((row) => row.metrics);
  const failureMap = new Map<string, number>();
  const marketScopeMap = new Map<string, { total: number; pass: number }>();
  const riskProfileMap = new Map<string, { total: number; pass: number }>();
  const oosScores: number[] = [];
  const perturbScores: number[] = [];

  for (const row of tasks) {
    const marketScope = row.task.market_scope;
    const riskProfile = row.task.risk_profile;
    const scopeStats = marketScopeMap.get(marketScope) || { total: 0, pass: 0 };
    scopeStats.total += 1;
    if (row.pass) scopeStats.pass += 1;
    marketScopeMap.set(marketScope, scopeStats);

    const riskStats = riskProfileMap.get(riskProfile) || { total: 0, pass: 0 };
    riskStats.total += 1;
    if (row.pass) riskStats.pass += 1;
    riskProfileMap.set(riskProfile, riskStats);

    for (const reason of row.failure_reasons) {
      failureMap.set(reason, (failureMap.get(reason) || 0) + 1);
    }
    for (const marketRow of row.markets) {
      oosScores.push(marketRow.rolling_oos_pass_rate);
      perturbScores.push(marketRow.perturbation_pass_rate);
    }
  }

  return {
    task_count: tasks.length,
    completed_task_count: completedCount,
    failed_task_count: tasks.length - completedCount,
    target_pass_count: completed.filter((row) => row.pass).length,
    target_pass_rate: round(
      completedCount ? completed.filter((row) => row.pass).length / completedCount : 0,
      4,
    ),
    sharpe_pass_rate: round(
      completedCount
        ? completed.filter((row) => row.target_status.sharpe_pass).length / completedCount
        : 0,
      4,
    ),
    annual_pass_rate: round(
      completedCount
        ? completed.filter((row) => row.target_status.annual_pass).length / completedCount
        : 0,
      4,
    ),
    drawdown_pass_rate: round(
      completedCount
        ? completed.filter((row) => row.target_status.drawdown_pass).length / completedCount
        : 0,
      4,
    ),
    average_sharpe: round(mean(metricsRows.map((row) => safeNumber(row.metrics?.sharpe, 0))), 4),
    average_annual_return: round(
      mean(metricsRows.map((row) => safeNumber(row.metrics?.annual_return, 0))),
      6,
    ),
    average_max_drawdown: round(
      mean(metricsRows.map((row) => safeNumber(row.metrics?.max_drawdown, 0))),
      6,
    ),
    average_rolling_oos_pass_rate: round(mean(oosScores), 4),
    average_perturbation_pass_rate: round(mean(perturbScores), 4),
    pass_rate_by_market_scope: Object.fromEntries(
      [...marketScopeMap.entries()].map(([key, value]) => [
        key,
        round(value.total ? value.pass / value.total : 0, 4),
      ]),
    ),
    pass_rate_by_risk_profile: Object.fromEntries(
      [...riskProfileMap.entries()].map(([key, value]) => [
        key,
        round(value.total ? value.pass / value.total : 0, 4),
      ]),
    ),
    top_failure_reasons: [...failureMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count })),
  };
}

function buildPromotionGate(summary: RobustnessTrainingSummary): RobustnessPromotionGate {
  // RT-1 fix: Add average Sharpe floor check alongside pass rates.
  // The average Sharpe across completed tasks must be within max_sharpe_delta_from_target
  // of the TARGET_THRESHOLDS.sharpe. This prevents the gate from opening when many tasks
  // pass with a Sharpe of ~0.9 (OOS leak) while the target is 1.2.
  const sharpeDeltaOk =
    summary.average_sharpe >=
    TARGET_THRESHOLDS.sharpe - PROMOTION_GATE_THRESHOLDS.max_sharpe_delta_from_target;
  const ready =
    summary.target_pass_rate >= PROMOTION_GATE_THRESHOLDS.target_pass_rate_min &&
    summary.annual_pass_rate >= PROMOTION_GATE_THRESHOLDS.annual_pass_rate_min &&
    summary.sharpe_pass_rate >= PROMOTION_GATE_THRESHOLDS.sharpe_pass_rate_min &&
    summary.drawdown_pass_rate >= PROMOTION_GATE_THRESHOLDS.drawdown_pass_rate_min &&
    summary.average_rolling_oos_pass_rate >= PROMOTION_GATE_THRESHOLDS.rolling_oos_pass_rate_min &&
    summary.average_perturbation_pass_rate >=
      PROMOTION_GATE_THRESHOLDS.perturbation_pass_rate_min &&
    sharpeDeltaOk;

  const reason = ready
    ? 'Random-task pass rate and robustness gates are strong enough for controlled promotion.'
    : !sharpeDeltaOk
      ? `Keep training. Average Sharpe (${round(summary.average_sharpe, 4)}) is too far below the ${TARGET_THRESHOLDS.sharpe} target.`
      : 'Keep training. Random-task pass rate or robustness gates are still below promotion thresholds.';

  return {
    ready,
    reason,
    thresholds: { ...PROMOTION_GATE_THRESHOLDS },
    current: {
      target_pass_rate: summary.target_pass_rate,
      annual_pass_rate: summary.annual_pass_rate,
      sharpe_pass_rate: summary.sharpe_pass_rate,
      drawdown_pass_rate: summary.drawdown_pass_rate,
      rolling_oos_pass_rate: summary.average_rolling_oos_pass_rate,
      perturbation_pass_rate: summary.average_perturbation_pass_rate,
    },
  };
}

function buildLearningObjectives(summary: RobustnessTrainingSummary): string[] {
  const objectives: string[] = [];
  const joinedReasons = summary.top_failure_reasons.map((row) => row.reason);

  if (summary.annual_pass_rate < 0.5) {
    objectives.push(
      'Increase pass-rate on annual return by improving opportunity coverage in strong trend windows without loosening realism assumptions.',
    );
  }
  if (summary.average_rolling_oos_pass_rate < 0.45) {
    objectives.push(
      'Improve rolling out-of-sample transfer by preferring wider parameter neighborhoods and less regime-specific bundles.',
    );
  }
  if (joinedReasons.some((row) => row.includes('Cross-asset validation is narrow'))) {
    objectives.push(
      'Broaden cross-asset transfer so the edge is not carried by only one symbol or one sector/coin.',
    );
  }
  if (joinedReasons.some((row) => row.includes('Walk-forward pass rate is too low'))) {
    objectives.push(
      'Reduce local-history bias by penalizing parameter sets that lose stability across adjacent windows.',
    );
  }
  if (joinedReasons.some((row) => row.includes('Parameter heatmap has too few stable cells'))) {
    objectives.push(
      'Keep shrinking the effective parameter budget and prefer interval-stable templates over single-point winners.',
    );
  }
  if (!objectives.length) {
    objectives.push(
      'Maintain current robustness gates and keep monitoring for live-paper drift before broad promotion.',
    );
  }
  return objectives;
}

function buildMarkdownReport(report: NovaRobustnessTrainingReport): string {
  const summary = report.summary;
  const gate = report.promotion_gate;
  const taskLines = report.tasks
    .slice(0, 8)
    .map((row) => {
      const metrics = row.metrics;
      return `- ${row.task.label}: ${row.pass ? 'PASS' : 'FAIL'} | Sharpe ${round(
        safeNumber(metrics?.sharpe, 0),
        4,
      )} | Annual ${(safeNumber(metrics?.annual_return, 0) * 100).toFixed(2)}% | Max DD ${(
        safeNumber(metrics?.max_drawdown, 0) * 100
      ).toFixed(2)}%`;
    })
    .join('\n');

  return [
    '**Training Goal**',
    `- Make random-task strategy generation pass targets more often, not just a few curated backtests.`,
    `- Workflow: ${report.workflow_id}`,
    '',
    '**Pass Rate**',
    `- Target pass rate: ${(summary.target_pass_rate * 100).toFixed(1)}%`,
    `- Sharpe pass rate: ${(summary.sharpe_pass_rate * 100).toFixed(1)}%`,
    `- Annual pass rate: ${(summary.annual_pass_rate * 100).toFixed(1)}%`,
    `- Drawdown pass rate: ${(summary.drawdown_pass_rate * 100).toFixed(1)}%`,
    `- Avg rolling OOS pass: ${(summary.average_rolling_oos_pass_rate * 100).toFixed(1)}%`,
    `- Avg perturbation pass: ${(summary.average_perturbation_pass_rate * 100).toFixed(1)}%`,
    '',
    '**Promotion Gate**',
    `- Ready: ${gate.ready ? 'YES' : 'NO'}`,
    `- Reason: ${gate.reason}`,
    '',
    '**Top Failures**',
    ...summary.top_failure_reasons.slice(0, 6).map((row) => `- ${row.reason} (${row.count})`),
    '',
    '**Sample Tasks**',
    taskLines || '- No task rows.',
    '',
    '**Learning Objectives**',
    ...report.learning_objectives.map((row) => `- ${row}`),
  ].join('\n');
}

export async function runNovaRobustnessTraining(
  args: NovaRobustnessTrainingArgs,
): Promise<NovaRobustnessTrainingReport> {
  const generatedAt = new Date().toISOString();
  const traceId = createTraceId('nova-robustness');
  const workflowId = `workflow-nova-robustness-${randomUUID().slice(0, 12)}`;
  const marketScope = args.market || 'ALL';
  const taskLimit = clamp(Math.floor(safeNumber(args.taskLimit, 9)), 3, 24);
  const seed = Math.floor(safeNumber(args.seed, Date.now() % 100_000 || 7));
  const riskProfiles = args.riskProfiles?.length
    ? args.riskProfiles
    : (['balanced', 'conservative', 'aggressive'] as RiskProfileKey[]);
  const tasks =
    args.taskSpecs && args.taskSpecs.length
      ? args.taskSpecs.slice(0, taskLimit)
      : sampleTaskSpecs({
          repo: args.repo,
          marketScope,
          start: args.start,
          end: args.end,
          riskProfiles,
          taskLimit,
          seed,
        });

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'nova_robustness_training',
    workflow_version: 'nova-robustness-training.v1',
    trigger_type: 'manual',
    status: 'RUNNING',
    trace_id: traceId,
    input_json: JSON.stringify({
      market_scope: marketScope,
      task_limit: taskLimit,
      risk_profiles: riskProfiles,
      start: args.start || null,
      end: args.end || null,
      seed,
    }),
    output_json: null,
    attempt_count: 1,
    started_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    completed_at_ms: null,
  });

  const taskResults: NovaRobustnessTaskResult[] = [];
  for (const task of tasks) {
    try {
      const pack = await generateNovaProductionStrategyPack({
        repo: args.repo,
        userId: args.userId || null,
        locale: args.locale || 'zh-CN',
        market: task.market_scope,
        symbols: task.symbols,
        start: task.start,
        end: task.end,
        riskProfile: task.risk_profile,
        symbolBarsByMarket: args.symbolBarsByMarket,
      });
      taskResults.push(summarizeTaskResult(task, pack));
    } catch (error) {
      taskResults.push({
        task,
        status: 'FAILED',
        pass: false,
        metrics: null,
        target_status: {
          sharpe_pass: false,
          annual_pass: false,
          drawdown_pass: false,
        },
        markets: [],
        failure_reasons: ['task_execution_failed'],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = summarizeResults(taskResults);
  const promotionGate = buildPromotionGate(summary);
  const learningObjectives = buildLearningObjectives(summary);

  const artifactsDir = path.join(
    process.cwd(),
    'artifacts',
    'training',
    'robustness',
    new Date().toISOString().slice(0, 10),
  );
  let artifactJsonPath: string | null = null;
  let artifactMdPath: string | null = null;
  if (args.writeArtifacts !== false) {
    ensureDir(artifactsDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    artifactJsonPath = path.join(artifactsDir, `nova-robustness-${stamp}.json`);
    artifactMdPath = path.join(artifactsDir, `nova-robustness-${stamp}.md`);
  }

  const report: NovaRobustnessTrainingReport = {
    generated_at: generatedAt,
    workflow_id: workflowId,
    trace_id: traceId,
    market_scope: marketScope,
    task_limit: tasks.length,
    seed,
    tasks: taskResults,
    summary,
    promotion_gate: promotionGate,
    learning_objectives: learningObjectives,
    deployment: {
      api_route: 'POST /api/nova/training/robustness',
      aws_command:
        'npm run nova:train:robustness -- --market ALL --task-limit 9 --start 2024-01-01 --end 2026-03-27',
      artifact_json_path: artifactJsonPath,
      artifact_md_path: artifactMdPath,
    },
    markdown_report: '',
  };
  report.markdown_report = buildMarkdownReport(report);

  if (artifactJsonPath && artifactMdPath) {
    fs.writeFileSync(artifactJsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(artifactMdPath, `${report.markdown_report}\n`);
  }

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'nova_robustness_training',
    workflow_version: 'nova-robustness-training.v1',
    trigger_type: 'manual',
    status: 'SUCCEEDED',
    trace_id: traceId,
    input_json: JSON.stringify({
      market_scope: marketScope,
      task_limit: taskLimit,
      risk_profiles: riskProfiles,
      start: args.start || null,
      end: args.end || null,
      seed,
    }),
    output_json: JSON.stringify(report),
    attempt_count: 1,
    started_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    completed_at_ms: Date.now(),
  });

  recordAuditEvent(args.repo, {
    traceId,
    scope: 'nova_training',
    eventType: 'ROBUSTNESS_TRAINING_COMPLETED',
    userId: args.userId || null,
    entityType: 'workflow_run',
    entityId: workflowId,
    payload: {
      task_count: summary.task_count,
      target_pass_rate: summary.target_pass_rate,
      promotion_ready: promotionGate.ready,
      artifact_json_path: artifactJsonPath,
    },
  });

  return report;
}

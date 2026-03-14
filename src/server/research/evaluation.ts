import { MarketRepository } from '../db/repository.js';
import { getBacktestEvidenceDetail, getChampionStrategies, listBacktestEvidence } from '../evidence/engine.js';
import { RUNTIME_STATUS, normalizeRuntimeStatus } from '../runtimeStatus.js';
import type { AssetClass, Market } from '../types.js';
import { getFactorDefinition } from './knowledge.js';
import { buildFactorMeasurementReport } from './factorMeasurements.js';

type ResearchEvaluationArgs = {
  runId?: string;
  strategyVersionId?: string;
  market?: Market;
  assetClass?: AssetClass;
  factorId?: string;
  topic?: string;
};

function safeNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function latestRelevantRun(repo: MarketRepository, args: ResearchEvaluationArgs) {
  if (args.runId) return repo.getBacktestRun(args.runId);
  if (args.strategyVersionId) {
    return repo.listBacktestRuns({ strategyVersionId: args.strategyVersionId, limit: 1 })[0] || null;
  }
  const champions = getChampionStrategies(repo).records || [];
  const champion = champions.find((row) => row.supporting_run_id) || champions[0];
  if (champion?.supporting_run_id) return repo.getBacktestRun(champion.supporting_run_id);
  const rows = repo.listBacktestRuns({ limit: 1 });
  return rows[0] || null;
}

function artifactMap(detail: ReturnType<typeof getBacktestEvidenceDetail>['detail']) {
  const entries: Array<[string, unknown]> = (detail?.artifacts || []).map((row) => [row.artifact_type, row.payload]);
  return new Map<string, unknown>(entries);
}

function overfitDiagnostics(metric: Record<string, unknown> | null, realismStress?: Record<string, unknown> | null) {
  const reasons: string[] = [];
  const sampleSize = Number(metric?.sample_size || 0);
  const sharpe = Number(metric?.sharpe || 0);
  const turnover = Number(metric?.turnover || 0);
  const costDrag = Number(metric?.cost_drag || 0);
  const degradation = (realismStress?.degradation as Record<string, unknown> | undefined) || null;
  const stressDelta = Number(degradation?.net_return_delta ?? 0);

  let score = 0;
  if (sampleSize > 0 && sampleSize < 20) {
    score += 0.28;
    reasons.push('sample_size_is_small');
  }
  if (sharpe > 2.5 && sampleSize < 30) {
    score += 0.26;
    reasons.push('high_sharpe_with_limited_sample');
  }
  if (turnover > 35) {
    score += 0.18;
    reasons.push('turnover_is_high');
  }
  if (costDrag > 0.03) {
    score += 0.14;
    reasons.push('cost_drag_is_material');
  }
  if (stressDelta < -0.03) {
    score += 0.18;
    reasons.push('performance_degrades_under_execution_stress');
  }

  const capped = Math.min(1, Number(score.toFixed(2)));
  return {
    score: capped,
    level: capped >= 0.66 ? 'high' : capped >= 0.35 ? 'medium' : 'low',
    reasons,
    note:
      reasons.length > 0
        ? 'This is a heuristic overfitting-risk summary, not a formal PBO or deflated Sharpe implementation.'
        : 'No obvious overfitting proxy was detected from current replay metrics.'
  };
}

function regimeBreakdownFromAttribution(attribution: Record<string, unknown> | null) {
  const rows = Array.isArray(attribution?.by_regime) ? (attribution?.by_regime as Array<Record<string, unknown>>) : [];
  return rows.map((row) => ({
    regime: String(row.regime || row.regime_id || 'UNKNOWN'),
    contribution: safeNumber(row.contribution ?? row.net_return ?? row.pnl_contribution),
    trade_count: safeNumber(row.trade_count ?? row.count),
    avg_return: safeNumber(row.avg_return ?? row.mean_return),
    note: String(row.note || '')
  }));
}

function factorRegimeView(attribution: Record<string, unknown> | null, factorId?: string) {
  const factor = factorId ? getFactorDefinition(factorId) : null;
  return {
    factor: factor || null,
    observed_regime_breakdown: regimeBreakdownFromAttribution(attribution),
    expected_failure_modes: factor?.failure_modes || [],
    expected_supports: factor?.interactions.supports || [],
    expected_conflicts: factor?.interactions.conflicts || [],
    note: factor
      ? 'Observed regime rows come from strategy-level attribution. Factor-specific interpretation is taxonomy-guided unless direct factor history exists.'
      : 'No factor selected; returning strategy-level regime breakdown only.'
  };
}

export function buildStrategyEvaluationReport(repo: MarketRepository, args: ResearchEvaluationArgs = {}) {
  const run = latestRelevantRun(repo, args);
  if (!run) {
    return {
      source_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      data_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      report: null
    };
  }

  const wrap = getBacktestEvidenceDetail(repo, run.id);
  const detail = wrap.detail;
  if (!detail || !detail.metrics) {
    return {
      source_status: wrap.source_status,
      data_status: wrap.data_status,
      report: null
    };
  }

  const artifacts = artifactMap(detail);
  const attribution = (artifacts.get('attribution') as Record<string, unknown> | undefined) || null;
  const realismStress = (artifacts.get('realism_stress') as Record<string, unknown> | undefined) || null;
  const metrics = detail.metrics as unknown as Record<string, unknown>;
  const overfit = overfitDiagnostics(metrics, realismStress);

  const factorMeasurement = args.factorId ? buildFactorMeasurementReport(repo, args) : null;

  return {
    source_status: wrap.source_status,
    data_status: wrap.data_status,
    report: {
      run_id: detail.run.id,
      strategy_version_id: detail.run.strategy_version_id,
      strategy_key: detail.strategy?.strategy_key || null,
      family: detail.strategy?.family || null,
      measured_metrics: {
        hit_rate: safeNumber(metrics.hit_rate),
        win_rate: safeNumber(metrics.win_rate),
        cost_adjusted_return: safeNumber(metrics.net_return),
        gross_return: safeNumber(metrics.gross_return),
        drawdown: safeNumber(metrics.max_drawdown),
        turnover: safeNumber(metrics.turnover),
        sharpe: safeNumber(metrics.sharpe),
        sortino: safeNumber(metrics.sortino),
        sample_size: safeNumber(metrics.sample_size)
      },
      cross_sectional_metrics: {
        ic: factorMeasurement?.report?.measured_metrics?.ic ?? null,
        rank_ic: factorMeasurement?.report?.measured_metrics?.rank_ic ?? null,
        return_spread: factorMeasurement?.report?.measured_metrics?.quantile_spread ?? null,
        quantile_spread: factorMeasurement?.report?.measured_metrics?.quantile_spread ?? null,
        availability: factorMeasurement?.report?.availability || 'not_persisted_yet',
        note:
          factorMeasurement?.report?.notes?.[0] ||
          'Cross-sectional factor metrics are not yet persisted as first-class research artifacts.'
      },
      regime_breakdown: regimeBreakdownFromAttribution(attribution),
      sensitivity_analysis: {
        execution_stress: realismStress || null,
        parameter_sensitivity: null,
        note: 'Execution realism stress is available; parameter surface persistence is a later phase.'
      },
      overfitting_risk: overfit,
      verdict:
        overfit.level === 'high'
          ? 'Use caution. This looks too fragile for confident deployment without deeper validation.'
          : overfit.level === 'medium'
            ? 'Promising, but still needs deeper validation and stress review.'
            : 'Current replay evidence looks stable enough for deeper consideration.',
      next_action:
        overfit.level === 'high'
          ? 'Run broader walk-forward and harsher cost stress before promoting this idea.'
          : 'Review replay, paper, and portfolio fit before deciding promotion.'
    }
  };
}

export function buildValidationReport(repo: MarketRepository, args: ResearchEvaluationArgs = {}) {
  const evaluation = buildStrategyEvaluationReport(repo, args);
  const report = evaluation.report;
  if (!report) {
    return {
      source_status: evaluation.source_status,
      data_status: evaluation.data_status,
      validation_report: null
    };
  }

  return {
    source_status: evaluation.source_status,
    data_status: evaluation.data_status,
    validation_report: {
      strategy_key: report.strategy_key,
      run_id: report.run_id,
      checks: {
        walk_forward: {
          supported: true,
          measured_result: null,
          note: 'Walk-forward exists in the broader research stack but is not yet persisted into this evidence record.'
        },
        purged_validation: {
          supported: false,
          measured_result: null,
          note: 'Purged / embargoed validation is not wired into persisted run objects yet.'
        },
        transaction_cost_sensitivity: report.sensitivity_analysis.execution_stress,
        regime_split_robustness: report.regime_breakdown,
        turnover_realism: report.measured_metrics.turnover,
        overfitting_proxy: report.overfitting_risk
      },
      decision_gate: {
        worth_backtest: true,
        worth_replay: true,
        worth_paper: report.overfitting_risk.level !== 'high',
        rationale:
          report.overfitting_risk.level === 'high'
            ? 'Execution realism and sample quality still look too fragile for confident paper progression.'
            : 'Current evidence supports replay/paper discussion, subject to strategy-specific risk review.'
      }
    }
  };
}

export function buildExperimentRegistryView(repo: MarketRepository, limit = 25) {
  const rows = repo.listExperimentRecords(limit);
  const records = rows.map((row) => {
    const run = repo.getBacktestRun(row.backtest_run_id);
    const strategy = row.strategy_version_id ? repo.getStrategyVersion(row.strategy_version_id) : null;
    const metric = run ? repo.getBacktestMetric(run.id) : null;
    return {
      experiment_id: row.id,
      backtest_run_id: row.backtest_run_id,
      decision_status: row.decision_status,
      created_at_ms: row.created_at_ms,
      approved_at_ms: row.approved_at_ms,
      strategy_key: strategy?.strategy_key || null,
      family: strategy?.family || null,
      reason_for_ship: row.promotion_reason,
      reason_for_reject: row.demotion_reason || metric?.withheld_reason || null,
      validation_snapshot: metric
        ? {
            net_return: metric.net_return,
            max_drawdown: metric.max_drawdown,
            turnover: metric.turnover,
            sample_size: metric.sample_size,
            robustness_grade: metric.robustness_grade,
            realism_grade: metric.realism_grade,
            status: metric.status
          }
        : null
    };
  });

  return {
    source_status: records.length ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    data_status: records.length ? RUNTIME_STATUS.MODEL_DERIVED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    records
  };
}

export function buildResearchWorkflowPlan(args: ResearchEvaluationArgs = {}) {
  const factor = args.factorId ? getFactorDefinition(args.factorId) : null;
  const topic = String(args.topic || factor?.title || args.factorId || 'strategy idea').trim();

  return {
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: RUNTIME_STATUS.MODEL_DERIVED,
    workflow: {
      topic,
      stages: [
        {
          stage: 'hypothesis',
          action: `Define the market intuition behind ${topic}.`,
          deliverable: 'Explicit hypothesis statement + failure conditions'
        },
        {
          stage: 'feature_construction',
          action: factor
            ? `Build features from proxies such as ${factor.proxies.slice(0, 3).join(', ')}.`
            : 'Map the idea into measurable features and implementation constraints.',
          deliverable: 'Feature list with data dependencies and leakage notes'
        },
        {
          stage: 'validation_design',
          action: 'Choose baseline model/ranking method, OOS splits, and execution realism assumptions.',
          deliverable: 'Validation plan with cost, turnover, and regime checks'
        },
        {
          stage: 'portfolio_mapping',
          action: 'Translate signal strength into position sizing, exposure constraints, and turnover limits.',
          deliverable: 'Signal-to-portfolio mapping rules'
        },
        {
          stage: 'evidence_summary',
          action: 'Summarize thesis, supporting factors, opposing factors, regime fit, and implementation caveats.',
          deliverable: 'Evidence object ready for assistant and product use'
        },
        {
          stage: 'postmortem',
          action: 'If the result fails, record why it failed and whether the failure is structural or temporary.',
          deliverable: 'Failed-idea note / reject or iterate decision'
        }
      ],
      next_best_action:
        factor
          ? `Start with ${factor.factor_id} as the anchor factor, then compare it against current regime and cost drag before running replay.`
          : `Use ${topic} as the working hypothesis, define measurable features, then validate it under costs and regime splits before running replay.`
    }
  };
}

export function buildFactorResearchSnapshot(repo: MarketRepository, args: ResearchEvaluationArgs = {}) {
  const evaluation = buildStrategyEvaluationReport(repo, args);
  const report = evaluation.report;
  const run = latestRelevantRun(repo, args);
  const wrap = run ? getBacktestEvidenceDetail(repo, run.id) : null;
  const artifacts = wrap?.detail ? artifactMap(wrap.detail) : new Map<string, unknown>();
  const attribution = (artifacts.get('attribution') as Record<string, unknown> | undefined) || null;
  const measured = args.factorId ? buildFactorMeasurementReport(repo, args) : null;

  return {
    source_status:
      measured?.report?.availability === 'measured' ? measured.source_status : evaluation.source_status,
    data_status:
      measured?.report?.availability === 'measured' ? measured.data_status : evaluation.data_status,
    snapshot: {
      ...factorRegimeView(attribution, args.factorId),
      measured_factor_report: measured?.report || null
    }
  };
}

export function listResearchMemory(repo: MarketRepository, limit = 20) {
  const experiments = buildExperimentRegistryView(repo, limit).records || [];
  const failed = experiments.filter((row) => row.reason_for_reject);
  const shipped = experiments.filter((row) => row.reason_for_ship);
  return {
    source_status: experiments.length ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    data_status: experiments.length ? RUNTIME_STATUS.MODEL_DERIVED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    memory: {
      shipped_ideas: shipped.slice(0, 10),
      failed_ideas: failed.slice(0, 10),
      note: 'This memory view is built from experiment registry + backtest metrics. Richer factor-level memory can be added later.'
    }
  };
}

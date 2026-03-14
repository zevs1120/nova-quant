import type { MarketRepository } from '../db/repository.js';
import { toExperimentRunContract, toStrategyCandidateContract } from '../domain/contracts.js';

export function buildResearchKernelSummary(repo: MarketRepository) {
  const strategies = repo.listStrategyVersions({ limit: 40 });
  const experiments = repo.listExperimentRecords(40);
  const backtestRuns = repo.listBacktestRuns({ limit: 40 });

  const runById = new Map(backtestRuns.map((row) => [row.id, row]));

  const candidateRuns = experiments.map((experiment) => {
    const run = runById.get(experiment.backtest_run_id) || null;
    const metric = run ? repo.getBacktestMetric(run.id) : null;
    return {
      experiment_run: toExperimentRunContract(experiment, run, metric),
      strategy_candidate: toStrategyCandidateContract(experiment, run, metric)
    };
  });

  return {
    task_abstractions: [
      'hypothesis',
      'rolling_backtest',
      'replay_validation',
      'promotion_review',
      'shadow_monitoring'
    ],
    lineage: {
      strategy_versions: strategies.length,
      experiment_records: experiments.length,
      backtest_runs: backtestRuns.length
    },
    benchmark_and_challenger_flow: {
      champions: experiments.filter((row) => row.decision_status === 'champion').length,
      challengers: experiments.filter((row) => row.decision_status === 'challenger').length,
      candidates: experiments.filter((row) => row.decision_status === 'candidate').length,
      holds: experiments.filter((row) => row.decision_status === 'hold').length
    },
    promotion_flow: {
      states: ['candidate', 'challenger', 'champion', 'hold', 'deprecated', 'retired'],
      note: 'Promotion remains evidence-driven and auditable through experiment, metric, and evidence lineage.'
    },
    recent_candidates: candidateRuns.slice(0, 12)
  };
}

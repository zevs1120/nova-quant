import type { MarketRepository } from '../db/repository.js';
import { buildLlmOpsSummary } from '../ai/llmOps.js';

export function buildRegistrySummary(repo: MarketRepository) {
  const llmOps = buildLlmOpsSummary(repo);
  const strategies = repo.listStrategyVersions({ limit: 40 });
  const experiments = repo.listExperimentRecords(40);
  const evals = repo.listEvalRecords({ limit: 40 });
  const workflows = repo.listWorkflowRuns({ limit: 20 });

  return {
    strategy_registry: {
      count: strategies.length,
      active: strategies.filter((row) => row.status === 'active').length,
      champion_like: strategies.filter((row) => row.status === 'champion').length,
      records: strategies.map((row) => ({
        id: row.id,
        strategy_key: row.strategy_key,
        family: row.family,
        version: row.version,
        status: row.status,
        config_hash: row.config_hash,
      })),
    },
    experiment_registry: {
      count: experiments.length,
      champions: experiments.filter((row) => row.decision_status === 'champion').length,
      challengers: experiments.filter((row) => row.decision_status === 'challenger').length,
      candidates: experiments.filter((row) => row.decision_status === 'candidate').length,
      records: experiments.map((row) => ({
        id: row.id,
        backtest_run_id: row.backtest_run_id,
        strategy_version_id: row.strategy_version_id,
        decision_status: row.decision_status,
        promotion_reason: row.promotion_reason,
        demotion_reason: row.demotion_reason,
      })),
    },
    prompt_registry: {
      count: llmOps.prompt_registry.length,
      active: llmOps.prompt_registry.filter((row) => row.status === 'active').length,
      records: llmOps.prompt_registry,
    },
    model_registry: {
      count: llmOps.model_registry.length,
      active: llmOps.model_registry.filter((row) => row.status === 'active').length,
      records: llmOps.model_registry,
    },
    eval_registry: {
      count: evals.length,
      eval_types: [...new Set(evals.map((row) => row.eval_type))],
      records: evals.map((row) => ({
        id: row.id,
        eval_type: row.eval_type,
        subject_type: row.subject_type,
        subject_id: row.subject_id,
        subject_version: row.subject_version,
      })),
    },
    workflow_registry: {
      count: workflows.length,
      active: workflows.filter((row) => row.status === 'RUNNING' || row.status === 'PLANNED')
        .length,
      records: workflows.map((row) => ({
        id: row.id,
        workflow_key: row.workflow_key,
        workflow_version: row.workflow_version,
        trigger_type: row.trigger_type,
        status: row.status,
      })),
    },
  };
}

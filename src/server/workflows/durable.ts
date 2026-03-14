import type { MarketRepository } from '../db/repository.js';
import { toWorkflowRunContract } from '../domain/contracts.js';

const WORKFLOW_BLUEPRINTS = [
  {
    workflow_key: 'nightly_data_validation',
    workflow_version: '1.0.0',
    cadence: 'nightly',
    durable_behaviour: ['retry_on_failure', 'resume_from_last_checkpoint', 'emit_validation_artifact'],
    purpose: 'Validate runtime data, feature parity, and freshness gates before next-day decisioning.'
  },
  {
    workflow_key: 'nightly_evidence_refresh',
    workflow_version: '1.0.0',
    cadence: 'nightly',
    durable_behaviour: ['retry_on_failure', 'recompute_changed_only', 'emit_evidence_diff'],
    purpose: 'Refresh evidence bundles, top actions, and recommendation change records.'
  },
  {
    workflow_key: 'replay_paper_comparison',
    workflow_version: '1.0.0',
    cadence: 'scheduled',
    durable_behaviour: ['replayable', 'resume_from_run_id', 'emit_reconciliation_report'],
    purpose: 'Compare replay, paper, and decision truth to surface realism gaps.'
  },
  {
    workflow_key: 'shadow_decision_review',
    workflow_version: '1.0.0',
    cadence: 'scheduled',
    durable_behaviour: ['shadow_mode', 'evaluation_hook', 'promotion_gate_ready'],
    purpose: 'Run challenger logic in shadow before promotion into visible decision paths.'
  },
  {
    workflow_key: 'prompt_eval_refresh',
    workflow_version: '1.0.0',
    cadence: 'scheduled',
    durable_behaviour: ['retry_on_failure', 'trace_linked', 'offline_review_ready'],
    purpose: 'Re-evaluate prompt/model routes against review datasets and assistant traces.'
  }
] as const;

export function buildDurableWorkflowSummary(repo: MarketRepository) {
  const recentRuns = repo.listWorkflowRuns({ limit: 24 }).map(toWorkflowRunContract);
  return {
    workflow_blueprints: WORKFLOW_BLUEPRINTS,
    recent_runs: recentRuns,
    guarantees: {
      retry: 'Workflow runs are designed to retry and record attempts instead of silently disappearing.',
      replay: 'Workflows should keep enough input/output state to be replayed and reviewed.',
      resume: 'Long-running refresh and comparison jobs should be resumable from recorded state.'
    }
  };
}

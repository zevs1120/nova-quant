import type { DecisionSnapshotRecord } from '../types.js';
import type { MarketRepository } from '../db/repository.js';

function avg(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((value): value is number => Number.isFinite(value ?? NaN));
  if (!clean.length) return null;
  return Number((clean.reduce((sum, value) => sum + value, 0) / clean.length).toFixed(4));
}

export function buildScorecardSummary(
  repo: MarketRepository,
  decisionRows: DecisionSnapshotRecord[],
) {
  const reviews = repo.listRecommendationReviews({ limit: 100 });
  const decisionScores = reviews
    .filter((row) => row.review_type === 'OUTCOME')
    .map((row) => row.score);
  const noActionScores = reviews
    .filter((row) => row.review_type === 'NO_ACTION_VALUE')
    .map((row) => row.score);
  const explanationScores = reviews
    .filter((row) => row.review_type === 'EXPLANATION')
    .map((row) => row.score);
  const evalRows = repo.listEvalRecords({ limit: 100 });

  return {
    scorecard: {
      decision_quality_score: avg(decisionScores),
      no_action_value_score: avg(noActionScores),
      explanation_effectiveness_score: avg(explanationScores),
      risk_call_quality_score: avg(
        decisionRows.map((row) => {
          try {
            const parsed = JSON.parse(row.risk_state_json) as Record<string, unknown>;
            return Number(parsed.safety_score ?? NaN);
          } catch {
            return null;
          }
        }),
      ),
      action_card_outcome_score: avg(
        reviews
          .filter((row) => row.action_id && row.review_type === 'OUTCOME')
          .map((row) => row.score),
      ),
      user_alignment_score: avg(
        evalRows
          .filter((row) => row.eval_type === 'user_alignment')
          .map((row) => {
            try {
              const score = JSON.parse(row.score_json) as Record<string, unknown>;
              return Number(score.overall ?? NaN);
            } catch {
              return null;
            }
          }),
      ),
    },
    proof_notes: [
      'Proof is not limited to returns; recommendation avoidance and explanation quality count.',
      'No-action day value is tracked as a first-class review type.',
      'Versioned eval rows are available for future model/policy comparisons.',
    ],
    version_comparison_ready: {
      model_versions_tracked: repo.listModelVersions({ limit: 20 }).length,
      prompt_versions_tracked: repo.listPromptVersions({ limit: 20 }).length,
      eval_records_tracked: evalRows.length,
    },
  };
}

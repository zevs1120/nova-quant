import type { MarketRepository } from '../db/repository.js';
import type { NovaReviewLabelRecord, NovaTaskRunRecord } from '../types.js';

type JsonObject = Record<string, unknown>;

function parseJson(text: string | null | undefined): JsonObject {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as JsonObject;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toMessages(run: NovaTaskRunRecord) {
  const input = parseJson(run.input_json);
  const output = parseJson(run.output_json);
  const systemPrompt = typeof input.system_prompt === 'string' ? input.system_prompt : 'You are Nova.';
  const userPrompt =
    typeof input.user_prompt === 'string'
      ? input.user_prompt
      : typeof input.user_message === 'string'
        ? input.user_message
        : JSON.stringify(input);
  const assistantText =
    typeof output.text === 'string'
      ? output.text
      : Object.keys(output).length
        ? JSON.stringify(output)
        : '';

  if (!assistantText.trim()) return null;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: assistantText }
  ];
}

function indexLabels(labels: NovaReviewLabelRecord[]) {
  const map = new Map<string, NovaReviewLabelRecord[]>();
  for (const label of labels) {
    const bucket = map.get(label.run_id) || [];
    bucket.push(label);
    map.set(label.run_id, bucket);
  }
  return map;
}

export function buildMlxLmTrainingDataset(repo: MarketRepository, args?: { onlyIncluded?: boolean; limit?: number }) {
  const runs = repo.listNovaTaskRuns({
    status: 'SUCCEEDED',
    limit: args?.limit || 500
  });
  const labels = repo.listNovaReviewLabels({
    includeInTraining: args?.onlyIncluded ? true : undefined,
    limit: 1000
  });
  const labelsByRun = indexLabels(labels);

  const records = runs
    .filter((run) => {
      if (!args?.onlyIncluded) return true;
      return (labelsByRun.get(run.id) || []).some((label) => label.include_in_training === 1);
    })
    .map((run) => {
      const messages = toMessages(run);
      if (!messages) return null;
      return {
        messages,
        metadata: {
          run_id: run.id,
          task_type: run.task_type,
          route_alias: run.route_alias,
          model_name: run.model_name,
          trace_id: run.trace_id,
          labels: (labelsByRun.get(run.id) || []).map((label) => ({
            id: label.id,
            reviewer_id: label.reviewer_id,
            label: label.label,
            score: label.score,
            include_in_training: Boolean(label.include_in_training)
          }))
        }
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    format: 'mlx-lm-chat-jsonl',
    count: records.length,
    records
  };
}

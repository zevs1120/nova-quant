import type { NovaTaskRoute } from '../ai/llmOps.js';
import { resolveNovaRoute } from '../ai/llmOps.js';

export type NovaBusinessTask =
  | 'today_risk'
  | 'daily_stance'
  | 'action_card'
  | 'daily_wrap_up'
  | 'assistant_answer'
  | 'fast_classification'
  | 'retrieval';

export function mapBusinessTaskToRoute(task: NovaBusinessTask): NovaTaskRoute {
  if (task === 'fast_classification') return 'fast_classification';
  if (task === 'retrieval') return 'retrieval_embedding';
  if (task === 'action_card') return 'action_card_generation';
  if (task === 'assistant_answer') return 'assistant_grounded_answer';
  return 'decision_reasoning';
}

export function resolveBusinessTask(task: NovaBusinessTask) {
  const route = mapBusinessTaskToRoute(task);
  return {
    business_task: task,
    ...resolveNovaRoute(route)
  };
}

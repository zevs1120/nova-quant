import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getNovaModelPlan, getNovaRoutingPolicies, getNovaRuntimeMode } from '../../src/server/ai/llmOps.js';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const plan = getNovaModelPlan();
  const mode = getNovaRuntimeMode();
  res.status(200).json({
    endpoint: plan.endpoint,
    plan,
    routing: getNovaRoutingPolicies(),
    provider: plan.provider,
    local_only: plan.local_only,
    mode,
    availability_reason:
      mode === 'local-ollama'
        ? 'Local Ollama is the active Nova runtime.'
        : mode === 'cloud-openai-compatible'
          ? 'Cloud OpenAI-compatible inference is the active Nova runtime.'
          : 'No live Nova provider is configured; deterministic fallback remains available.'
  });
}

import {
  detectNovaMemoryTier,
  getNovaLocalEndpoint,
  getNovaModelPlan,
  getNovaRuntimeMode,
  isLocalNovaEnabled,
  type NovaModelAlias,
  type NovaRuntimeMode
} from '../ai/llmOps.js';

type NovaModelHealth = {
  alias: NovaModelAlias;
  model: string;
  role: string;
  required: boolean;
  available: boolean;
};

export type NovaHealthState = {
  checked_at_ms: number;
  endpoint: string;
  mode: NovaRuntimeMode;
  local_only: boolean;
  memory_tier: ReturnType<typeof detectNovaMemoryTier>;
  availability_reason: string;
  reachability: {
    ok: boolean;
    status: number | null;
    latency_ms: number | null;
    error: string | null;
  };
  expected_models: NovaModelHealth[];
  available_models: string[];
  missing_models: string[];
  recommended_commands: {
    start: string;
    pull: string[];
    export_training: string;
    train_lora: string;
  };
};

function cleanEndpoint(endpoint: string) {
  return String(endpoint || getNovaLocalEndpoint()).replace(/\/$/, '');
}

function getModelRole(alias: NovaModelAlias) {
  if (alias === 'Nova-Scout') return 'Fast classification and tagging.';
  if (alias === 'Nova-Retrieve') return 'Embedding and retrieval memory.';
  if (alias === 'Nova-Challenger') return 'Optional offline challenger for side-by-side evals.';
  return 'Primary reasoning, action-card language, and grounded explanation.';
}

function parseModelIds(payload: unknown) {
  const data = (payload as { data?: Array<{ id?: string }>; models?: Array<{ name?: string; model?: string }> }) || {};
  const ids = [
    ...((data.data || []).map((row) => row.id).filter(Boolean) as string[]),
    ...((data.models || []).flatMap((row) => [row.name, row.model]).filter(Boolean) as string[])
  ];
  return [...new Set(ids)];
}

export async function inspectNovaHealth(): Promise<NovaHealthState> {
  const endpoint = getNovaLocalEndpoint();
  const plan = getNovaModelPlan();
  const localOnly = isLocalNovaEnabled();
  const checkedAtMs = Date.now();
  const reachability = {
    ok: false,
    status: null as number | null,
    latency_ms: null as number | null,
    error: null as string | null
  };
  let availableModels: string[] = [];

  if (localOnly) {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${cleanEndpoint(endpoint)}/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      reachability.status = response.status;
      reachability.latency_ms = Date.now() - startedAt;
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      availableModels = parseModelIds(await response.json());
      reachability.ok = true;
    } catch (error) {
      reachability.error = error instanceof Error ? error.message : String(error);
      reachability.latency_ms = Date.now() - startedAt;
    }
  } else {
    reachability.error = 'Local Nova is bypassed in this runtime.';
  }

  const expectedModels = Object.entries(plan.models)
    .filter(([, model]) => Boolean(model))
    .map(([alias, model]) => ({
      alias: alias as NovaModelAlias,
      model: String(model),
      role: getModelRole(alias as NovaModelAlias),
      required: alias !== 'Nova-Challenger',
      available: availableModels.includes(String(model))
    }));

  return {
    checked_at_ms: checkedAtMs,
    endpoint,
    mode: getNovaRuntimeMode(),
    local_only: localOnly,
    memory_tier: plan.tier,
    availability_reason: localOnly
      ? 'Nova is expected to run through the Mac-local Ollama daemon.'
      : 'Local Ollama is bypassed in this runtime, so deterministic fallback remains active.',
    reachability,
    expected_models: expectedModels,
    available_models: availableModels,
    missing_models: expectedModels.filter((model) => !model.available).map((model) => model.model),
    recommended_commands: {
      start: 'ollama serve',
      pull: expectedModels.filter((model) => !model.available).map((model) => `ollama pull ${model.model}`),
      export_training: 'npm run nova:export-mlx',
      train_lora: 'npm run nova:train:lora -- --execute'
    }
  };
}

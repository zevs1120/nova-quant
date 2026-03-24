import os from 'node:os';
import { createHash } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import type { ModelVersionRecord, PromptVersionRecord } from '../types.js';
import { toModelVersionContract, toPromptVersionContract } from '../domain/contracts.js';

export const MARVIX_MODEL_ALIASES = {
  core: 'Marvix-Core',
  scout: 'Marvix-Scout',
  retrieve: 'Marvix-Retrieve',
  challenger: 'Marvix-Challenger',
} as const;

export type NovaModelAlias = (typeof MARVIX_MODEL_ALIASES)[keyof typeof MARVIX_MODEL_ALIASES];

export type NovaTaskRoute =
  | 'fast_classification'
  | 'state_tagging'
  | 'decision_reasoning'
  | 'action_card_generation'
  | 'assistant_grounded_answer'
  | 'strategy_generation'
  | 'retrieval_embedding';

export type NovaRouteResolution = {
  task: NovaTaskRoute;
  alias: NovaModelAlias;
  provider: 'ollama' | 'openai' | 'groq' | 'gemini';
  model: string;
  reason: string;
  endpoint: string;
  apiKey: string | null;
  headers?: Record<string, string>;
};

export type NovaRuntimeMode = 'local-ollama' | 'cloud-openai-compatible' | 'deterministic-fallback';

function totalMemoryGb(): number {
  return Math.round(os.totalmem() / 1024 ** 3);
}

export function detectNovaMemoryTier(): 'compact' | 'full' {
  const override = String(process.env.NOVA_MEMORY_TIER || '').toLowerCase();
  if (override === 'compact' || override === 'full') return override;
  return totalMemoryGb() >= 24 ? 'full' : 'compact';
}

export function getNovaLocalEndpoint(): string {
  return (
    process.env.OLLAMA_OPENAI_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1'
  );
}

export function getNovaCloudEndpoint(): string {
  const explicit = String(process.env.NOVA_CLOUD_OPENAI_BASE_URL || '').trim();
  if (explicit) return explicit;
  const compat = String(process.env.OPENAI_BASE_URL || '').trim();
  if (compat) return compat;
  return 'https://api.openai.com/v1';
}

export function getNovaCloudApiKey(): string | null {
  const explicit = String(process.env.NOVA_CLOUD_API_KEY || '').trim();
  if (explicit) return explicit;
  const fallback = String(process.env.OPENAI_API_KEY || '').trim();
  return fallback || null;
}

export function isLocalNovaEnabled(): boolean {
  const disabled = String(process.env.NOVA_DISABLE_LOCAL_GENERATION || '').trim();
  if (disabled === '1' || disabled.toLowerCase() === 'true') return false;

  const forced = String(process.env.NOVA_FORCE_LOCAL_GENERATION || '').trim();
  if (forced === '1' || forced.toLowerCase() === 'true') return true;

  // Vercel serverless cannot reach the Mac-local Ollama daemon on 127.0.0.1.
  if (process.env.VERCEL === '1') return false;

  return true;
}

export function isCloudNovaEnabled(): boolean {
  const disabled = String(process.env.NOVA_DISABLE_CLOUD_GENERATION || '')
    .trim()
    .toLowerCase();
  if (disabled === '1' || disabled === 'true') return false;

  const forced = String(process.env.NOVA_FORCE_CLOUD_GENERATION || '')
    .trim()
    .toLowerCase();
  if (forced === '1' || forced === 'true') return true;

  return Boolean(getNovaCloudApiKey());
}

export function getNovaRuntimeMode(): NovaRuntimeMode {
  const explicit = String(process.env.NOVA_RUNTIME_MODE || '')
    .trim()
    .toLowerCase();
  if (explicit === 'local' || explicit === 'local-ollama') return 'local-ollama';
  if (explicit === 'cloud' || explicit === 'cloud-openai-compatible')
    return 'cloud-openai-compatible';
  if (explicit === 'fallback' || explicit === 'deterministic-fallback')
    return 'deterministic-fallback';

  const preferCloud = String(process.env.NOVA_PREFER_CLOUD || '')
    .trim()
    .toLowerCase();
  if ((preferCloud === '1' || preferCloud === 'true') && isCloudNovaEnabled()) {
    return 'cloud-openai-compatible';
  }
  if (isLocalNovaEnabled()) return 'local-ollama';
  if (isCloudNovaEnabled()) return 'cloud-openai-compatible';
  return 'deterministic-fallback';
}

export function getNovaRuntimeAvailabilityReason(mode = getNovaRuntimeMode()) {
  if (mode === 'local-ollama') return 'Local Ollama is the active Marvix runtime.';
  if (mode === 'cloud-openai-compatible')
    return 'Cloud OpenAI-compatible inference is the active Marvix runtime.';
  return 'No live Marvix provider is configured; deterministic fallback remains available.';
}

function buildNovaModelPlan(mode: NovaRuntimeMode) {
  const tier = detectNovaMemoryTier();
  if (mode === 'cloud-openai-compatible') {
    const endpoint = getNovaCloudEndpoint();
    return {
      tier,
      mode,
      endpoint,
      provider: 'openai' as const,
      local_only: false,
      models: {
        [MARVIX_MODEL_ALIASES.core]:
          process.env.NOVA_CORE_MODEL ||
          (tier === 'compact' ? 'Qwen/Qwen3-4B-Instruct' : 'Qwen/Qwen3-8B-Instruct'),
        [MARVIX_MODEL_ALIASES.scout]:
          process.env.NOVA_SCOUT_MODEL ||
          (tier === 'compact' ? 'Qwen/Qwen3-1.7B-Instruct' : 'Qwen/Qwen3-4B-Instruct'),
        [MARVIX_MODEL_ALIASES.retrieve]: process.env.NOVA_RETRIEVE_MODEL || 'BAAI/bge-m3',
        [MARVIX_MODEL_ALIASES.challenger]:
          process.env.NOVA_CHALLENGER_MODEL || 'Qwen/Qwen3-14B-Instruct',
      } as Record<NovaModelAlias, string | undefined>,
    };
  }
  const endpoint = getNovaLocalEndpoint();
  if (tier === 'compact') {
    return {
      tier,
      mode,
      endpoint,
      provider: 'ollama' as const,
      local_only: mode !== 'deterministic-fallback',
      models: {
        [MARVIX_MODEL_ALIASES.core]: 'qwen3:4b',
        [MARVIX_MODEL_ALIASES.scout]: 'qwen3:1.7b',
        [MARVIX_MODEL_ALIASES.retrieve]: 'qwen3-embedding:0.6b',
      } as Record<NovaModelAlias, string | undefined>,
    };
  }
  return {
    tier,
    mode,
    endpoint,
    provider: 'ollama' as const,
    local_only: mode !== 'deterministic-fallback',
    models: {
      [MARVIX_MODEL_ALIASES.core]: 'qwen3:8b',
      [MARVIX_MODEL_ALIASES.scout]: 'qwen3:4b',
      [MARVIX_MODEL_ALIASES.retrieve]: 'qwen3-embedding:0.6b',
      [MARVIX_MODEL_ALIASES.challenger]: 'qwen3:14b',
    } as Record<NovaModelAlias, string | undefined>,
  };
}

export function getNovaModelPlan() {
  return buildNovaModelPlan(getNovaRuntimeMode());
}

function buildRoutingPoliciesForPlan(plan: ReturnType<typeof buildNovaModelPlan>): Array<{
  task: NovaTaskRoute;
  alias: NovaModelAlias;
  provider: 'ollama' | 'openai' | 'groq' | 'gemini';
  model: string;
  reason: string;
}> {
  const localFallbacks = {
    core: 'qwen3:4b',
    scout: 'qwen3:1.7b',
    retrieve: 'qwen3-embedding:0.6b',
  };
  const cloudFallbacks = {
    core: 'Qwen/Qwen3-4B-Instruct',
    scout: 'Qwen/Qwen3-1.7B-Instruct',
    retrieve: 'BAAI/bge-m3',
    challenger: 'Qwen/Qwen3-14B-Instruct',
  };
  const fallbacks = plan.provider === 'openai' ? cloudFallbacks : localFallbacks;
  const strategyGeneratorAlias = plan.models[MARVIX_MODEL_ALIASES.challenger]
    ? MARVIX_MODEL_ALIASES.challenger
    : MARVIX_MODEL_ALIASES.core;
  return [
    {
      task: 'fast_classification',
      alias: MARVIX_MODEL_ALIASES.scout,
      provider: plan.provider,
      model: plan.models[MARVIX_MODEL_ALIASES.scout] || fallbacks.scout,
      reason: 'Low-latency classification and tagging.',
    },
    {
      task: 'state_tagging',
      alias: MARVIX_MODEL_ALIASES.scout,
      provider: plan.provider,
      model: plan.models[MARVIX_MODEL_ALIASES.scout] || fallbacks.scout,
      reason: 'Fast regime and state labeling before deeper reasoning.',
    },
    {
      task: 'decision_reasoning',
      alias: MARVIX_MODEL_ALIASES.core,
      provider: plan.provider,
      model: plan.models[MARVIX_MODEL_ALIASES.core] || fallbacks.core,
      reason: 'Primary decision and explanation model for Today Risk and stance.',
    },
    {
      task: 'action_card_generation',
      alias: MARVIX_MODEL_ALIASES.core,
      provider: plan.provider,
      model: plan.models[MARVIX_MODEL_ALIASES.core] || fallbacks.core,
      reason: 'Action-card ranking and explanation need stronger grounded reasoning.',
    },
    {
      task: 'assistant_grounded_answer',
      alias: MARVIX_MODEL_ALIASES.core,
      provider: plan.provider,
      model: plan.models[MARVIX_MODEL_ALIASES.core] || fallbacks.core,
      reason: 'Assistant should sound like the system, not a lightweight classifier.',
    },
    {
      task: 'strategy_generation',
      alias: strategyGeneratorAlias,
      provider: plan.provider,
      model:
        plan.models[strategyGeneratorAlias] ||
        plan.models[MARVIX_MODEL_ALIASES.core] ||
        (plan.provider === 'openai' ? cloudFallbacks.core : localFallbacks.core),
      reason:
        'AI strategy generation runs on the strongest available Marvix route, gated by research validation.',
    },
    {
      task: 'retrieval_embedding',
      alias: MARVIX_MODEL_ALIASES.retrieve,
      provider: plan.provider,
      model: plan.models[MARVIX_MODEL_ALIASES.retrieve] || fallbacks.retrieve,
      reason: 'Dedicated embedding route for retrieval and memory indexing.',
    },
  ];
}

export function getNovaRoutingPolicies(): Array<{
  task: NovaTaskRoute;
  alias: NovaModelAlias;
  provider: 'ollama' | 'openai' | 'groq' | 'gemini';
  model: string;
  reason: string;
}> {
  return buildRoutingPoliciesForPlan(getNovaModelPlan());
}

export function resolveNovaRoute(task: NovaTaskRoute): NovaRouteResolution {
  const plan = getNovaModelPlan();
  const match = buildRoutingPoliciesForPlan(plan).find((row) => row.task === task);
  const endpoint = plan.provider === 'openai' ? getNovaCloudEndpoint() : getNovaLocalEndpoint();
  const apiKey = plan.provider === 'openai' ? getNovaCloudApiKey() : null;
  if (match) {
    return {
      ...match,
      endpoint,
      apiKey,
    };
  }
  return {
    task,
    alias: MARVIX_MODEL_ALIASES.core,
    provider: plan.provider,
    model: plan.models[MARVIX_MODEL_ALIASES.core] || 'qwen3:4b',
    reason: 'Fallback to Marvix-Core when no explicit route is defined.',
    endpoint,
    apiKey,
  };
}

export function resolveNovaRouteForProvider(
  task: NovaTaskRoute,
  provider: 'ollama' | 'openai' | 'gemini',
): NovaRouteResolution {
  const plan = buildNovaModelPlan(
    provider === 'ollama' ? 'local-ollama' : 'cloud-openai-compatible',
  );
  const match = buildRoutingPoliciesForPlan(plan).find((row) => row.task === task);
  const endpoint = provider === 'ollama' ? getNovaLocalEndpoint() : getNovaCloudEndpoint();
  const apiKey =
    provider === 'openai'
      ? getNovaCloudApiKey()
      : provider === 'gemini'
        ? String(process.env.GEMINI_API_KEY || '').trim() || null
        : null;
  const modelOverride =
    provider === 'gemini'
      ? String(process.env.GEMINI_MODEL || '').trim() || 'gemma-3-27b-it'
      : null;
  if (match) {
    return {
      ...match,
      provider,
      model: modelOverride || match.model,
      endpoint,
      apiKey,
    };
  }
  return {
    task,
    alias: MARVIX_MODEL_ALIASES.core,
    provider,
    model:
      modelOverride ||
      plan.models[MARVIX_MODEL_ALIASES.core] ||
      (provider === 'openai' || provider === 'gemini' ? 'Qwen/Qwen3-4B-Instruct' : 'qwen3:4b'),
    reason: 'Fallback to Marvix-Core when no explicit route is defined.',
    endpoint,
    apiKey,
  };
}

export function getPromptPackDefinitions(): Array<{
  task_key: string;
  semantic_version: string;
  status: 'active' | 'challenger';
  prompt_text: string;
}> {
  return [
    {
      task_key: 'today-risk-explainer',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text:
        'Explain Today Risk as a protective decision object grounded in current regime, risk policy, and evidence.',
    },
    {
      task_key: 'daily-stance-generator',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text:
        'Produce the one-line daily stance with radical simplicity, zero hype, and explicit risk posture.',
    },
    {
      task_key: 'action-card-writer',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text:
        'Turn ranked decision objects into concise action-card language with why-now, caution, invalidation, and horizon.',
    },
    {
      task_key: 'grounded-assistant',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text:
        'Answer as Nova, citing current decision, risk, holdings, evidence, and ritual context without sounding like a chatbot.',
    },
    {
      task_key: 'daily-wrap-up-writer',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text:
        'Write the daily wrap-up as a grounded end-of-day decision summary with tomorrow watchpoints and no hype.',
    },
    {
      task_key: 'nova-fast-classifier',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text:
        'Classify short user prompts into risk, decision, follow-up, or research buckets using terse local inference.',
    },
    {
      task_key: 'research-assistant',
      semantic_version: '1.0.0',
      status: 'challenger',
      prompt_text:
        'Operate as a quant research assistant with factor, validation, workflow, and implementation-realism awareness.',
    },
    {
      task_key: 'strategy-lab-generator',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text:
        'Select and tune discovery candidates into governed AI strategy proposals. Prefer traceable, validation-aware strategies over clever but fragile ideas.',
    },
  ];
}

function modelRecord(alias: NovaModelAlias, modelName: string): ModelVersionRecord {
  const now = Date.now();
  const plan = getNovaModelPlan();
  return {
    id: `model-${alias.toLowerCase()}`,
    model_key: alias,
    provider: plan.provider === 'openai' ? 'openai-compatible' : 'ollama',
    endpoint: plan.endpoint,
    task_scope: getNovaRoutingPolicies()
      .filter((row) => row.alias === alias)
      .map((row) => row.task)
      .join(','),
    semantic_version: '1.0.0',
    status: alias === MARVIX_MODEL_ALIASES.challenger ? 'challenger' : 'active',
    config_json: JSON.stringify({
      model: modelName,
      local_only: plan.local_only,
      memory_tier: detectNovaMemoryTier(),
      runtime_mode: plan.mode,
    }),
    created_at_ms: now,
    updated_at_ms: now,
  };
}

function promptRecord(
  def: ReturnType<typeof getPromptPackDefinitions>[number],
): PromptVersionRecord {
  const now = Date.now();
  return {
    id: `prompt-${def.task_key}-${def.semantic_version}`,
    task_key: def.task_key,
    semantic_version: def.semantic_version,
    prompt_hash: createHash('sha256').update(def.prompt_text).digest('hex'),
    prompt_text: def.prompt_text,
    status: def.status,
    created_at_ms: now,
    updated_at_ms: now,
  };
}

export function ensureLlmOpsRegistry(repo: MarketRepository): void {
  const plan = getNovaModelPlan();
  for (const [alias, model] of Object.entries(plan.models)) {
    if (!model) continue;
    repo.upsertModelVersion(modelRecord(alias as NovaModelAlias, model));
  }
  for (const prompt of getPromptPackDefinitions()) {
    repo.upsertPromptVersion(promptRecord(prompt));
  }
}

export function buildLlmOpsSummary(repo: MarketRepository) {
  ensureLlmOpsRegistry(repo);
  const recentRuns = repo.listNovaTaskRuns({ limit: 40 });
  const labels = repo.listNovaReviewLabels({ limit: 80 });
  const plan = getNovaModelPlan();
  return {
    runtime: {
      endpoint: plan.endpoint,
      memory_tier: detectNovaMemoryTier(),
      local_only: plan.local_only,
      cloud_enabled: isCloudNovaEnabled(),
      mode: getNovaRuntimeMode(),
      availability_reason: getNovaRuntimeAvailabilityReason(getNovaRuntimeMode()),
    },
    routing_policies: getNovaRoutingPolicies(),
    model_registry: repo.listModelVersions({ limit: 12 }).map(toModelVersionContract),
    prompt_registry: repo.listPromptVersions({ limit: 20 }).map(toPromptVersionContract),
    trace_schema: {
      trace_keys: [
        'trace_id',
        'thread_id',
        'model_key',
        'prompt_version',
        'decision_snapshot_id',
        'user_id',
      ],
      evaluation_hooks: [
        'manual_annotation',
        'review_replay',
        'explanation_quality',
        'fallback_reason',
      ],
    },
    local_growth_loop: {
      recent_task_runs: recentRuns.length,
      successful_runs: recentRuns.filter((row) => row.status === 'SUCCEEDED').length,
      failed_runs: recentRuns.filter((row) => row.status === 'FAILED').length,
      labeled_samples: labels.length,
      training_ready_samples: labels.filter((row) => row.include_in_training === 1).length,
    },
  };
}

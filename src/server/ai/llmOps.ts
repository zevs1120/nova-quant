import os from 'node:os';
import { createHash } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import type { ModelVersionRecord, PromptVersionRecord } from '../types.js';
import { toModelVersionContract, toPromptVersionContract } from '../domain/contracts.js';

export type NovaModelAlias = 'Nova-Core' | 'Nova-Scout' | 'Nova-Retrieve' | 'Nova-Challenger';

export type NovaTaskRoute =
  | 'fast_classification'
  | 'state_tagging'
  | 'decision_reasoning'
  | 'action_card_generation'
  | 'assistant_grounded_answer'
  | 'retrieval_embedding';

export type NovaRouteResolution = {
  task: NovaTaskRoute;
  alias: NovaModelAlias;
  model: string;
  reason: string;
  endpoint: string;
};

export type NovaRuntimeMode = 'local-ollama' | 'deterministic-fallback';

function totalMemoryGb(): number {
  return Math.round(os.totalmem() / (1024 ** 3));
}

export function detectNovaMemoryTier(): 'compact' | 'full' {
  const override = String(process.env.NOVA_MEMORY_TIER || '').toLowerCase();
  if (override === 'compact' || override === 'full') return override;
  return totalMemoryGb() >= 24 ? 'full' : 'compact';
}

export function getNovaLocalEndpoint(): string {
  return process.env.OLLAMA_OPENAI_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1';
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

export function getNovaRuntimeMode(): NovaRuntimeMode {
  return isLocalNovaEnabled() ? 'local-ollama' : 'deterministic-fallback';
}

export function getNovaModelPlan() {
  const tier = detectNovaMemoryTier();
  const endpoint = getNovaLocalEndpoint();
  if (tier === 'compact') {
    return {
      tier,
      endpoint,
      models: {
        'Nova-Core': 'qwen3:4b',
        'Nova-Scout': 'qwen3:1.7b',
        'Nova-Retrieve': 'qwen3-embedding:0.6b'
      } as Record<NovaModelAlias, string | undefined>
    };
  }
  return {
    tier,
    endpoint,
    models: {
      'Nova-Core': 'qwen3:8b',
      'Nova-Scout': 'qwen3:4b',
      'Nova-Retrieve': 'qwen3-embedding:0.6b',
      'Nova-Challenger': 'qwen3:14b'
    } as Record<NovaModelAlias, string | undefined>
  };
}

export function getNovaRoutingPolicies(): Array<{
  task: NovaTaskRoute;
  alias: NovaModelAlias;
  model: string;
  reason: string;
}> {
  const plan = getNovaModelPlan();
  return [
    {
      task: 'fast_classification',
      alias: 'Nova-Scout',
      model: plan.models['Nova-Scout'] || 'qwen3:1.7b',
      reason: 'Low-latency classification and tagging.'
    },
    {
      task: 'state_tagging',
      alias: 'Nova-Scout',
      model: plan.models['Nova-Scout'] || 'qwen3:1.7b',
      reason: 'Fast regime and state labeling before deeper reasoning.'
    },
    {
      task: 'decision_reasoning',
      alias: 'Nova-Core',
      model: plan.models['Nova-Core'] || 'qwen3:4b',
      reason: 'Primary decision and explanation model for Today Risk and stance.'
    },
    {
      task: 'action_card_generation',
      alias: 'Nova-Core',
      model: plan.models['Nova-Core'] || 'qwen3:4b',
      reason: 'Action-card ranking and explanation need stronger grounded reasoning.'
    },
    {
      task: 'assistant_grounded_answer',
      alias: 'Nova-Core',
      model: plan.models['Nova-Core'] || 'qwen3:4b',
      reason: 'Assistant should sound like the system, not a lightweight classifier.'
    },
    {
      task: 'retrieval_embedding',
      alias: 'Nova-Retrieve',
      model: plan.models['Nova-Retrieve'] || 'qwen3-embedding:0.6b',
      reason: 'Dedicated embedding route for retrieval and memory indexing.'
    }
  ];
}

export function resolveNovaRoute(task: NovaTaskRoute): NovaRouteResolution {
  const match = getNovaRoutingPolicies().find((row) => row.task === task);
  if (match) {
    return {
      ...match,
      endpoint: getNovaLocalEndpoint()
    };
  }
  const plan = getNovaModelPlan();
  return {
    task,
    alias: 'Nova-Core',
    model: plan.models['Nova-Core'] || 'qwen3:4b',
    reason: 'Fallback to Nova-Core when no explicit route is defined.',
    endpoint: getNovaLocalEndpoint()
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
      prompt_text: 'Explain Today Risk as a protective decision object grounded in current regime, risk policy, and evidence.'
    },
    {
      task_key: 'daily-stance-generator',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text: 'Produce the one-line daily stance with radical simplicity, zero hype, and explicit risk posture.'
    },
    {
      task_key: 'action-card-writer',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text: 'Turn ranked decision objects into concise action-card language with why-now, caution, invalidation, and horizon.'
    },
    {
      task_key: 'grounded-assistant',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text: 'Answer as Nova, citing current decision, risk, holdings, evidence, and ritual context without sounding like a chatbot.'
    },
    {
      task_key: 'daily-wrap-up-writer',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text: 'Write the daily wrap-up as a grounded end-of-day decision summary with tomorrow watchpoints and no hype.'
    },
    {
      task_key: 'nova-fast-classifier',
      semantic_version: '1.0.0',
      status: 'active',
      prompt_text: 'Classify short user prompts into risk, decision, follow-up, or research buckets using terse local inference.'
    },
    {
      task_key: 'research-assistant',
      semantic_version: '1.0.0',
      status: 'challenger',
      prompt_text: 'Operate as a quant research assistant with factor, validation, workflow, and implementation-realism awareness.'
    }
  ];
}

function modelRecord(alias: NovaModelAlias, modelName: string): ModelVersionRecord {
  const now = Date.now();
  return {
    id: `model-${alias.toLowerCase()}`,
    model_key: alias,
    provider: 'ollama',
    endpoint: getNovaLocalEndpoint(),
    task_scope: getNovaRoutingPolicies()
      .filter((row) => row.alias === alias)
      .map((row) => row.task)
      .join(','),
    semantic_version: '1.0.0',
    status: alias === 'Nova-Challenger' ? 'challenger' : 'active',
    config_json: JSON.stringify({
      model: modelName,
      local_only: true,
      memory_tier: detectNovaMemoryTier()
    }),
    created_at_ms: now,
    updated_at_ms: now
  };
}

function promptRecord(def: ReturnType<typeof getPromptPackDefinitions>[number]): PromptVersionRecord {
  const now = Date.now();
  return {
    id: `prompt-${def.task_key}-${def.semantic_version}`,
    task_key: def.task_key,
    semantic_version: def.semantic_version,
    prompt_hash: createHash('sha256').update(def.prompt_text).digest('hex'),
    prompt_text: def.prompt_text,
    status: def.status,
    created_at_ms: now,
    updated_at_ms: now
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
  return {
    runtime: {
      endpoint: getNovaLocalEndpoint(),
      memory_tier: detectNovaMemoryTier(),
      local_only: isLocalNovaEnabled(),
      mode: getNovaRuntimeMode(),
      availability_reason: isLocalNovaEnabled()
        ? 'Local Ollama expected to be reachable from this runtime.'
        : 'Local Ollama bypassed in this runtime; deterministic fallback is used instead.'
    },
    routing_policies: getNovaRoutingPolicies(),
    model_registry: repo.listModelVersions({ limit: 12 }).map(toModelVersionContract),
    prompt_registry: repo.listPromptVersions({ limit: 20 }).map(toPromptVersionContract),
    trace_schema: {
      trace_keys: ['trace_id', 'thread_id', 'model_key', 'prompt_version', 'decision_snapshot_id', 'user_id'],
      evaluation_hooks: ['manual_annotation', 'review_replay', 'explanation_quality', 'fallback_reason']
    },
    local_growth_loop: {
      recent_task_runs: recentRuns.length,
      successful_runs: recentRuns.filter((row) => row.status === 'SUCCEEDED').length,
      failed_runs: recentRuns.filter((row) => row.status === 'FAILED').length,
      labeled_samples: labels.length,
      training_ready_samples: labels.filter((row) => row.include_in_training === 1).length
    }
  };
}

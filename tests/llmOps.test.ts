import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectNovaMemoryTier,
  getNovaCloudEndpoint,
  getNovaLocalEndpoint,
  getNovaModelPlan,
  getNovaRoutingPolicies,
  getNovaRuntimeMode,
  isLocalNovaEnabled,
  resolveNovaRouteForProvider
} from '../src/server/ai/llmOps.js';

describe('llm ops layer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses a local Ollama endpoint and task router', () => {
    expect(getNovaLocalEndpoint()).toContain('127.0.0.1:11434');
    const plan = getNovaModelPlan();
    expect(['compact', 'full']).toContain(plan.tier);
    expect(plan.models['Nova-Core']).toBeTruthy();
    expect(plan.models['Nova-Scout']).toBeTruthy();
    expect(plan.models['Nova-Retrieve']).toBeTruthy();
    expect(['compact', 'full']).toContain(detectNovaMemoryTier());

    const routes = getNovaRoutingPolicies();
    expect(routes.some((row) => row.task === 'decision_reasoning' && row.alias === 'Nova-Core')).toBe(true);
    expect(routes.some((row) => row.task === 'retrieval_embedding' && row.alias === 'Nova-Retrieve')).toBe(true);
  });

  it('auto-disables local Nova in Vercel runtime', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '');
    vi.stubEnv('NOVA_FORCE_LOCAL_GENERATION', '');

    expect(isLocalNovaEnabled()).toBe(false);
    expect(getNovaRuntimeMode()).toBe('deterministic-fallback');
  });

  it('switches to cloud OpenAI-compatible routing when configured', () => {
    vi.stubEnv('NOVA_FORCE_LOCAL_GENERATION', 'false');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '1');
    vi.stubEnv('NOVA_CLOUD_API_KEY', 'test-key');
    vi.stubEnv('NOVA_CLOUD_OPENAI_BASE_URL', 'https://nova.example.com/v1');
    vi.stubEnv('NOVA_RUNTIME_MODE', 'cloud-openai-compatible');

    expect(getNovaRuntimeMode()).toBe('cloud-openai-compatible');
    expect(getNovaCloudEndpoint()).toBe('https://nova.example.com/v1');

    const plan = getNovaModelPlan();
    expect(plan.provider).toBe('openai');
    expect(plan.endpoint).toBe('https://nova.example.com/v1');

    const route = resolveNovaRouteForProvider('assistant_grounded_answer', 'openai');
    expect(route.provider).toBe('openai');
    expect(route.endpoint).toBe('https://nova.example.com/v1');
    expect(route.apiKey).toBe('test-key');
    expect(route.model).toContain('Qwen/');
  });
});

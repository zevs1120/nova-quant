import { describe, expect, it } from 'vitest';
import { detectNovaMemoryTier, getNovaLocalEndpoint, getNovaModelPlan, getNovaRoutingPolicies } from '../src/server/ai/llmOps.js';

describe('llm ops layer', () => {
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
});

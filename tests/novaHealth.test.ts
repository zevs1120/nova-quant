import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARVIX_MODEL_ALIASES } from '../src/server/ai/llmOps.js';
import { inspectNovaHealth } from '../src/server/nova/health.js';

describe('nova local health', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('inspects local Ollama reachability and model availability', async () => {
    vi.stubEnv('NOVA_MEMORY_TIER', 'full');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'qwen3:8b' },
              { id: 'qwen3:4b' },
              { id: 'qwen3-embedding:0.6b' }
            ]
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
      )
    );

    const report = await inspectNovaHealth();
    expect(report.reachability.ok).toBe(true);
    expect(report.expected_models.some((row) => row.alias === MARVIX_MODEL_ALIASES.core && row.available)).toBe(true);
    expect(report.expected_models.some((row) => row.alias === MARVIX_MODEL_ALIASES.challenger && !row.available)).toBe(true);
    expect(report.recommended_commands.pull.some((row) => row.includes('qwen3:14b'))).toBe(true);
  });
});

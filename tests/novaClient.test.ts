import { afterEach, describe, expect, it, vi } from 'vitest';
import { runNovaChatCompletion } from '../src/server/nova/client.js';
import { getProviderOrder } from '../src/server/chat/providers/index.js';

describe('nova client routing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('keeps strategy generation on the configured Marvix route even when Gemini is available', async () => {
    vi.stubEnv('NOVA_RUNTIME_MODE', 'cloud-openai-compatible');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '1');
    vi.stubEnv('NOVA_CLOUD_API_KEY', 'marvix-key');
    vi.stubEnv('NOVA_CLOUD_OPENAI_BASE_URL', 'https://marvix.example.com/v1');
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'strategy-output' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runNovaChatCompletion({
      task: 'strategy_generation',
      systemPrompt: 'system',
      userPrompt: 'user',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://marvix.example.com/v1/chat/completions');
    expect(result.route.provider).toBe('openai');
  });

  it('uses Gemini for explanation-oriented assistant tasks', async () => {
    vi.stubEnv('NOVA_RUNTIME_MODE', 'cloud-openai-compatible');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '1');
    vi.stubEnv('NOVA_CLOUD_API_KEY', 'marvix-key');
    vi.stubEnv('NOVA_CLOUD_OPENAI_BASE_URL', 'https://marvix.example.com/v1');
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'explanation-output' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runNovaChatCompletion({
      task: 'assistant_grounded_answer',
      systemPrompt: 'system',
      userPrompt: 'user',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=gemini-key',
    );
    expect(result.route.provider).toBe('gemini');
  });

  it('prefers Gemini before Groq in the public chat provider chain', () => {
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('NOVA_DISABLE_LOCAL_GENERATION', '1');
    vi.stubEnv('NOVA_DISABLE_CLOUD_GENERATION', '1');

    expect(getProviderOrder()).toEqual(['gemini', 'groq']);
  });
});

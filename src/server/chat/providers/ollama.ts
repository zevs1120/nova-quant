import os from 'node:os';
import type { ProviderAdapter, ProviderRequest } from '../types.js';
import { ProviderError, ProviderNetworkError, ProviderRateLimitError } from './errors.js';

const OLLAMA_OPENAI_BASE = (process.env.OLLAMA_OPENAI_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
const OLLAMA_CHAT_ENDPOINT = `${OLLAMA_OPENAI_BASE}/chat/completions`;

function resolveDefaultModel(): string {
  if (process.env.OLLAMA_MODEL) return process.env.OLLAMA_MODEL;
  const tier = String(process.env.NOVA_MEMORY_TIER || '').toLowerCase();
  if (tier === 'compact') return 'qwen3:4b';
  if (tier === 'full') return 'qwen3:8b';
  const memoryGb = Math.round(os.totalmem() / (1024 ** 3));
  return memoryGb >= 24 ? 'qwen3:8b' : 'qwen3:4b';
}

const DEFAULT_OLLAMA_MODEL = resolveDefaultModel();

function consumeSse(buffer: string): { lines: string[]; remainder: string } {
  const parts = buffer.split('\n');
  const remainder = parts.pop() ?? '';
  return { lines: parts, remainder };
}

export class OllamaProvider implements ProviderAdapter {
  readonly name = 'ollama' as const;

  async *stream(req: ProviderRequest): AsyncGenerator<string> {
    const endpoint = String(req.endpoint || OLLAMA_CHAT_ENDPOINT).replace(/\/$/, '');
    let response: Response;
    try {
      response = await fetch(endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers || {})
        },
        body: JSON.stringify({
          model: req.model || DEFAULT_OLLAMA_MODEL,
          messages: req.messages,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 700,
          stream: true
        })
      });
    } catch (error) {
      throw new ProviderNetworkError(error instanceof Error ? error.message : 'Ollama network error');
    }

    if (response.status === 429) {
      throw new ProviderRateLimitError('Ollama rate limited (429)');
    }
    if (!response.ok || !response.body) {
      const err = await response.text().catch(() => '');
      throw new ProviderError(`Ollama request failed (${response.status}): ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { lines, remainder } = consumeSse(buffer);
      buffer = remainder;

      for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (!line || !line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore malformed chunks from local runtime
        }
      }
    }
  }
}

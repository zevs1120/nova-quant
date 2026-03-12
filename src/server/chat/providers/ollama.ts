import type { ProviderAdapter, ProviderRequest } from '../types.js';
import { ProviderError } from './errors.js';

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

function consumeLines(buffer: string): { lines: string[]; remainder: string } {
  const parts = buffer.split('\n');
  return { lines: parts.slice(0, -1), remainder: parts[parts.length - 1] ?? '' };
}

export class OllamaProvider implements ProviderAdapter {
  readonly name = 'ollama' as const;

  async *stream(req: ProviderRequest): AsyncGenerator<string> {
    const endpoint = `${DEFAULT_OLLAMA_URL.replace(/\/$/, '')}/api/chat`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DEFAULT_OLLAMA_MODEL,
        messages: req.messages,
        stream: true,
        options: {
          temperature: req.temperature ?? 0.25
        }
      })
    });

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
      const { lines, remainder } = consumeLines(buffer);
      buffer = remainder;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed) as {
            done?: boolean;
            message?: { content?: string };
          };

          if (parsed.done) return;
          const delta = parsed.message?.content;
          if (delta) yield delta;
        } catch {
          // ignore malformed line
        }
      }
    }
  }
}

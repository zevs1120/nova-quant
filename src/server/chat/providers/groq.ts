import type { ProviderAdapter, ProviderRequest } from '../types.js';
import { ProviderError, ProviderRateLimitError } from './errors.js';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function extractSseLines(buffer: string): { lines: string[]; remainder: string } {
  const parts = buffer.split('\n');
  const remainder = parts.pop() ?? '';
  return { lines: parts, remainder };
}

export class GroqProvider implements ProviderAdapter {
  readonly name = 'groq' as const;

  async *stream(req: ProviderRequest): AsyncGenerator<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new ProviderError('GROQ_API_KEY is missing');
    }

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: req.messages,
        temperature: req.temperature ?? 0.25,
        max_tokens: req.maxTokens ?? 700,
        stream: true,
      }),
    });

    if (response.status === 429) {
      throw new ProviderRateLimitError('Groq rate limited (429)');
    }

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '');
      throw new ProviderError(`Groq request failed (${response.status}): ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { lines, remainder } = extractSseLines(buffer);
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
          // ignore malformed chunks
        }
      }
    }
  }
}

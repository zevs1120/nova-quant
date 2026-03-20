import type { ProviderAdapter, ProviderRequest } from '../types.js';
import { ProviderError, ProviderRateLimitError } from './errors.js';

const OPENAI_ENDPOINT = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function consumeSse(buffer: string): { lines: string[]; remainder: string } {
  const parts = buffer.split('\n');
  const remainder = parts.pop() ?? '';
  return { lines: parts, remainder };
}

export class OpenAIProvider implements ProviderAdapter {
  readonly name = 'openai' as const;

  async *stream(req: ProviderRequest): AsyncGenerator<string> {
    const apiKey = req.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderError('OPENAI_API_KEY is missing');
    }
    const endpoint = req.endpoint || OPENAI_ENDPOINT;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(req.headers || {})
      },
      body: JSON.stringify({
        model: req.model || DEFAULT_MODEL,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 700,
        stream: true
      })
    });

    if (response.status === 429) {
      throw new ProviderRateLimitError('OpenAI rate limited (429)');
    }
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new ProviderError(`OpenAI request failed (${response.status}): ${text}`);
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
          // ignore malformed chunks
        }
      }
    }
  }
}

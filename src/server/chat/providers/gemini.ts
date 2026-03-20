import type { ProviderAdapter, ProviderRequest } from '../types.js';
import { ProviderError, ProviderRateLimitError } from './errors.js';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemma-3-27b-it';
const STREAM_ENDPOINT = (model: string, apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
const SYNC_ENDPOINT = (model: string, apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

function consumeSse(buffer: string): { lines: string[]; remainder: string } {
  const parts = buffer.split('\n');
  const remainder = parts.pop() ?? '';
  return { lines: parts, remainder };
}

function toGeminiPrompt(req: ProviderRequest): string {
  return req.messages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n');
}

function extractText(payload: unknown): string {
  const data = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => String(part.text || ''))
      .filter(Boolean)
      .join('') || ''
  );
}

export class GeminiProvider implements ProviderAdapter {
  readonly name = 'gemini' as const;

  async *stream(req: ProviderRequest): AsyncGenerator<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ProviderError('GEMINI_API_KEY is missing');
    }

    const model = req.model || DEFAULT_MODEL;
    const prompt = toGeminiPrompt(req);
    const streamRes = await fetch(STREAM_ENDPOINT(model, apiKey), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: req.maxTokens ?? 700
        }
      })
    });

    if (streamRes.status === 429) {
      throw new ProviderRateLimitError('Gemini rate limited (429)');
    }

    if (streamRes.ok && streamRes.body) {
      const reader = streamRes.body.getReader();
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
            const text = extractText(JSON.parse(data));
            if (text) yield text;
          } catch {
            // ignore malformed chunks
          }
        }
      }
      return;
    }

    const syncRes = await fetch(SYNC_ENDPOINT(model, apiKey), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: req.maxTokens ?? 700
        }
      })
    });

    if (!syncRes.ok) {
      const text = await syncRes.text().catch(() => '');
      throw new ProviderError(`Gemini request failed (${syncRes.status}): ${text}`);
    }
    const json = (await syncRes.json()) as unknown;
    const text = extractText(json);
    if (!text) {
      throw new ProviderError('Gemini returned empty response');
    }
    yield text;
  }
}

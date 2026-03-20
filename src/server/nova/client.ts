import { getNovaLocalEndpoint } from '../ai/llmOps.js';
import type { NovaTaskRoute } from '../ai/llmOps.js';
import { resolveNovaRoute } from '../ai/llmOps.js';

type NovaChatArgs = {
  task: NovaTaskRoute;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
};

type NovaEmbeddingArgs = {
  task: 'retrieval_embedding';
  input: string;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.NOVA_LOCAL_TIMEOUT_MS || 4500);
const GROQ_OPENAI_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemma-3-27b-it';

function withTimeoutInit(init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  return {
    init: {
      ...init,
      signal: controller.signal
    },
    clear: () => clearTimeout(timer)
  };
}

function cleanBase(url: string): string {
  return String(url || getNovaLocalEndpoint()).replace(/\/$/, '');
}

function extractContent(payload: unknown): string {
  const content = (payload as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

function extractGeminiText(payload: unknown): string {
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

function shouldUseGroqTextRoute(): boolean {
  const disabled = String(process.env.NOVA_DISABLE_GROQ || '').trim().toLowerCase();
  if (disabled === '1' || disabled === 'true') return false;
  return Boolean(String(process.env.GROQ_API_KEY || '').trim());
}

function shouldUseGeminiTextRoute(): boolean {
  const disabled = String(process.env.NOVA_DISABLE_GEMINI || '').trim().toLowerCase();
  if (disabled === '1' || disabled === 'true') return false;
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim());
}

export async function runNovaChatCompletion(args: NovaChatArgs) {
  const route = resolveNovaRoute(args.task);
  const useGroq = shouldUseGroqTextRoute();
  const useGemini = !useGroq && shouldUseGeminiTextRoute();
  const effectiveRoute = useGroq
    ? {
        ...route,
        provider: 'groq' as const,
        model: DEFAULT_GROQ_MODEL,
        endpoint: GROQ_OPENAI_BASE_URL,
        apiKey: String(process.env.GROQ_API_KEY || '').trim()
      }
    : useGemini
      ? {
          ...route,
          provider: 'gemini' as const,
          model: DEFAULT_GEMINI_MODEL,
          endpoint: GEMINI_API_BASE_URL,
          apiKey: String(process.env.GEMINI_API_KEY || '').trim()
        }
    : route;

  if (effectiveRoute.provider === 'gemini') {
    const endpoint = `${String(effectiveRoute.endpoint || GEMINI_API_BASE_URL).replace(/\/$/, '')}/${effectiveRoute.model}:generateContent?key=${effectiveRoute.apiKey}`;
    const { init, clear } = withTimeoutInit({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `SYSTEM: ${args.systemPrompt}\n\nUSER: ${args.userPrompt}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: args.temperature ?? 0.15,
          maxOutputTokens: args.maxTokens ?? 500
        }
      })
    });
    const response = await fetch(endpoint, init).finally(clear);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Nova request failed (${response.status}): ${text}`);
    }

    const raw = (await response.json()) as Record<string, unknown>;
    const text = extractGeminiText(raw).trim();
    if (!text) {
      throw new Error('Gemini Nova returned an empty response.');
    }

    return {
      route: effectiveRoute,
      endpoint,
      text,
      raw
    };
  }

  const endpoint = `${cleanBase(effectiveRoute.endpoint)}/chat/completions`;
  const { init, clear } = withTimeoutInit({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(effectiveRoute.apiKey ? { Authorization: `Bearer ${effectiveRoute.apiKey}` } : {}),
      ...(effectiveRoute.headers || {})
    },
    body: JSON.stringify({
      model: effectiveRoute.model,
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt }
      ],
      temperature: args.temperature ?? 0.15,
      max_tokens: args.maxTokens ?? 500,
      stream: false
    })
  });
  const response = await fetch(endpoint, init).finally(clear);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Nova request failed (${response.status}): ${text}`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const text = extractContent(raw).trim();
  if (!text) {
    throw new Error('Local Nova returned an empty response.');
  }

  return {
    route: effectiveRoute,
    endpoint,
    text,
    raw
  };
}

export async function runNovaEmbedding(args: NovaEmbeddingArgs) {
  const route = resolveNovaRoute(args.task);
  const endpoint = `${cleanBase(route.endpoint)}/embeddings`;
  const { init, clear } = withTimeoutInit({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(route.apiKey ? { Authorization: `Bearer ${route.apiKey}` } : {}),
      ...(route.headers || {})
    },
    body: JSON.stringify({
      model: route.model,
      input: args.input
    })
  });
  const response = await fetch(endpoint, init).finally(clear);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Nova embedding request failed (${response.status}): ${text}`);
  }

  const raw = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  return {
    route,
    endpoint,
    vector: raw.data?.[0]?.embedding || [],
    raw
  };
}

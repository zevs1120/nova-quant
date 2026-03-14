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

export async function runNovaChatCompletion(args: NovaChatArgs) {
  const route = resolveNovaRoute(args.task);
  const endpoint = `${cleanBase(route.endpoint)}/chat/completions`;
  const { init, clear } = withTimeoutInit({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: route.model,
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
    throw new Error(`Local Nova request failed (${response.status}): ${text}`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const text = extractContent(raw).trim();
  if (!text) {
    throw new Error('Local Nova returned an empty response.');
  }

  return {
    route,
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
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: route.model,
      input: args.input
    })
  });
  const response = await fetch(endpoint, init).finally(clear);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Local Nova embedding request failed (${response.status}): ${text}`);
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

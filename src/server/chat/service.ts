import { randomUUID } from 'node:crypto';
import { getDb } from '../db/database.js';
import { ensureSchema } from '../db/schema.js';
import { MarketRepository } from '../db/repository.js';
import type { ChatMessageRecord, ChatThreadRecord } from '../types.js';
import type { ChatHistoryMessage, ChatRequestInput, ChatMode, ProviderMessage, StreamEvent } from './types.js';
import { buildContextBundle } from './tools.js';
import { buildSystemPrompt, buildUserPrompt } from './prompts.js';
import { createProvider, getProviderOrder, isProviderConfigured } from './providers/index.js';
import {
  ProviderEmptyResponseError,
  ProviderTimeoutError,
  shouldFallbackProviderError
} from './providers/errors.js';

const MAX_HISTORY_TURNS = 8;
const PROVIDER_TIMEOUT_MS = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 18_000);

function getRepo(): MarketRepository {
  const db = getDb();
  ensureSchema(db);
  return new MarketRepository(db);
}

function detectMode(input: ChatRequestInput): ChatMode {
  const lower = String(input.message || '').toLowerCase();
  if (
    [
      'factor',
      'strategy',
      'regime',
      'backtest',
      'overfit',
      'overfitting',
      'turnover',
      'capacity',
      'portfolio construction',
      'cross-sectional',
      'cross sectional',
      'rank ic',
      'research',
      'failed experiment'
    ].some((token) => lower.includes(token))
  ) {
    return 'research-assistant';
  }
  if (
    input.context?.signalId ||
    input.context?.symbol ||
    input.context?.market ||
    input.context?.assetClass ||
    input.context?.timeframe
  ) {
    return 'context-aware';
  }
  return 'general-coach';
}

function createThreadTitle(message: string): string {
  const cleaned = String(message || '').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 64) : 'Nova Assistant';
}

function toHistoryMessages(rows: ChatMessageRecord[]): ChatHistoryMessage[] {
  return rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
      createdAtMs: row.created_at_ms
    }));
}

function historyToProviderMessages(history: ChatHistoryMessage[]): ProviderMessage[] {
  return history.slice(-4).map((item) => ({
    role: item.role,
    content: item.content
  }));
}

function stringifyContext(context: ChatRequestInput['context']): string {
  try {
    return JSON.stringify(context ?? {});
  } catch {
    return '{}';
  }
}

async function* withTimeout(stream: AsyncGenerator<string>, timeoutMs: number): AsyncGenerator<string> {
  const iterator = stream[Symbol.asyncIterator]();
  while (true) {
    const next = iterator.next();
    const timer = new Promise<IteratorResult<string>>((_, reject) => {
      const handle = setTimeout(() => {
        clearTimeout(handle);
        reject(new ProviderTimeoutError(`Provider timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    const result = await Promise.race([next, timer]);
    if (result.done) return;
    yield result.value;
  }
}

function ensureThread(repo: MarketRepository, input: ChatRequestInput): ChatThreadRecord {
  const existing = input.threadId ? repo.getChatThread(input.threadId, input.userId) : null;
  if (existing) return existing;
  const now = Date.now();
  const thread: ChatThreadRecord = {
    id: input.threadId || `thread_${randomUUID()}`,
    user_id: input.userId,
    title: createThreadTitle(input.message),
    last_context_json: stringifyContext(input.context),
    last_message_preview: input.message.slice(0, 160),
    created_at_ms: now,
    updated_at_ms: now
  };
  repo.upsertChatThread(thread);
  return thread;
}

function touchThread(repo: MarketRepository, thread: ChatThreadRecord, args: { context: ChatRequestInput['context']; preview: string }): void {
  repo.upsertChatThread({
    ...thread,
    last_context_json: stringifyContext(args.context),
    last_message_preview: args.preview.slice(0, 160),
    updated_at_ms: Date.now()
  });
}

function appendMessage(repo: MarketRepository, message: ChatMessageRecord): void {
  repo.appendChatMessage(message);
}

function appendUserMessage(repo: MarketRepository, thread: ChatThreadRecord, input: ChatRequestInput): void {
  appendMessage(repo, {
    thread_id: thread.id,
    user_id: input.userId,
    role: 'user',
    content: input.message,
    context_json: stringifyContext(input.context),
    provider: null,
    status: 'READY',
    created_at_ms: Date.now()
  });
}

function appendAssistantMessage(repo: MarketRepository, args: {
  thread: ChatThreadRecord;
  userId: string;
  content: string;
  context: ChatRequestInput['context'];
  provider: string | null;
  status: 'READY' | 'ERROR';
}): void {
  appendMessage(repo, {
    thread_id: args.thread.id,
    user_id: args.userId,
    role: 'assistant',
    content: args.content,
    context_json: stringifyContext(args.context),
    provider: args.provider,
    status: args.status,
    created_at_ms: Date.now()
  });
}

function buildDeterministicFallback(contextBundle: Awaited<ReturnType<typeof buildContextBundle>>): string | null {
  if (!contextBundle.deterministicGuide?.text) return null;
  const note = 'Provider unavailable. Using internal evidence fallback.';
  const text = contextBundle.deterministicGuide.text.trim();
  if (!text) return null;
  if (text.includes('VERDICT:')) {
    return text.replace('VERDICT:', `VERDICT: ${note} `);
  }
  return `${note}\n\n${text}`;
}

async function runProviderChain(args: {
  input: ChatRequestInput;
  threadId: string;
  mode: ChatMode;
  history: ChatHistoryMessage[];
  contextBundle: Awaited<ReturnType<typeof buildContextBundle>>;
}): Promise<{ provider: string; text: string; mode: ChatMode }> {
  const providerOrder = getProviderOrder().filter((name) => isProviderConfigured(name));
  const systemPrompt = buildSystemPrompt(args.mode, args.contextBundle.hasExactSignalData);
  const userPrompt = buildUserPrompt({
    userMessage: args.input.message,
    mode: args.mode,
    contextBundle: args.contextBundle,
    context: args.input.context,
    history: args.history
  });

  if (!providerOrder.length) {
    const deterministic = buildDeterministicFallback(args.contextBundle);
    if (deterministic) {
      return { provider: 'deterministic', text: `${deterministic}\n\neducational, not financial advice`, mode: args.mode };
    }
    throw new Error('No provider configured and no deterministic fallback available.');
  }

  const providerErrors: string[] = [];

  for (let i = 0; i < providerOrder.length; i += 1) {
    const providerName = providerOrder[i];
    const provider = createProvider(providerName);
    const providerMessages: ProviderMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyToProviderMessages(args.history),
      { role: 'user', content: userPrompt }
    ];

    try {
      let text = '';
      for await (const chunk of withTimeout(
        provider.stream({
          messages: providerMessages,
          temperature: 0.2,
          maxTokens: 750
        }),
        PROVIDER_TIMEOUT_MS
      )) {
        text += chunk;
      }

      if (!text.trim()) {
        throw new ProviderEmptyResponseError(`${provider.name} returned empty response`);
      }

      return {
        provider: provider.name,
        text: `${text.trim()}\n\neducational, not financial advice`,
        mode: args.mode
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      providerErrors.push(`${provider.name}: ${msg}`);

      const hasNextProvider = i < providerOrder.length - 1;
      if (!shouldFallbackProviderError(error) || !hasNextProvider) {
        break;
      }
    }
  }

  const deterministic = buildDeterministicFallback(args.contextBundle);
  if (deterministic) {
    return {
      provider: 'deterministic',
      text: `${deterministic}\n\nProvider fallback notes: ${providerErrors.join(' | ')}\n\neducational, not financial advice`.trim(),
      mode: args.mode
    };
  }

  throw new Error(`Failed to generate response: ${providerErrors.join(' | ')}`);
}

export function listChatThreads(userId: string, limit = 12) {
  const repo = getRepo();
  return repo.listChatThreads(userId, limit);
}

export function getChatThreadMessages(userId: string, threadId: string, limit = 40) {
  const repo = getRepo();
  const thread = repo.getChatThread(threadId, userId);
  if (!thread) return { thread: null, messages: [] as ChatMessageRecord[] };
  return {
    thread,
    messages: repo.listChatMessages(threadId, limit)
  };
}

export async function* streamChat(input: ChatRequestInput): AsyncGenerator<StreamEvent> {
  const repo = getRepo();
  const thread = ensureThread(repo, input);
  const recentMessages = repo.listChatMessages(thread.id, MAX_HISTORY_TURNS);
  const history = toHistoryMessages(recentMessages);
  const mode = detectMode(input);
  const contextBundle = await buildContextBundle({
    userId: input.userId,
    context: input.context,
    message: input.message
  });

  appendUserMessage(repo, thread, input);
  touchThread(repo, thread, {
    context: input.context,
    preview: input.message
  });

  yield { type: 'meta', mode, provider: 'preparing', threadId: thread.id };

  try {
    const result = await runProviderChain({
      input,
      threadId: thread.id,
      mode,
      history,
      contextBundle
    });

    yield { type: 'meta', mode: result.mode, provider: result.provider, threadId: thread.id };
    yield { type: 'chunk', delta: result.text };
    yield { type: 'done', mode: result.mode, provider: result.provider, threadId: thread.id };

    appendAssistantMessage(repo, {
      thread,
      userId: input.userId,
      content: result.text,
      context: input.context,
      provider: result.provider,
      status: 'READY'
    });
    touchThread(repo, thread, {
      context: input.context,
      preview: result.text
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendAssistantMessage(repo, {
      thread,
      userId: input.userId,
      content: `I hit a problem while preparing an answer.\n\n${message}\n\neducational, not financial advice`,
      context: input.context,
      provider: null,
      status: 'ERROR'
    });
    touchThread(repo, thread, {
      context: input.context,
      preview: message
    });
    yield { type: 'error', error: message };
  }
}

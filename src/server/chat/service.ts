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
import { resolveNovaRouteForProvider } from '../ai/llmOps.js';
import { generateGovernedNovaStrategyReply } from '../nova/strategyLab.js';

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
      'validation',
      'overfit',
      'overfitting',
      'turnover',
      'capacity',
      'portfolio construction',
      'workflow',
      'experiment',
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
  const note = 'Local Nova unavailable in this runtime. Using internal evidence fallback.';
  const text = contextBundle.deterministicGuide?.text?.trim();
  if (!text) {
    const evidence = [
      ...contextBundle.statusSummary.slice(0, 2),
      ...contextBundle.selectedEvidence.slice(0, 3)
    ].filter(Boolean);
    if (!evidence.length) {
      return `${note}\n\nAsk about Today Risk, the top action card, or your current holdings context for a grounded answer.`;
    }
    return `${note}\n\nVERDICT: Grounding is available, but language generation is running in fallback mode.\n\nEVIDENCE:\n- ${evidence.join('\n- ')}`;
  }
  if (text.includes('VERDICT:')) {
    return text.replace('VERDICT:', `VERDICT: ${note} `);
  }
  return `${note}\n\n${text}`;
}

function preferredSignal(bundle: Awaited<ReturnType<typeof buildContextBundle>>): Record<string, unknown> | null {
  if (bundle.signalDetail) return bundle.signalDetail;
  return ((bundle.signalCards || [])[0] as Record<string, unknown> | undefined) || null;
}

function inferQuestionIntent(message: string) {
  const lower = String(message || '').toLowerCase();
  return {
    asksEntry: /enter|entry|buy now|should i buy|should i enter|jump in|add now/.test(lower),
    asksHoldDecision: /keep|trim|sell|hold|reduce|cut/.test(lower),
    asksRisk: /safe|risk|danger|try anything/.test(lower),
    asksWhyWait: /why are we waiting|why wait|why no signal|why not now/.test(lower)
  };
}

function buildGroundedDeterministicReply(args: {
  input: ChatRequestInput;
  mode: ChatMode;
  contextBundle: Awaited<ReturnType<typeof buildContextBundle>>;
}): string {
  const bundle = args.contextBundle;
  const anchor = preferredSignal(bundle);
  const requestedSymbol = bundle.requestedSymbol || String(args.input.context?.symbol || '').toUpperCase() || null;
  const anchorSymbol = String(anchor?.symbol || '').toUpperCase() || null;
  const anchorDirection = String(anchor?.direction || 'WAIT').toUpperCase();
  const anchorStatus = String(anchor?.status || '').toUpperCase();
  const anchorConfidence = Number(anchor?.confidence ?? anchor?.conviction ?? 0);
  const marketRegime = String(bundle.marketTemperature?.regime_id || bundle.marketTemperature?.stance || 'unknown');
  const temperature = Number(bundle.marketTemperature?.temperature_percentile);
  const riskProfile = String(bundle.riskProfile?.profile_key || 'balanced');
  const entryZone = (anchor?.entry_zone as Record<string, unknown> | undefined) || {};
  const entryLow = entryZone.low ?? anchor?.entry_min ?? null;
  const entryHigh = entryZone.high ?? anchor?.entry_max ?? null;
  const intent = inferQuestionIntent(args.input.message);
  const targetLabel = requestedSymbol || anchorSymbol || 'this asset';
  const exactSignal = Boolean(bundle.signalDetail);
  const hasActionableSignal = Boolean(anchor && ['NEW', 'TRIGGERED'].includes(anchorStatus));
  const signalMismatch = requestedSymbol && anchorSymbol && requestedSymbol !== anchorSymbol;

  let verdict = `No clean ${targetLabel} trade is ready right now.`;
  if (exactSignal && hasActionableSignal && anchorDirection === 'LONG') {
    verdict = `${targetLabel} is actionable on the long side, but only inside the planned entry zone.`;
  } else if (exactSignal && hasActionableSignal && anchorDirection === 'SHORT') {
    verdict = `${targetLabel} is not a clean long hold here; risk is skewed to trim or stay defensive.`;
  } else if (intent.asksHoldDecision && requestedSymbol) {
    verdict =
      temperature >= 70
        ? `For ${requestedSymbol}, default to hold smaller or trim, not add, until volatility cools.`
        : `For ${requestedSymbol}, keep only the size you can defend; I do not have a fresh add signal.`;
  } else if (intent.asksEntry && exactSignal && hasActionableSignal) {
    verdict = `${targetLabel} has a setup, but the edge is in disciplined entry, not urgency.`;
  } else if (intent.asksWhyWait) {
    verdict = `We are waiting because the current edge is not clean enough to justify forcing risk.`;
  } else if (signalMismatch && anchorSymbol) {
    verdict = `${requestedSymbol} does not have a specific live setup in the book; the clearest nearby setup is ${anchorSymbol} ${anchorDirection}.`;
  }

  const plan: string[] = [];
  if (intent.asksHoldDecision && requestedSymbol) {
    plan.push(`Do not add to ${requestedSymbol} here unless a fresh signal appears.`);
    plan.push(`If ${requestedSymbol} is oversized versus your normal risk, trim it back to starter size.`);
    plan.push('Only keep full size if you already have a clear invalidation level and can respect it.');
  } else if (intent.asksEntry) {
    if (exactSignal && hasActionableSignal && entryLow !== null && entryHigh !== null) {
      plan.push(`Wait for ${targetLabel} to trade inside ${entryLow} to ${entryHigh}; do not chase above the zone.`);
    } else {
      plan.push(`Do not force a fresh ${targetLabel} entry while the setup is still unconfirmed.`);
    }
    plan.push(`Keep risk profile aligned with ${riskProfile}; this is a day for controlled size, not hero size.`);
    plan.push('If you cannot define the stop before entry, skip the trade.');
  } else {
    plan.push(`Treat ${targetLabel} as watchlist-first until the setup is cleaner.`);
    plan.push(`Match position size to the ${riskProfile} risk budget rather than to conviction alone.`);
    plan.push('Use Today and Safety to confirm whether the market posture still supports action.');
  }

  const why = [
    exactSignal
      ? `${targetLabel} ${anchorDirection} is the exact tracked setup, with confidence ${anchorConfidence ? anchorConfidence.toFixed(2) : '--'} and status ${anchorStatus || '--'}.`
      : `${targetLabel} does not have an exact active signal in the current book, so the answer should stay conservative.`,
    `Market regime reads ${marketRegime}${Number.isFinite(temperature) ? ` with temperature ${temperature.toFixed(0)}` : ''}, which matters more than impulse on timing questions.`,
    signalMismatch && anchorSymbol
      ? `The nearest actionable crypto/equity signal is ${anchorSymbol} ${anchorDirection}, which tells us the engine is seeing edge elsewhere, not specifically in ${requestedSymbol}.`
      : `Risk posture is anchored to the ${riskProfile} profile, so the default is controlled exposure rather than “do something” pressure.`
  ];

  const risk = [
    'High-vol or thin-confirmation entries can look fine for a few bars and still fail fast once momentum fades.',
    'If you are asking for permission to act before you can state the invalidation, the trade is probably not ready.',
    `Common failure modes / when NOT to trade: do not add without a fresh trigger, do not average into weakness, and do not override the risk budget just because the asset is familiar.`
  ];

  const evidence = [
    requestedSymbol ? `requested symbol ${requestedSymbol}` : null,
    exactSignal && anchorSymbol ? `exact signal ${anchorSymbol} ${anchorDirection} status ${anchorStatus}` : null,
    !exactSignal && anchorSymbol ? `top available signal ${anchorSymbol} ${anchorDirection} status ${anchorStatus}` : null,
    `market regime ${marketRegime}`,
    Number.isFinite(temperature) ? `temperature ${temperature.toFixed(0)}` : null,
    `risk profile ${riskProfile}`,
    ...bundle.selectedEvidence.slice(0, 3)
  ].filter(Boolean);

  return [
    `VERDICT:\n${verdict}`,
    `PLAN:\n- ${plan.join('\n- ')}`,
    `WHY:\n- ${why.join('\n- ')}`,
    `RISK:\n- ${risk.join('\n- ')}`,
    `EVIDENCE:\n- ${evidence.join('\n- ')}`,
    'educational, not financial advice'
  ].join('\n\n');
}

function isLowValueAssistantReply(text: string, bundle: Awaited<ReturnType<typeof buildContextBundle>>): boolean {
  const lower = String(text || '').toLowerCase();
  const generic =
    /insufficient data|cannot advise|no specific entry|not advisable to .*try anything|cannot provide a specific recommendation/.test(lower);
  if (!generic) return false;
  return Boolean(bundle.selectedEvidence.length || bundle.signalCards.length || bundle.marketTemperature || bundle.requestedSymbol);
}

function isStrategyGenerationRequest(input: ChatRequestInput, mode: ChatMode): boolean {
  const lower = String(input.message || '').toLowerCase();
  const explicitRequest =
    (lower.includes('strategy') || lower.includes('alpha')) &&
    ['generate', 'build', 'create', 'design', 'propose', 'draft', 'idea'].some((token) => lower.includes(token));
  const portfolioIntent =
    lower.includes('portfolio fit') ||
    lower.includes('candidate strategy') ||
    lower.includes('trading idea');
  return explicitRequest || (mode === 'research-assistant' && portfolioIntent);
}

async function runProviderChain(args: {
  input: ChatRequestInput;
  threadId: string;
  mode: ChatMode;
  history: ChatHistoryMessage[];
  contextBundle: Awaited<ReturnType<typeof buildContextBundle>>;
}): Promise<{ provider: string; text: string; mode: ChatMode }> {
  const providerOrder = getProviderOrder().filter((name, index, rows) => rows.indexOf(name) === index).filter((name) => isProviderConfigured(name));
  const systemPrompt = buildSystemPrompt(args.mode, args.contextBundle.hasExactSignalData);
  const userPrompt = buildUserPrompt({
    userMessage: args.input.message,
    mode: args.mode,
    contextBundle: args.contextBundle,
    context: args.input.context,
    history: args.history
  });

  if (!providerOrder.length) {
    const deterministic =
      buildGroundedDeterministicReply({
        input: args.input,
        mode: args.mode,
        contextBundle: args.contextBundle
      }) || buildDeterministicFallback(args.contextBundle);
    if (deterministic) {
      return { provider: 'deterministic', text: deterministic, mode: args.mode };
    }
    throw new Error('No provider configured and no deterministic fallback available.');
  }

  const providerErrors: string[] = [];

  for (let i = 0; i < providerOrder.length; i += 1) {
    const providerName = providerOrder[i];
    const provider = createProvider(providerName);
    const route = resolveNovaRouteForProvider(
      'assistant_grounded_answer',
      providerName === 'openai' ? 'openai' : providerName === 'gemini' ? 'gemini' : 'ollama'
    );
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
          model: route.model,
          endpoint: route.endpoint,
          apiKey: route.apiKey,
          headers: route.headers,
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

      if (isLowValueAssistantReply(text, args.contextBundle)) {
        return {
          provider: 'deterministic',
          text: buildGroundedDeterministicReply({
            input: args.input,
            mode: args.mode,
            contextBundle: args.contextBundle
          }),
          mode: args.mode
        };
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

  const deterministic =
    buildGroundedDeterministicReply({
      input: args.input,
      mode: args.mode,
      contextBundle: args.contextBundle
    }) || buildDeterministicFallback(args.contextBundle);
  if (deterministic) {
    return {
      provider: 'deterministic',
      text: deterministic,
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
    let result: { provider: string; text: string; mode: ChatMode };
    if (isStrategyGenerationRequest(input, mode)) {
      try {
        const reply = await generateGovernedNovaStrategyReply({
          repo,
          userId: input.userId,
          prompt: input.message,
          locale: input.context?.locale || 'en',
          market: input.context?.market,
          riskProfile: input.context?.riskProfileKey || null,
          maxCandidates: 12
        });
        result = {
          provider: reply.provider,
          text: reply.text,
          mode: 'research-assistant'
        };
      } catch {
        result = await runProviderChain({
          input,
          threadId: thread.id,
          mode,
          history,
          contextBundle
        });
      }
    } else {
      result = await runProviderChain({
        input,
        threadId: thread.id,
        mode,
        history,
        contextBundle
      });
    }

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

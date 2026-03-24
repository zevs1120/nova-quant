import { randomUUID } from 'node:crypto';
import { getDb } from '../db/database.js';
import { ensureSchema } from '../db/schema.js';
import { MarketRepository } from '../db/repository.js';
import type { ChatMessageRecord, ChatThreadRecord } from '../types.js';
import type {
  ChatHistoryMessage,
  ChatRequestInput,
  ChatMode,
  ProviderMessage,
  StreamEvent,
} from './types.js';
import { buildContextBundle } from './tools.js';
import { buildSystemPrompt, buildUserPrompt } from './prompts.js';
import { createProvider, getProviderOrder, isProviderConfigured } from './providers/index.js';
import {
  ProviderEmptyResponseError,
  ProviderTimeoutError,
  shouldFallbackProviderError,
} from './providers/errors.js';
import { resolveNovaRouteForProvider } from '../ai/llmOps.js';
import { generateGovernedNovaStrategyReply } from '../nova/strategyLab.js';
import {
  appendAssistantDisclaimer,
  detectMessageLanguage,
  formatStructuredAssistantReply,
} from '../../utils/assistantLanguage.js';

const MAX_HISTORY_TURNS = 4;
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
      'failed experiment',
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
  const cleaned = String(message || '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, 64) : 'Nova Assistant';
}

function toHistoryMessages(rows: ChatMessageRecord[]): ChatHistoryMessage[] {
  return rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
      createdAtMs: row.created_at_ms,
    }));
}

function historyToProviderMessages(history: ChatHistoryMessage[]): ProviderMessage[] {
  return history.slice(-4).map((item) => ({
    role: item.role,
    content: item.content,
  }));
}

function stringifyContext(context: ChatRequestInput['context']): string {
  try {
    return JSON.stringify(context ?? {});
  } catch {
    return '{}';
  }
}

async function* withTimeout(
  stream: AsyncGenerator<string>,
  timeoutMs: number,
): AsyncGenerator<string> {
  const iterator = stream[Symbol.asyncIterator]();
  while (true) {
    const next = iterator.next();
    let handle: ReturnType<typeof setTimeout> | undefined;
    const timer = new Promise<IteratorResult<string>>((_, reject) => {
      handle = setTimeout(() => {
        reject(new ProviderTimeoutError(`Provider timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      const result = await Promise.race([next, timer]);
      if (result.done) return;
      yield result.value;
    } finally {
      if (handle !== undefined) clearTimeout(handle);
    }
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
    updated_at_ms: now,
  };
  repo.upsertChatThread(thread);
  return thread;
}

function touchThread(
  repo: MarketRepository,
  thread: ChatThreadRecord,
  args: { context: ChatRequestInput['context']; preview: string },
): void {
  repo.upsertChatThread({
    ...thread,
    last_context_json: stringifyContext(args.context),
    last_message_preview: args.preview.slice(0, 160),
    updated_at_ms: Date.now(),
  });
}

function appendMessage(repo: MarketRepository, message: ChatMessageRecord): void {
  repo.appendChatMessage(message);
}

function appendUserMessage(
  repo: MarketRepository,
  thread: ChatThreadRecord,
  input: ChatRequestInput,
): void {
  appendMessage(repo, {
    thread_id: thread.id,
    user_id: input.userId,
    role: 'user',
    content: input.message,
    context_json: stringifyContext(input.context),
    provider: null,
    status: 'READY',
    created_at_ms: Date.now(),
  });
}

function appendAssistantMessage(
  repo: MarketRepository,
  args: {
    thread: ChatThreadRecord;
    userId: string;
    content: string;
    context: ChatRequestInput['context'];
    provider: string | null;
    status: 'READY' | 'ERROR';
  },
): void {
  appendMessage(repo, {
    thread_id: args.thread.id,
    user_id: args.userId,
    role: 'assistant',
    content: args.content,
    context_json: stringifyContext(args.context),
    provider: args.provider,
    status: args.status,
    created_at_ms: Date.now(),
  });
}

function buildDeterministicFallback(
  contextBundle: Awaited<ReturnType<typeof buildContextBundle>>,
  language = 'en',
): string | null {
  const note =
    language === 'zh'
      ? '当前运行环境里的本地 Marvix 不可用，已切换到内部证据兜底。'
      : 'Local Marvix unavailable in this runtime. Using internal evidence fallback.';
  const text = contextBundle.deterministicGuide?.text?.trim();
  if (!text) {
    const evidence = [
      ...contextBundle.statusSummary.slice(0, 2),
      ...contextBundle.selectedEvidence.slice(0, 3),
    ].filter(Boolean);
    if (!evidence.length) {
      return language === 'zh'
        ? `${note}\n\n你可以问今日风险、顶部行动卡，或者当前持仓，我会给你一个更有根据的回答。`
        : `${note}\n\nAsk about Today Risk, the top action card, or your current holdings context for a grounded answer.`;
    }
    return formatStructuredAssistantReply({
      language,
      verdict:
        language === 'zh'
          ? `${note} 当前可以基于证据回答，但语言生成正在使用兜底模式。`
          : `${note} Grounding is available, but language generation is running in fallback mode.`,
      plan: [
        language === 'zh'
          ? '优先根据已有证据理解当前判断，不要把这次回答当成完整实盘建议。'
          : 'Treat this as an evidence summary, not a full live-trading recommendation.',
      ],
      why: [
        language === 'zh'
          ? '当前环境里缺少完整模型生成能力，所以回答会更保守。'
          : 'The runtime does not have full model generation available, so the answer is intentionally conservative.',
      ],
      risk: [
        language === 'zh'
          ? '常见失效模式 / 什么情况下不要做：当关键上下文缺失时，不要把兜底回答当成精确信号。'
          : 'Common failure modes / when NOT to trade: do not treat fallback output as exact signal guidance when key context is missing.',
      ],
      evidence,
    });
  }
  return appendAssistantDisclaimer(`${note}\n\n${text}`, language);
}

function preferredSignal(
  bundle: Awaited<ReturnType<typeof buildContextBundle>>,
): Record<string, unknown> | null {
  if (bundle.signalDetail) return bundle.signalDetail;
  return ((bundle.signalCards || [])[0] as Record<string, unknown> | undefined) || null;
}

function inferQuestionIntent(message: string) {
  const lower = String(message || '').toLowerCase();
  return {
    asksEntry: /enter|entry|buy now|should i buy|should i enter|jump in|add now/.test(lower),
    asksHoldDecision: /keep|trim|sell|hold|reduce|cut/.test(lower),
    asksRisk: /safe|risk|danger|try anything/.test(lower),
    asksWhyWait: /why are we waiting|why wait|why no signal|why not now/.test(lower),
  };
}

function buildGroundedDeterministicReply(args: {
  input: ChatRequestInput;
  mode: ChatMode;
  contextBundle: Awaited<ReturnType<typeof buildContextBundle>>;
}): string {
  const language = detectMessageLanguage(args.input.message, args.input.context?.locale || 'en');
  const zh = language === 'zh';
  const bundle = args.contextBundle;
  const anchor = preferredSignal(bundle);
  const requestedSymbol =
    bundle.requestedSymbol || String(args.input.context?.symbol || '').toUpperCase() || null;
  const anchorSymbol = String(anchor?.symbol || '').toUpperCase() || null;
  const anchorDirection = String(anchor?.direction || 'WAIT').toUpperCase();
  const anchorStatus = String(anchor?.status || '').toUpperCase();
  const anchorConfidence = Number(anchor?.confidence ?? anchor?.conviction ?? 0);
  const marketRegime = String(
    bundle.marketTemperature?.regime_id || bundle.marketTemperature?.stance || 'unknown',
  );
  const temperature = Number(bundle.marketTemperature?.temperature_percentile);
  const riskProfile = String(bundle.riskProfile?.profile_key || 'balanced');
  const entryZone = (anchor?.entry_zone as Record<string, unknown> | undefined) || {};
  const entryLow = entryZone.low ?? anchor?.entry_min ?? null;
  const entryHigh = entryZone.high ?? anchor?.entry_max ?? null;
  const intent = inferQuestionIntent(args.input.message);
  const targetLabel = requestedSymbol || anchorSymbol || (zh ? '这个资产' : 'this asset');
  const exactSignal = Boolean(bundle.signalDetail);
  const hasActionableSignal = Boolean(anchor && ['NEW', 'TRIGGERED'].includes(anchorStatus));
  const signalMismatch = requestedSymbol && anchorSymbol && requestedSymbol !== anchorSymbol;

  let verdict = zh
    ? `现在还没有适合直接出手的 ${targetLabel} 清晰交易。`
    : `No clean ${targetLabel} trade is ready right now.`;
  if (exactSignal && hasActionableSignal && anchorDirection === 'LONG') {
    verdict = zh
      ? `${targetLabel} 当前可以考虑做多，但只能在计划入场区间内执行。`
      : `${targetLabel} is actionable on the long side, but only inside the planned entry zone.`;
  } else if (exactSignal && hasActionableSignal && anchorDirection === 'SHORT') {
    verdict = zh
      ? `${targetLabel} 这里并不是干净的继续持多位置，更偏向减仓或保持防守。`
      : `${targetLabel} is not a clean long hold here; risk is skewed to trim or stay defensive.`;
  } else if (intent.asksHoldDecision && requestedSymbol) {
    verdict =
      temperature >= 70
        ? zh
          ? `对于 ${requestedSymbol}，默认是缩小持仓或减仓，而不是继续加仓，先等波动降下来。`
          : `For ${requestedSymbol}, default to hold smaller or trim, not add, until volatility cools.`
        : zh
          ? `对于 ${requestedSymbol}，只保留你能守住的仓位；我现在没有新的加仓信号。`
          : `For ${requestedSymbol}, keep only the size you can defend; I do not have a fresh add signal.`;
  } else if (intent.asksEntry && exactSignal && hasActionableSignal) {
    verdict = zh
      ? `${targetLabel} 有 setup，但优势来自纪律化入场，不来自着急冲进去。`
      : `${targetLabel} has a setup, but the edge is in disciplined entry, not urgency.`;
  } else if (intent.asksWhyWait) {
    verdict = zh
      ? '我们现在在等，是因为当前优势还不够干净，不值得硬扛风险。'
      : 'We are waiting because the current edge is not clean enough to justify forcing risk.';
  } else if (signalMismatch && anchorSymbol) {
    verdict = zh
      ? `${requestedSymbol} 目前在系统里没有明确的实时 setup；附近最清晰的是 ${anchorSymbol} ${anchorDirection}。`
      : `${requestedSymbol} does not have a specific live setup in the book; the clearest nearby setup is ${anchorSymbol} ${anchorDirection}.`;
  }

  const plan: string[] = [];
  if (intent.asksHoldDecision && requestedSymbol) {
    plan.push(
      zh
        ? `除非出现新的明确信号，否则不要在这里继续加 ${requestedSymbol}。`
        : `Do not add to ${requestedSymbol} here unless a fresh signal appears.`,
    );
    plan.push(
      zh
        ? `如果 ${requestedSymbol} 的仓位已经超出你的常规风险预算，就先减回试探仓。`
        : `If ${requestedSymbol} is oversized versus your normal risk, trim it back to starter size.`,
    );
    plan.push(
      zh
        ? '只有在你已经有清晰失效位并且愿意严格执行时，才保留完整仓位。'
        : 'Only keep full size if you already have a clear invalidation level and can respect it.',
    );
  } else if (intent.asksEntry) {
    if (exactSignal && hasActionableSignal && entryLow !== null && entryHigh !== null) {
      plan.push(
        zh
          ? `等 ${targetLabel} 进入 ${entryLow} 到 ${entryHigh} 的区间再考虑，不要追高。`
          : `Wait for ${targetLabel} to trade inside ${entryLow} to ${entryHigh}; do not chase above the zone.`,
      );
    } else {
      plan.push(
        zh
          ? `在 setup 还没确认前，不要硬做新的 ${targetLabel} 入场。`
          : `Do not force a fresh ${targetLabel} entry while the setup is still unconfirmed.`,
      );
    }
    plan.push(
      zh
        ? `风险要和 ${riskProfile} 风险画像一致；今天适合控制仓位，不适合重仓逞强。`
        : `Keep risk profile aligned with ${riskProfile}; this is a day for controlled size, not hero size.`,
    );
    plan.push(
      zh
        ? '如果你在入场前都定义不出止损，那就直接跳过。'
        : 'If you cannot define the stop before entry, skip the trade.',
    );
  } else {
    plan.push(
      zh
        ? `在 setup 更干净之前，先把 ${targetLabel} 当观察名单处理。`
        : `Treat ${targetLabel} as watchlist-first until the setup is cleaner.`,
    );
    plan.push(
      zh
        ? `仓位应当匹配 ${riskProfile} 风险预算，而不是只看主观信心。`
        : `Match position size to the ${riskProfile} risk budget rather than to conviction alone.`,
    );
    plan.push(
      zh
        ? '去看 Today 和 Safety，确认当前市场姿态是否还支持动作。'
        : 'Use Today and Safety to confirm whether the market posture still supports action.',
    );
  }

  const why = [
    exactSignal
      ? zh
        ? `${targetLabel} ${anchorDirection} 是当前精确跟踪的 setup，置信度 ${anchorConfidence ? anchorConfidence.toFixed(2) : '--'}，状态 ${anchorStatus || '--'}。`
        : `${targetLabel} ${anchorDirection} is the exact tracked setup, with confidence ${anchorConfidence ? anchorConfidence.toFixed(2) : '--'} and status ${anchorStatus || '--'}.`
      : zh
        ? `${targetLabel} 在当前系统里没有精确的活跃信号，所以答案必须保守。`
        : `${targetLabel} does not have an exact active signal in the current book, so the answer should stay conservative.`,
    zh
      ? `当前市场状态是 ${marketRegime}${Number.isFinite(temperature) ? `，温度 ${temperature.toFixed(0)}` : ''}，在时机问题上这比冲动更重要。`
      : `Market regime reads ${marketRegime}${Number.isFinite(temperature) ? ` with temperature ${temperature.toFixed(0)}` : ''}, which matters more than impulse on timing questions.`,
    signalMismatch && anchorSymbol
      ? zh
        ? `离你最近的可执行信号是 ${anchorSymbol} ${anchorDirection}，说明当前引擎看到的优势在别处，而不在 ${requestedSymbol}。`
        : `The nearest actionable crypto/equity signal is ${anchorSymbol} ${anchorDirection}, which tells us the engine is seeing edge elsewhere, not specifically in ${requestedSymbol}.`
      : zh
        ? `风险姿态锚定在 ${riskProfile} 风险画像上，所以默认是控制暴露，而不是被“总要做点什么”推动。`
        : `Risk posture is anchored to the ${riskProfile} profile, so the default is controlled exposure rather than “do something” pressure.`,
  ];

  const risk = [
    zh
      ? '高波动或确认不足的入场，前几根 bar 看起来可能没问题，但动能一弱就会很快失效。'
      : 'High-vol or thin-confirmation entries can look fine for a few bars and still fail fast once momentum fades.',
    zh
      ? '如果你还说不出失效条件，却已经在找理由进场，那这笔交易大概率还没准备好。'
      : 'If you are asking for permission to act before you can state the invalidation, the trade is probably not ready.',
    zh
      ? '常见失效模式 / 什么情况下不要做：没有新触发就不要加仓，不要在走弱时摊平，也不要因为资产熟悉就无视风险预算。'
      : 'Common failure modes / when NOT to trade: do not add without a fresh trigger, do not average into weakness, and do not override the risk budget just because the asset is familiar.',
  ];

  const evidence = [
    requestedSymbol ? `requested symbol ${requestedSymbol}` : null,
    exactSignal && anchorSymbol
      ? `exact signal ${anchorSymbol} ${anchorDirection} status ${anchorStatus}`
      : null,
    !exactSignal && anchorSymbol
      ? `top available signal ${anchorSymbol} ${anchorDirection} status ${anchorStatus}`
      : null,
    `market regime ${marketRegime}`,
    Number.isFinite(temperature) ? `temperature ${temperature.toFixed(0)}` : null,
    `risk profile ${riskProfile}`,
    ...bundle.selectedEvidence.slice(0, 3),
  ].filter(Boolean);

  return formatStructuredAssistantReply({
    language,
    verdict,
    plan,
    why,
    risk,
    evidence,
  });
}

function isLowValueAssistantReply(
  text: string,
  bundle: Awaited<ReturnType<typeof buildContextBundle>>,
): boolean {
  const lower = String(text || '').toLowerCase();
  const generic =
    /insufficient data|cannot advise|no specific entry|not advisable to .*try anything|cannot provide a specific recommendation|数据不足|无法建议|没有明确入场|现在不能建议|无法提供明确建议/.test(
      lower,
    );
  if (!generic) return false;
  return Boolean(
    bundle.selectedEvidence.length ||
    bundle.signalCards.length ||
    bundle.marketTemperature ||
    bundle.requestedSymbol,
  );
}

function isStrategyGenerationRequest(input: ChatRequestInput, mode: ChatMode): boolean {
  const lower = String(input.message || '').toLowerCase();
  const explicitRequest =
    (lower.includes('strategy') || lower.includes('alpha')) &&
    ['generate', 'build', 'create', 'design', 'propose', 'draft', 'idea'].some((token) =>
      lower.includes(token),
    );
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
  const providerOrder = getProviderOrder()
    .filter((name, index, rows) => rows.indexOf(name) === index)
    .filter((name) => isProviderConfigured(name));
  const replyLanguage = detectMessageLanguage(
    args.input.message,
    args.input.context?.locale || 'en',
  );
  const systemPrompt = buildSystemPrompt(
    args.mode,
    args.contextBundle.hasExactSignalData,
    replyLanguage,
  );
  const userPrompt = buildUserPrompt({
    userMessage: args.input.message,
    mode: args.mode,
    contextBundle: args.contextBundle,
    context: args.input.context,
    history: args.history,
  });

  if (!providerOrder.length) {
    const deterministic =
      buildGroundedDeterministicReply({
        input: args.input,
        mode: args.mode,
        contextBundle: args.contextBundle,
      }) || buildDeterministicFallback(args.contextBundle, replyLanguage);
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
      providerName === 'openai' ? 'openai' : providerName === 'gemini' ? 'gemini' : 'ollama',
    );
    const providerMessages: ProviderMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyToProviderMessages(args.history),
      { role: 'user', content: userPrompt },
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
          maxTokens: 750,
        }),
        PROVIDER_TIMEOUT_MS,
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
            contextBundle: args.contextBundle,
          }),
          mode: args.mode,
        };
      }

      return {
        provider: provider.name,
        text: appendAssistantDisclaimer(text.trim(), replyLanguage),
        mode: args.mode,
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
      contextBundle: args.contextBundle,
    }) || buildDeterministicFallback(args.contextBundle, replyLanguage);
  if (deterministic) {
    return {
      provider: 'deterministic',
      text: deterministic,
      mode: args.mode,
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
    messages: repo.listChatMessages(threadId, limit),
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
    message: input.message,
  });

  appendUserMessage(repo, thread, input);
  touchThread(repo, thread, {
    context: input.context,
    preview: input.message,
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
          locale: detectMessageLanguage(input.message, input.context?.locale || 'en'),
          market: input.context?.market,
          riskProfile: input.context?.riskProfileKey || null,
          maxCandidates: 12,
        });
        result = {
          provider: reply.provider,
          text: reply.text,
          mode: 'research-assistant',
        };
      } catch {
        result = await runProviderChain({
          input,
          threadId: thread.id,
          mode,
          history,
          contextBundle,
        });
      }
    } else {
      result = await runProviderChain({
        input,
        threadId: thread.id,
        mode,
        history,
        contextBundle,
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
      status: 'READY',
    });
    touchThread(repo, thread, {
      context: input.context,
      preview: result.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const language = detectMessageLanguage(input.message, input.context?.locale || 'en');
    appendAssistantMessage(repo, {
      thread,
      userId: input.userId,
      content: appendAssistantDisclaimer(
        language === 'zh'
          ? `我在准备回答时遇到了一点问题。\n\n${message}`
          : `I hit a problem while preparing an answer.\n\n${message}`,
        language,
      ),
      context: input.context,
      provider: null,
      status: 'ERROR',
    });
    touchThread(repo, thread, {
      context: input.context,
      preview: message,
    });
    yield { type: 'error', error: message };
  }
}

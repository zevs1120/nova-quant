import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from '../chat/rateLimit.js';
import type { AssetClass, Market } from '../types.js';
import { runNovaChatCompletion } from '../nova/client.js';
import { generateGovernedNovaStrategyReply } from '../nova/strategyLab.js';
import { createNoopNovaRepo } from '../nova/noopRepo.js';
import {
  appendAssistantDisclaimer,
  detectMessageLanguage,
  getAssistantDisclaimer,
  getAssistantSectionLabels,
} from '../../utils/assistantLanguage.js';

type ChatBody = {
  userId?: string;
  message?: string;
  threadId?: string;
  context?: {
    page?: string;
    market?: string;
    assetClass?: string;
    signalId?: string;
    symbol?: string;
    timeframe?: string;
    locale?: string;
    riskProfileKey?: string;
  };
};

function parseMarket(value?: string): Market | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper;
  return undefined;
}

function parseAssetClass(value?: string): AssetClass | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === 'OPTIONS' || upper === 'US_STOCK' || upper === 'CRYPTO') return upper;
  return undefined;
}

function isStrategyRequest(message: string) {
  const lower = String(message || '').toLowerCase();
  return (
    (lower.includes('strategy') || lower.includes('alpha')) &&
    ['generate', 'build', 'create', 'design', 'propose', 'draft', 'idea'].some((token) =>
      lower.includes(token),
    )
  );
}

function isBackendDueDiligenceRequest(message: string) {
  const text = String(message || '').toLowerCase();
  const englishSignals = [
    'data source',
    'data pipeline',
    'factor',
    'ic',
    'hit rate',
    'out-of-sample',
    'backtest',
    'max drawdown',
    'sharpe',
    'risk bucket',
    'position sizing',
    'automation',
    'workflow',
    'self-learning',
    'model',
    'strategy logic',
  ];
  const chineseSignals = [
    '数据源',
    '数据链路',
    '因子',
    '样本外',
    '回测',
    '最大回撤',
    '夏普',
    '仓位',
    '风控',
    '风险桶',
    '自动化',
    '全流程',
    '后端',
    '策略逻辑',
    '自我学习',
    'ai模块',
  ];
  const numberedChecklist =
    /(^|\n)\s*[1-5][\.\u3001\)]\s*/.test(message) || text.includes('以下几个问题');
  return (
    numberedChecklist ||
    englishSignals.some((token) => text.includes(token)) ||
    chineseSignals.some((token) => text.includes(token))
  );
}

export async function handleVercelChat(req: VercelRequest, res: VercelResponse) {
  const body = (req.body || {}) as ChatBody;
  const userId = String(body?.userId || '').trim();
  const message = String(body?.message || '').trim();
  const threadId = String(body?.threadId || '').trim() || undefined;
  const context = body?.context
    ? {
        ...body.context,
        market: parseMarket(body.context.market),
        assetClass: parseAssetClass(body.context.assetClass),
        page: body.context.page as
          | 'today'
          | 'ai'
          | 'holdings'
          | 'more'
          | 'signal-detail'
          | 'unknown'
          | undefined,
      }
    : undefined;

  if (!userId || !message) {
    res.status(400).json({ error: 'userId and message are required' });
    return;
  }

  const rate = checkRateLimit(userId);
  if (!rate.allowed) {
    res.status(429).json({
      error: 'Rate limit exceeded',
      resetAt: rate.resetAt,
    });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const replyLanguage = detectMessageLanguage(message, context?.locale || 'en');
    const labels = getAssistantSectionLabels(replyLanguage);
    const dueDiligence = isBackendDueDiligenceRequest(message);
    const mode =
      isStrategyRequest(message) || dueDiligence
        ? 'research-assistant'
        : context
          ? 'context-aware'
          : 'general-coach';
    const resolvedThreadId = threadId || `vercel-thread-${Date.now()}`;
    res.write(
      `${JSON.stringify({ type: 'meta', mode, provider: 'preparing', threadId: resolvedThreadId })}\n`,
    );

    if (isStrategyRequest(message)) {
      const reply = await generateGovernedNovaStrategyReply({
        repo: createNoopNovaRepo() as any,
        userId,
        prompt: message,
        locale: replyLanguage,
        market:
          context?.market === 'US' || context?.market === 'CRYPTO' ? context.market : undefined,
        riskProfile: context?.riskProfileKey,
        maxCandidates: 8,
      });
      res.write(
        `${JSON.stringify({ type: 'meta', mode, provider: reply.provider, threadId: resolvedThreadId })}\n`,
      );
      res.write(`${JSON.stringify({ type: 'chunk', delta: reply.text })}\n`);
      res.write(
        `${JSON.stringify({ type: 'done', mode, provider: reply.provider, threadId: resolvedThreadId })}\n`,
      );
      res.end();
      return;
    }

    if (dueDiligence) {
      const diligencePrompt = JSON.stringify({
        operator_request: message,
        context: context || {},
        instruction: [
          replyLanguage === 'zh'
            ? '你是 Nova 的后端尽调助手。'
            : 'You are Nova backend due-diligence assistant.',
          replyLanguage === 'zh'
            ? '直接回答用户关于后端、AI、因子、策略、风控和自动化的问题。'
            : "Answer the user's backend, AI, factor, strategy, risk, and automation questions directly.",
          replyLanguage === 'zh'
            ? '不要因为当前没有市场信号或没有实时入场就回避这些问题。'
            : 'Never refuse these questions just because there is no current market signal or no current trade entry.',
          replyLanguage === 'zh'
            ? '如果缺少当前信号数据，要说明这只影响实时入场判断，不影响架构和流程解释。'
            : 'If current signal data is unavailable, say that only affects live entry timing, not architecture/process explanations.',
          replyLanguage === 'zh'
            ? '如果用户一次问了多个编号问题，要按对应编号逐条回答。'
            : 'If the user asks multiple numbered questions, answer each one explicitly with matching numbering.',
          replyLanguage === 'zh'
            ? '明确区分：哪些是现在已经在线的、哪些只是已配置、哪些还没做完。'
            : 'Separate what is live now vs what is configured vs what is still missing.',
          replyLanguage === 'zh'
            ? '语言要简洁但具体，不确定的地方直接说。'
            : 'Use concise but concrete language. Mention uncertainty plainly instead of hiding it.',
        ].join(' '),
      });
      const result = await runNovaChatCompletion({
        task: 'assistant_grounded_answer',
        systemPrompt:
          replyLanguage === 'zh'
            ? '你是 Nova Quant 的 Nova Assistant。处理后端尽调问题时，要直接回答产品和系统层问题。除非用户明确问现在是否要进场，否则不要退回到“当前没有信号”这种空话。用户用了编号提问时，优先用清晰编号作答。'
            : 'You are Nova Assistant for Nova Quant. For backend due-diligence questions, provide direct product and system answers. Do not fall back to saying there is no current signal unless the user specifically asks whether to enter a trade right now. Prefer clear numbered answers when the user asks numbered questions.',
        userPrompt: diligencePrompt,
      });
      res.write(
        `${JSON.stringify({ type: 'meta', mode, provider: `${result.route.provider}:${result.route.alias}`, threadId: resolvedThreadId })}\n`,
      );
      res.write(
        `${JSON.stringify({ type: 'chunk', delta: appendAssistantDisclaimer(result.text.trim(), replyLanguage) })}\n`,
      );
      res.write(
        `${JSON.stringify({ type: 'done', mode, provider: `${result.route.provider}:${result.route.alias}`, threadId: resolvedThreadId })}\n`,
      );
      res.end();
      return;
    }

    const prompt = JSON.stringify({
      user_request: message,
      context: context || {},
      instruction:
        replyLanguage === 'zh'
          ? `你是 Nova Assistant。回答要简洁、基于证据、务实。只能使用这些中文标题：${labels.VERDICT}、${labels.PLAN}、${labels.WHY}、${labels.RISK}、${labels.EVIDENCE}。最后必须加上：${getAssistantDisclaimer('zh')}`
          : 'You are Nova Assistant. Be concise, evidence-aware, and practical. Use section headers VERDICT, PLAN, WHY, RISK, EVIDENCE. End with: educational, not financial advice.',
    });
    const result = await runNovaChatCompletion({
      task: 'assistant_grounded_answer',
      systemPrompt:
        replyLanguage === 'zh'
          ? '你是 Nova Quant 的 Nova Assistant。语气要冷静、有用、有风险意识。不要编造隐藏数据；上下文不完整时要直接说。'
          : 'You are Nova Assistant for Nova Quant. Keep tone calm, useful, and risk-aware. Do not fabricate hidden data. If context is incomplete, say so plainly.',
      userPrompt: prompt,
    });
    res.write(
      `${JSON.stringify({ type: 'meta', mode, provider: `${result.route.provider}:${result.route.alias}`, threadId: resolvedThreadId })}\n`,
    );
    res.write(
      `${JSON.stringify({ type: 'chunk', delta: appendAssistantDisclaimer(result.text.trim(), replyLanguage) })}\n`,
    );
    res.write(
      `${JSON.stringify({ type: 'done', mode, provider: `${result.route.provider}:${result.route.alias}`, threadId: resolvedThreadId })}\n`,
    );
    res.end();
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    res.write(`${JSON.stringify({ type: 'error', error: errorText })}\n`);
    res.end();
  }
}

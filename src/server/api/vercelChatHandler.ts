import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from '../chat/rateLimit.js';
import type { AssetClass, Market } from '../types.js';
import { runNovaChatCompletion } from '../nova/client.js';
import { generateGovernedNovaStrategyReply } from '../nova/strategyLab.js';
import { createNoopNovaRepo } from '../nova/noopRepo.js';

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
    ['generate', 'build', 'create', 'design', 'propose', 'draft', 'idea'].some((token) => lower.includes(token))
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
          | undefined
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
      resetAt: rate.resetAt
    });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const mode = isStrategyRequest(message) ? 'research-assistant' : context ? 'context-aware' : 'general-coach';
    const resolvedThreadId = threadId || `vercel-thread-${Date.now()}`;
    res.write(`${JSON.stringify({ type: 'meta', mode, provider: 'preparing', threadId: resolvedThreadId })}\n`);

    if (isStrategyRequest(message)) {
      const reply = await generateGovernedNovaStrategyReply({
        repo: createNoopNovaRepo() as any,
        userId,
        prompt: message,
        locale: context?.locale || 'en',
        market: context?.market === 'US' || context?.market === 'CRYPTO' ? context.market : undefined,
        riskProfile: context?.riskProfileKey,
        maxCandidates: 8
      });
      res.write(`${JSON.stringify({ type: 'meta', mode, provider: reply.provider, threadId: resolvedThreadId })}\n`);
      res.write(`${JSON.stringify({ type: 'chunk', delta: reply.text })}\n`);
      res.write(`${JSON.stringify({ type: 'done', mode, provider: reply.provider, threadId: resolvedThreadId })}\n`);
      res.end();
      return;
    }

    const prompt = JSON.stringify({
      user_request: message,
      context: context || {},
      instruction:
        'You are Nova Assistant. Be concise, evidence-aware, and practical. Use section headers VERDICT, PLAN, WHY, RISK, EVIDENCE. End with: educational, not financial advice.'
    });
    const result = await runNovaChatCompletion({
      task: 'assistant_grounded_answer',
      systemPrompt:
        'You are Nova Assistant for Nova Quant. Keep tone calm, useful, and risk-aware. Do not fabricate hidden data. If context is incomplete, say so plainly.',
      userPrompt: prompt
    });
    res.write(`${JSON.stringify({ type: 'meta', mode, provider: `${result.route.provider}:${result.route.alias}`, threadId: resolvedThreadId })}\n`);
    res.write(`${JSON.stringify({ type: 'chunk', delta: `${result.text.trim()}\n\neducational, not financial advice` })}\n`);
    res.write(`${JSON.stringify({ type: 'done', mode, provider: `${result.route.provider}:${result.route.alias}`, threadId: resolvedThreadId })}\n`);
    res.end();
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    res.write(`${JSON.stringify({ type: 'error', error: errorText })}\n`);
    res.end();
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from '../chat/rateLimit.js';
import { streamChat } from '../chat/service.js';
import { logChatAudit } from '../chat/audit.js';
import { recordNovaAssistantRun } from './queries.js';
import type { AssetClass, Market } from '../types.js';

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

export async function handleVercelChat(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
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
    logChatAudit({
      userId,
      mode: context ? 'context-aware' : 'general-coach',
      provider: 'none',
      message,
      contextJson: JSON.stringify(context ?? {}),
      status: 'rate_limited',
      durationMs: Date.now() - startedAt
    });
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

  let mode: 'general-coach' | 'context-aware' | 'research-assistant' = context ? 'context-aware' : 'general-coach';
  let provider = 'unknown';
  let resolvedThreadId = threadId;
  let responseText = '';
  let status: 'ok' | 'error' = 'ok';
  let errorText = '';

  try {
    for await (const event of streamChat({
      userId,
      threadId,
      message,
      context
    })) {
      if (event.type === 'meta') {
        mode = event.mode;
        provider = event.provider;
        resolvedThreadId = event.threadId || resolvedThreadId;
      } else if (event.type === 'chunk') {
        responseText += event.delta;
      } else if (event.type === 'error') {
        status = 'error';
        errorText = event.error;
      }

      res.write(`${JSON.stringify(event)}\n`);
    }
  } catch (error) {
    status = 'error';
    errorText = error instanceof Error ? error.message : String(error);
    res.write(`${JSON.stringify({ type: 'error', error: errorText })}\n`);
  } finally {
    logChatAudit({
      userId,
      mode,
      provider,
      threadId: resolvedThreadId,
      message,
      contextJson: JSON.stringify(context ?? {}),
      status,
      error: errorText || undefined,
      responsePreview: responseText.slice(0, 1200),
      durationMs: Date.now() - startedAt
    });
    await recordNovaAssistantRun({
      userId,
      threadId: resolvedThreadId,
      context: (context || {}) as Record<string, unknown>,
      message,
      responseText,
      provider,
      status: status === 'ok' ? 'SUCCEEDED' : 'FAILED',
      error: errorText || undefined
    });
    res.end();
  }
}

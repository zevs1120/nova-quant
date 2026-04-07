import express, { Router } from 'express';
import type { AssetClass, Market } from '../../types.js';
import { checkRateLimit } from '../../chat/rateLimit.js';
import {
  getChatThreadMessages,
  getLatestChatThreadRestore,
  listChatThreads,
  restoreLatestChatThread,
  streamChat,
} from '../../chat/service.js';
import { logChatAudit } from '../../chat/audit.js';
import { consumeAskNovaAccess } from '../../membership/service.js';
import { recordNovaAssistantRun } from '../queries.js';
import { getRequestScope } from '../helpers.js';

const router = Router();

function isZhLocale(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .startsWith('zh');
}

function membershipErrorMessage(args: {
  error: 'ASK_NOVA_LIMIT_REACHED' | 'PORTFOLIO_AI_REQUIRES_PRO' | 'BROKER_HANDOFF_REQUIRES_LITE';
  targetPlan: 'lite' | 'pro';
  locale?: string;
}) {
  const zh = isZhLocale(args.locale);
  if (args.error === 'PORTFOLIO_AI_REQUIRES_PRO') {
    return zh
      ? '涉及持仓、仓位和组合的问题需要 Pro 才能继续。'
      : 'Portfolio-aware questions require Pro.';
  }
  if (args.targetPlan === 'pro') {
    return zh
      ? '你今天的 Ask Nova 次数已经用完。升级 Pro 可以继续。'
      : 'You have used today’s Ask Nova limit. Upgrade to Pro to continue.';
  }
  if (args.error === 'BROKER_HANDOFF_REQUIRES_LITE') {
    return zh
      ? '升级 Lite 后才能继续连接券商。'
      : 'Upgrade to Lite to continue with broker handoff.';
  }
  return zh
    ? '你今天的 Ask Nova 次数已经用完。升级 Lite 可以继续。'
    : 'You have used today’s Ask Nova limit. Upgrade to Lite to continue.';
}

async function handleChat(req: express.Request, res: express.Response) {
  const startedAt = Date.now();
  const body = req.body as {
    userId?: string;
    threadId?: string;
    message?: string;
    context?: {
      signalId?: string;
      symbol?: string;
      market?: Market;
      assetClass?: AssetClass;
      timeframe?: string;
      page?: 'today' | 'ai' | 'holdings' | 'more' | 'signal-detail' | 'unknown';
      riskProfileKey?: string;
      uiMode?: string;
      decisionSummary?: {
        today_call?: string;
        risk_posture?: string;
        top_action_id?: string | null;
        top_action_symbol?: string | null;
        top_action_label?: string | null;
        source_status?: string;
        data_status?: string;
      };
      holdingsSummary?: {
        holdings_count?: number;
        total_weight_pct?: number;
        aligned_weight_pct?: number;
        unsupported_weight_pct?: number;
        top1_pct?: number;
        risk_level?: string;
        recommendation?: string;
      };
      locale?: string;
    };
  };
  const scope = getRequestScope(req);
  const userId = String(scope.userId || body?.userId || '').trim();
  const message = String(body?.message || '').trim();
  const threadId = String(body?.threadId || '').trim() || undefined;
  const context = body?.context;
  const locale = String(context?.locale || req.header('accept-language') || '').trim();

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
      durationMs: Date.now() - startedAt,
    });
    res.status(429).json({
      error: 'Rate limit exceeded',
      resetAt: rate.resetAt,
    });
    return;
  }

  const membershipAccess = consumeAskNovaAccess({
    userId,
    message,
    context: (context || {}) as Record<string, unknown>,
  });
  if (!membershipAccess.ok) {
    const errorMessage = membershipErrorMessage({
      error: membershipAccess.error,
      targetPlan: membershipAccess.targetPlan,
      locale,
    });
    logChatAudit({
      userId,
      mode: context ? 'context-aware' : 'general-coach',
      provider: 'none',
      message,
      contextJson: JSON.stringify(context ?? {}),
      status: 'error',
      error: membershipAccess.error,
      durationMs: Date.now() - startedAt,
    });
    await recordNovaAssistantRun({
      userId,
      threadId,
      context: (context || {}) as Record<string, unknown>,
      message,
      responseText: '',
      provider: 'none',
      status: 'FAILED',
      error: membershipAccess.error,
    });
    res.status(403).json({
      error: membershipAccess.error,
      message: errorMessage,
      reason: membershipAccess.reason,
      targetPlan: membershipAccess.targetPlan,
      membership: membershipAccess.state,
    });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  let mode: 'general-coach' | 'context-aware' | 'research-assistant' = context
    ? 'context-aware'
    : 'general-coach';
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
      context,
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
      durationMs: Date.now() - startedAt,
    });
    await recordNovaAssistantRun({
      userId,
      threadId: resolvedThreadId,
      context: (context || {}) as Record<string, unknown>,
      message,
      responseText,
      provider,
      status: status === 'ok' ? 'SUCCEEDED' : 'FAILED',
      error: errorText || undefined,
    });
    res.end();
  }
}

router.post('/api/chat', handleChat);
router.post('/api/ai-chat', handleChat);

router.get('/api/chat/restore-latest', (req, res) => {
  const userId = String((req.query.userId as string | undefined) || '').trim() || 'guest-default';
  const messageLimit = req.query.messageLimit ? Number(req.query.messageLimit) : 40;
  res.json({
    userId,
    ...restoreLatestChatThread(userId, messageLimit),
  });
});

router.get('/api/chat/threads', (req, res) => {
  const userId = String((req.query.userId as string | undefined) || '').trim() || 'guest-default';
  const limit = req.query.limit ? Number(req.query.limit) : 12;
  const hydrate = String((req.query.hydrate as string | undefined) || '')
    .trim()
    .toLowerCase();
  if (hydrate === 'latest-messages') {
    const messageLimit = req.query.messageLimit ? Number(req.query.messageLimit) : 40;
    const payload = getLatestChatThreadRestore(userId, {
      threadLimit: limit,
      messageLimit,
    });
    res.json({
      userId,
      count: payload.data.length,
      data: payload.data,
      restored: payload.restored && payload.restored.thread ? payload.restored : null,
    });
    return;
  }
  const data = listChatThreads(userId, limit);
  res.json({
    userId,
    count: data.length,
    data,
  });
});

router.get('/api/chat/threads/:id', (req, res) => {
  const userId = String((req.query.userId as string | undefined) || '').trim() || 'guest-default';
  const threadId = String(req.params.id || '').trim();
  const limit = req.query.limit ? Number(req.query.limit) : 40;
  const payload = getChatThreadMessages(userId, threadId, limit);
  if (!payload.thread) {
    res.status(404).json({ error: 'Thread not found' });
    return;
  }
  res.json(payload);
});

export default router;

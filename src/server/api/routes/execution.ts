import { Router } from 'express';
import { parseMarket, asyncRoute, requireAuthenticatedScope } from '../helpers.js';
import {
  listExecutionsPrimary,
  submitExecution,
  getExecutionGovernance,
  setExecutionKillSwitch,
  findUserLiveExecutionOrder,
  getLiveOrderStatus,
  cancelLiveOrder,
} from '../queries.js';

const router = Router();

router.get(
  '/api/executions',
  asyncRoute(async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const market = parseMarket(req.query.market as string | undefined);
    const mode =
      req.query.mode === 'LIVE' ? 'LIVE' : req.query.mode === 'PAPER' ? 'PAPER' : undefined;
    const signalId = (req.query.signalId as string | undefined) || undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const data = await listExecutionsPrimary({ userId, market, mode, signalId, limit });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data,
    });
  }),
);

router.post(
  '/api/executions',
  asyncRoute(async (req, res) => {
    const body = req.body as {
      userId?: string;
      signalId?: string;
      mode?: 'PAPER' | 'LIVE';
      action?: 'EXECUTE' | 'DONE' | 'CLOSE';
      note?: string;
      pnlPct?: number | null;
      provider?: string;
      qty?: number | null;
      notional?: number | null;
      orderType?: 'MARKET' | 'LIMIT';
      limitPrice?: number | null;
      timeInForce?: 'DAY' | 'GTC' | 'IOC' | 'FOK';
    };
    const userId = String(body.userId || '').trim() || 'guest-default';
    const signalId = String(body.signalId || '').trim();
    const mode = body.mode || 'PAPER';
    const action = body.action || 'EXECUTE';
    if (!signalId) {
      res.status(400).json({ error: 'signalId is required' });
      return;
    }
    if (!['PAPER', 'LIVE'].includes(mode) || !['EXECUTE', 'DONE', 'CLOSE'].includes(action)) {
      res.status(400).json({ error: 'Invalid mode/action' });
      return;
    }
    if (mode === 'LIVE' && !requireAuthenticatedScope(req, res)) {
      return;
    }

    const result = await submitExecution({
      userId,
      signalId,
      mode,
      action,
      note: body.note,
      pnlPct: body.pnlPct,
      provider: body.provider,
      qty: body.qty,
      notional: body.notional,
      orderType: body.orderType,
      limitPrice: body.limitPrice,
      timeInForce: body.timeInForce,
    });
    if (!result.ok || !result.executionId) {
      res.status(mode === 'LIVE' ? 400 : 404).json({
        error: 'error' in result ? result.error : 'Execution failed',
        governance: 'governance' in result ? result.governance : undefined,
      });
      return;
    }
    res.json({
      ok: true,
      executionId: result.executionId,
      shadowExecutionId: 'shadowExecutionId' in result ? result.shadowExecutionId : undefined,
      order: 'order' in result ? result.order : undefined,
      governance: 'governance' in result ? result.governance : undefined,
    });
  }),
);

router.get(
  '/api/executions/governance',
  asyncRoute(async (req, res) => {
    const scope = requireAuthenticatedScope(req, res);
    if (!scope) return;
    const userId = scope.userId;
    const provider = (req.query.provider as string | undefined) || undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const refreshOrders =
      String(req.query.refresh || '').toLowerCase() === 'true' || req.query.refresh === '1';
    const result = await getExecutionGovernance({
      userId,
      provider,
      limit,
      refreshOrders,
    });
    res.json(result);
  }),
);

router.get(
  '/api/executions/reconciliation',
  asyncRoute(async (req, res) => {
    const scope = requireAuthenticatedScope(req, res);
    if (!scope) return;
    const userId = scope.userId;
    const provider = (req.query.provider as string | undefined) || undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const refreshOrders =
      String(req.query.refresh || '').toLowerCase() === 'true' || req.query.refresh === '1';
    const result = await getExecutionGovernance({
      userId,
      provider,
      limit,
      refreshOrders,
    });
    res.json(result.reconciliation);
  }),
);

router.post(
  '/api/executions/kill-switch',
  asyncRoute(async (req, res) => {
    const scope = requireAuthenticatedScope(req, res);
    if (!scope) return;
    const body = (req.body || {}) as {
      userId?: string;
      enabled?: boolean;
      reason?: string;
      provider?: string;
    };
    if (typeof body.enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    const result = await setExecutionKillSwitch({
      userId: scope.userId,
      enabled: body.enabled,
      reason: body.reason,
      provider: body.provider,
    });
    res.json({ ok: true, data: result });
  }),
);

router.get(
  '/api/executions/orders/:provider/:orderId',
  asyncRoute(async (req, res) => {
    const scope = requireAuthenticatedScope(req, res);
    if (!scope) return;
    const provider = String(req.params.provider || '')
      .trim()
      .toUpperCase();
    const orderId = String(req.params.orderId || '').trim();
    const clientOrderId = (req.query.clientOrderId as string | undefined) || undefined;
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase() || undefined;
    const ownership = findUserLiveExecutionOrder({
      userId: scope.userId,
      provider,
      orderId,
      clientOrderId,
    });
    if (!ownership) {
      res.status(404).json({ error: 'LIVE_ORDER_NOT_FOUND' });
      return;
    }
    const result = await getLiveOrderStatus({
      provider,
      orderId,
      clientOrderId,
      symbol,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true, order: result.order });
  }),
);

router.post(
  '/api/executions/orders/:provider/:orderId/cancel',
  asyncRoute(async (req, res) => {
    const scope = requireAuthenticatedScope(req, res);
    if (!scope) return;
    const provider = String(req.params.provider || '')
      .trim()
      .toUpperCase();
    const orderId = String(req.params.orderId || '').trim();
    const body = (req.body || {}) as { clientOrderId?: string; symbol?: string };
    const ownership = findUserLiveExecutionOrder({
      userId: scope.userId,
      provider,
      orderId,
      clientOrderId: body.clientOrderId,
    });
    if (!ownership) {
      res.status(404).json({ error: 'LIVE_ORDER_NOT_FOUND' });
      return;
    }
    const result = await cancelLiveOrder({
      provider,
      orderId,
      clientOrderId: body.clientOrderId,
      symbol: body.symbol ? String(body.symbol).toUpperCase() : undefined,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true, order: result.order });
  }),
);

export default router;

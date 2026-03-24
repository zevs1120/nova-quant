import { Router } from 'express';
import { asyncRoute, requireAuthenticatedScope } from '../helpers.js';
import { upsertExternalConnection, listExternalConnections } from '../queries.js';
import { createBrokerAdapter, createExchangeAdapter } from '../../connect/adapters.js';
import { importHoldingsFromCsvText, importHoldingsFromScreenshot } from '../../holdings/import.js';

const router = Router();

router.get(
  '/api/connect/broker',
  asyncRoute(async (req, res) => {
    const scope = requireAuthenticatedScope(req, res);
    if (!scope) return;
    const userId = scope.userId;
    const provider = String((req.query.provider as string | undefined) || 'ALPACA').toUpperCase();
    const adapter = createBrokerAdapter(provider);
    const snapshot = await adapter.fetchSnapshot();
    upsertExternalConnection({
      userId,
      connectionType: 'BROKER',
      provider,
      mode: snapshot.mode,
      status: snapshot.status,
      meta: {
        source_status: snapshot.source_status,
        data_status: snapshot.data_status,
        source_label: snapshot.source_label,
        reason_code: snapshot.reason_code,
        message: snapshot.message,
        last_checked_at: snapshot.last_checked_at,
        can_read_positions: snapshot.can_read_positions,
        can_trade: snapshot.can_trade,
      },
    });
    const connections = listExternalConnections({ userId, connectionType: 'BROKER' });
    res.json({
      provider,
      mode: snapshot.mode,
      snapshot,
      connections,
    });
  }),
);

router.post('/api/connect/broker', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  const body = req.body as { userId?: string; provider?: string; mode?: 'READ_ONLY' | 'TRADING' };
  const userId = scope.userId;
  const provider = String(body.provider || 'ALPACA').toUpperCase();
  const mode = body.mode || 'READ_ONLY';
  const saved = upsertExternalConnection({
    userId,
    connectionType: 'BROKER',
    provider,
    mode,
    status: 'PENDING',
    meta: {
      requested_at: new Date().toISOString(),
      note: 'Connection request saved. Actual status determined by adapter checks.',
      can_read_positions: false,
      can_trade: false,
    },
  });
  res.json({ ok: true, ...saved });
});

router.get(
  '/api/connect/exchange',
  asyncRoute(async (req, res) => {
    const scope = requireAuthenticatedScope(req, res);
    if (!scope) return;
    const userId = scope.userId;
    const provider = String((req.query.provider as string | undefined) || 'BINANCE').toUpperCase();
    const adapter = createExchangeAdapter(provider);
    const snapshot = await adapter.fetchSnapshot();
    upsertExternalConnection({
      userId,
      connectionType: 'EXCHANGE',
      provider,
      mode: snapshot.mode,
      status: snapshot.status,
      meta: {
        source_status: snapshot.source_status,
        data_status: snapshot.data_status,
        source_label: snapshot.source_label,
        reason_code: snapshot.reason_code,
        message: snapshot.message,
        last_checked_at: snapshot.last_checked_at,
        can_read_positions: snapshot.can_read_positions,
        can_trade: snapshot.can_trade,
      },
    });
    const connections = listExternalConnections({ userId, connectionType: 'EXCHANGE' });
    res.json({
      provider,
      mode: snapshot.mode,
      snapshot,
      connections,
    });
  }),
);

router.post('/api/connect/exchange', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  const body = req.body as { userId?: string; provider?: string; mode?: 'READ_ONLY' | 'TRADING' };
  const userId = scope.userId;
  const provider = String(body.provider || 'BINANCE').toUpperCase();
  const mode = body.mode || 'READ_ONLY';
  const saved = upsertExternalConnection({
    userId,
    connectionType: 'EXCHANGE',
    provider,
    mode,
    status: 'PENDING',
    meta: {
      requested_at: new Date().toISOString(),
      note: 'Connection request saved. Actual status determined by adapter checks.',
      can_read_positions: false,
      can_trade: false,
    },
  });
  res.json({ ok: true, ...saved });
});

router.post(
  '/api/holdings/import/csv',
  asyncRoute(async (req, res) => {
    const body = req.body as { csvText?: string; filename?: string };
    if (!String(body?.csvText || '').trim()) {
      res.status(400).json({ error: 'CSV_TEXT_REQUIRED' });
      return;
    }
    const data = importHoldingsFromCsvText({
      csvText: String(body.csvText || ''),
      filename: String(body.filename || '').trim() || undefined,
    });
    res.json(data);
  }),
);

router.post(
  '/api/holdings/import/screenshot',
  asyncRoute(async (req, res) => {
    const body = req.body as { imageDataUrl?: string };
    if (!String(body?.imageDataUrl || '').trim()) {
      res.status(400).json({ error: 'IMAGE_REQUIRED' });
      return;
    }
    try {
      const data = await importHoldingsFromScreenshot({
        imageDataUrl: String(body.imageDataUrl || ''),
      });
      res.json(data);
    } catch (error) {
      const message = String((error as Error)?.message || error || '');
      if ((error as Error)?.name === 'SCREENSHOT_IMPORT_UNAVAILABLE') {
        res.status(503).json({ error: 'SCREENSHOT_IMPORT_UNAVAILABLE', message });
        return;
      }
      throw error;
    }
  }),
);

export default router;

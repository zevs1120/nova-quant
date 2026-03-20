import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryPublicOhlcv } from '../src/server/public/browseService.js';
import { applyPublicCors, applyRealtimeResponseHeaders, handlePublicOptions, parseMarket, parseTimeframe } from '../src/server/public/vercel.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePublicOptions(req, res)) return;
  applyPublicCors(req, res);
  applyRealtimeResponseHeaders(res);
  const market = parseMarket(req.query.market as string | undefined);
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const timeframe = parseTimeframe((req.query.tf || req.query.timeframe) as string | undefined);
  if (!market || !symbol || !timeframe) {
    res.status(400).json({ error: 'Required query params: market, symbol, tf' });
    return;
  }
  const limit = req.query.limit ? Number(req.query.limit) : 120;
  const result = await queryPublicOhlcv({ market, symbol, timeframe, limit });
  if (!result.asset) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.status(200).json({
    market,
    symbol,
    timeframe,
    count: result.rows.length,
    asset: result.asset,
    data: result.rows
  });
}

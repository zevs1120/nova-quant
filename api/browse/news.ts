import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPublicBrowseNewsFeed } from '../../src/server/public/browseService.js';
import { applyPublicCors, applyRealtimeResponseHeaders, handlePublicOptions, parseMarket } from '../../src/server/public/vercel.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePublicOptions(req, res)) return;
  applyPublicCors(req, res);
  applyRealtimeResponseHeaders(res);
  const market = parseMarket(req.query.market as string | undefined);
  if (!market) {
    res.status(400).json({ error: 'Required query param: market' });
    return;
  }
  const symbol = String(req.query.symbol || '').trim().toUpperCase() || undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 8;
  const data = await getPublicBrowseNewsFeed({ market, symbol, limit });
  res.status(200).json({ market, symbol: symbol ?? null, count: data.length, data });
}

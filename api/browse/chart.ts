import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPublicBrowseAssetChart } from '../../src/server/public/browseService.js';
import { applyPublicCors, applyRealtimeResponseHeaders, handlePublicOptions, parseMarket } from '../../src/server/public/vercel.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePublicOptions(req, res)) return;
  applyPublicCors(req, res);
  applyRealtimeResponseHeaders(res);
  const market = parseMarket(req.query.market as string | undefined);
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!market || !symbol) {
    res.status(400).json({ error: 'Required query params: market, symbol' });
    return;
  }
  const data = await getPublicBrowseAssetChart({ market, symbol });
  if (!data) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.status(200).json(data);
}

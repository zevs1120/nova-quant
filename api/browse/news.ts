import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPublicBrowseNewsFeed } from '../../src/server/public/browseService.js';
import { applyPublicCors, handlePublicOptions, parseMarket } from '../_public';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePublicOptions(req, res)) return;
  applyPublicCors(req, res);
  const market = req.query.market ? parseMarket(req.query.market as string | undefined) : 'ALL';
  if (req.query.market && !market) {
    res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
    return;
  }
  const symbol = String(req.query.symbol || '').trim().toUpperCase() || undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 8;
  const data = await getPublicBrowseNewsFeed({ market: market as any, symbol, limit });
  res.status(200).json({
    market: market ?? 'ALL',
    symbol: symbol || null,
    count: data.length,
    data
  });
}

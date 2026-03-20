import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchPublicAssets } from '../../src/server/public/browseService.js';
import { applyPublicCors, handlePublicOptions, parseMarket } from '../_public';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePublicOptions(req, res)) return;
  applyPublicCors(req, res);
  const market = parseMarket(req.query.market as string | undefined);
  if (req.query.market && !market) {
    res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
    return;
  }
  const query = String(req.query.q || '');
  const limit = req.query.limit ? Number(req.query.limit) : 24;
  const data = await searchPublicAssets({ query, limit, market });
  res.status(200).json({
    query,
    market: market ?? 'ALL',
    count: data.length,
    data
  });
}

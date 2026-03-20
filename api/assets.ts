import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listPublicAssets } from '../src/server/public/browseService.js';
import { applyPublicCors, handlePublicOptions, parseMarket } from './_public';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePublicOptions(req, res)) return;
  applyPublicCors(req, res);
  const market = parseMarket(req.query.market as string | undefined);
  if (req.query.market && !market) {
    res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
    return;
  }
  const data = listPublicAssets(market);
  res.status(200).json({ market: market ?? 'ALL', count: data.length, data });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPublicBrowseHome } from '../../src/server/public/browseService.js';
import { applyPublicCors, applyRealtimeResponseHeaders, handlePublicOptions } from '../../src/server/public/vercel.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePublicOptions(req, res)) return;
  applyPublicCors(req, res);
  applyRealtimeResponseHeaders(res);
  const view = String(req.query.view || 'NOW');
  const data = await getPublicBrowseHome({ view });
  res.status(200).json(data);
}

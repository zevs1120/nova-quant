import type { VercelRequest, VercelResponse } from '@vercel/node';

export function applyPublicCors(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

export function applyRealtimeResponseHeaders(res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export function handlePublicOptions(req: VercelRequest, res: VercelResponse) {
  applyPublicCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function parseMarket(value?: string) {
  const upper = String(value || '')
    .trim()
    .toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper as 'US' | 'CRYPTO';
  return undefined;
}

export function parseTimeframe(value?: string) {
  const tf = String(value || '').trim();
  if (tf === '1m' || tf === '5m' || tf === '15m' || tf === '1h' || tf === '1d') return tf;
  return undefined;
}

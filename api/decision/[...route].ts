import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDecisionSnapshot } from '../../src/server/api/queries.js';

function resolveRoute(req: VercelRequest): string {
  const dynamic = req.query.route;
  if (Array.isArray(dynamic) && dynamic.length) {
    return dynamic.join('/');
  }
  if (typeof dynamic === 'string' && dynamic) {
    return dynamic;
  }
  const url = String(req.url || '');
  const [, suffix = ''] = url.split('/api/decision/');
  return suffix.split('?')[0] || '';
}

function parseMarket(value?: string): 'US' | 'CRYPTO' | undefined {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper;
  return undefined;
}

function parseAssetClass(value?: string): 'US_STOCK' | 'CRYPTO' | 'OPTIONS' | undefined {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === 'US_STOCK' || upper === 'CRYPTO' || upper === 'OPTIONS') return upper;
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = resolveRoute(req);

  if (route === 'today' && req.method === 'POST') {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    const market = parseMarket(body.market);
    const assetClass = parseAssetClass(body.assetClass);
    const userId = String(body.userId || '').trim() || 'guest-default';

    const decision = await getDecisionSnapshot({
      userId,
      market,
      assetClass,
      holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
      locale: String(body.locale || '').trim() || undefined
    });
    res.status(200).json(decision);
    return;
  }

  res.status(404).json({ error: 'Not found' });
}

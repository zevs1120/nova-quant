import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  handleAdminLogin,
  handleAdminLogout,
  handleAdminSession
} from '../../src/server/api/authHandlers.js';
import {
  handleAdminAlphas,
  handleAdminOverview,
  handleAdminSignals,
  handleAdminSystem,
  handleAdminUsers
} from '../../src/server/api/adminHandlers.js';

function resolveRoute(req: VercelRequest): string {
  const dynamic = req.query.route;
  if (Array.isArray(dynamic) && dynamic.length) {
    return dynamic.join('/');
  }
  if (typeof dynamic === 'string' && dynamic) {
    return dynamic;
  }
  const url = String(req.url || '');
  const [, suffix = ''] = url.split('/api/admin/');
  return suffix.split('?')[0] || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = resolveRoute(req);

  const origin = String(req.headers.origin || '');
  const allowedOrigins = new Set(
    String(process.env.NOVA_ADMIN_ALLOWED_ORIGINS || 'https://admin.novaquant.cloud,http://localhost:4174,http://127.0.0.1:4174')
      .split(',')
      .map((row) => String(row || '').trim())
      .filter(Boolean)
  );
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (route === 'session' && req.method === 'GET') {
    await handleAdminSession(req as any, res as any);
    return;
  }
  if (route === 'overview' && req.method === 'GET') {
    await handleAdminOverview(req as any, res as any);
    return;
  }
  if (route === 'users' && req.method === 'GET') {
    await handleAdminUsers(req as any, res as any);
    return;
  }
  if (route === 'alphas' && req.method === 'GET') {
    await handleAdminAlphas(req as any, res as any);
    return;
  }
  if (route === 'signals' && req.method === 'GET') {
    await handleAdminSignals(req as any, res as any);
    return;
  }
  if (route === 'system' && req.method === 'GET') {
    await handleAdminSystem(req as any, res as any);
    return;
  }
  if (route === 'login' && req.method === 'POST') {
    await handleAdminLogin(req as any, res as any);
    return;
  }
  if (route === 'logout' && req.method === 'POST') {
    await handleAdminLogout(req as any, res as any);
    return;
  }

  res.status(404).json({ error: 'Not found' });
}

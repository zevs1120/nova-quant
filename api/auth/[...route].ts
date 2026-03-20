import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthSession,
  handleAuthSignup,
  handleForgotPassword,
  handleGetAuthProfile,
  handlePostAuthProfile,
  handleResetPassword
} from '../../src/server/api/authHandlers.js';

function resolveRoute(req: VercelRequest): string {
  const dynamic = req.query.route;
  if (Array.isArray(dynamic) && dynamic.length) {
    return dynamic.join('/');
  }
  if (typeof dynamic === 'string' && dynamic) {
    return dynamic;
  }
  const url = String(req.url || '');
  const [, suffix = ''] = url.split('/api/auth/');
  return suffix.split('?')[0] || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = resolveRoute(req);

  if (route === 'session' && req.method === 'GET') {
    await handleAuthSession(req as any, res as any);
    return;
  }
  if (route === 'signup' && req.method === 'POST') {
    await handleAuthSignup(req as any, res as any);
    return;
  }
  if (route === 'login' && req.method === 'POST') {
    await handleAuthLogin(req as any, res as any);
    return;
  }
  if (route === 'logout' && req.method === 'POST') {
    await handleAuthLogout(req as any, res as any);
    return;
  }
  if (route === 'forgot-password' && req.method === 'POST') {
    await handleForgotPassword(req as any, res as any);
    return;
  }
  if (route === 'reset-password' && req.method === 'POST') {
    await handleResetPassword(req as any, res as any);
    return;
  }
  if (route === 'profile' && req.method === 'GET') {
    await handleGetAuthProfile(req as any, res as any);
    return;
  }
  if (route === 'profile' && req.method === 'POST') {
    await handlePostAuthProfile(req as any, res as any);
    return;
  }

  res.status(404).json({ error: 'Not found' });
}

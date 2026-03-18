import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAuthLogout } from '../../src/server/api/authHandlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleAuthLogout(req as any, res as any);
}

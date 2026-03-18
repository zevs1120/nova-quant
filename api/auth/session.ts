import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAuthSession } from '../../src/server/api/authHandlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleAuthSession(req as any, res as any);
}

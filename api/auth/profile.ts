import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGetAuthProfile, handlePostAuthProfile } from '../../src/server/api/authHandlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    await handlePostAuthProfile(req as any, res as any);
    return;
  }
  await handleGetAuthProfile(req as any, res as any);
}

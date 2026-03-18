import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAuthLogin } from '../../src/server/api/authHandlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleAuthLogin(req as any, res as any);
}

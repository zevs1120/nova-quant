import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAuthSignup } from '../../src/server/api/authHandlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleAuthSignup(req as any, res as any);
}

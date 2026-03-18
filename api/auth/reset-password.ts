import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleResetPassword } from '../../src/server/api/authHandlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleResetPassword(req as any, res as any);
}

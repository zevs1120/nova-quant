import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleForgotPassword } from '../../src/server/api/authHandlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleForgotPassword(req as any, res as any);
}

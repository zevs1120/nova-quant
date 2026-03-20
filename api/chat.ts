import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleVercelChat } from '../src/server/api/vercelChatHandler.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleVercelChat(req, res);
}

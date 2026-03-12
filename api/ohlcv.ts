import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApiApp } from '../src/server/api/app.js';

const app = createApiApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}

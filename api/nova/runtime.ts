import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getNovaRuntimeState } from '../../src/server/api/queries.js';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json(getNovaRuntimeState());
}

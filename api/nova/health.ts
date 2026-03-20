import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getNovaHealthState } from '../../src/server/api/queries.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json(await getNovaHealthState());
}
